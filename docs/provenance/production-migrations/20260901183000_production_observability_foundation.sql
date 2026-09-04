-- MK Fraud Readiness Production observability foundation.
-- Additive only: no scoring, methodology, pricing, payment or fulfilment behaviour changes.
-- The existing phase14_operational_alerts ledger remains the single incident ledger.

begin
alter table public.assessments
  add column if not exists monitoring_synthetic boolean not null default false,
  add column if not exists monitoring_run_id text
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assessments'::regclass
      and conname = 'assessments_monitoring_run_id_chk'
  ) then
    alter table public.assessments
      add constraint assessments_monitoring_run_id_chk
      check (monitoring_run_id is null or monitoring_run_id ~ '^[A-Za-z0-9._:-]{1,100}$');
  end if;
end $$
create index if not exists assessments_monitoring_synthetic_idx
  on public.assessments(monitoring_synthetic, created_at desc)
create index if not exists assessments_monitoring_run_idx
  on public.assessments(monitoring_run_id)
  where monitoring_run_id is not null
do $$
begin
  alter table public.assessment_events drop constraint if exists assessment_events_known_event_type_chk;
  alter table public.assessment_events
    add constraint assessment_events_known_event_type_chk check (event_type in (
      'assessment_started',
      'first_answer_saved',
      'assessment_progress_activity',
      'assessment_submitted',
      'snapshot_generation_started',
      'snapshot_generation_succeeded',
      'snapshot_generation_failed',
      'snapshot_viewed',
      'executive_summary_viewed',
      'report_options_opened',
      'report_option_selected',
      'product_selected',
      'order_recorded',
      -- Historical compatibility values remain readable.
      'full_report_5000_selected',
      'personalised_report_50000_selected',
      'essential_selected',
      'comprehensive_selected',
      'advisory_selected',
      'advisory_enquiry_submitted',
      'comprehensive_order_created',
      'comprehensive_evidence_submitted',
      'comprehensive_review_signed_off',
      'eft_order_created',
      'payment_marked_received',
      'report_generated',
      'admin_report_downloaded',
      'report_emailed_to_customer',
      'internal_notification_queued',
      'internal_notification_sent',
      'internal_notification_failed'
    ));
end $$
-- Extend the existing incident ledger with safe operational fields. Existing application alerts
-- continue using their existing warning/critical severity and lifecycle fields.
alter table public.phase14_operational_alerts
  add column if not exists monitoring_priority text,
  add column if not exists source text,
  add column if not exists route text,
  add column if not exists stage text,
  add column if not exists error_category text,
  add column if not exists deployment_sha text,
  add column if not exists safe_reference text,
  add column if not exists first_detected_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists occurrence_count integer not null default 1,
  add column if not exists cooldown_until timestamptz,
  add column if not exists last_notified_at timestamptz,
  add column if not exists last_recovery_notified_at timestamptz,
  add column if not exists reminder_count integer not null default 0
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.phase14_operational_alerts'::regclass
      and conname = 'phase14_operational_alerts_monitoring_priority_chk'
  ) then
    alter table public.phase14_operational_alerts
      add constraint phase14_operational_alerts_monitoring_priority_chk
      check (monitoring_priority is null or monitoring_priority in ('P1','P2','P3'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.phase14_operational_alerts'::regclass
      and conname = 'phase14_operational_alerts_deployment_sha_chk'
  ) then
    alter table public.phase14_operational_alerts
      add constraint phase14_operational_alerts_deployment_sha_chk
      check (deployment_sha is null or deployment_sha ~ '^[0-9a-f]{40}$');
  end if;
end $$
update public.phase14_operational_alerts
set first_detected_at = coalesce(first_detected_at, created_at),
    last_seen_at = coalesce(last_seen_at, created_at)
where first_detected_at is null or last_seen_at is null
create index if not exists phase14_operational_alerts_monitoring_status_idx
  on public.phase14_operational_alerts(source, status, monitoring_priority, last_seen_at desc)
create index if not exists phase14_operational_alerts_monitoring_route_idx
  on public.phase14_operational_alerts(route, status, last_seen_at desc)
  where route is not null
create table if not exists public.production_monitor_heartbeats (
  monitor_name text primary key,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  status text not null default 'never_run' check (status in ('never_run','running','healthy','degraded','failed')),
  deployment_sha text check (deployment_sha is null or deployment_sha ~ '^[0-9a-f]{40}$'),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  run_count bigint not null default 0 check (run_count >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  safe_summary_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
)
create table if not exists public.production_monitor_events (
  id uuid primary key default gen_random_uuid(),
  monitor_name text not null,
  stage text not null,
  outcome text not null check (outcome in ('pass','warn','fail')),
  route text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  error_category text,
  deployment_sha text check (deployment_sha is null or deployment_sha ~ '^[0-9a-f]{40}$'),
  safe_reference text,
  synthetic boolean not null default false,
  detail_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
)
create index if not exists production_monitor_events_recent_idx
  on public.production_monitor_events(occurred_at desc, outcome, stage)
create index if not exists production_monitor_events_route_idx
  on public.production_monitor_events(route, occurred_at desc)
  where route is not null
create table if not exists public.production_monitor_drift_checks (
  id uuid primary key default gen_random_uuid(),
  check_key text not null,
  category text not null check (category in ('release','adaptive','methodology','commercial','legal','analytics','seo','public_route','domain_tls','internal_state','dependency')),
  status text not null check (status in ('PASS','WARN','FAIL')),
  deployment_sha text check (deployment_sha is null or deployment_sha ~ '^[0-9a-f]{40}$'),
  safe_summary text not null,
  checked_at timestamptz not null default now()
)
create index if not exists production_monitor_drift_checks_recent_idx
  on public.production_monitor_drift_checks(checked_at desc, category, status)
create index if not exists production_monitor_drift_checks_key_idx
  on public.production_monitor_drift_checks(check_key, checked_at desc)
alter table public.production_monitor_heartbeats enable row level security
alter table public.production_monitor_events enable row level security
alter table public.production_monitor_drift_checks enable row level security
revoke all on public.production_monitor_heartbeats, public.production_monitor_events, public.production_monitor_drift_checks from public, anon, authenticated
grant select, insert, update on public.production_monitor_heartbeats to service_role
grant select, insert on public.production_monitor_events to service_role
grant select, insert on public.production_monitor_drift_checks to service_role
-- Monitoring is allowed to extend the existing ledger, but only through a narrow service-role
-- RPC. This keeps the application from needing a broad table write grant and makes the allowed
-- fields explicit. The caller is still responsible for PII scrubbing; the RPC rejects oversized or
-- malformed opaque identifiers before persisting them.
create or replace function public.record_production_monitor_alert(
  p_alert_key text,
  p_priority text,
  p_category text,
  p_route text,
  p_stage text,
  p_error_category text,
  p_deployment_sha text,
  p_safe_reference text,
  p_detail jsonb,
  p_now timestamptz default now()
) returns public.phase14_operational_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert public.phase14_operational_alerts;
begin
  if coalesce(p_alert_key, '') !~ '^[A-Za-z0-9._:-]{1,160}$' then raise exception 'production_monitor_alert_key_invalid'; end if;
  if p_priority not in ('P1','P2','P3') then raise exception 'production_monitor_alert_priority_invalid'; end if;
  if coalesce(p_category, '') !~ '^[A-Za-z0-9._:-]{1,100}$' then raise exception 'production_monitor_alert_category_invalid'; end if;
  if p_route is not null and length(p_route) > 200 then raise exception 'production_monitor_alert_route_invalid'; end if;
  if p_stage is not null and length(p_stage) > 100 then raise exception 'production_monitor_alert_stage_invalid'; end if;
  if p_error_category is not null and length(p_error_category) > 120 then raise exception 'production_monitor_alert_error_category_invalid'; end if;
  if p_deployment_sha is not null and p_deployment_sha !~ '^[0-9a-f]{40}$' then raise exception 'production_monitor_alert_sha_invalid'; end if;
  if p_safe_reference is not null and p_safe_reference !~ '^[A-Za-z0-9._:-]{1,120}$' then raise exception 'production_monitor_alert_reference_invalid'; end if;
  if jsonb_typeof(coalesce(p_detail, '{}'::jsonb)) <> 'object' then raise exception 'production_monitor_alert_detail_invalid'; end if;

  insert into public.phase14_operational_alerts(
    alert_key, severity, category, detail_json, status,
    monitoring_priority, source, route, stage, error_category, deployment_sha,
    safe_reference, first_detected_at, last_seen_at, occurrence_count
  ) values (
    p_alert_key,
    case when p_priority = 'P1' then 'critical' else 'warning' end,
    p_category,
    coalesce(p_detail, '{}'::jsonb),
    'open',
    p_priority,
    'production_monitor',
    nullif(p_route, ''),
    nullif(p_stage, ''),
    nullif(p_error_category, ''),
    nullif(p_deployment_sha, ''),
    nullif(p_safe_reference, ''),
    coalesce(p_now, now()),
    coalesce(p_now, now()),
    1
  )
  on conflict (alert_key) do update set
    severity = excluded.severity,
    category = excluded.category,
    detail_json = excluded.detail_json,
    status = 'open',
    resolved_at = null,
    monitoring_priority = excluded.monitoring_priority,
    source = 'production_monitor',
    route = excluded.route,
    stage = excluded.stage,
    error_category = excluded.error_category,
    deployment_sha = excluded.deployment_sha,
    safe_reference = excluded.safe_reference,
    last_seen_at = coalesce(p_now, now()),
    occurrence_count = public.phase14_operational_alerts.occurrence_count + 1;

  select * into v_alert from public.phase14_operational_alerts where alert_key = p_alert_key;
  return v_alert;
end;
$$
create or replace function public.resolve_production_monitor_alert(
  p_alert_key text,
  p_now timestamptz default now()
) returns public.phase14_operational_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert public.phase14_operational_alerts;
begin
  if coalesce(p_alert_key, '') !~ '^[A-Za-z0-9._:-]{1,160}$' then raise exception 'production_monitor_alert_key_invalid'; end if;
  update public.phase14_operational_alerts
  set status = 'resolved',
      resolved_at = coalesce(p_now, now()),
      last_seen_at = coalesce(p_now, now())
  where alert_key = p_alert_key
    and source = 'production_monitor'
    and status in ('open','acknowledged')
  returning * into v_alert;
  return v_alert;
end;
$$
create or replace function public.mark_production_monitor_alert_notified(
  p_alert_key text,
  p_notified_at timestamptz default now(),
  p_is_recovery boolean default false
) returns public.phase14_operational_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert public.phase14_operational_alerts;
begin
  if coalesce(p_alert_key, '') !~ '^[A-Za-z0-9._:-]{1,160}$' then raise exception 'production_monitor_alert_key_invalid'; end if;
  update public.phase14_operational_alerts
  set last_notified_at = case when coalesce(p_is_recovery, false) then last_notified_at else coalesce(p_notified_at, now()) end,
      last_recovery_notified_at = case when coalesce(p_is_recovery, false) then coalesce(p_notified_at, now()) else last_recovery_notified_at end,
      reminder_count = case when not coalesce(p_is_recovery, false) and last_notified_at is not null then reminder_count + 1 else reminder_count end,
      cooldown_until = case when not coalesce(p_is_recovery, false) then coalesce(p_notified_at, now()) + interval '4 hours' else cooldown_until end
  where alert_key = p_alert_key
    and source = 'production_monitor'
  returning * into v_alert;
  return v_alert;
end;
$$
revoke all on function public.record_production_monitor_alert(text,text,text,text,text,text,text,text,jsonb,timestamptz) from public, anon, authenticated
grant execute on function public.record_production_monitor_alert(text,text,text,text,text,text,text,text,jsonb,timestamptz) to service_role
revoke all on function public.resolve_production_monitor_alert(text,timestamptz) from public, anon, authenticated
grant execute on function public.resolve_production_monitor_alert(text,timestamptz) to service_role
revoke all on function public.mark_production_monitor_alert_notified(text,timestamptz,boolean) from public, anon, authenticated
grant execute on function public.mark_production_monitor_alert_notified(text,timestamptz,boolean) to service_role
comment on column public.assessments.monitoring_synthetic is 'True only for an authorized, signed monitoring journey; excluded from genuine customer funnel metrics.'
comment on column public.assessments.monitoring_run_id is 'Opaque, non-PII monitoring run reference for exact investigation scope.'
comment on table public.production_monitor_heartbeats is 'Durable heartbeat for the internal Production monitoring job; service-role write, admin server read.'
comment on table public.production_monitor_events is 'PII-free operational monitor outcomes for bounded incident/funnel diagnostics.'
comment on table public.production_monitor_drift_checks is 'PII-free release/configuration drift history for daily monitoring.'
commit

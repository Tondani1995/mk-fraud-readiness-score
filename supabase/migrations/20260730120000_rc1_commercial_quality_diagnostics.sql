-- RC1: safe commercial-quality diagnostics.
--
-- Problem this solves
-- -------------------
-- When the V7 commercial quality gate fails, phase1-manual-fulfilment.ts records only
-- error_category = 'commercial_quality_failed' plus a fixed safe message on
-- manual_report_generation_attempts. The actual violation codes -- the only information that tells
-- an operator *which* gate failed and on which question -- are discarded with the thrown
-- ReportCommercialQualityError. During RC1 staging certification this made a real generation
-- failure undiagnosable from the database alone.
--
-- Design constraints
-- ------------------
-- The quality error deliberately carries no report narrative, so the diagnostic must stay equally
-- narrow. This migration persists ONLY: violation code, severity, affected question code, affected
-- domain code, source, a safe category, the attempt id and a timestamp. The ingest function
-- rejects any payload key outside that closed set, so a future caller cannot widen the record into
-- a narrative dump by accident -- the CommercialQualityIssue.message field is explicitly not
-- accepted, because it interpolates finding identifiers and control names.
--
-- Freeze-guard registration
-- -------------------------
-- 20260722120000_rc1_operational_freeze_bootstrap.sql installs an event trigger
-- (rc1_install_new_relation_guards) that attaches rc1_guard_authoritative_mutation to every newly
-- created table, and that guard raises 'rc1_operation_frozen:unknown_surface' when
-- rc1_surface_for_relation returns null. A new table is therefore permanently unwritable until it
-- is mapped to an operation surface, so this migration extends the mapping additively. Diagnostics
-- are written by the generation worker, so they belong to the existing 'generation' surface and
-- inherit exactly the same freeze semantics as manual_report_generation_attempts.

begin;

-- ---------------------------------------------------------------------------
-- 1. Diagnostic store.
-- ---------------------------------------------------------------------------
create table if not exists public.report_quality_diagnostics (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references public.manual_report_generation_attempts(id) on delete cascade,
  safe_category text not null,
  violation_code text not null,
  severity text not null,
  question_code text,
  domain_code text,
  source text,
  recorded_at timestamptz not null default now(),
  constraint report_quality_diagnostics_severity_check
    check (severity in ('violation', 'warning')),
  constraint report_quality_diagnostics_code_check
    check (violation_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  constraint report_quality_diagnostics_category_check
    check (safe_category ~ '^[a-z][a-z0-9_]{2,63}$'),
  -- Question and domain codes are methodology identifiers, never free text.
  constraint report_quality_diagnostics_question_code_check
    check (question_code is null or question_code ~ '^D[0-9]+-Q[0-9]+$'),
  constraint report_quality_diagnostics_domain_code_check
    check (domain_code is null or domain_code ~ '^D[0-9]+$'),
  constraint report_quality_diagnostics_source_check
    check (source is null or source ~ '^[a-z][a-z0-9-]{2,63}$')
);

create index if not exists report_quality_diagnostics_attempt_idx
  on public.report_quality_diagnostics (attempt_id, recorded_at desc);

comment on table public.report_quality_diagnostics is
  'Safe commercial-quality gate diagnostics: violation codes and affected methodology identifiers only. Never report narrative, secrets or customer data.';

alter table public.report_quality_diagnostics enable row level security;

-- No API role gets direct table access. Writes go through the ingest function below (service
-- role, from the generation worker); reads go through the platform-admin function.
revoke all on table public.report_quality_diagnostics from public, anon, authenticated;
grant select, insert on table public.report_quality_diagnostics to service_role;

-- ---------------------------------------------------------------------------
-- 2. Register the new relation on the existing 'generation' freeze surface.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_surface_for_relation(p_schema text, p_table text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case coalesce(p_schema, '') || '.' || coalesce(p_table, '')
    when 'public.organisations' then 'assessment_start'
    when 'public.respondents' then 'assessment_start'
    when 'public.assessments' then 'assessment_write'
    when 'public.assessment_tokens' then 'assessment_write'
    when 'public.assessment_answers' then 'assessment_write'
    when 'public.exposure_answers' then 'assessment_write'
    when 'public.assessment_events' then 'assessment_write'
    when 'public.score_runs' then 'assessment_score'
    when 'public.score_domain_results' then 'assessment_score'
    when 'public.score_question_traces' then 'assessment_score'
    when 'public.maturity_cap_events' then 'assessment_score'
    when 'public.data_requests' then 'order_create'
    when 'public.orders' then 'order_create'
    when 'public.payment_sessions' then 'payment_status'
    when 'public.payment_automation_records' then 'payment_status'
    when 'public.payment_transition_events' then 'payment_status'
    when 'public.order_events' then 'payment_status'
    when 'public.manual_report_generation_attempts' then 'generation'
    when 'public.report_fulfilments' then 'generation'
    when 'public.report_generation_runs' then 'generation'
    when 'public.report_ai_attempts' then 'generation'
    when 'public.reports' then 'generation'
    when 'public.report_events' then 'generation'
    -- RC1 addition: diagnostics are produced by the generation worker.
    when 'public.report_quality_diagnostics' then 'generation'
    when 'public.backlog_reconciliation_records' then 'backlog'
    when 'public.manual_report_delivery_attempts' then 'delivery'
    when 'public.report_delivery_authorizations' then 'delivery'
    when 'public.report_delivery_finalizations' then 'delivery'
    when 'public.report_delivery_remediations' then 'delivery'
    when 'public.email_events' then 'delivery'
    when 'public.email_provider_events' then 'resend_webhook'
    when 'public.customer_report_access_tokens' then 'customer_token'
    when 'public.phase14_operational_alerts' then 'operational_alert'
    when 'public.app_settings' then 'activation_control'
    when 'public.phase14_security_gates' then 'activation_control'
    when 'public.phase14_feature_policies' then 'activation_control'
    when 'public.phase14_ai_route_policies' then 'activation_control'
    when 'public.phase14_provider_attestations' then 'activation_control'
    when 'public.phase14_worker_capabilities' then 'worker'
    when 'public.phase14_worker_operations' then 'worker'
    when 'storage.objects' then 'storage_cleanup'
    when 'phase14_private.runtime_secrets' then 'activation_control'
    else null
  end;
$$;

revoke all on function public.rc1_surface_for_relation(text,text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Ingest: closed-key payload, fail-closed on anything unexpected.
-- ---------------------------------------------------------------------------
create or replace function public.record_report_quality_diagnostics(
  p_attempt_id uuid,
  p_safe_category text,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_keys text[];
  v_allowed text[] := array['violation_code', 'severity', 'question_code', 'domain_code', 'source'];
  v_inserted integer := 0;
begin
  if p_attempt_id is null then
    raise exception 'rc1_quality_diagnostics:attempt_required';
  end if;
  if not exists (
    select 1 from public.manual_report_generation_attempts a where a.id = p_attempt_id
  ) then
    raise exception 'rc1_quality_diagnostics:unknown_attempt';
  end if;
  if p_safe_category is null or p_safe_category !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'rc1_quality_diagnostics:invalid_category';
  end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'rc1_quality_diagnostics:items_must_be_array';
  end if;
  -- A runaway payload is a symptom of the caller passing something other than gate issues.
  if pg_catalog.jsonb_array_length(p_items) > 200 then
    raise exception 'rc1_quality_diagnostics:too_many_items';
  end if;

  for v_item in select * from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception 'rc1_quality_diagnostics:item_must_be_object';
    end if;

    -- Closed key set. This is the control that stops report narrative, customer data or a raw
    -- CommercialQualityIssue.message from ever reaching this table.
    select pg_catalog.array_agg(k order by k) into v_keys
    from pg_catalog.jsonb_object_keys(v_item) as k;
    if exists (select 1 from unnest(v_keys) as k where k <> all(v_allowed)) then
      raise exception 'rc1_quality_diagnostics:unexpected_payload_key';
    end if;

    insert into public.report_quality_diagnostics (
      attempt_id, safe_category, violation_code, severity, question_code, domain_code, source
    )
    values (
      p_attempt_id,
      p_safe_category,
      v_item->>'violation_code',
      coalesce(v_item->>'severity', 'violation'),
      nullif(v_item->>'question_code', ''),
      nullif(v_item->>'domain_code', ''),
      nullif(v_item->>'source', '')
    );
    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.record_report_quality_diagnostics(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_report_quality_diagnostics(uuid,text,jsonb) to service_role;

comment on function public.record_report_quality_diagnostics(uuid,text,jsonb) is
  'Records commercial-quality gate violation codes for an attempt. Rejects any payload key outside violation_code/severity/question_code/domain_code/source so narrative can never be persisted.';

-- ---------------------------------------------------------------------------
-- 4. Authorised operations read.
-- ---------------------------------------------------------------------------
-- Diagnostics are operational, not customer-facing. Read access requires an active platform admin;
-- AAL2 is deliberately not required because this is a read-only diagnostic with no mutation and no
-- sensitive payload, and requiring a step-up would push operators back to raw table access.
create or replace function public.rc1_report_quality_diagnostics(p_attempt_id uuid)
returns table (
  attempt_id uuid,
  safe_category text,
  violation_code text,
  severity text,
  question_code text,
  domain_code text,
  source text,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.rc1_require_platform_admin(false);
  return query
    select d.attempt_id, d.safe_category, d.violation_code, d.severity,
           d.question_code, d.domain_code, d.source, d.recorded_at
    from public.report_quality_diagnostics d
    where p_attempt_id is null or d.attempt_id = p_attempt_id
    order by d.recorded_at desc, d.violation_code;
end;
$$;

revoke all on function public.rc1_report_quality_diagnostics(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_report_quality_diagnostics(uuid) to authenticated;

comment on function public.rc1_report_quality_diagnostics(uuid) is
  'Platform-admin read of safe commercial-quality diagnostics. Never exposed on customer-facing routes.';

commit;

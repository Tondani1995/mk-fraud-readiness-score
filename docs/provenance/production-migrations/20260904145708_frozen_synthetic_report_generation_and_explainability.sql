-- Frozen proof-run support.
--
-- This migration adds two additive contracts:
--   1. explicit synthetic-demonstration markers and an auditable, order-free
--      Comprehensive fixture-generation record;
--   2. safe Essential provider diagnostics and score explainability metadata.
--
-- The synthetic path is deliberately separate from commercial Comprehensive fulfilment. It has
-- no order, payment, invoice, engagement, email or customer-delivery transition, and its RPCs are
-- service-role-only. The application route still requires an authenticated platform administrator.

begin;

alter table public.assessments
  add column if not exists synthetic_demonstration boolean not null default false,
  add column if not exists synthetic_certification_ref text;

alter table public.reports
  add column if not exists synthetic_demonstration boolean not null default false,
  add column if not exists synthetic_certification_ref text;

alter table public.manual_report_generation_attempts
  add column if not exists failure_diagnostics_json jsonb not null default '{}'::jsonb;

alter table public.assessments
  drop constraint if exists assessments_synthetic_marker_check;
alter table public.assessments
  add constraint assessments_synthetic_marker_check
  check (
    (synthetic_demonstration = false and synthetic_certification_ref is null)
    or (synthetic_demonstration = true
      and synthetic_certification_ref ~ '^MK-SYN-[0-9]{8}-[A-Z0-9-]{1,40}$')
  );

alter table public.reports
  drop constraint if exists reports_synthetic_marker_check;
alter table public.reports
  add constraint reports_synthetic_marker_check
  check (
    (synthetic_demonstration = false and synthetic_certification_ref is null)
    or (synthetic_demonstration = true
      and synthetic_certification_ref ~ '^MK-SYN-[0-9]{8}-[A-Z0-9-]{1,40}$')
  );

create or replace function public.guard_synthetic_assessment_marker()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.synthetic_demonstration
     and coalesce(new.synthetic_certification_ref, '') !~ '^MK-SYN-[0-9]{8}-[A-Z0-9-]{1,40}$' then
    raise exception 'synthetic_assessment_marker_invalid';
  end if;
  if not new.synthetic_demonstration and new.synthetic_certification_ref is not null then
    raise exception 'synthetic_assessment_reference_without_marker';
  end if;
  if tg_op = 'UPDATE'
     and old.synthetic_demonstration
     and (not new.synthetic_demonstration
       or new.synthetic_certification_ref is distinct from old.synthetic_certification_ref) then
    raise exception 'synthetic_assessment_marker_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_synthetic_assessment_marker on public.assessments;
create trigger trg_guard_synthetic_assessment_marker
before insert or update of synthetic_demonstration, synthetic_certification_ref
on public.assessments
for each row execute function public.guard_synthetic_assessment_marker();

create or replace function public.guard_synthetic_report_marker()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assessment public.assessments%rowtype;
begin
  select * into v_assessment
  from public.assessments
  where id = new.assessment_id;
  if not found then
    raise exception 'synthetic_report_assessment_missing';
  end if;

  if v_assessment.synthetic_demonstration then
    if new.order_id is not null then
      raise exception 'synthetic_report_order_binding_forbidden';
    end if;
    new.synthetic_demonstration := true;
    new.synthetic_certification_ref := v_assessment.synthetic_certification_ref;
  elsif new.synthetic_demonstration or new.synthetic_certification_ref is not null then
    raise exception 'ordinary_report_synthetic_marker_forbidden';
  end if;

  if new.synthetic_demonstration
     and coalesce(new.synthetic_certification_ref, '') !~ '^MK-SYN-[0-9]{8}-[A-Z0-9-]{1,40}$' then
    raise exception 'synthetic_report_marker_invalid';
  end if;
  if tg_op = 'UPDATE'
     and old.synthetic_demonstration
     and (not new.synthetic_demonstration
       or new.synthetic_certification_ref is distinct from old.synthetic_certification_ref) then
    raise exception 'synthetic_report_marker_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_synthetic_report_marker on public.reports;
create trigger trg_guard_synthetic_report_marker
before insert or update of assessment_id, order_id, synthetic_demonstration, synthetic_certification_ref
on public.reports
for each row execute function public.guard_synthetic_report_marker();

create index if not exists assessments_synthetic_demonstration_idx
  on public.assessments(synthetic_demonstration, synthetic_certification_ref);
create index if not exists reports_synthetic_demonstration_idx
  on public.reports(synthetic_demonstration, synthetic_certification_ref);

-- Completed score runs are immutable by contract. Explanatory scope/cap metadata therefore lives
-- in an additive companion row and is merged at read time; this migration never updates a locked
-- score run or rewrites a score, maturity, denominator, trace or cap event.
create table if not exists public.synthetic_score_explainability (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  score_run_id uuid not null references public.score_runs(id) on delete restrict,
  synthetic_certification_ref text not null
    check (synthetic_certification_ref ~ '^MK-SYN-[0-9]{8}-[A-Z0-9-]{1,40}$'),
  limitation_reasons text[] not null default '{}'::text[],
  cap_effect text not null check (cap_effect in ('band_lowered', 'no_band_change', 'none')),
  source_contract text not null default 'adaptive-explainability-v1',
  created_at timestamptz not null default now(),
  unique (score_run_id),
  unique (assessment_id)
);

create index if not exists synthetic_score_explainability_assessment_idx
  on public.synthetic_score_explainability(assessment_id);
alter table public.synthetic_score_explainability enable row level security;
revoke all on table public.synthetic_score_explainability from public, anon, authenticated;
grant select, insert, update on table public.synthetic_score_explainability to service_role;

create table if not exists public.synthetic_report_generation_records (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  technical_reference text not null unique,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  report_id uuid references public.reports(id) on delete set null,
  report_type public.report_type not null,
  report_version integer not null check (report_version > 0),
  synthetic_certification_ref text not null
    check (synthetic_certification_ref ~ '^MK-SYN-[0-9]{8}-[A-Z0-9-]{1,40}$'),
  route text not null check (route = 'comprehensive_synthetic_fixture'),
  status text not null check (status in ('generating', 'ready', 'failed')),
  requested_by uuid not null references public.admin_profiles(id) on delete restrict,
  engine_contract text not null,
  provider text,
  model text,
  provider_calls integer not null default 0 check (provider_calls between 0 and 3),
  report_checksum text check (report_checksum is null or report_checksum ~ '^[0-9a-f]{64}$'),
  storage_bucket text,
  storage_path text,
  file_name text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  error_category text,
  safe_error_message text,
  failure_diagnostics_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (assessment_id, report_type, report_version)
);

create index if not exists synthetic_report_generation_records_assessment_idx
  on public.synthetic_report_generation_records(assessment_id, created_at desc);
create index if not exists synthetic_report_generation_records_status_idx
  on public.synthetic_report_generation_records(status, created_at desc);

alter table public.synthetic_report_generation_records enable row level security;
revoke all on table public.synthetic_report_generation_records from public, anon, authenticated;
grant select, insert, update on table public.synthetic_report_generation_records to service_role;

comment on table public.synthetic_report_generation_records is
  'Non-commercial owner-review Comprehensive fixture generations. Every row is explicitly synthetic and order-free.';
comment on column public.manual_report_generation_attempts.failure_diagnostics_json is
  'Bounded provider identity/accounting diagnostics only; raw prompts, response bodies and customer prose are prohibited.';

-- Synthetic Comprehensive claim. This is the only database entry point that can create a fixture
-- generation record. It never creates an order or engagement and rejects ordinary assessments.
create or replace function public.claim_synthetic_comprehensive_generation(
  p_assessment_reference text,
  p_requested_by uuid,
  p_request_key text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_profile public.admin_profiles%rowtype;
  v_existing public.synthetic_report_generation_records%rowtype;
  v_current public.reports%rowtype;
  v_record public.synthetic_report_generation_records%rowtype;
  v_version integer;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'synthetic_generation_service_role_required';
  end if;
  if coalesce(trim(p_assessment_reference), '') = ''
     or coalesce(trim(p_request_key), '') = ''
     or coalesce(trim(p_technical_reference), '') = '' then
    raise exception 'synthetic_generation_request_identity_required';
  end if;
  if length(p_request_key) > 240 or length(p_technical_reference) > 160 then
    raise exception 'synthetic_generation_request_identity_invalid';
  end if;

  select * into v_profile
  from public.admin_profiles
  where id = p_requested_by and status = 'active';
  if not found or v_profile.role <> 'platform_admin' then
    raise exception 'synthetic_generation_platform_admin_required';
  end if;

  select * into v_existing
  from public.synthetic_report_generation_records
  where request_key = p_request_key;
  if found then
    if v_existing.status = 'ready' and v_existing.report_id is not null then
      return jsonb_build_object('claimed', false, 'reason', 'idempotent_replay', 'record', to_jsonb(v_existing));
    end if;
    if v_existing.status = 'generating' then
      return jsonb_build_object('claimed', false, 'reason', 'already_active', 'record', to_jsonb(v_existing));
    end if;
    raise exception 'synthetic_generation_request_already_failed';
  end if;

  select * into v_assessment
  from public.assessments
  where assessment_reference = p_assessment_reference
  for update;
  if not found then raise exception 'synthetic_generation_assessment_not_found'; end if;
  if not v_assessment.synthetic_demonstration
     or coalesce(v_assessment.synthetic_certification_ref, '') = '' then
    raise exception 'synthetic_generation_marker_required';
  end if;
  if v_assessment.monitoring_synthetic then
    raise exception 'synthetic_generation_monitoring_fixture_forbidden';
  end if;
  if v_assessment.assessment_mode <> 'adaptive'
     or v_assessment.status not in ('scored','snapshot_available','report_requested','under_review','closed')
     or v_assessment.submitted_at is null
     or v_assessment.locked_at is null
     or v_assessment.current_score_run_id is null then
    raise exception 'synthetic_generation_assessment_incomplete';
  end if;

  select * into v_score
  from public.score_runs
  where id = v_assessment.current_score_run_id
    and assessment_id = v_assessment.id
    and status = 'completed'
    and locked_at is not null;
  if not found then raise exception 'synthetic_generation_score_not_locked'; end if;

  if exists (select 1 from public.orders where assessment_id = v_assessment.id) then
    raise exception 'synthetic_generation_order_binding_forbidden';
  end if;

  -- Never let a fixture overwrite or supersede a commercial Comprehensive report. This guard is
  -- intentionally independent of the synthetic marker trigger so a malformed row cannot weaken it.
  select * into v_current
  from public.reports
  where assessment_id = v_assessment.id
    and report_type = 'mk_validated'
    and status in ('generated','under_review','approved','released')
  order by version_number desc
  limit 1;
  if found and not v_current.synthetic_demonstration then
    raise exception 'synthetic_generation_commercial_report_exists';
  end if;

  select greatest(
    coalesce((select max(version_number) from public.reports where assessment_id = v_assessment.id and report_type = 'mk_validated'), 0),
    coalesce((select max(report_version) from public.synthetic_report_generation_records where assessment_id = v_assessment.id and report_type = 'mk_validated'), 0)
  ) + 1 into v_version;

  insert into public.synthetic_report_generation_records(
    request_key, technical_reference, assessment_id, report_type, report_version,
    synthetic_certification_ref, route, status, requested_by, engine_contract
  ) values (
    p_request_key, p_technical_reference, v_assessment.id, 'mk_validated', v_version,
    v_assessment.synthetic_certification_ref, 'comprehensive_synthetic_fixture', 'generating',
    p_requested_by, 'mk-comprehensive-manual-generation-v1'
  ) returning * into v_record;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'admin', p_requested_by, v_assessment.id, 'synthetic_report_generation_records', v_record.id,
    'synthetic_comprehensive_generation_requested',
    jsonb_build_object(
      'technical_reference', p_technical_reference,
      'request_key', p_request_key,
      'report_type', 'mk_validated',
      'report_version', v_version,
      'synthetic_certification_ref', v_assessment.synthetic_certification_ref,
      'order_id', null,
      'payment_created', false,
      'customer_delivery_authorised', false
    )
  );

  return jsonb_build_object('claimed', true, 'record', to_jsonb(v_record), 'score_run_id', v_score.id);
end;
$$;

-- Synthetic Comprehensive completion. It shares the normal PDF renderer at the application seam,
-- but uses a dedicated order-free finalisation boundary and never calls the commercial package RPC.
create or replace function public.complete_synthetic_comprehensive_generation(
  p_record_id uuid,
  p_template_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum text,
  p_provider_calls integer,
  p_provider text,
  p_model text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.synthetic_report_generation_records%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_template public.report_templates%rowtype;
  v_previous public.reports%rowtype;
  v_report public.reports%rowtype;
  v_reference text;
  v_expected_prefix text;
  v_expected_file_name text;
  v_expected_storage_path text;
  v_metadata jsonb := case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'synthetic_generation_service_role_required'; end if;
  select * into v_record from public.synthetic_report_generation_records where id = p_record_id for update;
  if not found or v_record.status <> 'generating' then raise exception 'synthetic_generation_record_not_active'; end if;
  select * into v_assessment from public.assessments where id = v_record.assessment_id for update;
  if not found or not v_assessment.synthetic_demonstration
     or v_assessment.synthetic_certification_ref is distinct from v_record.synthetic_certification_ref
     or v_assessment.monitoring_synthetic then raise exception 'synthetic_generation_assessment_binding_invalid'; end if;
  if exists (select 1 from public.orders where assessment_id = v_assessment.id) then raise exception 'synthetic_generation_order_binding_forbidden'; end if;
  select * into v_score from public.score_runs where id = v_assessment.current_score_run_id
    and assessment_id = v_assessment.id and status = 'completed' and locked_at is not null;
  if not found then raise exception 'synthetic_generation_score_not_locked'; end if;
  select * into v_template from public.report_templates where id = p_template_id and report_type = 'mk_validated' and status = 'active';
  if not found then raise exception 'synthetic_generation_template_invalid'; end if;
  if v_record.report_type <> 'mk_validated' or coalesce(p_storage_bucket, '') <> 'generated-reports'
     or coalesce(p_storage_path, '') = '' or position('..' in p_storage_path) > 0
     or coalesce(p_file_name, '') !~ '^[A-Za-z0-9._-]+\.pdf$' or p_mime_type <> 'application/pdf'
     or coalesce(p_file_size_bytes, 0) <= 0 or coalesce(p_checksum, '') !~ '^[0-9a-f]{64}$'
     or p_provider_calls is null or p_provider_calls < 1 or p_provider_calls > 3
     or coalesce(trim(p_provider), '') = '' or length(p_provider) > 160
     or coalesce(trim(p_model), '') = '' or length(p_model) > 240 then raise exception 'synthetic_generation_output_integrity_invalid'; end if;

  v_reference := 'RPT-' || v_assessment.assessment_reference || '-COMP-V' || v_record.report_version::text;
  v_expected_file_name := regexp_replace(v_reference, '[^A-Za-z0-9._-]', '_', 'g') || '.pdf';
  v_expected_prefix := v_assessment.organisation_id::text || '/' || v_assessment.id::text || '/synthetic-comprehensive/v' || v_record.report_version::text || '/';
  v_expected_storage_path := v_expected_prefix || regexp_replace(v_reference, '[^A-Za-z0-9._-]', '_', 'g') || '-' || left(p_checksum, 16) || '.pdf';
  if p_file_name <> v_expected_file_name or p_storage_path <> v_expected_storage_path then raise exception 'synthetic_generation_storage_binding_invalid'; end if;

  select * into v_previous from public.reports where assessment_id = v_assessment.id and report_type = 'mk_validated'
    and synthetic_demonstration and status in ('generated','under_review','approved','released')
  order by version_number desc limit 1 for update;
  if v_previous.id is not null then update public.reports set status = 'superseded', updated_at = now() where id = v_previous.id; end if;

  insert into public.reports(
    assessment_id, organisation_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, generated_by, generated_at,
    supersedes_report_id, synthetic_demonstration, synthetic_certification_ref
  ) values (
    v_assessment.id, v_assessment.organisation_id, null, v_score.id, v_template.id, 'mk_validated', 'generated',
    v_reference, v_record.report_version, p_storage_bucket, p_storage_path, p_checksum, p_file_name, p_mime_type,
    p_file_size_bytes, 'VERIFIED', now(), v_record.requested_by, now(), v_previous.id, true, v_record.synthetic_certification_ref
  ) returning * into v_report;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.report_events(report_id, event_type, from_status, to_status, actor_user_id, note, metadata_json)
  values (
    v_report.id, case when v_previous.id is null then 'generated' else 'regenerated' end,
    'REPORT_GENERATING', 'REPORT_READY', v_record.requested_by,
    'Synthetic Comprehensive demonstration PDF stored and integrity verified.',
    jsonb_build_object('synthetic_demonstration', true, 'synthetic_certification_ref', v_record.synthetic_certification_ref,
      'technical_reference', v_record.technical_reference, 'provider_calls', p_provider_calls,
      'order_id', null, 'customer_delivery_authorised', false)
  );
  insert into public.assessment_events(assessment_id, organisation_id, respondent_id, order_id, report_id, event_type, dedupe_key, metadata_json)
  values (
    v_assessment.id, v_assessment.organisation_id, v_assessment.primary_respondent_id, null, v_report.id, 'report_generated',
    'synthetic-assessment:' || v_assessment.id::text || ':report_generated:' || v_report.id::text,
    jsonb_build_object('report_reference', v_report.report_reference, 'report_type', 'mk_validated', 'version_number', v_report.version_number,
      'score_run_id', v_score.id, 'synthetic_demonstration', true, 'order_id', null)
  );
  update public.synthetic_report_generation_records
  set report_id = v_report.id, status = 'ready', provider = p_provider, model = p_model,
      provider_calls = p_provider_calls, report_checksum = p_checksum, storage_bucket = p_storage_bucket,
      storage_path = p_storage_path, file_name = p_file_name, file_size_bytes = p_file_size_bytes,
      metadata_json = v_metadata, completed_at = now(), updated_at = now()
  where id = v_record.id;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values (
    'admin', v_record.requested_by, v_assessment.id, 'reports', v_report.id, 'synthetic_comprehensive_generation_completed',
    jsonb_build_object('synthetic_demonstration', true, 'synthetic_certification_ref', v_record.synthetic_certification_ref,
      'report_reference', v_report.report_reference, 'report_version', v_report.version_number, 'checksum', p_checksum,
      'file_size_bytes', p_file_size_bytes, 'provider', p_provider, 'model', p_model, 'provider_calls', p_provider_calls,
      'generation_record_id', v_record.id, 'order_id', null, 'payment_created', false, 'customer_delivery_authorised', false)
  );
  return jsonb_build_object('ok', true, 'record_id', v_record.id, 'report', to_jsonb(v_report),
    'superseded_report_id', v_previous.id, 'provider_calls', p_provider_calls);
end;
$$;

create or replace function public.fail_synthetic_comprehensive_generation(
  p_record_id uuid,
  p_error_category text,
  p_safe_message text,
  p_failure_diagnostics jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.synthetic_report_generation_records%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'synthetic_generation_service_role_required'; end if;
  update public.synthetic_report_generation_records
  set status = 'failed', error_category = left(coalesce(p_error_category, 'generation_failed'), 100),
      safe_error_message = left(coalesce(p_safe_message, 'Synthetic report generation failed.'), 500),
      failure_diagnostics_json = case when jsonb_typeof(coalesce(p_failure_diagnostics, '{}'::jsonb)) = 'object' then coalesce(p_failure_diagnostics, '{}'::jsonb) else '{}'::jsonb end,
      completed_at = now(), updated_at = now()
  where id = p_record_id and status = 'generating'
  returning * into v_record;
  if not found then return jsonb_build_object('updated', false); end if;
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', v_record.requested_by, v_record.assessment_id, 'synthetic_report_generation_records', v_record.id,
    'synthetic_comprehensive_generation_failed', jsonb_build_object('technical_reference', v_record.technical_reference,
      'error_category', v_record.error_category, 'safe_error_message', v_record.safe_error_message,
      'failure_diagnostics', v_record.failure_diagnostics_json));
  return jsonb_build_object('updated', true, 'record', to_jsonb(v_record));
end;
$$;

-- Safe identity/accounting diagnostics for the assessment-scoped Essential path.
create or replace function public.record_assessment_manual_report_generation_diagnostics(
  p_attempt_id uuid,
  p_requested_provider text,
  p_requested_model text,
  p_resolved_provider text,
  p_resolved_model text,
  p_generation_mode text,
  p_ai_usage jsonb default '{}'::jsonb,
  p_failure_diagnostics jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'v12_generation_service_role_required'; end if;
  if p_generation_mode is not null and p_generation_mode not in ('ai','ai_repair','deterministic_fallback') then raise exception 'v12_generation_mode_invalid'; end if;
  update public.manual_report_generation_attempts
  set requested_provider = left(nullif(trim(p_requested_provider), ''), 160),
      requested_model = left(nullif(trim(p_requested_model), ''), 240),
      resolved_provider = left(nullif(trim(p_resolved_provider), ''), 160),
      resolved_model = left(nullif(trim(p_resolved_model), ''), 240),
      generation_mode = p_generation_mode,
      ai_usage_json = case when jsonb_typeof(coalesce(p_ai_usage, '{}'::jsonb)) = 'object' then coalesce(p_ai_usage, '{}'::jsonb) else '{}'::jsonb end,
      failure_diagnostics_json = case when jsonb_typeof(coalesce(p_failure_diagnostics, '{}'::jsonb)) = 'object' then coalesce(p_failure_diagnostics, '{}'::jsonb) else '{}'::jsonb end,
      updated_at = now()
  where id = p_attempt_id and order_id is null
    and trigger_source in ('assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate')
  returning * into v_attempt;
  if not found then return jsonb_build_object('updated', false); end if;
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', v_attempt.requested_by, v_attempt.assessment_id, 'manual_report_generation_attempts', v_attempt.id,
    'phase14_assessment_report_generation_diagnostics_recorded',
    jsonb_build_object('requested_provider', v_attempt.requested_provider, 'requested_model', v_attempt.requested_model,
      'resolved_provider', v_attempt.resolved_provider, 'resolved_model', v_attempt.resolved_model,
      'generation_mode', v_attempt.generation_mode, 'ai_usage', v_attempt.ai_usage_json,
      'failure_diagnostics', v_attempt.failure_diagnostics_json));
  return jsonb_build_object('updated', true, 'attempt_id', v_attempt.id);
end;
$$;

create or replace function public.fail_assessment_manual_report_generation(
  p_attempt_id uuid,
  p_error_category text,
  p_safe_message text,
  p_failure_diagnostics jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'v12_generation_service_role_required'; end if;
  update public.manual_report_generation_attempts
  set status = 'GENERATION_FAILED', completed_at = now(), updated_at = now(),
      error_category = left(coalesce(p_error_category, 'generation_failed'), 80),
      safe_operational_error = left(coalesce(p_safe_message, 'Report generation failed.'), 500),
      failure_diagnostics_json = case when jsonb_typeof(coalesce(p_failure_diagnostics, '{}'::jsonb)) = 'object' then coalesce(p_failure_diagnostics, '{}'::jsonb) else '{}'::jsonb end
  where id = p_attempt_id and order_id is null
    and trigger_source in ('assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate')
    and status in ('REPORT_QUEUED','REPORT_GENERATING')
  returning * into v_attempt;
  if not found then return jsonb_build_object('updated', false); end if;
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', v_attempt.requested_by, v_attempt.assessment_id, 'manual_report_generation_attempts', v_attempt.id,
    'phase14_assessment_report_generation_failed',
    jsonb_build_object('technical_reference', v_attempt.technical_reference, 'error_category', v_attempt.error_category,
      'safe_operational_error', v_attempt.safe_operational_error, 'failure_diagnostics', v_attempt.failure_diagnostics_json));
  return jsonb_build_object('updated', true, 'attempt', to_jsonb(v_attempt));
end;
$$;

revoke all on function public.claim_synthetic_comprehensive_generation(text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.complete_synthetic_comprehensive_generation(uuid,uuid,text,text,text,text,bigint,text,integer,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.fail_synthetic_comprehensive_generation(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.record_assessment_manual_report_generation_diagnostics(uuid,text,text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.fail_assessment_manual_report_generation(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_synthetic_comprehensive_generation(text,uuid,text,text) to service_role;
grant execute on function public.complete_synthetic_comprehensive_generation(uuid,uuid,text,text,text,text,bigint,text,integer,text,text,jsonb) to service_role;
grant execute on function public.fail_synthetic_comprehensive_generation(uuid,text,text,jsonb) to service_role;
grant execute on function public.record_assessment_manual_report_generation_diagnostics(uuid,text,text,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.fail_assessment_manual_report_generation(uuid,text,text,jsonb) to service_role;

-- Mark the four frozen proof assessments as deliberate synthetic demonstrations. The references
-- are stable certification labels, not old RC1 monitoring labels and not organisation mutations.
with target(assessment_reference, synthetic_ref) as (
  values
    ('MKFRS-2026-DE94607709', 'MK-SYN-20260904-ORG01'),
    ('MKFRS-2026-80B6B23791', 'MK-SYN-20260904-ORG02'),
    ('MKFRS-2026-A68F8A2017', 'MK-SYN-20260904-ORG03'),
    ('MKFRS-2026-6EB12B7B07', 'MK-SYN-20260904-ORG04')
)
update public.assessments a
set synthetic_demonstration = true,
    synthetic_certification_ref = target.synthetic_ref,
    updated_at = now()
from target
where a.assessment_reference = target.assessment_reference
  and not a.monitoring_synthetic;

insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, before_json, after_json)
select 'admin',
  (select id from public.admin_profiles where status = 'active' and role = 'platform_admin' order by created_at asc limit 1),
  a.id, 'assessments', a.id, 'synthetic_assessment_marker_backfilled',
  jsonb_build_object('synthetic_demonstration', false, 'synthetic_certification_ref', null),
  jsonb_build_object('synthetic_demonstration', a.synthetic_demonstration, 'synthetic_certification_ref', a.synthetic_certification_ref,
    'monitoring_synthetic', a.monitoring_synthetic)
from public.assessments a
where a.assessment_reference in ('MKFRS-2026-DE94607709','MKFRS-2026-80B6B23791','MKFRS-2026-A68F8A2017','MKFRS-2026-6EB12B7B07')
  and a.synthetic_demonstration;

-- Add score explainability without changing any score, maturity, denominator, cap rule or status.
with target(assessment_reference, limitation_reasons) as (
  values
    ('MKFRS-2026-DE94607709', array[]::text[]),
    ('MKFRS-2026-80B6B23791', array['1 control question was excluded from the assessed denominator.']::text[]),
    ('MKFRS-2026-A68F8A2017', array['2 control questions were excluded from the assessed denominator.']::text[]),
    ('MKFRS-2026-6EB12B7B07', array[
      '2 control questions were redirected to an oversight path.',
      'A nonblocking integrity signal remains attached: material_redirected_scope.'
    ]::text[])
)
insert into public.synthetic_score_explainability(
  assessment_id, score_run_id, synthetic_certification_ref, limitation_reasons, cap_effect
)
select a.id, s.id, a.synthetic_certification_ref, target.limitation_reasons,
  case when s.cap_applied then 'band_lowered' when s.cap_reason is not null then 'no_band_change' else 'none' end
from target
join public.assessments a on a.assessment_reference = target.assessment_reference
join public.score_runs s on s.id = a.current_score_run_id
where a.synthetic_demonstration
on conflict (score_run_id) do update set
  limitation_reasons = excluded.limitation_reasons,
  cap_effect = excluded.cap_effect,
  synthetic_certification_ref = excluded.synthetic_certification_ref;

insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
select 'admin',
  (select id from public.admin_profiles where status = 'active' and role = 'platform_admin' order by created_at asc limit 1),
  a.id, 'score_runs', s.id, 'synthetic_explainability_metadata_backfilled',
  jsonb_build_object('score_run_id', s.id, 'assessment_reference', a.assessment_reference,
    'limitation_reasons', e.limitation_reasons,
    'cap_effect', e.cap_effect,
    'score_values_changed', false)
from public.assessments a
join public.score_runs s on s.id = a.current_score_run_id
join public.synthetic_score_explainability e on e.score_run_id = s.id
where a.assessment_reference in ('MKFRS-2026-DE94607709','MKFRS-2026-80B6B23791','MKFRS-2026-A68F8A2017','MKFRS-2026-6EB12B7B07');

commit;

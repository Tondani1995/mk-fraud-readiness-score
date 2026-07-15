-- MK Fraud Readiness Score V1 - canonical atomic Phase 14 disabled foundation.
-- Generated from the reviewed historical blobs archived under docs/v1/phase14/migration-audit-archive.
-- No gate, feature policy, AI route, secret, identity or external operation is enabled here.
begin;

-- BEGIN ARCHIVED SOURCE: uat-applied/0017_phase14_autonomous_report_engine.sql
-- MK Fraud Readiness Score V1 - Phase 14 autonomous premium report engine
-- Additive operational state for idempotent report fulfilment and generation provenance.
-- All automation flags remain disabled until controlled UAT and production approval.


create table if not exists public.report_fulfilments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  score_run_id uuid not null references public.score_runs(id) on delete restrict,
  report_id uuid references public.reports(id) on delete set null,
  idempotency_key text not null,
  trigger_source text not null check (trigger_source in ('payment_confirmation', 'admin_generate', 'admin_retry', 'admin_regenerate')),
  status text not null default 'queued' check (status in (
    'queued',
    'assembling',
    'generating',
    'validating',
    'rendering',
    'storing',
    'ready_for_delivery',
    'completed',
    'failed',
    'cancelled'
  )),
  current_step text,
  generation_mode text check (generation_mode is null or generation_mode in ('ai', 'ai_repair', 'deterministic_fallback')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  workflow_start_status text not null default 'not_started' check (workflow_start_status in ('not_started', 'starting', 'started', 'failed')),
  workflow_run_id text,
  workflow_started_at timestamptz,
  workflow_start_error text,
  last_error_code text,
  last_error_message text,
  requested_by_admin_user_id uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_fulfilments_idempotency_key_unique unique (idempotency_key)
);

create unique index if not exists report_fulfilments_one_active_order_uidx
  on public.report_fulfilments(order_id)
  where status in ('queued', 'assembling', 'generating', 'validating', 'rendering', 'storing', 'ready_for_delivery');
create unique index if not exists report_fulfilments_workflow_run_uidx
  on public.report_fulfilments(workflow_run_id)
  where workflow_run_id is not null;
create index if not exists report_fulfilments_workflow_start_idx
  on public.report_fulfilments(workflow_start_status, created_at desc);
create index if not exists report_fulfilments_status_created_idx
  on public.report_fulfilments(status, created_at desc);
create index if not exists report_fulfilments_assessment_idx
  on public.report_fulfilments(assessment_id);
create index if not exists report_fulfilments_score_run_idx
  on public.report_fulfilments(score_run_id);
create index if not exists report_fulfilments_report_idx
  on public.report_fulfilments(report_id);

create table if not exists public.report_generation_runs (
  id uuid primary key default gen_random_uuid(),
  fulfilment_id uuid not null references public.report_fulfilments(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  attempt_number integer not null check (attempt_number > 0),
  generation_mode text not null check (generation_mode in ('ai', 'ai_repair', 'deterministic_fallback')),
  provider text,
  model text,
  prompt_version text not null,
  schema_version text not null,
  evidence_checksum text not null,
  evidence_snapshot_json jsonb not null default '{}'::jsonb,
  structured_output_json jsonb,
  validation_result_json jsonb not null default '{}'::jsonb,
  validation_errors_json jsonb not null default '[]'::jsonb,
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  output_token_count integer check (output_token_count is null or output_token_count >= 0),
  total_token_count integer check (total_token_count is null or total_token_count >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  status text not null check (status in ('started', 'validated', 'rejected', 'failed', 'used')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint report_generation_runs_fulfilment_attempt_unique unique (fulfilment_id, attempt_number)
);

create index if not exists report_generation_runs_fulfilment_created_idx
  on public.report_generation_runs(fulfilment_id, created_at desc);
create index if not exists report_generation_runs_report_idx
  on public.report_generation_runs(report_id);
create index if not exists report_generation_runs_status_idx
  on public.report_generation_runs(status);

alter table public.reports
  add column if not exists fulfilment_id uuid references public.report_fulfilments(id) on delete set null,
  add column if not exists generation_run_id uuid references public.report_generation_runs(id) on delete set null;

create index if not exists reports_fulfilment_idx on public.reports(fulfilment_id);
create index if not exists reports_generation_run_idx on public.reports(generation_run_id);

alter table public.report_fulfilments enable row level security;
alter table public.report_generation_runs enable row level security;

revoke all on table public.report_fulfilments from anon, authenticated;
revoke all on table public.report_generation_runs from anon, authenticated;
grant select on table public.report_fulfilments to authenticated;
grant select on table public.report_generation_runs to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'report_fulfilments'
      and policyname = 'report_fulfilments_admin_select'
  ) then
    create policy report_fulfilments_admin_select on public.report_fulfilments
      for select using (
        public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'report_generation_runs'
      and policyname = 'report_generation_runs_admin_select'
  ) then
    create policy report_generation_runs_admin_select on public.report_generation_runs
      for select using (
        public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin')
      );
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_report_fulfilments_updated_at'
  ) then
    create trigger trg_report_fulfilments_updated_at
      before update on public.report_fulfilments
      for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.app_settings (setting_key, value_json)
values (
  'phase14_autonomous_report_engine',
  '{
    "status":"foundation_only",
    "premium_report_auto_fulfilment_enabled":false,
    "premium_report_ai_narrative_enabled":false,
    "premium_report_auto_email_enabled":false,
    "premium_report_test_recipient_override":null,
    "premium_report_ai_model":"openai/gpt-5.5",
    "premium_report_prompt_version":"mk-premium-report-v1",
    "premium_report_schema_version":"mk-premium-narrative-v1",
    "routine_human_approval_required":false,
    "deterministic_scoring_authoritative":true,
    "r50000_automation_enabled":false
  }'::jsonb
)
on conflict (setting_key) do update
set value_json = excluded.value_json,
    updated_at = now();

-- END ARCHIVED SOURCE: uat-applied/0017_phase14_autonomous_report_engine.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/0018_phase14_pdf_email_delivery.sql
-- Phase 14B: idempotent PDF email delivery and provider webhook state.


alter table public.email_events
  add column if not exists provider_event_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_updated_at timestamptz,
  add column if not exists attempt_number integer not null default 1;

create unique index if not exists email_events_provider_event_uidx
  on public.email_events(provider_event_id)
  where provider_event_id is not null;

create index if not exists email_events_report_status_idx
  on public.email_events(report_id, status, created_at desc)
  where report_id is not null;

create index if not exists email_events_provider_message_idx
  on public.email_events(provider_message_id)
  where provider_message_id is not null;

-- END ARCHIVED SOURCE: uat-applied/0018_phase14_pdf_email_delivery.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/0019_phase14_email_delivery_state_hardening.sql
-- Phase 14 email delivery state hardening.
-- Preserve every provider webhook event so retries and out-of-order delivery cannot regress the current email state.


create table if not exists public.email_provider_events (
  id uuid primary key default gen_random_uuid(),
  email_event_id uuid not null references public.email_events(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_message_id text not null,
  event_type text not null,
  event_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  payload_json jsonb not null default '{}'::jsonb,
  constraint email_provider_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists email_provider_events_email_event_idx
  on public.email_provider_events(email_event_id, received_at desc);
create index if not exists email_provider_events_message_idx
  on public.email_provider_events(provider, provider_message_id, received_at desc);
create index if not exists email_provider_events_unprocessed_idx
  on public.email_provider_events(received_at)
  where processed_at is null;

alter table public.email_provider_events enable row level security;
revoke all on table public.email_provider_events from anon, authenticated;
grant select on table public.email_provider_events to authenticated;

create policy email_provider_events_admin_select on public.email_provider_events
  for select using (
    public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin')
  );

-- END ARCHIVED SOURCE: uat-applied/0019_phase14_email_delivery_state_hardening.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/0020_phase14_privileged_function_grants.sql
-- Phase 14 database-security hardening.
-- Restrict direct execution of high-risk SECURITY DEFINER RPCs to the
-- server-side service role while preserving authenticated execution of admin
-- RLS helper functions used by MK administrator policies. The DO block keeps
-- this migration as one prepared statement for Supabase CLI 2.81.3 clean replay
-- while still using explicit REVOKE, GRANT and COMMENT commands.

DO $$
BEGIN
  EXECUTE 'revoke execute on function public.check_rate_limit(text, integer, integer) from public';
  EXECUTE 'revoke execute on function public.check_rate_limit(text, integer, integer) from anon';
  EXECUTE 'revoke execute on function public.check_rate_limit(text, integer, integer) from authenticated';
  EXECUTE 'grant execute on function public.check_rate_limit(text, integer, integer) to service_role';

  EXECUTE 'revoke execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) from public';
  EXECUTE 'revoke execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) from anon';
  EXECUTE 'revoke execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) from authenticated';
  EXECUTE 'grant execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) to service_role';

  EXECUTE 'revoke execute on function public.current_admin_role() from public';
  EXECUTE 'revoke execute on function public.current_admin_role() from anon';
  EXECUTE 'grant execute on function public.current_admin_role() to authenticated';
  EXECUTE 'grant execute on function public.current_admin_role() to service_role';

  EXECUTE 'revoke execute on function public.is_admin_role(public.admin_role[]) from public';
  EXECUTE 'revoke execute on function public.is_admin_role(public.admin_role[]) from anon';
  EXECUTE 'grant execute on function public.is_admin_role(public.admin_role[]) to authenticated';
  EXECUTE 'grant execute on function public.is_admin_role(public.admin_role[]) to service_role';

  EXECUTE 'comment on function public.check_rate_limit(text, integer, integer) is ''Atomic fixed-window rate limiter. Direct execution is restricted to the service role; application calls must go through trusted server-side code.''';
  EXECUTE 'comment on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) is ''Atomic score-run persistence RPC. Direct execution is restricted to the service role; assessment scoring must go through trusted server-side code.''';
  EXECUTE 'comment on function public.current_admin_role() is ''Admin-role helper for authenticated MK administrator RLS evaluation. Anonymous execution is revoked; authenticated and service-role execution is required for admin policies.''';
  EXECUTE 'comment on function public.is_admin_role(public.admin_role[]) is ''Admin-role predicate for authenticated MK administrator RLS evaluation. Anonymous execution is revoked; authenticated and service-role execution is required for admin policies.''';
END
$$;
-- END ARCHIVED SOURCE: uat-applied/0020_phase14_privileged_function_grants.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/0021_phase14_adversarial_remediation.sql
-- Phase 14 adversarial remediation.
-- Transactional entitlement, generation publication, durable provider state and webhook CAS.


create table public.report_generation_claims (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  report_type public.report_type not null,
  claim_token uuid not null default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  score_run_id uuid not null references public.score_runs(id) on delete restrict,
  fulfilment_id uuid references public.report_fulfilments(id) on delete set null,
  claim_owner text not null,
  report_id uuid references public.reports(id) on delete set null,
  version_number integer not null check (version_number > 0),
  report_reference text not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (assessment_id, report_type),
  constraint report_generation_claims_token_unique unique (claim_token),
  constraint report_generation_claims_reference_unique unique (report_reference)
);

create index report_generation_claims_lease_idx
  on public.report_generation_claims(lease_expires_at);
alter table public.report_generation_claims enable row level security;
revoke all on table public.report_generation_claims from public, anon, authenticated;

create table public.report_ai_attempts (
  id uuid primary key default gen_random_uuid(),
  generation_identity text not null,
  fulfilment_id uuid references public.report_fulfilments(id) on delete set null,
  attempt_kind text not null check (attempt_kind in ('generate', 'repair')),
  attempt_number integer not null check (attempt_number between 1 and 2),
  provider_request_key text not null,
  provider text not null,
  model text not null,
  evidence_checksum text not null check (evidence_checksum ~ '^[0-9a-f]{64}$'),
  max_output_tokens integer not null check (max_output_tokens between 1 and 5000),
  max_estimated_cost_micros bigint not null check (max_estimated_cost_micros between 1 and 1000000),
  timeout_ms integer not null check (timeout_ms between 1000 and 120000),
  status text not null check (status in ('started', 'succeeded', 'failed_before_provider', 'provider_result_uncertain', 'reconciliation_required')),
  output_json jsonb,
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  output_token_count integer check (output_token_count is null or output_token_count >= 0),
  total_token_count integer check (total_token_count is null or total_token_count >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_ai_attempts_identity_attempt_unique unique (generation_identity, attempt_kind, attempt_number),
  constraint report_ai_attempts_provider_request_unique unique (provider_request_key)
);

create index report_ai_attempts_fulfilment_idx
  on public.report_ai_attempts(fulfilment_id, created_at desc);
create index report_ai_attempts_reconciliation_idx
  on public.report_ai_attempts(created_at)
  where status in ('provider_result_uncertain', 'reconciliation_required');
alter table public.report_ai_attempts enable row level security;
revoke all on table public.report_ai_attempts from public, anon, authenticated;
grant select on table public.report_ai_attempts to authenticated;

create policy report_ai_attempts_admin_select on public.report_ai_attempts
  for select using (
    public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin')
  );

alter table public.email_events
  add column if not exists provider_request_key text,
  add column if not exists provider_idempotency_key text,
  add column if not exists send_lease_token uuid,
  add column if not exists send_lease_expires_at timestamptz,
  add column if not exists reconciliation_required_at timestamptz,
  add column if not exists reconciliation_attempted_at timestamptz,
  add column if not exists reconciliation_result_json jsonb not null default '{}'::jsonb;

create unique index email_events_provider_request_uidx
  on public.email_events(provider_request_key)
  where provider_request_key is not null;
create index email_events_stale_send_lease_idx
  on public.email_events(send_lease_expires_at)
  where status = 'sending';

alter table public.email_provider_events
  alter column email_event_id drop not null;

insert into public.app_settings(setting_key, value_json)
values (
  'phase14_delivery_policy',
  '{
    "premium_report_manual_delivery_enabled":false,
    "premium_report_test_recipient_override_enabled":false,
    "provider_reconciliation_required_before_resend":true,
    "mfa_enforcement_gate":"required_before_production_enablement",
    "provider_data_minimisation_gate":"required_before_production_enablement"
  }'::jsonb
)
on conflict (setting_key) do update
set value_json = excluded.value_json,
    updated_at = now();

create or replace function public.assert_premium_report_generation_entitlement(
  p_order_reference text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score_run public.score_runs%rowtype;
  v_product public.products%rowtype;
  v_expected_domains integer;
  v_actual_domains integer;
  v_expected_traces integer;
  v_actual_traces integer;
begin
  select o.* into v_order
  from public.orders o
  where o.order_reference = p_order_reference
  for share;
  if not found then raise exception 'order_not_found'; end if;

  select a.* into v_assessment
  from public.assessments a
  where a.id = v_order.assessment_id
  for share;
  if not found then raise exception 'order_assessment_mismatch'; end if;

  select p.* into v_product
  from public.products p
  where p.id = v_order.product_id
  for share;
  if not found then raise exception 'order_product_mismatch'; end if;

  if v_assessment.current_score_run_id is null then raise exception 'assessment_not_scored'; end if;
  select sr.* into v_score_run
  from public.score_runs sr
  where sr.id = v_assessment.current_score_run_id
  for share;
  if not found then raise exception 'current_score_run_missing'; end if;

  if v_order.assessment_id <> v_assessment.id then raise exception 'order_assessment_mismatch'; end if;
  if v_score_run.assessment_id <> v_assessment.id then raise exception 'score_run_assessment_mismatch'; end if;
  if v_assessment.current_score_run_id <> v_score_run.id then raise exception 'stale_current_score_reference'; end if;
  if v_order.status::text <> 'payment_received' then raise exception 'order_not_payment_received'; end if;
  if v_order.verified_at is null then raise exception 'order_missing_verified_at'; end if;
  if v_order.verified_by is null then raise exception 'order_missing_verified_by'; end if;
  if v_product.product_code <> 'essential_self_assessment' then raise exception 'product_not_essential'; end if;
  if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then raise exception 'essential_price_mismatch'; end if;
  if v_order.currency <> 'ZAR' or v_product.currency <> 'ZAR' then raise exception 'essential_currency_mismatch'; end if;
  if not v_product.active then raise exception 'essential_product_inactive'; end if;
  if not v_product.requires_payment_verification then raise exception 'manual_verification_not_required'; end if;
  if v_product.delivery_mode <> 'mk_controlled_pdf' then raise exception 'unsupported_delivery_mode'; end if;
  if v_score_run.status::text <> 'completed' then raise exception 'score_run_not_completed'; end if;
  if v_score_run.locked_at is null then raise exception 'score_run_not_locked'; end if;
  if v_score_run.input_hash is null or v_score_run.input_hash !~ '^[0-9a-f]{64}$' then raise exception 'score_run_input_hash_invalid'; end if;

  select count(*) into v_expected_domains
  from public.domains d
  where d.methodology_version_id = v_score_run.methodology_version_id;
  select count(distinct sdr.domain_id) into v_actual_domains
  from public.score_domain_results sdr
  join public.domains d on d.id = sdr.domain_id
  where sdr.score_run_id = v_score_run.id
    and d.methodology_version_id = v_score_run.methodology_version_id;
  if v_expected_domains = 0 or v_actual_domains <> v_expected_domains then
    raise exception 'score_run_domain_results_incomplete:%/%', v_actual_domains, v_expected_domains;
  end if;

  select count(*) into v_expected_traces
  from public.questions q
  where q.methodology_version_id = v_score_run.methodology_version_id and q.active;
  select count(distinct sqt.question_id) into v_actual_traces
  from public.score_question_traces sqt
  join public.questions q on q.id = sqt.question_id
  where sqt.score_run_id = v_score_run.id
    and q.methodology_version_id = v_score_run.methodology_version_id
    and q.active;
  if v_expected_traces = 0 or v_actual_traces <> v_expected_traces then
    raise exception 'score_run_question_traces_incomplete:%/%', v_actual_traces, v_expected_traces;
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'assessment_id', v_assessment.id,
    'score_run_id', v_score_run.id,
    'product_id', v_product.id,
    'expected_domain_count', v_expected_domains,
    'actual_domain_count', v_actual_domains,
    'expected_trace_count', v_expected_traces,
    'actual_trace_count', v_actual_traces
  );
end;
$$;

create or replace function public.claim_premium_report_generation(
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid default null,
  p_report_type public.report_type default 'essential_self_assessment'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_claim public.report_generation_claims%rowtype;
  v_version integer;
  v_assessment_reference text;
  v_current public.reports%rowtype;
begin
  if coalesce(trim(p_claim_owner), '') = '' then raise exception 'generation_claim_owner_required'; end if;
  v_context := public.assert_premium_report_generation_entitlement(p_order_reference);
  if p_report_type <> 'essential_self_assessment' then raise exception 'unsupported_report_type'; end if;

  perform pg_advisory_xact_lock(hashtextextended((v_context->>'assessment_id') || ':' || p_report_type::text, 0));
  delete from public.report_generation_claims
  where assessment_id = (v_context->>'assessment_id')::uuid
    and report_type = p_report_type
    and lease_expires_at < now()
    and report_id is null;

  select * into v_claim
  from public.report_generation_claims
  where assessment_id = (v_context->>'assessment_id')::uuid
    and report_type = p_report_type
  for update;

  if found then
    return jsonb_build_object(
      'claimed', v_claim.claim_owner = p_claim_owner,
      'claim_token', case when v_claim.claim_owner = p_claim_owner then v_claim.claim_token else null end,
      'version_number', v_claim.version_number,
      'report_reference', v_claim.report_reference,
      'report_id', v_claim.report_id,
      'lease_expires_at', v_claim.lease_expires_at,
      'reason', case when v_claim.claim_owner = p_claim_owner then 'same_owner_resume' else 'generation_in_progress' end
    );
  end if;

  select * into v_current
  from public.reports r
  where r.assessment_id = (v_context->>'assessment_id')::uuid
    and r.report_type = p_report_type
    and r.status not in ('superseded', 'voided', 'draft')
  order by r.version_number desc
  limit 1
  for update;

  select coalesce(max(r.version_number), 0) + 1 into v_version
  from public.reports r
  where r.assessment_id = (v_context->>'assessment_id')::uuid
    and r.report_type = p_report_type;
  select a.assessment_reference into v_assessment_reference
  from public.assessments a where a.id = (v_context->>'assessment_id')::uuid;

  insert into public.report_generation_claims(
    assessment_id, report_type, order_id, score_run_id, fulfilment_id, claim_owner,
    version_number, report_reference, lease_expires_at
  ) values (
    (v_context->>'assessment_id')::uuid, p_report_type,
    (v_context->>'order_id')::uuid, (v_context->>'score_run_id')::uuid, p_fulfilment_id, p_claim_owner,
    v_version, 'RPT-' || v_assessment_reference || '-V' || v_version, now() + interval '20 minutes'
  ) returning * into v_claim;

  return jsonb_build_object(
    'claimed', true,
    'claim_token', v_claim.claim_token,
    'version_number', v_claim.version_number,
    'report_reference', v_claim.report_reference,
    'report_id', null,
    'current_report_id', v_current.id,
    'lease_expires_at', v_claim.lease_expires_at,
    'reason', 'claimed'
  );
end;
$$;

create or replace function public.commit_premium_report_draft(
  p_claim_token uuid,
  p_template_id uuid,
  p_storage_bucket text,
  p_temp_storage_path text,
  p_checksum text,
  p_generated_by uuid default null,
  p_generation_run_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.report_generation_claims%rowtype;
  v_report_id uuid;
  v_supersedes uuid;
begin
  select * into v_claim from public.report_generation_claims
  where claim_token = p_claim_token for update;
  if not found then raise exception 'generation_claim_missing'; end if;
  if v_claim.lease_expires_at < now() then raise exception 'generation_claim_expired'; end if;
  if p_checksum !~ '^[0-9a-f]{64}$' then raise exception 'report_checksum_invalid'; end if;
  if p_temp_storage_path not like 'tmp/%' then raise exception 'temporary_storage_path_required'; end if;
  if v_claim.report_id is not null then return v_claim.report_id; end if;

  select r.id into v_supersedes
  from public.reports r
  where r.assessment_id = v_claim.assessment_id
    and r.report_type = v_claim.report_type
    and r.status not in ('superseded', 'voided', 'draft')
  order by r.version_number desc
  limit 1
  for update;

  insert into public.reports(
    assessment_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum,
    generated_by, generated_at, supersedes_report_id, fulfilment_id, generation_run_id
  ) values (
    v_claim.assessment_id, v_claim.order_id, v_claim.score_run_id, p_template_id,
    v_claim.report_type, 'draft', v_claim.report_reference, v_claim.version_number,
    p_storage_bucket, p_temp_storage_path, p_checksum, p_generated_by, now(),
    v_supersedes, v_claim.fulfilment_id, p_generation_run_id
  ) returning id into v_report_id;

  update public.report_generation_claims
  set report_id = v_report_id, updated_at = now()
  where claim_token = p_claim_token;
  return v_report_id;
end;
$$;

create or replace function public.publish_premium_report_generation(
  p_claim_token uuid,
  p_report_id uuid,
  p_final_storage_path text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.report_generation_claims%rowtype;
  v_report public.reports%rowtype;
begin
  select * into v_claim from public.report_generation_claims
  where claim_token = p_claim_token for update;
  if not found or v_claim.report_id <> p_report_id then raise exception 'generation_claim_report_mismatch'; end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.status <> 'draft' then raise exception 'report_draft_missing'; end if;
  if p_final_storage_path like 'tmp/%' or p_final_storage_path = '' then raise exception 'final_storage_path_invalid'; end if;

  if v_report.supersedes_report_id is not null then
    update public.reports set status = 'superseded'
    where id = v_report.supersedes_report_id
      and status not in ('voided', 'superseded');
  end if;
  update public.reports
  set status = 'generated', storage_path = p_final_storage_path, updated_at = now()
  where id = p_report_id;
  delete from public.report_generation_claims where claim_token = p_claim_token;

  return jsonb_build_object(
    'report_id', p_report_id,
    'report_reference', v_report.report_reference,
    'version_number', v_report.version_number,
    'superseded_report_id', v_report.supersedes_report_id
  );
end;
$$;

create or replace function public.release_premium_report_generation_claim(p_claim_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.report_generation_claims
  where claim_token = p_claim_token and report_id is null;
  return found;
end;
$$;

create or replace function public.assert_premium_report_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_assessment public.assessments%rowtype;
  v_score_run public.score_runs%rowtype;
  v_customer_email text;
  v_current_report_id uuid;
begin
  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception 'report_not_found'; end if;
  select * into v_order from public.orders where id = v_report.order_id for share;
  if not found then raise exception 'report_order_missing'; end if;
  select * into v_product from public.products where id = v_order.product_id for share;
  select * into v_assessment from public.assessments where id = v_report.assessment_id for share;
  select * into v_score_run from public.score_runs where id = v_report.score_run_id for share;

  select r.id into v_current_report_id
  from public.reports r
  where r.assessment_id = v_report.assessment_id
    and r.report_type = v_report.report_type
    and r.status not in ('superseded', 'voided', 'draft')
  order by r.version_number desc limit 1;

  if v_report.report_type <> 'essential_self_assessment' then raise exception 'delivery_report_type_ineligible'; end if;
  if v_product.product_code <> 'essential_self_assessment' then raise exception 'delivery_product_ineligible'; end if;
  if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then raise exception 'delivery_price_mismatch'; end if;
  if v_order.currency <> 'ZAR' or v_product.currency <> 'ZAR' then raise exception 'delivery_currency_mismatch'; end if;
  if v_order.status::text <> 'payment_received' then raise exception 'delivery_order_not_paid'; end if;
  if v_order.verified_at is null or v_order.verified_by is null then raise exception 'delivery_manual_verification_missing'; end if;
  if not v_product.active or not v_product.requires_payment_verification or v_product.delivery_mode <> 'mk_controlled_pdf' then raise exception 'delivery_product_policy_mismatch'; end if;
  if v_report.assessment_id <> v_order.assessment_id or v_score_run.assessment_id <> v_assessment.id then raise exception 'delivery_relationship_mismatch'; end if;
  if v_assessment.current_score_run_id <> v_score_run.id then raise exception 'delivery_stale_score_run'; end if;
  if v_score_run.status::text <> 'completed' or v_score_run.locked_at is null or v_score_run.input_hash is null or v_score_run.input_hash !~ '^[0-9a-f]{64}$' then raise exception 'delivery_score_run_ineligible'; end if;
  if v_report.status in ('draft', 'superseded', 'voided') or v_current_report_id is distinct from v_report.id then raise exception 'delivery_report_not_current'; end if;
  if coalesce(v_report.storage_bucket, '') = '' or coalesce(v_report.storage_path, '') = '' or v_report.checksum !~ '^[0-9a-f]{64}$' then raise exception 'delivery_storage_metadata_invalid'; end if;

  v_customer_email := lower(trim(v_order.customer_email::text));
  if not p_allow_test_override and lower(trim(p_recipient)) is distinct from v_customer_email then
    raise exception 'delivery_recipient_override_forbidden';
  end if;

  return jsonb_build_object(
    'report_id', v_report.id,
    'order_id', v_order.id,
    'assessment_id', v_assessment.id,
    'score_run_id', v_score_run.id,
    'customer_email', v_customer_email,
    'recipient', lower(trim(p_recipient)),
    'test_delivery', lower(trim(p_recipient)) is distinct from v_customer_email
  );
end;
$$;

create or replace function public.recover_stale_premium_report_email_sends()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.email_events
  set status = 'reconciliation_required',
      reconciliation_required_at = coalesce(reconciliation_required_at, now()),
      delivery_updated_at = now(),
      error_message = 'Send lease expired; provider acceptance must be reconciled before retry.'
  where status = 'sending'
    and send_lease_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


create or replace function public.apply_email_provider_event_atomic(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_payload_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email public.email_events%rowtype;
  v_provider_event_id uuid;
  v_status text;
  v_current_rank integer;
  v_incoming_rank integer;
  v_applied boolean := false;
begin
  v_status := case p_event_type
    when 'email.sent' then 'sent'
    when 'email.delivery_delayed' then 'delivery_delayed'
    when 'email.delivered' then 'delivered'
    when 'email.failed' then 'delivery_failed'
    when 'email.bounced' then 'bounced'
    when 'email.suppressed' then 'bounced'
    when 'email.complained' then 'complained'
    else null end;
  if v_status is null then return jsonb_build_object('ignored', true, 'reason', 'unsupported_event'); end if;

  select * into v_email
  from public.email_events
  where provider_message_id = p_provider_message_id
  for update;

  insert into public.email_provider_events(
    email_event_id, provider, provider_event_id, provider_message_id,
    event_type, event_created_at, payload_json
  ) values (
    v_email.id, p_provider, p_provider_event_id, p_provider_message_id,
    p_event_type, p_event_created_at, coalesce(p_payload_json, '{}'::jsonb)
  ) on conflict (provider, provider_event_id) do nothing
  returning id into v_provider_event_id;

  if v_provider_event_id is null then
    return jsonb_build_object('duplicate', true, 'state_updated', false);
  end if;
  if v_email.id is null then
    update public.email_provider_events
    set processing_error = 'unknown_provider_message', processed_at = now()
    where id = v_provider_event_id;
    return jsonb_build_object('ignored', true, 'reason', 'unknown_message');
  end if;

  v_current_rank := case v_email.status
    when 'queued' then 10 when 'sending' then 20
    when 'provider_acceptance_uncertain' then 25 when 'reconciliation_required' then 26
    when 'sent' then 30 when 'delivery_delayed' then 40
    when 'delivered' then 50 when 'failed_before_provider' then 50 when 'delivery_failed' then 60
    when 'bounced' then 60 when 'complained' then 70 else 0 end;
  v_incoming_rank := case v_status
    when 'sent' then 30 when 'delivery_delayed' then 40 when 'delivered' then 50
    when 'failed_before_provider' then 50 when 'delivery_failed' then 60 when 'bounced' then 60 when 'complained' then 70 else 0 end;

  if v_incoming_rank >= v_current_rank
     and (v_email.delivery_updated_at is null or p_event_created_at >= v_email.delivery_updated_at) then
    update public.email_events
    set status = v_status,
        provider_event_id = p_provider_event_id,
        delivered_at = case when v_status = 'delivered' then p_event_created_at else delivered_at end,
        delivery_updated_at = p_event_created_at,
        error_message = case when v_status in ('bounced', 'complained', 'delivery_failed', 'failed_before_provider') then coalesce(p_payload_json->>'reason', v_status) else null end,
        metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
          'last_provider_event_type', p_event_type,
          'last_provider_event_created_at', p_event_created_at
        )
    where id = v_email.id;
    v_applied := true;
  end if;

  update public.email_provider_events
  set processed_at = now(), processing_error = null
  where id = v_provider_event_id;
  return jsonb_build_object('duplicate', false, 'state_updated', v_applied, 'status', v_status);
end;
$$;
-- END ARCHIVED SOURCE: uat-applied/0021_phase14_adversarial_remediation.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/0022_phase14_adversarial_remediation_grants.sql
-- Apply privileged Phase 14 remediation RPC grants as one parser-safe unit.

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.assert_premium_report_generation_entitlement(text)',
    'public.claim_premium_report_generation(text,text,uuid,public.report_type)',
    'public.commit_premium_report_draft(uuid,uuid,text,text,text,uuid,uuid)',
    'public.publish_premium_report_generation(uuid,uuid,text)',
    'public.release_premium_report_generation_claim(uuid)',
    'public.assert_premium_report_delivery_entitlement(uuid,text,boolean)',
    'public.recover_stale_premium_report_email_sends()',
    'public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,jsonb)'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public, anon, authenticated';
    execute 'grant execute on function ' || v_signature || ' to service_role';
  end loop;
end;
$$;
-- END ARCHIVED SOURCE: uat-applied/0022_phase14_adversarial_remediation_grants.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/20260714194317_phase14_security_state_machine_closure.sql
-- Phase 14 security and state-machine closure.
-- This migration is intentionally inert: the database security gate starts below
-- the required version. No report generation, download, delivery, reconciliation,
-- webhook mutation, or AI-backed publication can proceed until an AAL2 platform
-- administrator records the required gate version in a separately authorised step.


create table public.phase14_security_gates (
  gate_key text primary key,
  required_version integer not null check (required_version > 0),
  satisfied_version integer not null default 0 check (satisfied_version >= 0),
  status text not null default 'unsatisfied' check (status in ('unsatisfied', 'satisfied', 'suspended')),
  satisfied_by uuid references public.admin_profiles(id) on delete set null,
  satisfied_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase14_security_gate_consistency check (
    (status = 'satisfied' and satisfied_version >= required_version and satisfied_at is not null)
    or (status <> 'satisfied')
  )
);

insert into public.phase14_security_gates(
  gate_key, required_version, satisfied_version, status, reason
) values (
  'phase14-premium-report', 1, 0, 'unsatisfied',
  'Phase 14 remains technically inert until the security closure is independently approved.'
)
on conflict (gate_key) do update
set required_version = greatest(public.phase14_security_gates.required_version, excluded.required_version),
    satisfied_version = least(public.phase14_security_gates.satisfied_version, excluded.satisfied_version),
    status = 'unsatisfied',
    satisfied_by = null,
    satisfied_at = null,
    reason = excluded.reason,
    updated_at = now();

alter table public.phase14_security_gates enable row level security;
revoke all on table public.phase14_security_gates from public, anon, authenticated;
grant select on table public.phase14_security_gates to authenticated;
create policy phase14_security_gates_admin_select on public.phase14_security_gates
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin'));

create table public.phase14_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  severity text not null check (severity in ('warning', 'critical')),
  category text not null,
  report_id uuid references public.reports(id) on delete set null,
  email_event_id uuid references public.email_events(id) on delete set null,
  detail_json jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.phase14_operational_alerts enable row level security;
revoke all on table public.phase14_operational_alerts from public, anon, authenticated;
grant select on table public.phase14_operational_alerts to authenticated;
create policy phase14_operational_alerts_admin_select on public.phase14_operational_alerts
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin'));

alter table public.report_generation_claims
  add column state text not null default 'claimed',
  add column score_input_hash text,
  add column temporary_storage_bucket text,
  add column temporary_storage_path text,
  add column final_storage_bucket text,
  add column final_storage_path text,
  add column expected_checksum text,
  add column last_heartbeat_at timestamptz not null default now(),
  add column committed_at timestamptz,
  add column recovered_at timestamptz,
  add column recovery_count integer not null default 0,
  add column abandoned_at timestamptz,
  add column abandonment_reason text;

alter table public.report_generation_claims
  add constraint report_generation_claims_state_chk
    check (state in ('claimed', 'committed', 'abandoned')),
  add constraint report_generation_claims_recovery_count_chk check (recovery_count >= 0),
  add constraint report_generation_claims_storage_binding_chk check (
    (state = 'claimed')
    or (state = 'abandoned')
    or (
      state = 'committed'
      and report_id is not null
      and temporary_storage_bucket is not null
      and temporary_storage_path is not null
      and final_storage_bucket is not null
      and final_storage_path is not null
      and expected_checksum ~ '^[0-9a-f]{64}$'
    )
  );

create index report_generation_claims_state_lease_idx
  on public.report_generation_claims(state, lease_expires_at);

alter table public.report_ai_attempts
  add column prompt_version text,
  add column schema_version text,
  add column input_size_bytes integer,
  add column estimated_input_tokens integer,
  add column accounting_status text not null default 'unverified';

alter table public.report_generation_runs
  add column estimated_cost_micros bigint,
  add column accounting_status text not null default 'not_applicable';

alter table public.report_generation_runs
  add constraint report_generation_runs_estimated_cost_chk
    check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  add constraint report_generation_runs_accounting_status_chk
    check (accounting_status in ('not_applicable', 'verified', 'unverified'));

alter table public.report_ai_attempts
  drop constraint report_ai_attempts_identity_attempt_unique,
  drop constraint report_ai_attempts_status_check;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_status_check check (status in (
    'started', 'succeeded', 'accounting_unverified', 'failed_before_provider',
    'provider_result_uncertain', 'reconciliation_required'
  )),
  add constraint report_ai_attempts_accounting_status_chk
    check (accounting_status in ('unverified', 'verified', 'not_applicable')),
  add constraint report_ai_attempts_input_size_chk
    check (input_size_bytes is null or input_size_bytes between 1 and 262144),
  add constraint report_ai_attempts_estimated_input_tokens_chk
    check (estimated_input_tokens is null or estimated_input_tokens between 1 and 65536),
  add constraint report_ai_attempts_full_fingerprint_unique unique (
    generation_identity, evidence_checksum, provider, model,
    prompt_version, schema_version, attempt_kind, attempt_number
  );

alter table public.email_events
  add column provider text not null default 'resend';

drop index if exists public.email_events_provider_message_idx;
create unique index email_events_provider_message_uidx
  on public.email_events(provider, provider_message_id)
  where provider_message_id is not null;

alter table public.email_provider_events
  alter column provider_message_id drop not null,
  add column payload_fingerprint text,
  add column payload_size_bytes integer,
  add column supported_event boolean not null default true,
  add column conflict_detected_at timestamptz;

alter table public.email_provider_events
  add constraint email_provider_events_fingerprint_chk
    check (payload_fingerprint is null or payload_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint email_provider_events_payload_size_chk
    check (payload_size_bytes is null or payload_size_bytes between 0 and 65536);

create table public.report_delivery_authorizations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  report_checksum text not null check (report_checksum ~ '^[0-9a-f]{64}$'),
  recipient_email citext not null,
  order_id uuid not null references public.orders(id) on delete restrict,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  score_run_id uuid not null references public.score_runs(id) on delete restrict,
  security_gate_version integer not null check (security_gate_version > 0),
  authorised_by uuid not null references public.admin_profiles(id) on delete restrict,
  authorised_session_id uuid,
  provider text not null,
  email_event_id uuid not null unique references public.email_events(id) on delete restrict,
  test_delivery boolean not null default false,
  status text not null default 'queued' check (status in (
    'queued', 'claimed', 'dispatching', 'finalized', 'revoked', 'reconciliation_required'
  )),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text,
  revoked_reason text,
  authorised_at timestamptz not null default now(),
  claimed_at timestamptz,
  dispatch_started_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz not null default now()
);

create index report_delivery_authorizations_dispatch_idx
  on public.report_delivery_authorizations(status, authorised_at);
create index report_delivery_authorizations_report_idx
  on public.report_delivery_authorizations(report_id, authorised_at desc);
alter table public.report_delivery_authorizations enable row level security;
revoke all on table public.report_delivery_authorizations from public, anon, authenticated;
grant select on table public.report_delivery_authorizations to authenticated;
create policy report_delivery_authorizations_admin_select on public.report_delivery_authorizations
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin'));

create table public.report_delivery_finalizations (
  authorization_id uuid primary key references public.report_delivery_authorizations(id) on delete restrict,
  email_event_id uuid not null unique references public.email_events(id) on delete restrict,
  report_id uuid not null references public.reports(id) on delete restrict,
  provider text not null,
  provider_message_id text not null,
  finalized_at timestamptz not null default now()
);
alter table public.report_delivery_finalizations enable row level security;
revoke all on table public.report_delivery_finalizations from public, anon, authenticated;
grant select on table public.report_delivery_finalizations to authenticated;
create policy report_delivery_finalizations_admin_select on public.report_delivery_finalizations
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin'));

create or replace function public.phase14_require_actor(
  p_action text,
  p_allowed_roles public.admin_role[],
  p_require_aal2 boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_profile public.admin_profiles%rowtype;
  v_exp bigint;
begin
  if v_user_id is null then raise exception 'phase14_no_session:%', p_action; end if;
  v_exp := nullif(v_claims->>'exp', '')::bigint;
  if v_exp is null or to_timestamp(v_exp) <= now() then
    raise exception 'phase14_session_expired:%', p_action;
  end if;

  select * into v_profile from public.admin_profiles where id = v_user_id;
  if not found then raise exception 'phase14_profile_missing:%', p_action; end if;
  if v_profile.status = 'revoked' then raise exception 'phase14_profile_revoked:%', p_action; end if;
  if v_profile.status <> 'active' then raise exception 'phase14_profile_inactive:%', p_action; end if;
  if not (v_profile.role = any(p_allowed_roles)) then raise exception 'phase14_role_forbidden:%', p_action; end if;
  if p_require_aal2 and coalesce(v_claims->>'aal', 'aal1') <> 'aal2' then
    raise exception 'phase14_aal2_required:%', p_action;
  end if;

  return jsonb_build_object(
    'user_id', v_user_id,
    'role', v_profile.role,
    'aal', coalesce(v_claims->>'aal', 'aal1'),
    'session_id', v_claims->>'session_id'
  );
end;
$$;

create or replace function public.phase14_require_security(
  p_action text,
  p_allowed_roles public.admin_role[] default array['platform_admin']::public.admin_role[],
  p_require_aal2 boolean default true,
  p_allow_service_role boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate public.phase14_security_gates%rowtype;
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_actor jsonb;
begin
  select * into v_gate
  from public.phase14_security_gates
  where gate_key = 'phase14-premium-report'
  for share;
  if not found
     or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version < v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_action;
  end if;

  if p_allow_service_role and v_claims->>'role' = 'service_role' then
    return jsonb_build_object(
      'actor_type', 'service_role',
      'gate_version', v_gate.satisfied_version,
      'action', p_action
    );
  end if;

  v_actor := public.phase14_require_actor(p_action, p_allowed_roles, p_require_aal2);
  return v_actor || jsonb_build_object('gate_version', v_gate.satisfied_version, 'action', p_action);
end;
$$;

create or replace function public.set_phase14_security_gate_version(
  p_satisfied_version integer,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_gate public.phase14_security_gates%rowtype;
begin
  v_actor := public.phase14_require_actor(
    'security_gate_administration', array['platform_admin']::public.admin_role[], true
  );
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_gate_reason_required'; end if;

  update public.phase14_security_gates
  set satisfied_version = p_satisfied_version,
      status = case when p_satisfied_version >= required_version then 'satisfied' else 'unsatisfied' end,
      satisfied_by = (v_actor->>'user_id')::uuid,
      satisfied_at = case when p_satisfied_version >= required_version then now() else null end,
      reason = p_reason,
      updated_at = now()
  where gate_key = 'phase14-premium-report'
  returning * into v_gate;

  insert into public.audit_logs(
    actor_type, actor_user_id, entity_table, action, after_json
  ) values (
    'admin', (v_actor->>'user_id')::uuid, 'phase14_security_gates',
    'phase14_security_gate_changed',
    jsonb_build_object('required_version', v_gate.required_version, 'satisfied_version', v_gate.satisfied_version, 'status', v_gate.status, 'reason', p_reason)
  );
  return to_jsonb(v_gate);
end;
$$;

create or replace function public.guard_phase14_feature_policy_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.setting_key not in ('phase14_autonomous_report_engine', 'phase14_delivery_policy') then
    return new;
  end if;
  if coalesce(auth.jwt()->>'role', '') = '' and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  perform public.phase14_require_security(
    'feature_policy_change', array['platform_admin']::public.admin_role[], true, false
  );
  return new;
end;
$$;

drop trigger if exists trg_guard_phase14_feature_policy_mutation on public.app_settings;
create trigger trg_guard_phase14_feature_policy_mutation
  before insert or update on public.app_settings
  for each row execute function public.guard_phase14_feature_policy_mutation();

create or replace function public.update_phase14_feature_policy(
  p_setting_key text,
  p_value_json jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb;
begin
  if p_setting_key not in ('phase14_autonomous_report_engine', 'phase14_delivery_policy') then
    raise exception 'phase14_feature_policy_key_forbidden';
  end if;
  v_actor := public.phase14_require_security(
    'feature_policy_change', array['platform_admin']::public.admin_role[], true, false
  );
  insert into public.app_settings(setting_key, value_json)
  values (p_setting_key, coalesce(p_value_json, '{}'::jsonb))
  on conflict (setting_key) do update
  set value_json = excluded.value_json, updated_at = now();
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, 'app_settings', 'phase14_feature_policy_changed',
    jsonb_build_object('setting_key', p_setting_key, 'value_json', p_value_json));
  return p_value_json;
end;
$$;

create or replace function public.authorize_phase14_action(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  case p_action
    when 'report_generation' then
      return public.phase14_require_security(
        p_action, array['platform_admin','reviewer','approver']::public.admin_role[], true, false
      );
    when 'report_regeneration' then
      return public.phase14_require_security(
        p_action, array['platform_admin','reviewer','approver']::public.admin_role[], true, false
      );
    when 'report_download' then
      return public.phase14_require_security(
        p_action, array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[], true, false
      );
    when 'email_delivery' then
      return public.phase14_require_security(
        p_action, array['platform_admin','approver']::public.admin_role[], true, false
      );
    when 'email_resend' then
      return public.phase14_require_security(
        p_action, array['platform_admin','approver']::public.admin_role[], true, false
      );
    when 'provider_reconciliation' then
      return public.phase14_require_security(
        p_action, array['platform_admin','approver']::public.admin_role[], true, false
      );
    when 'ai_narrative_generation' then
      return public.phase14_require_security(
        p_action, array['platform_admin','reviewer','approver']::public.admin_role[], true, false
      );
    else
      raise exception 'phase14_action_not_supported:%', p_action;
  end case;
end;
$$;

create or replace function public.phase14_generation_entitlement(
  p_order_reference text,
  p_expected_order_id uuid default null,
  p_expected_assessment_id uuid default null,
  p_expected_score_run_id uuid default null,
  p_expected_input_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score_run public.score_runs%rowtype;
  v_product public.products%rowtype;
  v_expected_domains integer;
  v_actual_domains integer;
  v_expected_traces integer;
  v_actual_traces integer;
begin
  select * into v_order from public.orders where order_reference = p_order_reference for share;
  if not found then raise exception 'order_not_found'; end if;
  select * into v_assessment from public.assessments where id = v_order.assessment_id for share;
  if not found then raise exception 'order_assessment_mismatch'; end if;
  select * into v_product from public.products where id = v_order.product_id for share;
  if not found then raise exception 'order_product_mismatch'; end if;
  if v_assessment.current_score_run_id is null then raise exception 'assessment_not_scored'; end if;
  select * into v_score_run from public.score_runs where id = v_assessment.current_score_run_id for share;
  if not found then raise exception 'current_score_run_missing'; end if;

  if p_expected_order_id is not null and v_order.id <> p_expected_order_id then raise exception 'claim_order_changed'; end if;
  if p_expected_assessment_id is not null and v_assessment.id <> p_expected_assessment_id then raise exception 'claim_assessment_changed'; end if;
  if p_expected_score_run_id is not null and v_score_run.id <> p_expected_score_run_id then raise exception 'claim_score_run_changed'; end if;
  if p_expected_input_hash is not null and v_score_run.input_hash is distinct from p_expected_input_hash then raise exception 'claim_input_hash_changed'; end if;
  if v_order.assessment_id <> v_assessment.id or v_score_run.assessment_id <> v_assessment.id then raise exception 'generation_relationship_mismatch'; end if;
  if v_assessment.current_score_run_id <> v_score_run.id then raise exception 'stale_current_score_reference'; end if;
  if v_order.status::text <> 'payment_received' then raise exception 'order_not_payment_received'; end if;
  if v_order.verified_at is null then raise exception 'order_missing_verified_at'; end if;
  if v_order.verified_by is null then raise exception 'order_missing_verified_by'; end if;
  if v_product.product_code <> 'essential_self_assessment' then raise exception 'product_not_essential'; end if;
  if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then raise exception 'essential_price_mismatch'; end if;
  if v_order.currency <> 'ZAR' or v_product.currency <> 'ZAR' then raise exception 'essential_currency_mismatch'; end if;
  if not v_product.active then raise exception 'essential_product_inactive'; end if;
  if not v_product.requires_payment_verification then raise exception 'manual_verification_not_required'; end if;
  if v_product.delivery_mode <> 'mk_controlled_pdf' then raise exception 'unsupported_delivery_mode'; end if;
  if v_score_run.status::text <> 'completed' then raise exception 'score_run_not_completed'; end if;
  if v_score_run.locked_at is null then raise exception 'score_run_not_locked'; end if;
  if v_score_run.input_hash is null or v_score_run.input_hash !~ '^[0-9a-f]{64}$' then raise exception 'score_run_input_hash_invalid'; end if;

  select count(*) into v_expected_domains from public.domains where methodology_version_id = v_score_run.methodology_version_id;
  select count(distinct sdr.domain_id) into v_actual_domains
  from public.score_domain_results sdr join public.domains d on d.id = sdr.domain_id
  where sdr.score_run_id = v_score_run.id and d.methodology_version_id = v_score_run.methodology_version_id;
  if v_expected_domains = 0 or v_actual_domains <> v_expected_domains then
    raise exception 'score_run_domain_results_incomplete:%/%', v_actual_domains, v_expected_domains;
  end if;

  select count(*) into v_expected_traces from public.questions
  where methodology_version_id = v_score_run.methodology_version_id and active;
  select count(distinct sqt.question_id) into v_actual_traces
  from public.score_question_traces sqt join public.questions q on q.id = sqt.question_id
  where sqt.score_run_id = v_score_run.id and q.methodology_version_id = v_score_run.methodology_version_id and q.active;
  if v_expected_traces = 0 or v_actual_traces <> v_expected_traces then
    raise exception 'score_run_question_traces_incomplete:%/%', v_actual_traces, v_expected_traces;
  end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'assessment_id', v_assessment.id,
    'score_run_id', v_score_run.id, 'score_input_hash', v_score_run.input_hash,
    'product_id', v_product.id, 'expected_domain_count', v_expected_domains,
    'actual_domain_count', v_actual_domains, 'expected_trace_count', v_expected_traces,
    'actual_trace_count', v_actual_traces
  );
end;
$$;

create or replace function public.assert_premium_report_generation_entitlement(p_order_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  return public.phase14_generation_entitlement(p_order_reference);
end;
$$;

create or replace function public.claim_premium_report_generation(
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid default null,
  p_report_type public.report_type default 'essential_self_assessment'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_claim public.report_generation_claims%rowtype;
  v_version integer;
  v_assessment_reference text;
  v_current public.reports%rowtype;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  if coalesce(trim(p_claim_owner), '') = '' then raise exception 'generation_claim_owner_required'; end if;
  if p_report_type <> 'essential_self_assessment' then raise exception 'unsupported_report_type'; end if;
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform pg_advisory_xact_lock(hashtextextended((v_context->>'assessment_id') || ':' || p_report_type::text, 0));

  select * into v_claim from public.report_generation_claims
  where assessment_id = (v_context->>'assessment_id')::uuid and report_type = p_report_type
  for update;
  if found then
    if v_claim.lease_expires_at >= now() then
      return jsonb_build_object(
        'claimed', v_claim.claim_owner = p_claim_owner,
        'claim_token', case when v_claim.claim_owner = p_claim_owner then v_claim.claim_token else null end,
        'version_number', v_claim.version_number, 'report_reference', v_claim.report_reference,
        'report_id', v_claim.report_id, 'state', v_claim.state,
        'lease_expires_at', v_claim.lease_expires_at,
        'reason', case when v_claim.claim_owner = p_claim_owner then 'same_owner_resume' else 'generation_in_progress' end
      );
    end if;
    if v_claim.state = 'committed' and v_claim.report_id is not null then
      return jsonb_build_object(
        'claimed', false, 'recoverable', true, 'claim_token', null,
        'version_number', v_claim.version_number, 'report_reference', v_claim.report_reference,
        'report_id', v_claim.report_id, 'state', v_claim.state,
        'lease_expires_at', v_claim.lease_expires_at, 'reason', 'committed_draft_recovery_required'
      );
    end if;
    update public.report_generation_claims
    set claim_token = gen_random_uuid(), claim_owner = p_claim_owner,
        order_id = (v_context->>'order_id')::uuid,
        score_run_id = (v_context->>'score_run_id')::uuid,
        score_input_hash = v_context->>'score_input_hash', fulfilment_id = p_fulfilment_id,
        state = 'claimed', lease_expires_at = now() + interval '20 minutes',
        last_heartbeat_at = now(), updated_at = now()
    where assessment_id = v_claim.assessment_id and report_type = v_claim.report_type
    returning * into v_claim;
    return jsonb_build_object(
      'claimed', true, 'claim_token', v_claim.claim_token, 'version_number', v_claim.version_number,
      'report_reference', v_claim.report_reference, 'report_id', null, 'state', v_claim.state,
      'lease_expires_at', v_claim.lease_expires_at, 'reason', 'expired_claim_takeover'
    );
  end if;

  select * into v_current from public.reports
  where assessment_id = (v_context->>'assessment_id')::uuid and report_type = p_report_type
    and status not in ('superseded','voided','draft')
  order by version_number desc limit 1 for update;
  select coalesce(max(version_number), 0) + 1 into v_version from public.reports
  where assessment_id = (v_context->>'assessment_id')::uuid and report_type = p_report_type;
  select assessment_reference into v_assessment_reference from public.assessments
  where id = (v_context->>'assessment_id')::uuid;

  insert into public.report_generation_claims(
    assessment_id, report_type, order_id, score_run_id, score_input_hash, fulfilment_id,
    claim_owner, version_number, report_reference, lease_expires_at, state
  ) values (
    (v_context->>'assessment_id')::uuid, p_report_type, (v_context->>'order_id')::uuid,
    (v_context->>'score_run_id')::uuid, v_context->>'score_input_hash', p_fulfilment_id,
    p_claim_owner, v_version, 'RPT-' || v_assessment_reference || '-V' || v_version,
    now() + interval '20 minutes', 'claimed'
  ) returning * into v_claim;
  return jsonb_build_object(
    'claimed', true, 'claim_token', v_claim.claim_token, 'version_number', v_claim.version_number,
    'report_reference', v_claim.report_reference, 'report_id', null,
    'current_report_id', v_current.id, 'state', v_claim.state,
    'lease_expires_at', v_claim.lease_expires_at, 'reason', 'claimed'
  );
end;
$$;

create or replace function public.renew_premium_report_generation_lease(p_claim_token uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_expiry timestamptz;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  update public.report_generation_claims
  set lease_expires_at = now() + interval '20 minutes', last_heartbeat_at = now(), updated_at = now()
  where claim_token = p_claim_token and state in ('claimed','committed') and lease_expires_at >= now()
  returning lease_expires_at into v_expiry;
  if v_expiry is null then raise exception 'generation_claim_not_renewable'; end if;
  return v_expiry;
end;
$$;

create or replace function public.recover_premium_report_generation_claim(
  p_order_reference text,
  p_claim_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_context jsonb; v_claim public.report_generation_claims%rowtype;
begin
  v_actor := public.phase14_require_security(
    'report_regeneration', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  if coalesce(trim(p_claim_owner), '') = '' then raise exception 'generation_claim_owner_required'; end if;
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform pg_advisory_xact_lock(hashtextextended((v_context->>'assessment_id') || ':essential_self_assessment', 0));
  select * into v_claim from public.report_generation_claims
  where assessment_id = (v_context->>'assessment_id')::uuid and report_type = 'essential_self_assessment'
  for update;
  if not found or v_claim.state <> 'committed' or v_claim.report_id is null then raise exception 'committed_draft_not_recoverable'; end if;
  if v_claim.lease_expires_at >= now() then raise exception 'generation_claim_still_active'; end if;
  perform public.phase14_generation_entitlement(
    p_order_reference, v_claim.order_id, v_claim.assessment_id, v_claim.score_run_id, v_claim.score_input_hash
  );
  update public.report_generation_claims
  set claim_token = gen_random_uuid(), claim_owner = p_claim_owner,
      lease_expires_at = now() + interval '20 minutes', last_heartbeat_at = now(),
      recovered_at = now(), recovery_count = recovery_count + 1, updated_at = now()
  where assessment_id = v_claim.assessment_id and report_type = v_claim.report_type
  returning * into v_claim;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, v_claim.assessment_id, 'report_generation_claims', v_claim.report_id,
    'committed_report_draft_recovered', jsonb_build_object('claim_owner', p_claim_owner, 'recovery_count', v_claim.recovery_count));
  return jsonb_build_object(
    'claimed', true, 'claim_token', v_claim.claim_token, 'report_id', v_claim.report_id,
    'report_reference', v_claim.report_reference, 'version_number', v_claim.version_number,
    'state', v_claim.state, 'lease_expires_at', v_claim.lease_expires_at,
    'reason', 'committed_draft_recovered'
  );
end;
$$;

create or replace function public.commit_premium_report_draft(
  p_claim_token uuid,
  p_template_id uuid,
  p_storage_bucket text,
  p_temp_storage_path text,
  p_checksum text,
  p_generated_by uuid default null,
  p_generation_run_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.report_generation_claims%rowtype;
  v_report_id uuid;
  v_supersedes uuid;
  v_assessment_reference text;
  v_order_reference text;
  v_final_path text;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token for update;
  if not found then raise exception 'generation_claim_missing'; end if;
  if v_claim.lease_expires_at < now() then raise exception 'generation_claim_expired'; end if;
  select order_reference into v_order_reference from public.orders where id = v_claim.order_id;
  perform public.phase14_generation_entitlement(
    v_order_reference, v_claim.order_id, v_claim.assessment_id, v_claim.score_run_id, v_claim.score_input_hash
  );
  if p_checksum !~ '^[0-9a-f]{64}$' then raise exception 'report_checksum_invalid'; end if;
  if p_temp_storage_path not like 'tmp/%' then raise exception 'temporary_storage_path_required'; end if;
  if coalesce(trim(p_storage_bucket), '') = '' then raise exception 'storage_bucket_required'; end if;
  if v_claim.report_id is not null then return v_claim.report_id; end if;
  select assessment_reference into v_assessment_reference from public.assessments where id = v_claim.assessment_id;
  v_final_path := v_assessment_reference || '/' || v_claim.report_reference || '-' || p_checksum || '.pdf';

  select id into v_supersedes from public.reports
  where assessment_id = v_claim.assessment_id and report_type = v_claim.report_type
    and status not in ('superseded','voided','draft')
  order by version_number desc limit 1 for update;
  insert into public.reports(
    assessment_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum,
    generated_by, generated_at, supersedes_report_id, fulfilment_id, generation_run_id
  ) values (
    v_claim.assessment_id, v_claim.order_id, v_claim.score_run_id, p_template_id,
    v_claim.report_type, 'draft', v_claim.report_reference, v_claim.version_number,
    p_storage_bucket, p_temp_storage_path, p_checksum, p_generated_by, now(),
    v_supersedes, v_claim.fulfilment_id, p_generation_run_id
  ) returning id into v_report_id;
  update public.report_generation_claims
  set report_id = v_report_id, state = 'committed',
      temporary_storage_bucket = p_storage_bucket, temporary_storage_path = p_temp_storage_path,
      final_storage_bucket = p_storage_bucket, final_storage_path = v_final_path,
      expected_checksum = p_checksum, committed_at = now(), last_heartbeat_at = now(), updated_at = now()
  where claim_token = p_claim_token;
  return v_report_id;
end;
$$;

create function public.publish_premium_report_generation(
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.report_generation_claims%rowtype;
  v_report public.reports%rowtype;
  v_order_reference text;
  v_object record;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token for update;
  if not found or v_claim.report_id <> p_report_id or v_claim.state <> 'committed' then raise exception 'generation_claim_report_mismatch'; end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.status <> 'draft' then raise exception 'report_draft_missing'; end if;
  if v_report.order_id <> v_claim.order_id or v_report.assessment_id <> v_claim.assessment_id
     or v_report.score_run_id <> v_claim.score_run_id or v_report.version_number <> v_claim.version_number
     or v_report.checksum <> v_claim.expected_checksum then raise exception 'report_claim_binding_mismatch'; end if;
  select order_reference into v_order_reference from public.orders where id = v_claim.order_id;
  perform public.phase14_generation_entitlement(
    v_order_reference, v_claim.order_id, v_claim.assessment_id, v_claim.score_run_id, v_claim.score_input_hash
  );
  if v_claim.final_storage_path like 'tmp/%' or coalesce(v_claim.final_storage_path, '') = '' then raise exception 'final_storage_path_invalid'; end if;
  select so.bucket_id, so.name, so.metadata into v_object
  from storage.objects so
  where so.bucket_id = v_claim.final_storage_bucket and so.name = v_claim.final_storage_path;
  if not found then raise exception 'final_storage_object_missing'; end if;
  if coalesce(v_object.metadata->>'mimetype', '') <> 'application/pdf' then raise exception 'final_storage_content_type_invalid'; end if;
  if coalesce(v_object.metadata->>'sha256', v_object.metadata->'metadata'->>'sha256', '') <> v_claim.expected_checksum then raise exception 'final_storage_checksum_metadata_mismatch'; end if;

  if v_report.supersedes_report_id is not null then
    update public.reports set status = 'superseded'
    where id = v_report.supersedes_report_id and status not in ('voided','superseded');
  end if;
  update public.reports
  set status = 'generated', storage_bucket = v_claim.final_storage_bucket,
      storage_path = v_claim.final_storage_path, updated_at = now()
  where id = p_report_id;
  delete from public.report_generation_claims where claim_token = p_claim_token;
  return jsonb_build_object(
    'report_id', p_report_id, 'report_reference', v_report.report_reference,
    'version_number', v_report.version_number, 'superseded_report_id', v_report.supersedes_report_id,
    'final_storage_bucket', v_claim.final_storage_bucket, 'final_storage_path', v_claim.final_storage_path
  );
end;
$$;

create or replace function public.abandon_premium_report_generation_claim(
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_claim public.report_generation_claims%rowtype;
begin
  v_actor := public.phase14_require_security(
    'report_regeneration', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token for update;
  if not found then return false; end if;
  update public.report_generation_claims
  set state = 'abandoned', abandoned_at = now(), abandonment_reason = p_reason,
      lease_expires_at = now(), updated_at = now()
  where claim_token = p_claim_token;
  if v_claim.report_id is not null then
    update public.reports set status = 'voided', updated_at = now()
    where id = v_claim.report_id and status = 'draft';
  end if;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, v_claim.assessment_id, 'report_generation_claims', v_claim.report_id,
    'report_generation_claim_abandoned', jsonb_build_object('reason', p_reason));
  return true;
end;
$$;

create or replace function public.cleanup_expired_premium_report_claims(p_older_than interval default interval '24 hours')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_paths jsonb; v_count integer;
begin
  if auth.jwt()->>'role' <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'phase14_cleanup_service_role_required';
  end if;
  with deleted as (
    delete from public.report_generation_claims
    where report_id is null and state in ('claimed','abandoned')
      and lease_expires_at < now() - p_older_than
    returning temporary_storage_bucket, temporary_storage_path
  )
  select coalesce(jsonb_agg(jsonb_build_object('bucket', temporary_storage_bucket, 'path', temporary_storage_path))
    filter (where temporary_storage_path is not null), '[]'::jsonb), count(*)
  into v_paths, v_count from deleted;
  return jsonb_build_object('deleted_claims', v_count, 'temporary_objects_eligible_for_api_cleanup', v_paths);
end;
$$;

create or replace function public.phase14_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false,
  p_purpose text default 'email_delivery'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype; v_order public.orders%rowtype; v_product public.products%rowtype;
  v_assessment public.assessments%rowtype; v_score_run public.score_runs%rowtype;
  v_customer_email text; v_current_report_id uuid; v_object record;
begin
  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception 'report_not_found'; end if;
  select * into v_order from public.orders where id = v_report.order_id for share;
  if not found then raise exception 'report_order_missing'; end if;
  select * into v_product from public.products where id = v_order.product_id for share;
  select * into v_assessment from public.assessments where id = v_report.assessment_id for share;
  select * into v_score_run from public.score_runs where id = v_report.score_run_id for share;
  select id into v_current_report_id from public.reports
  where assessment_id = v_report.assessment_id and report_type = v_report.report_type
    and status not in ('superseded','voided','draft')
  order by version_number desc limit 1;

  if v_report.report_type <> 'essential_self_assessment' or v_product.product_code <> 'essential_self_assessment' then raise exception 'delivery_report_type_ineligible'; end if;
  if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then raise exception 'delivery_price_mismatch'; end if;
  if v_order.currency <> 'ZAR' or v_product.currency <> 'ZAR' then raise exception 'delivery_currency_mismatch'; end if;
  if v_order.status::text <> 'payment_received' then raise exception 'delivery_order_not_paid'; end if;
  if v_order.verified_at is null or v_order.verified_by is null then raise exception 'delivery_manual_verification_missing'; end if;
  if not v_product.active or not v_product.requires_payment_verification or v_product.delivery_mode <> 'mk_controlled_pdf' then raise exception 'delivery_product_policy_mismatch'; end if;
  if v_report.assessment_id <> v_order.assessment_id or v_score_run.assessment_id <> v_assessment.id then raise exception 'delivery_relationship_mismatch'; end if;
  if v_assessment.current_score_run_id <> v_score_run.id then raise exception 'delivery_stale_score_run'; end if;
  if v_score_run.status::text <> 'completed' or v_score_run.locked_at is null or v_score_run.input_hash !~ '^[0-9a-f]{64}$' then raise exception 'delivery_score_run_ineligible'; end if;
  if v_current_report_id is distinct from v_report.id or v_report.status in ('draft','superseded','voided') then raise exception 'delivery_report_not_current'; end if;
  if p_purpose = 'email_delivery' and v_report.status not in ('generated','approved','released') then raise exception 'delivery_report_status_forbidden'; end if;
  if p_purpose = 'admin_download' and v_report.status not in ('generated','under_review','approved','released') then raise exception 'download_report_status_forbidden'; end if;
  if coalesce(v_report.storage_bucket, '') = '' or coalesce(v_report.storage_path, '') = '' or v_report.checksum !~ '^[0-9a-f]{64}$' then raise exception 'delivery_storage_metadata_invalid'; end if;
  select bucket_id, name, metadata into v_object from storage.objects
  where bucket_id = v_report.storage_bucket and name = v_report.storage_path;
  if not found then raise exception 'report_storage_object_missing'; end if;
  if coalesce(v_object.metadata->>'mimetype', '') <> 'application/pdf'
     or coalesce(v_object.metadata->>'sha256', v_object.metadata->'metadata'->>'sha256', '') <> v_report.checksum then raise exception 'report_storage_metadata_mismatch'; end if;
  v_customer_email := lower(trim(v_order.customer_email::text));
  if not p_allow_test_override and lower(trim(p_recipient)) is distinct from v_customer_email then raise exception 'delivery_recipient_override_forbidden'; end if;
  return jsonb_build_object(
    'report_id', v_report.id, 'report_reference', v_report.report_reference,
    'report_status', v_report.status, 'report_checksum', v_report.checksum,
    'storage_bucket', v_report.storage_bucket, 'storage_path', v_report.storage_path,
    'order_id', v_order.id, 'assessment_id', v_assessment.id, 'score_run_id', v_score_run.id,
    'customer_email', v_customer_email, 'recipient', lower(trim(p_recipient)),
    'test_delivery', lower(trim(p_recipient)) is distinct from v_customer_email
  );
end;
$$;

create or replace function public.assert_premium_report_delivery_entitlement(
  p_report_id uuid, p_recipient text, p_allow_test_override boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.phase14_require_security(
    'email_delivery', array['platform_admin','approver']::public.admin_role[], true, false
  );
  return public.phase14_delivery_entitlement(p_report_id, p_recipient, p_allow_test_override, 'email_delivery');
end;
$$;

create or replace function public.assert_premium_report_download_entitlement(
  p_report_id uuid,
  p_purpose text default 'admin_download'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_report public.reports%rowtype; v_order public.orders%rowtype;
begin
  perform public.phase14_require_security(
    'report_download', array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[], true, false
  );
  select * into v_report from public.reports where id = p_report_id;
  if not found then raise exception 'report_not_found'; end if;
  select * into v_order from public.orders where id = v_report.order_id;
  return public.phase14_delivery_entitlement(p_report_id, lower(trim(v_order.customer_email::text)), false, p_purpose);
end;
$$;

create or replace function public.authorize_premium_report_delivery(
  p_report_id uuid,
  p_recipient text,
  p_force_resend boolean default false,
  p_allow_test_override boolean default false,
  p_provider text default 'resend'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_context jsonb; v_gate_version integer; v_event public.email_events%rowtype;
  v_auth public.report_delivery_authorizations%rowtype; v_attempt integer; v_dedupe text;
begin
  v_actor := public.phase14_require_security(
    case when p_force_resend then 'email_resend' else 'email_delivery' end,
    array['platform_admin','approver']::public.admin_role[], true, false
  );
  if coalesce(trim(p_provider), '') = '' then raise exception 'delivery_provider_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase14-delivery:' || p_report_id::text || ':' || lower(trim(p_recipient)),
      0
    )
  );
  v_context := public.phase14_delivery_entitlement(p_report_id, p_recipient, p_allow_test_override, 'email_delivery');
  v_gate_version := (v_actor->>'gate_version')::integer;
  if exists (
    select 1 from public.email_events where report_id = p_report_id
      and recipient_email = lower(trim(p_recipient))
      and status in ('sending','provider_acceptance_uncertain','reconciliation_required')
  ) then raise exception 'delivery_provider_acceptance_unresolved'; end if;

  if not p_force_resend then
    select * into v_event from public.email_events
    where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
      and notification_type = 'premium_report_pdf'
      and status in ('sent','delivery_delayed','delivered','bounced','complained')
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('reused_existing_send', true, 'email_event_id', v_event.id,
        'provider_message_id', v_event.provider_message_id, 'status', v_event.status,
        'recipient', lower(trim(p_recipient)), 'test_delivery', (v_context->>'test_delivery')::boolean);
    end if;
  end if;

  select count(*) + 1 into v_attempt from public.email_events
  where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
    and notification_type = 'premium_report_pdf';
  v_dedupe := 'premium-report-delivery:' || p_report_id || ':' || lower(trim(p_recipient)) || ':attempt-' || v_attempt;
  insert into public.email_events(
    assessment_id, order_id, report_id, recipient_email, template_key, notification_type,
    dedupe_key, provider_request_key, provider_idempotency_key, provider, status,
    attempt_number, metadata_json
  ) values (
    (v_context->>'assessment_id')::uuid, (v_context->>'order_id')::uuid, p_report_id,
    lower(trim(p_recipient)), 'premium_report_pdf_v1', 'premium_report_pdf', v_dedupe,
    v_dedupe, v_dedupe, lower(trim(p_provider)), 'queued', v_attempt,
    jsonb_build_object('attachment_checksum', v_context->>'report_checksum', 'test_delivery', (v_context->>'test_delivery')::boolean)
  ) returning * into v_event;
  insert into public.report_delivery_authorizations(
    report_id, report_checksum, recipient_email, order_id, assessment_id, score_run_id,
    security_gate_version, authorised_by, authorised_session_id, provider, email_event_id, test_delivery
  ) values (
    p_report_id, v_context->>'report_checksum', lower(trim(p_recipient)),
    (v_context->>'order_id')::uuid, (v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid, v_gate_version, (v_actor->>'user_id')::uuid,
    nullif(v_actor->>'session_id','')::uuid, lower(trim(p_provider)), v_event.id,
    (v_context->>'test_delivery')::boolean
  ) returning * into v_auth;
  return jsonb_build_object(
    'reused_existing_send', false, 'authorization_id', v_auth.id, 'email_event_id', v_event.id,
    'provider_request_key', v_event.provider_request_key, 'attempt_number', v_event.attempt_number,
    'recipient', v_auth.recipient_email, 'test_delivery', v_auth.test_delivery, 'status', v_auth.status
  );
end;
$$;

create or replace function public.claim_premium_report_delivery(p_authorization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_security jsonb; v_auth public.report_delivery_authorizations%rowtype; v_context jsonb; v_lease uuid;
begin
  v_security := public.phase14_require_security(
    'automatic_delivery', array['platform_admin','approver']::public.admin_role[], true, true
  );
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found then raise exception 'delivery_authorization_missing'; end if;
  if v_auth.status <> 'queued' then return jsonb_build_object('claimed', false, 'status', v_auth.status); end if;
  if v_auth.security_gate_version <> (v_security->>'gate_version')::integer then
    update public.report_delivery_authorizations set status = 'revoked', revoked_reason = 'security_gate_version_changed', updated_at = now() where id = v_auth.id;
    update public.email_events set status = 'failed_before_provider', error_message = 'Delivery authorization gate version changed.' where id = v_auth.email_event_id and status = 'queued';
    return jsonb_build_object('claimed', false, 'status', 'revoked', 'reason', 'security_gate_version_changed');
  end if;
  begin
    v_context := public.phase14_delivery_entitlement(v_auth.report_id, v_auth.recipient_email::text, v_auth.test_delivery, 'email_delivery');
    if v_context->>'report_checksum' <> v_auth.report_checksum
       or (v_context->>'order_id')::uuid <> v_auth.order_id
       or (v_context->>'score_run_id')::uuid <> v_auth.score_run_id then raise exception 'delivery_authorization_binding_changed'; end if;
  exception when others then
    update public.report_delivery_authorizations set status = 'revoked', revoked_reason = sqlerrm, updated_at = now() where id = v_auth.id;
    update public.email_events set status = 'failed_before_provider', error_message = 'Delivery authorization revoked before dispatch: ' || sqlerrm where id = v_auth.email_event_id and status = 'queued';
    return jsonb_build_object('claimed', false, 'status', 'revoked', 'reason', sqlerrm);
  end;
  v_lease := gen_random_uuid();
  update public.report_delivery_authorizations
  set status = 'claimed', lease_token = v_lease, lease_expires_at = now() + interval '10 minutes',
      claimed_at = now(), updated_at = now()
  where id = v_auth.id;
  return jsonb_build_object(
    'claimed', true, 'authorization_id', v_auth.id, 'lease_token', v_lease,
    'email_event_id', v_auth.email_event_id, 'report_id', v_auth.report_id,
    'recipient', v_auth.recipient_email, 'provider', v_auth.provider,
    'test_delivery', v_auth.test_delivery, 'report_checksum', v_auth.report_checksum
  );
end;
$$;

create or replace function public.mark_premium_report_delivery_dispatch_started(
  p_authorization_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_auth public.report_delivery_authorizations%rowtype;
begin
  perform public.phase14_require_security('automatic_delivery', array['platform_admin','approver']::public.admin_role[], true, true);
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status <> 'claimed' or v_auth.lease_token <> p_lease_token or v_auth.lease_expires_at < now() then
    raise exception 'delivery_authorization_lease_invalid';
  end if;
  update public.report_delivery_authorizations set status = 'dispatching', dispatch_started_at = now(), updated_at = now() where id = v_auth.id;
  update public.email_events set status = 'sending', send_lease_token = p_lease_token,
    send_lease_expires_at = v_auth.lease_expires_at, delivery_updated_at = now(), error_message = null
  where id = v_auth.email_event_id and status = 'queued';
  if not found then raise exception 'delivery_email_event_not_queued'; end if;
  return true;
end;
$$;

create or replace function public.fail_premium_report_delivery_before_dispatch(
  p_authorization_id uuid,
  p_lease_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_auth public.report_delivery_authorizations%rowtype;
begin
  perform public.phase14_require_security('automatic_delivery', array['platform_admin','approver']::public.admin_role[], true, true);
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status <> 'claimed' or v_auth.lease_token <> p_lease_token then return false; end if;
  update public.report_delivery_authorizations set status = 'revoked', revoked_reason = p_reason,
    lease_token = null, lease_expires_at = null, updated_at = now() where id = v_auth.id;
  update public.email_events set status = 'failed_before_provider', error_message = p_reason,
    send_lease_token = null, send_lease_expires_at = null, delivery_updated_at = now()
  where id = v_auth.email_event_id and status = 'queued';
  return true;
end;
$$;

create or replace function public.finalize_premium_report_delivery(
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_existing public.report_delivery_finalizations%rowtype; v_report public.reports%rowtype; v_now timestamptz := now();
begin
  perform public.phase14_require_security('delivery_finalization', array['platform_admin','approver']::public.admin_role[], true, true);
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_auth.email_event_id <> p_email_event_id then raise exception 'delivery_finalization_binding_mismatch'; end if;
  select * into v_existing from public.report_delivery_finalizations where authorization_id = p_authorization_id;
  if found then
    return jsonb_build_object('finalized', true, 'idempotent_replay', true, 'report_id', v_existing.report_id, 'email_event_id', v_existing.email_event_id);
  end if;
  if v_auth.status not in ('dispatching','reconciliation_required') then raise exception 'delivery_finalization_state_invalid:%', v_auth.status; end if;
  if coalesce(trim(p_provider_message_id), '') = '' then raise exception 'provider_message_id_required'; end if;
  select * into v_report from public.reports where id = v_auth.report_id for update;
  if not found then raise exception 'delivery_finalization_report_missing'; end if;

  update public.email_events
  set status = 'sent', provider = v_auth.provider, provider_message_id = p_provider_message_id,
      sent_at = coalesce(sent_at, v_now), delivery_updated_at = v_now,
      send_lease_token = null, send_lease_expires_at = null, error_message = null
  where id = p_email_event_id and status in ('sending','provider_acceptance_uncertain','reconciliation_required');
  if not found then raise exception 'delivery_finalization_email_cas_failed'; end if;

  if not v_auth.test_delivery then
    update public.reports set status = 'released', released_at = coalesce(released_at, v_now), updated_at = v_now
    where id = v_report.id and status not in ('draft','superseded','voided');
    if not found then raise exception 'delivery_finalization_report_cas_failed'; end if;
    if v_report.fulfilment_id is not null then
      update public.report_fulfilments
      set status = 'completed', current_step = 'email_sent', completed_at = coalesce(completed_at, v_now),
          report_id = v_report.id, updated_at = v_now
      where id = v_report.fulfilment_id and status not in ('cancelled','completed');
    end if;
  end if;

  insert into public.report_delivery_finalizations(authorization_id, email_event_id, report_id, provider, provider_message_id, finalized_at)
  values (v_auth.id, p_email_event_id, v_report.id, v_auth.provider, p_provider_message_id, v_now);
  insert into public.report_events(report_id, event_type, actor_user_id, note, metadata_json)
  values (v_report.id, case when v_auth.test_delivery then 'email_test_sent' else 'email_sent' end,
    v_auth.authorised_by, 'Atomic provider-acceptance finalization.',
    jsonb_build_object('authorization_id', v_auth.id, 'email_event_id', p_email_event_id, 'provider_message_id', p_provider_message_id, 'test_delivery', v_auth.test_delivery));
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', v_auth.authorised_by, v_auth.assessment_id, 'reports', v_report.id,
    case when v_auth.test_delivery then 'premium_report_test_delivery_finalized' else 'premium_report_delivery_finalized' end,
    jsonb_build_object('authorization_id', v_auth.id, 'email_event_id', p_email_event_id, 'provider_message_id', p_provider_message_id));
  if not v_auth.test_delivery then
    insert into public.assessment_events(
      assessment_id, order_id, report_id, event_type, dedupe_key, metadata_json
    ) values (
      v_auth.assessment_id, v_auth.order_id, v_report.id, 'report_emailed_to_customer',
      'phase14-delivery-finalization:' || v_auth.id,
      jsonb_build_object('authorization_id', v_auth.id, 'email_event_id', p_email_event_id, 'test_delivery', false)
    );
  end if;
  update public.report_delivery_authorizations
  set status = 'finalized', provider_message_id = p_provider_message_id, finalized_at = v_now,
      lease_token = null, lease_expires_at = null, updated_at = v_now
  where id = v_auth.id;
  return jsonb_build_object('finalized', true, 'idempotent_replay', false, 'report_id', v_report.id, 'email_event_id', p_email_event_id);
end;
$$;

create or replace function public.mark_premium_report_delivery_reconciliation_required(
  p_authorization_id uuid,
  p_provider_message_id text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_auth public.report_delivery_authorizations%rowtype;
begin
  perform public.phase14_require_security('provider_reconciliation', array['platform_admin','approver']::public.admin_role[], true, true);
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status not in ('dispatching','reconciliation_required') then return false; end if;
  update public.report_delivery_authorizations set status = 'reconciliation_required',
    provider_message_id = coalesce(p_provider_message_id, provider_message_id), updated_at = now()
  where id = v_auth.id;
  update public.email_events set status = 'reconciliation_required',
    provider_message_id = coalesce(p_provider_message_id, provider_message_id),
    reconciliation_required_at = coalesce(reconciliation_required_at, now()),
    error_message = p_reason, delivery_updated_at = now()
  where id = v_auth.email_event_id and status in ('sending','provider_acceptance_uncertain','reconciliation_required');
  return true;
end;
$$;

create or replace function public.recover_stale_premium_report_email_sends()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  perform public.phase14_require_security('provider_reconciliation', array['platform_admin','approver']::public.admin_role[], true, true);
  update public.report_delivery_authorizations
  set status = 'reconciliation_required', updated_at = now()
  where status = 'dispatching' and lease_expires_at < now();
  update public.email_events
  set status = 'reconciliation_required', reconciliation_required_at = coalesce(reconciliation_required_at, now()),
      delivery_updated_at = now(), error_message = 'Dispatch lease expired; provider acceptance remains unresolved.'
  where status = 'sending' and send_lease_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.phase14_require_actor(text,public.admin_role[],boolean)',
    'public.phase14_require_security(text,public.admin_role[],boolean,boolean)',
    'public.phase14_generation_entitlement(text,uuid,uuid,uuid,text)',
    'public.phase14_delivery_entitlement(uuid,text,boolean,text)',
    'public.guard_phase14_feature_policy_mutation()'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public, anon, authenticated, service_role';
  end loop;

  foreach v_signature in array array[
    'public.set_phase14_security_gate_version(integer,text)',
    'public.update_phase14_feature_policy(text,jsonb)',
    'public.authorize_phase14_action(text)',
    'public.assert_premium_report_generation_entitlement(text)',
    'public.claim_premium_report_generation(text,text,uuid,public.report_type)',
    'public.renew_premium_report_generation_lease(uuid)',
    'public.recover_premium_report_generation_claim(text,text)',
    'public.commit_premium_report_draft(uuid,uuid,text,text,text,uuid,uuid)',
    'public.publish_premium_report_generation(uuid,uuid)',
    'public.abandon_premium_report_generation_claim(uuid,text)',
    'public.assert_premium_report_delivery_entitlement(uuid,text,boolean)',
    'public.assert_premium_report_download_entitlement(uuid,text)',
    'public.authorize_premium_report_delivery(uuid,text,boolean,boolean,text)'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public, anon, service_role';
    execute 'grant execute on function ' || v_signature || ' to authenticated';
  end loop;

  foreach v_signature in array array[
    'public.cleanup_expired_premium_report_claims(interval)',
    'public.claim_premium_report_delivery(uuid)',
    'public.mark_premium_report_delivery_dispatch_started(uuid,uuid)',
    'public.fail_premium_report_delivery_before_dispatch(uuid,uuid,text)',
    'public.finalize_premium_report_delivery(uuid,uuid,text)',
    'public.mark_premium_report_delivery_reconciliation_required(uuid,text,text)',
    'public.recover_stale_premium_report_email_sends()'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public, anon, authenticated';
    execute 'grant execute on function ' || v_signature || ' to service_role';
  end loop;

  execute 'revoke execute on function public.release_premium_report_generation_claim(uuid) from public, anon, authenticated, service_role';
  execute 'revoke execute on function public.publish_premium_report_generation(uuid,uuid,text) from public, anon, authenticated, service_role';
  execute 'revoke execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,jsonb) from public, anon, authenticated, service_role';
end;
$$;

comment on table public.phase14_security_gates is
  'Versioned database security gate. The seeded Phase 14 gate is intentionally unsatisfied and is authoritative over editable JSON flags.';
comment on table public.report_delivery_authorizations is
  'Durable delivery outbox. Claiming then marking dispatch_started is the irreversible provider-dispatch boundary; later business changes cannot unsend an accepted request.';
comment on function public.cleanup_expired_premium_report_claims(interval) is
  'Cleanup administration operation. It only removes old uncommitted claims and returns temporary paths for Storage API cleanup; active and committed report objects are excluded.';

update public.app_settings
set value_json = value_json || jsonb_build_object(
      'premium_report_prompt_version', 'mk-premium-report-v2-evidence-plan',
      'premium_report_schema_version', 'mk-premium-ai-evidence-plan-v2',
      'premium_report_auto_fulfilment_enabled', false,
      'premium_report_ai_narrative_enabled', false,
      'premium_report_auto_email_enabled', false
    ),
    updated_at = now()
where setting_key = 'phase14_autonomous_report_engine';

update public.app_settings
set value_json = value_json || jsonb_build_object(
      'premium_report_manual_delivery_enabled', false,
      'premium_report_test_recipient_override_enabled', false
    ),
    updated_at = now()
where setting_key = 'phase14_delivery_policy';


create or replace function public.apply_email_provider_event_atomic(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_payload_fingerprint text,
  p_payload_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email public.email_events%rowtype; v_existing public.email_provider_events%rowtype;
  v_provider_event_id uuid; v_status text; v_current_rank integer; v_incoming_rank integer;
  v_applied boolean := false; v_supported boolean; v_payload jsonb; v_payload_size integer;
begin
  perform public.phase14_require_security('webhook_mutation', array['platform_admin']::public.admin_role[], false, true);
  if length(p_payload_fingerprint) <> 64 or p_payload_fingerprint ~ '[^0-9a-f]' then
    raise exception 'webhook_payload_fingerprint_invalid';
  end if;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'type', p_payload_json->>'type', 'created_at', p_payload_json->>'created_at', 'reason', p_payload_json->>'reason'
  ));
  v_payload_size := octet_length(v_payload::text);
  if v_payload_size > 65536 then raise exception 'webhook_minimal_payload_too_large'; end if;
  v_status := case p_event_type
    when 'email.sent' then 'sent' when 'email.delivery_delayed' then 'delivery_delayed'
    when 'email.delivered' then 'delivered' when 'email.failed' then 'delivery_failed'
    when 'email.bounced' then 'bounced' when 'email.suppressed' then 'bounced'
    when 'email.complained' then 'complained' else null end;
  v_supported := v_status is not null;

  select * into v_existing from public.email_provider_events
  where provider = lower(trim(p_provider)) and provider_event_id = p_provider_event_id for update;
  if found then
    if v_existing.payload_fingerprint is distinct from p_payload_fingerprint then
      update public.email_provider_events set processing_error = 'provider_event_payload_conflict', conflict_detected_at = now()
      where id = v_existing.id;
      insert into public.phase14_operational_alerts(alert_key, severity, category, email_event_id, detail_json)
      values ('provider-event-conflict:' || lower(trim(p_provider)) || ':' || p_provider_event_id,
        'critical', 'provider_event_payload_conflict', v_existing.email_event_id,
        jsonb_build_object('provider', lower(trim(p_provider)), 'provider_event_id', p_provider_event_id))
      on conflict (alert_key) do nothing;
      return jsonb_build_object('duplicate', true, 'conflict', true, 'state_updated', false);
    end if;
    return jsonb_build_object('duplicate', true, 'conflict', false, 'state_updated', false);
  end if;

  if p_provider_message_id is not null then
    select * into v_email from public.email_events
    where provider = lower(trim(p_provider)) and provider_message_id = p_provider_message_id
    for update;
  end if;
  insert into public.email_provider_events(
    email_event_id, provider, provider_event_id, provider_message_id, event_type,
    event_created_at, payload_fingerprint, payload_size_bytes, supported_event, payload_json
  ) values (
    v_email.id, lower(trim(p_provider)), p_provider_event_id, p_provider_message_id, p_event_type,
    p_event_created_at, p_payload_fingerprint, v_payload_size, v_supported, v_payload
  ) returning id into v_provider_event_id;
  if not v_supported then
    update public.email_provider_events set processed_at = now(), processing_error = 'verified_unsupported_event' where id = v_provider_event_id;
    return jsonb_build_object('ignored', true, 'reason', 'unsupported_event', 'recorded', true);
  end if;
  if v_email.id is null then
    update public.email_provider_events set processing_error = 'unknown_provider_message', processed_at = now() where id = v_provider_event_id;
    return jsonb_build_object('ignored', true, 'reason', 'unknown_message');
  end if;

  v_current_rank := case v_email.status
    when 'queued' then 10 when 'sending' then 20 when 'provider_acceptance_uncertain' then 25
    when 'reconciliation_required' then 26 when 'sent' then 30 when 'delivery_delayed' then 40
    when 'delivered' then 50 when 'delivery_failed' then 60 when 'bounced' then 60
    when 'complained' then 70 when 'failed_before_provider' then 80 else 0 end;
  v_incoming_rank := case v_status when 'sent' then 30 when 'delivery_delayed' then 40
    when 'delivered' then 50 when 'delivery_failed' then 60 when 'bounced' then 60 when 'complained' then 70 else 0 end;
  if v_incoming_rank >= v_current_rank
     and (v_email.delivery_updated_at is null or p_event_created_at >= v_email.delivery_updated_at) then
    update public.email_events set status = v_status, provider_event_id = p_provider_event_id,
      delivered_at = case when v_status = 'delivered' then p_event_created_at else delivered_at end,
      delivery_updated_at = p_event_created_at,
      error_message = case when v_status in ('bounced','complained','delivery_failed') then coalesce(v_payload->>'reason', v_status) else null end,
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
        'last_provider_event_type', p_event_type, 'last_provider_event_created_at', p_event_created_at
      ) where id = v_email.id;
    v_applied := true;
  end if;
  update public.email_provider_events set processed_at = now(), processing_error = null where id = v_provider_event_id;
  return jsonb_build_object('duplicate', false, 'conflict', false, 'state_updated', v_applied, 'status', v_status);
end;
$$;
-- END ARCHIVED SOURCE: uat-applied/20260714194317_phase14_security_state_machine_closure.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/20260714201550_phase14_webhook_state_machine.sql
do $$
begin
  execute 'revoke execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) to service_role';
end;
$$;
-- END ARCHIVED SOURCE: uat-applied/20260714201550_phase14_webhook_state_machine.sql

-- BEGIN ARCHIVED SOURCE: uat-applied/20260714214023_phase14_fourth_adversarial_remediation.sql
-- Phase 14 fourth adversarial remediation.
-- Forward-only and fail-closed. This migration intentionally leaves every
-- commercial policy disabled and does not satisfy the Phase 14 security gate.


-- 1. Make the gate internally consistent and impossible to mutate through a
-- service-role Data API client or a direct table grant.
alter table public.phase14_security_gates
  drop constraint if exists phase14_security_gate_consistency;

alter table public.phase14_security_gates
  add constraint phase14_security_gate_consistency check (
    (
      status = 'satisfied'
      and satisfied_version >= required_version
      and satisfied_by is not null
      and satisfied_at is not null
      and coalesce(trim(reason), '') <> ''
    )
    or (
      status <> 'satisfied'
      and satisfied_version < required_version
    )
  );

revoke all on table public.phase14_security_gates from public, anon, authenticated, service_role;
grant select on table public.phase14_security_gates to authenticated, service_role;

create or replace function public.guard_phase14_security_gate_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.phase14_require_actor(
    'security_gate_table_mutation',
    array['platform_admin']::public.admin_role[],
    true
  );
  if tg_op = 'DELETE' then return old; end if;
  if tg_level = 'STATEMENT' then return null; end if;
  return new;
end;
$$;

-- 2. Database-authoritative, action-specific policies. Application settings may
-- still hold presentation/configuration values, but never confer authority.
create table public.phase14_feature_policies (
  policy_key text primary key check (policy_key in (
    'manual_generation',
    'automatic_fulfilment',
    'ai_narrative',
    'automatic_email',
    'manual_delivery',
    'recipient_override',
    'storage_cleanup'
  )),
  enabled boolean not null default false,
  required_gate_version integer not null default 1 check (required_gate_version > 0),
  updated_by uuid references public.admin_profiles(id) on delete restrict,
  reason text not null default 'Disabled pending controlled approval' check (coalesce(trim(reason), '') <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.phase14_feature_policies(policy_key, enabled, reason)
select key, false, 'Disabled by fourth adversarial remediation pending separate AAL2 approval.'
from unnest(array[
  'manual_generation', 'automatic_fulfilment', 'ai_narrative',
  'automatic_email', 'manual_delivery', 'recipient_override', 'storage_cleanup'
]) as key;

alter table public.phase14_feature_policies enable row level security;
revoke all on table public.phase14_feature_policies from public, anon, authenticated, service_role;
grant select on table public.phase14_feature_policies to authenticated, service_role;
create policy phase14_feature_policies_admin_select on public.phase14_feature_policies
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','reviewer','approver','read_only_admin'));

create or replace function public.guard_phase14_feature_policy_row_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.phase14_require_actor(
    'feature_policy_table_mutation',
    array['platform_admin']::public.admin_role[],
    true
  );
  if tg_op = 'DELETE' then return old; end if;
  if tg_level = 'STATEMENT' then return null; end if;
  return new;
end;
$$;

create trigger trg_guard_phase14_feature_policy_rows
  before insert or update or delete on public.phase14_feature_policies
  for each row execute function public.guard_phase14_feature_policy_row_mutation();
create trigger trg_guard_phase14_feature_policy_truncate
  before truncate on public.phase14_feature_policies
  for each statement execute function public.guard_phase14_feature_policy_row_mutation();

create or replace function public.set_phase14_feature_policy(
  p_policy_key text,
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_policy public.phase14_feature_policies%rowtype;
begin
  v_actor := public.phase14_require_security(
    'feature_policy_change', array['platform_admin']::public.admin_role[], true, false
  );
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_policy_reason_required'; end if;
  update public.phase14_feature_policies
  set enabled = p_enabled,
      updated_by = (v_actor->>'user_id')::uuid,
      reason = p_reason,
      updated_at = now()
  where policy_key = p_policy_key
  returning * into v_policy;
  if not found then raise exception 'phase14_policy_not_supported:%', p_policy_key; end if;
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, 'phase14_feature_policies',
    'phase14_feature_policy_changed',
    jsonb_build_object('policy_key', p_policy_key, 'enabled', p_enabled, 'reason', p_reason));
  return to_jsonb(v_policy);
end;
$$;

create or replace function public.phase14_require_policy(p_policy_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_policy public.phase14_feature_policies%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version < v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_policy_key;
  end if;
  select * into v_policy from public.phase14_feature_policies where policy_key = p_policy_key for share;
  if not found or not v_policy.enabled then raise exception 'phase14_policy_disabled:%', p_policy_key; end if;
  if v_gate.satisfied_version < v_policy.required_gate_version then
    raise exception 'phase14_policy_gate_version_stale:%', p_policy_key;
  end if;
  return jsonb_build_object('policy_key', v_policy.policy_key, 'gate_version', v_gate.satisfied_version);
end;
$$;

-- 3. Durable, human-issued worker capabilities. Raw issue/lease secrets are
-- returned once and never stored; only SHA-256 digests are durable.
create table public.phase14_worker_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_type text not null check (capability_type in (
    'automatic_generation', 'automatic_delivery', 'generation_recovery',
    'delivery_reconciliation', 'storage_cleanup'
  )),
  policy_key text not null references public.phase14_feature_policies(policy_key) on delete restrict,
  operation_key text not null check (coalesce(trim(operation_key), '') <> ''),
  issue_secret_hash text not null check (issue_secret_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid references public.orders(id) on delete restrict,
  assessment_id uuid references public.assessments(id) on delete restrict,
  score_run_id uuid references public.score_runs(id) on delete restrict,
  fulfilment_id uuid references public.report_fulfilments(id) on delete restrict,
  report_id uuid references public.reports(id) on delete restrict,
  recipient_email citext,
  security_gate_version integer not null check (security_gate_version > 0),
  authorised_by uuid not null references public.admin_profiles(id) on delete restrict,
  authorised_session_id uuid,
  reason text not null check (coalesce(trim(reason), '') <> ''),
  status text not null default 'authorised' check (status in ('authorised','leased','consumed','revoked','expired')),
  expires_at timestamptz not null,
  lease_secret_hash text check (lease_secret_hash is null or lease_secret_hash ~ '^[0-9a-f]{64}$'),
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase14_worker_capability_lease_chk check (
    (status = 'leased' and lease_secret_hash is not null and lease_expires_at is not null)
    or status <> 'leased'
  )
);

create unique index phase14_worker_capabilities_one_active_uidx
  on public.phase14_worker_capabilities(capability_type, operation_key)
  where status in ('authorised','leased');
create index phase14_worker_capabilities_expiry_idx
  on public.phase14_worker_capabilities(status, expires_at);
alter table public.phase14_worker_capabilities enable row level security;
revoke all on table public.phase14_worker_capabilities from public, anon, authenticated, service_role;
grant select on table public.phase14_worker_capabilities to authenticated;
create policy phase14_worker_capabilities_admin_select on public.phase14_worker_capabilities
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','reviewer','approver','read_only_admin'));

alter table public.report_fulfilments
  add column generation_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  add column delivery_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict;

alter table public.report_delivery_authorizations
  alter column authorised_by drop not null,
  add column worker_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  add column bounce_remediation_id uuid;

create or replace function public.authorize_phase14_worker_operation(
  p_capability_type text,
  p_operation_key text,
  p_order_id uuid,
  p_assessment_id uuid,
  p_score_run_id uuid,
  p_fulfilment_id uuid,
  p_report_id uuid default null,
  p_recipient text default null,
  p_expires_in_seconds integer default 21600,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_gate public.phase14_security_gates%rowtype; v_policy_key text;
  v_secret text; v_capability public.phase14_worker_capabilities%rowtype;
  v_order public.orders%rowtype; v_fulfilment public.report_fulfilments%rowtype;
begin
  v_actor := public.phase14_require_security(
    'worker_capability_authorization', array['platform_admin']::public.admin_role[], true, false
  );
  if p_expires_in_seconds < 300 or p_expires_in_seconds > 86400 then
    raise exception 'phase14_worker_capability_expiry_out_of_range';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_worker_capability_reason_required'; end if;
  v_policy_key := case p_capability_type
    when 'automatic_generation' then 'automatic_fulfilment'
    when 'generation_recovery' then 'automatic_fulfilment'
    when 'automatic_delivery' then 'automatic_email'
    when 'delivery_reconciliation' then 'automatic_email'
    when 'storage_cleanup' then 'storage_cleanup'
    else null end;
  if v_policy_key is null then raise exception 'phase14_worker_capability_type_invalid'; end if;
  perform public.phase14_require_policy(v_policy_key);
  select * into v_gate from public.phase14_security_gates where gate_key = 'phase14-premium-report';
  if p_capability_type = 'storage_cleanup' then
    if p_order_id is not null or p_assessment_id is not null or p_score_run_id is not null
       or p_fulfilment_id is not null or p_report_id is not null or p_recipient is not null then
      raise exception 'storage_cleanup_capability_must_be_unbound';
    end if;
  else
    if p_order_id is null or p_assessment_id is null or p_score_run_id is null then
      raise exception 'worker_capability_commercial_binding_required';
    end if;
    select * into v_order from public.orders where id = p_order_id for share;
    if not found or v_order.assessment_id <> p_assessment_id then raise exception 'worker_capability_order_binding_invalid'; end if;
    perform public.phase14_generation_entitlement(
      v_order.order_reference,p_order_id,p_assessment_id,p_score_run_id,null
    );
  end if;
  if p_fulfilment_id is not null then
    select * into v_fulfilment from public.report_fulfilments where id = p_fulfilment_id for share;
    if not found or v_fulfilment.order_id <> p_order_id or v_fulfilment.assessment_id <> p_assessment_id
       or v_fulfilment.score_run_id <> p_score_run_id then
      raise exception 'worker_capability_fulfilment_binding_invalid';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phase14-capability:' || p_capability_type || ':' || p_operation_key, 0));
  update public.phase14_worker_capabilities
  set status = 'expired', updated_at = now()
  where capability_type = p_capability_type and operation_key = p_operation_key
    and status = 'authorised' and expires_at <= now();
  if exists (select 1 from public.phase14_worker_capabilities
    where capability_type = p_capability_type and operation_key = p_operation_key
      and status in ('authorised','leased')) then
    raise exception 'phase14_worker_capability_already_active';
  end if;
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.phase14_worker_capabilities(
    capability_type, policy_key, operation_key, issue_secret_hash,
    order_id, assessment_id, score_run_id, fulfilment_id, report_id, recipient_email,
    security_gate_version, authorised_by, authorised_session_id, reason, expires_at
  ) values (
    p_capability_type, v_policy_key, p_operation_key,
    encode(extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256'), 'hex'),
    p_order_id, p_assessment_id, p_score_run_id, p_fulfilment_id, p_report_id,
    nullif(lower(trim(p_recipient)), ''), v_gate.satisfied_version,
    (v_actor->>'user_id')::uuid, nullif(v_actor->>'session_id','')::uuid,
    p_reason, now() + make_interval(secs => p_expires_in_seconds)
  ) returning * into v_capability;
  if p_fulfilment_id is not null then
    update public.report_fulfilments
    set generation_capability_id = case when p_capability_type in ('automatic_generation','generation_recovery') then v_capability.id else generation_capability_id end,
        delivery_capability_id = case when p_capability_type in ('automatic_delivery','delivery_reconciliation') then v_capability.id else delivery_capability_id end,
        updated_at = now()
    where id = p_fulfilment_id;
  end if;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, p_assessment_id, 'phase14_worker_capabilities',
    v_capability.id, 'phase14_worker_capability_authorized',
    jsonb_build_object('capability_type', p_capability_type, 'operation_key', p_operation_key,
      'policy_key', v_policy_key, 'expires_at', v_capability.expires_at));
  return jsonb_build_object(
    'capability_id', v_capability.id, 'capability_type', v_capability.capability_type,
    'operation_key', v_capability.operation_key, 'issue_secret', v_secret,
    'expires_at', v_capability.expires_at, 'security_gate_version', v_capability.security_gate_version
  );
end;
$$;

create or replace function public.claim_phase14_worker_capability(
  p_capability_id uuid,
  p_issue_secret text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype; v_lease text; v_gate public.phase14_security_gates%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  if v_cap.status <> 'authorised' then raise exception 'phase14_worker_capability_not_claimable:%', v_cap.status; end if;
  if v_cap.expires_at <= now() then
    update public.phase14_worker_capabilities set status = 'expired', updated_at = now() where id = v_cap.id;
    raise exception 'phase14_worker_capability_expired';
  end if;
  if encode(extensions.digest(convert_to(coalesce(p_issue_secret,''), 'UTF8'), 'sha256'), 'hex') <> v_cap.issue_secret_hash then
    raise exception 'phase14_worker_capability_secret_invalid';
  end if;
  select * into v_gate from public.phase14_security_gates where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  v_lease := encode(extensions.gen_random_bytes(32), 'hex');
  update public.phase14_worker_capabilities
  set status = 'leased', lease_secret_hash = encode(extensions.digest(convert_to(v_lease, 'UTF8'), 'sha256'), 'hex'),
      lease_expires_at = least(expires_at, now() + interval '60 minutes'), claimed_at = now(), updated_at = now()
  where id = v_cap.id returning * into v_cap;
  return jsonb_build_object(
    'capability_id', v_cap.id, 'capability_type', v_cap.capability_type,
    'operation_key', v_cap.operation_key, 'lease_token', v_lease,
    'lease_expires_at', v_cap.lease_expires_at
  );
end;
$$;

create or replace function public.phase14_activate_worker_capability(
  p_capability_id uuid,
  p_lease_token text,
  p_expected_types text[],
  p_order_id uuid default null,
  p_assessment_id uuid default null,
  p_score_run_id uuid default null,
  p_fulfilment_id uuid default null,
  p_report_id uuid default null,
  p_recipient text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id for share;
  if not found or v_cap.status <> 'leased' then raise exception 'phase14_worker_capability_not_leased'; end if;
  if not (v_cap.capability_type = any(p_expected_types)) then raise exception 'phase14_worker_capability_type_mismatch'; end if;
  if v_cap.expires_at <= now() or v_cap.lease_expires_at <= now() then raise exception 'phase14_worker_capability_lease_expired'; end if;
  if encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') <> v_cap.lease_secret_hash then
    raise exception 'phase14_worker_capability_lease_invalid';
  end if;
  select * into v_gate from public.phase14_security_gates where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  if v_cap.order_id is not null and v_cap.order_id is distinct from p_order_id then raise exception 'worker_capability_order_mismatch'; end if;
  if v_cap.assessment_id is not null and v_cap.assessment_id is distinct from p_assessment_id then raise exception 'worker_capability_assessment_mismatch'; end if;
  if v_cap.score_run_id is not null and v_cap.score_run_id is distinct from p_score_run_id then raise exception 'worker_capability_score_run_mismatch'; end if;
  if v_cap.fulfilment_id is not null and v_cap.fulfilment_id is distinct from p_fulfilment_id then raise exception 'worker_capability_fulfilment_mismatch'; end if;
  if v_cap.report_id is not null and v_cap.report_id is distinct from p_report_id then raise exception 'worker_capability_report_mismatch'; end if;
  if v_cap.recipient_email is not null and lower(trim(p_recipient)) is distinct from lower(v_cap.recipient_email::text) then
    raise exception 'worker_capability_recipient_mismatch';
  end if;
  perform set_config('phase14.worker_capability_id', v_cap.id::text, true);
  perform set_config('phase14.worker_capability_type', v_cap.capability_type, true);
  return to_jsonb(v_cap) - 'issue_secret_hash' - 'lease_secret_hash';
end;
$$;

-- Replace the old service-role boolean bypass with a transaction-local worker
-- context that only the non-exposed activation helper can establish.
create or replace function public.phase14_require_security(
  p_action text,
  p_allowed_roles public.admin_role[] default array['platform_admin']::public.admin_role[],
  p_require_aal2 boolean default true,
  p_allow_service_role boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate public.phase14_security_gates%rowtype; v_actor jsonb; v_policy_key text;
  v_capability_id uuid; v_capability_type text; v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version < v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_action;
  end if;

  if coalesce(auth.jwt()->>'role','') = 'service_role' then
    begin
      v_capability_id := nullif(current_setting('phase14.worker_capability_id', true), '')::uuid;
      v_capability_type := nullif(current_setting('phase14.worker_capability_type', true), '');
    exception when others then
      raise exception 'phase14_worker_context_missing:%', p_action;
    end;
    if v_capability_id is null or v_capability_type is null then raise exception 'phase14_worker_context_missing:%', p_action; end if;
    select * into v_cap from public.phase14_worker_capabilities where id = v_capability_id for share;
    if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now()
       or v_cap.security_gate_version <> v_gate.satisfied_version then
      raise exception 'phase14_worker_context_invalid:%', p_action;
    end if;
    if not (
      (v_capability_type in ('automatic_generation','generation_recovery') and p_action in ('report_generation','report_regeneration','ai_narrative_generation'))
      or (v_capability_type = 'automatic_delivery' and p_action in ('email_delivery','automatic_delivery','delivery_finalization','provider_reconciliation'))
      or (v_capability_type = 'delivery_reconciliation' and p_action in ('provider_reconciliation','delivery_finalization','automatic_delivery'))
      or (v_capability_type = 'storage_cleanup' and p_action = 'storage_cleanup')
    ) then raise exception 'phase14_worker_action_forbidden:%', p_action; end if;
    perform public.phase14_require_policy(v_cap.policy_key);
    return jsonb_build_object('actor_type','worker','capability_id',v_cap.id,
      'capability_type',v_cap.capability_type,'gate_version',v_gate.satisfied_version,'action',p_action);
  end if;

  v_actor := public.phase14_require_actor(p_action, p_allowed_roles, p_require_aal2);
  v_policy_key := case
    when p_action in ('report_generation','report_regeneration') then 'manual_generation'
    when p_action = 'ai_narrative_generation' then 'ai_narrative'
    when p_action in ('email_delivery','email_resend','provider_reconciliation','delivery_finalization','automatic_delivery') then 'manual_delivery'
    else null end;
  if v_policy_key is not null then perform public.phase14_require_policy(v_policy_key); end if;
  return v_actor || jsonb_build_object('gate_version',v_gate.satisfied_version,'action',p_action);
end;
$$;

create or replace function public.authorize_phase14_worker_action(
  p_capability_id uuid,
  p_lease_token text,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_lease_token, array[v_cap.capability_type],
    v_cap.order_id, v_cap.assessment_id, v_cap.score_run_id, v_cap.fulfilment_id,
    v_cap.report_id, v_cap.recipient_email::text
  );
  return public.phase14_require_security(p_action, array['platform_admin']::public.admin_role[], true, false);
end;
$$;

create or replace function public.complete_phase14_worker_capability(
  p_capability_id uuid,
  p_lease_token text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id for update;
  if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now()
     or encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') <> v_cap.lease_secret_hash then
    raise exception 'phase14_worker_capability_completion_invalid';
  end if;
  update public.phase14_worker_capabilities
  set status = 'consumed', consumed_at = now(), lease_secret_hash = null,
      lease_expires_at = null, updated_at = now()
  where id = v_cap.id;
  return true;
end;
$$;
-- 4. Reports are RPC-owned. Reconcile any UAT-only duplicate "current" rows by
-- keeping the highest version and superseding older rows before adding the
-- invariant. This is transactional and therefore restartable after failure.
drop policy if exists reports_admin_manage on public.reports;

with ranked as (
  select r.id, r.assessment_id, r.report_type, r.status, r.version_number,
    row_number() over (
      partition by r.assessment_id, r.report_type
      order by r.version_number desc, r.created_at desc, r.id desc
    ) as current_rank
  from public.reports r
  where r.status in ('generated','under_review','approved','released')
), reconciled as (
  update public.reports r
  set status = 'superseded', updated_at = now()
  from ranked x
  where r.id = x.id and x.current_rank > 1
  returning r.id, r.assessment_id, r.report_reference, r.version_number
)
insert into public.report_events(report_id, event_type, note, metadata_json)
select id, 'migration_duplicate_current_reconciled',
  'Older current report superseded by forward-only Phase 14 remediation.',
  jsonb_build_object('report_reference', report_reference, 'version_number', version_number)
from reconciled;

create unique index reports_one_current_assessment_type_uidx
  on public.reports(assessment_id, report_type)
  where status in ('generated','under_review','approved','released');

revoke all on table public.reports from public, anon, authenticated, service_role;
grant select on table public.reports to authenticated, service_role;

-- 5. Requested AI routing identity and provider-resolved identity are distinct.
alter table public.report_ai_attempts
  add column requested_provider text,
  add column requested_model text,
  add column resolved_provider text,
  add column resolved_model text;

update public.report_ai_attempts
set requested_provider = coalesce(requested_provider, provider),
    requested_model = coalesce(requested_model, model),
    resolved_provider = coalesce(resolved_provider, output_json->>'provider', provider),
    resolved_model = coalesce(resolved_model, output_json->>'model', model);

alter table public.report_ai_attempts
  alter column requested_provider set not null,
  alter column requested_model set not null,
  drop constraint if exists report_ai_attempts_full_fingerprint_unique;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_full_fingerprint_unique unique (
    generation_identity, evidence_checksum, requested_provider, requested_model,
    prompt_version, schema_version, attempt_kind, attempt_number
  ),
  add constraint report_ai_attempts_resolved_identity_chk check (
    status not in ('succeeded','accounting_unverified')
    or (coalesce(trim(resolved_provider), '') <> '' and coalesce(trim(resolved_model), '') <> '')
  );

alter table public.report_generation_runs
  add column requested_provider text,
  add column requested_model text,
  add column resolved_provider text,
  add column resolved_model text;

update public.report_generation_runs
set requested_provider = case when generation_mode = 'deterministic_fallback' then null else coalesce(requested_provider, provider) end,
    requested_model = case when generation_mode = 'deterministic_fallback' then null else coalesce(requested_model, model) end,
    resolved_provider = case when generation_mode = 'deterministic_fallback' then null else coalesce(resolved_provider, provider) end,
    resolved_model = case when generation_mode = 'deterministic_fallback' then null else coalesce(resolved_model, model) end;

alter table public.report_generation_runs
  add constraint report_generation_runs_routing_identity_chk check (
    generation_mode = 'deterministic_fallback'
    or (
      coalesce(trim(requested_provider), '') <> '' and coalesce(trim(requested_model), '') <> ''
      and coalesce(trim(resolved_provider), '') <> '' and coalesce(trim(resolved_model), '') <> ''
    )
  );

-- 6. Durable object-cleanup queue. A path is recorded before publication and
-- every deletion attempt is leased, counted, and alertable.
create table public.phase14_storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null check (coalesce(trim(storage_bucket), '') <> ''),
  storage_path text not null check (storage_path like 'tmp/%'),
  expected_checksum text not null check (expected_checksum ~ '^[0-9a-f]{64}$'),
  claim_token uuid,
  report_id uuid references public.reports(id) on delete restrict,
  owner_admin_user_id uuid references public.admin_profiles(id) on delete restrict,
  owner_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  cleanup_reason text not null check (coalesce(trim(cleanup_reason), '') <> ''),
  status text not null default 'pending' check (status in ('pending','leased','failed','deleted','dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase14_storage_cleanup_owner_chk check (
    owner_admin_user_id is not null or owner_capability_id is not null
  ),
  constraint phase14_storage_cleanup_lease_chk check (
    (status = 'leased' and lease_owner_capability_id is not null and lease_token is not null and lease_expires_at is not null)
    or status <> 'leased'
  ),
  unique(storage_bucket, storage_path)
);
create index phase14_storage_cleanup_work_idx
  on public.phase14_storage_cleanup_queue(status, next_attempt_at, created_at)
  where status in ('pending','failed');
alter table public.phase14_storage_cleanup_queue enable row level security;
revoke all on table public.phase14_storage_cleanup_queue from public, anon, authenticated, service_role;
grant select on table public.phase14_storage_cleanup_queue to authenticated;
create policy phase14_storage_cleanup_admin_select on public.phase14_storage_cleanup_queue
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','reviewer','approver','read_only_admin'));

create or replace function public.register_phase14_storage_cleanup(
  p_storage_bucket text,
  p_storage_path text,
  p_expected_checksum text,
  p_claim_token uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_id uuid; v_capability_id uuid;
begin
  v_actor := public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  if p_storage_path not like 'tmp/%' then raise exception 'cleanup_temporary_path_required'; end if;
  if p_expected_checksum !~ '^[0-9a-f]{64}$' then raise exception 'cleanup_checksum_invalid'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'cleanup_reason_required'; end if;
  v_capability_id := nullif(v_actor->>'capability_id','')::uuid;
  insert into public.phase14_storage_cleanup_queue(
    storage_bucket, storage_path, expected_checksum, claim_token,
    owner_admin_user_id, owner_capability_id, cleanup_reason
  ) values (
    p_storage_bucket, p_storage_path, p_expected_checksum, p_claim_token,
    nullif(v_actor->>'user_id','')::uuid, v_capability_id, p_reason
  )
  on conflict (storage_bucket, storage_path) do update
  set updated_at = now()
  where public.phase14_storage_cleanup_queue.expected_checksum = excluded.expected_checksum
    and public.phase14_storage_cleanup_queue.claim_token is not distinct from excluded.claim_token
  returning id into v_id;
  if v_id is null then raise exception 'cleanup_path_ownership_conflict'; end if;
  return v_id;
end;
$$;

create or replace function public.link_phase14_storage_cleanup_report(
  p_cleanup_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_report public.reports%rowtype;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id for update;
  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception 'cleanup_report_missing'; end if;
  if v_queue.claim_token is not null and not exists (
    select 1 from public.report_generation_claims c
    where c.claim_token = v_queue.claim_token and c.report_id = p_report_id
  ) then raise exception 'cleanup_report_claim_binding_mismatch'; end if;
  update public.phase14_storage_cleanup_queue set report_id = p_report_id, updated_at = now() where id = p_cleanup_id;
  return true;
end;
$$;

create or replace function public.record_phase14_storage_cleanup_result(
  p_cleanup_id uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_queue public.phase14_storage_cleanup_queue%rowtype; v_attempt integer;
begin
  v_actor := public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id for update;
  if not found then raise exception 'cleanup_queue_item_missing'; end if;
  v_attempt := v_queue.attempt_count + 1;
  if p_deleted then
    update public.phase14_storage_cleanup_queue
    set status = 'deleted', attempt_count = v_attempt, last_attempt_at = now(), deleted_at = now(),
        last_error = null, lease_owner_capability_id = null, lease_token = null,
        lease_expires_at = null, updated_at = now()
    where id = p_cleanup_id;
  else
    if coalesce(trim(p_error), '') = '' then raise exception 'cleanup_error_required'; end if;
    update public.phase14_storage_cleanup_queue
    set status = case when v_attempt >= 5 then 'dead_letter' else 'failed' end,
        attempt_count = v_attempt, last_attempt_at = now(), last_error = p_error,
        next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(v_attempt, 7))::integer)),
        lease_owner_capability_id = null, lease_token = null, lease_expires_at = null, updated_at = now()
    where id = p_cleanup_id;
    insert into public.phase14_operational_alerts(
      alert_key, severity, category, report_id, detail_json
    ) values (
      'storage-cleanup:' || p_cleanup_id::text,
      case when v_attempt >= 5 then 'critical' else 'warning' end,
      'report_temporary_object_cleanup_failed', v_queue.report_id,
      jsonb_build_object('cleanup_id', p_cleanup_id, 'bucket', v_queue.storage_bucket,
        'path', v_queue.storage_path, 'attempt_count', v_attempt, 'error', p_error)
    ) on conflict (alert_key) do update
      set severity = excluded.severity, detail_json = excluded.detail_json, status = 'open';
  end if;
  return jsonb_build_object('cleanup_id', p_cleanup_id, 'deleted', p_deleted, 'attempt_count', v_attempt);
end;
$$;

create or replace function public.cleanup_expired_premium_report_claims(
  p_older_than interval default interval '24 hours'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer; v_queued integer;
begin
  perform public.phase14_require_security('storage_cleanup', array['platform_admin']::public.admin_role[], true, false);
  if p_older_than < interval '1 hour' or p_older_than > interval '30 days' then
    raise exception 'phase14_cleanup_retention_out_of_range';
  end if;
  with candidates as (
    select * from public.report_generation_claims
    where report_id is null and state in ('claimed','abandoned')
      and lease_expires_at < now() - p_older_than
    for update
  ), queued as (
    insert into public.phase14_storage_cleanup_queue(
      storage_bucket, storage_path, expected_checksum, claim_token,
      owner_capability_id, cleanup_reason
    )
    select temporary_storage_bucket, temporary_storage_path,
      coalesce(expected_checksum, repeat('0',64)), claim_token,
      nullif(current_setting('phase14.worker_capability_id', true),'')::uuid,
      'Expired generation claim cleanup'
    from candidates
    where temporary_storage_bucket is not null and temporary_storage_path is not null
    on conflict (storage_bucket, storage_path) do nothing
    returning 1
  ), deleted as (
    delete from public.report_generation_claims c using candidates x
    where c.claim_token = x.claim_token returning 1
  )
  select (select count(*) from deleted), (select count(*) from queued)
  into v_count, v_queued;
  return jsonb_build_object('deleted_claims', v_count, 'queued_cleanup_objects', v_queued);
end;
$$;

create or replace function public.claim_phase14_storage_cleanup_jobs(
  p_capability_id uuid,
  p_lease_token text,
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_work_lease uuid := gen_random_uuid(); v_jobs jsonb;
begin
  if p_limit < 1 or p_limit > 50 then raise exception 'cleanup_job_limit_out_of_range'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_lease_token, array['storage_cleanup'], null, null, null, null, null, null
  );
  with selected as (
    select id from public.phase14_storage_cleanup_queue
    where status in ('pending','failed') and next_attempt_at <= now() and attempt_count < 5
    order by created_at for update skip locked limit p_limit
  ), leased as (
    update public.phase14_storage_cleanup_queue q
    set status = 'leased', lease_owner_capability_id = p_capability_id,
        lease_token = v_work_lease, lease_expires_at = now() + interval '10 minutes', updated_at = now()
    from selected s where q.id = s.id
    returning q.id, q.storage_bucket, q.storage_path, q.expected_checksum, q.attempt_count
  )
  select coalesce(jsonb_agg(to_jsonb(leased)), '[]'::jsonb) into v_jobs from leased;
  return jsonb_build_object('work_lease_token', v_work_lease, 'jobs', v_jobs);
end;
$$;

create or replace function public.complete_phase14_storage_cleanup_job(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_cleanup_id uuid,
  p_work_lease_token uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_attempt integer;
begin
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_capability_lease_token, array['storage_cleanup'], null, null, null, null, null, null
  );
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id for update;
  if not found or v_queue.status <> 'leased' or v_queue.lease_owner_capability_id <> p_capability_id
     or v_queue.lease_token <> p_work_lease_token or v_queue.lease_expires_at <= now() then
    raise exception 'cleanup_job_lease_invalid';
  end if;
  v_attempt := v_queue.attempt_count + 1;
  update public.phase14_storage_cleanup_queue
  set status = case when p_deleted then 'deleted' when v_attempt >= 5 then 'dead_letter' else 'failed' end,
      attempt_count = v_attempt, last_attempt_at = now(),
      deleted_at = case when p_deleted then now() else null end,
      last_error = case when p_deleted then null else nullif(trim(p_error),'') end,
      next_attempt_at = case when p_deleted then next_attempt_at else now() + make_interval(secs => least(3600, 30 * (2 ^ least(v_attempt,7))::integer)) end,
      lease_owner_capability_id = null, lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_cleanup_id;
  if not p_deleted then
    if coalesce(trim(p_error), '') = '' then raise exception 'cleanup_error_required'; end if;
    insert into public.phase14_operational_alerts(alert_key,severity,category,report_id,detail_json)
    values ('storage-cleanup:' || p_cleanup_id::text,
      case when v_attempt >= 5 then 'critical' else 'warning' end,
      'report_temporary_object_cleanup_failed', v_queue.report_id,
      jsonb_build_object('cleanup_id',p_cleanup_id,'bucket',v_queue.storage_bucket,
        'path',v_queue.storage_path,'attempt_count',v_attempt,'error',p_error))
    on conflict (alert_key) do update
      set severity=excluded.severity,detail_json=excluded.detail_json,status='open';
  end if;
  return jsonb_build_object('cleanup_id',p_cleanup_id,'deleted',p_deleted,'attempt_count',v_attempt);
end;
$$;

-- 7. Complaint and bounce outcomes are separate. Complaints are permanently
-- non-retriable; a bounce requires a fresh AAL2 remediation record with evidence.
create table public.report_delivery_remediations (
  id uuid primary key default gen_random_uuid(),
  prior_email_event_id uuid not null references public.email_events(id) on delete restrict,
  report_id uuid not null references public.reports(id) on delete restrict,
  recipient_email citext not null,
  remediation_type text not null check (remediation_type = 'bounce_retry'),
  reason text not null check (coalesce(trim(reason), '') <> ''),
  evidence_json jsonb not null check (evidence_json <> '{}'::jsonb),
  authorised_by uuid not null references public.admin_profiles(id) on delete restrict,
  status text not null default 'authorised' check (status in ('authorised','consumed','revoked')),
  authorised_at timestamptz not null default now(),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.report_delivery_remediations enable row level security;
revoke all on table public.report_delivery_remediations from public,anon,authenticated,service_role;
grant select on table public.report_delivery_remediations to authenticated;
create policy report_delivery_remediations_admin_select on public.report_delivery_remediations
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','approver','reviewer','read_only_admin'));

alter table public.report_delivery_authorizations
  add constraint report_delivery_authorizations_bounce_remediation_fk
  foreign key (bounce_remediation_id) references public.report_delivery_remediations(id) on delete restrict;

create or replace function public.authorize_bounced_report_redelivery(
  p_prior_email_event_id uuid,
  p_reason text,
  p_evidence jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_event public.email_events%rowtype; v_id uuid;
begin
  v_actor := public.phase14_require_security(
    'email_resend', array['platform_admin','approver']::public.admin_role[], true, false
  );
  if coalesce(trim(p_reason),'') = '' or coalesce(p_evidence,'{}'::jsonb) = '{}'::jsonb then
    raise exception 'bounce_remediation_evidence_required';
  end if;
  select * into v_event from public.email_events where id = p_prior_email_event_id for share;
  if not found or v_event.status <> 'bounced' then raise exception 'bounce_remediation_event_ineligible'; end if;
  insert into public.report_delivery_remediations(
    prior_email_event_id, report_id, recipient_email, remediation_type,
    reason, evidence_json, authorised_by
  ) values (
    v_event.id, v_event.report_id, v_event.recipient_email, 'bounce_retry',
    p_reason, p_evidence, (v_actor->>'user_id')::uuid
  ) returning id into v_id;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_event.assessment_id,'report_delivery_remediations',v_id,
    'premium_report_bounce_retry_authorized',jsonb_build_object('prior_email_event_id',v_event.id,'reason',p_reason,'evidence',p_evidence));
  return v_id;
end;
$$;
-- 8. Publication requires a live generation lease. Capability-specific worker
-- facades activate scoped context; direct service-role execution stays revoked.
create or replace function public.publish_premium_report_generation(
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.report_generation_claims%rowtype;
  v_report public.reports%rowtype;
  v_order_reference text;
  v_object record;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token for update;
  if not found or v_claim.report_id <> p_report_id or v_claim.state <> 'committed' then
    raise exception 'generation_claim_report_mismatch';
  end if;
  if v_claim.lease_expires_at <= now() then raise exception 'generation_claim_expired_at_publication'; end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.status <> 'draft' then raise exception 'report_draft_missing'; end if;
  if v_report.order_id <> v_claim.order_id or v_report.assessment_id <> v_claim.assessment_id
     or v_report.score_run_id <> v_claim.score_run_id or v_report.version_number <> v_claim.version_number
     or v_report.checksum <> v_claim.expected_checksum then raise exception 'report_claim_binding_mismatch'; end if;
  select order_reference into v_order_reference from public.orders where id = v_claim.order_id;
  perform public.phase14_generation_entitlement(
    v_order_reference, v_claim.order_id, v_claim.assessment_id, v_claim.score_run_id, v_claim.score_input_hash
  );
  if v_claim.final_storage_path like 'tmp/%' or coalesce(v_claim.final_storage_path, '') = '' then
    raise exception 'final_storage_path_invalid';
  end if;
  select so.bucket_id, so.name, so.metadata into v_object
  from storage.objects so
  where so.bucket_id = v_claim.final_storage_bucket and so.name = v_claim.final_storage_path;
  if not found then raise exception 'final_storage_object_missing'; end if;
  if coalesce(v_object.metadata->>'mimetype', '') <> 'application/pdf' then
    raise exception 'final_storage_content_type_invalid';
  end if;
  if coalesce(v_object.metadata->>'sha256', v_object.metadata->'metadata'->>'sha256', '') <> v_claim.expected_checksum then
    raise exception 'final_storage_checksum_metadata_mismatch';
  end if;
  if v_report.supersedes_report_id is not null then
    update public.reports set status = 'superseded'
    where id = v_report.supersedes_report_id and status not in ('voided','superseded');
  end if;
  update public.reports
  set status = 'generated', storage_bucket = v_claim.final_storage_bucket,
      storage_path = v_claim.final_storage_path, updated_at = now()
  where id = p_report_id;
  delete from public.report_generation_claims where claim_token = p_claim_token;
  return jsonb_build_object(
    'report_id', p_report_id, 'report_reference', v_report.report_reference,
    'version_number', v_report.version_number, 'superseded_report_id', v_report.supersedes_report_id,
    'final_storage_bucket', v_claim.final_storage_bucket, 'final_storage_path', v_claim.final_storage_path
  );
end;
$$;

create or replace function public.worker_claim_premium_report_generation(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid,
  p_report_type public.report_type default 'essential_self_assessment'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_capability_lease_token,
    array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid, (v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid, p_fulfilment_id, null, null
  );
  return public.claim_premium_report_generation(
    p_order_reference, p_claim_owner, p_fulfilment_id, p_report_type
  );
end;
$$;

create or replace function public.worker_renew_premium_report_generation_lease(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  return public.renew_premium_report_generation_lease(p_claim_token);
end;
$$;

create or replace function public.worker_recover_premium_report_generation_claim(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,p_fulfilment_id,null,null
  );
  return public.recover_premium_report_generation_claim(p_order_reference,p_claim_owner);
end;
$$;

create or replace function public.worker_commit_premium_report_draft(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid,
  p_template_id uuid,
  p_storage_bucket text,
  p_temp_storage_path text,
  p_checksum text,
  p_generation_run_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  return public.commit_premium_report_draft(
    p_claim_token,p_template_id,p_storage_bucket,p_temp_storage_path,p_checksum,null,p_generation_run_id
  );
end;
$$;

create or replace function public.worker_publish_premium_report_generation(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,p_report_id,null
  );
  return public.publish_premium_report_generation(p_claim_token,p_report_id);
end;
$$;

create or replace function public.worker_abandon_premium_report_generation_claim(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_claim public.report_generation_claims%rowtype; v_result boolean;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then return false; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  v_result := public.abandon_premium_report_generation_claim(p_claim_token,p_reason);
  return v_result;
end;
$$;

create or replace function public.worker_register_phase14_storage_cleanup(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_storage_bucket text,
  p_storage_path text,
  p_expected_checksum text,
  p_claim_token uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  return public.register_phase14_storage_cleanup(
    p_storage_bucket,p_storage_path,p_expected_checksum,p_claim_token,p_reason
  );
end;
$$;

create or replace function public.worker_link_phase14_storage_cleanup_report(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_cleanup_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_report public.reports%rowtype; v_fulfilment_id uuid;
begin
  select * into v_report from public.reports where id = p_report_id;
  if not found then raise exception 'cleanup_report_missing'; end if;
  select fulfilment_id into v_fulfilment_id from public.reports where id = p_report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_fulfilment_id,p_report_id,null
  );
  return public.link_phase14_storage_cleanup_report(p_cleanup_id,p_report_id);
end;
$$;

create or replace function public.worker_record_phase14_storage_cleanup_result(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_cleanup_id uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id;
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_cap.order_id,v_cap.assessment_id,v_cap.score_run_id,v_cap.fulfilment_id,v_queue.report_id,null
  );
  return public.record_phase14_storage_cleanup_result(p_cleanup_id,p_deleted,p_error);
end;
$$;

-- 9. Delivery authorization distinguishes complaints, bounce remediation, and
-- manual versus automatic policy. Recipient override has its own policy.
drop function if exists public.authorize_premium_report_delivery(uuid,text,boolean,boolean,text);

create function public.authorize_premium_report_delivery(
  p_report_id uuid,
  p_recipient text,
  p_delivery_mode text default 'initial',
  p_allow_test_override boolean default false,
  p_provider text default 'resend',
  p_bounce_remediation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_context jsonb; v_gate_version integer; v_event public.email_events%rowtype;
  v_auth public.report_delivery_authorizations%rowtype; v_attempt integer; v_dedupe text;
  v_prior_bounce public.email_events%rowtype; v_remediation public.report_delivery_remediations%rowtype;
  v_worker_capability_id uuid;
begin
  if p_delivery_mode not in ('initial','bounce_retry') then
    raise exception 'delivery_mode_invalid';
  end if;
  v_actor := public.phase14_require_security(
    case when p_delivery_mode = 'bounce_retry' then 'email_resend' else 'email_delivery' end,
    array['platform_admin','approver']::public.admin_role[], true, false
  );
  if p_allow_test_override then perform public.phase14_require_policy('recipient_override'); end if;
  if coalesce(trim(p_provider), '') = '' then raise exception 'delivery_provider_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase14-delivery:' || p_report_id::text || ':' || lower(trim(p_recipient)), 0
  ));
  v_context := public.phase14_delivery_entitlement(p_report_id,p_recipient,p_allow_test_override,'email_delivery');
  v_gate_version := (v_actor->>'gate_version')::integer;
  v_worker_capability_id := nullif(v_actor->>'capability_id','')::uuid;

  if exists (
    select 1 from public.email_events where report_id = p_report_id
      and recipient_email = lower(trim(p_recipient)) and status = 'complained'
  ) then raise exception 'delivery_complaint_permanently_non_retriable'; end if;

  if exists (
    select 1 from public.email_events where report_id = p_report_id
      and recipient_email = lower(trim(p_recipient))
      and status in ('sending','provider_acceptance_uncertain','reconciliation_required')
  ) then raise exception 'delivery_provider_acceptance_unresolved'; end if;

  select * into v_prior_bounce from public.email_events
  where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
    and notification_type = 'premium_report_pdf' and status = 'bounced'
  order by created_at desc limit 1;
  if found and p_delivery_mode = 'bounce_retry' then
    select * into v_remediation from public.report_delivery_remediations
    where id = p_bounce_remediation_id and prior_email_event_id = v_prior_bounce.id
      and report_id = p_report_id and recipient_email = lower(trim(p_recipient))
      and remediation_type = 'bounce_retry' and status = 'authorised'
    for update;
    if not found then raise exception 'delivery_bounce_remediation_required'; end if;
  elsif p_delivery_mode = 'bounce_retry' then
    raise exception 'delivery_bounce_remediation_not_applicable';
  end if;

  if p_delivery_mode = 'initial' then
    select * into v_event from public.email_events
    where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
      and notification_type = 'premium_report_pdf'
      and status in ('sent','delivery_delayed','delivered','bounced','complained')
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('reused_existing_send',true,'email_event_id',v_event.id,
        'provider_message_id',v_event.provider_message_id,'status',v_event.status,
        'recipient',lower(trim(p_recipient)),'test_delivery',(v_context->>'test_delivery')::boolean);
    end if;
  end if;

  select count(*) + 1 into v_attempt from public.email_events
  where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
    and notification_type = 'premium_report_pdf';
  v_dedupe := 'premium-report-delivery:' || p_report_id || ':' || lower(trim(p_recipient)) || ':attempt-' || v_attempt;
  insert into public.email_events(
    assessment_id,order_id,report_id,recipient_email,template_key,notification_type,
    dedupe_key,provider_request_key,provider_idempotency_key,provider,status,attempt_number,metadata_json
  ) values (
    (v_context->>'assessment_id')::uuid,(v_context->>'order_id')::uuid,p_report_id,
    lower(trim(p_recipient)),'premium_report_pdf_v1','premium_report_pdf',v_dedupe,
    v_dedupe,v_dedupe,lower(trim(p_provider)),'queued',v_attempt,
    jsonb_build_object('attachment_checksum',v_context->>'report_checksum',
      'test_delivery',(v_context->>'test_delivery')::boolean,'bounce_remediation_id',p_bounce_remediation_id)
  ) returning * into v_event;
  insert into public.report_delivery_authorizations(
    report_id,report_checksum,recipient_email,order_id,assessment_id,score_run_id,
    security_gate_version,authorised_by,authorised_session_id,worker_capability_id,
    provider,email_event_id,test_delivery,bounce_remediation_id
  ) values (
    p_report_id,v_context->>'report_checksum',lower(trim(p_recipient)),
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,v_gate_version,nullif(v_actor->>'user_id','')::uuid,
    nullif(v_actor->>'session_id','')::uuid,v_worker_capability_id,
    lower(trim(p_provider)),v_event.id,(v_context->>'test_delivery')::boolean,p_bounce_remediation_id
  ) returning * into v_auth;
  if p_bounce_remediation_id is not null then
    update public.report_delivery_remediations
    set status = 'consumed', consumed_at = now() where id = p_bounce_remediation_id;
  end if;
  return jsonb_build_object(
    'reused_existing_send',false,'authorization_id',v_auth.id,'email_event_id',v_event.id,
    'provider_request_key',v_event.provider_request_key,'attempt_number',v_event.attempt_number,
    'recipient',v_auth.recipient_email,'test_delivery',v_auth.test_delivery,'status',v_auth.status
  );
end;
$$;

-- Revalidate the complete commercial and storage entitlement at the last
-- reversible point, immediately before provider dispatch.
create or replace function public.mark_premium_report_delivery_dispatch_started(
  p_authorization_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_context jsonb; v_security jsonb;
begin
  v_security := public.phase14_require_security(
    'automatic_delivery',array['platform_admin','approver']::public.admin_role[],true,false
  );
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status <> 'claimed' or v_auth.lease_token <> p_lease_token
     or v_auth.lease_expires_at <= now() then raise exception 'delivery_authorization_lease_invalid'; end if;
  if v_auth.security_gate_version <> (v_security->>'gate_version')::integer then
    raise exception 'delivery_authorization_gate_changed_at_dispatch';
  end if;
  v_context := public.phase14_delivery_entitlement(
    v_auth.report_id,v_auth.recipient_email::text,v_auth.test_delivery,'email_delivery'
  );
  if v_context->>'report_checksum' <> v_auth.report_checksum
     or (v_context->>'order_id')::uuid <> v_auth.order_id
     or (v_context->>'assessment_id')::uuid <> v_auth.assessment_id
     or (v_context->>'score_run_id')::uuid <> v_auth.score_run_id then
    raise exception 'delivery_authorization_binding_changed_at_dispatch';
  end if;
  if v_auth.test_delivery then perform public.phase14_require_policy('recipient_override'); end if;
  update public.report_delivery_authorizations
  set status='dispatching',dispatch_started_at=now(),updated_at=now() where id=v_auth.id;
  update public.email_events
  set status='sending',send_lease_token=p_lease_token,send_lease_expires_at=v_auth.lease_expires_at,
      delivery_updated_at=now(),error_message=null
  where id=v_auth.email_event_id and status='queued';
  if not found then raise exception 'delivery_email_event_not_queued'; end if;
  return true;
end;
$$;

-- Exact idempotent replay: every immutable binding must match. A mismatch is
-- retained as a critical alert and returns a non-mutating conflict result.
create or replace function public.finalize_premium_report_delivery(
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth public.report_delivery_authorizations%rowtype;
  v_existing public.report_delivery_finalizations%rowtype;
  v_report public.reports%rowtype; v_now timestamptz := now(); v_context jsonb;
begin
  perform public.phase14_require_security(
    'delivery_finalization',array['platform_admin','approver']::public.admin_role[],true,false
  );
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id for update;
  if not found or v_auth.email_event_id <> p_email_event_id then raise exception 'delivery_finalization_binding_mismatch'; end if;
  if coalesce(trim(p_provider_message_id),'') = '' then raise exception 'provider_message_id_required'; end if;
  select * into v_existing from public.report_delivery_finalizations where authorization_id=p_authorization_id;
  if found then
    if v_existing.authorization_id = p_authorization_id
       and v_existing.email_event_id = p_email_event_id
       and v_existing.report_id = v_auth.report_id
       and v_existing.provider = v_auth.provider
       and v_existing.provider_message_id = p_provider_message_id then
      return jsonb_build_object('finalized',true,'idempotent_replay',true,
        'report_id',v_existing.report_id,'email_event_id',v_existing.email_event_id);
    end if;
    insert into public.phase14_operational_alerts(alert_key,severity,category,report_id,email_event_id,detail_json)
    values ('delivery-finalization-replay-conflict:' || p_authorization_id::text,'critical',
      'delivery_finalization_replay_conflict',v_auth.report_id,p_email_event_id,
      jsonb_build_object('authorization_id',p_authorization_id,'incoming_email_event_id',p_email_event_id,
        'incoming_provider',v_auth.provider,'incoming_provider_message_id',p_provider_message_id,
        'persisted',to_jsonb(v_existing)))
    on conflict (alert_key) do update set severity='critical',detail_json=excluded.detail_json,status='open';
    return jsonb_build_object('finalized',false,'conflict',true,'reason','delivery_finalization_replay_conflict');
  end if;
  if v_auth.status not in ('dispatching','reconciliation_required') then
    raise exception 'delivery_finalization_state_invalid:%',v_auth.status;
  end if;
  v_context := public.phase14_delivery_entitlement(
    v_auth.report_id,v_auth.recipient_email::text,v_auth.test_delivery,'email_delivery'
  );
  if v_context->>'report_checksum' <> v_auth.report_checksum then raise exception 'delivery_finalization_entitlement_changed'; end if;
  select * into v_report from public.reports where id=v_auth.report_id for update;
  if not found then raise exception 'delivery_finalization_report_missing'; end if;
  update public.email_events
  set status='sent',provider=v_auth.provider,provider_message_id=p_provider_message_id,
      sent_at=coalesce(sent_at,v_now),delivery_updated_at=v_now,send_lease_token=null,
      send_lease_expires_at=null,error_message=null
  where id=p_email_event_id and status in ('sending','provider_acceptance_uncertain','reconciliation_required');
  if not found then raise exception 'delivery_finalization_email_cas_failed'; end if;
  if not v_auth.test_delivery then
    update public.reports set status='released',released_at=coalesce(released_at,v_now),updated_at=v_now
    where id=v_report.id and status not in ('draft','superseded','voided');
    if not found then raise exception 'delivery_finalization_report_cas_failed'; end if;
    if v_report.fulfilment_id is not null then
      update public.report_fulfilments
      set status='completed',current_step='email_sent',completed_at=coalesce(completed_at,v_now),
          report_id=v_report.id,updated_at=v_now
      where id=v_report.fulfilment_id and status not in ('cancelled','completed');
    end if;
  end if;
  insert into public.report_delivery_finalizations(
    authorization_id,email_event_id,report_id,provider,provider_message_id,finalized_at
  ) values (v_auth.id,p_email_event_id,v_report.id,v_auth.provider,p_provider_message_id,v_now);
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,case when v_auth.test_delivery then 'email_test_sent' else 'email_sent' end,
    v_auth.authorised_by,'Atomic provider-acceptance finalization.',
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'test_delivery',v_auth.test_delivery,
      'worker_capability_id',v_auth.worker_capability_id));
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values (case when v_auth.worker_capability_id is null then 'admin'::public.audit_actor_type else 'system'::public.audit_actor_type end,
    v_auth.authorised_by,v_auth.assessment_id,'reports',v_report.id,
    case when v_auth.test_delivery then 'premium_report_test_delivery_finalized' else 'premium_report_delivery_finalized' end,
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'worker_capability_id',v_auth.worker_capability_id));
  if not v_auth.test_delivery then
    insert into public.assessment_events(assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json)
    values (v_auth.assessment_id,v_auth.order_id,v_report.id,'report_emailed_to_customer',
      'phase14-delivery-finalization:' || v_auth.id,
      jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,'test_delivery',false));
  end if;
  update public.report_delivery_authorizations
  set status='finalized',provider_message_id=p_provider_message_id,finalized_at=v_now,
      lease_token=null,lease_expires_at=null,updated_at=v_now where id=v_auth.id;
  return jsonb_build_object('finalized',true,'idempotent_replay',false,
    'report_id',v_report.id,'email_event_id',p_email_event_id);
end;
$$;

-- Controlled operator reconciliation. Accepted requires a verified provider
-- correlation and canonical ID; not-accepted requires explicit AAL2 override.
create or replace function public.resolve_premium_report_delivery_reconciliation(
  p_authorization_id uuid,
  p_resolution text,
  p_provider_message_id text,
  p_correlation_evidence jsonb,
  p_operator_override boolean default false,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_auth public.report_delivery_authorizations%rowtype; v_event public.email_events%rowtype; v_result jsonb;
begin
  v_actor := public.phase14_require_security(
    'provider_reconciliation',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_resolution not in ('accepted','not_accepted') then raise exception 'delivery_reconciliation_resolution_invalid'; end if;
  if coalesce(p_correlation_evidence,'{}'::jsonb)='{}'::jsonb or coalesce(trim(p_reason),'')='' then
    raise exception 'delivery_reconciliation_evidence_required';
  end if;
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id for update;
  if not found or v_auth.status <> 'reconciliation_required' then raise exception 'delivery_reconciliation_state_invalid'; end if;
  select * into v_event from public.email_events where id=v_auth.email_event_id for update;
  if p_resolution='accepted' then
    if coalesce(trim(p_provider_message_id),'')='' then raise exception 'delivery_reconciliation_provider_id_required'; end if;
    if coalesce(p_correlation_evidence->>'provider_request_key','') <> coalesce(v_event.provider_request_key,'')
       or coalesce(p_correlation_evidence->>'verification_method','')='' then
      raise exception 'delivery_reconciliation_correlation_unverified';
    end if;
    v_result := public.finalize_premium_report_delivery(v_auth.id,v_auth.email_event_id,p_provider_message_id);
  else
    if not p_operator_override then raise exception 'delivery_reconciliation_operator_override_required'; end if;
    update public.report_delivery_authorizations
    set status='revoked',revoked_reason=p_reason,lease_token=null,lease_expires_at=null,updated_at=now()
    where id=v_auth.id;
    update public.email_events
    set status='failed_before_provider',error_message=p_reason,reconciliation_attempted_at=now(),
        reconciliation_result_json=p_correlation_evidence,delivery_updated_at=now()
    where id=v_auth.email_event_id and status='reconciliation_required';
    v_result := jsonb_build_object('resolved',true,'resolution','not_accepted','authorization_id',v_auth.id);
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_auth.assessment_id,'report_delivery_authorizations',v_auth.id,
    'premium_report_delivery_reconciliation_resolved',jsonb_build_object('resolution',p_resolution,
      'provider_message_id',p_provider_message_id,'operator_override',p_operator_override,
      'reason',p_reason,'evidence',p_correlation_evidence));
  return v_result;
end;
$$;

-- Capability-specific automatic delivery facades.
create or replace function public.worker_authorize_premium_report_delivery(
  p_capability_id uuid,p_capability_lease_token text,p_report_id uuid,p_recipient text,p_provider text default 'resend'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_report public.reports%rowtype; v_fulfilment_id uuid;
begin
  select * into v_report from public.reports where id=p_report_id;
  if not found then raise exception 'report_not_found'; end if;
  v_fulfilment_id := v_report.fulfilment_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_fulfilment_id,p_report_id,p_recipient
  );
  return public.authorize_premium_report_delivery(p_report_id,p_recipient,'initial',false,p_provider,null);
end;
$$;

create or replace function public.worker_claim_premium_report_delivery(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.claim_premium_report_delivery(p_authorization_id);
end;
$$;

create or replace function public.worker_mark_premium_report_delivery_dispatch_started(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,p_delivery_lease_token uuid
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_dispatch_started(p_authorization_id,p_delivery_lease_token);
end;
$$;

create or replace function public.worker_fail_premium_report_delivery_before_dispatch(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,
  p_delivery_lease_token uuid,p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.fail_premium_report_delivery_before_dispatch(p_authorization_id,p_delivery_lease_token,p_reason);
end;
$$;

create or replace function public.worker_finalize_premium_report_delivery(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,
  p_email_event_id uuid,p_provider_message_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.finalize_premium_report_delivery(p_authorization_id,p_email_event_id,p_provider_message_id);
end;
$$;

create or replace function public.worker_mark_premium_report_delivery_reconciliation_required(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,
  p_provider_message_id text,p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_reconciliation_required(
    p_authorization_id,p_provider_message_id,p_reason
  );
end;
$$;

create or replace function public.worker_recover_stale_premium_report_email_send(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_authorization_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id for update;
  if not found then raise exception 'delivery_authorization_missing'; end if;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,
    v_auth.report_id,v_auth.recipient_email::text
  );
  if v_auth.status <> 'dispatching' or v_auth.lease_expires_at >= now() then
    raise exception 'delivery_authorization_not_stale';
  end if;
  update public.report_delivery_authorizations set status='reconciliation_required',updated_at=now()
  where id=v_auth.id and status='dispatching' and lease_expires_at<now();
  update public.email_events
  set status='reconciliation_required',reconciliation_required_at=coalesce(reconciliation_required_at,now()),
      delivery_updated_at=now(),error_message='Dispatch lease expired; provider acceptance remains unresolved.'
  where id=v_auth.email_event_id and status='sending' and send_lease_expires_at<now();
  return true;
end;
$$;

create or replace function public.worker_cleanup_expired_premium_report_claims(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_older_than interval default interval '24 hours'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['storage_cleanup'],null,null,null,null,null,null
  );
  return public.cleanup_expired_premium_report_claims(p_older_than);
end;
$$;

create or replace function public.assert_premium_report_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.phase14_require_security(
    'email_delivery',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_allow_test_override then perform public.phase14_require_policy('recipient_override'); end if;
  return public.phase14_delivery_entitlement(p_report_id,p_recipient,p_allow_test_override,'email_delivery');
end;
$$;

-- Remove every broad service-role path. Only the worker facade functions below
-- are executable by service_role; every facade requires a live scoped lease.
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.guard_phase14_security_gate_mutation()',
    'public.guard_phase14_feature_policy_row_mutation()',
    'public.phase14_require_policy(text)',
    'public.phase14_activate_worker_capability(uuid,text,text[],uuid,uuid,uuid,uuid,uuid,text)',
    'public.phase14_require_actor(text,public.admin_role[],boolean)',
    'public.phase14_require_security(text,public.admin_role[],boolean,boolean)',
    'public.phase14_generation_entitlement(text,uuid,uuid,uuid,text)',
    'public.phase14_delivery_entitlement(uuid,text,boolean,text)',
    'public.guard_phase14_feature_policy_mutation()'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,authenticated,service_role';
  end loop;

  foreach v_signature in array array[
    'public.set_phase14_security_gate_version(integer,text)',
    'public.set_phase14_feature_policy(text,boolean,text)',
    'public.update_phase14_feature_policy(text,jsonb)',
    'public.authorize_phase14_action(text)',
    'public.authorize_phase14_worker_operation(text,text,uuid,uuid,uuid,uuid,uuid,text,integer,text)',
    'public.assert_premium_report_generation_entitlement(text)',
    'public.claim_premium_report_generation(text,text,uuid,public.report_type)',
    'public.renew_premium_report_generation_lease(uuid)',
    'public.recover_premium_report_generation_claim(text,text)',
    'public.commit_premium_report_draft(uuid,uuid,text,text,text,uuid,uuid)',
    'public.publish_premium_report_generation(uuid,uuid)',
    'public.abandon_premium_report_generation_claim(uuid,text)',
    'public.register_phase14_storage_cleanup(text,text,text,uuid,text)',
    'public.link_phase14_storage_cleanup_report(uuid,uuid)',
    'public.record_phase14_storage_cleanup_result(uuid,boolean,text)',
    'public.assert_premium_report_delivery_entitlement(uuid,text,boolean)',
    'public.assert_premium_report_download_entitlement(uuid,text)',
    'public.authorize_bounced_report_redelivery(uuid,text,jsonb)',
    'public.authorize_premium_report_delivery(uuid,text,text,boolean,text,uuid)',
    'public.claim_premium_report_delivery(uuid)',
    'public.mark_premium_report_delivery_dispatch_started(uuid,uuid)',
    'public.fail_premium_report_delivery_before_dispatch(uuid,uuid,text)',
    'public.finalize_premium_report_delivery(uuid,uuid,text)',
    'public.mark_premium_report_delivery_reconciliation_required(uuid,text,text)',
    'public.resolve_premium_report_delivery_reconciliation(uuid,text,text,jsonb,boolean,text)'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,service_role';
    execute 'grant execute on function ' || v_signature || ' to authenticated';
  end loop;

  foreach v_signature in array array[
    'public.claim_phase14_worker_capability(uuid,text)',
    'public.authorize_phase14_worker_action(uuid,text,text)',
    'public.complete_phase14_worker_capability(uuid,text)',
    'public.worker_claim_premium_report_generation(uuid,text,text,text,uuid,public.report_type)',
    'public.worker_renew_premium_report_generation_lease(uuid,text,uuid)',
    'public.worker_recover_premium_report_generation_claim(uuid,text,text,text,uuid)',
    'public.worker_commit_premium_report_draft(uuid,text,uuid,uuid,text,text,text,uuid)',
    'public.worker_publish_premium_report_generation(uuid,text,uuid,uuid)',
    'public.worker_abandon_premium_report_generation_claim(uuid,text,uuid,text)',
    'public.worker_register_phase14_storage_cleanup(uuid,text,text,text,text,uuid,text)',
    'public.worker_link_phase14_storage_cleanup_report(uuid,text,uuid,uuid)',
    'public.worker_record_phase14_storage_cleanup_result(uuid,text,uuid,boolean,text)',
    'public.worker_authorize_premium_report_delivery(uuid,text,uuid,text,text)',
    'public.worker_claim_premium_report_delivery(uuid,text,uuid)',
    'public.worker_mark_premium_report_delivery_dispatch_started(uuid,text,uuid,uuid)',
    'public.worker_fail_premium_report_delivery_before_dispatch(uuid,text,uuid,uuid,text)',
    'public.worker_finalize_premium_report_delivery(uuid,text,uuid,uuid,text)',
    'public.worker_mark_premium_report_delivery_reconciliation_required(uuid,text,uuid,text,text)',
    'public.worker_recover_stale_premium_report_email_send(uuid,text,uuid)',
    'public.worker_cleanup_expired_premium_report_claims(uuid,text,interval)',
    'public.claim_phase14_storage_cleanup_jobs(uuid,text,integer)',
    'public.complete_phase14_storage_cleanup_job(uuid,text,uuid,uuid,boolean,text)'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,authenticated';
    execute 'grant execute on function ' || v_signature || ' to service_role';
  end loop;

  foreach v_signature in array array[
    'public.cleanup_expired_premium_report_claims(interval)',
    'public.recover_stale_premium_report_email_sends()'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,authenticated,service_role';
  end loop;
end;
$$;

comment on table public.phase14_worker_capabilities is
  'AAL2-human-issued, operation-bound authority. Raw issue and lease secrets are never stored.';
comment on table public.phase14_storage_cleanup_queue is
  'Durable temporary-object deletion queue with bounded retries, leases, checksums and alerts.';
comment on index public.reports_one_current_assessment_type_uidx is
  'At most one current generated/review/approved/released report per assessment and report type.';

drop trigger if exists trg_guard_phase14_security_gate_rows on public.phase14_security_gates;
create trigger trg_guard_phase14_security_gate_rows
  before insert or update or delete on public.phase14_security_gates
  for each row execute function public.guard_phase14_security_gate_mutation();

drop trigger if exists trg_guard_phase14_security_gate_truncate on public.phase14_security_gates;
create trigger trg_guard_phase14_security_gate_truncate
  before truncate on public.phase14_security_gates
  for each statement execute function public.guard_phase14_security_gate_mutation();

-- END ARCHIVED SOURCE: uat-applied/20260714214023_phase14_fourth_adversarial_remediation.sql

-- BEGIN ARCHIVED SOURCE: unpublished-remediation/20260715022146_phase14_fifth_adversarial_remediation.sql
-- Phase 14 fifth adversarial remediation.
-- Forward-only repair layered after the exact migration blob already applied in UAT.
-- Every commercial/runtime policy remains disabled. This migration does not satisfy
-- the Phase 14 gate, provision provider secrets, or enable any production path.


-- The UAT-applied historical migration ended its transaction before installing the
-- webhook function. Reinstall the final function inside this forward transaction so
-- fresh and UAT-shaped databases converge without changing historical bytes.
do $$
begin
  if to_regprocedure('public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb)') is null then
    raise exception 'phase14_historical_webhook_function_missing';
  end if;
end;
$$;

-- 1. Exact-version policies. A gate change or suspension invalidates every policy
-- approval and every unconsumed worker operation immediately.
alter table public.phase14_feature_policies
  drop constraint if exists phase14_feature_policies_policy_key_check;

alter table public.phase14_feature_policies
  add constraint phase14_feature_policies_policy_key_check check (policy_key in (
    'manual_generation',
    'automatic_fulfilment',
    'ai_narrative',
    'automatic_email',
    'manual_delivery',
    'manual_download',
    'recipient_override',
    'provider_webhook_ingestion',
    'storage_cleanup'
  )),
  add column approved_gate_version integer check (approved_gate_version is null or approved_gate_version > 0),
  add column approved_at timestamptz;

set local session_replication_role = replica;

update public.phase14_feature_policies
set enabled = false,
    approved_gate_version = null,
    approved_at = null,
    reason = 'Disabled by fifth adversarial remediation pending exact-version approval.',
    updated_at = now();

insert into public.phase14_feature_policies(policy_key, enabled, reason)
values
  ('manual_download', false, 'Disabled by fifth adversarial remediation pending exact-version approval.'),
  ('provider_webhook_ingestion', false, 'Disabled by fifth adversarial remediation pending exact-version approval.')
on conflict (policy_key) do update
set enabled = false,
    approved_gate_version = null,
    approved_at = null,
    reason = excluded.reason,
    updated_at = now();

set local session_replication_role = origin;

create or replace function public.phase14_require_actor(
  p_action text,
  p_allowed_roles public.admin_role[],
  p_require_aal2 boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_profile public.admin_profiles%rowtype;
  v_session_id uuid;
  v_exp bigint;
begin
  if v_user_id is null then raise exception 'phase14_no_session:%', p_action; end if;
  v_exp := nullif(v_claims->>'exp', '')::bigint;
  if v_exp is null or to_timestamp(v_exp) <= now() then
    raise exception 'phase14_session_expired:%', p_action;
  end if;
  begin
    v_session_id := nullif(v_claims->>'session_id', '')::uuid;
  exception when others then
    raise exception 'phase14_session_id_invalid:%', p_action;
  end;
  if v_session_id is null then raise exception 'phase14_session_id_required:%', p_action; end if;
  if not exists (
    select 1
    from auth.sessions s
    where s.id = v_session_id
      and s.user_id = v_user_id
      and (s.not_after is null or s.not_after > now())
  ) then
    raise exception 'phase14_session_revoked_or_expired:%', p_action;
  end if;

  select * into v_profile from public.admin_profiles where id = v_user_id;
  if not found then raise exception 'phase14_profile_missing:%', p_action; end if;
  if v_profile.status = 'revoked' then raise exception 'phase14_profile_revoked:%', p_action; end if;
  if v_profile.status <> 'active' then raise exception 'phase14_profile_inactive:%', p_action; end if;
  if not (v_profile.role = any(p_allowed_roles)) then raise exception 'phase14_role_forbidden:%', p_action; end if;
  if p_require_aal2 and coalesce(v_claims->>'aal', 'aal1') <> 'aal2' then
    raise exception 'phase14_aal2_required:%', p_action;
  end if;

  return jsonb_build_object(
    'user_id', v_user_id,
    'role', v_profile.role,
    'aal', coalesce(v_claims->>'aal', 'aal1'),
    'session_id', v_session_id
  );
end;
$$;

-- 9. Cleanup execution is leased to an opaque capability and every success is
-- independently verified against the exact bucket, path and checksum.
alter table public.phase14_storage_cleanup_queue
  add column deletion_verified_at timestamptz,
  add column dead_lettered_at timestamptz;

alter table public.phase14_storage_cleanup_queue
  drop constraint phase14_storage_cleanup_queue_storage_path_check,
  add constraint phase14_storage_cleanup_queue_storage_path_check check (
    storage_path like 'tmp/%' or storage_path like 'reports/%'
  );

create or replace function public.cleanup_expired_premium_report_claims(
  p_older_than interval default interval '24 hours'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_count integer; v_queued integer; v_unresolved integer;
begin
  perform public.phase14_require_security('storage_cleanup',array['platform_admin']::public.admin_role[],true,false);
  if p_older_than < interval '1 hour' or p_older_than > interval '30 days' then
    raise exception 'phase14_cleanup_retention_out_of_range';
  end if;
  with candidates as (
    select * from public.report_generation_claims
    where report_id is null and state in ('claimed','abandoned')
      and lease_expires_at < now()-p_older_than for update
  ), unresolved as (
    select * from candidates where temporary_storage_path is not null
      and coalesce(expected_checksum,'') !~ '^[0-9a-f]{64}$'
  ), alerted as (
    insert into public.phase14_operational_alerts(alert_key,severity,category,detail_json)
    select 'storage-cleanup-unbound:'||claim_token,'critical',
      'storage_cleanup_verification_failed',
      jsonb_build_object('claim_token',claim_token,'bucket',temporary_storage_bucket,
        'path',temporary_storage_path,'reason','expected_checksum_missing')
    from unresolved on conflict(alert_key) do update set status='open',detail_json=excluded.detail_json
    returning 1
  ), queued as (
    insert into public.phase14_storage_cleanup_queue(
      storage_bucket,storage_path,expected_checksum,claim_token,owner_capability_id,cleanup_reason
    ) select temporary_storage_bucket,temporary_storage_path,expected_checksum,claim_token,
        nullif(current_setting('phase14.worker_capability_id',true),'')::uuid,
        'Expired generation claim cleanup'
      from candidates where temporary_storage_bucket is not null
        and temporary_storage_path is not null and expected_checksum ~ '^[0-9a-f]{64}$'
    on conflict(storage_bucket,storage_path) do nothing returning claim_token
  ), deleted as (
    delete from public.report_generation_claims c using candidates x
    where c.claim_token=x.claim_token and (
      x.temporary_storage_path is null or exists(select 1 from queued q where q.claim_token=x.claim_token)
      or exists(select 1 from public.phase14_storage_cleanup_queue q where q.claim_token=x.claim_token)
    ) returning 1
  ) select (select count(*) from deleted),(select count(*) from queued),(select count(*) from unresolved)
    into v_count,v_queued,v_unresolved;
  return jsonb_build_object('deleted_claims',v_count,'queued_cleanup_objects',v_queued,
    'unresolved_checksum_claims',v_unresolved);
end;
$$;

create or replace function public.worker_cleanup_expired_premium_report_claims(
  p_capability_id uuid,p_older_than interval default interval '24 hours'
) returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  perform public.phase14_activate_worker_operation(p_capability_id,array['storage_cleanup'],null,null,null,null,null,null);
  return public.cleanup_expired_premium_report_claims(p_older_than);
end;
$$;

create or replace function public.claim_phase14_storage_cleanup_jobs(
  p_capability_id uuid,p_limit integer default 10
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_work_lease uuid:=gen_random_uuid(); v_jobs jsonb;
begin
  if p_limit<1 or p_limit>50 then raise exception 'cleanup_job_limit_out_of_range'; end if;
  perform public.phase14_activate_worker_operation(p_capability_id,array['storage_cleanup'],null,null,null,null,null,null);
  with selected as (
    select id from public.phase14_storage_cleanup_queue
    where ((status in ('pending','failed') and next_attempt_at<=now())
      or (status='leased' and lease_expires_at<=now())) and attempt_count<5
    order by created_at for update skip locked limit p_limit
  ), leased as (
    update public.phase14_storage_cleanup_queue q set status='leased',
      lease_owner_capability_id=p_capability_id,lease_token=v_work_lease,
      lease_expires_at=now()+interval '10 minutes',updated_at=now()
    from selected s where q.id=s.id
    returning q.id,q.storage_bucket,q.storage_path,q.expected_checksum,q.attempt_count
  ) select coalesce(jsonb_agg(to_jsonb(leased)),'[]'::jsonb) into v_jobs from leased;
  return jsonb_build_object('work_lease_token',v_work_lease,'jobs',v_jobs);
end;
$$;

create or replace function public.complete_phase14_storage_cleanup_job(
  p_capability_id uuid,p_cleanup_id uuid,p_work_lease_token uuid,
  p_expected_bucket text,p_expected_path text,p_expected_checksum text,
  p_deleted boolean,p_deletion_verified boolean,p_error text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_attempt integer;
begin
  perform public.phase14_activate_worker_operation(p_capability_id,array['storage_cleanup'],null,null,null,null,null,null);
  select * into v_queue from public.phase14_storage_cleanup_queue where id=p_cleanup_id for update;
  if not found or v_queue.status<>'leased' or v_queue.lease_owner_capability_id<>p_capability_id
    or v_queue.lease_token<>p_work_lease_token or v_queue.lease_expires_at<=now() then
    raise exception 'cleanup_job_lease_invalid';
  end if;
  if v_queue.storage_bucket is distinct from p_expected_bucket
     or v_queue.storage_path is distinct from p_expected_path
     or v_queue.expected_checksum is distinct from p_expected_checksum then
    raise exception 'cleanup_job_object_binding_invalid';
  end if;
  if p_deleted and not p_deletion_verified then raise exception 'cleanup_deletion_verification_required'; end if;
  if not p_deleted and coalesce(trim(p_error),'')='' then raise exception 'cleanup_error_required'; end if;
  v_attempt:=v_queue.attempt_count+1;
  update public.phase14_storage_cleanup_queue set
    status=case when p_deleted then 'deleted' when v_attempt>=5 then 'dead_letter' else 'failed' end,
    attempt_count=v_attempt,last_attempt_at=now(),deleted_at=case when p_deleted then now() end,
    deletion_verified_at=case when p_deleted then now() end,
    dead_lettered_at=case when not p_deleted and v_attempt>=5 then now() end,
    last_error=case when p_deleted then null else p_error end,
    next_attempt_at=case when p_deleted then next_attempt_at else now()+make_interval(secs=>least(3600,30*(2^least(v_attempt,7))::integer)) end,
    lease_owner_capability_id=null,lease_token=null,lease_expires_at=null,updated_at=now()
  where id=p_cleanup_id;
  if not p_deleted then
    insert into public.phase14_operational_alerts(alert_key,severity,category,report_id,detail_json)
    values('storage-cleanup:'||p_cleanup_id,case when v_attempt>=5 then 'critical' else 'warning' end,
      'report_temporary_object_cleanup_failed',v_queue.report_id,
      jsonb_build_object('cleanup_id',p_cleanup_id,'capability_id',p_capability_id,
        'work_lease',p_work_lease_token,'bucket',v_queue.storage_bucket,'path',v_queue.storage_path,
        'checksum',v_queue.expected_checksum,'attempt_count',v_attempt,'error',p_error))
    on conflict(alert_key) do update set severity=excluded.severity,detail_json=excluded.detail_json,status='open';
  end if;
  return jsonb_build_object('cleanup_id',p_cleanup_id,'deleted',p_deleted,
    'deletion_verified',p_deletion_verified,'attempt_count',v_attempt,
    'dead_letter',not p_deleted and v_attempt>=5);
end;
$$;

-- 10. AI routing is separately approved for the exact gate version. Attempt
-- persistence is a database transition and resolved identity must come from
-- gateway/provider response metadata.
create table public.phase14_ai_route_policies(
  requested_provider text primary key,
  enabled boolean not null default false,
  approved_gate_version integer,
  approved_by uuid references public.admin_profiles(id) on delete restrict,
  approved_session_id uuid,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint phase14_ai_route_approval_chk check (
    (not enabled) or (approved_gate_version is not null and approved_by is not null
      and approved_session_id is not null and approved_at is not null)
  )
);
insert into public.phase14_ai_route_policies(requested_provider,enabled) values('openai',false);
alter table public.phase14_ai_route_policies enable row level security;
revoke all on public.phase14_ai_route_policies from public,anon,authenticated,service_role;
grant select on public.phase14_ai_route_policies to authenticated,service_role;

create or replace function public.set_phase14_ai_route_policy(p_provider text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor jsonb; v_gate public.phase14_security_gates%rowtype; v_row public.phase14_ai_route_policies%rowtype;
begin
  v_actor:=public.phase14_require_actor('ai_route_policy_change',array['platform_admin']::public.admin_role[],true);
  select * into v_gate from public.phase14_security_gates where gate_key='phase14-premium-report' for share;
  if p_enabled and (v_gate.status<>'satisfied' or v_gate.satisfied_version<>v_gate.required_version) then
    raise exception 'phase14_security_gate_not_satisfied'; end if;
  insert into public.phase14_ai_route_policies(requested_provider,enabled,approved_gate_version,
    approved_by,approved_session_id,approved_at)
  values(lower(trim(p_provider)),p_enabled,case when p_enabled then v_gate.satisfied_version end,
    case when p_enabled then (v_actor->>'user_id')::uuid end,
    case when p_enabled then (v_actor->>'session_id')::uuid end,case when p_enabled then now() end)
  on conflict(requested_provider) do update set enabled=excluded.enabled,
    approved_gate_version=excluded.approved_gate_version,approved_by=excluded.approved_by,
    approved_session_id=excluded.approved_session_id,approved_at=excluded.approved_at,updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.claim_phase14_ai_attempt(p_capability_id uuid,p_attempt jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_f public.report_fulfilments%rowtype; v_route public.phase14_ai_route_policies%rowtype;
  v_row public.report_ai_attempts%rowtype; v_n integer;
begin
  select * into v_f from public.report_fulfilments where id=(p_attempt->>'fulfilment_id')::uuid for share;
  if not found then raise exception 'phase14_ai_fulfilment_missing'; end if;
  perform public.phase14_activate_worker_operation(p_capability_id,array['automatic_generation','generation_recovery'],
    v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null);
  perform public.phase14_require_policy('ai_narrative');
  select * into v_route from public.phase14_ai_route_policies
    where requested_provider=lower(p_attempt->>'requested_provider') for share;
  if not found or not v_route.enabled or v_route.approved_gate_version<>(
    select required_version from public.phase14_security_gates where gate_key='phase14-premium-report'
  ) then raise exception 'phase14_ai_provider_route_disabled'; end if;
  select coalesce(max(attempt_number),0)+1 into v_n from public.report_ai_attempts
   where generation_identity=p_attempt->>'generation_identity'
     and evidence_checksum=p_attempt->>'evidence_checksum'
     and requested_provider=p_attempt->>'requested_provider'
     and requested_model=p_attempt->>'requested_model'
     and prompt_version=p_attempt->>'prompt_version' and schema_version=p_attempt->>'schema_version'
     and attempt_kind=p_attempt->>'attempt_kind';
  if v_n>2 then raise exception 'phase14_ai_attempt_limit_reached'; end if;
  insert into public.report_ai_attempts(generation_identity,fulfilment_id,attempt_kind,attempt_number,
    provider_request_key,provider,model,requested_provider,requested_model,evidence_checksum,
    prompt_version,schema_version,input_size_bytes,estimated_input_tokens,max_output_tokens,
    max_estimated_cost_micros,timeout_ms,status,accounting_status)
  values(p_attempt->>'generation_identity',v_f.id,p_attempt->>'attempt_kind',v_n,
    p_attempt->>'provider_request_key',p_attempt->>'requested_provider',p_attempt->>'requested_model',
    p_attempt->>'requested_provider',p_attempt->>'requested_model',p_attempt->>'evidence_checksum',
    p_attempt->>'prompt_version',p_attempt->>'schema_version',(p_attempt->>'input_size_bytes')::integer,
    (p_attempt->>'estimated_input_tokens')::integer,(p_attempt->>'max_output_tokens')::integer,
    (p_attempt->>'max_estimated_cost_micros')::bigint,(p_attempt->>'timeout_ms')::integer,
    'started','unverified') returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.settle_phase14_ai_attempt(p_capability_id uuid,p_attempt_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row public.report_ai_attempts%rowtype; v_f public.report_fulfilments%rowtype; v_status text;
begin
  select * into v_row from public.report_ai_attempts where id=p_attempt_id for update;
  if not found or v_row.status<>'started' then raise exception 'phase14_ai_attempt_cas_failed'; end if;
  select * into v_f from public.report_fulfilments where id=v_row.fulfilment_id for share;
  perform public.phase14_activate_worker_operation(p_capability_id,array['automatic_generation','generation_recovery'],
    v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null);
  v_status:=p_result->>'status';
  if v_status in ('succeeded','accounting_unverified') then
    if coalesce(trim(p_result->>'resolved_provider'),'')='' or coalesce(trim(p_result->>'resolved_model'),'')='' then
      raise exception 'phase14_ai_resolved_identity_required'; end if;
    if lower(p_result->>'resolved_provider')<>lower(v_row.requested_provider) then
      raise exception 'phase14_ai_unexpected_provider_route'; end if;
  elsif v_status not in ('failed_before_provider','provider_result_uncertain','reconciliation_required') then
    raise exception 'phase14_ai_result_status_invalid';
  end if;
  update public.report_ai_attempts set status=v_status,output_json=p_result->'output_json',
    resolved_provider=nullif(p_result->>'resolved_provider',''),resolved_model=nullif(p_result->>'resolved_model',''),
    provider=coalesce(nullif(p_result->>'resolved_provider',''),provider),
    model=coalesce(nullif(p_result->>'resolved_model',''),model),
    input_token_count=nullif(p_result->>'input_token_count','')::integer,
    output_token_count=nullif(p_result->>'output_token_count','')::integer,
    total_token_count=nullif(p_result->>'total_token_count','')::integer,
    estimated_cost_micros=nullif(p_result->>'estimated_cost_micros','')::bigint,
    latency_ms=nullif(p_result->>'latency_ms','')::integer,
    accounting_status=coalesce(nullif(p_result->>'accounting_status',''),'unverified'),
    error_message=nullif(p_result->>'error_message',''),completed_at=now(),updated_at=now()
  where id=p_attempt_id and status='started' returning * into v_row;
  if not found then raise exception 'phase14_ai_attempt_cas_failed'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.guard_phase14_feature_policy_row_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('phase14.authoritative_transition', true) in ('gate_invalidation','migration') then
    if tg_op = 'DELETE' then return old; end if;
    if tg_level = 'STATEMENT' then return null; end if;
    return new;
  end if;
  perform public.phase14_require_actor(
    'feature_policy_table_mutation', array['platform_admin']::public.admin_role[], true
  );
  if tg_op = 'DELETE' then return old; end if;
  if tg_level = 'STATEMENT' then return null; end if;
  return new;
end;
$$;

create or replace function public.set_phase14_feature_policy(
  p_policy_key text,
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_policy public.phase14_feature_policies%rowtype;
  v_gate public.phase14_security_gates%rowtype;
begin
  v_actor := public.phase14_require_security(
    'feature_policy_change', array['platform_admin']::public.admin_role[], true, false
  );
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_policy_reason_required'; end if;
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_policy_gate_not_exact';
  end if;
  perform set_config('phase14.authoritative_transition', 'policy_approval', true);
  update public.phase14_feature_policies
  set enabled = p_enabled,
      required_gate_version = v_gate.required_version,
      approved_gate_version = case when p_enabled then v_gate.satisfied_version else null end,
      approved_at = case when p_enabled then now() else null end,
      updated_by = (v_actor->>'user_id')::uuid,
      reason = p_reason,
      updated_at = now()
  where policy_key = p_policy_key
  returning * into v_policy;
  if not found then raise exception 'phase14_policy_not_supported:%', p_policy_key; end if;
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, 'phase14_feature_policies',
    'phase14_feature_policy_changed',
    jsonb_build_object('policy_key', p_policy_key, 'enabled', p_enabled,
      'approved_gate_version', v_policy.approved_gate_version, 'reason', p_reason));
  return to_jsonb(v_policy);
end;
$$;

create or replace function public.set_phase14_security_gate_version(
  p_satisfied_version integer,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_gate public.phase14_security_gates%rowtype;
begin
  v_actor := public.phase14_require_actor(
    'security_gate_administration',array['platform_admin']::public.admin_role[],true
  );
  if coalesce(trim(p_reason),'')='' then raise exception 'phase14_gate_reason_required'; end if;
  if p_satisfied_version < 0 then raise exception 'phase14_gate_version_invalid'; end if;
  perform set_config('phase14.authoritative_transition','gate_administration',true);
  update public.phase14_security_gates
  set satisfied_version=p_satisfied_version,
      status=case when p_satisfied_version>=required_version then 'satisfied' else 'unsatisfied' end,
      satisfied_by=(v_actor->>'user_id')::uuid,
      satisfied_at=case when p_satisfied_version>=required_version then now() else null end,
      reason=p_reason,updated_at=now()
  where gate_key='phase14-premium-report'
  returning * into v_gate;
  if not found then raise exception 'phase14_security_gate_missing'; end if;
  insert into public.audit_logs(actor_type,actor_user_id,entity_table,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,'phase14_security_gates',
    'phase14_security_gate_changed',jsonb_build_object(
      'required_version',v_gate.required_version,
      'satisfied_version',v_gate.satisfied_version,
      'status',v_gate.status,'reason',p_reason
    ));
  return to_jsonb(v_gate);
end;
$$;

create or replace function public.phase14_require_policy(p_policy_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_policy public.phase14_feature_policies%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_policy_key;
  end if;
  select * into v_policy from public.phase14_feature_policies
  where policy_key = p_policy_key for share;
  if not found or not v_policy.enabled then raise exception 'phase14_policy_disabled:%', p_policy_key; end if;
  if v_policy.approved_gate_version is null
     or v_policy.approved_gate_version <> v_gate.satisfied_version
     or v_policy.required_gate_version <> v_gate.required_version then
    raise exception 'phase14_policy_gate_version_stale:%', p_policy_key;
  end if;
  return jsonb_build_object('policy_key', v_policy.policy_key,
    'gate_version', v_gate.satisfied_version, 'approved_at', v_policy.approved_at);
end;
$$;

create or replace function public.invalidate_phase14_authority_on_gate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.required_version is distinct from new.required_version
     or old.satisfied_version is distinct from new.satisfied_version
     or old.status is distinct from new.status then
    perform set_config('phase14.authoritative_transition', 'gate_invalidation', true);
    update public.phase14_feature_policies
    set enabled = false,
        approved_gate_version = null,
        approved_at = null,
        reason = 'Automatically disabled because the Phase 14 gate changed or was suspended.',
        updated_at = now();
    update public.phase14_worker_capabilities
    set status = 'revoked',
        revoked_at = now(),
        revoked_reason = 'Phase 14 gate changed or was suspended.',
        lease_secret_hash = null,
        lease_expires_at = null,
        updated_at = now()
    where status in ('authorised','leased');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_phase14_gate_invalidate_authority on public.phase14_security_gates;
create trigger trg_phase14_gate_invalidate_authority
  after update of required_version, satisfied_version, status on public.phase14_security_gates
  for each row execute function public.invalidate_phase14_authority_on_gate_change();

create or replace function public.suspend_phase14_security_gate(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_gate public.phase14_security_gates%rowtype;
begin
  v_actor := public.phase14_require_actor(
    'security_gate_suspension', array['platform_admin']::public.admin_role[], true
  );
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_gate_reason_required'; end if;
  perform set_config('phase14.authoritative_transition', 'gate_administration', true);
  update public.phase14_security_gates
  set status = 'suspended', satisfied_version = 0, satisfied_by = null,
      satisfied_at = null, reason = p_reason, updated_at = now()
  where gate_key = 'phase14-premium-report'
  returning * into v_gate;
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, 'phase14_security_gates',
    'phase14_security_gate_suspended', jsonb_build_object('reason', p_reason));
  return to_jsonb(v_gate);
end;
$$;

-- 2. Opaque worker-operation broker. The durable workflow carries only UUIDs;
-- issue secrets and lease tokens are no longer returned or accepted.
alter table public.phase14_worker_capabilities
  add column lease_owner text,
  add column lease_generation integer not null default 0 check (lease_generation >= 0),
  add column last_heartbeat_at timestamptz,
  add column takeover_count integer not null default 0 check (takeover_count >= 0);

alter table public.phase14_worker_capabilities
  drop constraint if exists phase14_worker_capability_lease_chk;
alter table public.phase14_worker_capabilities
  add constraint phase14_worker_capability_lease_chk check (
    (status = 'leased' and lease_owner is not null and lease_expires_at is not null)
    or status <> 'leased'
  );

create or replace function public.authorize_phase14_worker_operation(
  p_capability_type text,
  p_operation_key text,
  p_order_id uuid,
  p_assessment_id uuid,
  p_score_run_id uuid,
  p_fulfilment_id uuid,
  p_report_id uuid default null,
  p_recipient text default null,
  p_expires_in_seconds integer default 21600,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_gate public.phase14_security_gates%rowtype; v_policy_key text;
  v_capability public.phase14_worker_capabilities%rowtype;
  v_order public.orders%rowtype; v_fulfilment public.report_fulfilments%rowtype;
begin
  v_actor := public.phase14_require_security(
    'worker_capability_authorization', array['platform_admin']::public.admin_role[], true, false
  );
  if p_expires_in_seconds < 300 or p_expires_in_seconds > 86400 then
    raise exception 'phase14_worker_capability_expiry_out_of_range';
  end if;
  if coalesce(trim(p_operation_key), '') = '' then raise exception 'phase14_worker_operation_key_required'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_worker_capability_reason_required'; end if;
  v_policy_key := case p_capability_type
    when 'automatic_generation' then 'automatic_fulfilment'
    when 'generation_recovery' then 'automatic_fulfilment'
    when 'automatic_delivery' then 'automatic_email'
    when 'delivery_reconciliation' then 'automatic_email'
    when 'storage_cleanup' then 'storage_cleanup'
    else null end;
  if v_policy_key is null then raise exception 'phase14_worker_capability_type_invalid'; end if;
  perform public.phase14_require_policy(v_policy_key);
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if p_capability_type = 'storage_cleanup' then
    if p_order_id is not null or p_assessment_id is not null or p_score_run_id is not null
       or p_fulfilment_id is not null or p_report_id is not null or p_recipient is not null then
      raise exception 'storage_cleanup_capability_must_be_unbound';
    end if;
  else
    if p_order_id is null or p_assessment_id is null or p_score_run_id is null then
      raise exception 'worker_capability_commercial_binding_required';
    end if;
    select * into v_order from public.orders where id = p_order_id for share;
    if not found or v_order.assessment_id <> p_assessment_id then
      raise exception 'worker_capability_order_binding_invalid';
    end if;
    perform public.phase14_generation_entitlement(
      v_order.order_reference, p_order_id, p_assessment_id, p_score_run_id, null
    );
  end if;
  if p_fulfilment_id is not null then
    select * into v_fulfilment from public.report_fulfilments where id = p_fulfilment_id for share;
    if not found or v_fulfilment.order_id <> p_order_id
       or v_fulfilment.assessment_id <> p_assessment_id
       or v_fulfilment.score_run_id <> p_score_run_id then
      raise exception 'worker_capability_fulfilment_binding_invalid';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase14-capability:' || p_capability_type || ':' || p_operation_key, 0
  ));
  update public.phase14_worker_capabilities
  set status = 'expired', updated_at = now()
  where capability_type = p_capability_type and operation_key = p_operation_key
    and status in ('authorised','leased') and expires_at <= now();
  if exists (select 1 from public.phase14_worker_capabilities
    where capability_type = p_capability_type and operation_key = p_operation_key
      and status in ('authorised','leased')) then
    raise exception 'phase14_worker_capability_already_active';
  end if;
  perform set_config('phase14.authoritative_transition', 'worker_authorization', true);
  insert into public.phase14_worker_capabilities(
    capability_type, policy_key, operation_key, issue_secret_hash,
    order_id, assessment_id, score_run_id, fulfilment_id, report_id, recipient_email,
    security_gate_version, authorised_by, authorised_session_id, reason, expires_at
  ) values (
    p_capability_type, v_policy_key, p_operation_key,
    encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex'),
    p_order_id, p_assessment_id, p_score_run_id, p_fulfilment_id, p_report_id,
    nullif(lower(trim(p_recipient)), ''), v_gate.satisfied_version,
    (v_actor->>'user_id')::uuid, (v_actor->>'session_id')::uuid,
    p_reason, now() + make_interval(secs => p_expires_in_seconds)
  ) returning * into v_capability;
  if p_fulfilment_id is not null then
    update public.report_fulfilments
    set generation_capability_id = case
          when p_capability_type in ('automatic_generation','generation_recovery') then v_capability.id
          else generation_capability_id end,
        delivery_capability_id = case
          when p_capability_type in ('automatic_delivery','delivery_reconciliation') then v_capability.id
          else delivery_capability_id end,
        updated_at = now()
    where id = p_fulfilment_id;
  end if;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id,
    entity_table, entity_id, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, p_assessment_id,
    'phase14_worker_capabilities', v_capability.id,
    'phase14_worker_capability_authorized',
    jsonb_build_object('capability_type', p_capability_type,
      'operation_key', p_operation_key, 'policy_key', v_policy_key,
      'expires_at', v_capability.expires_at, 'opaque_identifier_only', true));
  return jsonb_build_object(
    'capability_id', v_capability.id,
    'capability_type', v_capability.capability_type,
    'operation_key', v_capability.operation_key,
    'expires_at', v_capability.expires_at,
    'security_gate_version', v_capability.security_gate_version
  );
end;
$$;

create or replace function public.claim_phase14_worker_operation(
  p_capability_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap public.phase14_worker_capabilities%rowtype;
  v_gate public.phase14_security_gates%rowtype;
  v_takeover boolean := false;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  if coalesce(trim(p_lease_owner), '') = '' or length(p_lease_owner) > 200 then
    raise exception 'phase14_worker_lease_owner_invalid';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  if v_cap.expires_at <= now() then
    update public.phase14_worker_capabilities
    set status = 'expired', lease_owner = null, lease_expires_at = null, updated_at = now()
    where id = v_cap.id;
    raise exception 'phase14_worker_capability_expired';
  end if;
  if v_cap.status = 'leased' and v_cap.lease_expires_at > now()
     and v_cap.lease_owner <> p_lease_owner then
    raise exception 'phase14_worker_capability_already_leased';
  end if;
  if v_cap.status = 'leased' and v_cap.lease_expires_at <= now() then
    v_takeover := true;
  elsif v_cap.status not in ('authorised','leased') then
    raise exception 'phase14_worker_capability_not_claimable:%', v_cap.status;
  end if;
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version
     or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  perform set_config('phase14.authoritative_transition', 'worker_claim', true);
  update public.phase14_worker_capabilities
  set status = 'leased', lease_owner = p_lease_owner,
      lease_secret_hash = null,
      lease_expires_at = least(expires_at, now() + interval '60 minutes'),
      lease_generation = lease_generation + 1,
      takeover_count = takeover_count + case when v_takeover then 1 else 0 end,
      claimed_at = coalesce(claimed_at, now()), last_heartbeat_at = now(), updated_at = now()
  where id = v_cap.id
  returning * into v_cap;
  return jsonb_build_object(
    'capability_id', v_cap.id, 'capability_type', v_cap.capability_type,
    'operation_key', v_cap.operation_key, 'lease_owner', v_cap.lease_owner,
    'lease_generation', v_cap.lease_generation,
    'lease_expires_at', v_cap.lease_expires_at, 'takeover', v_takeover
  );
end;
$$;

create or replace function public.renew_phase14_worker_operation(
  p_capability_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for update;
  if not found or v_cap.status <> 'leased' or v_cap.lease_owner <> p_lease_owner
     or v_cap.lease_expires_at <= now() or v_cap.expires_at <= now() then
    raise exception 'phase14_worker_operation_renewal_invalid';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  update public.phase14_worker_capabilities
  set lease_expires_at = least(expires_at, now() + interval '60 minutes'),
      last_heartbeat_at = now(), updated_at = now()
  where id = v_cap.id returning * into v_cap;
  return jsonb_build_object('capability_id', v_cap.id,
    'lease_generation', v_cap.lease_generation,
    'lease_expires_at', v_cap.lease_expires_at);
end;
$$;

create or replace function public.phase14_activate_worker_operation(
  p_capability_id uuid,
  p_expected_types text[],
  p_order_id uuid default null,
  p_assessment_id uuid default null,
  p_score_run_id uuid default null,
  p_fulfilment_id uuid default null,
  p_report_id uuid default null,
  p_recipient text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for share;
  if not found or v_cap.status <> 'leased' then
    raise exception 'phase14_worker_capability_not_leased';
  end if;
  if not (v_cap.capability_type = any(p_expected_types)) then
    raise exception 'phase14_worker_capability_type_mismatch';
  end if;
  if v_cap.expires_at <= now() or v_cap.lease_expires_at <= now() then
    raise exception 'phase14_worker_capability_lease_expired';
  end if;
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version
     or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  if v_cap.order_id is not null and v_cap.order_id is distinct from p_order_id then
    raise exception 'worker_capability_order_mismatch'; end if;
  if v_cap.assessment_id is not null and v_cap.assessment_id is distinct from p_assessment_id then
    raise exception 'worker_capability_assessment_mismatch'; end if;
  if v_cap.score_run_id is not null and v_cap.score_run_id is distinct from p_score_run_id then
    raise exception 'worker_capability_score_run_mismatch'; end if;
  if v_cap.fulfilment_id is not null and v_cap.fulfilment_id is distinct from p_fulfilment_id then
    raise exception 'worker_capability_fulfilment_mismatch'; end if;
  if v_cap.report_id is not null and v_cap.report_id is distinct from p_report_id then
    raise exception 'worker_capability_report_mismatch'; end if;
  if v_cap.recipient_email is not null
     and lower(trim(p_recipient)) is distinct from lower(v_cap.recipient_email::text) then
    raise exception 'worker_capability_recipient_mismatch';
  end if;
  perform set_config('phase14.worker_capability_id', v_cap.id::text, true);
  perform set_config('phase14.worker_capability_type', v_cap.capability_type, true);
  perform set_config('phase14.authoritative_transition', 'worker_rpc', true);
  return to_jsonb(v_cap) - 'issue_secret_hash' - 'lease_secret_hash';
end;
$$;

create or replace function public.authorize_phase14_worker_action(
  p_capability_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id, array[v_cap.capability_type], v_cap.order_id, v_cap.assessment_id,
    v_cap.score_run_id, v_cap.fulfilment_id, v_cap.report_id, v_cap.recipient_email::text
  );
  return public.phase14_require_security(
    p_action, array['platform_admin']::public.admin_role[], true, false
  );
end;
$$;

create or replace function public.complete_phase14_worker_operation(p_capability_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for update;
  if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now() then
    raise exception 'phase14_worker_capability_completion_invalid';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  perform set_config('phase14.authoritative_transition', 'worker_completion', true);
  update public.phase14_worker_capabilities
  set status = 'consumed', consumed_at = now(), lease_owner = null,
      lease_secret_hash = null, lease_expires_at = null,
      last_heartbeat_at = now(), updated_at = now()
  where id = v_cap.id and status = 'leased';
  if not found then raise exception 'phase14_worker_capability_completion_cas_failed'; end if;
  return true;
end;
$$;

-- All authorised paths mark their transaction before touching authoritative or
-- shared Phase 14 rows. A generic service-role request has no such context.
create or replace function public.phase14_require_security(
  p_action text,
  p_allowed_roles public.admin_role[] default array['platform_admin']::public.admin_role[],
  p_require_aal2 boolean default true,
  p_allow_service_role boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate public.phase14_security_gates%rowtype; v_actor jsonb; v_policy_key text;
  v_capability_id uuid; v_capability_type text; v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_action;
  end if;
  if coalesce(auth.jwt()->>'role','') = 'service_role' then
    if p_action = 'webhook_mutation'
       and current_setting('phase14.authoritative_transition', true) = 'trusted_provider_attestation' then
      return jsonb_build_object('actor_type','trusted_provider_attestation',
        'gate_version',v_gate.satisfied_version,'action',p_action);
    end if;
    begin
      v_capability_id := nullif(current_setting('phase14.worker_capability_id', true), '')::uuid;
      v_capability_type := nullif(current_setting('phase14.worker_capability_type', true), '');
    exception when others then
      raise exception 'phase14_worker_context_missing:%', p_action;
    end;
    if v_capability_id is null or v_capability_type is null then
      raise exception 'phase14_worker_context_missing:%', p_action;
    end if;
    select * into v_cap from public.phase14_worker_capabilities
    where id = v_capability_id for share;
    if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now()
       or v_cap.security_gate_version <> v_gate.satisfied_version then
      raise exception 'phase14_worker_context_invalid:%', p_action;
    end if;
    if not (
      (v_capability_type in ('automatic_generation','generation_recovery')
        and p_action in ('report_generation','report_regeneration','ai_narrative_generation'))
      or (v_capability_type = 'automatic_delivery'
        and p_action in ('email_delivery','automatic_delivery','delivery_finalization'))
      or (v_capability_type = 'delivery_reconciliation'
        and p_action in ('provider_reconciliation','delivery_finalization','automatic_delivery'))
      or (v_capability_type = 'storage_cleanup' and p_action = 'storage_cleanup')
    ) then raise exception 'phase14_worker_action_forbidden:%', p_action; end if;
    perform public.phase14_require_policy(v_cap.policy_key);
    perform set_config('phase14.authoritative_transition', 'worker_rpc', true);
    return jsonb_build_object('actor_type','worker','capability_id',v_cap.id,
      'capability_type',v_cap.capability_type,'gate_version',v_gate.satisfied_version,
      'action',p_action);
  end if;
  v_actor := public.phase14_require_actor(p_action, p_allowed_roles, p_require_aal2);
  v_policy_key := case
    when p_action in ('report_generation','report_regeneration') then 'manual_generation'
    when p_action = 'ai_narrative_generation' then 'ai_narrative'
    when p_action in ('email_delivery','email_resend','provider_reconciliation',
      'delivery_finalization','automatic_delivery') then 'manual_delivery'
    when p_action = 'report_download' then 'manual_download'
    else null end;
  if v_policy_key is not null then perform public.phase14_require_policy(v_policy_key); end if;
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  return v_actor || jsonb_build_object('gate_version',v_gate.satisfied_version,'action',p_action);
end;
$$;

-- 3. Shared-table mutation guards. Only an RPC that established a transaction-
-- local authoritative context may mutate a Phase 14-owned row.
create or replace function public.guard_phase14_authoritative_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_protected boolean := false;
  v_context text := nullif(current_setting('phase14.authoritative_transition', true), '');
begin
  v_protected := case tg_table_name
    when 'audit_logs' then
      coalesce(v_row->>'action','') ~ '^(phase14_|premium_report_|report_(generated|regenerated|download_))'
      or coalesce(v_row->>'entity_table','') in (
        'phase14_security_gates','phase14_feature_policies','phase14_worker_capabilities',
        'report_fulfilments','report_generation_runs','report_ai_attempts',
        'report_generation_claims','report_delivery_authorizations',
        'report_delivery_finalizations','report_delivery_remediations'
      )
    when 'report_events' then coalesce(v_row->>'event_type','') in (
      'generated','regenerated','email_sent','email_test_sent','download_requested'
    )
    when 'assessment_events' then coalesce(v_row->>'event_type','') in (
      'report_generated','admin_report_downloaded','report_emailed_to_customer'
    )
    when 'email_events' then
      coalesce(v_row->>'notification_type','') = 'premium_report_pdf'
      or coalesce(v_row->>'provider_request_key','') <> ''
    when 'email_provider_events' then true
    when 'phase14_operational_alerts' then true
    else false
  end;
  if v_protected and coalesce(v_context,'') not in (
    'authenticated_rpc','fulfilment_queue_rpc','fulfilment_transition_rpc',
    'gate_administration','gate_invalidation','migration','operational_alert_rpc',
    'policy_approval','runtime_secret_rotation','trusted_provider_attestation',
    'worker_authorization','worker_claim','worker_completion','worker_rpc'
  ) then
    raise exception 'phase14_authoritative_rpc_required:%:%', tg_table_name, tg_op;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'audit_logs','report_events','assessment_events','email_events',
    'email_provider_events','phase14_operational_alerts'
  ] loop
    execute format('drop trigger if exists trg_phase14_authoritative_mutation on public.%I', v_table);
    execute format(
      'create trigger trg_phase14_authoritative_mutation before insert or update or delete on public.%I for each row execute function public.guard_phase14_authoritative_mutation()',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.record_phase14_operational_alert(
  p_alert_key text,
  p_category text,
  p_report_id uuid default null,
  p_email_event_id uuid default null,
  p_detail_json jsonb default '{}'::jsonb,
  p_severity text default 'critical'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  if coalesce(trim(p_alert_key),'') = '' or length(p_alert_key) > 300 then
    raise exception 'phase14_alert_key_invalid';
  end if;
  if p_category not in (
    'report_download_object_missing','report_download_object_size_invalid',
    'report_download_checksum_mismatch','report_email_checksum_mismatch',
    'report_temporary_object_cleanup_failed','storage_cleanup_verification_failed'
  ) then raise exception 'phase14_alert_category_invalid'; end if;
  if p_severity not in ('warning','critical') then raise exception 'phase14_alert_severity_invalid'; end if;
  perform set_config('phase14.authoritative_transition', 'operational_alert_rpc', true);
  insert into public.phase14_operational_alerts(
    alert_key,severity,category,report_id,email_event_id,detail_json,status
  ) values (
    p_alert_key,p_severity,p_category,p_report_id,p_email_event_id,
    coalesce(p_detail_json,'{}'::jsonb),'open'
  ) on conflict (alert_key) do update
  set severity = excluded.severity, detail_json = excluded.detail_json, status = 'open'
  returning id into v_id;
  return v_id;
end;
$$;

-- 4. Fulfilment, workflow-start, provenance, and shared-event transitions are
-- explicit RPCs. No application code needs direct DML on authoritative tables.
create or replace function public.queue_premium_report_fulfilment(
  p_order_reference text,
  p_trigger_source text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_context jsonb; v_order public.orders%rowtype;
  v_fulfilment public.report_fulfilments%rowtype; v_key text; v_created boolean := false;
begin
  v_actor := public.phase14_require_security(
    'automatic_fulfilment_request', array['platform_admin']::public.admin_role[], true, false
  );
  perform public.phase14_require_policy('automatic_fulfilment');
  if p_trigger_source not in ('payment_confirmation','admin_generate','admin_retry','admin_regenerate') then
    raise exception 'phase14_fulfilment_trigger_invalid';
  end if;
  v_context := public.phase14_generation_entitlement(p_order_reference);
  select * into v_order from public.orders where id = (v_context->>'order_id')::uuid for share;
  v_key := 'premium-report:' || (v_context->>'order_id') || ':' || (v_context->>'score_run_id');
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select * into v_fulfilment from public.report_fulfilments
  where idempotency_key = v_key for update;
  if not found then
    perform set_config('phase14.authoritative_transition', 'fulfilment_queue_rpc', true);
    insert into public.report_fulfilments(
      order_id,assessment_id,score_run_id,idempotency_key,trigger_source,status,
      current_step,requested_by_admin_user_id
    ) values (
      (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
      (v_context->>'score_run_id')::uuid,v_key,p_trigger_source,'queued',
      'claim_fulfilment',(v_actor->>'user_id')::uuid
    ) returning * into v_fulfilment;
    v_created := true;
    insert into public.order_events(order_id,event_type,note,actor_admin_user_id,metadata_json)
    values (v_fulfilment.order_id,'premium_report_fulfilment_queued',
      'Autonomous premium-report fulfilment queued.',(v_actor->>'user_id')::uuid,
      jsonb_build_object('fulfilment_id',v_fulfilment.id,'trigger_source',p_trigger_source,
        'idempotency_key',v_key));
    insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
      entity_table,entity_id,action,after_json)
    values ('admin',(v_actor->>'user_id')::uuid,v_fulfilment.assessment_id,
      'report_fulfilments',v_fulfilment.id,'premium_report_fulfilment_queued',
      jsonb_build_object('order_reference',p_order_reference,'trigger_source',p_trigger_source,
        'score_run_id',v_fulfilment.score_run_id));
  end if;
  return jsonb_build_object(
    'created',v_created,'fulfilment',to_jsonb(v_fulfilment),
    'context',jsonb_build_object('order_id',v_fulfilment.order_id,
      'assessment_id',v_fulfilment.assessment_id,'score_run_id',v_fulfilment.score_run_id,
      'recipient',lower(v_order.customer_email::text))
  );
end;
$$;

create or replace function public.transition_premium_report_fulfilment(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_status text,
  p_current_step text,
  p_generation_mode text default null,
  p_report_id uuid default null,
  p_increment_attempt boolean default false,
  p_error_code text default null,
  p_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.report_fulfilments%rowtype; v_allowed boolean := false; v_now timestamptz := now();
begin
  select * into v_row from public.report_fulfilments where id = p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  if p_capability_id is not null then
    perform public.phase14_activate_worker_operation(
      p_capability_id,array['automatic_generation','generation_recovery','automatic_delivery'],
      v_row.order_id,v_row.assessment_id,v_row.score_run_id,v_row.id,
      case when p_status = 'completed' then coalesce(p_report_id,v_row.report_id) else null end,
      null
    );
  else
    perform public.phase14_require_security(
      'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
    );
  end if;
  if coalesce(trim(p_current_step),'') = '' then raise exception 'phase14_fulfilment_step_required'; end if;
  if p_generation_mode is not null and p_generation_mode not in ('ai','ai_repair','deterministic_fallback') then
    raise exception 'phase14_fulfilment_generation_mode_invalid';
  end if;
  v_allowed := p_status = v_row.status or case v_row.status
    when 'queued' then p_status in ('assembling','failed','cancelled')
    when 'assembling' then p_status in ('generating','validating','failed')
    when 'generating' then p_status in ('validating','rendering','failed')
    when 'validating' then p_status in ('rendering','failed')
    when 'rendering' then p_status in ('storing','failed')
    when 'storing' then p_status in ('ready_for_delivery','failed')
    when 'ready_for_delivery' then p_status in ('completed','failed')
    when 'failed' then p_status in ('assembling','failed')
    else false end;
  if not v_allowed then raise exception 'phase14_fulfilment_transition_invalid:%->%',v_row.status,p_status; end if;
  if p_report_id is not null and not exists (
    select 1 from public.reports r where r.id = p_report_id
      and r.order_id = v_row.order_id and r.assessment_id = v_row.assessment_id
      and r.score_run_id = v_row.score_run_id
  ) then raise exception 'phase14_fulfilment_report_binding_invalid'; end if;
  perform set_config('phase14.authoritative_transition', 'fulfilment_transition_rpc', true);
  update public.report_fulfilments
  set status = p_status, current_step = p_current_step,
      generation_mode = coalesce(p_generation_mode,generation_mode),
      report_id = coalesce(p_report_id,report_id),
      attempt_count = attempt_count + case when p_increment_attempt then 1 else 0 end,
      last_error_code = p_error_code, last_error_message = p_error_message,
      started_at = case when p_status='assembling' then coalesce(started_at,v_now) else started_at end,
      completed_at = case when p_status='completed' then coalesce(completed_at,v_now) else completed_at end,
      failed_at = case when p_status='failed' then v_now else failed_at end,
      updated_at = v_now
  where id = p_fulfilment_id and status = v_row.status
  returning * into v_row;
  if not found then raise exception 'phase14_fulfilment_transition_cas_failed'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.claim_premium_report_workflow_start(
  p_capability_id uuid,
  p_fulfilment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.report_fulfilments%rowtype;
begin
  select * into v_row from public.report_fulfilments where id=p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_row.order_id,v_row.assessment_id,v_row.score_run_id,v_row.id,null,null
  );
  if v_row.workflow_run_id is not null or v_row.workflow_start_status='started' then
    return jsonb_build_object('claimed',false,'workflow_run_id',v_row.workflow_run_id,
      'workflow_start_status',v_row.workflow_start_status);
  end if;
  if v_row.workflow_start_status='starting' then
    return jsonb_build_object('claimed',false,'workflow_run_id',null,
      'workflow_start_status','starting');
  end if;
  update public.report_fulfilments
  set workflow_start_status='starting',workflow_start_error=null,updated_at=now()
  where id=v_row.id and workflow_start_status in ('not_started','failed')
  returning * into v_row;
  if not found then raise exception 'phase14_workflow_start_claim_cas_failed'; end if;
  return jsonb_build_object('claimed',true,'workflow_start_status','starting');
end;
$$;

create or replace function public.record_premium_report_workflow_start(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_started boolean,
  p_workflow_run_id text default null,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.report_fulfilments%rowtype;
begin
  select * into v_row from public.report_fulfilments where id=p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_row.order_id,v_row.assessment_id,v_row.score_run_id,v_row.id,null,null
  );
  if p_started and coalesce(trim(p_workflow_run_id),'')='' then raise exception 'phase14_workflow_run_id_required'; end if;
  if not p_started and coalesce(trim(p_error),'')='' then raise exception 'phase14_workflow_start_error_required'; end if;
  update public.report_fulfilments
  set workflow_start_status=case when p_started then 'started' else 'failed' end,
      workflow_run_id=case when p_started then p_workflow_run_id else workflow_run_id end,
      workflow_started_at=case when p_started then coalesce(workflow_started_at,now()) else workflow_started_at end,
      workflow_start_error=case when p_started then null else p_error end,
      last_error_code=case when p_started then last_error_code else 'workflow_start_failed' end,
      last_error_message=case when p_started then last_error_message else p_error end,
      updated_at=now()
  where id=v_row.id and workflow_start_status='starting'
  returning * into v_row;
  if not found then
    if p_started and v_row.workflow_start_status='started' and v_row.workflow_run_id=p_workflow_run_id then
      return to_jsonb(v_row) || jsonb_build_object('idempotent_replay',true);
    end if;
    raise exception 'phase14_workflow_start_record_cas_failed';
  end if;
  return to_jsonb(v_row) || jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.record_premium_report_generation_run(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_run jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_f public.report_fulfilments%rowtype; v_id uuid; v_attempt integer;
begin
  select * into v_f from public.report_fulfilments where id=p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  if p_capability_id is not null then
    perform public.phase14_activate_worker_operation(
      p_capability_id,array['automatic_generation','generation_recovery'],
      v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null
    );
  else
    perform public.phase14_require_security(
      'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
    );
  end if;
  select id into v_id from public.report_generation_runs
  where fulfilment_id=p_fulfilment_id and status='used' limit 1;
  if v_id is not null then return v_id; end if;
  select coalesce(max(attempt_number),0)+1 into v_attempt
  from public.report_generation_runs where fulfilment_id=p_fulfilment_id;
  insert into public.report_generation_runs(
    fulfilment_id,attempt_number,generation_mode,provider,model,requested_provider,
    requested_model,resolved_provider,resolved_model,prompt_version,schema_version,
    evidence_checksum,evidence_snapshot_json,structured_output_json,
    validation_result_json,validation_errors_json,input_token_count,output_token_count,
    total_token_count,estimated_cost_micros,accounting_status,latency_ms,status,
    error_code,error_message,completed_at
  ) values (
    p_fulfilment_id,v_attempt,p_run->>'generation_mode',nullif(p_run->>'provider',''),
    nullif(p_run->>'model',''),nullif(p_run->>'requested_provider',''),
    nullif(p_run->>'requested_model',''),nullif(p_run->>'resolved_provider',''),
    nullif(p_run->>'resolved_model',''),p_run->>'prompt_version',p_run->>'schema_version',
    p_run->>'evidence_checksum',coalesce(p_run->'evidence_snapshot_json','{}'::jsonb),
    p_run->'structured_output_json',coalesce(p_run->'validation_result_json','{}'::jsonb),
    coalesce(p_run->'validation_errors_json','[]'::jsonb),
    nullif(p_run->>'input_token_count','')::integer,
    nullif(p_run->>'output_token_count','')::integer,
    nullif(p_run->>'total_token_count','')::integer,
    nullif(p_run->>'estimated_cost_micros','')::bigint,
    p_run->>'accounting_status',nullif(p_run->>'latency_ms','')::integer,'used',
    nullif(p_run->>'error_code',''),nullif(p_run->>'error_message',''),now()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.link_premium_report_generation_run(
  p_capability_id uuid,
  p_generation_run_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_run public.report_generation_runs%rowtype; v_f public.report_fulfilments%rowtype;
begin
  select * into v_run from public.report_generation_runs where id=p_generation_run_id for update;
  if not found then raise exception 'phase14_generation_run_missing'; end if;
  select * into v_f from public.report_fulfilments where id=v_run.fulfilment_id for share;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null
  );
  if not exists (select 1 from public.reports where id=p_report_id and fulfilment_id=v_f.id) then
    raise exception 'phase14_generation_run_report_binding_invalid';
  end if;
  update public.report_generation_runs set report_id=p_report_id where id=v_run.id;
  return true;
end;
$$;

create or replace function public.record_phase14_report_generated(
  p_capability_id uuid,
  p_report_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_note text,
  p_metadata jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_report public.reports%rowtype; v_f public.report_fulfilments%rowtype;
begin
  if p_event_type not in ('generated','regenerated') then raise exception 'phase14_report_event_type_invalid'; end if;
  select * into v_report from public.reports where id=p_report_id for share;
  if not found then raise exception 'phase14_report_missing'; end if;
  if p_capability_id is not null then
    select * into v_f from public.report_fulfilments where id=v_report.fulfilment_id for share;
    perform public.phase14_activate_worker_operation(
      p_capability_id,array['automatic_generation','generation_recovery'],
      v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_f.id,null,null
    );
  else
    perform public.phase14_require_security(
      'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
    );
  end if;
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,p_event_type,p_actor_user_id,p_note,coalesce(p_metadata,'{}'::jsonb));
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values (case when p_capability_id is null then 'admin'::public.audit_actor_type else 'system'::public.audit_actor_type end,
    p_actor_user_id,v_report.assessment_id,'reports',v_report.id,
    case when p_event_type='regenerated' then 'report_regenerated' else 'report_generated' end,
    coalesce(p_metadata,'{}'::jsonb));
  insert into public.assessment_events(
    assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
  ) values (
    v_report.assessment_id,v_report.order_id,v_report.id,'report_generated',
    'phase14-report-generated:' || v_report.id,coalesce(p_metadata,'{}'::jsonb)
  ) on conflict (dedupe_key) do update
  set event_count=public.assessment_events.event_count+1,last_seen_at=now(),
      metadata_json=public.assessment_events.metadata_json || excluded.metadata_json,
      updated_at=now();
  return true;
end;
$$;

-- Publication happens before the durable business transition because object
-- storage cannot participate in the database transaction. Everything after
-- publication, including capability consumption, is therefore one RPC/one
-- transaction. A raised error rolls back the linkage, fulfilment transition,
-- events, and capability state together.
create or replace function public.complete_phase14_generation_operation(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_generation_run_id uuid,
  p_report_id uuid,
  p_generation_mode text,
  p_actor_user_id uuid,
  p_event_type text,
  p_note text,
  p_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap public.phase14_worker_capabilities%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
  v_metadata jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id=p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;

  -- A response-loss retry is accepted only when every durable effect from the
  -- original atomic completion is present and bound to this exact capability.
  if v_cap.status='consumed' then
    if v_cap.fulfilment_id is distinct from p_fulfilment_id
       or not exists (
         select 1 from public.report_fulfilments f
         where f.id=p_fulfilment_id and f.report_id=p_report_id
           and f.status in ('ready_for_delivery','completed')
       )
       or (p_generation_run_id is not null and not exists (
         select 1 from public.report_generation_runs r
         where r.id=p_generation_run_id and r.fulfilment_id=p_fulfilment_id
           and r.report_id=p_report_id
       ))
       or not exists (
         select 1 from public.report_events e
         where e.report_id=p_report_id and e.event_type=p_event_type
           and e.metadata_json->>'worker_capability_id'=p_capability_id::text
       ) then
      raise exception 'phase14_generation_completion_replay_mismatch';
    end if;
    return jsonb_build_object('completed',true,'idempotent_replay',true,
      'report_id',p_report_id,'fulfilment_id',p_fulfilment_id);
  end if;

  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_cap.order_id,v_cap.assessment_id,v_cap.score_run_id,p_fulfilment_id,null,null
  );
  if p_generation_run_id is not null then
    perform public.link_premium_report_generation_run(
      p_capability_id,p_generation_run_id,p_report_id
    );
  end if;
  perform public.transition_premium_report_fulfilment(
    p_capability_id,p_fulfilment_id,'ready_for_delivery','ready_for_email_delivery',
    p_generation_mode,p_report_id,false,null,null
  );
  v_metadata := coalesce(p_metadata,'{}'::jsonb)
    || jsonb_build_object('worker_capability_id',p_capability_id);
  perform public.record_phase14_report_generated(
    p_capability_id,p_report_id,p_actor_user_id,p_event_type,p_note,v_metadata
  );
  perform public.complete_phase14_worker_operation(p_capability_id);
  select * into strict v_fulfilment from public.report_fulfilments
  where id=p_fulfilment_id;
  return jsonb_build_object('completed',true,'idempotent_replay',false,
    'report_id',p_report_id,'fulfilment_id',p_fulfilment_id,
    'fulfilment_status',v_fulfilment.status);
end;
$$;

create or replace function public.record_phase14_report_download(
  p_report_id uuid,
  p_success boolean,
  p_detail jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb; v_report public.reports%rowtype;
begin
  v_actor := public.phase14_require_security(
    'report_download',array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[],true,false
  );
  select * into v_report from public.reports where id=p_report_id for share;
  if not found then raise exception 'phase14_report_missing'; end if;
  if p_success then
    insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
    values (v_report.id,'download_requested',(v_actor->>'user_id')::uuid,
      'Authenticated report bytes streamed after SHA-256 verification.',coalesce(p_detail,'{}'::jsonb));
    insert into public.assessment_events(assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json)
    values (v_report.assessment_id,v_report.order_id,v_report.id,'admin_report_downloaded',
      'phase14-report-download:' || v_report.id || ':' || (v_actor->>'session_id'),
      coalesce(p_detail,'{}'::jsonb));
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_report.assessment_id,'reports',v_report.id,
    case when p_success then 'report_download_streamed' else 'report_download_denied' end,
    coalesce(p_detail,'{}'::jsonb));
  return true;
end;
$$;

-- 5. Provider trust boundary. Runtime HMAC keys live in a non-exposed schema;
-- service_role cannot read them. Receipts are append-only and consumption is
-- recorded separately so the attestation itself remains immutable.
create schema if not exists phase14_private;
revoke all on schema phase14_private from public, anon, authenticated, service_role;

create table phase14_private.runtime_secrets (
  secret_key text primary key check (secret_key in (
    'provider_webhook_db_hmac','provider_lookup_db_hmac'
  )),
  secret_value text not null check (length(secret_value) >= 32),
  rotated_at timestamptz not null default now(),
  rotated_by uuid not null references public.admin_profiles(id) on delete restrict
);
revoke all on table phase14_private.runtime_secrets from public, anon, authenticated, service_role;

create table public.phase14_provider_attestations (
  id uuid primary key default gen_random_uuid(),
  attestation_source text not null check (attestation_source in ('webhook','provider_lookup')),
  provider text not null check (coalesce(trim(provider),'') <> ''),
  provider_event_id text,
  provider_request_key text,
  authorization_id uuid references public.report_delivery_authorizations(id) on delete restrict,
  email_event_id uuid references public.email_events(id) on delete restrict,
  provider_message_id text,
  provider_state text not null,
  event_created_at timestamptz,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  nonce uuid not null,
  attested_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  minimal_payload_json jsonb not null default '{}'::jsonb,
  constraint phase14_provider_attestation_identity_chk check (
    (attestation_source='webhook' and provider_event_id is not null)
    or (attestation_source='provider_lookup' and provider_request_key is not null
      and authorization_id is not null and email_event_id is not null)
  ),
  unique(attestation_source,provider,nonce)
);
create unique index phase14_provider_attestation_event_uidx
  on public.phase14_provider_attestations(provider,provider_event_id)
  where attestation_source='webhook';
create index phase14_provider_attestation_lookup_idx
  on public.phase14_provider_attestations(provider,provider_request_key,recorded_at desc)
  where attestation_source='provider_lookup';

create table public.phase14_provider_attestation_consumptions (
  attestation_id uuid primary key references public.phase14_provider_attestations(id) on delete restrict,
  authorization_id uuid not null references public.report_delivery_authorizations(id) on delete restrict,
  consumed_by uuid not null references public.admin_profiles(id) on delete restrict,
  consumed_session_id uuid not null,
  consumed_at timestamptz not null default now()
);

alter table public.phase14_provider_attestations enable row level security;
alter table public.phase14_provider_attestation_consumptions enable row level security;
revoke all on table public.phase14_provider_attestations from public,anon,authenticated,service_role;
revoke all on table public.phase14_provider_attestation_consumptions from public,anon,authenticated,service_role;
grant select on table public.phase14_provider_attestations to authenticated;
grant select on table public.phase14_provider_attestation_consumptions to authenticated;
create policy phase14_provider_attestations_admin_select on public.phase14_provider_attestations
  for select to authenticated using (
    public.current_admin_role() in ('platform_admin','approver','reviewer','read_only_admin')
  );
create policy phase14_provider_attestation_consumptions_admin_select
  on public.phase14_provider_attestation_consumptions
  for select to authenticated using (
    public.current_admin_role() in ('platform_admin','approver','reviewer','read_only_admin')
  );

create or replace function public.guard_phase14_provider_attestation_immutable()
returns trigger language plpgsql set search_path=''
as $$
begin
  raise exception 'phase14_provider_attestation_immutable';
end;
$$;
create trigger trg_phase14_provider_attestation_immutable
  before update or delete on public.phase14_provider_attestations
  for each row execute function public.guard_phase14_provider_attestation_immutable();

create or replace function public.set_phase14_runtime_secret(
  p_secret_key text,
  p_secret_value text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb;
begin
  v_actor := public.phase14_require_actor(
    'runtime_secret_rotation',array['platform_admin']::public.admin_role[],true
  );
  if p_secret_key not in ('provider_webhook_db_hmac','provider_lookup_db_hmac') then
    raise exception 'phase14_runtime_secret_key_invalid';
  end if;
  if length(coalesce(p_secret_value,'')) < 32 then raise exception 'phase14_runtime_secret_too_short'; end if;
  insert into phase14_private.runtime_secrets(secret_key,secret_value,rotated_at,rotated_by)
  values (p_secret_key,p_secret_value,now(),(v_actor->>'user_id')::uuid)
  on conflict (secret_key) do update
  set secret_value=excluded.secret_value,rotated_at=excluded.rotated_at,rotated_by=excluded.rotated_by;
  perform set_config('phase14.authoritative_transition','runtime_secret_rotation',true);
  insert into public.audit_logs(actor_type,actor_user_id,entity_table,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,'phase14_private.runtime_secrets',
    'phase14_runtime_secret_rotated',jsonb_build_object('secret_key',p_secret_key));
  return jsonb_build_object('secret_key',p_secret_key,'rotated_at',now(),
    'fingerprint',encode(extensions.digest(convert_to(p_secret_value,'UTF8'),'sha256'),'hex'));
end;
$$;

create or replace function phase14_private.verify_hmac(
  p_secret_key text,
  p_canonical text,
  p_signature text,
  p_attested_at_epoch bigint
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_secret text; v_expected text;
begin
  if abs(extract(epoch from now())::bigint - p_attested_at_epoch) > 300 then
    raise exception 'phase14_attestation_timestamp_invalid';
  end if;
  if p_signature !~ '^[0-9a-f]{64}$' then raise exception 'phase14_attestation_hmac_invalid'; end if;
  select secret_value into v_secret from phase14_private.runtime_secrets
  where secret_key=p_secret_key;
  if v_secret is null then raise exception 'phase14_attestation_secret_unprovisioned'; end if;
  v_expected := encode(extensions.hmac(
    convert_to(p_canonical,'UTF8'),convert_to(v_secret,'UTF8'),'sha256'
  ),'hex');
  if v_expected <> p_signature then raise exception 'phase14_attestation_hmac_invalid'; end if;
  return true;
end;
$$;

create or replace function public.ingest_phase14_provider_webhook(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_created_at text,
  p_payload_sha256 text,
  p_payload_json jsonb,
  p_attested_at_epoch bigint,
  p_nonce uuid,
  p_attestation_hmac text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical text; v_id uuid; v_result jsonb; v_created timestamptz;
  v_authorization_id uuid; v_email_event_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  perform public.phase14_require_policy('provider_webhook_ingestion');
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'webhook_payload_fingerprint_invalid'; end if;
  v_created := p_event_created_at::timestamptz;
  v_canonical := concat_ws('|','webhook',lower(trim(p_provider)),p_provider_event_id,
    coalesce(p_provider_message_id,''),p_event_type,p_event_created_at,p_payload_sha256,
    p_attested_at_epoch::text,p_nonce::text);
  perform phase14_private.verify_hmac(
    'provider_webhook_db_hmac',v_canonical,p_attestation_hmac,p_attested_at_epoch
  );
  select e.id,a.id into v_email_event_id,v_authorization_id
  from public.email_events e
  left join public.report_delivery_authorizations a on a.email_event_id=e.id
  where e.provider=lower(trim(p_provider))
    and e.provider_message_id=p_provider_message_id
  order by e.created_at desc limit 1;
  insert into public.phase14_provider_attestations(
    attestation_source,provider,provider_event_id,authorization_id,email_event_id,
    provider_message_id,provider_state,
    event_created_at,payload_sha256,nonce,attested_at,minimal_payload_json
  ) values (
    'webhook',lower(trim(p_provider)),p_provider_event_id,v_authorization_id,v_email_event_id,
    p_provider_message_id,
    p_event_type,v_created,p_payload_sha256,p_nonce,to_timestamp(p_attested_at_epoch),
    jsonb_strip_nulls(jsonb_build_object('type',p_payload_json->>'type',
      'created_at',p_payload_json->>'created_at','reason',p_payload_json->>'reason'))
  ) on conflict (provider,provider_event_id) where attestation_source='webhook'
  do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.phase14_provider_attestations
    where attestation_source='webhook' and provider=lower(trim(p_provider))
      and provider_event_id=p_provider_event_id
      and provider_message_id is not distinct from p_provider_message_id
      and provider_state=p_event_type and event_created_at=v_created
      and payload_sha256=p_payload_sha256;
    if v_id is null then raise exception 'phase14_webhook_replay_mismatch'; end if;
  end if;
  perform set_config('phase14.authoritative_transition','trusted_provider_attestation',true);
  v_result := public.apply_email_provider_event_atomic(
    p_provider,p_provider_event_id,p_provider_message_id,p_event_type,v_created,
    p_payload_sha256,p_payload_json
  );
  return v_result || jsonb_build_object('attestation_id',v_id);
end;
$$;

create or replace function public.get_phase14_provider_attestation(
  p_attestation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_att public.phase14_provider_attestations%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  select * into v_att from public.phase14_provider_attestations
  where id=p_attestation_id;
  if not found then raise exception 'phase14_provider_attestation_missing'; end if;
  return jsonb_build_object(
    'id',v_att.id,'attestation_source',v_att.attestation_source,
    'provider',v_att.provider,'provider_event_id',v_att.provider_event_id,
    'provider_request_key',v_att.provider_request_key,
    'authorization_id',v_att.authorization_id,'email_event_id',v_att.email_event_id,
    'provider_message_id',v_att.provider_message_id,
    'provider_state',v_att.provider_state,
    'event_created_at',v_att.event_created_at,
    'payload_sha256',v_att.payload_sha256,
    'attested_at',v_att.attested_at,'recorded_at',v_att.recorded_at
  );
end;
$$;

create or replace function public.record_phase14_provider_lookup_attestation(
  p_provider text,
  p_provider_request_key text,
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text,
  p_provider_state text,
  p_payload_sha256 text,
  p_payload_json jsonb,
  p_attested_at_epoch bigint,
  p_nonce uuid,
  p_attestation_hmac text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical text; v_id uuid;
  v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  perform public.phase14_require_policy('manual_delivery');
  if p_provider_state not in ('accepted','not_found','pending','unknown') then
    raise exception 'phase14_provider_attestation_state_invalid';
  end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'phase14_provider_attestation_payload_invalid'; end if;
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for share;
  select * into v_event from public.email_events where id=p_email_event_id for share;
  if v_auth.id is null or v_event.id is null
     or v_auth.email_event_id is distinct from p_email_event_id
     or v_event.provider_request_key is distinct from p_provider_request_key
     or v_auth.provider is distinct from lower(trim(p_provider)) then
    raise exception 'phase14_provider_lookup_binding_invalid';
  end if;
  v_canonical := concat_ws('|','provider_lookup',lower(trim(p_provider)),
    p_provider_request_key,p_authorization_id::text,p_email_event_id::text,
    coalesce(p_provider_message_id,''),p_provider_state,
    p_payload_sha256,p_attested_at_epoch::text,p_nonce::text);
  perform phase14_private.verify_hmac(
    'provider_lookup_db_hmac',v_canonical,p_attestation_hmac,p_attested_at_epoch
  );
  insert into public.phase14_provider_attestations(
    attestation_source,provider,provider_request_key,authorization_id,email_event_id,
    provider_message_id,provider_state,
    payload_sha256,nonce,attested_at,minimal_payload_json
  ) values (
    'provider_lookup',lower(trim(p_provider)),p_provider_request_key,p_authorization_id,
    p_email_event_id,p_provider_message_id,
    p_provider_state,p_payload_sha256,p_nonce,to_timestamp(p_attested_at_epoch),
    jsonb_strip_nulls(jsonb_build_object('state',p_payload_json->>'state',
      'detail',left(p_payload_json->>'detail',500)))
  ) returning id into v_id;
  return v_id;
end;
$$;

-- 6. Tokenless worker facades. Each facade rebinds the opaque operation to the
-- exact commercial rows before invoking the existing transactional state machine.
create or replace function public.worker_claim_premium_report_generation(
  p_capability_id uuid,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid,
  p_report_type public.report_type default 'essential_self_assessment'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,p_fulfilment_id,null,null
  );
  return public.claim_premium_report_generation(
    p_order_reference,p_claim_owner,p_fulfilment_id,p_report_type
  );
end;
$$;

create or replace function public.worker_renew_premium_report_generation_lease(
  p_capability_id uuid,
  p_claim_token uuid
) returns timestamptz
language plpgsql security definer set search_path=''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.renew_premium_report_generation_lease(p_claim_token);
end;
$$;

create or replace function public.worker_recover_premium_report_generation_claim(
  p_capability_id uuid,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,p_fulfilment_id,null,null
  );
  return public.recover_premium_report_generation_claim(p_order_reference,p_claim_owner);
end;
$$;

create or replace function public.worker_commit_premium_report_draft(
  p_capability_id uuid,
  p_claim_token uuid,
  p_template_id uuid,
  p_storage_bucket text,
  p_temp_storage_path text,
  p_checksum text,
  p_generation_run_id uuid default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.commit_premium_report_draft(
    p_claim_token,p_template_id,p_storage_bucket,p_temp_storage_path,p_checksum,null,p_generation_run_id
  );
end;
$$;

create or replace function public.worker_publish_premium_report_generation(
  p_capability_id uuid,
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,p_report_id,null
  );
  return public.publish_premium_report_generation(p_claim_token,p_report_id);
end;
$$;

create or replace function public.worker_abandon_premium_report_generation_claim(
  p_capability_id uuid,
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then return false; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.abandon_premium_report_generation_claim(p_claim_token,p_reason);
end;
$$;

create or replace function public.worker_register_phase14_storage_cleanup(
  p_capability_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_expected_checksum text,
  p_claim_token uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.register_phase14_storage_cleanup(
    p_storage_bucket,p_storage_path,p_expected_checksum,p_claim_token,p_reason
  );
end;
$$;

create or replace function public.worker_link_phase14_storage_cleanup_report(
  p_capability_id uuid,
  p_cleanup_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id=p_report_id;
  if not found then raise exception 'cleanup_report_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_report.fulfilment_id,
    p_report_id,null
  );
  return public.link_phase14_storage_cleanup_report(p_cleanup_id,p_report_id);
end;
$$;

create or replace function public.worker_record_phase14_storage_cleanup_result(
  p_capability_id uuid,
  p_cleanup_id uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue where id=p_cleanup_id;
  select * into v_cap from public.phase14_worker_capabilities where id=p_capability_id;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_cap.order_id,v_cap.assessment_id,v_cap.score_run_id,v_cap.fulfilment_id,
    v_queue.report_id,null
  );
  return public.record_phase14_storage_cleanup_result(p_cleanup_id,p_deleted,p_error);
end;
$$;

create or replace function public.worker_authorize_premium_report_delivery(
  p_capability_id uuid,
  p_report_id uuid,
  p_recipient text,
  p_provider text default 'resend'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id=p_report_id;
  if not found then raise exception 'report_not_found'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_report.order_id,v_report.assessment_id,
    v_report.score_run_id,v_report.fulfilment_id,p_report_id,p_recipient
  );
  return public.authorize_premium_report_delivery(p_report_id,p_recipient,'initial',false,p_provider,null);
end;
$$;

create or replace function public.worker_claim_premium_report_delivery(
  p_capability_id uuid,
  p_authorization_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_auth.order_id,v_auth.assessment_id,
    v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.claim_premium_report_delivery(p_authorization_id);
end;
$$;

create or replace function public.worker_mark_premium_report_delivery_dispatch_started(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_delivery_lease_token uuid
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_auth.order_id,v_auth.assessment_id,
    v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_dispatch_started(p_authorization_id,p_delivery_lease_token);
end;
$$;

create or replace function public.worker_fail_premium_report_delivery_before_dispatch(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_delivery_lease_token uuid,
  p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_auth.order_id,v_auth.assessment_id,
    v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.fail_premium_report_delivery_before_dispatch(
    p_authorization_id,p_delivery_lease_token,p_reason
  );
end;
$$;

create or replace function public.worker_finalize_premium_report_delivery(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_auth public.report_delivery_authorizations%rowtype;
  v_report public.reports%rowtype;
  v_cap public.phase14_worker_capabilities%rowtype;
  v_result jsonb;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  select * into v_cap from public.phase14_worker_capabilities
  where id=p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  if v_cap.status='consumed' then
    if v_auth.worker_capability_id is distinct from p_capability_id
       or not exists (
         select 1 from public.report_delivery_finalizations f
         where f.authorization_id=p_authorization_id
           and f.email_event_id=p_email_event_id
           and f.report_id=v_auth.report_id
           and f.provider=v_auth.provider
           and f.provider_message_id=p_provider_message_id
       ) then
      raise exception 'phase14_delivery_completion_replay_mismatch';
    end if;
    return jsonb_build_object('finalized',true,'idempotent_replay',true,
      'report_id',v_auth.report_id,'email_event_id',p_email_event_id,
      'worker_capability_consumed',true);
  end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,
    v_auth.report_id,v_auth.recipient_email::text
  );
  v_result := public.finalize_premium_report_delivery(
    p_authorization_id,p_email_event_id,p_provider_message_id
  );
  if coalesce((v_result->>'finalized')::boolean,false) then
    perform public.complete_phase14_worker_operation(p_capability_id);
    return v_result || jsonb_build_object('worker_capability_consumed',true);
  end if;
  return v_result;
end;
$$;

create or replace function public.worker_mark_premium_report_delivery_reconciliation_required(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_provider_message_id text,
  p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,
    v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_reconciliation_required(
    p_authorization_id,p_provider_message_id,p_reason
  );
end;
$$;

-- 7. Finalization locks the fulfilment row before any terminal write, requires a
-- successful compare-and-set, and preserves exact idempotent replay semantics.
alter table public.report_delivery_finalizations
  add column fulfilment_id uuid references public.report_fulfilments(id) on delete restrict;

update public.report_delivery_finalizations f
set fulfilment_id=r.fulfilment_id
from public.reports r
where r.id=f.report_id and f.fulfilment_id is null;

create or replace function public.finalize_premium_report_delivery(
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth public.report_delivery_authorizations%rowtype;
  v_existing public.report_delivery_finalizations%rowtype;
  v_report public.reports%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
  v_email public.email_events%rowtype;
  v_now timestamptz := now(); v_context jsonb;
begin
  perform public.phase14_require_security(
    'delivery_finalization',array['platform_admin','approver']::public.admin_role[],true,false
  );
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for update;
  if not found or v_auth.email_event_id <> p_email_event_id then
    raise exception 'delivery_finalization_binding_mismatch';
  end if;
  if coalesce(trim(p_provider_message_id),'') = '' then raise exception 'provider_message_id_required'; end if;
  select * into v_existing from public.report_delivery_finalizations
  where authorization_id=p_authorization_id for share;
  if found then
    if v_existing.email_event_id=p_email_event_id
       and v_existing.report_id=v_auth.report_id
       and v_existing.provider=v_auth.provider
       and v_existing.provider_message_id=p_provider_message_id
       and v_existing.fulfilment_id is not distinct from (
         select r.fulfilment_id from public.reports r where r.id=v_auth.report_id
       )
       and (v_auth.test_delivery or exists (
         select 1 from public.report_fulfilments f
         where f.id=v_existing.fulfilment_id and f.status='completed'
           and f.order_id=v_auth.order_id and f.assessment_id=v_auth.assessment_id
           and f.score_run_id=v_auth.score_run_id and f.report_id=v_auth.report_id
       )) then
      return jsonb_build_object('finalized',true,'idempotent_replay',true,
        'report_id',v_existing.report_id,'email_event_id',v_existing.email_event_id);
    end if;
    insert into public.phase14_operational_alerts(
      alert_key,severity,category,report_id,email_event_id,detail_json
    ) values (
      'delivery-finalization-replay-conflict:' || p_authorization_id,'critical',
      'delivery_finalization_replay_conflict',v_auth.report_id,p_email_event_id,
      jsonb_build_object('authorization_id',p_authorization_id,
        'incoming_email_event_id',p_email_event_id,'incoming_provider',v_auth.provider,
        'incoming_provider_message_id',p_provider_message_id,'persisted',to_jsonb(v_existing))
    ) on conflict (alert_key) do update
      set severity='critical',detail_json=excluded.detail_json,status='open';
    return jsonb_build_object('finalized',false,'conflict',true,
      'reason','delivery_finalization_replay_conflict');
  end if;
  if v_auth.status not in ('dispatching','reconciliation_required') then
    raise exception 'delivery_finalization_state_invalid:%',v_auth.status;
  end if;
  v_context := public.phase14_delivery_entitlement(
    v_auth.report_id,v_auth.recipient_email::text,v_auth.test_delivery,'email_delivery'
  );
  if v_context->>'report_checksum' <> v_auth.report_checksum then
    raise exception 'delivery_finalization_entitlement_changed';
  end if;
  select * into v_report from public.reports where id=v_auth.report_id for update;
  if not found then raise exception 'delivery_finalization_report_missing'; end if;
  if not v_auth.test_delivery and v_report.fulfilment_id is null then
    raise exception 'delivery_finalization_fulfilment_missing';
  end if;
  if v_report.fulfilment_id is not null then
    select * into v_fulfilment from public.report_fulfilments
    where id=v_report.fulfilment_id for update;
    if not found then raise exception 'delivery_finalization_fulfilment_missing'; end if;
    if v_fulfilment.order_id <> v_auth.order_id
       or v_fulfilment.assessment_id <> v_auth.assessment_id
       or v_fulfilment.score_run_id <> v_auth.score_run_id
       or v_fulfilment.report_id is distinct from v_report.id then
      raise exception 'delivery_finalization_fulfilment_binding_changed';
    end if;
    if not v_auth.test_delivery and v_fulfilment.status <> 'ready_for_delivery' then
      raise exception 'delivery_finalization_fulfilment_state_invalid:%',v_fulfilment.status;
    end if;
  end if;
  select * into v_email from public.email_events where id=p_email_event_id for update;
  if not found then raise exception 'delivery_finalization_email_missing'; end if;
  update public.email_events
  set status='sent',provider=v_auth.provider,provider_message_id=p_provider_message_id,
      sent_at=coalesce(sent_at,v_now),delivery_updated_at=v_now,send_lease_token=null,
      send_lease_expires_at=null,error_message=null
  where id=p_email_event_id
    and status in ('sending','provider_acceptance_uncertain','reconciliation_required');
  if not found then raise exception 'delivery_finalization_email_cas_failed'; end if;
  if not v_auth.test_delivery then
    update public.reports
    set status='released',released_at=coalesce(released_at,v_now),updated_at=v_now
    where id=v_report.id and status in ('generated','under_review','approved','released');
    if not found then raise exception 'delivery_finalization_report_cas_failed'; end if;
    if v_report.fulfilment_id is not null then
      update public.report_fulfilments
      set status='completed',current_step='email_sent',completed_at=coalesce(completed_at,v_now),
          report_id=v_report.id,updated_at=v_now
      where id=v_report.fulfilment_id and status='ready_for_delivery'
        and report_id=v_report.id;
      if not found then raise exception 'delivery_finalization_fulfilment_cas_failed'; end if;
    end if;
  end if;
  insert into public.report_delivery_finalizations(
    authorization_id,email_event_id,report_id,fulfilment_id,provider,provider_message_id,finalized_at
  ) values (v_auth.id,p_email_event_id,v_report.id,v_report.fulfilment_id,
    v_auth.provider,p_provider_message_id,v_now);
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,case when v_auth.test_delivery then 'email_test_sent' else 'email_sent' end,
    v_auth.authorised_by,'Atomic provider-acceptance finalization.',
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'test_delivery',v_auth.test_delivery,
      'worker_capability_id',v_auth.worker_capability_id));
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values (case when v_auth.worker_capability_id is null
      then 'admin'::public.audit_actor_type else 'system'::public.audit_actor_type end,
    v_auth.authorised_by,v_auth.assessment_id,'reports',v_report.id,
    case when v_auth.test_delivery then 'premium_report_test_delivery_finalized'
      else 'premium_report_delivery_finalized' end,
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'worker_capability_id',v_auth.worker_capability_id));
  if not v_auth.test_delivery then
    insert into public.assessment_events(
      assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
    ) values (
      v_auth.assessment_id,v_auth.order_id,v_report.id,'report_emailed_to_customer',
      'phase14-delivery-finalization:' || v_auth.id,
      jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
        'test_delivery',false)
    );
  end if;
  update public.report_delivery_authorizations
  set status='finalized',provider_message_id=p_provider_message_id,finalized_at=v_now,
      lease_token=null,lease_expires_at=null,updated_at=v_now
  where id=v_auth.id and status in ('dispatching','reconciliation_required');
  if not found then raise exception 'delivery_finalization_authorization_cas_failed'; end if;
  return jsonb_build_object('finalized',true,'idempotent_replay',false,
    'report_id',v_report.id,'email_event_id',p_email_event_id);
end;
$$;

create or replace function public.resolve_premium_report_delivery_reconciliation(
  p_authorization_id uuid,
  p_resolution text,
  p_attestation_id uuid,
  p_operator_override boolean default false,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype; v_att public.phase14_provider_attestations%rowtype;
  v_result jsonb;
begin
  v_actor := public.phase14_require_security(
    'provider_reconciliation',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_resolution not in ('accepted','not_accepted') then
    raise exception 'delivery_reconciliation_resolution_invalid';
  end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'delivery_reconciliation_reason_required'; end if;
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for update;
  if not found or v_auth.status <> 'reconciliation_required' then
    raise exception 'delivery_reconciliation_state_invalid';
  end if;
  select * into v_event from public.email_events where id=v_auth.email_event_id for update;
  select * into v_att from public.phase14_provider_attestations
  where id=p_attestation_id for share;
  if not found or v_att.attestation_source <> 'provider_lookup'
     or v_att.provider <> v_auth.provider
     or v_att.authorization_id is distinct from v_auth.id
     or v_att.email_event_id is distinct from v_auth.email_event_id
     or v_att.provider_request_key is distinct from v_event.provider_request_key
     or v_att.recorded_at < v_auth.dispatch_started_at then
    raise exception 'delivery_reconciliation_attestation_binding_invalid';
  end if;
  if exists (select 1 from public.phase14_provider_attestation_consumptions
    where attestation_id=v_att.id) then
    raise exception 'delivery_reconciliation_attestation_already_consumed';
  end if;
  if p_resolution='accepted' then
    if v_att.provider_state <> 'accepted'
       or coalesce(trim(v_att.provider_message_id),'')='' then
      raise exception 'delivery_reconciliation_acceptance_not_attested';
    end if;
  else
    if not p_operator_override then raise exception 'delivery_reconciliation_operator_override_required'; end if;
    if v_att.provider_state <> 'not_found' then
      raise exception 'delivery_reconciliation_non_acceptance_not_attested';
    end if;
  end if;
  insert into public.phase14_provider_attestation_consumptions(
    attestation_id,authorization_id,consumed_by,consumed_session_id
  ) values (
    v_att.id,v_auth.id,(v_actor->>'user_id')::uuid,(v_actor->>'session_id')::uuid
  );
  if p_resolution='accepted' then
    v_result := public.finalize_premium_report_delivery(
      v_auth.id,v_auth.email_event_id,v_att.provider_message_id
    );
  else
    update public.report_delivery_authorizations
    set status='revoked',revoked_reason=p_reason,lease_token=null,lease_expires_at=null,updated_at=now()
    where id=v_auth.id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_authorization_cas_failed'; end if;
    update public.email_events
    set status='failed_before_provider',error_message=p_reason,reconciliation_attempted_at=now(),
        reconciliation_result_json=jsonb_build_object('attestation_id',v_att.id,
          'provider_state',v_att.provider_state),delivery_updated_at=now()
    where id=v_auth.email_event_id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_email_cas_failed'; end if;
    v_result := jsonb_build_object('resolved',true,'resolution','not_accepted',
      'authorization_id',v_auth.id);
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_auth.assessment_id,
    'report_delivery_authorizations',v_auth.id,
    'premium_report_delivery_reconciliation_resolved',
    jsonb_build_object('resolution',p_resolution,'attestation_id',v_att.id,
      'provider_message_id',v_att.provider_message_id,'operator_override',p_operator_override,
      'reason',p_reason));
  return v_result;
end;
$$;

-- 8. Bounce remediation proves an actual address correction and applies the
-- verified customer/order update atomically before a retry can be authorised.
alter table public.report_delivery_remediations
  add column previous_recipient_email citext,
  add column corrected_recipient_email citext,
  add column customer_update_applied_at timestamptz,
  add column authorised_session_id uuid;

update public.report_delivery_remediations
set previous_recipient_email=recipient_email
where previous_recipient_email is null;

create or replace function public.authorize_bounced_report_redelivery(
  p_prior_email_event_id uuid,
  p_corrected_recipient text,
  p_reason text,
  p_evidence jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_event public.email_events%rowtype; v_order public.orders%rowtype;
  v_corrected public.citext; v_id uuid;
begin
  v_actor := public.phase14_require_security(
    'email_resend',array['platform_admin','approver']::public.admin_role[],true,false
  );
  v_corrected := lower(trim(p_corrected_recipient))::public.citext;
  if v_corrected::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'bounce_remediation_corrected_recipient_invalid';
  end if;
  if coalesce(trim(p_reason),'')='' or coalesce(p_evidence,'{}'::jsonb)='{}'::jsonb
     or coalesce(trim(p_evidence->>'verification_method'),'')=''
     or coalesce(trim(p_evidence->>'verified_at'),'')='' then
    raise exception 'bounce_remediation_verified_evidence_required';
  end if;
  select * into v_event from public.email_events
  where id=p_prior_email_event_id for update;
  if not found or v_event.status <> 'bounced' or v_event.order_id is null
     or v_event.report_id is null then
    raise exception 'bounce_remediation_event_ineligible';
  end if;
  if v_corrected = v_event.recipient_email then
    raise exception 'bounce_remediation_recipient_not_corrected';
  end if;
  select * into v_order from public.orders where id=v_event.order_id for update;
  if not found or lower(v_order.customer_email::text) <> lower(v_event.recipient_email::text) then
    raise exception 'bounce_remediation_order_recipient_changed';
  end if;
  update public.orders
  set customer_email=v_corrected,updated_at=now()
  where id=v_order.id and customer_email=v_event.recipient_email;
  if not found then raise exception 'bounce_remediation_customer_update_cas_failed'; end if;
  insert into public.report_delivery_remediations(
    prior_email_event_id,report_id,recipient_email,previous_recipient_email,
    corrected_recipient_email,remediation_type,reason,evidence_json,authorised_by,
    authorised_session_id,customer_update_applied_at
  ) values (
    v_event.id,v_event.report_id,v_corrected,v_event.recipient_email,
    v_corrected,'bounce_retry',p_reason,p_evidence,(v_actor->>'user_id')::uuid,
    (v_actor->>'session_id')::uuid,now()
  ) returning id into v_id;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,before_json,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_event.assessment_id,
    'report_delivery_remediations',v_id,'premium_report_bounce_retry_authorized',
    jsonb_build_object('previous_recipient',v_event.recipient_email),
    jsonb_build_object('prior_email_event_id',v_event.id,
      'corrected_recipient',v_corrected,'reason',p_reason,
      'verification_method',p_evidence->>'verification_method'));
  return v_id;
end;
$$;

create or replace function public.authorize_premium_report_delivery(
  p_report_id uuid,
  p_recipient text,
  p_delivery_mode text default 'initial',
  p_allow_test_override boolean default false,
  p_provider text default 'resend',
  p_bounce_remediation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb; v_context jsonb; v_gate_version integer; v_event public.email_events%rowtype;
  v_auth public.report_delivery_authorizations%rowtype; v_attempt integer; v_dedupe text;
  v_prior_bounce public.email_events%rowtype; v_remediation public.report_delivery_remediations%rowtype;
  v_worker_capability_id uuid;
begin
  if p_delivery_mode not in ('initial','bounce_retry') then raise exception 'delivery_mode_invalid'; end if;
  v_actor := public.phase14_require_security(
    case when p_delivery_mode='bounce_retry' then 'email_resend' else 'email_delivery' end,
    array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_allow_test_override then perform public.phase14_require_policy('recipient_override'); end if;
  if coalesce(trim(p_provider),'')='' then raise exception 'delivery_provider_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase14-delivery:' || p_report_id || ':' || lower(trim(p_recipient)),0
  ));
  v_context := public.phase14_delivery_entitlement(
    p_report_id,p_recipient,p_allow_test_override,'email_delivery'
  );
  v_gate_version := (v_actor->>'gate_version')::integer;
  v_worker_capability_id := nullif(v_actor->>'capability_id','')::uuid;
  if exists (select 1 from public.email_events
    where report_id=p_report_id and status='complained') then
    raise exception 'delivery_complaint_permanently_non_retriable';
  end if;
  if exists (select 1 from public.email_events
    where report_id=p_report_id
      and status in ('sending','provider_acceptance_uncertain','reconciliation_required')) then
    raise exception 'delivery_provider_acceptance_unresolved';
  end if;
  if p_delivery_mode='bounce_retry' then
    select * into v_remediation from public.report_delivery_remediations
    where id=p_bounce_remediation_id and report_id=p_report_id
      and corrected_recipient_email=lower(trim(p_recipient))
      and recipient_email=lower(trim(p_recipient))
      and remediation_type='bounce_retry' and status='authorised'
      and customer_update_applied_at is not null
    for update;
    if not found then raise exception 'delivery_bounce_remediation_required'; end if;
    select * into v_prior_bounce from public.email_events
    where id=v_remediation.prior_email_event_id and report_id=p_report_id
      and recipient_email=v_remediation.previous_recipient_email
      and notification_type='premium_report_pdf' and status='bounced'
    for share;
    if not found then raise exception 'delivery_bounce_remediation_prior_event_invalid'; end if;
  elsif p_bounce_remediation_id is not null then
    raise exception 'delivery_bounce_remediation_not_applicable';
  end if;
  if p_delivery_mode='initial' then
    select * into v_event from public.email_events
    where report_id=p_report_id and recipient_email=lower(trim(p_recipient))
      and notification_type='premium_report_pdf'
      and status in ('sent','delivery_delayed','delivered','bounced','complained')
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('reused_existing_send',true,'email_event_id',v_event.id,
        'provider_message_id',v_event.provider_message_id,'status',v_event.status,
        'recipient',lower(trim(p_recipient)),'test_delivery',(v_context->>'test_delivery')::boolean);
    end if;
  end if;
  select count(*)+1 into v_attempt from public.email_events where report_id=p_report_id;
  v_dedupe := 'premium-report-delivery:' || p_report_id || ':' || lower(trim(p_recipient))
    || ':attempt-' || v_attempt;
  insert into public.email_events(
    assessment_id,order_id,report_id,recipient_email,template_key,notification_type,
    dedupe_key,provider_request_key,provider_idempotency_key,provider,status,
    attempt_number,metadata_json
  ) values (
    (v_context->>'assessment_id')::uuid,(v_context->>'order_id')::uuid,p_report_id,
    lower(trim(p_recipient)),'premium_report_pdf_v1','premium_report_pdf',v_dedupe,
    v_dedupe,v_dedupe,lower(trim(p_provider)),'queued',v_attempt,
    jsonb_build_object('attachment_checksum',v_context->>'report_checksum',
      'test_delivery',(v_context->>'test_delivery')::boolean,
      'bounce_remediation_id',p_bounce_remediation_id)
  ) returning * into v_event;
  insert into public.report_delivery_authorizations(
    report_id,report_checksum,recipient_email,order_id,assessment_id,score_run_id,
    security_gate_version,authorised_by,authorised_session_id,worker_capability_id,
    provider,email_event_id,test_delivery,bounce_remediation_id
  ) values (
    p_report_id,v_context->>'report_checksum',lower(trim(p_recipient)),
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,v_gate_version,nullif(v_actor->>'user_id','')::uuid,
    nullif(v_actor->>'session_id','')::uuid,v_worker_capability_id,
    lower(trim(p_provider)),v_event.id,(v_context->>'test_delivery')::boolean,
    p_bounce_remediation_id
  ) returning * into v_auth;
  if p_bounce_remediation_id is not null then
    update public.report_delivery_remediations
    set status='consumed',consumed_at=now()
    where id=p_bounce_remediation_id and status='authorised';
    if not found then raise exception 'delivery_bounce_remediation_consume_cas_failed'; end if;
  end if;
  return jsonb_build_object('reused_existing_send',false,'authorization_id',v_auth.id,
    'email_event_id',v_event.id,'provider_request_key',v_event.provider_request_key,
    'attempt_number',v_event.attempt_number,'recipient',v_auth.recipient_email,
    'test_delivery',v_auth.test_delivery,'status',v_auth.status);
end;
$$;

-- 11. Runtime grant inventory: generic service clients can read only where
-- explicitly needed and mutate solely through the reviewed facades.
do $$
declare v_function record;
begin
  for v_function in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'authorize_bounced_report_redelivery','authorize_phase14_worker_action',
      'authorize_phase14_worker_operation','authorize_premium_report_delivery',
      'claim_phase14_ai_attempt','claim_phase14_storage_cleanup_jobs',
      'claim_phase14_worker_operation','claim_premium_report_workflow_start',
      'cleanup_expired_premium_report_claims','complete_phase14_storage_cleanup_job',
      'complete_phase14_generation_operation','complete_phase14_worker_operation',
      'finalize_premium_report_delivery','get_phase14_provider_attestation',
      'ingest_phase14_provider_webhook','link_premium_report_generation_run',
      'phase14_activate_worker_operation',
      'queue_premium_report_fulfilment','record_phase14_operational_alert',
      'record_phase14_provider_lookup_attestation','record_phase14_report_download',
      'record_phase14_report_generated','record_premium_report_generation_run',
      'record_premium_report_workflow_start','renew_phase14_worker_operation',
      'resolve_premium_report_delivery_reconciliation','set_phase14_ai_route_policy',
      'set_phase14_feature_policy','set_phase14_runtime_secret',
      'set_phase14_security_gate_version',
      'settle_phase14_ai_attempt','suspend_phase14_security_gate',
      'transition_premium_report_fulfilment','worker_abandon_premium_report_generation_claim',
      'worker_authorize_premium_report_delivery','worker_claim_premium_report_delivery',
      'worker_claim_premium_report_generation','worker_cleanup_expired_premium_report_claims',
      'worker_commit_premium_report_draft','worker_fail_premium_report_delivery_before_dispatch',
      'worker_finalize_premium_report_delivery','worker_link_phase14_storage_cleanup_report',
      'worker_mark_premium_report_delivery_dispatch_started',
      'worker_mark_premium_report_delivery_reconciliation_required',
      'worker_publish_premium_report_generation','worker_record_phase14_storage_cleanup_result',
      'worker_recover_premium_report_generation_claim',
      'worker_recover_stale_premium_report_email_send','worker_register_phase14_storage_cleanup',
      'worker_renew_premium_report_generation_lease'
    ])
  loop
    execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',
      v_function.nspname,v_function.proname,v_function.args);
  end loop;
  execute 'revoke insert,update,delete,truncate on public.report_fulfilments,
    public.report_generation_runs,public.report_ai_attempts,public.report_generation_claims,
    public.report_delivery_authorizations,public.report_delivery_finalizations,
    public.phase14_operational_alerts,
    public.phase14_storage_cleanup_queue,public.report_delivery_remediations,
    public.phase14_provider_attestations,public.phase14_provider_attestation_consumptions
    from service_role';
  execute 'revoke truncate on public.audit_logs,public.report_events,
    public.assessment_events,public.email_events,public.email_provider_events
    from service_role';
  execute 'revoke execute on function public.claim_phase14_worker_capability(uuid,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.complete_phase14_worker_capability(uuid,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.claim_phase14_storage_cleanup_jobs(uuid,text,integer) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.complete_phase14_storage_cleanup_job(uuid,text,uuid,uuid,boolean,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.resolve_premium_report_delivery_reconciliation(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.authorize_bounced_report_redelivery(uuid,text,jsonb) from public,anon,authenticated,service_role';
  execute 'grant execute on function public.claim_phase14_worker_operation(uuid,text),
    public.renew_phase14_worker_operation(uuid,text),public.complete_phase14_worker_operation(uuid),
    public.authorize_phase14_worker_action(uuid,text),
    public.claim_premium_report_workflow_start(uuid,uuid),
    public.record_premium_report_workflow_start(uuid,uuid,boolean,text,text),
    public.worker_cleanup_expired_premium_report_claims(uuid,interval),
    public.claim_phase14_storage_cleanup_jobs(uuid,integer),
    public.complete_phase14_storage_cleanup_job(uuid,uuid,uuid,text,text,text,boolean,boolean,text),
    public.ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text),
    public.get_phase14_provider_attestation(uuid),
    public.record_phase14_provider_lookup_attestation(text,text,uuid,uuid,text,text,text,jsonb,bigint,uuid,text),
    public.claim_phase14_ai_attempt(uuid,jsonb),public.settle_phase14_ai_attempt(uuid,uuid,jsonb),
    public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text),
    public.record_premium_report_generation_run(uuid,uuid,jsonb),
    public.link_premium_report_generation_run(uuid,uuid,uuid),
    public.record_phase14_report_generated(uuid,uuid,uuid,text,text,jsonb),
    public.complete_phase14_generation_operation(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb),
    public.record_phase14_operational_alert(text,text,uuid,uuid,jsonb,text),
    public.worker_claim_premium_report_generation(uuid,text,text,uuid,public.report_type),
    public.worker_renew_premium_report_generation_lease(uuid,uuid),
    public.worker_recover_premium_report_generation_claim(uuid,text,text,uuid),
    public.worker_commit_premium_report_draft(uuid,uuid,uuid,text,text,text,uuid),
    public.worker_publish_premium_report_generation(uuid,uuid,uuid),
    public.worker_abandon_premium_report_generation_claim(uuid,uuid,text),
    public.worker_register_phase14_storage_cleanup(uuid,text,text,text,uuid,text),
    public.worker_link_phase14_storage_cleanup_report(uuid,uuid,uuid),
    public.worker_record_phase14_storage_cleanup_result(uuid,uuid,boolean,text),
    public.worker_authorize_premium_report_delivery(uuid,uuid,text,text),
    public.worker_claim_premium_report_delivery(uuid,uuid),
    public.worker_mark_premium_report_delivery_dispatch_started(uuid,uuid,uuid),
    public.worker_fail_premium_report_delivery_before_dispatch(uuid,uuid,uuid,text),
    public.worker_finalize_premium_report_delivery(uuid,uuid,uuid,text),
    public.worker_mark_premium_report_delivery_reconciliation_required(uuid,uuid,text,text)
    to service_role';
  execute 'grant execute on function public.set_phase14_ai_route_policy(text,boolean),
    public.set_phase14_feature_policy(text,boolean,text),
    public.set_phase14_security_gate_version(integer,text),
    public.suspend_phase14_security_gate(text),
    public.set_phase14_runtime_secret(text,text),
    public.authorize_phase14_worker_operation(text,text,uuid,uuid,uuid,uuid,uuid,text,integer,text),
    public.queue_premium_report_fulfilment(text,text),
    public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text),
    public.record_premium_report_generation_run(uuid,uuid,jsonb),
    public.link_premium_report_generation_run(uuid,uuid,uuid),
    public.record_phase14_report_generated(uuid,uuid,uuid,text,text,jsonb),
    public.record_phase14_report_download(uuid,boolean,jsonb),
    public.authorize_premium_report_delivery(uuid,text,text,boolean,text,uuid),
    public.finalize_premium_report_delivery(uuid,uuid,text),
    public.authorize_bounced_report_redelivery(uuid,text,text,jsonb),
    public.resolve_premium_report_delivery_reconciliation(uuid,text,uuid,boolean,text)
    to authenticated';
end;
$$;

-- END ARCHIVED SOURCE: unpublished-remediation/20260715022146_phase14_fifth_adversarial_remediation.sql

-- BEGIN ARCHIVED SOURCE: unpublished-remediation/20260715073613_phase14_sixth_adversarial_remediation.sql
-- Phase 14 sixth adversarial remediation.
--
-- This migration is deliberately disabled-by-default.  It creates no secret,
-- enables no gate or policy, and performs no provider or storage operation.

-- ---------------------------------------------------------------------------
-- 1. Immutable ownership for Phase 14 rows in shared event/audit tables.
-- ---------------------------------------------------------------------------

alter table public.audit_logs add column phase14_operation_ref text;
alter table public.report_events add column phase14_operation_ref text;
alter table public.assessment_events add column phase14_operation_ref text;
alter table public.email_events add column phase14_operation_ref text;
alter table public.email_provider_events add column phase14_operation_ref text;

alter table public.audit_logs add constraint audit_logs_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.report_events add constraint report_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.assessment_events add constraint assessment_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.email_events add constraint email_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.email_provider_events add constraint email_provider_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');

-- Reviewed deterministic backfill.  Event/action names are used once to locate
-- historical rows; after this statement ownership is carried by an immutable
-- operation reference and is independent of the row's current shape.
select set_config('phase14.authoritative_transition','migration',true);
update public.audit_logs
set phase14_operation_ref = 'phase14:audit:' || id::text
where phase14_operation_ref is null and (
  action ~ '^(phase14_|premium_report_|report_(generated|regenerated|download_))'
  or entity_table in (
    'phase14_security_gates','phase14_feature_policies','phase14_worker_capabilities',
    'report_fulfilments','report_generation_runs','report_ai_attempts',
    'report_generation_claims','report_delivery_authorizations',
    'report_delivery_finalizations','report_delivery_remediations',
    'phase14_provider_attestations','phase14_storage_cleanup_queue'
  )
);
update public.report_events
set phase14_operation_ref = 'phase14:report-event:' || id::text
where phase14_operation_ref is null and event_type in (
  'generated','regenerated','email_sent','email_test_sent','download_requested'
);
update public.assessment_events
set phase14_operation_ref = 'phase14:assessment-event:' || id::text
where phase14_operation_ref is null and event_type in (
  'report_generated','admin_report_downloaded','report_emailed_to_customer'
);
update public.email_events
set phase14_operation_ref = 'phase14:email-event:' || id::text
where phase14_operation_ref is null and (
  notification_type = 'premium_report_pdf' or provider_request_key is not null
);
update public.email_provider_events p
set phase14_operation_ref = 'phase14:provider-event:' || p.id::text
where p.phase14_operation_ref is null and exists (
  select 1 from public.email_events e
  where e.id = p.email_event_id and e.phase14_operation_ref is not null
);

create or replace function public.phase14_shared_row_was_owned(
  p_table_name text,
  p_row jsonb
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_table_name
    when 'audit_logs' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'action','') ~ '^(phase14_|premium_report_|report_(generated|regenerated|download_))'
      or coalesce(p_row->>'entity_table','') in (
        'phase14_security_gates','phase14_feature_policies','phase14_worker_capabilities',
        'report_fulfilments','report_generation_runs','report_ai_attempts',
        'report_generation_claims','report_delivery_authorizations',
        'report_delivery_finalizations','report_delivery_remediations',
        'phase14_provider_attestations','phase14_storage_cleanup_queue'
      )
    when 'report_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'event_type','') in (
        'generated','regenerated','email_sent','email_test_sent','download_requested'
      )
    when 'assessment_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'event_type','') in (
        'report_generated','admin_report_downloaded','report_emailed_to_customer'
      )
    when 'email_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'notification_type','') = 'premium_report_pdf'
      or coalesce(p_row->>'provider_request_key','') <> ''
    when 'email_provider_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
    else false
  end;
$$;

create or replace function public.guard_phase14_authoritative_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_old_owned boolean := false;
  v_new_owned boolean := false;
  v_context text := nullif(current_setting('phase14.authoritative_transition', true), '');
  v_transition_owner name;
begin
  if tg_table_name = 'phase14_operational_alerts' then
    v_old_owned := tg_op in ('UPDATE','DELETE');
    v_new_owned := tg_op in ('INSERT','UPDATE');
  else
    v_old_owned := public.phase14_shared_row_was_owned(tg_table_name, v_old);
    v_new_owned := public.phase14_shared_row_was_owned(tg_table_name, v_new);
  end if;
  if tg_table_name='email_provider_events' and tg_op in ('INSERT','UPDATE')
     and not v_new_owned and nullif(v_new->>'email_event_id','') is not null then
    v_new_owned:=exists(select 1 from public.email_events e
      where e.id=(v_new->>'email_event_id')::uuid and e.phase14_operation_ref is not null);
  end if;

  select pg_get_userbyid(p.proowner) into v_transition_owner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'phase14_require_security'
  order by p.oid limit 1;

  if v_old_owned or v_new_owned then
    if current_user is distinct from v_transition_owner
       or coalesce(v_context,'') not in (
         'authenticated_rpc','fulfilment_queue_rpc','fulfilment_transition_rpc',
         'gate_administration','gate_invalidation','migration','operational_alert_rpc',
         'policy_approval','runtime_secret_rotation','trusted_provider_attestation',
         'worker_authorization','worker_attested_rpc','worker_rpc','worker_completion'
       ) then
      raise exception 'phase14_authoritative_rpc_required:%:%', tg_table_name, tg_op;
    end if;
  end if;

  if tg_table_name <> 'phase14_operational_alerts' and tg_op = 'UPDATE' and v_old_owned then
    if old.phase14_operation_ref is distinct from new.phase14_operation_ref then
      raise exception 'phase14_operation_ref_immutable:%', tg_table_name;
    end if;
  end if;

  if tg_table_name <> 'phase14_operational_alerts' then
    if tg_op in ('INSERT','UPDATE') and v_new_owned
       and new.phase14_operation_ref is null then
      new.phase14_operation_ref := 'phase14:' || replace(tg_table_name,'_','-') || ':' || new.id::text;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Operational alerts are an authoritative table with no runtime DML grants;
-- unlike the five shared tables, they do not need the shared-row marker guard.
drop trigger if exists trg_phase14_authoritative_mutation on public.phase14_operational_alerts;

-- ---------------------------------------------------------------------------
-- 2. Monotonic authority epoch and invalidation.
-- ---------------------------------------------------------------------------

alter table public.phase14_security_gates
  add column authority_epoch bigint not null default 1 check (authority_epoch > 0);
alter table public.phase14_feature_policies
  add column approved_authority_epoch bigint check (approved_authority_epoch is null or approved_authority_epoch > 0);
alter table public.phase14_ai_route_policies
  add column approved_authority_epoch bigint check (approved_authority_epoch is null or approved_authority_epoch > 0);
alter table public.phase14_worker_capabilities
  add column authority_epoch bigint not null default 1 check (authority_epoch > 0),
  add column expected_step text not null default 'claim',
  add column workflow_execution_id text;
alter table public.phase14_provider_attestations
  add column authority_epoch bigint not null default 1 check (authority_epoch > 0),
  add column authorization_status text,
  add column authorization_updated_at timestamptz;

create or replace function public.bump_phase14_authority_epoch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.required_version is distinct from new.required_version
     or old.satisfied_version is distinct from new.satisfied_version
     or old.status is distinct from new.status then
    new.authority_epoch := old.authority_epoch + 1;
  elsif new.authority_epoch is distinct from old.authority_epoch then
    raise exception 'phase14_authority_epoch_managed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_phase14_gate_bump_authority_epoch on public.phase14_security_gates;
create trigger trg_phase14_gate_bump_authority_epoch
  before update on public.phase14_security_gates
  for each row execute function public.bump_phase14_authority_epoch();

create or replace function public.invalidate_phase14_authority_on_gate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.authority_epoch is distinct from new.authority_epoch then
    perform set_config('phase14.authoritative_transition', 'gate_invalidation', true);
    update public.phase14_feature_policies
    set enabled = false, approved_gate_version = null,
        approved_authority_epoch = null, approved_at = null,
        reason = 'Automatically disabled because the Phase 14 authority epoch changed.',
        updated_at = now();
    update public.phase14_ai_route_policies
    set enabled = false, approved_gate_version = null,
        approved_authority_epoch = null, approved_by = null,
        approved_session_id = null, approved_at = null, updated_at = now();
    update public.phase14_worker_capabilities
    set status = 'revoked', revoked_at = now(),
        revoked_reason = 'Phase 14 authority epoch changed.',
        lease_secret_hash = null, lease_expires_at = null, updated_at = now()
    where status in ('authorised','leased');
    insert into public.audit_logs(actor_type,entity_table,action,before_json,after_json)
    values ('system','phase14_security_gates','phase14_authority_epoch_changed',
      jsonb_build_object('authority_epoch',old.authority_epoch,'status',old.status,
        'required_version',old.required_version,'satisfied_version',old.satisfied_version),
      jsonb_build_object('authority_epoch',new.authority_epoch,'status',new.status,
        'required_version',new.required_version,'satisfied_version',new.satisfied_version));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_phase14_gate_invalidate_authority on public.phase14_security_gates;
create trigger trg_phase14_gate_invalidate_authority
  after update on public.phase14_security_gates
  for each row
  when (old.authority_epoch is distinct from new.authority_epoch)
  execute function public.invalidate_phase14_authority_on_gate_change();

-- ---------------------------------------------------------------------------
-- 3. Private worker attestation key boundary and nonce ledger.
-- ---------------------------------------------------------------------------

create schema if not exists phase14_private;
revoke all on schema phase14_private from public, anon, authenticated, service_role;

create table phase14_private.worker_attestation_keys (
  key_id text primary key check (key_id ~ '^[a-zA-Z0-9._:-]{1,80}$'),
  vault_secret_id uuid not null unique,
  status text not null check (status in ('current','previous','retired')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);
create unique index phase14_worker_attestation_one_current_idx
  on phase14_private.worker_attestation_keys(status) where status = 'current';

create table phase14_private.worker_attestation_nonces (
  nonce uuid primary key,
  capability_id uuid not null references public.phase14_worker_capabilities(id) on delete restrict,
  action text not null,
  lease_generation integer not null,
  request_payload_hash text not null check (request_payload_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);
revoke all on all tables in schema phase14_private from public, anon, authenticated, service_role;
alter default privileges in schema phase14_private revoke all on tables from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Durable workflow-start outbox.
-- ---------------------------------------------------------------------------

create table public.phase14_workflow_start_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  fulfilment_id uuid not null references public.report_fulfilments(id) on delete restrict,
  capability_id uuid not null references public.phase14_worker_capabilities(id) on delete restrict,
  operation_key text not null,
  external_idempotency_key text not null,
  attempt_number integer not null default 1 check (attempt_number > 0),
  lease_owner text,
  lease_generation integer not null default 0 check (lease_generation >= 0),
  lease_expires_at timestamptz,
  status text not null default 'pending' check (status in (
    'pending','leased','acceptance_uncertain','started','failed_before_provider',
    'reconciliation_required','cancelled'
  )),
  run_id text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_error text,
  reconciliation_status text not null default 'not_required' check (reconciliation_status in (
    'not_required','required','in_progress','resolved','failed'
  )),
  authority_epoch bigint not null check (authority_epoch > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capability_id),
  unique (operation_key),
  unique (external_idempotency_key),
  check ((status = 'started' and run_id is not null and accepted_at is not null)
      or status <> 'started')
);
create index phase14_workflow_start_takeover_idx
  on public.phase14_workflow_start_outbox(status,lease_expires_at)
  where status in ('pending','leased');
alter table public.phase14_workflow_start_outbox enable row level security;
revoke all on table public.phase14_workflow_start_outbox from public,anon,authenticated,service_role;
grant select on table public.phase14_workflow_start_outbox to authenticated;
create policy phase14_workflow_start_outbox_admin_select
  on public.phase14_workflow_start_outbox for select to authenticated
  using (public.current_admin_role() = any(array[
    'platform_admin','reviewer','approver','read_only_admin'
  ]::public.admin_role[]));

-- ---------------------------------------------------------------------------
-- 5. Immutable customer contact verification.
-- ---------------------------------------------------------------------------

create table public.customer_contact_verifications (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  customer_identity text not null,
  previous_email public.citext not null,
  corrected_email public.citext not null,
  verification_method text not null check (verification_method in (
    'verified_email_link','support_callback','identity_provider','in_person'
  )),
  evidence_reference text not null,
  verified_at timestamptz not null,
  verified_by_actor uuid references public.admin_profiles(id) on delete restrict,
  verified_by_system text,
  expires_at timestamptz not null,
  status text not null default 'verified' check (status in ('verified','consumed','expired','revoked')),
  consumed_at timestamptz,
  consumed_by_remediation_id uuid,
  created_at timestamptz not null default now(),
  check (lower(previous_email::text) <> lower(corrected_email::text)),
  check (coalesce(trim(customer_identity),'') <> ''),
  check (coalesce(trim(evidence_reference),'') <> ''),
  check ((verified_by_actor is not null) <> (verified_by_system is not null)),
  check (expires_at > verified_at),
  check ((status = 'consumed' and consumed_at is not null and consumed_by_remediation_id is not null)
      or status <> 'consumed')
);
create index customer_contact_verifications_active_idx
  on public.customer_contact_verifications(order_id,status,expires_at);
alter table public.customer_contact_verifications enable row level security;
revoke all on table public.customer_contact_verifications from public,anon,authenticated,service_role;
grant select on table public.customer_contact_verifications to authenticated;
create policy customer_contact_verifications_admin_select
  on public.customer_contact_verifications for select to authenticated
  using (public.current_admin_role() = any(array['platform_admin','approver','read_only_admin']::public.admin_role[]));

create or replace function public.guard_customer_contact_verification_immutable()
returns trigger language plpgsql set search_path=''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'customer_contact_verification_immutable'; end if;
  if old.status = 'verified' and new.status = 'consumed'
     and old.id = new.id and old.order_id = new.order_id
     and old.assessment_id = new.assessment_id
     and old.customer_identity = new.customer_identity
     and old.previous_email = new.previous_email
     and old.corrected_email = new.corrected_email
     and old.verification_method = new.verification_method
     and old.evidence_reference = new.evidence_reference
     and old.verified_at = new.verified_at
     and old.verified_by_actor is not distinct from new.verified_by_actor
     and old.verified_by_system is not distinct from new.verified_by_system
     and old.expires_at = new.expires_at
     and new.consumed_at is not null and new.consumed_by_remediation_id is not null
     and current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='authorize_bounced_report_redelivery'
       order by p.oid desc limit 1) then
    return new;
  end if;
  raise exception 'customer_contact_verification_immutable';
end;
$$;
create trigger trg_customer_contact_verification_immutable
  before update or delete on public.customer_contact_verifications
  for each row execute function public.guard_customer_contact_verification_immutable();

create or replace function public.create_customer_contact_verification(
  p_order_id uuid,
  p_corrected_email text,
  p_verification_method text,
  p_evidence_reference text,
  p_valid_for_seconds integer default 1800
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_actor jsonb; v_order public.orders%rowtype; v_id uuid; v_corrected public.citext;
begin
  v_actor:=public.phase14_require_security(
    'email_resend',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_verification_method not in ('verified_email_link','support_callback','identity_provider','in_person')
     or coalesce(trim(p_evidence_reference),'')='' or p_valid_for_seconds<300 or p_valid_for_seconds>3600 then
    raise exception 'customer_contact_verification_input_invalid';
  end if;
  v_corrected:=lower(trim(p_corrected_email))::public.citext;
  if v_corrected::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'customer_contact_verification_email_invalid';
  end if;
  select * into v_order from public.orders where id=p_order_id for share;
  if not found or v_order.assessment_id is null or v_corrected=v_order.customer_email then
    raise exception 'customer_contact_verification_order_binding_invalid';
  end if;
  insert into public.customer_contact_verifications(
    order_id,assessment_id,customer_identity,previous_email,corrected_email,
    verification_method,evidence_reference,verified_at,verified_by_actor,expires_at
  ) values (
    v_order.id,v_order.assessment_id,coalesce(v_order.customer_name,v_order.customer_email::text),
    v_order.customer_email,v_corrected,p_verification_method,p_evidence_reference,
    clock_timestamp(),(v_actor->>'user_id')::uuid,
    clock_timestamp()+make_interval(secs=>p_valid_for_seconds)
  ) returning id into v_id;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_order.assessment_id,
    'customer_contact_verifications',v_id,'phase14_customer_contact_verified',
    jsonb_build_object('order_id',v_order.id,'verification_method',p_verification_method,
      'evidence_reference',p_evidence_reference,'expires_in_seconds',p_valid_for_seconds));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Cleanup evidence classification and durable final-object orphan jobs.
-- ---------------------------------------------------------------------------

alter table public.phase14_storage_cleanup_queue
  add column deletion_requested_at timestamptz,
  add column delete_api_accepted_at timestamptz,
  add column absence_verified_at timestamptz,
  add column verification_error text,
  add column provider_result_class text check (provider_result_class is null or provider_result_class in (
    'object_present','object_not_found','authentication_failure','authorization_failure',
    'rate_limited','timeout','network_failure','provider_outage','malformed_response',
    'checksum_read_failure','unknown_provider_error','delete_accepted'
  ));
alter table public.phase14_storage_cleanup_queue
  drop constraint phase14_storage_cleanup_queue_status_check,
  add constraint phase14_storage_cleanup_queue_status_check check (status in (
    'pending','leased','failed','deleted','dead_letter','retained'
  ));

-- Claims are settled, not deleted, so terminal publication has durable replay
-- evidence and remains recoverable until its transaction commits.
alter table public.report_generation_claims drop constraint report_generation_claims_state_chk;
alter table public.report_generation_claims add constraint report_generation_claims_state_chk
  check (state in ('claimed','committed','settled','abandoned'));
alter table public.report_generation_claims drop constraint report_generation_claims_storage_binding_chk;
alter table public.report_generation_claims add constraint report_generation_claims_storage_binding_chk check (
  state in ('claimed','abandoned') or state in ('committed','settled')
  and report_id is not null and temporary_storage_bucket is not null
  and temporary_storage_path is not null and final_storage_bucket is not null
  and final_storage_path is not null and expected_checksum ~ '^[0-9a-f]{64}$'
);

-- Bind all newly approved authority to the current epoch.  These triggers run
-- inside the reviewed SECURITY DEFINER administration functions; direct table
-- DML remains blocked by the pre-existing mutation guards and grants.
create or replace function public.bind_phase14_feature_policy_epoch()
returns trigger language plpgsql set search_path=''
as $$
declare v_gate public.phase14_security_gates%rowtype;
begin
  if new.enabled then
    select * into strict v_gate from public.phase14_security_gates
    where gate_key='phase14-premium-report' for share;
    if v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_gate.required_version then
      raise exception 'phase14_security_gate_unsatisfied:%',new.policy_key;
    end if;
    new.approved_authority_epoch := v_gate.authority_epoch;
  else
    new.approved_authority_epoch := null;
  end if;
  return new;
end;
$$;
create trigger trg_phase14_feature_policy_bind_epoch
  before insert or update on public.phase14_feature_policies
  for each row execute function public.bind_phase14_feature_policy_epoch();

create or replace function public.bind_phase14_ai_route_epoch()
returns trigger language plpgsql set search_path=''
as $$
declare v_gate public.phase14_security_gates%rowtype;
begin
  if new.enabled then
    select * into strict v_gate from public.phase14_security_gates
    where gate_key='phase14-premium-report' for share;
    if v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_gate.required_version then
      raise exception 'phase14_security_gate_unsatisfied:ai_route';
    end if;
    new.approved_authority_epoch := v_gate.authority_epoch;
  else
    new.approved_authority_epoch := null;
  end if;
  return new;
end;
$$;
create trigger trg_phase14_ai_route_bind_epoch
  before insert or update on public.phase14_ai_route_policies
  for each row execute function public.bind_phase14_ai_route_epoch();

create or replace function public.bind_phase14_capability_epoch()
returns trigger language plpgsql set search_path=''
as $$
declare v_gate public.phase14_security_gates%rowtype;
begin
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  new.authority_epoch := v_gate.authority_epoch;
  new.expected_step := 'claim';
  new.workflow_execution_id := null;
  return new;
end;
$$;
create trigger trg_phase14_capability_bind_epoch
  before insert on public.phase14_worker_capabilities
  for each row execute function public.bind_phase14_capability_epoch();

create or replace function public.bind_phase14_provider_attestation_epoch()
returns trigger language plpgsql set search_path=''
as $$
declare v_gate public.phase14_security_gates%rowtype; v_auth public.report_delivery_authorizations%rowtype;
begin
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  new.authority_epoch := v_gate.authority_epoch;
  if new.authorization_id is not null then
    select * into v_auth from public.report_delivery_authorizations
    where id=new.authorization_id for share;
    if not found then raise exception 'phase14_provider_attestation_authorization_missing'; end if;
    new.authorization_status := v_auth.status;
    new.authorization_updated_at := v_auth.updated_at;
  end if;
  return new;
end;
$$;
create trigger trg_phase14_provider_attestation_bind_epoch
  before insert on public.phase14_provider_attestations
  for each row execute function public.bind_phase14_provider_attestation_epoch();

create or replace function public.phase14_require_policy(p_policy_key text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_policy public.phase14_feature_policies%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%',p_policy_key;
  end if;
  select * into v_policy from public.phase14_feature_policies
  where policy_key=p_policy_key for share;
  if not found or not v_policy.enabled then raise exception 'phase14_policy_disabled:%',p_policy_key; end if;
  if v_policy.approved_gate_version is distinct from v_gate.satisfied_version
     or v_policy.required_gate_version is distinct from v_gate.required_version
     or v_policy.approved_authority_epoch is distinct from v_gate.authority_epoch then
    raise exception 'phase14_policy_authority_epoch_stale:%',p_policy_key;
  end if;
  return jsonb_build_object('policy_key',v_policy.policy_key,
    'gate_version',v_gate.satisfied_version,'authority_epoch',v_gate.authority_epoch,
    'approved_at',v_policy.approved_at);
end;
$$;

-- Provisioning/rotation is an explicit, AAL2-gated enablement action.  The
-- migration never calls it.  The HMAC value lives only in Supabase Vault and
-- is never returned by an RPC, view, log, operational row, or setting.
create or replace function public.rotate_phase14_worker_attestation_key(
  p_key_id text,
  p_secret text,
  p_overlap_seconds integer,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor jsonb; v_secret_id uuid; v_now timestamptz:=now();
begin
  v_actor := public.phase14_require_security(
    'runtime_secret_rotation',array['platform_admin']::public.admin_role[],true,false
  );
  if p_key_id !~ '^[a-zA-Z0-9._:-]{1,80}$' or length(p_secret)<32 then
    raise exception 'phase14_worker_attestation_key_invalid';
  end if;
  if p_overlap_seconds<300 or p_overlap_seconds>86400 or coalesce(trim(p_reason),'')='' then
    raise exception 'phase14_worker_attestation_rotation_invalid';
  end if;
  update phase14_private.worker_attestation_keys
  set status='previous',valid_until=v_now+make_interval(secs=>p_overlap_seconds)
  where status='current';
  v_secret_id := vault.create_secret(p_secret,
    'phase14-worker-attestation-'||p_key_id,
    'Phase 14 worker/database attestation verification key',null);
  insert into phase14_private.worker_attestation_keys(
    key_id,vault_secret_id,status,valid_from
  ) values (p_key_id,v_secret_id,'current',v_now);
  insert into public.audit_logs(actor_type,actor_user_id,entity_table,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,'phase14_worker_attestation_keys',
    'phase14_worker_attestation_key_rotated',
    jsonb_build_object('key_id',p_key_id,'overlap_seconds',p_overlap_seconds,'reason',p_reason));
  return jsonb_build_object('key_id',p_key_id,'activated_at',v_now,
    'previous_key_valid_for_seconds',p_overlap_seconds);
end;
$$;

create or replace function phase14_private.verify_worker_attestation(
  p_attestation jsonb,
  p_signature text,
  p_request_payload text,
  p_expected_action text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_cap public.phase14_worker_capabilities%rowtype;
  v_gate public.phase14_security_gates%rowtype;
  v_key phase14_private.worker_attestation_keys%rowtype;
  v_secret text; v_canonical text; v_expected_signature text; v_request_hash text;
  v_issued timestamptz; v_expires timestamptz; v_nonce uuid;
  v_capability_id uuid; v_lease_generation integer; v_action text; v_step text;
begin
  v_action := p_attestation->>'action';
  v_step := p_attestation->>'step';
  if v_action is distinct from p_expected_action
     or v_action !~ '^[a-z0-9_]{1,100}$'
     or v_step !~ '^[a-z0-9_]{1,100}$'
     or coalesce(p_attestation->>'operation_key','') !~ '^[a-zA-Z0-9._:/-]{1,240}$'
     or coalesce(p_attestation->>'execution_id','') !~ '^[a-zA-Z0-9._:/-]{1,240}$' then
    raise exception 'phase14_worker_attestation_shape_invalid';
  end if;
  begin
    v_capability_id := (p_attestation->>'capability_id')::uuid;
    v_lease_generation := (p_attestation->>'lease_generation')::integer;
    v_issued := to_timestamp((p_attestation->>'issued_at_epoch')::double precision);
    v_expires := to_timestamp((p_attestation->>'expires_at_epoch')::double precision);
    v_nonce := (p_attestation->>'nonce')::uuid;
  exception when others then
    raise exception 'phase14_worker_attestation_shape_invalid';
  end;
  v_request_hash := encode(extensions.digest(convert_to(p_request_payload,'utf8'),'sha256'),'hex');
  if p_attestation->>'request_payload_hash' is distinct from v_request_hash then
    raise exception 'phase14_worker_attestation_payload_mismatch';
  end if;
  if v_issued > clock_timestamp()+interval '5 seconds'
     or v_issued < clock_timestamp()-interval '2 minutes'
     or v_expires <= clock_timestamp()
     or v_expires > v_issued+interval '2 minutes' then
    raise exception 'phase14_worker_attestation_time_invalid';
  end if;

  select * into v_cap from public.phase14_worker_capabilities
  where id=v_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  if v_gate.status<>'satisfied' or v_gate.satisfied_version<>v_gate.required_version
     or v_cap.security_gate_version<>v_gate.satisfied_version
     or v_cap.authority_epoch<>v_gate.authority_epoch
     or (p_attestation->>'authority_epoch')::bigint<>v_gate.authority_epoch then
    raise exception 'phase14_worker_capability_authority_epoch_stale';
  end if;
  if p_attestation->>'capability_type' is distinct from v_cap.capability_type
     or p_attestation->>'operation_key' is distinct from v_cap.operation_key then
    raise exception 'phase14_worker_attestation_capability_binding_invalid';
  end if;
  if v_cap.order_id is distinct from nullif(p_attestation->>'order_id','')::uuid
     or v_cap.assessment_id is distinct from nullif(p_attestation->>'assessment_id','')::uuid
     or v_cap.score_run_id is distinct from nullif(p_attestation->>'score_run_id','')::uuid
     or v_cap.fulfilment_id is distinct from nullif(p_attestation->>'fulfilment_id','')::uuid
     or (v_cap.report_id is not null and v_cap.report_id is distinct from nullif(p_attestation->>'report_id','')::uuid)
     or (v_cap.recipient_email is not null and lower(v_cap.recipient_email::text)
         is distinct from lower(nullif(p_attestation->>'recipient',''))) then
    raise exception 'phase14_worker_attestation_commercial_binding_invalid';
  end if;
  if v_action='claim_phase14_worker_operation' then
    if v_cap.status not in ('authorised','leased') or v_cap.expected_step<>'claim'
       or v_lease_generation<>v_cap.lease_generation then
      raise exception 'phase14_worker_capability_claim_state_invalid';
    end if;
  else
    if v_cap.status<>'leased' or v_cap.lease_expires_at<=clock_timestamp()
       or v_cap.expires_at<=clock_timestamp()
       or v_cap.expected_step<>v_step
       or v_cap.lease_generation<>v_lease_generation
       or v_cap.workflow_execution_id is distinct from p_attestation->>'execution_id' then
      raise exception 'phase14_worker_attestation_step_or_lease_invalid';
    end if;
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);

  select * into v_key from phase14_private.worker_attestation_keys
  where key_id=p_attestation->>'key_id'
    and status in ('current','previous')
    and valid_from<=clock_timestamp()
    and (valid_until is null or valid_until>clock_timestamp())
  for share;
  if not found then raise exception 'phase14_worker_attestation_key_invalid'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
  where id=v_key.vault_secret_id;
  if v_secret is null then raise exception 'phase14_worker_attestation_key_unavailable'; end if;

  v_canonical := concat_ws('|',
    p_attestation->>'key_id',p_attestation->>'capability_id',p_attestation->>'capability_type',
    p_attestation->>'operation_key',p_attestation->>'execution_id',v_action,v_step,
    coalesce(p_attestation->>'order_id',''),coalesce(p_attestation->>'assessment_id',''),
    coalesce(p_attestation->>'score_run_id',''),coalesce(p_attestation->>'fulfilment_id',''),
    coalesce(p_attestation->>'report_id',''),coalesce(lower(p_attestation->>'recipient'),''),
    p_attestation->>'lease_generation',p_attestation->>'request_payload_hash',
    p_attestation->>'issued_at_epoch',p_attestation->>'expires_at_epoch',
    p_attestation->>'nonce',p_attestation->>'authority_epoch'
  );
  v_expected_signature := encode(extensions.hmac(
    convert_to(v_canonical,'utf8'),convert_to(v_secret,'utf8'),'sha256'
  ),'hex');
  if p_signature !~ '^[0-9a-f]{64}$'
     or extensions.digest(convert_to(p_signature,'utf8'),'sha256')
        <> extensions.digest(convert_to(v_expected_signature,'utf8'),'sha256') then
    raise exception 'phase14_worker_attestation_signature_invalid';
  end if;
  begin
    insert into phase14_private.worker_attestation_nonces(
      nonce,capability_id,action,lease_generation,request_payload_hash,issued_at,expires_at
    ) values (v_nonce,v_cap.id,v_action,v_lease_generation,v_request_hash,v_issued,v_expires);
  exception when unique_violation then
    raise exception 'phase14_worker_attestation_replay';
  end;
  return to_jsonb(v_cap)-'issue_secret_hash'-'lease_secret_hash';
end;
$$;

-- Workflow-start outbox internals.  The platform's start() API exposes no
-- start-idempotency option, so a lost response is deliberately uncertain and
-- cannot cause an automatic second start.
create or replace function phase14_private.claim_workflow_start(
  p_capability_id uuid,p_fulfilment_id uuid,p_execution_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype; v_out public.phase14_workflow_start_outbox%rowtype;
begin
  select * into strict v_cap from public.phase14_worker_capabilities where id=p_capability_id for update;
  if v_cap.fulfilment_id is distinct from p_fulfilment_id then raise exception 'phase14_workflow_start_binding_invalid'; end if;
  insert into public.phase14_workflow_start_outbox(
    fulfilment_id,capability_id,operation_key,external_idempotency_key,
    lease_owner,lease_generation,lease_expires_at,status,authority_epoch
  ) values (
    p_fulfilment_id,p_capability_id,v_cap.operation_key,
    'phase14-workflow-start:'||v_cap.operation_key,p_execution_id,v_cap.lease_generation,
    least(v_cap.expires_at,clock_timestamp()+interval '5 minutes'),'leased',v_cap.authority_epoch
  ) on conflict (capability_id) do nothing;
  select * into strict v_out from public.phase14_workflow_start_outbox
  where capability_id=p_capability_id for update;
  if v_out.status='started' then
    return jsonb_build_object('claimed',false,'status','started','run_id',v_out.run_id,
      'outbox_id',v_out.id,'external_idempotency_key',v_out.external_idempotency_key);
  end if;
  if v_out.status in ('acceptance_uncertain','reconciliation_required') then
    return jsonb_build_object('claimed',false,'status',v_out.status,'run_id',v_out.run_id,
      'outbox_id',v_out.id,'reconciliation_required',true);
  end if;
  if v_out.status='leased' and v_out.lease_expires_at>clock_timestamp()
     and v_out.lease_owner is distinct from p_execution_id then
    raise exception 'phase14_workflow_start_already_leased';
  end if;
  update public.phase14_workflow_start_outbox
  set status='leased',lease_owner=p_execution_id,lease_generation=v_cap.lease_generation,
      lease_expires_at=least(v_cap.expires_at,clock_timestamp()+interval '5 minutes'),
      attempt_number=attempt_number+case when lease_expires_at<=clock_timestamp() then 1 else 0 end,
      updated_at=clock_timestamp()
  where id=v_out.id returning * into v_out;
  return jsonb_build_object('claimed',true,'status',v_out.status,'outbox_id',v_out.id,
    'external_idempotency_key',v_out.external_idempotency_key,'attempt_number',v_out.attempt_number);
end;
$$;

create or replace function phase14_private.mark_workflow_start_uncertain(
  p_capability_id uuid,p_outbox_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_out public.phase14_workflow_start_outbox%rowtype;
begin
  update public.phase14_workflow_start_outbox
  set status='acceptance_uncertain',reconciliation_status='required',updated_at=clock_timestamp()
  where id=p_outbox_id and capability_id=p_capability_id and status='leased'
  returning * into v_out;
  if not found then raise exception 'phase14_workflow_start_dispatch_boundary_invalid'; end if;
  return jsonb_build_object('outbox_id',v_out.id,'status',v_out.status);
end;
$$;

create or replace function phase14_private.settle_workflow_start(
  p_capability_id uuid,p_outbox_id uuid,p_run_id text,p_error text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_out public.phase14_workflow_start_outbox%rowtype;
begin
  select * into strict v_out from public.phase14_workflow_start_outbox
  where id=p_outbox_id and capability_id=p_capability_id for update;
  if coalesce(trim(p_run_id),'')<>'' then
    update public.phase14_workflow_start_outbox
    set status='started',run_id=p_run_id,accepted_at=clock_timestamp(),last_error=null,
        reconciliation_status='resolved',lease_expires_at=null,updated_at=clock_timestamp()
    where id=v_out.id and status in ('acceptance_uncertain','reconciliation_required')
    returning * into v_out;
    update public.report_fulfilments
    set workflow_start_status='started',workflow_run_id=p_run_id,
        workflow_started_at=coalesce(workflow_started_at,clock_timestamp()),
        workflow_start_error=null,updated_at=clock_timestamp()
    where id=v_out.fulfilment_id;
  else
    update public.phase14_workflow_start_outbox
    set status='reconciliation_required',last_error=left(coalesce(p_error,'workflow start response unavailable'),2000),
        reconciliation_status='required',lease_expires_at=null,updated_at=clock_timestamp()
    where id=v_out.id and status='acceptance_uncertain' returning * into v_out;
    update public.report_fulfilments
    set workflow_start_status='starting',
        workflow_start_error='External workflow acceptance is uncertain; reconciliation is required.',
        updated_at=clock_timestamp()
    where id=v_out.fulfilment_id;
  end if;
  return jsonb_build_object('outbox_id',v_out.id,'status',v_out.status,'run_id',v_out.run_id,
    'reconciliation_required',v_out.status='reconciliation_required');
end;
$$;

-- Strict provider result classifier used by cleanup settlement.
create or replace function public.phase14_storage_result_is_verified_absence(p_class text)
returns boolean language sql immutable set search_path=''
as $$ select p_class='object_not_found'; $$;

create or replace function phase14_private.settle_storage_cleanup(
  p_capability_id uuid,p_cleanup_id uuid,p_work_lease_token uuid,
  p_expected_bucket text,p_expected_path text,p_expected_checksum text,
  p_deletion_requested boolean,p_delete_api_accepted boolean,
  p_provider_result_class text,p_error text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_absent boolean;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue
  where id=p_cleanup_id for update;
  if not found or v_queue.status<>'leased' or v_queue.lease_owner_capability_id<>p_capability_id
     or v_queue.lease_token<>p_work_lease_token or v_queue.lease_expires_at<=clock_timestamp() then
    raise exception 'cleanup_job_lease_invalid';
  end if;
  if v_queue.storage_bucket<>p_expected_bucket or v_queue.storage_path<>p_expected_path
     or v_queue.expected_checksum<>p_expected_checksum then raise exception 'cleanup_job_object_binding_invalid'; end if;
  if p_provider_result_class not in (
    'object_present','object_not_found','authentication_failure','authorization_failure','rate_limited',
    'timeout','network_failure','provider_outage','malformed_response','checksum_read_failure',
    'unknown_provider_error','delete_accepted'
  ) then raise exception 'cleanup_provider_result_class_invalid'; end if;
  v_absent := public.phase14_storage_result_is_verified_absence(p_provider_result_class);
  if v_absent and not p_deletion_requested and p_delete_api_accepted then
    raise exception 'cleanup_deletion_evidence_inconsistent';
  end if;
  update public.phase14_storage_cleanup_queue set
    status=case when v_absent then 'deleted'
      when attempt_count+1>=5 then 'dead_letter' else 'failed' end,
    attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
    deletion_requested_at=case when p_deletion_requested then clock_timestamp() else deletion_requested_at end,
    delete_api_accepted_at=case when p_delete_api_accepted then clock_timestamp() else delete_api_accepted_at end,
    absence_verified_at=case when v_absent then clock_timestamp() else null end,
    deletion_verified_at=case when v_absent then clock_timestamp() else null end,
    deleted_at=case when v_absent then clock_timestamp() else null end,
    provider_result_class=p_provider_result_class,
    verification_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    last_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    dead_lettered_at=case when not v_absent and attempt_count+1>=5 then clock_timestamp() else null end,
    next_attempt_at=case when v_absent then next_attempt_at else clock_timestamp()+interval '15 minutes' end,
    lease_owner_capability_id=null,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
  where id=v_queue.id returning * into v_queue;
  return jsonb_build_object('cleanup_id',v_queue.id,'status',v_queue.status,
    'absence_verified',v_absent,'provider_result_class',p_provider_result_class);
end;
$$;

create or replace function phase14_private.settle_owned_storage_cleanup(
  p_capability_id uuid,p_cleanup_id uuid,p_deletion_requested boolean,
  p_delete_api_accepted boolean,p_provider_result_class text,p_error text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_absent boolean;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue
  where id=p_cleanup_id for update;
  if not found or v_queue.owner_capability_id is distinct from p_capability_id
     or v_queue.status not in ('pending','failed') then
    raise exception 'cleanup_job_owner_invalid';
  end if;
  if p_provider_result_class not in (
    'object_present','object_not_found','authentication_failure','authorization_failure','rate_limited',
    'timeout','network_failure','provider_outage','malformed_response','checksum_read_failure',
    'unknown_provider_error','delete_accepted'
  ) then raise exception 'cleanup_provider_result_class_invalid'; end if;
  v_absent:=public.phase14_storage_result_is_verified_absence(p_provider_result_class);
  update public.phase14_storage_cleanup_queue set
    status=case when v_absent then 'deleted' when attempt_count+1>=5 then 'dead_letter' else 'failed' end,
    attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
    deletion_requested_at=case when p_deletion_requested then clock_timestamp() else deletion_requested_at end,
    delete_api_accepted_at=case when p_delete_api_accepted then clock_timestamp() else delete_api_accepted_at end,
    absence_verified_at=case when v_absent then clock_timestamp() else null end,
    deletion_verified_at=case when v_absent then clock_timestamp() else null end,
    deleted_at=case when v_absent then clock_timestamp() else null end,
    provider_result_class=p_provider_result_class,
    verification_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    last_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    dead_lettered_at=case when not v_absent and attempt_count+1>=5 then clock_timestamp() else null end,
    next_attempt_at=case when v_absent then next_attempt_at else clock_timestamp()+interval '15 minutes' end,
    updated_at=clock_timestamp()
  where id=v_queue.id returning * into v_queue;
  return jsonb_build_object('cleanup_id',v_queue.id,'status',v_queue.status,
    'absence_verified',v_absent,'provider_result_class',p_provider_result_class);
end;
$$;

-- Bounce remediation consumes independent, immutable contact verification.
create or replace function public.authorize_bounced_report_redelivery(
  p_prior_email_event_id uuid,
  p_verification_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor jsonb; v_event public.email_events%rowtype; v_order public.orders%rowtype;
  v_ver public.customer_contact_verifications%rowtype; v_id uuid;
begin
  v_actor := public.phase14_require_security(
    'email_resend',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if coalesce(trim(p_reason),'')='' then raise exception 'bounce_remediation_reason_required'; end if;
  select * into v_event from public.email_events where id=p_prior_email_event_id for update;
  if not found or v_event.status<>'bounced' or v_event.order_id is null or v_event.report_id is null then
    raise exception 'bounce_remediation_event_ineligible';
  end if;
  -- Complaints are permanently non-retriable even if a later bounce exists.
  if exists(select 1 from public.email_events e where e.report_id=v_event.report_id and e.status='complained') then
    raise exception 'bounce_remediation_complaint_permanent';
  end if;
  select * into v_ver from public.customer_contact_verifications
  where id=p_verification_id for update;
  if not found or v_ver.status<>'verified' or v_ver.expires_at<=clock_timestamp()
     or v_ver.verified_at>clock_timestamp()+interval '5 seconds' then
    raise exception 'bounce_remediation_verification_invalid';
  end if;
  select * into v_order from public.orders where id=v_event.order_id for update;
  if not found or v_ver.order_id<>v_order.id or v_ver.assessment_id<>v_order.assessment_id
     or lower(v_ver.previous_email::text)<>lower(v_event.recipient_email::text)
     or lower(v_order.customer_email::text)<>lower(v_ver.previous_email::text)
     or lower(v_ver.corrected_email::text)=lower(v_ver.previous_email::text)
     or v_ver.customer_identity<>coalesce(v_order.customer_name,v_order.customer_email::text) then
    raise exception 'bounce_remediation_verification_binding_invalid';
  end if;
  insert into public.report_delivery_remediations(
    prior_email_event_id,report_id,recipient_email,remediation_type,previous_recipient_email,
    corrected_recipient_email,reason,evidence_json,authorised_by,authorised_session_id,
    customer_update_applied_at
  ) values (
    v_event.id,v_event.report_id,v_ver.corrected_email,'bounce_retry',v_ver.previous_email,
    v_ver.corrected_email,p_reason,
    jsonb_build_object('contact_verification_id',v_ver.id,'verification_method',v_ver.verification_method,
      'evidence_reference',v_ver.evidence_reference,'verified_at',v_ver.verified_at),
    (v_actor->>'user_id')::uuid,(v_actor->>'session_id')::uuid,clock_timestamp()
  ) returning id into v_id;
  update public.customer_contact_verifications
  set status='consumed',consumed_at=clock_timestamp(),consumed_by_remediation_id=v_id
  where id=v_ver.id and status='verified';
  if not found then raise exception 'bounce_remediation_verification_consumption_failed'; end if;
  update public.orders set customer_email=v_ver.corrected_email,updated_at=clock_timestamp()
  where id=v_order.id and customer_email=v_ver.previous_email;
  if not found then raise exception 'bounce_remediation_order_recipient_cas_failed'; end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_order.assessment_id,'report_delivery_remediations',v_id,
    'premium_report_bounce_remediation_authorized',
    jsonb_build_object('contact_verification_id',v_ver.id,'prior_email_event_id',v_event.id,
      'previous_recipient',v_ver.previous_email,'corrected_recipient',v_ver.corrected_email));
  insert into public.assessment_events(
    assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
  ) values (
    v_order.assessment_id,v_order.id,v_event.report_id,'report_emailed_to_customer',
    'phase14-bounce-remediation:'||v_id,
    jsonb_build_object('remediation_id',v_id,'contact_verification_id',v_ver.id,
      'authorization_only',true)
  );
  return v_id;
end;
$$;

create or replace function public.resolve_premium_report_delivery_reconciliation(
  p_authorization_id uuid,
  p_resolution text,
  p_attestation_id uuid,
  p_operator_override boolean default false,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_actor jsonb; v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype; v_att public.phase14_provider_attestations%rowtype;
  v_gate public.phase14_security_gates%rowtype; v_result jsonb;
begin
  v_actor:=public.phase14_require_security(
    'provider_reconciliation',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_resolution not in ('accepted','not_accepted') then raise exception 'delivery_reconciliation_resolution_invalid'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'delivery_reconciliation_reason_required'; end if;
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for update;
  if not found or v_auth.status<>'reconciliation_required' then raise exception 'delivery_reconciliation_state_invalid'; end if;
  select * into strict v_event from public.email_events where id=v_auth.email_event_id for update;
  select * into v_att from public.phase14_provider_attestations
  where id=p_attestation_id for update;
  if not found or v_att.attestation_source<>'provider_lookup'
     or v_att.provider<>v_auth.provider
     or v_att.authorization_id is distinct from v_auth.id
     or v_att.email_event_id is distinct from v_auth.email_event_id
     or v_att.provider_request_key is distinct from v_event.provider_request_key
     or v_att.recorded_at<v_auth.dispatch_started_at
     or v_att.recorded_at>clock_timestamp()+interval '5 seconds'
     or v_att.recorded_at<clock_timestamp()-interval '10 minutes'
     or v_att.authority_epoch<>v_gate.authority_epoch
     or v_att.authorization_status is distinct from v_auth.status
     or v_att.authorization_updated_at is distinct from v_auth.updated_at then
    raise exception 'delivery_reconciliation_attestation_binding_or_age_invalid';
  end if;
  if exists(select 1 from public.phase14_provider_attestation_consumptions where attestation_id=v_att.id) then
    raise exception 'delivery_reconciliation_attestation_already_consumed';
  end if;
  if p_resolution='accepted' then
    if v_att.provider_state<>'accepted' or coalesce(trim(v_att.provider_message_id),'')='' then
      raise exception 'delivery_reconciliation_acceptance_not_attested';
    end if;
  else
    if not p_operator_override then raise exception 'delivery_reconciliation_operator_override_required'; end if;
    if v_att.provider_state<>'not_found' then raise exception 'delivery_reconciliation_non_acceptance_not_attested'; end if;
  end if;
  insert into public.phase14_provider_attestation_consumptions(
    attestation_id,authorization_id,consumed_by,consumed_session_id
  ) values (v_att.id,v_auth.id,(v_actor->>'user_id')::uuid,(v_actor->>'session_id')::uuid);
  if p_resolution='accepted' then
    v_result:=public.finalize_premium_report_delivery(v_auth.id,v_auth.email_event_id,v_att.provider_message_id);
  else
    update public.report_delivery_authorizations
    set status='revoked',revoked_reason=p_reason,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where id=v_auth.id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_authorization_cas_failed'; end if;
    update public.email_events set
      status='failed_before_provider',error_message=p_reason,reconciliation_attempted_at=clock_timestamp(),
      reconciliation_result_json=jsonb_build_object('attestation_id',v_att.id,'provider_state',v_att.provider_state),
      delivery_updated_at=clock_timestamp()
    where id=v_auth.email_event_id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_email_cas_failed'; end if;
    v_result:=jsonb_build_object('resolved',true,'resolution','not_accepted','authorization_id',v_auth.id);
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_auth.assessment_id,'report_delivery_authorizations',v_auth.id,
    'premium_report_delivery_reconciliation_resolved',
    jsonb_build_object('resolution',p_resolution,'attestation_id',v_att.id,
      'provider_message_id',v_att.provider_message_id,'operator_override',p_operator_override,
      'authority_epoch',v_gate.authority_epoch,'reason',p_reason));
  return v_result;
end;
$$;

create or replace function phase14_private.fault_if_requested(p_fault_after text,p_point text)
returns void language plpgsql immutable set search_path=''
as $$
begin
  if p_fault_after=p_point then raise exception 'phase14_terminal_fault:%',p_point; end if;
end;
$$;

-- One attested terminal publication transaction.  Storage copy is intentionally
-- outside this transaction; the bound final-object cleanup row exists before
-- copy and is changed to retained only when every database effect commits.
create or replace function public.terminal_phase14_generation_publication(
  p_attestation jsonb,
  p_signature text,
  p_request_payload text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_payload jsonb:=p_request_payload::jsonb;
  v_capability_id uuid:=(v_payload->>'capability_id')::uuid;
  v_claim_token uuid:=(v_payload->>'claim_token')::uuid;
  v_fulfilment_id uuid:=(v_payload->>'fulfilment_id')::uuid;
  v_generation_run_id uuid:=(v_payload->>'generation_run_id')::uuid;
  v_report_id uuid:=(v_payload->>'report_id')::uuid;
  v_cleanup_id uuid:=(v_payload->>'final_cleanup_id')::uuid;
  v_fault_after text:=nullif(v_payload->>'fault_after','');
  v_cap public.phase14_worker_capabilities%rowtype;
  v_claim public.report_generation_claims%rowtype;
  v_report public.reports%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
  v_cleanup public.phase14_storage_cleanup_queue%rowtype;
  v_object record; v_order_reference text; v_event_type text; v_metadata jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  perform phase14_private.verify_worker_attestation(
    p_attestation,p_signature,p_request_payload,'terminal_phase14_generation_publication'
  );
  perform phase14_private.fault_if_requested(v_fault_after,'after_attestation');
  perform set_config('phase14.worker_capability_id',v_capability_id::text,true);
  perform phase14_private.fault_if_requested(v_fault_after,'after_capability_context');
  select * into strict v_cap from public.phase14_worker_capabilities
  where id=v_capability_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_capability_lock');
  if v_cap.capability_type not in ('automatic_generation','generation_recovery')
     or v_cap.expected_step<>'terminal_publication'
     or v_cap.fulfilment_id is distinct from v_fulfilment_id then
    raise exception 'phase14_terminal_capability_binding_invalid';
  end if;
  perform set_config('phase14.worker_capability_type',v_cap.capability_type,true);
  perform set_config('phase14.authoritative_transition','worker_attested_rpc',true);
  select * into strict v_claim from public.report_generation_claims
  where claim_token=v_claim_token for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_claim_lock');
  if v_claim.state<>'committed' or v_claim.report_id is distinct from v_report_id
     or v_claim.fulfilment_id is distinct from v_fulfilment_id
     or v_claim.lease_expires_at<=clock_timestamp() then
    raise exception 'phase14_terminal_generation_claim_invalid';
  end if;
  select * into strict v_report from public.reports where id=v_report_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_lock');
  if v_report.status<>'draft' or v_report.order_id<>v_claim.order_id
     or v_report.assessment_id<>v_claim.assessment_id
     or v_report.score_run_id<>v_claim.score_run_id
     or v_report.version_number<>v_claim.version_number
     or v_report.checksum<>v_claim.expected_checksum
     or v_report.storage_bucket<>v_claim.temporary_storage_bucket
     or v_report.storage_path<>v_claim.temporary_storage_path then
    raise exception 'phase14_terminal_report_claim_binding_invalid';
  end if;
  select * into strict v_fulfilment from public.report_fulfilments
  where id=v_fulfilment_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_fulfilment_lock');
  if v_fulfilment.order_id<>v_claim.order_id
     or v_fulfilment.assessment_id<>v_claim.assessment_id
     or v_fulfilment.score_run_id<>v_claim.score_run_id
     or v_fulfilment.status not in ('storing','rendering','generating','validating','assembling') then
    raise exception 'phase14_terminal_fulfilment_binding_invalid';
  end if;
  select * into strict v_cleanup from public.phase14_storage_cleanup_queue
  where id=v_cleanup_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_cleanup_lock');
  if v_cleanup.storage_bucket<>v_claim.final_storage_bucket
     or v_cleanup.storage_path<>v_claim.final_storage_path
     or v_cleanup.expected_checksum<>v_claim.expected_checksum
     or v_cleanup.report_id is distinct from v_report.id
     or v_cleanup.owner_capability_id is distinct from v_cap.id
     or v_cleanup.status not in ('pending','failed') then
    raise exception 'phase14_terminal_orphan_cleanup_binding_invalid';
  end if;
  select order_reference into strict v_order_reference from public.orders
  where id=v_claim.order_id;
  perform phase14_private.fault_if_requested(v_fault_after,'after_order_read');
  perform public.phase14_generation_entitlement(
    v_order_reference,v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.score_input_hash
  );
  perform phase14_private.fault_if_requested(v_fault_after,'after_entitlement');
  select so.bucket_id,so.name,so.metadata into strict v_object
  from storage.objects so
  where so.bucket_id=v_claim.final_storage_bucket and so.name=v_claim.final_storage_path;
  perform phase14_private.fault_if_requested(v_fault_after,'after_storage_binding');
  if coalesce(v_object.metadata->>'mimetype','')<>'application/pdf'
     or coalesce(v_object.metadata->>'sha256',v_object.metadata->'metadata'->>'sha256','')
        <>v_claim.expected_checksum then
    raise exception 'phase14_terminal_storage_checksum_invalid';
  end if;
  if v_report.supersedes_report_id is not null then
    update public.reports set status='superseded',updated_at=clock_timestamp()
    where id=v_report.supersedes_report_id and status not in ('voided','superseded');
  end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_previous_report_supersession');
  update public.reports set
    status='generated',storage_bucket=v_claim.final_storage_bucket,
    storage_path=v_claim.final_storage_path,generation_run_id=v_generation_run_id,
    updated_at=clock_timestamp()
  where id=v_report.id and status='draft';
  if not found then raise exception 'phase14_terminal_report_cas_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_publication');
  update public.report_generation_runs set report_id=v_report.id,status='used'
  where id=v_generation_run_id and fulfilment_id=v_fulfilment.id
    and (report_id is null or report_id=v_report.id);
  if not found then raise exception 'phase14_terminal_generation_run_link_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_generation_run_link');
  update public.report_generation_claims
  set state='settled',last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
  where claim_token=v_claim.claim_token and state='committed';
  if not found then raise exception 'phase14_terminal_claim_settlement_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_claim_settlement');
  update public.report_fulfilments set
    status='ready_for_delivery',current_step='ready_for_email_delivery',
    generation_mode=v_payload->>'generation_mode',report_id=v_report.id,
    last_error_code=null,last_error_message=null,updated_at=clock_timestamp()
  where id=v_fulfilment.id and status=v_fulfilment.status;
  if not found then raise exception 'phase14_terminal_fulfilment_cas_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_fulfilment_transition');
  v_event_type:=case when v_report.supersedes_report_id is null then 'generated' else 'regenerated' end;
  v_metadata:=coalesce(v_payload->'metadata','{}'::jsonb)||jsonb_build_object(
    'worker_capability_id',v_cap.id,'authority_epoch',v_cap.authority_epoch,
    'generation_run_id',v_generation_run_id,'fulfilment_id',v_fulfilment.id
  );
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,v_event_type,null,'Atomic terminal generation publication.',v_metadata);
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_event');
  insert into public.audit_logs(actor_type,assessment_id,entity_table,entity_id,action,after_json)
  values ('system',v_report.assessment_id,'reports',v_report.id,
    case when v_event_type='generated' then 'premium_report_generated' else 'premium_report_regenerated' end,
    v_metadata||jsonb_build_object('report_reference',v_report.report_reference));
  perform phase14_private.fault_if_requested(v_fault_after,'after_audit_event');
  insert into public.assessment_events(
    assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
  ) values (
    v_report.assessment_id,v_report.order_id,v_report.id,'report_generated',
    'phase14-terminal-generation:'||v_claim.claim_token,v_metadata
  );
  perform phase14_private.fault_if_requested(v_fault_after,'after_assessment_event');
  update public.phase14_storage_cleanup_queue set
    status='retained',last_error=null,verification_error=null,
    lease_owner_capability_id=null,lease_token=null,lease_expires_at=null,
    updated_at=clock_timestamp()
  where id=v_cleanup.id and status in ('pending','failed');
  if not found then raise exception 'phase14_terminal_cleanup_transition_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_cleanup_transition');
  update public.phase14_worker_capabilities set
    status='consumed',consumed_at=clock_timestamp(),lease_owner=null,
    lease_secret_hash=null,lease_expires_at=null,last_heartbeat_at=clock_timestamp(),
    lease_generation=lease_generation+1,expected_step='consumed',updated_at=clock_timestamp()
  where id=v_cap.id and status='leased' and lease_generation=v_cap.lease_generation;
  if not found then raise exception 'phase14_terminal_capability_consumption_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_capability_consumption');
  return jsonb_build_object('completed',true,'report_id',v_report.id,
    'fulfilment_id',v_fulfilment.id,'generation_run_id',v_generation_run_id,
    'final_storage_bucket',v_claim.final_storage_bucket,
    'final_storage_path',v_claim.final_storage_path,'checksum',v_claim.expected_checksum,
    'version_number',v_report.version_number,'superseded_report_id',v_report.supersedes_report_id,
    'lease_generation',v_cap.lease_generation+1,'expected_step','consumed');
end;
$$;

-- All non-terminal worker transitions enter through this single attested
-- dispatcher.  Legacy worker facades remain callable only by their owner and
-- are never granted to a runtime role.
create or replace function public.execute_phase14_worker_step(
  p_attestation jsonb,
  p_signature text,
  p_request_payload text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_payload jsonb:=p_request_payload::jsonb; v_action text:=p_attestation->>'action';
  v_capability_id uuid:=(p_attestation->>'capability_id')::uuid;
  v_cap public.phase14_worker_capabilities%rowtype; v_result jsonb; v_next text;
  v_terminal boolean:=false;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  perform phase14_private.verify_worker_attestation(p_attestation,p_signature,p_request_payload,v_action);
  select * into strict v_cap from public.phase14_worker_capabilities where id=v_capability_id for update;
  perform set_config('phase14.worker_capability_id',v_cap.id::text,true);
  perform set_config('phase14.worker_capability_type',v_cap.capability_type,true);
  perform set_config('phase14.authoritative_transition','worker_attested_rpc',true);

  case v_action
    when 'claim_phase14_worker_operation' then
      if v_cap.status='leased' and v_cap.lease_expires_at>clock_timestamp()
         and v_cap.workflow_execution_id is distinct from p_attestation->>'execution_id' then
        raise exception 'phase14_worker_capability_already_leased';
      end if;
      v_next:=case v_cap.capability_type
        when 'automatic_generation' then 'workflow_start_claim'
        when 'generation_recovery' then 'generation_claim'
        when 'automatic_delivery' then 'delivery_authorize'
        when 'delivery_reconciliation' then 'delivery_reconcile'
        when 'storage_cleanup' then 'cleanup_expire' end;
      update public.phase14_worker_capabilities set
        status='leased',workflow_execution_id=p_attestation->>'execution_id',
        lease_owner=p_attestation->>'execution_id',lease_expires_at=least(expires_at,clock_timestamp()+interval '60 minutes'),
        lease_generation=lease_generation+1,expected_step=v_next,
        takeover_count=takeover_count+case when status='leased' and lease_expires_at<=clock_timestamp() then 1 else 0 end,
        claimed_at=coalesce(claimed_at,clock_timestamp()),last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=v_cap.id returning * into v_cap;
      v_result:=jsonb_build_object('capability_id',v_cap.id,'capability_type',v_cap.capability_type,
        'operation_key',v_cap.operation_key,'execution_id',v_cap.workflow_execution_id,
        'lease_expires_at',v_cap.lease_expires_at,'authority_epoch',v_cap.authority_epoch);
    when 'claim_premium_report_workflow_start' then
      if v_cap.expected_step<>'workflow_start_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.claim_workflow_start(v_cap.id,(v_payload->>'fulfilment_id')::uuid,v_cap.workflow_execution_id);
      v_next:='workflow_start_dispatch';
    when 'mark_phase14_workflow_start_dispatching' then
      if v_cap.expected_step<>'workflow_start_dispatch' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.mark_workflow_start_uncertain(v_cap.id,(v_payload->>'outbox_id')::uuid);
      v_next:='workflow_start_settle';
    when 'record_premium_report_workflow_start' then
      if v_cap.expected_step<>'workflow_start_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.settle_workflow_start(v_cap.id,(v_payload->>'outbox_id')::uuid,
        nullif(v_payload->>'run_id',''),nullif(v_payload->>'error',''));
      v_next:=case when coalesce(v_result->>'status','')='started' then 'generation_claim' else 'workflow_start_reconcile' end;
    when 'worker_claim_premium_report_generation' then
      if v_cap.expected_step<>'generation_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_claim_premium_report_generation(v_cap.id,
        v_payload->>'order_reference',v_payload->>'claim_owner',(v_payload->>'fulfilment_id')::uuid,
        (v_payload->>'report_type')::public.report_type);
      v_next:='fulfilment_assembling';
    when 'worker_recover_premium_report_generation_claim' then
      if v_cap.expected_step<>'generation_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_recover_premium_report_generation_claim(v_cap.id,
        v_payload->>'order_reference',v_payload->>'claim_owner',(v_payload->>'fulfilment_id')::uuid);
      v_next:='cleanup_register_recovery_temp';
    when 'transition_premium_report_fulfilment' then
      if (v_cap.expected_step='fulfilment_assembling' and v_payload->>'status'='assembling') then
        v_next:='narrative_decision';
      elsif (v_cap.expected_step='narrative_decision' and v_payload->>'status' in ('generating','validating')) then
        v_next:=case when v_payload->>'status'='generating' then 'ai_checkpoint' else 'generation_lease_renew' end;
      elsif (v_cap.expected_step='fulfilment_rendering' and v_payload->>'status'='rendering') then
        v_next:='cleanup_register_temp';
      elsif (v_cap.expected_step='fulfilment_storing' and v_payload->>'status'='storing') then
        v_next:='draft_commit';
      else raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.transition_premium_report_fulfilment(v_cap.id,
        (v_payload->>'fulfilment_id')::uuid,v_payload->>'status',v_payload->>'current_step',
        nullif(v_payload->>'generation_mode',''),nullif(v_payload->>'report_id','')::uuid,
        coalesce((v_payload->>'increment_attempt')::boolean,false),nullif(v_payload->>'error_code',''),
        nullif(v_payload->>'error_message',''));
    when 'authorize_phase14_worker_action' then
      if v_cap.expected_step not in ('ai_checkpoint','ai_or_renew')
         or v_payload->>'action'<>'ai_narrative_generation' then
        raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.authorize_phase14_worker_action(v_cap.id,'ai_narrative_generation');
      v_next:='ai_attempt_claim';
    when 'claim_phase14_ai_attempt' then
      if v_cap.expected_step not in ('ai_attempt_claim','ai_or_renew') then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.claim_phase14_ai_attempt(v_cap.id,coalesce(v_payload->'attempt','{}'::jsonb));
      v_next:='ai_attempt_settle';
    when 'settle_phase14_ai_attempt' then
      if v_cap.expected_step<>'ai_attempt_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.settle_phase14_ai_attempt(v_cap.id,(v_payload->>'attempt_id')::uuid,
        coalesce(v_payload->'result','{}'::jsonb));
      v_next:='ai_or_renew';
    when 'worker_renew_premium_report_generation_lease' then
      if v_cap.expected_step not in ('generation_lease_renew','ai_or_renew') then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_renew_premium_report_generation_lease(v_cap.id,
        (v_payload->>'claim_token')::uuid));
      v_next:='generation_run_record';
    when 'record_premium_report_generation_run' then
      if v_cap.expected_step<>'generation_run_record' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.record_premium_report_generation_run(v_cap.id,
        (v_payload->>'fulfilment_id')::uuid,coalesce(v_payload->'run','{}'::jsonb)));
      v_next:='fulfilment_rendering';
    when 'worker_register_phase14_storage_cleanup' then
      if v_cap.expected_step='cleanup_register_temp' then v_next:='fulfilment_storing';
      elsif v_cap.expected_step='cleanup_register_recovery_temp' then v_next:='cleanup_link_temp';
      elsif v_cap.expected_step='cleanup_register_final' then v_next:='cleanup_temp_settle';
      else raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_register_phase14_storage_cleanup(v_cap.id,
        v_payload->>'storage_bucket',v_payload->>'storage_path',v_payload->>'expected_checksum',
        nullif(v_payload->>'claim_token','')::uuid,v_payload->>'reason'));
      if v_cap.expected_step='cleanup_register_final' then
        update public.phase14_storage_cleanup_queue set report_id=(v_payload->>'report_id')::uuid,
          updated_at=clock_timestamp()
        where id=(v_result#>>'{}')::uuid and owner_capability_id=v_cap.id and report_id is null;
        if not found then raise exception 'phase14_final_cleanup_report_binding_failed'; end if;
      end if;
    when 'worker_commit_premium_report_draft' then
      if v_cap.expected_step<>'draft_commit' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_commit_premium_report_draft(v_cap.id,
        (v_payload->>'claim_token')::uuid,(v_payload->>'template_id')::uuid,
        v_payload->>'storage_bucket',v_payload->>'temp_storage_path',v_payload->>'checksum',
        (v_payload->>'generation_run_id')::uuid));
      v_next:='cleanup_link_temp';
    when 'worker_link_phase14_storage_cleanup_report' then
      if v_cap.expected_step<>'cleanup_link_temp' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_link_phase14_storage_cleanup_report(v_cap.id,
        (v_payload->>'cleanup_id')::uuid,(v_payload->>'report_id')::uuid));
      v_next:='cleanup_register_final';
    when 'worker_record_phase14_storage_cleanup_result' then
      if v_cap.expected_step<>'cleanup_temp_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.settle_owned_storage_cleanup(v_cap.id,
        (v_payload->>'cleanup_id')::uuid,(v_payload->>'deletion_requested')::boolean,
        (v_payload->>'delete_api_accepted')::boolean,v_payload->>'provider_result_class',
        nullif(v_payload->>'error',''));
      v_next:='terminal_publication';
    when 'worker_abandon_premium_report_generation_claim' then
      if v_cap.expected_step not in ('fulfilment_assembling','narrative_decision','ai_checkpoint','ai_attempt_claim',
        'ai_attempt_settle','ai_or_renew','generation_lease_renew','generation_run_record','fulfilment_rendering',
        'cleanup_register_temp','fulfilment_storing','draft_commit') then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_abandon_premium_report_generation_claim(v_cap.id,
        (v_payload->>'claim_token')::uuid,v_payload->>'reason'));
      v_next:='consumed'; v_terminal:=true;
    when 'worker_authorize_premium_report_delivery' then
      if v_cap.expected_step<>'delivery_authorize' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_authorize_premium_report_delivery(v_cap.id,(v_payload->>'report_id')::uuid,
        v_payload->>'recipient',v_payload->>'provider'); v_next:='delivery_claim';
    when 'worker_claim_premium_report_delivery' then
      if v_cap.expected_step<>'delivery_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_claim_premium_report_delivery(v_cap.id,(v_payload->>'authorization_id')::uuid);
      v_next:='delivery_dispatch_start';
    when 'worker_mark_premium_report_delivery_dispatch_started' then
      if v_cap.expected_step<>'delivery_dispatch_start' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_mark_premium_report_delivery_dispatch_started(v_cap.id,
        (v_payload->>'authorization_id')::uuid,(v_payload->>'delivery_lease_token')::uuid));
      v_next:='delivery_terminal';
    when 'worker_finalize_premium_report_delivery' then
      if v_cap.expected_step<>'delivery_terminal' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_finalize_premium_report_delivery(v_cap.id,
        (v_payload->>'authorization_id')::uuid,(v_payload->>'email_event_id')::uuid,
        v_payload->>'provider_message_id'); v_next:='consumed'; v_terminal:=true;
    when 'worker_fail_premium_report_delivery_before_dispatch' then
      if v_cap.expected_step<>'delivery_dispatch_start' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_fail_premium_report_delivery_before_dispatch(v_cap.id,
        (v_payload->>'authorization_id')::uuid,(v_payload->>'delivery_lease_token')::uuid,v_payload->>'reason'));
      v_next:='consumed';v_terminal:=true;
    when 'worker_mark_premium_report_delivery_reconciliation_required' then
      if v_cap.expected_step<>'delivery_terminal' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_mark_premium_report_delivery_reconciliation_required(v_cap.id,
        (v_payload->>'authorization_id')::uuid,nullif(v_payload->>'provider_message_id',''),v_payload->>'reason'));
      v_next:='delivery_reconcile';
    when 'worker_cleanup_expired_premium_report_claims' then
      if v_cap.expected_step<>'cleanup_expire' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_cleanup_expired_premium_report_claims(v_cap.id,(v_payload->>'older_than')::interval);
      v_next:='cleanup_claim_jobs';
    when 'claim_phase14_storage_cleanup_jobs' then
      if v_cap.expected_step<>'cleanup_claim_jobs' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.claim_phase14_storage_cleanup_jobs(v_cap.id,(v_payload->>'limit')::integer);
      v_next:='cleanup_settle';
    when 'complete_phase14_storage_cleanup_job' then
      if v_cap.expected_step<>'cleanup_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.settle_storage_cleanup(v_cap.id,(v_payload->>'cleanup_id')::uuid,
        (v_payload->>'work_lease_token')::uuid,v_payload->>'expected_bucket',v_payload->>'expected_path',
        v_payload->>'expected_checksum',(v_payload->>'deletion_requested')::boolean,
        (v_payload->>'delete_api_accepted')::boolean,v_payload->>'provider_result_class',
        nullif(v_payload->>'error',''));
      v_next:='cleanup_settle';
    when 'renew_phase14_worker_operation' then
      if v_cap.capability_type<>'storage_cleanup' or v_cap.expected_step<>'cleanup_settle' then
        raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=jsonb_build_object('renewed',true);
      v_next:='cleanup_expire';
    else raise exception 'phase14_worker_action_unknown:%',v_action;
  end case;

  if v_action<>'claim_phase14_worker_operation' then
    update public.phase14_worker_capabilities set
      status=case when v_terminal then 'consumed' else status end,
      consumed_at=case when v_terminal then clock_timestamp() else consumed_at end,
      lease_owner=case when v_terminal then null else lease_owner end,
      lease_expires_at=case when v_terminal then null else least(expires_at,clock_timestamp()+interval '60 minutes') end,
      lease_generation=lease_generation+1,expected_step=v_next,
      last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_cap.id and status=case when v_terminal and v_action='worker_finalize_premium_report_delivery'
      then 'consumed' else 'leased' end
    returning * into v_cap;
    -- Delivery finalization's legacy internal consumes the capability itself.
    if not found and not (v_terminal and exists(select 1 from public.phase14_worker_capabilities
      where id=v_capability_id and status='consumed')) then
      raise exception 'phase14_worker_step_advance_cas_failed';
    end if;
  end if;
  return jsonb_build_object('result',v_result,'capability_id',v_capability_id,
    'lease_generation',v_cap.lease_generation,'expected_step',v_next,
    'lease_expires_at',v_cap.lease_expires_at,'authority_epoch',v_cap.authority_epoch);
end;
$$;

create or replace function public.get_phase14_worker_attestation_context(p_capability_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_cap public.phase14_worker_capabilities%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  select * into v_cap from public.phase14_worker_capabilities where id=p_capability_id for share;
  if not found or v_cap.status not in ('authorised','leased') or v_cap.expires_at<=clock_timestamp() then
    raise exception 'phase14_worker_capability_context_unavailable';
  end if;
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  if v_gate.status<>'satisfied' or v_gate.satisfied_version<>v_gate.required_version
     or v_cap.authority_epoch<>v_gate.authority_epoch then
    raise exception 'phase14_worker_capability_authority_epoch_stale';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  return jsonb_build_object(
    'capability_id',v_cap.id,'capability_type',v_cap.capability_type,
    'operation_key',v_cap.operation_key,'execution_id',coalesce(v_cap.workflow_execution_id,v_cap.operation_key),
    'expected_step',v_cap.expected_step,'lease_generation',v_cap.lease_generation,
    'lease_expires_at',v_cap.lease_expires_at,'expires_at',v_cap.expires_at,
    'authority_epoch',v_cap.authority_epoch,'order_id',v_cap.order_id,
    'assessment_id',v_cap.assessment_id,'score_run_id',v_cap.score_run_id,
    'fulfilment_id',v_cap.fulfilment_id,'report_id',v_cap.report_id,
    'recipient',v_cap.recipient_email
  );
end;
$$;

-- The caller-authored evidence overload is retained only for migration replay
-- identity and is unreachable by every runtime role.
revoke all on function public.authorize_bounced_report_redelivery(uuid,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.authorize_bounced_report_redelivery(uuid,uuid,text) to authenticated;
revoke all on function public.create_customer_contact_verification(uuid,text,text,text,integer)
  from public,anon,service_role;
grant execute on function public.create_customer_contact_verification(uuid,text,text,text,integer)
  to authenticated;

do $$
declare v record;
begin
  for v in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (
      p.proname like 'worker\_%' escape '\'
      or p.proname in (
        'claim_phase14_worker_operation','renew_phase14_worker_operation',
        'complete_phase14_worker_operation','authorize_phase14_worker_action',
        'claim_premium_report_workflow_start','record_premium_report_workflow_start',
        'claim_phase14_ai_attempt','settle_phase14_ai_attempt',
        'complete_phase14_generation_operation','publish_premium_report_generation',
        'claim_phase14_storage_cleanup_jobs','complete_phase14_storage_cleanup_job'
      )
    )
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v.signature);
  end loop;
end;
$$;

revoke all on function public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text)
  from public,anon,service_role;
grant execute on function public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text)
  to authenticated;
revoke all on function public.record_premium_report_generation_run(uuid,uuid,jsonb)
  from public,anon,service_role;
grant execute on function public.record_premium_report_generation_run(uuid,uuid,jsonb) to authenticated;
revoke all on function public.execute_phase14_worker_step(jsonb,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.terminal_phase14_generation_publication(jsonb,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.execute_phase14_worker_step(jsonb,text,text) to service_role;
grant execute on function public.terminal_phase14_generation_publication(jsonb,text,text) to service_role;
revoke all on function public.get_phase14_worker_attestation_context(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_phase14_worker_attestation_context(uuid) to service_role;
grant select,insert,update,delete on table
  public.audit_logs,public.report_events,public.assessment_events,
  public.email_events,public.email_provider_events to service_role;
revoke truncate on table
  public.audit_logs,public.report_events,public.assessment_events,
  public.email_events,public.email_provider_events from service_role;
revoke all on function public.rotate_phase14_worker_attestation_key(text,text,integer,text)
  from public,anon,service_role;
grant execute on function public.rotate_phase14_worker_attestation_key(text,text,integer,text) to authenticated;

revoke all on all functions in schema phase14_private from public,anon,authenticated,service_role;
revoke all on schema phase14_private from public,anon,authenticated,service_role;

-- END ARCHIVED SOURCE: unpublished-remediation/20260715073613_phase14_sixth_adversarial_remediation.sql

commit;

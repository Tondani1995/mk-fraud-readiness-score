-- Phase 14 adversarial remediation.
-- Transactional entitlement, generation publication, durable provider state and webhook CAS.

begin;

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
as $function$
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
$function$;

create or replace function public.claim_premium_report_generation(
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid default null,
  p_report_type public.report_type default 'essential_self_assessment'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

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
as $function$
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
$function$;

create or replace function public.publish_premium_report_generation(
  p_claim_token uuid,
  p_report_id uuid,
  p_final_storage_path text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.release_premium_report_generation_claim(p_claim_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.report_generation_claims
  where claim_token = p_claim_token and report_id is null;
  return found;
end;
$function$;

create or replace function public.assert_premium_report_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.recover_stale_premium_report_email_sends()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

commit;

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
as $function$
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
$function$;

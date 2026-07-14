-- Phase 14 security and state-machine closure.
-- This migration is intentionally inert: the database security gate starts below
-- the required version. No report generation, download, delivery, reconciliation,
-- webhook mutation, or AI-backed publication can proceed until an AAL2 platform
-- administrator records the required gate version in a separately authorised step.

begin;

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
as $webhook$
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
$webhook$;

create or replace function public.phase14_require_security(
  p_action text,
  p_allowed_roles public.admin_role[] default array['platform_admin']::public.admin_role[],
  p_require_aal2 boolean default true,
  p_allow_service_role boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.set_phase14_security_gate_version(
  p_satisfied_version integer,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.guard_phase14_feature_policy_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
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
$function$;

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
as $function$
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
$function$;

create or replace function public.authorize_phase14_action(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

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
$function$;

create or replace function public.assert_premium_report_generation_entitlement(p_order_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  return public.phase14_generation_entitlement(p_order_reference);
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
$function$;

create or replace function public.renew_premium_report_generation_lease(p_claim_token uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.recover_premium_report_generation_claim(
  p_order_reference text,
  p_claim_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create function public.publish_premium_report_generation(
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.abandon_premium_report_generation_claim(
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.cleanup_expired_premium_report_claims(p_older_than interval default interval '24 hours')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.phase14_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false,
  p_purpose text default 'email_delivery'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.assert_premium_report_delivery_entitlement(
  p_report_id uuid, p_recipient text, p_allow_test_override boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.phase14_require_security(
    'email_delivery', array['platform_admin','approver']::public.admin_role[], true, false
  );
  return public.phase14_delivery_entitlement(p_report_id, p_recipient, p_allow_test_override, 'email_delivery');
end;
$function$;

create or replace function public.assert_premium_report_download_entitlement(
  p_report_id uuid,
  p_purpose text default 'admin_download'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

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
as $function$
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
$function$;

create or replace function public.claim_premium_report_delivery(p_authorization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.mark_premium_report_delivery_dispatch_started(
  p_authorization_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.fail_premium_report_delivery_before_dispatch(
  p_authorization_id uuid,
  p_lease_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.finalize_premium_report_delivery(
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.mark_premium_report_delivery_reconciliation_required(
  p_authorization_id uuid,
  p_provider_message_id text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.recover_stale_premium_report_email_sends()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

do $grants$
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
$grants$;

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

commit;

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

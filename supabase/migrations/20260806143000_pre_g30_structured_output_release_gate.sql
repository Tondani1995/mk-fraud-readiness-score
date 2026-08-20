-- Pre-G30: preserve structured-output evidence and fail closed for AI-required paid reports.
-- This migration is additive and is intended for the Staging project only.

alter table public.report_ai_attempts
  add column if not exists structured_output_diagnostics jsonb;

alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_status_check;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_status_check check (status in (
    'started', 'succeeded', 'accounting_unverified', 'failed_before_provider',
    'provider_result_uncertain', 'reconciliation_required',
    'structured_output_invalid', 'structured_output_truncated',
    'structured_output_refused', 'structured_output_schema_failed',
    'structured_output_json_invalid'
  ));

alter table public.report_ai_attempts
  add constraint report_ai_attempts_structured_output_diagnostics_object_chk
  check (structured_output_diagnostics is null or jsonb_typeof(structured_output_diagnostics) = 'object');

comment on column public.report_ai_attempts.structured_output_diagnostics is
  'Closed-vocabulary structured-output evidence only; raw prompts and provider text are never persisted.';

create or replace function public.settle_phase14_ai_attempt(
  p_capability_id uuid,
  p_attempt_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.report_ai_attempts%rowtype;
  v_f public.report_fulfilments%rowtype;
  v_status text;
begin
  select * into v_row from public.report_ai_attempts where id = p_attempt_id for update;
  if not found or v_row.status <> 'started' then raise exception 'phase14_ai_attempt_cas_failed'; end if;
  select * into v_f from public.report_fulfilments where id = v_row.fulfilment_id for share;
  perform public.phase14_activate_worker_operation(
    p_capability_id, array['automatic_generation','generation_recovery'],
    v_f.order_id, v_f.assessment_id, v_f.score_run_id, v_f.id, null, null
  );
  v_status := p_result->>'status';
  if v_status in ('succeeded','accounting_unverified') then
    if coalesce(trim(p_result->>'resolved_provider'),'') = ''
       or coalesce(trim(p_result->>'resolved_model'),'') = '' then
      raise exception 'phase14_ai_resolved_identity_required';
    end if;
    if lower(p_result->>'resolved_provider') <> lower(v_row.requested_provider) then
      raise exception 'phase14_ai_unexpected_provider_route';
    end if;
  elsif v_status not in (
    'failed_before_provider', 'provider_result_uncertain', 'reconciliation_required',
    'structured_output_invalid', 'structured_output_truncated', 'structured_output_refused',
    'structured_output_schema_failed', 'structured_output_json_invalid'
  ) then
    raise exception 'phase14_ai_result_status_invalid';
  end if;
  update public.report_ai_attempts set
    status = v_status,
    output_json = p_result->'output_json',
    structured_output_diagnostics = p_result->'structured_output_diagnostics',
    resolved_provider = nullif(p_result->>'resolved_provider',''),
    resolved_model = nullif(p_result->>'resolved_model',''),
    provider = coalesce(nullif(p_result->>'resolved_provider',''), provider),
    model = coalesce(nullif(p_result->>'resolved_model',''), model),
    input_token_count = nullif(p_result->>'input_token_count','')::integer,
    output_token_count = nullif(p_result->>'output_token_count','')::integer,
    total_token_count = nullif(p_result->>'total_token_count','')::integer,
    estimated_cost_micros = nullif(p_result->>'estimated_cost_micros','')::bigint,
    latency_ms = nullif(p_result->>'latency_ms','')::integer,
    accounting_status = coalesce(nullif(p_result->>'accounting_status',''),'unverified'),
    error_message = nullif(p_result->>'error_message',''),
    completed_at = now(),
    updated_at = now()
  where id = p_attempt_id and status = 'started'
  returning * into v_row;
  if not found then raise exception 'phase14_ai_attempt_cas_failed'; end if;
  return to_jsonb(v_row);
end;
$$;

-- Rename the existing implementation and put a narrow AI-required gate in front of it.
alter function public.automatic_release_completed_fulfilment(uuid, uuid, text)
  rename to automatic_release_completed_fulfilment_impl;

create function public.automatic_release_completed_fulfilment(
  p_attempt_id uuid,
  p_report_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_ai_certified boolean := false;
  v_exception jsonb;
begin
  perform public.rc1_require_operation_open('quality_review');
  select * into v_attempt
  from public.manual_report_generation_attempts
  where id = p_attempt_id
  for share;
  if not found then raise exception 'fulfilment_job_not_found'; end if;
  select * into v_report from public.reports where id = p_report_id for share;
  select * into v_order from public.orders where id = v_attempt.order_id for share;
  select * into v_product from public.products where id = v_order.product_id for share;

  if v_product.product_code <> 'essential_self_assessment' then
    v_ai_certified := true;
  else
    select exists (
      select 1
      from public.report_ai_attempts a
      where a.manual_generation_attempt_id = v_attempt.id
        and a.status = 'succeeded'
        and a.accounting_status = 'verified'
        and coalesce(trim(a.requested_provider), '') <> ''
        and coalesce(trim(a.resolved_provider), '') <> ''
        and coalesce(trim(a.requested_model), '') <> ''
        and coalesce(trim(a.resolved_model), '') <> ''
        and coalesce(a.input_token_count, 0) > 0
        and coalesce(a.output_token_count, 0) > 0
        and coalesce(a.total_token_count, 0) > 0
        and a.estimated_cost_micros is not null
        and a.estimated_cost_micros >= 0
        and coalesce(a.output_json #>> '{gateway,generationId}', '') <> ''
    ) into v_ai_certified;
    v_ai_certified := v_ai_certified
      and v_attempt.generation_mode in ('ai', 'ai_repair')
      and v_attempt.narrative_fallback_reason is null
      and v_attempt.final_validation_json is not null
      and jsonb_typeof(v_attempt.final_validation_json) = 'object'
      and v_report.id is not null
      and v_report.status = 'generated';
  end if;

  if not v_ai_certified then
    perform pg_catalog.set_config('phase14.authoritative_transition', 'worker_rpc', true);
    v_exception := public.record_automatic_fulfilment_exception(
      v_attempt.id,
      null,
      'automatic_quality_release',
      'ai_certification_required',
      coalesce(v_attempt.technical_reference, v_attempt.id::text),
      'Hold the deterministic fallback for internal quality review; no paid release or delivery is permitted without AI-certified narrative evidence.'
    );
    return v_exception || pg_catalog.jsonb_build_object(
      'released', false,
      'delivery_authorization_id', null,
      'ai_certification_required', true
    );
  end if;

  return public.automatic_release_completed_fulfilment_impl(
    p_attempt_id, p_report_id, p_lease_owner
  );
end;
$$;

revoke all on function public.automatic_release_completed_fulfilment(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.automatic_release_completed_fulfilment(uuid, uuid, text)
  to service_role;

-- One exact, service-role-only containment control for the already-invalid Journey 5.
-- It preserves historical delivery rows and the PDF while revoking current access/release state.
create function public.pre_g30_contain_uncertified_premium_report(
  p_attempt_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_auth public.report_delivery_authorizations%rowtype;
  v_token_count integer := 0;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'pre_g30_containment_service_role_required';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 20 then
    raise exception 'pre_g30_containment_reason_required';
  end if;
  select * into v_attempt from public.manual_report_generation_attempts
  where id = p_attempt_id for update;
  if not found
     or v_attempt.generation_mode <> 'deterministic_fallback'
     or v_attempt.status <> 'DELIVERY_QUEUED'
     or v_attempt.automatic_delivery_authorization_id is null then
    raise exception 'pre_g30_containment_attempt_scope_invalid';
  end if;
  select * into v_report from public.reports where id = v_attempt.output_report_id for update;
  select * into v_order from public.orders where id = v_attempt.order_id for share;
  if v_order.order_reference <> 'MKORD-2026-RHFC6DYH'
     or v_report.report_reference <> 'RPT-MKFRS-2026-ACACD50A9F-V1'
     or v_attempt.technical_reference is null
     or not exists (
       select 1 from public.assessments a
       where a.id = v_order.assessment_id
         and a.assessment_reference = 'MKFRS-2026-ACACD50A9F'
     ) then
    raise exception 'pre_g30_containment_exact_journey_required';
  end if;
  select * into v_auth from public.report_delivery_authorizations
  where id = v_attempt.automatic_delivery_authorization_id for update;
  if not found or v_auth.report_id is distinct from v_report.id or v_auth.order_id is distinct from v_order.id then
    raise exception 'pre_g30_containment_delivery_binding_invalid';
  end if;

  perform pg_catalog.set_config('phase14.authoritative_transition', 'worker_rpc', true);
  update public.customer_report_access_tokens
  set revoked_at = coalesce(revoked_at, now()),
      revoked_reason = coalesce(revoked_reason, left(trim(p_reason), 500)),
      updated_at = now()
  where report_id = v_report.id and order_id = v_order.id and revoked_at is null;
  get diagnostics v_token_count = row_count;

  update public.report_delivery_authorizations
  set status = 'revoked',
      revoked_reason = left(trim(p_reason), 500),
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = v_auth.id;

  update public.reports
  set status = 'voided', updated_at = now()
  where id = v_report.id;

  update public.manual_report_generation_attempts
  set status = 'GENERATION_FAILED',
      quality_review_decision = 'rejected',
      quality_review_reason = left(trim(p_reason), 500),
      lease_owner = null,
      lease_expires_at = null,
      heartbeat_at = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = v_attempt.id;

  insert into public.audit_logs(actor_type, entity_table, entity_id, action, after_json)
  values (
    'system', 'manual_report_generation_attempts', v_attempt.id,
    'pre_g30_uncertified_premium_report_contained',
    pg_catalog.jsonb_build_object(
      'attempt_id', v_attempt.id,
      'order_id', v_order.id,
      'report_id', v_report.id,
      'delivery_authorization_id', v_auth.id,
      'revoked_access_token_count', v_token_count,
      'historical_delivery_rows_preserved', true,
      'reason', left(trim(p_reason), 500)
    )
  );
  return pg_catalog.jsonb_build_object(
    'contained', true,
    'attempt_id', v_attempt.id,
    'report_id', v_report.id,
    'delivery_authorization_id', v_auth.id,
    'revoked_access_token_count', v_token_count,
    'historical_delivery_rows_preserved', true
  );
end;
$$;

revoke all on function public.pre_g30_contain_uncertified_premium_report(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.pre_g30_contain_uncertified_premium_report(uuid, text)
  to service_role;

-- Bring manual AI attempt settlement to parity with the accepted autonomous contract.
--
-- 20260806143000 taught settle_phase14_ai_attempt() the five structured-output terminal statuses
-- and made it persist structured_output_diagnostics. settle_manual_report_ai_attempt() -- the
-- admin/manual generation path -- was not updated with it, so the two settlement contracts drifted.
--
-- The consequence was observed on Staging in the V4 controlled AI run
-- (generation attempt 9960c938-10cf-43a2-b15b-6002144e36e2, AI attempt
-- e3f69665-2002-4b75-aa37-8c4659f1a685, deployment dpl_8AjSKSo9mAd3jwQPEjvsK1uDBa1D). The provider
-- DID respond -- provider_dispatch_started, openai / openai/gpt-5.5, provider_response_received,
-- completed, 48,887 ms -- but the structured output could not be accepted. durable-ai-attempts.ts
-- correctly passed error.diagnostics.status into settleAttempt(); this function rejected it with
-- phase14_ai_result_status_invalid; the row was therefore never settled and stayed 'started'; and
-- the narrative pipeline fell back deterministically. The real diagnostic was destroyed by the
-- rejection, which is why that historical row can never be resolved after the fact.
--
-- report_ai_attempts_status_check already permits all five statuses, so nothing else has to change.
-- This migration alters exactly two things in this one function: the terminal-status allowlist, and
-- persisting structured_output_diagnostics. Name, signature, SECURITY DEFINER, empty search_path,
-- parent manual-generation binding, the REPORT_GENERATING parent requirement, CAS from 'started',
-- resolved provider/model requirements, the provider-route equality check, every token/accounting
-- field, and the existing grants/ACL are all reproduced unchanged. CREATE OR REPLACE preserves
-- owner and ACL, so no permission is broadened. settle_phase14_ai_attempt() is not touched.

begin;

create or replace function public.settle_manual_report_ai_attempt(
  p_attempt_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.report_ai_attempts%rowtype;
  v_parent public.manual_report_generation_attempts%rowtype;
  v_status text := p_result->>'status';
begin
  select * into v_row from public.report_ai_attempts where id = p_attempt_id for update;
  if not found or v_row.status <> 'started' or v_row.manual_generation_attempt_id is null then
    raise exception 'manual_report_ai_attempt_cas_failed';
  end if;
  select * into v_parent from public.manual_report_generation_attempts
    where id = v_row.manual_generation_attempt_id for share;
  if not found or v_parent.status <> 'REPORT_GENERATING' then
    raise exception 'manual_report_ai_parent_not_active';
  end if;

  if v_status in ('succeeded','accounting_unverified') then
    if coalesce(trim(p_result->>'resolved_provider'),'') = ''
       or coalesce(trim(p_result->>'resolved_model'),'') = '' then
      raise exception 'phase14_ai_resolved_identity_required';
    end if;
    if lower(p_result->>'resolved_provider') <> lower(v_row.requested_provider) then
      raise exception 'phase14_ai_unexpected_provider_route';
    end if;
  -- Parity with settle_phase14_ai_attempt(): a provider that returned output the structured-output
  -- contract could not accept is a real terminal outcome and must be recordable, not rejected.
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
    -- The diagnostic itself is the point: without it a rejected structured output leaves nothing
    -- to act on, which is exactly what happened to the V4 attempt.
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
  if not found then raise exception 'manual_report_ai_attempt_cas_failed'; end if;
  return to_jsonb(v_row);
end;
$$;

-- Apply-time and replay-time parity assertion: the two settlement functions must accept the same
-- structured-output terminal statuses and must both persist the diagnostics. This is the drift the
-- V4 run paid for, and it must not be able to reopen silently.
do $$
declare
  v_manual text := pg_catalog.pg_get_functiondef('public.settle_manual_report_ai_attempt(uuid,jsonb)'::regprocedure);
  v_auto   text := pg_catalog.pg_get_functiondef('public.settle_phase14_ai_attempt(uuid,uuid,jsonb)'::regprocedure);
  v_status text;
begin
  foreach v_status in array array[
    'structured_output_invalid', 'structured_output_truncated', 'structured_output_refused',
    'structured_output_schema_failed', 'structured_output_json_invalid',
    'failed_before_provider', 'provider_result_uncertain', 'reconciliation_required'
  ] loop
    if pg_catalog.position(v_status in v_manual) = 0 then
      raise exception 'manual_ai_settlement_missing_status: %', v_status;
    end if;
    if pg_catalog.position(v_status in v_auto) = 0 then
      raise exception 'autonomous_ai_settlement_missing_status: %', v_status;
    end if;
  end loop;

  if pg_catalog.position('structured_output_diagnostics = p_result->''structured_output_diagnostics''' in v_manual) = 0 then
    raise exception 'manual_ai_settlement_does_not_persist_structured_output_diagnostics';
  end if;
  if pg_catalog.position('structured_output_diagnostics = p_result->''structured_output_diagnostics''' in v_auto) = 0 then
    raise exception 'autonomous_ai_settlement_does_not_persist_structured_output_diagnostics';
  end if;
end;
$$;

commit;

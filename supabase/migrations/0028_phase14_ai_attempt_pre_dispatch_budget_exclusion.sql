-- Phase 14 launch readiness -- M1: AI retry classification, SQL-side budget exclusion.
--
-- src/lib/reports/automation/ai-failure-classification.ts now distinguishes a failure
-- PROVEN to have happened before any HTTP request reached the AI provider (bad model
-- id, missing credential, invalid argument -- all validated by the AI SDK synchronously
-- before dispatch) from every other failure. A pre-dispatch failure is persisted with
-- report_ai_attempts.status = 'failed_before_provider' -- a status the durable
-- generator's existing-attempt lookup does not treat as blocking, so a fresh attempt is
-- claimed automatically on the next call, with no operator action required.
--
-- That TS-side "safe to retry automatically" behaviour is only meaningful if a
-- failed_before_provider attempt does not consume the same combined generate+repair
-- budget (migration 0027, PREMIUM_REPORT_AI_MAX_ATTEMPTS = 2) as an attempt that
-- actually reached the provider. It made zero real provider calls -- nothing was sent,
-- nothing could have been generated or charged. Without this exclusion, two
-- configuration/validation glitches in a row would silently exhaust the entire real
-- budget before a single real attempt was ever dispatched, and the third call (a
-- genuine first real attempt) would be wrongly rejected with
-- phase14_ai_attempt_limit_reached.
--
-- This migration adds the matching exclusion to the authoritative SQL-side v_total
-- count in public.claim_phase14_ai_attempt (same function signature, same per-kind v_n
-- computation and its unique constraint untouched -- only the cross-kind budget count
-- added in 0027 is narrowed).
create or replace function public.claim_phase14_ai_attempt(p_capability_id uuid,p_attempt jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_f public.report_fulfilments%rowtype; v_route public.phase14_ai_route_policies%rowtype;
  v_row public.report_ai_attempts%rowtype; v_n integer; v_total integer;
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
  -- Cross-kind combined budget (0027), now excluding attempts proven to have made zero
  -- real provider calls (M1: 'failed_before_provider') -- see migration header.
  select count(*) into v_total from public.report_ai_attempts
   where generation_identity=p_attempt->>'generation_identity'
     and evidence_checksum=p_attempt->>'evidence_checksum'
     and requested_provider=p_attempt->>'requested_provider'
     and requested_model=p_attempt->>'requested_model'
     and prompt_version=p_attempt->>'prompt_version' and schema_version=p_attempt->>'schema_version'
     and status<>'failed_before_provider';
  if v_total+1>2 then raise exception 'phase14_ai_attempt_limit_reached'; end if;
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

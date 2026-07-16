-- Phase 14 launch readiness -- M2 + M3: the AI attempt budget is a combined generate+repair
-- limit (PREMIUM_REPORT_AI_MAX_ATTEMPTS = 2 in durable-ai-attempts.ts -- one generation attempt,
-- one repair of that attempt, then deterministic fallback), but the authoritative SQL enforcement
-- in public.claim_phase14_ai_attempt only ever counted attempts of the SAME attempt_kind:
--
--   select coalesce(max(attempt_number),0)+1 into v_n from report_ai_attempts
--     where ... and attempt_kind = p_attempt->>'attempt_kind';
--   if v_n>2 then raise exception 'phase14_ai_attempt_limit_reached'; end if;
--
-- This means a caller could obtain up to 2 'generate' attempts AND up to 2 'repair' attempts for
-- the same (generation_identity, evidence_checksum, provider, model, prompt_version,
-- schema_version) tuple -- four real provider calls, not the intended two. The TS-side pre-flight
-- check in durable-ai-attempts.ts had a matching bug (a hard-coded `kind === 'repair' ? 1 : 0`
-- assumption about prior attempts, rather than an authoritative count), but that TS check is only
-- ever a cheap early-exit -- this migration fixes the actual authoritative boundary.
--
-- This migration adds a real, atomic cross-kind count (computed in the same transaction as the
-- insert, same pattern as the existing per-kind v_n computation) and enforces the combined total
-- against the same limit of 2, while leaving the per-kind attempt_number computation (v_n) and its
-- existing unique(generation_identity, attempt_kind, attempt_number) constraint untouched -- that
-- constraint is about row identity/idempotency-key uniqueness within a kind, not the budget.
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
  -- Cross-kind combined budget: counts every attempt (generate OR repair) already recorded for
  -- this exact fingerprint, independent of attempt_kind, and rejects before this one would make
  -- the combined total exceed 2. Computed within the same transaction as the insert below, so it
  -- is atomic with respect to this claim in the same sense the existing v_n computation already
  -- was -- and the pre-existing unique constraints remain the final safety net against any
  -- genuinely concurrent claim racing this same read.
  select count(*) into v_total from public.report_ai_attempts
   where generation_identity=p_attempt->>'generation_identity'
     and evidence_checksum=p_attempt->>'evidence_checksum'
     and requested_provider=p_attempt->>'requested_provider'
     and requested_model=p_attempt->>'requested_model'
     and prompt_version=p_attempt->>'prompt_version' and schema_version=p_attempt->>'schema_version';
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

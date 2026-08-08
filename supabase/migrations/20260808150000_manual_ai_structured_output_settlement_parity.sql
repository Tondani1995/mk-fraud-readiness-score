-- Production-bound structured-output settlement contract, for BOTH settlement paths.
--
-- Independent read-only inspection of Production (jvjxlphdyzerrhwcgkup) confirmed its contract is
-- the 0017 baseline: settle_phase14_ai_attempt() accepts only failed_before_provider,
-- provider_result_uncertain and reconciliation_required outside the success states;
-- report_ai_attempts_status_check permits only those six values; and
-- report_ai_attempts.structured_output_diagnostics does not exist at all.
--
-- The structured-output upgrade that Staging has lives in 20260806143000, which is Staging-only and
-- deliberately excluded from the Production ledger. Production must therefore NOT inherit that
-- identifier, and this migration must not depend on it. Everything here is derived from the 0017
-- Production baseline and written to be replay-safe where the Staging-only upgrade already applied:
-- the column add is IF NOT EXISTS, the constraints are dropped IF EXISTS before being re-added, and
-- both functions are CREATE OR REPLACE. Applying this after 20260806143000 (Staging) or directly
-- onto the 0017 baseline (Production) must leave semantically identical structured-output behaviour.
--
-- Why it matters: the V4 controlled AI run on Staging (generation attempt
-- 9960c938-10cf-43a2-b15b-6002144e36e2, AI attempt e3f69665-2002-4b75-aa37-8c4659f1a685, deployment
-- dpl_8AjSKSo9mAd3jwQPEjvsK1uDBa1D) had the provider respond -- openai / openai/gpt-5.5, 48,887 ms --
-- but the structured output could not be accepted. durable-ai-attempts.ts passed the correct
-- diagnostic status into settlement, the manual RPC rejected it with
-- phase14_ai_result_status_invalid, the attempt stayed 'started', and the narrative fell back
-- deterministically, destroying the diagnostic. Production would fail the same way on both paths.
--
-- Preserved exactly: worker capability activation and allowed capability types, parent fulfilment
-- binding, manual-generation parent binding and REPORT_GENERATING requirement, provider equality
-- rules, CAS from 'started', accounting semantics, every token field, and the ownership/privilege
-- model. CREATE OR REPLACE keeps owner and ACL, and this migration contains no grant, revoke or
-- privilege statement of any kind. Every unrelated constraint on the table is untouched.

begin;

-- 1. Schema. Additive and replay-safe.
alter table public.report_ai_attempts
  add column if not exists structured_output_diagnostics jsonb;

alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_structured_output_diagnostics_chk;
alter table public.report_ai_attempts
  add constraint report_ai_attempts_structured_output_diagnostics_chk
    check (structured_output_diagnostics is null
           or jsonb_typeof(structured_output_diagnostics) = 'object');

-- 2. Status vocabulary. Only this constraint is replaced; every other constraint on the table --
--    accounting status, input size, and the rest from 0017 -- is left exactly as accepted.
alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_status_check;
alter table public.report_ai_attempts
  add constraint report_ai_attempts_status_check check (status in (
    'started', 'succeeded', 'accounting_unverified', 'failed_before_provider',
    'provider_result_uncertain', 'reconciliation_required',
    'structured_output_invalid', 'structured_output_truncated', 'structured_output_refused',
    'structured_output_schema_failed', 'structured_output_json_invalid'
  ));

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

-- 4. Autonomous settlement, derived from the 0017 Production baseline -- NOT copied from the
--    Staging-only 20260806143000. Two changes only: the terminal-status allowlist gains the five
--    structured-output statuses, and the update persists structured_output_diagnostics. Worker
--    capability activation, allowed capability types, fulfilment binding, provider equality, CAS and
--    accounting are reproduced exactly as accepted.
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
  elsif v_status not in (
    'failed_before_provider','provider_result_uncertain','reconciliation_required',
    'structured_output_invalid','structured_output_truncated','structured_output_refused',
    'structured_output_schema_failed','structured_output_json_invalid'
  ) then
    raise exception 'phase14_ai_result_status_invalid';
  end if;
  update public.report_ai_attempts set status=v_status,output_json=p_result->'output_json',
    structured_output_diagnostics = p_result->'structured_output_diagnostics',
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

-- 5. Apply-time and replay-time assertion. Both functions are defined by THIS migration, so both
--    can be asserted here without depending on any Staging-only migration.
do $$
declare
  v_manual text := pg_catalog.pg_get_functiondef('public.settle_manual_report_ai_attempt(uuid,jsonb)'::regprocedure);
  v_auto   text := pg_catalog.pg_get_functiondef('public.settle_phase14_ai_attempt(uuid,uuid,jsonb)'::regprocedure);
  v_status text;
  v_assignment constant text := 'structured_output_diagnostics = p_result->''structured_output_diagnostics''';
begin
  foreach v_status in array array[
    'structured_output_invalid', 'structured_output_truncated', 'structured_output_refused',
    'structured_output_schema_failed', 'structured_output_json_invalid',
    'failed_before_provider', 'provider_result_uncertain', 'reconciliation_required'
  ] loop
    if pg_catalog.strpos(v_manual, v_status) = 0 then
      raise exception 'manual_ai_settlement_missing_status: %', v_status;
    end if;
    if pg_catalog.strpos(v_auto, v_status) = 0 then
      raise exception 'autonomous_ai_settlement_missing_status: %', v_status;
    end if;
    -- The table must be able to hold what the functions may now write.
    if not exists (
      select 1 from pg_catalog.pg_constraint
      where conname = 'report_ai_attempts_status_check'
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid), v_status) > 0
    ) then
      raise exception 'report_ai_attempts_status_check_missing_status: %', v_status;
    end if;
  end loop;

  if pg_catalog.strpos(v_manual, v_assignment) = 0 then
    raise exception 'manual_ai_settlement_does_not_persist_structured_output_diagnostics';
  end if;
  if pg_catalog.strpos(v_auto, v_assignment) = 0 then
    raise exception 'autonomous_ai_settlement_does_not_persist_structured_output_diagnostics';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='report_ai_attempts'
      and column_name='structured_output_diagnostics' and data_type='jsonb'
  ) then
    raise exception 'report_ai_attempts_missing_structured_output_diagnostics_column';
  end if;

  -- No privilege may have been broadened by this migration.
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('settle_manual_report_ai_attempt','settle_phase14_ai_attempt')
      and (p.proacl::text like '%=X/%public%' or p.proacl::text like '%anon=X%'
           or p.proacl::text like '%authenticated=X%')
  ) then
    raise exception 'ai_settlement_privilege_broadened';
  end if;
end;
$$;

commit;

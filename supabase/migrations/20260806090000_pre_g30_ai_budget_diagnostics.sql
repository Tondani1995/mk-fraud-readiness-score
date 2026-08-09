-- Pre-G30 AI budget contract: retain safe pre-dispatch measurements alongside
-- the attempt identity. Raw prompts and customer-entered narrative are never
-- persisted by this migration.
alter table public.report_ai_attempts
  add column if not exists pre_dispatch_total_tokens integer,
  add column if not exists pre_dispatch_estimated_cost_micros bigint,
  add column if not exists pre_dispatch_budget_reason text;

alter table public.report_generation_runs
  add column if not exists pre_dispatch_total_tokens integer,
  add column if not exists pre_dispatch_estimated_cost_micros bigint,
  add column if not exists pre_dispatch_budget_reason text;

alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_pre_dispatch_total_tokens_chk,
  drop constraint if exists report_ai_attempts_pre_dispatch_cost_chk,
  drop constraint if exists report_ai_attempts_pre_dispatch_reason_chk;

alter table public.report_generation_runs
  drop constraint if exists report_generation_runs_pre_dispatch_total_tokens_chk,
  drop constraint if exists report_generation_runs_pre_dispatch_cost_chk,
  drop constraint if exists report_generation_runs_pre_dispatch_reason_chk;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_pre_dispatch_total_tokens_chk
    check (pre_dispatch_total_tokens is null or pre_dispatch_total_tokens between 1 and 100000),
  add constraint report_ai_attempts_pre_dispatch_cost_chk
    check (pre_dispatch_estimated_cost_micros is null or pre_dispatch_estimated_cost_micros >= 0),
  add constraint report_ai_attempts_pre_dispatch_reason_chk
    check (pre_dispatch_budget_reason is null or pre_dispatch_budget_reason in (
      'pre_dispatch_input_bytes_exceeded',
      'pre_dispatch_input_tokens_exceeded',
      'pre_dispatch_total_tokens_exceeded',
      'pre_dispatch_estimated_cost_exceeded'
    ));

alter table public.report_generation_runs
  add constraint report_generation_runs_pre_dispatch_total_tokens_chk
    check (pre_dispatch_total_tokens is null or pre_dispatch_total_tokens between 1 and 100000),
  add constraint report_generation_runs_pre_dispatch_cost_chk
    check (pre_dispatch_estimated_cost_micros is null or pre_dispatch_estimated_cost_micros >= 0),
  add constraint report_generation_runs_pre_dispatch_reason_chk
    check (pre_dispatch_budget_reason is null or pre_dispatch_budget_reason in (
      'pre_dispatch_input_bytes_exceeded',
      'pre_dispatch_input_tokens_exceeded',
      'pre_dispatch_total_tokens_exceeded',
      'pre_dispatch_estimated_cost_exceeded'
    ));

comment on column public.report_ai_attempts.pre_dispatch_total_tokens is
  'Safe estimated input plus maximum output token count, recorded before provider dispatch.';
comment on column public.report_ai_attempts.pre_dispatch_estimated_cost_micros is
  'Safe conservative pre-dispatch cost estimate in micros; never contains prompt content.';
comment on column public.report_ai_attempts.pre_dispatch_budget_reason is
  'Closed-vocabulary pre-dispatch budget result; null means the attempt passed the pre-dispatch gate.';
comment on column public.report_generation_runs.pre_dispatch_total_tokens is
  'Safe estimated input plus maximum output token count, recorded even when no AI attempt is claimed.';
comment on column public.report_generation_runs.pre_dispatch_estimated_cost_micros is
  'Safe conservative pre-dispatch cost estimate in micros; never contains prompt content.';
comment on column public.report_generation_runs.pre_dispatch_budget_reason is
  'Closed-vocabulary pre-dispatch budget result; null means the attempt passed the pre-dispatch gate.';

-- Keep the worker claim authoritative for the new diagnostics. The existing
-- capability, route-policy, freeze and combined-attempt guards are unchanged.
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
    prompt_version,schema_version,input_size_bytes,estimated_input_tokens,pre_dispatch_total_tokens,
    pre_dispatch_estimated_cost_micros,pre_dispatch_budget_reason,max_output_tokens,
    max_estimated_cost_micros,timeout_ms,status,accounting_status)
  values(p_attempt->>'generation_identity',v_f.id,p_attempt->>'attempt_kind',v_n,
    p_attempt->>'provider_request_key',p_attempt->>'requested_provider',p_attempt->>'requested_model',
    p_attempt->>'requested_provider',p_attempt->>'requested_model',p_attempt->>'evidence_checksum',
    p_attempt->>'prompt_version',p_attempt->>'schema_version',(p_attempt->>'input_size_bytes')::integer,
    (p_attempt->>'estimated_input_tokens')::integer,(p_attempt->>'pre_dispatch_total_tokens')::integer,
    (p_attempt->>'pre_dispatch_estimated_cost_micros')::bigint,p_attempt->>'pre_dispatch_budget_reason',
    (p_attempt->>'max_output_tokens')::integer,(p_attempt->>'max_estimated_cost_micros')::bigint,
    (p_attempt->>'timeout_ms')::integer,'started','unverified') returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.claim_manual_report_ai_attempt(p_attempt jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_manual_id uuid := (p_attempt->>'manual_generation_attempt_id')::uuid;
  v_binding jsonb;
  v_row public.report_ai_attempts%rowtype;
  v_n integer;
  v_total integer;
begin
  v_binding := public.authorize_manual_report_ai_action(v_manual_id, p_attempt->>'requested_provider');
  if coalesce(trim(p_attempt->>'generation_identity'),'') = ''
     or coalesce(trim(p_attempt->>'requested_model'),'') = ''
     or coalesce(trim(p_attempt->>'prompt_version'),'') = ''
     or coalesce(trim(p_attempt->>'schema_version'),'') = ''
     or (p_attempt->>'evidence_checksum') !~ '^[0-9a-f]{64}$'
     or p_attempt->>'attempt_kind' not in ('generate','repair') then
    raise exception 'manual_report_ai_attempt_invalid';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_n
    from public.report_ai_attempts
    where generation_identity = p_attempt->>'generation_identity'
      and evidence_checksum = p_attempt->>'evidence_checksum'
      and requested_provider = lower(p_attempt->>'requested_provider')
      and requested_model = p_attempt->>'requested_model'
      and prompt_version = p_attempt->>'prompt_version'
      and schema_version = p_attempt->>'schema_version'
      and attempt_kind = p_attempt->>'attempt_kind';
  if v_n > 2 then raise exception 'phase14_ai_attempt_limit_reached'; end if;

  select count(*) into v_total
    from public.report_ai_attempts
    where generation_identity = p_attempt->>'generation_identity'
      and evidence_checksum = p_attempt->>'evidence_checksum'
      and requested_provider = lower(p_attempt->>'requested_provider')
      and requested_model = p_attempt->>'requested_model'
      and prompt_version = p_attempt->>'prompt_version'
      and schema_version = p_attempt->>'schema_version'
      and status <> 'failed_before_provider';
  if v_total + 1 > 2 then raise exception 'phase14_ai_attempt_limit_reached'; end if;

  insert into public.report_ai_attempts(
    generation_identity, fulfilment_id, manual_generation_attempt_id,
    manual_order_id, manual_assessment_id, manual_score_run_id, attempt_kind, attempt_number,
    provider_request_key, provider, model, requested_provider, requested_model, evidence_checksum,
    prompt_version, schema_version, input_size_bytes, estimated_input_tokens, pre_dispatch_total_tokens,
    pre_dispatch_estimated_cost_micros, pre_dispatch_budget_reason, max_output_tokens,
    max_estimated_cost_micros, timeout_ms, status, accounting_status
  ) values (
    p_attempt->>'generation_identity', null, v_manual_id,
    (v_binding->>'order_id')::uuid, (v_binding->>'assessment_id')::uuid,
    (v_binding->>'score_run_id')::uuid, p_attempt->>'attempt_kind', v_n,
    p_attempt->>'provider_request_key', lower(p_attempt->>'requested_provider'), p_attempt->>'requested_model',
    lower(p_attempt->>'requested_provider'), p_attempt->>'requested_model', p_attempt->>'evidence_checksum',
    p_attempt->>'prompt_version', p_attempt->>'schema_version', (p_attempt->>'input_size_bytes')::integer,
    (p_attempt->>'estimated_input_tokens')::integer, (p_attempt->>'pre_dispatch_total_tokens')::integer,
    (p_attempt->>'pre_dispatch_estimated_cost_micros')::bigint, p_attempt->>'pre_dispatch_budget_reason',
    (p_attempt->>'max_output_tokens')::integer, (p_attempt->>'max_estimated_cost_micros')::bigint,
    (p_attempt->>'timeout_ms')::integer, 'started', 'unverified'
  ) returning * into v_row;
  return to_jsonb(v_row);
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
declare
  v_f public.report_fulfilments%rowtype;
  v_id uuid;
  v_attempt integer;
begin
  select * into v_f from public.report_fulfilments where id = p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  if p_capability_id is not null then
    perform public.phase14_activate_worker_operation(
      p_capability_id, array['automatic_generation','generation_recovery'],
      v_f.order_id, v_f.assessment_id, v_f.score_run_id, v_f.id, null, null
    );
  else
    perform public.phase14_require_security(
      'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
    );
  end if;
  select id into v_id from public.report_generation_runs
    where fulfilment_id = p_fulfilment_id and status = 'used' limit 1;
  if v_id is not null then return v_id; end if;
  select coalesce(max(attempt_number), 0) + 1 into v_attempt
    from public.report_generation_runs where fulfilment_id = p_fulfilment_id;
  insert into public.report_generation_runs(
    fulfilment_id, attempt_number, generation_mode, provider, model, requested_provider,
    requested_model, resolved_provider, resolved_model, prompt_version, schema_version,
    evidence_checksum, evidence_snapshot_json, structured_output_json, final_narrative_json,
    validation_result_json, validation_errors_json, initial_validation_json, repair_validation_json,
    input_token_count, output_token_count, total_token_count, estimated_cost_micros,
    pre_dispatch_total_tokens, pre_dispatch_estimated_cost_micros, pre_dispatch_budget_reason,
    accounting_status, latency_ms, status, error_code, error_message, completed_at
  ) values (
    p_fulfilment_id, v_attempt, p_run->>'generation_mode', nullif(p_run->>'provider',''),
    nullif(p_run->>'model',''), nullif(p_run->>'requested_provider',''),
    nullif(p_run->>'requested_model',''), nullif(p_run->>'resolved_provider',''),
    nullif(p_run->>'resolved_model',''), p_run->>'prompt_version', p_run->>'schema_version',
    p_run->>'evidence_checksum', coalesce(p_run->'evidence_snapshot_json','{}'::jsonb),
    p_run->'structured_output_json', p_run->'final_narrative_json',
    coalesce(p_run->'validation_result_json','{}'::jsonb),
    coalesce(p_run->'validation_errors_json','[]'::jsonb),
    p_run->'initial_validation_json', p_run->'repair_validation_json',
    nullif(p_run->>'input_token_count','')::integer,
    nullif(p_run->>'output_token_count','')::integer,
    nullif(p_run->>'total_token_count','')::integer,
    nullif(p_run->>'estimated_cost_micros','')::bigint,
    nullif(p_run->>'pre_dispatch_total_tokens','')::integer,
    nullif(p_run->>'pre_dispatch_estimated_cost_micros','')::bigint,
    nullif(p_run->>'pre_dispatch_budget_reason',''),
    p_run->>'accounting_status', nullif(p_run->>'latency_ms','')::integer, 'used',
    nullif(p_run->>'error_code',''), nullif(p_run->>'error_message',''), now()
  ) returning id into v_id;
  return v_id;
end;
$$;

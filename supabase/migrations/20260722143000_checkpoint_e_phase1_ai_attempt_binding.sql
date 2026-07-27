-- Checkpoint E: bind the existing durable AI-attempt ledger to Phase 1 manual generation.
-- Additive only. This migration does not enable AI, automatic fulfilment, email or any provider route.

alter table public.report_ai_attempts
  add column if not exists manual_generation_attempt_id uuid
    references public.manual_report_generation_attempts(id) on delete restrict,
  add column if not exists manual_order_id uuid
    references public.orders(id) on delete restrict,
  add column if not exists manual_assessment_id uuid
    references public.assessments(id) on delete restrict,
  add column if not exists manual_score_run_id uuid
    references public.score_runs(id) on delete restrict;

create index if not exists report_ai_attempts_manual_generation_idx
  on public.report_ai_attempts(manual_generation_attempt_id, created_at desc)
  where manual_generation_attempt_id is not null;

alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_exactly_one_parent_chk;
alter table public.report_ai_attempts
  add constraint report_ai_attempts_exactly_one_parent_chk
  check (num_nonnulls(fulfilment_id, manual_generation_attempt_id) = 1) not valid;
alter table public.report_ai_attempts
  validate constraint report_ai_attempts_exactly_one_parent_chk;

alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_manual_binding_chk;
alter table public.report_ai_attempts
  add constraint report_ai_attempts_manual_binding_chk check (
    (manual_generation_attempt_id is null and manual_order_id is null
      and manual_assessment_id is null and manual_score_run_id is null)
    or
    (manual_generation_attempt_id is not null and manual_order_id is not null
      and manual_assessment_id is not null and manual_score_run_id is not null)
  ) not valid;
alter table public.report_ai_attempts
  validate constraint report_ai_attempts_manual_binding_chk;

alter table public.manual_report_generation_attempts
  add column if not exists generation_mode text,
  add column if not exists evidence_checksum text,
  add column if not exists prompt_version text,
  add column if not exists schema_version text,
  add column if not exists requested_provider text,
  add column if not exists requested_model text,
  add column if not exists resolved_provider text,
  add column if not exists resolved_model text,
  add column if not exists structured_ai_output_json jsonb,
  add column if not exists final_narrative_json jsonb,
  add column if not exists final_validation_json jsonb,
  add column if not exists initial_validation_json jsonb,
  add column if not exists repair_validation_json jsonb,
  add column if not exists ai_usage_json jsonb,
  add column if not exists narrative_fallback_reason text,
  add column if not exists narrative_prepared_at timestamptz;

alter table public.report_generation_runs
  add column if not exists final_narrative_json jsonb,
  add column if not exists initial_validation_json jsonb,
  add column if not exists repair_validation_json jsonb;

alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_mode_chk;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_mode_chk
  check (generation_mode is null or generation_mode in ('ai','ai_repair','deterministic_fallback'));

alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_evidence_checksum_chk;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_evidence_checksum_chk
  check (evidence_checksum is null or evidence_checksum ~ '^[0-9a-f]{64}$');

create or replace function public.authorize_manual_report_ai_action(
  p_manual_generation_attempt_id uuid,
  p_requested_provider text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_gate public.phase14_security_gates%rowtype;
  v_route public.phase14_ai_route_policies%rowtype;
  v_setting_enabled boolean := false;
begin
  select * into v_attempt from public.manual_report_generation_attempts
    where id = p_manual_generation_attempt_id for share;
  if not found or v_attempt.status <> 'REPORT_GENERATING' then
    raise exception 'manual_report_ai_parent_not_active';
  end if;

  select * into v_order from public.orders where id = v_attempt.order_id for share;
  if not found then raise exception 'manual_report_ai_order_missing'; end if;
  select * into v_assessment from public.assessments where id = v_order.assessment_id for share;
  if not found or v_assessment.current_score_run_id is null then
    raise exception 'manual_report_ai_score_binding_missing';
  end if;
  select * into v_score from public.score_runs
    where id = v_assessment.current_score_run_id
      and assessment_id = v_assessment.id
      and status = 'completed'
      and locked_at is not null
    for share;
  if not found then raise exception 'manual_report_ai_score_binding_missing'; end if;

  perform public.phase14_require_policy('ai_narrative');
  select coalesce(bool_or(coalesce((value_json->>'premium_report_ai_narrative_enabled')::boolean, false)), false)
    into v_setting_enabled
    from public.app_settings
    where setting_key in ('phase14_autonomous_report_engine','phase14_delivery_policy');
  if not v_setting_enabled then raise exception 'manual_report_ai_feature_disabled'; end if;

  select * into v_gate from public.phase14_security_gates
    where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version is distinct from v_gate.required_version then
    raise exception 'phase14_security_gate_not_satisfied';
  end if;

  select * into v_route from public.phase14_ai_route_policies
    where requested_provider = lower(trim(p_requested_provider)) for share;
  if not found or not v_route.enabled
     or v_route.approved_gate_version is distinct from v_gate.required_version then
    raise exception 'phase14_ai_provider_route_disabled';
  end if;

  return jsonb_build_object(
    'authorised', true,
    'manual_generation_attempt_id', v_attempt.id,
    'order_id', v_order.id,
    'assessment_id', v_assessment.id,
    'score_run_id', v_assessment.current_score_run_id,
    'requested_provider', lower(trim(p_requested_provider))
  );
end;
$$;

create or replace function public.claim_manual_report_ai_attempt(p_attempt jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
    prompt_version, schema_version, input_size_bytes, estimated_input_tokens, max_output_tokens,
    max_estimated_cost_micros, timeout_ms, status, accounting_status
  ) values (
    p_attempt->>'generation_identity', null, v_manual_id,
    (v_binding->>'order_id')::uuid, (v_binding->>'assessment_id')::uuid,
    (v_binding->>'score_run_id')::uuid, p_attempt->>'attempt_kind', v_n,
    p_attempt->>'provider_request_key', lower(p_attempt->>'requested_provider'), p_attempt->>'requested_model',
    lower(p_attempt->>'requested_provider'), p_attempt->>'requested_model', p_attempt->>'evidence_checksum',
    p_attempt->>'prompt_version', p_attempt->>'schema_version', (p_attempt->>'input_size_bytes')::integer,
    (p_attempt->>'estimated_input_tokens')::integer, (p_attempt->>'max_output_tokens')::integer,
    (p_attempt->>'max_estimated_cost_micros')::bigint, (p_attempt->>'timeout_ms')::integer,
    'started', 'unverified'
  ) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

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
  elsif v_status not in ('failed_before_provider','provider_result_uncertain','reconciliation_required') then
    raise exception 'phase14_ai_result_status_invalid';
  end if;

  update public.report_ai_attempts set
    status = v_status,
    output_json = p_result->'output_json',
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

create or replace function public.record_manual_report_narrative_provenance(
  p_manual_generation_attempt_id uuid,
  p_provenance jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.manual_report_generation_attempts%rowtype;
  v_mode text := p_provenance->>'generation_mode';
begin
  if v_mode not in ('ai','ai_repair','deterministic_fallback')
     or (p_provenance->>'evidence_checksum') !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_provenance->>'prompt_version'),'') = ''
     or coalesce(trim(p_provenance->>'schema_version'),'') = ''
     or p_provenance->'final_narrative' is null
     or p_provenance->'final_validation' is null then
    raise exception 'manual_report_narrative_provenance_invalid';
  end if;
  if p_provenance::text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then
    raise exception 'manual_report_narrative_provenance_contains_email';
  end if;

  update public.manual_report_generation_attempts set
    generation_mode = v_mode,
    evidence_checksum = p_provenance->>'evidence_checksum',
    prompt_version = p_provenance->>'prompt_version',
    schema_version = p_provenance->>'schema_version',
    requested_provider = nullif(p_provenance->>'requested_provider',''),
    requested_model = nullif(p_provenance->>'requested_model',''),
    resolved_provider = nullif(p_provenance->>'resolved_provider',''),
    resolved_model = nullif(p_provenance->>'resolved_model',''),
    structured_ai_output_json = p_provenance->'structured_ai_output',
    final_narrative_json = p_provenance->'final_narrative',
    final_validation_json = p_provenance->'final_validation',
    initial_validation_json = p_provenance->'initial_validation',
    repair_validation_json = p_provenance->'repair_validation',
    ai_usage_json = p_provenance->'usage',
    narrative_fallback_reason = nullif(left(p_provenance->>'fallback_reason', 500), ''),
    narrative_prepared_at = now(),
    updated_at = now()
  where id = p_manual_generation_attempt_id and status = 'REPORT_GENERATING'
  returning * into v_row;
  if not found then raise exception 'manual_report_ai_parent_not_active'; end if;
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
    p_run->>'accounting_status', nullif(p_run->>'latency_ms','')::integer, 'used',
    nullif(p_run->>'error_code',''), nullif(p_run->>'error_message',''), now()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.authorize_manual_report_ai_action(uuid,text),
  public.claim_manual_report_ai_attempt(jsonb),
  public.settle_manual_report_ai_attempt(uuid,jsonb),
  public.record_manual_report_narrative_provenance(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.authorize_manual_report_ai_action(uuid,text),
  public.claim_manual_report_ai_attempt(jsonb),
  public.settle_manual_report_ai_attempt(uuid,jsonb),
  public.record_manual_report_narrative_provenance(uuid,jsonb)
  to service_role;

-- No app setting, feature policy, provider route or environment value is changed by this migration.

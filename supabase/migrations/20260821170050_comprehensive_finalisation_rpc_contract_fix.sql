-- Comprehensive finalisation RPC contract fix.
--
-- 20260820120000 declared a 64-byte PostgreSQL identifier. PostgreSQL therefore stored the
-- routine under the silently truncated name `finalise_comprehensive_automated_report_with_supporting_registe`.
-- Keep the accepted 14-argument body and rename that existing routine to an intentional, bounded
-- application contract. No report, renderer, product or fulfilment semantics are changed here.

begin;

alter function public.finalise_comprehensive_automated_report_with_supporting_registe(
  uuid, uuid, public.report_type, text, text, text, text, bigint, text, text, text, text, bigint, text
) rename to finalise_comprehensive_report_package;

revoke all on function public.finalise_comprehensive_report_package(
  uuid, uuid, public.report_type, text, text, text, text, bigint, text, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.finalise_comprehensive_report_package(
  uuid, uuid, public.report_type, text, text, text, text, bigint, text, text, text, text, bigint, text
) to service_role;

-- Persist only the bounded provider accounting envelope on the existing durable generation attempt.
-- This is intentionally separate from narrative/provenance content: no provider output or prompt is
-- stored, and the accounting survives any later PDF, workbook, storage or finalisation failure.
create function public.record_comprehensive_interpretation_accounting(
  p_attempt_id uuid,
  p_accounting jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_provider text;
  v_model text;
  v_calls integer;
  v_repairs integer;
  v_input_tokens integer;
  v_output_tokens integer;
  v_total_tokens integer;
  v_cost_micros bigint;
  v_duration_ms bigint;
begin
  if p_accounting is null or jsonb_typeof(p_accounting) <> 'object' then
    raise exception 'comprehensive_interpretation_accounting_invalid';
  end if;

  v_provider := nullif(btrim(p_accounting->>'provider'), '');
  v_model := nullif(btrim(p_accounting->>'model'), '');
  if v_provider is null or v_model is null then
    raise exception 'comprehensive_interpretation_accounting_identity_required';
  end if;

  if coalesce(p_accounting->>'calls', '') !~ '^[0-9]+$'
     or coalesce(p_accounting->>'repairs', '') !~ '^[0-9]+$'
     or coalesce(p_accounting->>'input_tokens', '') !~ '^[0-9]+$'
     or coalesce(p_accounting->>'output_tokens', '') !~ '^[0-9]+$'
     or coalesce(p_accounting->>'total_tokens', '') !~ '^[0-9]+$'
     or coalesce(p_accounting->>'cost_micros', '') !~ '^[0-9]+$'
     or coalesce(p_accounting->>'duration_ms', '') !~ '^[0-9]+$' then
    raise exception 'comprehensive_interpretation_accounting_numeric_invalid';
  end if;

  v_calls := (p_accounting->>'calls')::integer;
  v_repairs := (p_accounting->>'repairs')::integer;
  v_input_tokens := (p_accounting->>'input_tokens')::integer;
  v_output_tokens := (p_accounting->>'output_tokens')::integer;
  v_total_tokens := (p_accounting->>'total_tokens')::integer;
  v_cost_micros := (p_accounting->>'cost_micros')::bigint;
  v_duration_ms := (p_accounting->>'duration_ms')::bigint;
  if v_calls < 1 or v_repairs < 0 or v_input_tokens < 0 or v_output_tokens < 0
     or v_total_tokens < 0 or v_cost_micros < 0 or v_duration_ms < 0 then
    raise exception 'comprehensive_interpretation_accounting_range_invalid';
  end if;

  select * into v_attempt
  from public.manual_report_generation_attempts
  where id = p_attempt_id
  for update;
  if not found or v_attempt.status <> 'REPORT_GENERATING' then
    raise exception 'comprehensive_interpretation_attempt_not_active';
  end if;

  update public.manual_report_generation_attempts
  set generation_mode = 'ai',
      requested_provider = coalesce(requested_provider, v_provider),
      requested_model = coalesce(requested_model, v_model),
      resolved_provider = v_provider,
      resolved_model = v_model,
      ai_usage_json = jsonb_build_object(
        'provider', v_provider,
        'model', v_model,
        'calls', v_calls,
        'repairs', v_repairs,
        'input_tokens', v_input_tokens,
        'output_tokens', v_output_tokens,
        'total_tokens', v_total_tokens,
        'cost_micros', v_cost_micros,
        'gateway_cost_micros', v_cost_micros,
        'duration_ms', v_duration_ms,
        'repaired_slots', coalesce(p_accounting->'repaired_slots', '[]'::jsonb)
      ),
      narrative_prepared_at = coalesce(narrative_prepared_at, now()),
      updated_at = now()
  where id = p_attempt_id
  returning * into v_attempt;

  return to_jsonb(v_attempt);
end;
$$;

comment on function public.record_comprehensive_interpretation_accounting(uuid, jsonb) is
  'Persist bounded Comprehensive interpretation provider accounting before rendering/storage; no provider output is stored.';
revoke all on function public.record_comprehensive_interpretation_accounting(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_comprehensive_interpretation_accounting(uuid, jsonb) to service_role;

commit;

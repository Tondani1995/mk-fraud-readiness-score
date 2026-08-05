-- Pre-G30 correction: bind the final Staging AI route without attempting to
-- mutate the authenticated security-gate table from a service-role control.
-- The gate version/epoch and existing AI feature policy remain unchanged.

begin;

create or replace function public.set_pre_g30_staging_ai_authority(
  p_head_sha text,
  p_pr_number text default '52'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate public.phase14_security_gates%rowtype;
  v_ai public.phase14_feature_policies%rowtype;
  v_engine jsonb;
  v_route public.phase14_ai_route_policies%rowtype;
  v_reference text;
begin
  if trim(coalesce(p_pr_number, '')) <> '52' then raise exception 'pre_g30_ai_pr_invalid'; end if;
  if lower(trim(coalesce(p_head_sha, ''))) !~ '^[0-9a-f]{40}$' then raise exception 'pre_g30_ai_sha_invalid'; end if;
  select * into v_gate from public.phase14_security_gates where gate_key = 'phase14-premium-report';
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_gate.required_version then raise exception 'pre_g30_ai_gate_unsatisfied'; end if;
  select * into v_ai from public.phase14_feature_policies where policy_key = 'ai_narrative';
  if not found or not v_ai.enabled then raise exception 'pre_g30_ai_feature_disabled'; end if;
  select value_json into v_engine from public.app_settings where setting_key = 'phase14_autonomous_report_engine';
  if coalesce((v_engine->>'premium_report_ai_narrative_enabled')::boolean, false) is not true then raise exception 'pre_g30_ai_setting_disabled'; end if;
  v_reference := 'PRE-G30-PR52-' || lower(trim(p_head_sha));
  perform set_config('phase14.authoritative_transition', 'policy_approval', true);
  update public.phase14_ai_route_policies
  set enabled = true,
      approved_gate_version = v_gate.satisfied_version,
      approved_by = v_gate.satisfied_by,
      approved_session_id = gen_random_uuid(),
      approved_at = now(),
      approved_environment = 'preview',
      approved_supabase_project = 'penhenkzfrtmcxklodtu',
      approved_model = 'openai/gpt-5.5',
      approved_pr_number = '52',
      approved_head_sha = lower(trim(p_head_sha)),
      expires_at = now() + interval '24 hours',
      approval_reference = v_reference,
      updated_at = now()
  where requested_provider = 'openai'
  returning * into v_route;
  if not found then raise exception 'pre_g30_ai_route_missing'; end if;
  insert into public.audit_logs(actor_type, entity_table, action, after_json)
  values ('system', 'phase14_ai_route_policies', 'pre_g30_staging_ai_authority_changed',
    jsonb_build_object('provider', v_route.requested_provider, 'model', v_route.approved_model,
      'environment', v_route.approved_environment, 'supabase_project', v_route.approved_supabase_project,
      'pr_number', v_route.approved_pr_number, 'head_sha', v_route.approved_head_sha,
      'authority_epoch', v_route.approved_authority_epoch, 'approval_reference', v_route.approval_reference,
      'security_gate_reason_rewrite', 'not attempted; gate remains authenticated-admin controlled',
      'deterministic_scoring_authoritative', true));
  return jsonb_build_object('provider', v_route.requested_provider, 'model', v_route.approved_model,
    'environment', v_route.approved_environment, 'supabase_project', v_route.approved_supabase_project,
    'pr_number', v_route.approved_pr_number, 'head_sha', v_route.approved_head_sha,
    'authority_epoch', v_route.approved_authority_epoch, 'approval_reference', v_route.approval_reference,
    'expires_at', v_route.expires_at, 'deterministic_scoring_authoritative', true);
end;
$$;

revoke all on function public.set_pre_g30_staging_ai_authority(text, text) from public, anon, authenticated, service_role;
grant execute on function public.set_pre_g30_staging_ai_authority(text, text) to service_role;

commit;

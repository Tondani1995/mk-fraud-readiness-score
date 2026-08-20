-- Pre-G30: make AI route approval explicit and fail closed for Preview/Staging.
-- This is additive. Existing enabled rows intentionally become non-authoritative
-- until the new environment, project, model, PR, SHA and expiry fields are set.

alter table public.phase14_ai_route_policies
  add column if not exists approved_environment text,
  add column if not exists approved_supabase_project text,
  add column if not exists approved_model text,
  add column if not exists approved_pr_number text,
  add column if not exists approved_head_sha text,
  add column if not exists expires_at timestamptz,
  add column if not exists approval_reference text;

create or replace function public.authorize_phase14_ai_route(
  p_provider text,
  p_model text,
  p_environment text,
  p_supabase_project text,
  p_pr_number text,
  p_head_sha text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route public.phase14_ai_route_policies%rowtype;
  v_gate public.phase14_security_gates%rowtype;
  v_ai_policy public.phase14_feature_policies%rowtype;
  v_engine jsonb;
  v_reason text;
begin
  if lower(trim(coalesce(p_environment, ''))) <> 'preview' then
    return jsonb_build_object('allowed', false, 'reason', 'environment_not_preview');
  end if;
  if lower(trim(coalesce(p_supabase_project, ''))) <> 'penhenkzfrtmcxklodtu' then
    return jsonb_build_object('allowed', false, 'reason', 'supabase_project_not_staging');
  end if;
  if lower(trim(coalesce(p_provider, ''))) <> 'openai' then
    return jsonb_build_object('allowed', false, 'reason', 'provider_not_approved');
  end if;
  if nullif(trim(coalesce(p_model, '')), '') is null
     or nullif(trim(coalesce(p_pr_number, '')), '') is null
     or nullif(trim(coalesce(p_head_sha, '')), '') is null then
    return jsonb_build_object('allowed', false, 'reason', 'approval_binding_missing');
  end if;

  select * into v_route
  from public.phase14_ai_route_policies
  where requested_provider = lower(trim(p_provider));
  if not found or not v_route.enabled then
    return jsonb_build_object('allowed', false, 'reason', 'route_policy_missing_or_disabled');
  end if;
  if v_route.approved_environment is distinct from lower(trim(p_environment))
     or v_route.approved_supabase_project is distinct from lower(trim(p_supabase_project))
     or v_route.approved_model is distinct from trim(p_model)
     or v_route.approved_pr_number is distinct from trim(p_pr_number)
     or v_route.approved_head_sha is distinct from lower(trim(p_head_sha))
     or v_route.expires_at is null or v_route.expires_at <= now()
     or v_route.approval_reference is null then
    return jsonb_build_object('allowed', false, 'reason', 'route_approval_binding_mismatch');
  end if;

  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report';
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version is distinct from v_gate.required_version
     or v_route.approved_gate_version is distinct from v_gate.satisfied_version
     or v_route.approved_authority_epoch is distinct from v_gate.authority_epoch then
    return jsonb_build_object('allowed', false, 'reason', 'security_gate_unsatisfied');
  end if;

  select * into v_ai_policy from public.phase14_feature_policies
  where policy_key = 'ai_narrative';
  if not found or not v_ai_policy.enabled
     or v_ai_policy.approved_gate_version is distinct from v_gate.satisfied_version
     or v_ai_policy.approved_authority_epoch is distinct from v_gate.authority_epoch then
    return jsonb_build_object('allowed', false, 'reason', 'ai_feature_policy_disabled');
  end if;

  select value_json into v_engine from public.app_settings
  where setting_key = 'phase14_autonomous_report_engine';
  if coalesce((v_engine->>'premium_report_ai_narrative_enabled')::boolean, false) is not true then
    return jsonb_build_object('allowed', false, 'reason', 'ai_app_setting_disabled');
  end if;

  return jsonb_build_object(
    'allowed', true,
    'provider', lower(trim(p_provider)),
    'model', trim(p_model),
    'environment', lower(trim(p_environment)),
    'supabase_project', lower(trim(p_supabase_project)),
    'pr_number', trim(p_pr_number),
    'head_sha', lower(trim(p_head_sha)),
    'approval_reference', v_route.approval_reference,
    'expires_at', v_route.expires_at
  );
end;
$$;

revoke all on function public.authorize_phase14_ai_route(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.authorize_phase14_ai_route(text,text,text,text,text,text) to service_role;

comment on function public.authorize_phase14_ai_route(text,text,text,text,text,text)
  is 'Fail-closed Preview/Staging AI route decision bound to provider, model, environment, project, PR, SHA, gate epoch and expiry.';

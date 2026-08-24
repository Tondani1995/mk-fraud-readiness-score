-- Canonical Preview/Staging project rebind.
--
-- The historical migration chain is intentionally immutable and contains the retired
-- staging project ref. This forward migration changes only the Preview/Staging project
-- binding on the existing authority surfaces. It does not broaden provider/model policy,
-- alter graph content, or touch Production defaults.

begin;

do $$
declare
  v_project text;
begin
  select supabase_project into v_project
  from public.adaptive_activation_policies
  where policy_key = 'customer_start'
    and environment = 'preview';

  if v_project is distinct from 'penhenkzfrtmcxklodtu' then
    raise exception 'canonical_preview_rebind_expected_old_project: %', coalesce(v_project, '<missing>');
  end if;
end;
$$;

alter table public.adaptive_activation_policies
  drop constraint if exists adaptive_activation_policies_supabase_project_check;

do $$
begin
  update public.adaptive_activation_policies
  set supabase_project = 'iszihmmbgsfefawqmnwo',
      updated_at = now()
  where policy_key = 'customer_start'
    and environment = 'preview'
    and supabase_project = 'penhenkzfrtmcxklodtu';

  if not found then
    raise exception 'canonical_preview_rebind_policy_not_updated';
  end if;
end;
$$;

alter table public.adaptive_activation_policies
  add constraint adaptive_activation_policies_supabase_project_check
  check (supabase_project = 'iszihmmbgsfefawqmnwo');

-- Preserve any existing Preview AI-authority binding while moving only its project
-- identity. Disabled/unapproved routes remain disabled and retain their other policy
-- fields unchanged.
update public.phase14_ai_route_policies
set approved_supabase_project = 'iszihmmbgsfefawqmnwo'
where requested_provider = 'openai'
  and (
    approved_supabase_project = 'penhenkzfrtmcxklodtu'
    or (approved_environment = 'preview' and approved_supabase_project is null)
  );

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
  if lower(trim(coalesce(p_supabase_project, ''))) <> 'iszihmmbgsfefawqmnwo' then
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
      approved_supabase_project = 'iszihmmbgsfefawqmnwo',
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

do $$
begin
  if exists (
    select 1 from public.adaptive_activation_policies
    where supabase_project = 'penhenkzfrtmcxklodtu'
  ) then
    raise exception 'canonical_preview_rebind_old_project_remains_in_activation_policy';
  end if;
  if exists (
    select 1 from public.phase14_ai_route_policies
    where approved_supabase_project = 'penhenkzfrtmcxklodtu'
  ) then
    raise exception 'canonical_preview_rebind_old_project_remains_in_ai_route';
  end if;
  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef('public.authorize_phase14_ai_route(text,text,text,text,text,text)'::regprocedure),
       'penhenkzfrtmcxklodtu'
     ) > 0 then
    raise exception 'canonical_preview_rebind_old_project_remains_in_authorize_function';
  end if;
  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef('public.set_pre_g30_staging_ai_authority(text,text)'::regprocedure),
       'penhenkzfrtmcxklodtu'
     ) > 0 then
    raise exception 'canonical_preview_rebind_old_project_remains_in_authority_function';
  end if;
end;
$$;

insert into public.audit_logs(actor_type, entity_table, action, after_json)
values (
  'system',
  'adaptive_activation_policies',
  'canonical_preview_staging_project_rebound',
  jsonb_build_object(
    'old_project', 'penhenkzfrtmcxklodtu',
    'new_project', 'iszihmmbgsfefawqmnwo',
    'environment', 'preview',
    'graph_contract_unchanged', true,
    'provider_model_policy_unchanged', true
  )
);

commit;

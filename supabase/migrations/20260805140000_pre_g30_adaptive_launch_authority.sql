-- Pre-G30: canonical adaptive launch schema and narrowly scoped Staging activation authority.
-- The schema is part of the Production target; the default policy is disabled and the
-- activation RPC only records the approved Preview/Staging launch graph.

begin;

create table if not exists public.adaptive_activation_policies (
  policy_key text primary key check (policy_key = 'customer_start'),
  environment text not null check (environment = 'preview'),
  supabase_project text not null check (supabase_project = 'penhenkzfrtmcxklodtu'),
  graph_version text not null,
  graph_fingerprint text not null check (graph_fingerprint ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default false,
  activation_sha text check (activation_sha is null or activation_sha ~ '^[0-9a-f]{40}$'),
  activated_at timestamptz,
  activated_by text,
  reason text not null default 'Disabled until the approved Staging activation control is exercised.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((enabled = true) = (activated_at is not null and activation_sha is not null)),
  check (graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804'),
  check (graph_fingerprint = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab')
);

insert into public.adaptive_activation_policies(
  policy_key, environment, supabase_project, graph_version, graph_fingerprint
) values (
  'customer_start', 'preview', 'penhenkzfrtmcxklodtu',
  'MFRS-V1.1-ADAPTIVE-DRAFT-20260804',
  'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab'
) on conflict (policy_key) do nothing;

alter table public.adaptive_activation_policies enable row level security;
revoke all on public.adaptive_activation_policies from public, anon, authenticated;
grant select on public.adaptive_activation_policies to service_role;

create or replace function public.set_adaptive_staging_activation(
  p_enabled boolean,
  p_head_sha text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_policy public.adaptive_activation_policies%rowtype; v_graph public.adaptive_graph_versions%rowtype;
begin
  if lower(trim(coalesce(p_head_sha, ''))) !~ '^[0-9a-f]{40}$' then raise exception 'adaptive_activation_sha_invalid'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'adaptive_activation_reason_required'; end if;
  select * into v_graph from public.adaptive_graph_versions
  where graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804'
    and graph_fingerprint = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab';
  if not found or v_graph.status <> 'published' then raise exception 'adaptive_graph_must_be_published'; end if;
  perform set_config('phase14.authoritative_transition', 'policy_approval', true);
  update public.adaptive_activation_policies
  set enabled = p_enabled,
      activation_sha = case when p_enabled then lower(trim(p_head_sha)) else null end,
      activated_at = case when p_enabled then now() else null end,
      activated_by = case when p_enabled then 'pre_g30_service_role_control' else null end,
      reason = p_reason,
      updated_at = now()
  where policy_key = 'customer_start'
  returning * into v_policy;
  if not found then raise exception 'adaptive_activation_policy_missing'; end if;
  insert into public.audit_logs(actor_type, entity_table, action, after_json)
  values ('system', 'adaptive_activation_policies', 'adaptive_staging_activation_changed',
    jsonb_build_object('policy_key', v_policy.policy_key, 'enabled', v_policy.enabled,
      'environment', v_policy.environment, 'supabase_project', v_policy.supabase_project,
      'graph_version', v_policy.graph_version, 'graph_fingerprint', v_policy.graph_fingerprint,
      'activation_sha', v_policy.activation_sha, 'reason', v_policy.reason));
  return to_jsonb(v_policy);
end;
$$;

revoke all on function public.set_adaptive_staging_activation(boolean, text, text) from public, anon, authenticated, service_role;
grant execute on function public.set_adaptive_staging_activation(boolean, text, text) to service_role;

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
  update public.phase14_security_gates
  set reason = 'PRE-G30 Staging AI authority for PR #52 final successor SHA ' || lower(trim(p_head_sha)) || '; deterministic scoring remains authoritative; Production untouched.'
  where gate_key = 'phase14-premium-report';
  update public.phase14_feature_policies
  set reason = 'PRE-G30 Staging AI narrative authority for PR #52 final successor SHA ' || lower(trim(p_head_sha)) || '; provider openai, model openai/gpt-5.5, Preview only.',
      updated_at = now()
  where policy_key = 'ai_narrative';
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

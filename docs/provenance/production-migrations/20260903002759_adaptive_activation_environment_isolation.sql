-- Environment-isolate adaptive customer_start activation.
--
-- Root cause closed by this migration:
-- Preview and Production previously shared a single row keyed only by policy_key. Any Preview
-- certification call to set_adaptive_activation('preview', ...) rewrote the Production binding
-- and immediately caused Production adaptive activation and signed readiness to fail.
--
-- The policy identity is now (policy_key, environment). Preview and Production can be rebound
-- independently without mutating each other's release authority.

begin;

alter table public.adaptive_activation_policies
  drop constraint if exists adaptive_activation_policies_pkey;

alter table public.adaptive_activation_policies
  add constraint adaptive_activation_policies_pkey
  primary key (policy_key, environment);

-- Historical replay may arrive with only Preview; live Production may arrive with only Production.
-- Seed the missing counterpart disabled. Operator activation remains explicit and audited.
insert into public.adaptive_activation_policies(
  policy_key, environment, supabase_project, graph_version, graph_fingerprint,
  enabled, activation_sha, activated_at, activated_by, reason, created_at, updated_at
)
select
  policy_key,
  'preview',
  supabase_project,
  graph_version,
  graph_fingerprint,
  false,
  null,
  null,
  null,
  'Environment-isolated Preview policy created disabled; explicit Preview activation required.',
  now(),
  now()
from public.adaptive_activation_policies
where policy_key = 'customer_start'
  and environment = 'production'
on conflict (policy_key, environment) do nothing;

insert into public.adaptive_activation_policies(
  policy_key, environment, supabase_project, graph_version, graph_fingerprint,
  enabled, activation_sha, activated_at, activated_by, reason, created_at, updated_at
)
select
  policy_key,
  'production',
  supabase_project,
  graph_version,
  graph_fingerprint,
  false,
  null,
  null,
  null,
  'Environment-isolated Production policy created disabled; explicit Production activation required.',
  now(),
  now()
from public.adaptive_activation_policies
where policy_key = 'customer_start'
  and environment = 'preview'
on conflict (policy_key, environment) do nothing;

do $$
begin
  if (select count(*) from public.adaptive_activation_policies where policy_key = 'customer_start') <> 2
     or not exists (
       select 1 from public.adaptive_activation_policies
       where policy_key = 'customer_start' and environment = 'preview'
     )
     or not exists (
       select 1 from public.adaptive_activation_policies
       where policy_key = 'customer_start' and environment = 'production'
     ) then
    raise exception 'adaptive_activation_environment_isolation_seed_failed';
  end if;
end;
$$;

create or replace function public.set_adaptive_activation(
  p_environment text,
  p_supabase_project text,
  p_enabled boolean,
  p_head_sha text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_project text := lower(trim(coalesce(p_supabase_project, '')));
  v_head_sha text := lower(trim(coalesce(p_head_sha, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_policy public.adaptive_activation_policies%rowtype;
  v_graph public.adaptive_graph_versions%rowtype;
begin
  if v_environment not in ('preview', 'production') then
    raise exception 'adaptive_activation_environment_invalid';
  end if;
  if v_project !~ '^[a-z0-9]{20}$' then
    raise exception 'adaptive_activation_project_invalid';
  end if;
  if v_head_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'adaptive_activation_sha_invalid';
  end if;
  if v_reason = '' then
    raise exception 'adaptive_activation_reason_required';
  end if;
  if p_enabled is null then
    raise exception 'adaptive_activation_enabled_required';
  end if;

  select * into v_policy
  from public.adaptive_activation_policies
  where policy_key = 'customer_start'
    and environment = v_environment
  for update;
  if not found then
    raise exception 'adaptive_activation_policy_missing';
  end if;

  if not (
    (v_policy.graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804'
      and v_policy.graph_fingerprint = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab')
    or
    (v_policy.graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
      and v_policy.graph_fingerprint = '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7')
  ) then
    raise exception 'adaptive_activation_graph_binding_invalid';
  end if;

  select * into v_graph
  from public.adaptive_graph_versions
  where graph_version = v_policy.graph_version
    and graph_fingerprint = v_policy.graph_fingerprint;
  if not found or v_graph.status <> 'published' then
    raise exception 'adaptive_graph_must_be_published';
  end if;
  if v_graph.compiled_graph_json->>'graphVersion' is distinct from v_graph.graph_version
     or v_graph.compiled_graph_json->>'methodologyVersion' is distinct from v_graph.methodology_version
     or v_graph.compiled_graph_json->>'graphFingerprint' is distinct from v_graph.graph_fingerprint then
    raise exception 'adaptive_graph_identity_mismatch';
  end if;

  update public.adaptive_activation_policies
  set supabase_project = v_project,
      enabled = p_enabled,
      activation_sha = case when p_enabled then v_head_sha else null end,
      activated_at = case when p_enabled then now() else null end,
      activated_by = case when p_enabled then 'rc2_service_role_control' else null end,
      reason = v_reason,
      updated_at = now()
  where policy_key = 'customer_start'
    and environment = v_environment
  returning * into v_policy;

  insert into public.audit_logs(actor_type, entity_table, action, after_json)
  values (
    'system',
    'adaptive_activation_policies',
    'adaptive_activation_changed',
    jsonb_build_object(
      'policy_key', v_policy.policy_key,
      'enabled', v_policy.enabled,
      'environment', v_policy.environment,
      'supabase_project', v_policy.supabase_project,
      'graph_version', v_policy.graph_version,
      'graph_fingerprint', v_policy.graph_fingerprint,
      'activation_sha', v_policy.activation_sha,
      'reason', v_policy.reason
    )
  );

  return to_jsonb(v_policy);
end;
$$;

revoke all on function public.set_adaptive_activation(text, text, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_adaptive_activation(text, text, boolean, text, text)
  to service_role;

create or replace function public.set_adaptive_staging_activation(
  p_enabled boolean,
  p_head_sha text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_graph public.adaptive_graph_versions%rowtype;
begin
  select * into v_graph
  from public.adaptive_graph_versions
  where graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
    and graph_fingerprint = '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7';
  if not found or v_graph.status <> 'published' then
    raise exception 'adaptive_v12_graph_must_be_published';
  end if;

  update public.adaptive_activation_policies
  set graph_version = v_graph.graph_version,
      graph_fingerprint = v_graph.graph_fingerprint,
      updated_at = now()
  where policy_key = 'customer_start'
    and environment = 'preview';
  if not found then
    raise exception 'adaptive_activation_policy_missing';
  end if;

  return public.set_adaptive_activation(
    'preview',
    'iszihmmbgsfefawqmnwo',
    p_enabled,
    p_head_sha,
    p_reason
  );
end;
$$;

revoke all on function public.set_adaptive_staging_activation(boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_adaptive_staging_activation(boolean, text, text)
  to service_role;

comment on table public.adaptive_activation_policies is
  'Environment-isolated adaptive activation authority. Preview and Production bindings are independent rows keyed by (policy_key, environment).';

comment on function public.set_adaptive_activation(text, text, boolean, text, text) is
  'Fail-closed adaptive activation bound to one environment row, Supabase project, exact graph identity and deployment SHA; service-role only.';

commit;

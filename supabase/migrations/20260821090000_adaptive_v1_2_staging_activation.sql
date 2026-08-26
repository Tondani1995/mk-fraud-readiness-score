-- V1.2 owner-approved adaptive candidate: Preview/Staging activation authority only.
-- This migration does not activate the graph or change any existing assessment. The
-- candidate is registered through register_adaptive_staging_candidate(...) as a draft,
-- published through publish_adaptive_graph_version(...), and activated separately through
-- set_adaptive_staging_activation(...).

begin;

alter table public.adaptive_activation_policies
  drop constraint if exists adaptive_activation_policies_graph_version_check,
  drop constraint if exists adaptive_activation_policies_graph_fingerprint_check1;

alter table public.adaptive_activation_policies
  add constraint adaptive_activation_policies_graph_binding_check check (
    (graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804'
      and graph_fingerprint = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab')
    or
    (graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
      and graph_fingerprint = '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7')
  );

-- Register the reviewed graph and its matching methodology rows without granting direct
-- service-role table writes. The caller supplies the exact reviewed JSON; the function checks
-- the immutable version/fingerprint/count contract before inserting a draft row.
create or replace function public.register_adaptive_staging_candidate(
  p_graph jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_graph_version constant text := 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821';
  v_graph_fingerprint constant text := '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7';
  v_methodology_version constant text := 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION';
  v_methodology_id uuid;
  v_graph public.adaptive_graph_versions%rowtype;
  v_existing public.adaptive_graph_versions%rowtype;
begin
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    raise exception 'adaptive_candidate_graph_object_required';
  end if;
  if p_graph->>'graphVersion' <> v_graph_version
    or p_graph->>'graphFingerprint' <> v_graph_fingerprint
    or p_graph->>'methodologyVersion' <> v_methodology_version then
    raise exception 'adaptive_candidate_graph_binding_mismatch';
  end if;
  if p_graph->>'status' <> 'draft_candidate'
    or coalesce((p_graph->'graphInvariants'->>'customerRoutingEnabled')::boolean, true) then
    raise exception 'adaptive_candidate_must_be_draft_only';
  end if;
  if jsonb_array_length(coalesce(p_graph->'gateways', '[]'::jsonb)) <> 17
    or jsonb_array_length(coalesce(p_graph->'questions', '[]'::jsonb)) <> 68
    or jsonb_array_length(coalesce(p_graph->'oversightVariants', '[]'::jsonb)) <> 8 then
    raise exception 'adaptive_candidate_shape_mismatch';
  end if;
  if not exists (
    select 1 from public.adaptive_graph_versions
    where graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804'
      and graph_fingerprint = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab'
      and status = 'published'
  ) then
    raise exception 'adaptive_v11_published_baseline_required';
  end if;

  insert into public.methodology_versions(version_code, title, status, approved_at)
  values (v_methodology_version, 'MK Fraud Readiness V1.2 Adaptive Candidate', 'approved', now())
  on conflict (version_code) do nothing;
  select id into v_methodology_id
  from public.methodology_versions
  where version_code = v_methodology_version;
  if v_methodology_id is null then raise exception 'adaptive_candidate_methodology_missing'; end if;

  insert into public.response_scale(
    methodology_version_id, response_value, label, operational_meaning, normalised_score, display_order
  )
  select v_methodology_id, (item->>'responseValue')::smallint, item->>'label', item->>'operationalMeaning',
    (item->>'normalisedScore')::numeric, ordinality::integer - 1
  from jsonb_array_elements(p_graph->'responseScale') with ordinality as scale(item, ordinality)
  on conflict (methodology_version_id, response_value) do update set
    label = excluded.label,
    operational_meaning = excluded.operational_meaning,
    normalised_score = excluded.normalised_score,
    display_order = excluded.display_order;

  insert into public.domains(methodology_version_id, domain_code, name, weight_pct, domain_type, is_core, sort_order)
  select v_methodology_id, item->>'domainCode', item->>'name', (item->>'weightPct')::numeric,
    coalesce(item->>'domainType', 'core'), coalesce((item->>'isCore')::boolean, true), (item->>'sortOrder')::integer
  from jsonb_array_elements(p_graph->'domains') as domain(item)
  on conflict (methodology_version_id, domain_code) do update set
    name = excluded.name,
    weight_pct = excluded.weight_pct,
    domain_type = excluded.domain_type,
    is_core = excluded.is_core,
    sort_order = excluded.sort_order;

  insert into public.questions(
    methodology_version_id, domain_id, question_code, prompt, help_text, weight,
    is_critical, is_hard_gate, n_a_allowed, sort_order, active
  )
  select v_methodology_id, d.id, item->>'questionCode', item->>'prompt', item->>'controlObjective',
    (item->>'weight')::numeric, coalesce((item->>'isCritical')::boolean, false),
    coalesce((item->>'isHardGate')::boolean, false), false, (item->>'sortOrder')::integer, true
  from jsonb_array_elements(p_graph->'questions') as question(item)
  join public.domains d on d.methodology_version_id = v_methodology_id
    and d.domain_code = item->>'domainCode'
  on conflict (methodology_version_id, question_code) do update set
    domain_id = excluded.domain_id,
    prompt = excluded.prompt,
    help_text = excluded.help_text,
    weight = excluded.weight,
    is_critical = excluded.is_critical,
    is_hard_gate = excluded.is_hard_gate,
    n_a_allowed = excluded.n_a_allowed,
    sort_order = excluded.sort_order,
    active = excluded.active;

  select * into v_existing
  from public.adaptive_graph_versions
  where graph_version = v_graph_version
  for update;
  if found then
    if v_existing.graph_fingerprint <> v_graph_fingerprint
      or v_existing.compiled_graph_json <> p_graph
      or v_existing.methodology_version_id <> v_methodology_id then
      raise exception 'adaptive_candidate_existing_row_mismatch';
    end if;
    return jsonb_build_object(
      'ok', true, 'inserted', false, 'graph_version', v_existing.graph_version,
      'graph_fingerprint', v_existing.graph_fingerprint, 'status', v_existing.status,
      'methodology_version_id', v_existing.methodology_version_id,
      'question_count', v_existing.question_count, 'gateway_count', v_existing.gateway_count,
      'oversight_variant_count', v_existing.oversight_variant_count
    );
  end if;

  insert into public.adaptive_graph_versions(
    graph_version, methodology_version_id, methodology_version, status, compiled_graph_json,
    graph_fingerprint, question_count, gateway_count, oversight_variant_count, provenance,
    supersedes_graph_version
  ) values (
    v_graph_version, v_methodology_id, v_methodology_version, 'draft', p_graph,
    v_graph_fingerprint, 68, 17, 8, p_graph->>'provenance',
    'MFRS-V1.1-ADAPTIVE-DRAFT-20260804'
  ) returning * into v_graph;

  return jsonb_build_object(
    'ok', true, 'inserted', true, 'graph_version', v_graph.graph_version,
    'graph_fingerprint', v_graph.graph_fingerprint, 'status', v_graph.status,
    'methodology_version_id', v_graph.methodology_version_id,
    'question_count', v_graph.question_count, 'gateway_count', v_graph.gateway_count,
    'oversight_variant_count', v_graph.oversight_variant_count
  );
end;
$$;

revoke all on function public.register_adaptive_staging_candidate(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.register_adaptive_staging_candidate(jsonb) to service_role;

-- Keep the existing three-argument operational control, but bind it to the approved V1.2
-- candidate. It still records the exact deployed SHA and an audit row, and it can only update
-- the Preview/Staging customer_start policy row.
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
  where graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
    and graph_fingerprint = '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7';
  if not found or v_graph.status <> 'published' then raise exception 'adaptive_v12_graph_must_be_published'; end if;
  perform set_config('phase14.authoritative_transition', 'policy_approval', true);
  update public.adaptive_activation_policies
  set graph_version = v_graph.graph_version,
      graph_fingerprint = v_graph.graph_fingerprint,
      enabled = p_enabled,
      activation_sha = case when p_enabled then lower(trim(p_head_sha)) else null end,
      activated_at = case when p_enabled then now() else null end,
      activated_by = case when p_enabled then 'v1_2_staging_service_role_control' else null end,
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

commit;

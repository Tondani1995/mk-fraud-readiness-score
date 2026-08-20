-- Run read-only after the additive G24 migration on Staging.
select version_code, status from public.methodology_versions where version_code = 'MFRS-V1.1';
select graph_version, status, methodology_version, question_count, gateway_count, oversight_variant_count, graph_fingerprint
from public.adaptive_graph_versions where graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
select assessment_mode, count(*) from public.assessments group by assessment_mode order by assessment_mode;
select count(*) as guidance_count, count(distinct question_code) as distinct_question_count
from public.assessment_evidence_guidance where guidance_version = 'MFRS-V1.1-G28-20260804';
select table_name, has_table_privilege('anon', format('public.%s', table_name), 'select') as anon_select,
       has_table_privilege('authenticated', format('public.%s', table_name), 'select') as authenticated_select
from (values ('adaptive_graph_versions'), ('assessment_navigation_states'), ('assessment_answer_history'), ('assessment_applicability_profiles'), ('assessment_integrity_signals'), ('assessment_evidence_guidance')) as t(table_name);

do $$
declare
  v_graph_count integer;
  v_guidance_count integer;
  v_legacy_nonzero integer;
  v_routing_enabled boolean;
begin
  select count(*) into v_graph_count
  from public.adaptive_graph_versions
  where graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804'
    and status = 'draft'
    and question_count = 68
    and gateway_count = 14
    and oversight_variant_count = 6;
  if v_graph_count <> 1 then raise exception 'G24 graph verification failed'; end if;

  select count(*) into v_guidance_count
  from public.assessment_evidence_guidance
  where guidance_version = 'MFRS-V1.1-G28-20260804'
    and status = 'draft'
    and jsonb_array_length(example_artifacts) between 2 and 4;
  if v_guidance_count <> 68 then raise exception 'G28 guidance verification failed: %', v_guidance_count; end if;

  select count(*) into v_legacy_nonzero from public.assessments where assessment_mode <> 'legacy_fixed';
  if v_legacy_nonzero <> 0 then raise exception 'legacy assessment mode changed'; end if;

  select coalesce((compiled_graph_json->'graphInvariants'->>'customerRoutingEnabled')::boolean, true)
    into v_routing_enabled
  from public.adaptive_graph_versions
  where graph_version = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
  if v_routing_enabled then raise exception 'adaptive customer routing unexpectedly enabled'; end if;
end $$;

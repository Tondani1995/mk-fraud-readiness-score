-- G27 adaptive scoring integration.
-- Additive only: the legacy scorer and its fixed-question contract are unchanged.

begin;

alter table public.score_runs
  add column if not exists adaptive_result_status text
    check (adaptive_result_status is null or adaptive_result_status in ('NORMAL','PROVISIONAL','INSUFFICIENT_VISIBILITY'));
alter table public.score_runs add column if not exists adaptive_metrics_json jsonb not null default '{}'::jsonb;
alter table public.score_runs add column if not exists adaptive_graph_version_id uuid references public.adaptive_graph_versions(id);
alter table public.score_runs add column if not exists adaptive_graph_version_snapshot text;
alter table public.score_runs add column if not exists adaptive_graph_fingerprint_snapshot text;

create index if not exists score_runs_adaptive_status_idx
  on public.score_runs(adaptive_result_status)
  where adaptive_result_status is not null;

create or replace function public.complete_adaptive_score_run_atomic(
  p_assessment_id uuid,
  p_methodology_version_id uuid,
  p_graph_version_id uuid,
  p_graph_version_snapshot text,
  p_graph_fingerprint_snapshot text,
  p_run_type public.score_run_type,
  p_input_hash text,
  p_created_by_user_id uuid,
  p_result_status text,
  p_summary jsonb,
  p_metrics jsonb,
  p_domain_results jsonb,
  p_question_traces jsonb,
  p_cap_events jsonb default '[]'::jsonb
) returns table(score_run_id uuid, run_number int)
language plpgsql
security definer
set search_path = public
as $complete_adaptive_score_run_atomic$
declare
  v_assessment record;
  v_score_run_id uuid;
  v_run_number int;
  v_rec jsonb;
  v_now timestamptz := now();
begin
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  if p_input_hash is null or length(p_input_hash) < 32 then
    raise exception 'Adaptive score run requires a deterministic input hash.';
  end if;
  if p_result_status not in ('NORMAL','PROVISIONAL','INSUFFICIENT_VISIBILITY') then
    raise exception 'Adaptive result status is invalid.';
  end if;

  select a.* into v_assessment
  from public.assessments a
  where a.id = p_assessment_id
  for update;
  if not found then raise exception 'Assessment not found.'; end if;
  if v_assessment.assessment_mode <> 'adaptive' then raise exception 'Adaptive assessment required.'; end if;
  if v_assessment.methodology_version_id <> p_methodology_version_id then
    raise exception 'Assessment methodology version does not match scoring request.';
  end if;
  if v_assessment.graph_version_id <> p_graph_version_id
     or v_assessment.graph_version_snapshot is distinct from p_graph_version_snapshot
     or v_assessment.graph_fingerprint_snapshot is distinct from p_graph_fingerprint_snapshot then
    raise exception 'Adaptive graph pin does not match the assessment.';
  end if;
  if v_assessment.status not in ('submitted','scored','snapshot_available','report_requested') then
    raise exception 'Assessment status is not scorable: %.', v_assessment.status;
  end if;
  if p_run_type = 'initial' and v_assessment.current_score_run_id is not null then
    raise exception 'Initial adaptive score run already exists for this assessment.';
  end if;

  select coalesce(max(sr.run_number), 0) + 1 into v_run_number
  from public.score_runs sr where sr.assessment_id = p_assessment_id;

  insert into public.score_runs(
    assessment_id, methodology_version_id, run_number, run_type, status,
    input_hash, created_by_user_id, adaptive_result_status, adaptive_metrics_json,
    adaptive_graph_version_id, adaptive_graph_version_snapshot, adaptive_graph_fingerprint_snapshot
  ) values (
    p_assessment_id, p_methodology_version_id, v_run_number, p_run_type, 'draft',
    p_input_hash, p_created_by_user_id, p_result_status, coalesce(p_metrics, '{}'::jsonb),
    p_graph_version_id, p_graph_version_snapshot, p_graph_fingerprint_snapshot
  ) returning id into v_score_run_id;

  for v_rec in select value from jsonb_array_elements(coalesce(p_domain_results, '[]'::jsonb)) loop
    if not exists (
      select 1 from public.domains d
      where d.id = nullif(v_rec->>'domain_id','')::uuid
        and d.methodology_version_id = p_methodology_version_id
    ) then raise exception 'Adaptive domain result is outside the score-run methodology.'; end if;
    insert into public.score_domain_results(
      score_run_id, domain_id, raw_score, weighted_contribution, coverage_pct,
      critical_gap_count, flags_json
    ) values (
      v_score_run_id, (v_rec->>'domain_id')::uuid,
      nullif(v_rec->>'raw_score','')::numeric,
      nullif(v_rec->>'weighted_contribution','')::numeric,
      nullif(v_rec->>'coverage_pct','')::numeric,
      coalesce((v_rec->>'critical_gap_count')::int, 0),
      jsonb_build_object('flags', coalesce(v_rec->'flags', '[]'::jsonb))
    );
  end loop;

  for v_rec in select value from jsonb_array_elements(coalesce(p_question_traces, '[]'::jsonb)) loop
    if not exists (
      select 1 from public.questions q
      where q.id = nullif(v_rec->>'question_id','')::uuid
        and q.methodology_version_id = p_methodology_version_id
        and q.active = true
    ) then raise exception 'Adaptive question trace is outside the score-run methodology.'; end if;
    insert into public.score_question_traces(
      score_run_id, question_id, answer_id, response_value, normalised_score,
      question_weight, applicable, numerator_contribution, denominator_contribution,
      is_critical_gap, is_major_gap, triggered_rules
    ) values (
      v_score_run_id, (v_rec->>'question_id')::uuid, null,
      nullif(v_rec->>'response_value','')::smallint,
      nullif(v_rec->>'normalised_score','')::numeric,
      nullif(v_rec->>'question_weight','')::numeric,
      coalesce((v_rec->>'applicable')::boolean, true),
      coalesce(nullif(v_rec->>'numerator_contribution','')::numeric, 0),
      coalesce(nullif(v_rec->>'denominator_contribution','')::numeric, 0),
      coalesce((v_rec->>'is_critical_gap')::boolean, false),
      coalesce((v_rec->>'is_major_gap')::boolean, false),
      coalesce(v_rec->'triggered_rules', '[]'::jsonb)
    );
  end loop;

  for v_rec in select value from jsonb_array_elements(coalesce(p_cap_events, '[]'::jsonb)) loop
    insert into public.maturity_cap_events(
      score_run_id, rule_code, cap_to, reason, related_question_id, related_domain_id
    ) values (
      v_score_run_id, v_rec->>'rule_code', (v_rec->>'cap_to')::public.maturity_band,
      v_rec->>'reason', nullif(v_rec->>'related_question_id','')::uuid,
      nullif(v_rec->>'related_domain_id','')::uuid
    );
  end loop;

  update public.score_runs set
    status = 'completed',
    overall_score = nullif(p_summary->>'overall_score','')::numeric,
    calculated_maturity = nullif(p_summary->>'calculated_maturity','')::public.maturity_band,
    final_maturity = nullif(p_summary->>'final_maturity','')::public.maturity_band,
    exposure_score = nullif(p_summary->>'exposure_score','')::numeric,
    exposure_band = nullif(p_summary->>'exposure_band','')::public.exposure_band,
    coverage_pct = nullif(p_summary->>'coverage_pct','')::numeric,
    n_a_rate_pct = nullif(p_summary->>'n_a_rate_pct','')::numeric,
    critical_gap_count = coalesce((p_summary->>'critical_gap_count')::int, 0),
    major_gap_count = coalesce((p_summary->>'major_gap_count')::int, 0),
    cap_applied = coalesce((p_summary->>'cap_applied')::boolean, false),
    cap_reason = p_summary->>'cap_reason',
    locked_at = v_now
  where id = v_score_run_id and status = 'draft';
  if not found then raise exception 'Unable to complete adaptive score run atomically.'; end if;

  update public.assessments set status = 'scored', current_score_run_id = v_score_run_id, updated_at = v_now
  where id = p_assessment_id and status in ('submitted','scored','snapshot_available','report_requested');
  if not found then raise exception 'Unable to update assessment with adaptive score run.'; end if;

  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'system', p_created_by_user_id, p_assessment_id, 'score_runs', v_score_run_id,
    'g27_adaptive_score_run_completed',
    jsonb_build_object('run_number', v_run_number, 'result_status', p_result_status,
      'overall_score', p_summary->>'overall_score', 'final_maturity', p_summary->>'final_maturity',
      'coverage_pct', p_summary->>'coverage_pct', 'adaptive', true)
  );

  score_run_id := v_score_run_id;
  run_number := v_run_number;
  return next;
end;
$complete_adaptive_score_run_atomic$;

revoke all on function public.complete_adaptive_score_run_atomic(uuid,uuid,uuid,text,text,public.score_run_type,text,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_adaptive_score_run_atomic(uuid,uuid,uuid,text,text,public.score_run_type,text,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

commit;

-- MK Fraud Readiness Score V1 - Phase 6 v1.1 Atomic Scoring Repair
-- Run after 0001 to 0005 in Supabase dev.
-- Purpose: remove partial-score-run risk by persisting score run, traces, cap events, assessment status and audit log through one transactional RPC.

begin;

-- Strengthen trace identity rules for any direct writes as well as the atomic RPC.
create or replace function public.guard_score_trace_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_assessment_id uuid;
  parent_methodology_version_id uuid;
  question_methodology_version_id uuid;
  answer_assessment_id uuid;
  answer_question_id uuid;
  domain_methodology_version_id uuid;
  cap_question_methodology_version_id uuid;
  cap_domain_methodology_version_id uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select assessment_id, methodology_version_id
    into parent_assessment_id, parent_methodology_version_id
  from public.score_runs
  where id = new.score_run_id;

  if parent_assessment_id is null then
    raise exception 'Parent score run not found for trace integrity check.';
  end if;

  if tg_table_name = 'score_domain_results' then
    select methodology_version_id into domain_methodology_version_id
    from public.domains
    where id = new.domain_id;

    if domain_methodology_version_id is null or domain_methodology_version_id <> parent_methodology_version_id then
      raise exception 'Score domain result must belong to the same methodology version as the score run.';
    end if;
  elsif tg_table_name = 'score_question_traces' then
    select methodology_version_id into question_methodology_version_id
    from public.questions
    where id = new.question_id;

    if question_methodology_version_id is null or question_methodology_version_id <> parent_methodology_version_id then
      raise exception 'Score question trace must belong to the same methodology version as the score run.';
    end if;

    if new.answer_id is not null then
      select assessment_id, question_id into answer_assessment_id, answer_question_id
      from public.assessment_answers
      where id = new.answer_id;

      if answer_assessment_id is null then
        raise exception 'Trace answer_id does not exist.';
      end if;

      if answer_assessment_id <> parent_assessment_id then
        raise exception 'Trace answer_id must belong to the same assessment as the score run.';
      end if;

      if answer_question_id <> new.question_id then
        raise exception 'Trace answer_id must belong to the traced question.';
      end if;
    end if;
  elsif tg_table_name = 'maturity_cap_events' then
    if new.related_question_id is not null then
      select methodology_version_id into cap_question_methodology_version_id
      from public.questions
      where id = new.related_question_id;

      if cap_question_methodology_version_id is null or cap_question_methodology_version_id <> parent_methodology_version_id then
        raise exception 'Maturity cap related question must belong to the same methodology version as the score run.';
      end if;
    end if;

    if new.related_domain_id is not null then
      select methodology_version_id into cap_domain_methodology_version_id
      from public.domains
      where id = new.related_domain_id;

      if cap_domain_methodology_version_id is null or cap_domain_methodology_version_id <> parent_methodology_version_id then
        raise exception 'Maturity cap related domain must belong to the same methodology version as the score run.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_score_domain_results_identity on public.score_domain_results;
create trigger trg_score_domain_results_identity
before insert or update on public.score_domain_results
for each row execute function public.guard_score_trace_identity();

drop trigger if exists trg_score_question_traces_identity on public.score_question_traces;
create trigger trg_score_question_traces_identity
before insert or update on public.score_question_traces
for each row execute function public.guard_score_trace_identity();

drop trigger if exists trg_maturity_cap_events_identity on public.maturity_cap_events;
create trigger trg_maturity_cap_events_identity
before insert or update on public.maturity_cap_events
for each row execute function public.guard_score_trace_identity();

create or replace function public.complete_score_run_atomic(
  p_assessment_id uuid,
  p_methodology_version_id uuid,
  p_run_type public.score_run_type,
  p_input_hash text,
  p_created_by_user_id uuid,
  p_summary jsonb,
  p_domain_results jsonb,
  p_question_traces jsonb,
  p_cap_events jsonb default '[]'::jsonb
)
returns table(score_run_id uuid, run_number int)
language plpgsql
security definer
set search_path = public
as $complete_score_run_atomic$
declare
  v_assessment record;
  v_score_run_id uuid;
  v_run_number int;
  v_expected_question_count int;
  v_expected_domain_count int;
  v_question_trace_count int;
  v_domain_result_count int;
  v_rec jsonb;
  v_question_id uuid;
  v_answer_id uuid;
  v_domain_id uuid;
  v_related_question_id uuid;
  v_related_domain_id uuid;
  v_now timestamptz := now();
begin
  if p_input_hash is null or length(p_input_hash) < 32 then
    raise exception 'Atomic score run requires a deterministic input hash.';
  end if;

  select id, methodology_version_id, status, current_score_run_id
    into v_assessment
  from public.assessments
  where id = p_assessment_id
  for update;

  if not found then
    raise exception 'Assessment not found.';
  end if;

  if v_assessment.methodology_version_id <> p_methodology_version_id then
    raise exception 'Assessment methodology version does not match scoring request.';
  end if;

  if v_assessment.status not in ('submitted','scored') then
    raise exception 'Assessment status is not scorable: %.', v_assessment.status;
  end if;

  if p_run_type = 'initial' and v_assessment.current_score_run_id is not null then
    raise exception 'Initial score run already exists for this assessment.';
  end if;

  if (p_summary->>'overall_score') is null
     or (p_summary->>'calculated_maturity') is null
     or (p_summary->>'final_maturity') is null then
    raise exception 'Atomic score summary requires score and maturity values.';
  end if;

  if coalesce((p_summary->>'coverage_pct')::numeric, 0) < 80 then
    raise exception 'Atomic score run requires coverage of at least 80 percent.';
  end if;

  select count(*) into v_expected_question_count
  from public.questions
  where methodology_version_id = p_methodology_version_id and active = true;

  select count(*) into v_expected_domain_count
  from public.domains
  where methodology_version_id = p_methodology_version_id;

  v_question_trace_count := jsonb_array_length(coalesce(p_question_traces, '[]'::jsonb));
  v_domain_result_count := jsonb_array_length(coalesce(p_domain_results, '[]'::jsonb));

  if v_question_trace_count <> v_expected_question_count then
    raise exception 'Question trace count mismatch. Expected %, got %.', v_expected_question_count, v_question_trace_count;
  end if;

  if v_domain_result_count <> v_expected_domain_count then
    raise exception 'Domain result count mismatch. Expected %, got %.', v_expected_domain_count, v_domain_result_count;
  end if;

  select coalesce(max(sr.run_number), 0) + 1
    into v_run_number
  from public.score_runs sr
  where sr.assessment_id = p_assessment_id;

  insert into public.score_runs (
    assessment_id,
    methodology_version_id,
    run_number,
    run_type,
    status,
    input_hash,
    created_by_user_id
  ) values (
    p_assessment_id,
    p_methodology_version_id,
    v_run_number,
    p_run_type,
    'draft',
    p_input_hash,
    p_created_by_user_id
  ) returning id into v_score_run_id;

  for v_rec in select value from jsonb_array_elements(coalesce(p_domain_results, '[]'::jsonb)) loop
    v_domain_id := (v_rec->>'domain_id')::uuid;

    if not exists (
      select 1 from public.domains d
      where d.id = v_domain_id and d.methodology_version_id = p_methodology_version_id
    ) then
      raise exception 'Domain result contains a domain outside the score-run methodology.';
    end if;

    insert into public.score_domain_results (
      score_run_id,
      domain_id,
      raw_score,
      weighted_contribution,
      coverage_pct,
      critical_gap_count,
      flags_json
    ) values (
      v_score_run_id,
      v_domain_id,
      nullif(v_rec->>'raw_score','')::numeric,
      nullif(v_rec->>'weighted_contribution','')::numeric,
      nullif(v_rec->>'coverage_pct','')::numeric,
      coalesce((v_rec->>'critical_gap_count')::int, 0),
      jsonb_build_object('flags', coalesce(v_rec->'flags', '[]'::jsonb))
    );
  end loop;

  for v_rec in select value from jsonb_array_elements(coalesce(p_question_traces, '[]'::jsonb)) loop
    v_question_id := (v_rec->>'question_id')::uuid;
    v_answer_id := nullif(v_rec->>'answer_id','')::uuid;

    if not exists (
      select 1 from public.questions q
      where q.id = v_question_id and q.methodology_version_id = p_methodology_version_id and q.active = true
    ) then
      raise exception 'Question trace contains a question outside the score-run methodology.';
    end if;

    if v_answer_id is null then
      raise exception 'Completed atomic score traces require an answer_id for every active question.';
    end if;

    if not exists (
      select 1
      from public.assessment_answers aa
      where aa.id = v_answer_id
        and aa.assessment_id = p_assessment_id
        and aa.question_id = v_question_id
    ) then
      raise exception 'Question trace answer does not belong to this assessment and question.';
    end if;

    insert into public.score_question_traces (
      score_run_id,
      question_id,
      answer_id,
      response_value,
      normalised_score,
      question_weight,
      applicable,
      numerator_contribution,
      denominator_contribution,
      is_critical_gap,
      is_major_gap,
      triggered_rules
    ) values (
      v_score_run_id,
      v_question_id,
      v_answer_id,
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
    v_related_question_id := nullif(v_rec->>'related_question_id','')::uuid;
    v_related_domain_id := nullif(v_rec->>'related_domain_id','')::uuid;

    if v_related_question_id is not null and not exists (
      select 1 from public.questions q
      where q.id = v_related_question_id and q.methodology_version_id = p_methodology_version_id
    ) then
      raise exception 'Maturity cap event related question is outside the score-run methodology.';
    end if;

    if v_related_domain_id is not null and not exists (
      select 1 from public.domains d
      where d.id = v_related_domain_id and d.methodology_version_id = p_methodology_version_id
    ) then
      raise exception 'Maturity cap event related domain is outside the score-run methodology.';
    end if;

    insert into public.maturity_cap_events (
      score_run_id,
      rule_code,
      cap_to,
      reason,
      related_question_id,
      related_domain_id
    ) values (
      v_score_run_id,
      v_rec->>'rule_code',
      (v_rec->>'cap_to')::public.maturity_band,
      v_rec->>'reason',
      v_related_question_id,
      v_related_domain_id
    );
  end loop;

  update public.score_runs
  set
    status = 'completed',
    overall_score = (p_summary->>'overall_score')::numeric,
    calculated_maturity = (p_summary->>'calculated_maturity')::public.maturity_band,
    final_maturity = (p_summary->>'final_maturity')::public.maturity_band,
    exposure_score = (p_summary->>'exposure_score')::numeric,
    exposure_band = (p_summary->>'exposure_band')::public.exposure_band,
    coverage_pct = (p_summary->>'coverage_pct')::numeric,
    n_a_rate_pct = (p_summary->>'n_a_rate_pct')::numeric,
    critical_gap_count = coalesce((p_summary->>'critical_gap_count')::int, 0),
    major_gap_count = coalesce((p_summary->>'major_gap_count')::int, 0),
    cap_applied = coalesce((p_summary->>'cap_applied')::boolean, false),
    cap_reason = p_summary->>'cap_reason',
    locked_at = v_now
  where id = v_score_run_id and status = 'draft';

  if not found then
    raise exception 'Unable to complete draft score run atomically.';
  end if;

  update public.assessments
  set
    status = 'scored',
    current_score_run_id = v_score_run_id,
    updated_at = v_now
  where id = p_assessment_id
    and status in ('submitted','scored');

  if not found then
    raise exception 'Unable to update assessment with completed score run.';
  end if;

  insert into public.audit_logs (
    actor_type,
    actor_user_id,
    assessment_id,
    entity_table,
    entity_id,
    action,
    after_json
  ) values (
    'system',
    p_created_by_user_id,
    p_assessment_id,
    'score_runs',
    v_score_run_id,
    'phase6_v1_1_atomic_score_run_completed',
    jsonb_build_object(
      'run_number', v_run_number,
      'overall_score', p_summary->>'overall_score',
      'calculated_maturity', p_summary->>'calculated_maturity',
      'final_maturity', p_summary->>'final_maturity',
      'exposure_score', p_summary->>'exposure_score',
      'exposure_band', p_summary->>'exposure_band',
      'coverage_pct', p_summary->>'coverage_pct',
      'n_a_rate_pct', p_summary->>'n_a_rate_pct',
      'critical_gap_count', p_summary->>'critical_gap_count',
      'major_gap_count', p_summary->>'major_gap_count',
      'flags', coalesce(p_summary->'flags', '[]'::jsonb),
      'atomic', true
    )
  );

  score_run_id := v_score_run_id;
  run_number := v_run_number;
  return next;
end;
$complete_score_run_atomic$;

insert into public.app_settings (setting_key, value_json)
values
  ('phase6_v1_1_atomic_scoring', '{"atomic_rpc":"complete_score_run_atomic","trace_identity_guards":true,"direct_engine_tests":true,"critical_controls":19,"hard_gates":17,"partial_score_runs_prohibited":true}'::jsonb)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;

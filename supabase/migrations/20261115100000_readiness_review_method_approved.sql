-- The revised method is approved by MK (owner, 15 November 2026). Methodology versions cannot be changed once an
-- assessment uses them (prevent_methodology_mutation_after_use), so the approved method is a new version, and new
-- commercial bindings use it. Assessments bound earlier keep MK-READINESS-REVIEW-1.6 (draft), the version they were
-- bound under. 'approved', not 'active': the active method stays the scored MFRS method that new scored assessments
-- start with until the switch-over (DR-01).
insert into public.methodology_versions (version_code, title, status)
values ('MK-FRAUD-READINESS-1.0', 'MK Fraud Readiness method: staged review build 1.6 (review bank 1.3), scored with the MK Fraud Readiness score. Approved by MK on 15 November 2026.', 'approved')
on conflict (version_code) do nothing;

-- The bridge function, unchanged except for the methodology version it binds new assessments to and the wording of
-- the score run's reason. The run keeps its structural status (REVISED_UNSCORED, no stored score): the score is
-- calculated when a report is produced (src/lib/reports/revised/score.ts).
create or replace function public.review_bind_commercial_assessment(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing readiness_review.commercial_bindings%rowtype;
  v_session readiness_review.sessions%rowtype;
  v_methodology uuid;
  v_org uuid;
  v_respondent uuid;
  v_assessment uuid;
  v_run uuid;
  v_reference text;
  v_now timestamptz := now();
  v_attempt int := 0;
begin
  if not public.review_commercial_bridge_enabled() then
    raise exception 'review_commercial_bridge_disabled' using errcode = 'RV403';
  end if;

  select * into v_session from readiness_review.sessions where session_id = p ->> 'session_id' for update;
  if not found then
    raise exception 'review_session_not_found' using errcode = 'RV404';
  end if;
  if (p ->> 'action_count')::integer is distinct from v_session.action_count then
    raise exception 'review_log_moved' using errcode = 'RV409';
  end if;

  select * into v_existing from readiness_review.commercial_bindings where session_id = v_session.session_id;
  if found then
    if v_existing.log_digest = p ->> 'log_digest' and v_existing.input_digest = p ->> 'input_digest' then
      return jsonb_build_object('created', false, 'assessment_id', v_existing.assessment_id,
        'assessment_reference', (select assessment_reference from public.assessments where id = v_existing.assessment_id),
        'score_run_id', v_existing.score_run_id);
    end if;
    raise exception 'review_binding_exists_for_other_answers' using errcode = 'RV409';
  end if;

  select id into v_methodology from public.methodology_versions where version_code = 'MK-FRAUD-READINESS-1.0';
  if v_methodology is null then
    raise exception 'review_methodology_missing';
  end if;

  insert into public.organisations (legal_name, trading_name, industry, sector, country, province, employee_band)
  values (
    p #>> '{organisation,legal_name}', nullif(p #>> '{organisation,trading_name}', ''),
    nullif(p #>> '{organisation,industry}', ''), nullif(p #>> '{organisation,sector}', ''),
    coalesce(nullif(p #>> '{organisation,country}', ''), 'South Africa'), nullif(p #>> '{organisation,province}', ''),
    nullif(p #>> '{organisation,employee_band}', '')
  ) returning id into v_org;

  insert into public.respondents (organisation_id, full_name, email, role_title, consent_privacy, consent_research)
  values (v_org, p #>> '{respondent,full_name}', (p #>> '{respondent,email}')::public.citext,
    nullif(p #>> '{respondent,role_title}', ''), true, false)
  returning id into v_respondent;

  loop
    v_attempt := v_attempt + 1;
    v_reference := 'MKFRS-' || to_char(v_now, 'YYYY') || '-RV' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    begin
      insert into public.assessments (
        assessment_reference, organisation_id, primary_respondent_id, methodology_version_id, status,
        started_at, submitted_at, locked_at, completion_percentage, last_answer_saved_at, assessment_mode,
        graph_version_snapshot, terms_version, terms_accepted_at, privacy_notice_version, privacy_acknowledged_at
      ) values (
        v_reference, v_org, v_respondent, v_methodology, 'submitted',
        v_session.created_at, v_now, v_now, (p ->> 'completion_percentage')::integer, v_session.last_action_at, 'readiness_review',
        'review-engine-' || (p ->> 'engine_build'), p ->> 'terms_version', (p ->> 'terms_accepted_at')::timestamptz,
        p ->> 'privacy_notice_version', (p ->> 'terms_accepted_at')::timestamptz
      ) returning id into v_assessment;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;

  insert into public.score_runs (
    assessment_id, methodology_version_id, run_number, run_type, status, coverage_pct, n_a_rate_pct,
    critical_gap_count, major_gap_count, cap_applied, input_hash, locked_at, adaptive_result_status, adaptive_metrics_json
  ) values (
    v_assessment, v_methodology, 1, 'initial', 'completed', (p ->> 'coverage_pct')::numeric, null,
    0, 0, false, p ->> 'input_digest', v_now, 'REVISED_UNSCORED',
    jsonb_build_object(
      'kind', 'revised_unscored',
      'reason', 'The MK Fraud Readiness score is calculated from this bound answer log when a report is produced. This run records the log and holds no MFRS score.',
      'session_id', v_session.session_id, 'input_contract', p ->> 'input_contract', 'input_version', p ->> 'input_version',
      'input_digest', p ->> 'input_digest', 'log_digest', p ->> 'log_digest', 'action_count', (p ->> 'action_count')::integer,
      'engine_build', p ->> 'engine_build', 'outstanding_total', (p ->> 'outstanding_total')::integer,
      'interview_complete', (p ->> 'interview_complete')::boolean
    )
  ) returning id into v_run;

  update public.assessments set current_score_run_id = v_run, status = 'snapshot_available' where id = v_assessment;

  insert into readiness_review.commercial_bindings (
    session_id, assessment_id, score_run_id, input_contract, input_version, input_digest, log_digest, action_count,
    ruleset_key, engine_build, outstanding_total, interview_complete
  ) values (
    v_session.session_id, v_assessment, v_run, p ->> 'input_contract', p ->> 'input_version', p ->> 'input_digest',
    p ->> 'log_digest', (p ->> 'action_count')::integer, v_session.ruleset_key, p ->> 'engine_build',
    (p ->> 'outstanding_total')::integer, (p ->> 'interview_complete')::boolean
  );

  insert into public.audit_logs (actor_type, assessment_id, entity_table, entity_id, action, after_json)
  values ('system', v_assessment, 'assessments', v_assessment, 'readiness_review_commercial_binding',
    jsonb_build_object('session_id', v_session.session_id, 'input_digest', p ->> 'input_digest', 'log_digest', p ->> 'log_digest',
      'action_count', (p ->> 'action_count')::integer, 'assessment_reference', v_reference));

  return jsonb_build_object('created', true, 'assessment_id', v_assessment, 'assessment_reference', v_reference, 'score_run_id', v_run);
end;
$$;

revoke all on function public.review_bind_commercial_assessment(jsonb) from public, anon, authenticated;
grant execute on function public.review_bind_commercial_assessment(jsonb) to service_role;

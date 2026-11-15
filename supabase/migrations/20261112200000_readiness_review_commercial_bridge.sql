-- B5: the revised (staged review) assessment enters the existing commercial and report infrastructure.
--
-- A completed review session is bound, once, to an ordinary row in public.assessments (assessment_mode
-- 'readiness_review'), with an organisation, a respondent and a locked score_runs row that carries NO score
-- (adaptive_result_status 'REVISED_UNSCORED'). From there the existing paid-order route, payment confirmation,
-- generation attempts, private storage, finalisation and customer download apply unchanged. The binding records
-- which answer log (by digest and log position) the assessment stands for, so every report can be traced to, and
-- rebuilt from, the persisted responses.
--
-- No revised scoring method is approved (src/lib/scoring/methodology-dispatch.ts, REVISED_METHODOLOGY_STATUS), so
-- the revised score run is deliberately unscored. Its methodology version is recorded as 'draft'.
--
-- Fail-closed switch: binding is refused unless readiness_review.environment_flags holds
-- ('commercial_bridge', 'restricted_test'). This migration never inserts that row. It is set by hand only on an
-- isolated test database, so applying this migration anywhere else changes no behaviour.

-- 1. Assessment mode and unscored revised run --------------------------------------------------------------------
alter table public.assessments drop constraint assessments_assessment_mode_check;
alter table public.assessments add constraint assessments_assessment_mode_check
  check (assessment_mode = any (array['legacy_fixed'::text, 'adaptive'::text, 'readiness_review'::text]));

alter table public.score_runs drop constraint score_runs_adaptive_result_status_check;
alter table public.score_runs add constraint score_runs_adaptive_result_status_check
  check (adaptive_result_status is null
    or adaptive_result_status = any (array['NORMAL'::text, 'PROVISIONAL'::text, 'INSUFFICIENT_VISIBILITY'::text, 'REVISED_UNSCORED'::text]));

-- A revised run may only be REVISED_UNSCORED, and a REVISED_UNSCORED run carries no score of any kind.
alter table public.score_runs add constraint score_runs_revised_unscored_has_no_score
  check (adaptive_result_status is distinct from 'REVISED_UNSCORED'
    or (overall_score is null and calculated_maturity is null and final_maturity is null
        and exposure_score is null and exposure_band is null and cap_applied = false
        and input_hash ~ '^[0-9a-f]{64}$'));

-- The existing guard, with one addition: a REVISED_UNSCORED run is exempt from the score, maturity, exposure and
-- MFRS coverage requirements (it has none), and must still be locked with a 64-hex input digest.
create or replace function public.guard_score_run_write()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  parent_status public.assessment_status;
  parent_mode text;
  v_cleanup_ref text;
  v_synthetic_ref text;
  v_adaptive boolean := new.adaptive_result_status is not null;
  v_visibility_blocked boolean := new.adaptive_result_status = 'INSUFFICIENT_VISIBILITY';
  v_revised boolean := new.adaptive_result_status = 'REVISED_UNSCORED';
begin
  if tg_op = 'DELETE' then
    v_cleanup_ref := pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true);
    if v_cleanup_ref is not null and v_cleanup_ref <> '' then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.assessments a
      join public.organisations o on o.id = a.organisation_id
      where a.id = old.assessment_id;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;
  end if;

  if tg_op in ('UPDATE','DELETE') and old.status = 'completed' then
    raise exception 'Completed score runs are immutable. Create a new score run instead.';
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status, assessment_mode into parent_status, parent_mode from public.assessments where id = new.assessment_id;
    if parent_status is null then
      raise exception 'Parent assessment not found.';
    end if;

    if parent_status not in ('submitted','scored','snapshot_available','report_requested','under_review','closed') then
      raise exception 'Score runs may only be created for submitted or later assessments. Current status: %.', parent_status;
    end if;

    -- Revised runs belong only to revised assessments, and revised assessments only have revised runs.
    if v_revised is distinct from (parent_mode = 'readiness_review') then
      raise exception 'revised_score_run_mode_mismatch';
    end if;

    if new.status = 'completed' then
      if v_revised then
        if new.input_hash is null or new.input_hash !~ '^[0-9a-f]{64}$' then
          raise exception 'Completed revised run requires the 64-hex report input digest.';
        end if;
        if new.locked_at is null then
          raise exception 'Completed score run must be locked.';
        end if;
        return new;
      end if;

      if (not v_visibility_blocked)
         and (new.overall_score is null or new.calculated_maturity is null or new.final_maturity is null) then
        raise exception 'Completed score run requires overall score, calculated maturity and final maturity.';
      end if;

      if not v_adaptive and (new.exposure_score is null or new.exposure_band is null) then
        raise exception 'Completed score run requires exposure score and exposure band.';
      end if;

      if new.coverage_pct is null or new.coverage_pct < 80 then
        raise exception 'Completed score run requires coverage of at least 80 percent.';
      end if;

      if new.input_hash is null or length(new.input_hash) < 32 then
        raise exception 'Completed score run requires a deterministic input hash.';
      end if;

      if new.locked_at is null then
        raise exception 'Completed score run must be locked.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- 2. The revised methodology, recorded as an unapproved draft ----------------------------------------------------
insert into public.methodology_versions (version_code, title, status)
values ('MK-READINESS-REVIEW-1.6', 'MK readiness review, staged build 1.6 (review bank 1.3). Draft: no scoring method approved by MK.', 'draft')
on conflict (version_code) do nothing;

-- 3. Environment switch and binding ------------------------------------------------------------------------------
create table readiness_review.environment_flags (
  flag_key text primary key,
  flag_value text not null,
  set_at timestamptz not null default now(),
  set_by text not null
);
alter table readiness_review.environment_flags enable row level security;

create table readiness_review.commercial_bindings (
  session_id text primary key references readiness_review.sessions (session_id),
  assessment_id uuid not null unique references public.assessments (id),
  score_run_id uuid not null unique references public.score_runs (id),
  input_contract text not null,
  input_version text not null check (input_version = '1.3.0'),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  log_digest text not null check (log_digest ~ '^[0-9a-f]{64}$'),
  action_count integer not null check (action_count > 0),
  ruleset_key text references readiness_review.rulesets (ruleset_key),
  engine_build text not null,
  outstanding_total integer not null check (outstanding_total >= 0),
  interview_complete boolean not null,
  bound_at timestamptz not null default now()
);
alter table readiness_review.commercial_bindings enable row level security;

create trigger commercial_bindings_append_only before update or delete on readiness_review.commercial_bindings
  for each row execute function readiness_review.forbid_change();

create function public.review_commercial_bridge_enabled()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from readiness_review.environment_flags
    where flag_key = 'commercial_bridge' and flag_value = 'restricted_test'
  );
$$;

-- Binds a session to a new commercial assessment, once. Idempotent for the same answer log; refuses a different one.
create function public.review_bind_commercial_assessment(p jsonb)
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

  select id into v_methodology from public.methodology_versions where version_code = 'MK-READINESS-REVIEW-1.6';
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
      'reason', 'No revised scoring method is approved by MK. This run records the bound answer log and carries no score.',
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

create function public.review_commercial_binding(p_assessment_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(b) from readiness_review.commercial_bindings b where b.assessment_id = p_assessment_id;
$$;

revoke all on function public.review_commercial_bridge_enabled() from public, anon, authenticated;
revoke all on function public.review_bind_commercial_assessment(jsonb) from public, anon, authenticated;
revoke all on function public.review_commercial_binding(uuid) from public, anon, authenticated;
grant execute on function public.review_commercial_bridge_enabled() to service_role;
grant execute on function public.review_bind_commercial_assessment(jsonb) to service_role;
grant execute on function public.review_commercial_binding(uuid) to service_role;

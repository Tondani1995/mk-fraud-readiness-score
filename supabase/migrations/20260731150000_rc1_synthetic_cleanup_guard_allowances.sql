-- RC1: complete the synthetic-cleanup guard allowances.
--
-- Defect
-- ------
-- 20260730130000 extended guard_score_trace_write() with a narrow, provenance-proven DELETE
-- allowance, but score traces are not the only immutability guard standing between a completed
-- synthetic journey and its removal. Three more fire, and the cleanup could never have completed:
--
--   guard_score_run_write()          'Completed score runs are immutable. Create a new score run
--                                     instead.'
--   guard_assessment_answer_write()  'Assessment answers cannot be changed after assessment
--                                     lock/submission.'
--   guard_exposure_answer_write()    'Exposure answers cannot be changed after assessment
--                                     lock/submission.'
--
-- Each of these is correct for ordinary operation and must stay exactly as strict. The gap was in
-- the cleanup mechanism, which claimed to remove a journey it could not actually reach.
--
-- Correction
-- ----------
-- Each guard gains the identical allowance already accepted for score traces, and nothing else:
-- a DELETE is permitted only when BOTH
--
--   1. the transaction-local marker rc1.synthetic_cleanup_ref is set, which only
--      rc1_cleanup_synthetic_certification sets and only for the duration of its own transaction;
--      and
--   2. provenance is proven from the row itself -- assessment -> organisation -- and that
--      organisation's synthetic_certification_ref equals the marker.
--
-- synthetic_certification_ref carries a CHECK constraining it to ^MKTEST-RC1-<yyyymmdd>-<nn>$, so
-- matching against it is what confines the allowance to synthetic certification data. A marker
-- with no matching organisation proves nothing and the guard refuses exactly as before.
--
-- Deliberately not weakened: when the parent assessment has already gone -- a cascade rather than
-- the cleanup's own ordered delete -- provenance cannot be established and the guard still raises
-- 'Parent assessment not found.'. The cleanup removes answers explicitly, before the assessment,
-- so it never depends on that path. An allowance that cannot prove what it is authorising must
-- refuse.
--
-- No trigger is disabled, no session_replication_role is used, and every other branch of all three
-- functions is byte-identical to 0005/0006.

begin;

-- ---------------------------------------------------------------------------
-- 1. Completed score runs.
-- ---------------------------------------------------------------------------
create or replace function public.guard_score_run_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_status public.assessment_status;
  v_cleanup_ref text;
  v_synthetic_ref text;
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
    select status into parent_status from public.assessments where id = new.assessment_id;
    if parent_status is null then
      raise exception 'Parent assessment not found.';
    end if;

    if parent_status not in ('submitted','scored','snapshot_available','report_requested','under_review','closed') then
      raise exception 'Score runs may only be created for submitted or later assessments. Current status: %.', parent_status;
    end if;

    if new.status = 'completed' then
      if new.overall_score is null or new.calculated_maturity is null or new.final_maturity is null then
        raise exception 'Completed score run requires overall score, calculated maturity and final maturity.';
      end if;

      if new.exposure_score is null or new.exposure_band is null then
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
$$;

-- ---------------------------------------------------------------------------
-- 2. Locked assessment answers.
-- ---------------------------------------------------------------------------
create or replace function public.guard_assessment_answer_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_assessment record;
  question_record record;
  v_cleanup_ref text;
  v_synthetic_ref text;
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

  select id, status, submitted_at, locked_at, methodology_version_id
    into parent_assessment
  from public.assessments
  where id = coalesce(new.assessment_id, old.assessment_id);

  if not found then
    raise exception 'Parent assessment not found.';
  end if;

  if parent_assessment.status <> 'draft' or parent_assessment.submitted_at is not null or parent_assessment.locked_at is not null then
    raise exception 'Assessment answers cannot be changed after assessment lock/submission.';
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select id, question_code, methodology_version_id, n_a_allowed, n_a_rule_key, is_hard_gate
      into question_record
    from public.questions
    where id = new.question_id;

    if not found then
      raise exception 'Question not found.';
    end if;

    if question_record.methodology_version_id <> parent_assessment.methodology_version_id then
      raise exception 'Question does not belong to the assessment methodology version.';
    end if;

    if new.is_not_applicable then
      if new.response_value is not null then
        raise exception 'N/A answers must not include a numeric response.';
      end if;

      if not question_record.n_a_allowed then
        raise exception 'N/A is not allowed for question %.', question_record.question_code;
      end if;

      if question_record.n_a_rule_key is null or not public.is_question_na_applicable(new.assessment_id, question_record.n_a_rule_key) then
        raise exception 'Question % may only be marked N/A where approved exposure-profile rules make it genuinely inapplicable.', question_record.question_code;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Locked exposure answers.
-- ---------------------------------------------------------------------------
create or replace function public.guard_exposure_answer_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_assessment record;
  factor_record record;
  v_cleanup_ref text;
  v_synthetic_ref text;
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

  select id, status, submitted_at, locked_at, methodology_version_id
    into parent_assessment
  from public.assessments
  where id = coalesce(new.assessment_id, old.assessment_id);

  if not found then
    raise exception 'Parent assessment not found.';
  end if;

  if parent_assessment.status <> 'draft' or parent_assessment.submitted_at is not null or parent_assessment.locked_at is not null then
    raise exception 'Exposure answers cannot be changed after assessment lock/submission.';
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select id, factor_code, methodology_version_id, max_points
      into factor_record
    from public.exposure_factors
    where id = new.exposure_factor_id;

    if not found then
      raise exception 'Exposure factor not found.';
    end if;

    if factor_record.methodology_version_id <> parent_assessment.methodology_version_id then
      raise exception 'Exposure factor does not belong to the assessment methodology version.';
    end if;

    if new.points_awarded > factor_record.max_points then
      raise exception 'Exposure points exceed approved max points for factor %.', factor_record.factor_code;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

commit;

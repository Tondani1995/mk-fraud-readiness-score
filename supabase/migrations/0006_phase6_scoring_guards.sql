-- MK Fraud Readiness Score V1 - Phase 6 Scoring Guardrails
-- Run after 0001 to 0004 in Supabase dev.
-- Purpose: enforce score-run immutability, score trace integrity and completed-current-score references.

begin;

create unique index if not exists score_question_traces_run_question_uidx
  on public.score_question_traces(score_run_id, question_id);

create index if not exists score_domain_results_run_idx on public.score_domain_results(score_run_id);
create index if not exists score_question_traces_run_idx on public.score_question_traces(score_run_id);
create index if not exists maturity_cap_events_run_idx on public.maturity_cap_events(score_run_id);

create or replace function public.guard_score_run_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_status public.assessment_status;
begin
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

drop trigger if exists trg_guard_score_run_write on public.score_runs;
create trigger trg_guard_score_run_write
before insert or update or delete on public.score_runs
for each row execute function public.guard_score_run_write();

create or replace function public.guard_score_trace_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_status public.score_run_status;
  parent_locked_at timestamptz;
begin
  select status, locked_at into parent_status, parent_locked_at
  from public.score_runs
  where id = coalesce(new.score_run_id, old.score_run_id);

  if parent_status is null then
    raise exception 'Parent score run not found.';
  end if;

  if parent_status = 'completed' or parent_locked_at is not null then
    raise exception 'Score traces and cap events cannot be changed after score run completion.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_score_domain_results_write on public.score_domain_results;
create trigger trg_guard_score_domain_results_write
before insert or update or delete on public.score_domain_results
for each row execute function public.guard_score_trace_write();

drop trigger if exists trg_guard_score_question_traces_write on public.score_question_traces;
create trigger trg_guard_score_question_traces_write
before insert or update or delete on public.score_question_traces
for each row execute function public.guard_score_trace_write();

drop trigger if exists trg_guard_maturity_cap_events_write on public.maturity_cap_events;
create trigger trg_guard_maturity_cap_events_write
before insert or update or delete on public.maturity_cap_events
for each row execute function public.guard_score_trace_write();

create or replace function public.guard_assessment_current_score_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  score_record record;
begin
  if new.current_score_run_id is not null and new.current_score_run_id is distinct from old.current_score_run_id then
    select id, assessment_id, status into score_record
    from public.score_runs
    where id = new.current_score_run_id;

    if not found then
      raise exception 'Current score run does not exist.';
    end if;

    if score_record.assessment_id <> new.id then
      raise exception 'Current score run must belong to the assessment being updated.';
    end if;

    if score_record.status <> 'completed' then
      raise exception 'Current score run must be completed before it can be assigned to an assessment.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_assessment_current_score_run on public.assessments;
create trigger trg_guard_assessment_current_score_run
before update of current_score_run_id on public.assessments
for each row execute function public.guard_assessment_current_score_run();

insert into public.app_settings (setting_key, value_json)
values
  ('phase6_scoring_engine', '{"deterministic":true,"ai_scoring":false,"score_trace_required":true,"completed_score_runs_immutable":true,"coverage_minimum_pct":80,"scenario_tests_required":true}'::jsonb)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;

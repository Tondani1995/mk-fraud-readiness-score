-- MK Fraud Readiness Score V1 - Phase 5 v1.1 Guardrails
-- Purpose: close Phase 5 approval gaps before scoring starts.
-- Adds database-side draft locks, profile-derived N/A enforcement and methodology immutability after first assessment use.

begin;

create or replace function public.assessment_exposure_value(p_assessment_id uuid, p_factor_code text)
returns text
language sql
stable
set search_path = public
as $$
  select ea.raw_value_json ->> 'selectedValue'
  from public.exposure_answers ea
  join public.exposure_factors ef on ef.id = ea.exposure_factor_id
  where ea.assessment_id = p_assessment_id
    and ef.factor_code = p_factor_code
  limit 1;
$$;

create or replace function public.is_question_na_applicable(p_assessment_id uuid, p_rule_key text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  exp01 text := public.assessment_exposure_value(p_assessment_id, 'EXP-01');
  exp02 text := public.assessment_exposure_value(p_assessment_id, 'EXP-02');
  exp03 text := public.assessment_exposure_value(p_assessment_id, 'EXP-03');
  exp04 text := public.assessment_exposure_value(p_assessment_id, 'EXP-04');
begin
  case p_rule_key
    when 'profile_rule_d2_q05', 'profile_rule_d7_q05', 'profile_rule_d7_q07' then
      return exp02 = 'none';
    when 'profile_rule_d2_q08', 'profile_rule_d8_q01', 'profile_rule_d8_q08' then
      return exp03 = 'none' and exp04 = 'none';
    when 'profile_rule_d8_q02', 'profile_rule_d8_q05' then
      return exp03 = 'none';
    when 'profile_rule_d3_q05', 'profile_rule_d3_q07' then
      return exp01 = 'none';
    when 'profile_rule_d6_q05' then
      return exp02 = 'none' and exp03 = 'none';
    else
      return false;
  end case;
end;
$$;

create or replace function public.guard_assessment_answer_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_assessment record;
  question_record record;
begin
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

drop trigger if exists trg_guard_assessment_answer_write on public.assessment_answers;
create trigger trg_guard_assessment_answer_write
before insert or update or delete on public.assessment_answers
for each row execute function public.guard_assessment_answer_write();

create or replace function public.guard_exposure_answer_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_assessment record;
  factor_record record;
begin
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

drop trigger if exists trg_guard_exposure_answer_write on public.exposure_answers;
create trigger trg_guard_exposure_answer_write
before insert or update or delete on public.exposure_answers
for each row execute function public.guard_exposure_answer_write();

create or replace function public.prevent_methodology_mutation_after_use()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  method_id uuid;
  old_clean jsonb;
  new_clean jsonb;
begin
  if tg_table_name = 'methodology_versions' then
    method_id := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id')::uuid;
  elsif tg_table_name = 'question_applicability_rules' then
    select q.methodology_version_id into method_id
    from public.questions q
    where q.id = (case when tg_op = 'DELETE' then old.question_id else new.question_id end);
  else
    method_id := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'methodology_version_id')::uuid;
  end if;

  if method_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if exists (select 1 from public.assessments a where a.methodology_version_id = method_id) then
    if tg_op = 'UPDATE' then
      old_clean := to_jsonb(old) - 'updated_at';
      new_clean := to_jsonb(new) - 'updated_at';
      if old_clean is distinct from new_clean then
        raise exception 'Methodology version % is already used by at least one assessment and cannot be mutated. Create a new methodology version instead.', method_id;
      end if;
    else
      raise exception 'Methodology version % is already used by at least one assessment and cannot be deleted. Retire/version it instead.', method_id;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
begin
  perform 1;
end $$;

drop trigger if exists trg_methodology_versions_immutability on public.methodology_versions;
create trigger trg_methodology_versions_immutability before update or delete on public.methodology_versions for each row execute function public.prevent_methodology_mutation_after_use();

drop trigger if exists trg_response_scale_immutability on public.response_scale;
create trigger trg_response_scale_immutability before update or delete on public.response_scale for each row execute function public.prevent_methodology_mutation_after_use();

drop trigger if exists trg_domains_immutability on public.domains;
create trigger trg_domains_immutability before update or delete on public.domains for each row execute function public.prevent_methodology_mutation_after_use();

drop trigger if exists trg_questions_immutability on public.questions;
create trigger trg_questions_immutability before update or delete on public.questions for each row execute function public.prevent_methodology_mutation_after_use();

drop trigger if exists trg_question_applicability_rules_immutability on public.question_applicability_rules;
create trigger trg_question_applicability_rules_immutability before update or delete on public.question_applicability_rules for each row execute function public.prevent_methodology_mutation_after_use();

drop trigger if exists trg_exposure_factors_immutability on public.exposure_factors;
create trigger trg_exposure_factors_immutability before update or delete on public.exposure_factors for each row execute function public.prevent_methodology_mutation_after_use();

drop trigger if exists trg_recommendation_rules_immutability on public.recommendation_rules;
create trigger trg_recommendation_rules_immutability before update or delete on public.recommendation_rules for each row execute function public.prevent_methodology_mutation_after_use();

insert into public.app_settings (setting_key, value_json)
values
  ('phase5_v1_1_guardrails', '{"answer_lock_guard":true,"exposure_lock_guard":true,"profile_derived_na":true,"methodology_immutability_after_use":true,"critical_controls":19,"hard_gate_controls":17,"conditional_na_questions":11}'::jsonb)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;

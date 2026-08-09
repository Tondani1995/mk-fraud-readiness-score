-- G25 adaptive engine persistence and transactional state boundaries.
-- Additive only: legacy assessments and scoring remain unchanged.

begin;

create table if not exists public.adaptive_gateway_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  graph_version_id uuid not null references public.adaptive_graph_versions(id),
  question_id text not null,
  response_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, graph_version_id, question_id)
);

create table if not exists public.adaptive_control_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  graph_version_id uuid not null references public.adaptive_graph_versions(id),
  question_id text not null,
  response_state text not null check (response_state in ('maturity','unknown')),
  response_value smallint check (
    (response_state = 'maturity' and response_value between 0 and 5)
    or (response_state = 'unknown' and response_value is null)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, graph_version_id, question_id)
);

alter table public.adaptive_gateway_answers enable row level security;
alter table public.adaptive_control_responses enable row level security;
revoke all on table public.adaptive_gateway_answers, public.adaptive_control_responses from public, anon, authenticated;
grant select, insert, update, delete on table public.adaptive_gateway_answers, public.adaptive_control_responses to service_role;

create index if not exists adaptive_gateway_answers_assessment_idx
  on public.adaptive_gateway_answers(assessment_id, graph_version_id);
create index if not exists adaptive_control_responses_assessment_idx
  on public.adaptive_control_responses(assessment_id, graph_version_id);

create or replace function public.adaptive_save_state(
  p_assessment_id uuid,
  p_expected_save_sequence bigint,
  p_current_screen text,
  p_current_question_id text,
  p_visited_question_ids text[],
  p_gateway_answers jsonb,
  p_control_responses jsonb,
  p_invalidate_question_ids text[] default '{}',
  p_history jsonb default '[]'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.assessments%rowtype;
  v_navigation public.assessment_navigation_states%rowtype;
  v_now timestamptz := now();
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'adaptive_service_role_required';
  end if;

  select * into v_assessment
  from public.assessments
  where id = p_assessment_id
  for update;
  if not found or v_assessment.assessment_mode <> 'adaptive' then
    raise exception 'adaptive_assessment_not_found';
  end if;
  if v_assessment.status <> 'draft' or v_assessment.locked_at is not null or v_assessment.submitted_at is not null then
    raise exception 'adaptive_assessment_locked';
  end if;

  select * into v_navigation
  from public.assessment_navigation_states
  where assessment_id = p_assessment_id
  for update;
  if not found then
    raise exception 'adaptive_navigation_missing';
  end if;
  if v_navigation.save_sequence <> p_expected_save_sequence then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'save_sequence', v_navigation.save_sequence,
      'current_screen', v_navigation.current_screen,
      'current_question_id', v_navigation.current_question_id,
      'visited_question_ids', v_navigation.visited_question_ids,
      'last_saved_at', v_navigation.last_saved_at
    );
  end if;

  delete from public.adaptive_control_responses
  where assessment_id = p_assessment_id
    and graph_version_id = v_assessment.graph_version_id
    and question_id = any(coalesce(p_invalidate_question_ids, '{}'));

  insert into public.adaptive_gateway_answers(assessment_id, graph_version_id, question_id, response_value, updated_at)
  select p_assessment_id, v_assessment.graph_version_id, x.question_id, x.response_value, v_now
  from jsonb_to_recordset(coalesce(p_gateway_answers, '[]'::jsonb)) as x(question_id text, response_value text)
  where x.question_id is not null and x.response_value is not null
  on conflict (assessment_id, graph_version_id, question_id) do update
    set response_value = excluded.response_value, updated_at = excluded.updated_at;

  insert into public.adaptive_control_responses(assessment_id, graph_version_id, question_id, response_state, response_value, updated_at)
  select p_assessment_id, v_assessment.graph_version_id, x.question_id, x.response_state, x.response_value, v_now
  from jsonb_to_recordset(coalesce(p_control_responses, '[]'::jsonb)) as x(question_id text, response_state text, response_value smallint)
  where x.question_id is not null and x.response_state is not null
  on conflict (assessment_id, graph_version_id, question_id) do update
    set response_state = excluded.response_state,
        response_value = excluded.response_value,
        updated_at = excluded.updated_at;

  insert into public.assessment_answer_history(
    assessment_id, question_id, graph_version_id, event_type,
    previous_answer, upstream_cause_question_id, reason_code
  )
  select p_assessment_id, x.question_id, v_assessment.graph_version_id,
    x.event_type, x.previous_answer, x.upstream_cause_question_id, x.reason_code
  from jsonb_to_recordset(coalesce(p_history, '[]'::jsonb)) as x(
    question_id text,
    event_type text,
    previous_answer jsonb,
    upstream_cause_question_id text,
    reason_code text
  )
  where x.question_id is not null;

  update public.assessment_navigation_states
  set graph_version_id = v_assessment.graph_version_id,
      current_screen = p_current_screen,
      current_question_id = p_current_question_id,
      visited_question_ids = coalesce(p_visited_question_ids, '{}'),
      save_sequence = save_sequence + 1,
      last_saved_at = v_now,
      updated_at = v_now
  where assessment_id = p_assessment_id;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'save_sequence', v_navigation.save_sequence + 1,
    'saved_at', v_now
  );
end;
$$;

create or replace function public.adaptive_submit_assessment(
  p_assessment_id uuid,
  p_expected_save_sequence bigint,
  p_profile jsonb,
  p_signals jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.assessments%rowtype;
  v_navigation public.assessment_navigation_states%rowtype;
  v_now timestamptz := now();
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'adaptive_service_role_required';
  end if;

  select * into v_assessment from public.assessments where id = p_assessment_id for update;
  if not found or v_assessment.assessment_mode <> 'adaptive' then raise exception 'adaptive_assessment_not_found'; end if;
  if v_assessment.status <> 'draft' or v_assessment.locked_at is not null or v_assessment.submitted_at is not null then
    raise exception 'adaptive_assessment_locked';
  end if;
  select * into v_navigation from public.assessment_navigation_states where assessment_id = p_assessment_id for update;
  if not found then raise exception 'adaptive_navigation_missing'; end if;
  if v_navigation.save_sequence <> p_expected_save_sequence then
    return jsonb_build_object('ok', false, 'conflict', true, 'save_sequence', v_navigation.save_sequence,
      'current_screen', v_navigation.current_screen, 'current_question_id', v_navigation.current_question_id,
      'visited_question_ids', v_navigation.visited_question_ids, 'last_saved_at', v_navigation.last_saved_at);
  end if;

  delete from public.assessment_applicability_profiles
  where assessment_id = p_assessment_id and graph_version_id = v_assessment.graph_version_id;
  insert into public.assessment_applicability_profiles(
    assessment_id, question_id, graph_version_id, applicability_state, finding_class,
    recommendation_class, scoring_weight, included_in_denominator, excluded_from_denominator_rule,
    skip_reason, control_visibility_state, redirected_question_id, replacement_question_id, updated_at
  )
  select p_assessment_id, x.question_id, v_assessment.graph_version_id, x.applicability_state,
    x.finding_class, x.recommendation_class, x.scoring_weight, coalesce(x.included_in_denominator, true),
    x.excluded_from_denominator_rule, x.skip_reason, x.control_visibility_state,
    x.redirected_question_id, x.replacement_question_id, v_now
  from jsonb_to_recordset(coalesce(p_profile, '[]'::jsonb)) as x(
    question_id text, applicability_state text, finding_class text, recommendation_class text,
    scoring_weight numeric, included_in_denominator boolean, excluded_from_denominator_rule text,
    skip_reason text, control_visibility_state text, redirected_question_id text, replacement_question_id text
  );

  delete from public.assessment_integrity_signals
  where assessment_id = p_assessment_id and graph_version_id = v_assessment.graph_version_id;
  insert into public.assessment_integrity_signals(assessment_id, graph_version_id, signal_id, detail, blocking)
  select p_assessment_id, v_assessment.graph_version_id, x.signal_id, coalesce(x.detail, '{}'::jsonb), coalesce(x.blocking, false)
  from jsonb_to_recordset(coalesce(p_signals, '[]'::jsonb)) as x(signal_id text, detail jsonb, blocking boolean);

  update public.assessments
  set status = 'submitted', submitted_at = v_now, locked_at = v_now, updated_at = v_now
  where id = p_assessment_id;
  update public.assessment_navigation_states
  set current_screen = 'complete', current_question_id = null, save_sequence = save_sequence + 1,
      submitted_at = v_now, last_saved_at = v_now, updated_at = v_now
  where assessment_id = p_assessment_id;

  return jsonb_build_object('ok', true, 'submitted_at', v_now, 'save_sequence', v_navigation.save_sequence + 1);
end;
$$;

revoke all on function public.adaptive_save_state(uuid, bigint, text, text, text[], jsonb, jsonb, text[], jsonb) from public, anon, authenticated;
revoke all on function public.adaptive_submit_assessment(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.adaptive_save_state(uuid, bigint, text, text, text[], jsonb, jsonb, text[], jsonb) to service_role;
grant execute on function public.adaptive_submit_assessment(uuid, bigint, jsonb, jsonb) to service_role;

comment on table public.adaptive_gateway_answers is 'Server-authoritative gateway answers for adaptive assessments; legacy assessment answers are unchanged.';
comment on table public.adaptive_control_responses is 'Server-authoritative adaptive maturity and I-do-not-know responses; no customer score is calculated here.';

commit;

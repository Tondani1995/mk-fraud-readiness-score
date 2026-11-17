-- Read-only, privacy-safe funnel counters for the revised Fraud Readiness production journey.
-- The preceding scored assessment uses public.assessment_events. Revised sessions and answers
-- are recorded in readiness_review; never combine the populations or expose role links/answers.
create or replace function public.review_monitor_funnel(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with real_sessions as (
    select s.session_id, s.created_at
      from readiness_review.sessions s
     where s.fictional is false
  ),
  answer_activity as (
    select a.session_id, a.type
      from readiness_review.actions a
      join real_sessions s on s.session_id = a.session_id
     where a.at >= p_since
       and a.type in ('respondent.answer', 'respondent.correct', 'owner.answer', 'owner.decline')
  ),
  bound as (
    select b.assessment_id
      from readiness_review.commercial_bindings b
      join real_sessions s on s.session_id = b.session_id
     where b.bound_at >= p_since
  )
  select jsonb_build_object(
    'version', 1,
    'realSessionsStarted', (select count(*) from real_sessions where created_at >= p_since),
    'respondentActiveSessions', (select count(distinct session_id) from answer_activity where type in ('respondent.answer', 'respondent.correct')),
    'respondentAnswers', (select count(*) from answer_activity where type = 'respondent.answer'),
    'respondentCorrections', (select count(*) from answer_activity where type = 'respondent.correct'),
    'ownerActiveSessions', (select count(distinct session_id) from answer_activity where type = 'owner.answer'),
    'ownerAnswers', (select count(*) from answer_activity where type = 'owner.answer'),
    'ownerDeclines', (select count(*) from answer_activity where type = 'owner.decline'),
    'commercialAssessmentsBound', (select count(distinct assessment_id) from bound),
    'paidOrdersRecorded', (
       select count(distinct o.id)
         from public.orders o
         join readiness_review.commercial_bindings b on b.assessment_id = o.assessment_id
         join real_sessions s on s.session_id = b.session_id
        where o.created_at >= p_since
    )
  );
$function$;
revoke all on function public.review_monitor_funnel(timestamptz) from public, anon, authenticated;
grant execute on function public.review_monitor_funnel(timestamptz) to service_role;

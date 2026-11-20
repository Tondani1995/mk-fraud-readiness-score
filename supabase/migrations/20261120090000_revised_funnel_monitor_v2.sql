-- Revised Fraud Readiness funnel, version 2 (20 November 2026). Additive: review_monitor_funnel (version 1) is unchanged.
--
-- Read-only, aggregate-only, service role only. Never returns role links, names, emails, answers or organisation
-- names. Fictional sessions (every harness and signed synthetic monitor start) are excluded. MK's own internal check
-- sessions (a contact email on mkfraud.co.za) are counted separately so they never inflate customer figures.
--
-- Version 1's paidOrdersRecorded counted every order, paid or not. Version 2 separates orders recorded from payments
-- received. Report fulfilment for revised reports is manual (DR-13) and leaves no record, so it is not reported here;
-- the caller marks it as not recorded rather than zero.
create or replace function public.review_monitor_funnel_v2(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with real_sessions as (
    select s.session_id, s.created_at,
           coalesce(lower(c.email) like '%@mkfraud.co.za', false) as internal,
           c.completed_notified_at
      from readiness_review.sessions s
      left join readiness_review.session_contacts c on c.session_id = s.session_id
     where s.fictional is false
  ),
  customer as (select session_id, created_at, completed_notified_at from real_sessions where internal is false),
  answers as (
    select a.session_id, a.type
      from readiness_review.actions a
      join customer s on s.session_id = a.session_id
     where a.at >= p_since and a.type in ('respondent.answer', 'respondent.correct')
  ),
  bindings as (
    select b.session_id, b.assessment_id, b.bound_at
      from readiness_review.commercial_bindings b
      join customer s on s.session_id = b.session_id
  ),
  orders as (
    select distinct o.id, o.order_reference, o.status, o.created_at, o.updated_at
      from public.orders o
      join bindings b on b.assessment_id = o.assessment_id
  ),
  narratives as (
    select n.status
      from readiness_review.snapshot_narratives n
      join customer s on s.session_id = n.session_id
     where n.created_at >= p_since
  )
  select jsonb_build_object(
    'version', 2,
    'customerSessionsStarted', (select count(*) from customer where created_at >= p_since),
    'internalSessionsStarted', (select count(*) from real_sessions where internal and created_at >= p_since),
    'customerRespondentActiveSessions', (select count(distinct session_id) from answers),
    'customerRespondentAnswers', (select count(*) from answers where type = 'respondent.answer'),
    'customerRespondentCorrections', (select count(*) from answers where type = 'respondent.correct'),
    'customerInterviewsCompleted', (select count(*) from customer where completed_notified_at >= p_since),
    'customerSnapshotNarrativesAi', (select count(*) from narratives where status = 'ai'),
    'customerSnapshotNarrativesFallback', (select count(*) from narratives where status <> 'ai'),
    'customerAssessmentsBound', (select count(distinct assessment_id) from bindings where bound_at >= p_since),
    'customerOrdersRecorded', (select count(*) from orders where created_at >= p_since),
    'customerOrdersAwaitingPayment', (select count(*) from orders where status = 'awaiting_payment'),
    'customerPaymentsReceived', (select count(*) from orders where status in ('payment_received', 'verified') and updated_at >= p_since),
    'customerReportsGenerated', (
       select count(distinct g.order_reference)
         from readiness_review.generation_checkpoints g
         join orders o on o.order_reference = g.order_reference
        where g.stage = 'linked' and g.created_at >= p_since
    ),
    'customerPaidOrdersWithoutReport', (
       select count(*) from orders o
        where o.status in ('payment_received', 'verified')
          and not exists (select 1 from readiness_review.generation_checkpoints g where g.order_reference = o.order_reference and g.stage = 'linked')
    ),
    'reportGenerationCallsNotSucceeded', (
       select count(*) from readiness_review.generation_calls c
        where c.created_at >= p_since and c.status::text <> 'succeeded'
    )
  );
$function$;

revoke all on function public.review_monitor_funnel_v2(timestamptz) from public, anon, authenticated;
grant execute on function public.review_monitor_funnel_v2(timestamptz) to service_role;

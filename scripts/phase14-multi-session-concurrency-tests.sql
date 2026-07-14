\set ON_ERROR_STOP on

create extension if not exists dblink;

begin;
set local session_replication_role = replica;

insert into public.admin_profiles(id, email, full_name, role, status, mfa_required)
values ('22000000-0000-0000-0000-000000000020', 'phase14-concurrency@example.invalid', 'Concurrency Admin', 'platform_admin', 'active', true);

update public.phase14_security_gates
set satisfied_version = required_version, status = 'satisfied',
    satisfied_by = '22000000-0000-0000-0000-000000000020', satisfied_at = now(),
    reason = 'isolated multi-session test only', updated_at = now()
where gate_key = 'phase14-premium-report';

do $fixture$
declare
  v_methodology uuid;
  v_product uuid;
  v_assessment constant uuid := '22000000-0000-0000-0000-000000000001';
  v_score constant uuid := '22000000-0000-0000-0000-000000000002';
begin
  select id into strict v_methodology from public.methodology_versions where status = 'active';
  select id into strict v_product from public.products where product_code = 'essential_self_assessment';
  insert into public.assessments(id, assessment_reference, organisation_id, methodology_version_id, status, submitted_at, locked_at, current_score_run_id)
  values (v_assessment, 'PH14-MULTI-SESSION', '22000000-0000-0000-0000-000000000010', v_methodology, 'scored', now(), now(), v_score);
  insert into public.score_runs(
    id, assessment_id, methodology_version_id, run_number, run_type, status,
    overall_score, calculated_maturity, final_maturity, exposure_score, exposure_band,
    coverage_pct, n_a_rate_pct, critical_gap_count, major_gap_count, cap_applied, input_hash, locked_at
  ) values (
    v_score, v_assessment, v_methodology, 1, 'test_fixture', 'completed', 60,
    'Developing', 'Developing', 40, 'High', 100, 0, 0, 0, false, repeat('a',64), now()
  );
  insert into public.score_domain_results(score_run_id, domain_id, raw_score, weighted_contribution, coverage_pct, critical_gap_count)
  select v_score, id, 60, 0, 100, 0 from public.domains where methodology_version_id = v_methodology;
  insert into public.score_question_traces(
    score_run_id, question_id, response_value, normalised_score, question_weight,
    applicable, numerator_contribution, denominator_contribution
  ) select v_score, id, 3, 60, weight, true, 60 * weight, 100 * weight
    from public.questions where methodology_version_id = v_methodology and active;
  insert into public.orders(
    id, order_reference, assessment_id, product_id, status, amount_cents, currency,
    product_name, customer_email, customer_name, organisation_name, verified_at, verified_by
  ) select '22000000-0000-0000-0000-000000000003', 'ORDER-PH14-MULTI-SESSION', v_assessment,
    v_product, 'payment_received', 500000, 'ZAR', name, 'concurrency@example.invalid',
    'Concurrency', 'Concurrency Org', now(), '22000000-0000-0000-0000-000000000020'
    from public.products where id = v_product;
end
$fixture$;
commit;

select dblink_connect('phase14_worker_a', 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_connect('phase14_worker_b', 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_exec('phase14_worker_a', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000091"}'$$);
select dblink_exec('phase14_worker_b', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000092"}'$$);

select dblink_send_query('phase14_worker_a', $$
  select public.claim_premium_report_generation('ORDER-PH14-MULTI-SESSION','worker-a',null,'essential_self_assessment')::text
$$);
select dblink_send_query('phase14_worker_b', $$
  select public.claim_premium_report_generation('ORDER-PH14-MULTI-SESSION','worker-b',null,'essential_self_assessment')::text
$$);

create temp table phase14_claim_results(worker text, result jsonb);
insert into phase14_claim_results select 'worker-a', result::jsonb
from dblink_get_result('phase14_worker_a') as t(result text);
insert into phase14_claim_results select 'worker-b', result::jsonb
from dblink_get_result('phase14_worker_b') as t(result text);

do $assert_claim$
begin
  if (select count(*) from phase14_claim_results where (result->>'claimed')::boolean) <> 1
     or (select count(*) from phase14_claim_results where not (result->>'claimed')::boolean) <> 1 then
    raise exception 'Two-session claim election did not produce exactly one winner: %',
      (select jsonb_agg(to_jsonb(r)) from phase14_claim_results r);
  end if;
end
$assert_claim$;

-- End the first pair of asynchronous sessions after consuming their results.
-- Recovery uses a fresh pair so the second race is independently observable.
select dblink_disconnect('phase14_worker_a');
select dblink_disconnect('phase14_worker_b');

set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000093"}';
do $commit_draft$
declare v_claim jsonb; v_template uuid;
begin
  select result into strict v_claim from phase14_claim_results where (result->>'claimed')::boolean;
  select id into strict v_template from public.report_templates
  where report_type = 'essential_self_assessment' and status = 'active'
  order by version_number desc limit 1;
  perform public.commit_premium_report_draft(
    (v_claim->>'claim_token')::uuid, v_template, 'generated-reports',
    'tmp/PH14-MULTI-SESSION/committed.pdf', repeat('c',64),
    '22000000-0000-0000-0000-000000000020', null
  );
  update public.report_generation_claims
  set lease_expires_at = now() - interval '1 minute'
  where assessment_id = '22000000-0000-0000-0000-000000000001';
end
$commit_draft$;

select dblink_connect('phase14_worker_a', 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_connect('phase14_worker_b', 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_exec('phase14_worker_a', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000094"}'$$);
select dblink_exec('phase14_worker_b', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000095"}'$$);

select dblink_send_query('phase14_worker_a', $$
  select public.recover_premium_report_generation_claim('ORDER-PH14-MULTI-SESSION','recovery-a')::text
$$);
select dblink_send_query('phase14_worker_b', $$
  select public.recover_premium_report_generation_claim('ORDER-PH14-MULTI-SESSION','recovery-b')::text
$$);

create temp table phase14_recovery_results(worker text, result jsonb);
insert into phase14_recovery_results select 'recovery-a', result::jsonb
from dblink_get_result('phase14_worker_a', false) as t(result text);
insert into phase14_recovery_results select 'recovery-b', result::jsonb
from dblink_get_result('phase14_worker_b', false) as t(result text);

do $assert_recovery$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into strict v_claim from public.report_generation_claims
  where assessment_id = '22000000-0000-0000-0000-000000000001';
  if v_claim.recovery_count <> 1 or v_claim.claim_owner not in ('recovery-a','recovery-b')
     or v_claim.state <> 'committed' or v_claim.report_id is null then
    raise exception 'Concurrent committed-draft recovery was not single-winner and durable: %', to_jsonb(v_claim);
  end if;
end
$assert_recovery$;

select dblink_disconnect('phase14_worker_a');
select dblink_disconnect('phase14_worker_b');

insert into public.email_events(
  id, assessment_id, order_id, report_id, recipient_email, status, provider,
  provider_message_id, provider_request_key, provider_idempotency_key,
  dedupe_key, notification_type, attempt_number, delivery_updated_at
)
select '22000000-0000-0000-0000-000000000030', assessment_id, order_id, report_id,
  'concurrency@example.invalid', 'sent', 'resend', 'phase14-concurrent-message',
  'phase14-concurrent-request', 'phase14-concurrent-request', 'phase14-concurrent-dedupe',
  'premium_report_pdf', 1, '2026-07-14T12:00:00Z'
from public.report_generation_claims
where assessment_id = '22000000-0000-0000-0000-000000000001';

select dblink_connect('phase14_worker_a', 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_connect('phase14_worker_b', 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_exec('phase14_worker_a', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000096"}'$$);
select dblink_exec('phase14_worker_b', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000097"}'$$);
select dblink_send_query('phase14_worker_a', $$
  select public.apply_email_provider_event_atomic(
    'resend','phase14-concurrent-delivered','phase14-concurrent-message','email.delivered',
    '2026-07-14T12:00:30Z',repeat('d',64),'{"type":"email.delivered"}'::jsonb
  )::text
$$);
select dblink_send_query('phase14_worker_b', $$
  select public.apply_email_provider_event_atomic(
    'resend','phase14-concurrent-bounced','phase14-concurrent-message','email.bounced',
    '2026-07-14T12:01:00Z',repeat('e',64),'{"type":"email.bounced","reason":"isolated test"}'::jsonb
  )::text
$$);
create temp table phase14_webhook_results(worker text, result jsonb);
insert into phase14_webhook_results select 'webhook-a', result::jsonb
from dblink_get_result('phase14_worker_a', false) as t(result text);
insert into phase14_webhook_results select 'webhook-b', result::jsonb
from dblink_get_result('phase14_worker_b', false) as t(result text);
do $assert_webhooks$
begin
  if (select count(*) from phase14_webhook_results) <> 2
     or (select status from public.email_events where id = '22000000-0000-0000-0000-000000000030') <> 'bounced'
     or (select count(*) from public.email_provider_events where email_event_id = '22000000-0000-0000-0000-000000000030') <> 2 then
    raise exception 'Concurrent webhook serialization or monotonic terminal state failed';
  end if;
end
$assert_webhooks$;
select dblink_disconnect('phase14_worker_a');
select dblink_disconnect('phase14_worker_b');

set request.jwt.claims = '';
begin;
set local session_replication_role = replica;
delete from public.email_provider_events where email_event_id = '22000000-0000-0000-0000-000000000030';
delete from public.email_events where id = '22000000-0000-0000-0000-000000000030';
delete from public.report_generation_claims where assessment_id = '22000000-0000-0000-0000-000000000001';
delete from public.reports where assessment_id = '22000000-0000-0000-0000-000000000001';
delete from public.orders where id = '22000000-0000-0000-0000-000000000003';
delete from public.score_question_traces where score_run_id = '22000000-0000-0000-0000-000000000002';
delete from public.score_domain_results where score_run_id = '22000000-0000-0000-0000-000000000002';
delete from public.assessments where id = '22000000-0000-0000-0000-000000000001';
delete from public.score_runs where id = '22000000-0000-0000-0000-000000000002';
delete from public.admin_profiles where id = '22000000-0000-0000-0000-000000000020';
update public.phase14_security_gates
set satisfied_version = 0, status = 'unsatisfied', satisfied_by = null, satisfied_at = null,
    reason = 'Multi-session test cleanup restored the inert gate.', updated_at = now()
where gate_key = 'phase14-premium-report';
commit;

select 'phase14_multi_session_concurrency_tests_passed' as result;

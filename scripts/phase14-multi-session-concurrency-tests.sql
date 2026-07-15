\set ON_ERROR_STOP on

create extension if not exists dblink;

begin;
set local session_replication_role = replica;

insert into public.admin_profiles(id, email, full_name, role, status, mfa_required)
values ('22000000-0000-0000-0000-000000000020', 'phase14-concurrency@example.invalid', 'Concurrency Admin', 'platform_admin', 'active', true);

insert into auth.sessions(id,user_id,aal,not_after)
select ('22000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '22000000-0000-0000-0000-000000000020'::uuid,'aal2',now()+interval '1 day'
from generate_series(91,99) n
on conflict (id) do update set user_id=excluded.user_id,aal=excluded.aal,not_after=excluded.not_after;

update public.phase14_security_gates
set satisfied_version = required_version, status = 'satisfied',
    satisfied_by = '22000000-0000-0000-0000-000000000020', satisfied_at = now(),
    reason = 'isolated multi-session test only', updated_at = now()
where gate_key = 'phase14-premium-report';

update public.phase14_feature_policies
set enabled = true, updated_by = '22000000-0000-0000-0000-000000000020',
    approved_gate_version=(select required_version from public.phase14_security_gates where gate_key='phase14-premium-report'),
    approved_authority_epoch=(select authority_epoch from public.phase14_security_gates where gate_key='phase14-premium-report'),
    approved_at=now(),reason = 'isolated multi-session test only', updated_at = now()
where policy_key in ('manual_generation','manual_delivery','automatic_fulfilment','storage_cleanup');

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

-- True two-session stale-publisher versus recovery race. Regardless of lock
-- order, the expired publisher must fail and exactly one recovery must own the
-- replacement token.
select dblink_disconnect('phase14_worker_a');
select dblink_disconnect('phase14_worker_b');
select dblink_connect('phase14_publisher','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_connect('phase14_recovery','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_exec('phase14_publisher', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000098"}'$$);
select dblink_exec('phase14_recovery', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000099"}'$$);

create or replace function public.phase14_test_try_stale_publish(p_token uuid,p_report_id uuid)
returns text language plpgsql set search_path=''
as $test$
begin
  perform public.publish_premium_report_generation(p_token,p_report_id);
  return 'unexpected_publication';
exception when others then
  return 'blocked:' || sqlerrm;
end
$test$;

create or replace function public.phase14_test_try_recovery()
returns text language plpgsql set search_path=''
as $test$
begin
  return public.recover_premium_report_generation_claim(
    'ORDER-PH14-MULTI-SESSION','publisher-race-recovery'
  )::text;
exception when others then
  return 'blocked:' || sqlerrm;
end
$test$;

insert into storage.objects(id,bucket_id,name,metadata)
select gen_random_uuid(),final_storage_bucket,final_storage_path,
  jsonb_build_object('mimetype','application/pdf','sha256',expected_checksum)
from public.report_generation_claims
where assessment_id='22000000-0000-0000-0000-000000000001';

create temp table phase14_stale_publication_context(token uuid,report_id uuid);
insert into phase14_stale_publication_context
select claim_token,report_id from public.report_generation_claims
where assessment_id='22000000-0000-0000-0000-000000000001';
update public.report_generation_claims set lease_expires_at=now()-interval '1 minute'
where assessment_id='22000000-0000-0000-0000-000000000001';

select dblink_send_query('phase14_publisher',format(
  'select public.phase14_test_try_stale_publish(%L::uuid,%L::uuid)',token,report_id
)) from phase14_stale_publication_context;
select dblink_send_query('phase14_recovery','select public.phase14_test_try_recovery()');

create temp table phase14_publisher_recovery_results(worker text,result text);
insert into phase14_publisher_recovery_results select 'stale-publisher',result
from dblink_get_result('phase14_publisher',false) as t(result text);
insert into phase14_publisher_recovery_results select 'recovery',result
from dblink_get_result('phase14_recovery',false) as t(result text);

do $assert_publisher_recovery$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into strict v_claim from public.report_generation_claims
  where assessment_id='22000000-0000-0000-0000-000000000001';
  if (select result from phase14_publisher_recovery_results where worker='stale-publisher')
       not like 'blocked:%'
     or (select result from phase14_publisher_recovery_results where worker='recovery')
       like 'blocked:%'
     or v_claim.claim_owner <> 'publisher-race-recovery'
     or v_claim.recovery_count <> 2
     or v_claim.claim_token = (select token from phase14_stale_publication_context) then
    raise exception 'Stale publisher/recovery race violated lease ownership: %, %',
      (select jsonb_agg(to_jsonb(r)) from phase14_publisher_recovery_results r),to_jsonb(v_claim);
  end if;
end
$assert_publisher_recovery$;

drop function public.phase14_test_try_stale_publish(uuid,uuid);
drop function public.phase14_test_try_recovery();
select dblink_disconnect('phase14_publisher');
select dblink_disconnect('phase14_recovery');

select set_config('phase14.authoritative_transition','migration',false);

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
select set_config('phase14.authoritative_transition','',false);

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

-- Two sessions must not consume the same independent customer-contact
-- verification.  One transaction wins the row locks; the other observes the
-- consumed state and is denied without creating a second remediation.
select set_config('phase14.authoritative_transition','migration',false);
insert into public.email_events(
  id,assessment_id,order_id,report_id,recipient_email,status,provider,
  provider_request_key,phase14_operation_ref
)
select '22000000-0000-0000-0000-000000000031',assessment_id,order_id,report_id,
  'concurrency@example.invalid','bounced','resend','phase14-contact-race-request',
  'phase14:contact-verification-race'
from public.report_generation_claims
where assessment_id='22000000-0000-0000-0000-000000000001';
select set_config('phase14.authoritative_transition','',false);

create temp table phase14_contact_context(verification_id uuid);
insert into phase14_contact_context
select public.create_customer_contact_verification(
  '22000000-0000-0000-0000-000000000003',
  'contact-race-winner@example.invalid','support_callback',
  'support-case-concurrent-consumption',600
);

create or replace function public.phase14_test_try_contact_consumption(
  p_event_id uuid,p_verification_id uuid
) returns text language plpgsql set search_path=''
as $test$
begin
  return public.authorize_bounced_report_redelivery(
    p_event_id,p_verification_id,'Concurrent verification consumption test.'
  )::text;
exception when others then
  return 'blocked:'||sqlerrm;
end
$test$;

select dblink_connect('phase14_contact_a','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_connect('phase14_contact_b','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_exec('phase14_contact_a', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000096"}'$$);
select dblink_exec('phase14_contact_b', $$set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"22000000-0000-0000-0000-000000000097"}'$$);
select dblink_send_query('phase14_contact_a',format(
  'select public.phase14_test_try_contact_consumption(%L::uuid,%L::uuid)',
  '22000000-0000-0000-0000-000000000031',verification_id
)) from phase14_contact_context;
select dblink_send_query('phase14_contact_b',format(
  'select public.phase14_test_try_contact_consumption(%L::uuid,%L::uuid)',
  '22000000-0000-0000-0000-000000000031',verification_id
)) from phase14_contact_context;
create temp table phase14_contact_results(worker text,result text);
insert into phase14_contact_results select 'contact-a',result
from dblink_get_result('phase14_contact_a',false) as t(result text);
insert into phase14_contact_results select 'contact-b',result
from dblink_get_result('phase14_contact_b',false) as t(result text);
do $assert_contact_race$
begin
  if (select count(*) from phase14_contact_results where result not like 'blocked:%')<>1
     or (select count(*) from phase14_contact_results where result like 'blocked:%')<>1
     or (select count(*) from public.report_delivery_remediations
         where prior_email_event_id='22000000-0000-0000-0000-000000000031')<>1
     or not exists(
       select 1 from public.customer_contact_verifications v
       join phase14_contact_context c on c.verification_id=v.id
       where v.status='consumed' and v.consumed_by_remediation_id is not null
     )
     or (select lower(customer_email::text) from public.orders
         where id='22000000-0000-0000-0000-000000000003')
        <>'contact-race-winner@example.invalid' then
    raise exception 'Concurrent contact verification was not exactly-once: %',
      (select jsonb_agg(to_jsonb(r)) from phase14_contact_results r);
  end if;
end
$assert_contact_race$;
drop function public.phase14_test_try_contact_consumption(uuid,uuid);
select dblink_disconnect('phase14_contact_a');
select dblink_disconnect('phase14_contact_b');

-- Expired step-lease recovery uses its own signed envelope.  Two independent
-- database sessions race the same locked capability; exactly one may replace
-- the execution identity and neither may advance the persisted business step.
do $lease_recovery_fixture$
declare v_secret_id uuid; v_epoch bigint; v_gate_version integer;
begin
  select authority_epoch,required_version into strict v_epoch,v_gate_version
  from public.phase14_security_gates where gate_key='phase14-premium-report';
  v_secret_id:=vault.create_secret(
    'phase14-multi-session-recovery-secret-000000000001',
    'phase14-multi-session-recovery-key','Disposable lease recovery test key',null
  );
  insert into phase14_private.worker_attestation_keys(key_id,vault_secret_id,status,valid_from)
  values ('multi-session-recovery-key',v_secret_id,'current',clock_timestamp()-interval '1 minute');
  set local session_replication_role=replica;
  insert into public.phase14_worker_capabilities(
    id,capability_type,policy_key,operation_key,issue_secret_hash,security_gate_version,
    authorised_by,authorised_session_id,reason,status,expires_at,lease_expires_at,
    lease_owner,lease_generation,last_heartbeat_at,takeover_count,authority_epoch,
    expected_step,workflow_execution_id
  ) values
  ('22000000-0000-0000-0000-000000000040','storage_cleanup','storage_cleanup',
    'phase14-recovery-race',repeat('1',64),v_gate_version,
    '22000000-0000-0000-0000-000000000020','22000000-0000-0000-0000-000000000091',
    'Concurrent expired-lease recovery test.','leased',clock_timestamp()+interval '2 hours',
    clock_timestamp()+interval '10 minutes','old-worker',7,clock_timestamp(),0,v_epoch,
    'cleanup_settle','old-worker'),
  ('22000000-0000-0000-0000-000000000041','storage_cleanup','storage_cleanup',
    'phase14-recovery-overall-expired',repeat('1',64),v_gate_version,
    '22000000-0000-0000-0000-000000000020','22000000-0000-0000-0000-000000000091',
    'Overall expiry recovery rejection test.','leased',clock_timestamp()-interval '1 second',
    clock_timestamp()-interval '2 minutes','expired-worker',3,clock_timestamp(),0,v_epoch,
    'cleanup_settle','expired-worker'),
  ('22000000-0000-0000-0000-000000000042','storage_cleanup','storage_cleanup',
    'phase14-recovery-restart',repeat('1',64),v_gate_version,
    '22000000-0000-0000-0000-000000000020','22000000-0000-0000-0000-000000000091',
    'Same-execution process restart test.','leased',clock_timestamp()+interval '2 hours',
    clock_timestamp()-interval '2 minutes','restart-worker',11,clock_timestamp(),0,v_epoch,
    'cleanup_settle','restart-worker'),
  ('22000000-0000-0000-0000-000000000043','storage_cleanup','storage_cleanup',
    'phase14-recovery-stale-epoch',repeat('1',64),v_gate_version,
    '22000000-0000-0000-0000-000000000020','22000000-0000-0000-0000-000000000091',
    'Stale authority epoch recovery rejection test.','leased',clock_timestamp()+interval '2 hours',
    clock_timestamp()-interval '2 minutes','stale-epoch-worker',5,clock_timestamp(),0,v_epoch+1,
    'cleanup_settle','stale-epoch-worker');
  set local session_replication_role=origin;
end
$lease_recovery_fixture$;

create or replace function public.phase14_test_try_expired_lease_recovery(
  p_capability_id uuid,p_old_execution text,p_new_execution text,p_generation integer,
  p_expected_step text,p_reason text,p_nonce uuid
) returns text language plpgsql security definer set search_path=''
as $test$
declare v_cap public.phase14_worker_capabilities%rowtype; v_now bigint; v_att jsonb;
  v_canonical text; v_signature text;
begin
  select * into strict v_cap from public.phase14_worker_capabilities where id=p_capability_id;
  v_now:=floor(extract(epoch from clock_timestamp()))::bigint;
  v_att:=jsonb_build_object(
    'key_id','multi-session-recovery-key','capability_id',v_cap.id::text,
    'capability_type',v_cap.capability_type,'operation_key',v_cap.operation_key,
    'old_execution_id',p_old_execution,'proposed_execution_id',p_new_execution,
    'expected_step',p_expected_step,'lease_generation',p_generation::text,
    'order_id',coalesce(v_cap.order_id::text,''),'assessment_id',coalesce(v_cap.assessment_id::text,''),
    'score_run_id',coalesce(v_cap.score_run_id::text,''),'fulfilment_id',coalesce(v_cap.fulfilment_id::text,''),
    'report_id',coalesce(v_cap.report_id::text,''),'recipient',coalesce(lower(v_cap.recipient_email::text),''),
    'authority_epoch',v_cap.authority_epoch::text,'reason',p_reason,
    'issued_at_epoch',v_now::text,'expires_at_epoch',(v_now+60)::text,'nonce',p_nonce::text
  );
  v_canonical:=concat_ws('|',v_att->>'key_id',v_att->>'capability_id',v_att->>'capability_type',
    v_att->>'operation_key',v_att->>'old_execution_id',v_att->>'proposed_execution_id',
    v_att->>'expected_step',v_att->>'lease_generation',v_att->>'order_id',v_att->>'assessment_id',
    v_att->>'score_run_id',v_att->>'fulfilment_id',v_att->>'report_id',v_att->>'recipient',
    v_att->>'authority_epoch',v_att->>'reason',v_att->>'issued_at_epoch',
    v_att->>'expires_at_epoch',v_att->>'nonce');
  v_signature:=encode(extensions.hmac(convert_to(v_canonical,'utf8'),
    convert_to('phase14-multi-session-recovery-secret-000000000001','utf8'),'sha256'),'hex');
  return public.recover_phase14_worker_capability_lease(v_att,v_signature)::text;
exception when others then return 'blocked:'||sqlerrm;
end
$test$;

create or replace function public.phase14_test_try_former_worker_attestation(
  p_capability_id uuid,p_execution text,p_generation integer,p_nonce uuid
) returns text language plpgsql security definer set search_path=''
as $test$
declare v_cap public.phase14_worker_capabilities%rowtype; v_now bigint; v_payload text:='{}';
  v_hash text; v_att jsonb; v_canonical text; v_signature text;
begin
  select * into strict v_cap from public.phase14_worker_capabilities where id=p_capability_id;
  v_now:=floor(extract(epoch from clock_timestamp()))::bigint;
  v_hash:=encode(extensions.digest(convert_to(v_payload,'utf8'),'sha256'),'hex');
  v_att:=jsonb_build_object(
    'key_id','multi-session-recovery-key','capability_id',v_cap.id::text,
    'capability_type',v_cap.capability_type,'operation_key',v_cap.operation_key,
    'execution_id',p_execution,'action','renew_phase14_worker_operation','step','cleanup_settle',
    'order_id','','assessment_id','','score_run_id','','fulfilment_id','','report_id','','recipient','',
    'lease_generation',p_generation::text,'request_payload_hash',v_hash,
    'issued_at_epoch',v_now::text,'expires_at_epoch',(v_now+60)::text,
    'nonce',p_nonce::text,'authority_epoch',v_cap.authority_epoch::text
  );
  v_canonical:=concat_ws('|',v_att->>'key_id',v_att->>'capability_id',v_att->>'capability_type',
    v_att->>'operation_key',v_att->>'execution_id',v_att->>'action',v_att->>'step',
    v_att->>'order_id',v_att->>'assessment_id',v_att->>'score_run_id',v_att->>'fulfilment_id',
    v_att->>'report_id',v_att->>'recipient',v_att->>'lease_generation',v_att->>'request_payload_hash',
    v_att->>'issued_at_epoch',v_att->>'expires_at_epoch',v_att->>'nonce',v_att->>'authority_epoch');
  v_signature:=encode(extensions.hmac(convert_to(v_canonical,'utf8'),
    convert_to('phase14-multi-session-recovery-secret-000000000001','utf8'),'sha256'),'hex');
  return public.execute_phase14_worker_step(v_att,v_signature,v_payload)::text;
exception when others then return 'blocked:'||sqlerrm;
end
$test$;

set request.jwt.claims='{"role":"service_role","exp":4102444800}';
do $before_expiry_and_bounded_failures$
declare v_result text;
begin
  v_result:=public.phase14_test_try_expired_lease_recovery(
    '22000000-0000-0000-0000-000000000040','old-worker','early-worker',7,
    'cleanup_settle','Takeover before expiry must fail.',gen_random_uuid());
  if v_result not like 'blocked:%phase14_worker_recovery_lease_not_expired%' then
    raise exception 'Takeover before lease expiry was not rejected: %',v_result;
  end if;
  v_result:=public.phase14_test_try_expired_lease_recovery(
    '22000000-0000-0000-0000-000000000041','expired-worker','replacement-worker',3,
    'cleanup_settle','Overall expiry must block recovery.',gen_random_uuid());
  if v_result not like 'blocked:%phase14_worker_recovery_capability_expired%' then
    raise exception 'Overall capability expiry did not block recovery: %',v_result;
  end if;
  v_result:=public.phase14_test_try_expired_lease_recovery(
    '22000000-0000-0000-0000-000000000043','stale-epoch-worker','replacement-worker',5,
    'cleanup_settle','Authority epoch mismatch must block recovery.',gen_random_uuid());
  if v_result not like 'blocked:%phase14_worker_recovery_authority_epoch_stale%' then
    raise exception 'Authority epoch mismatch did not block recovery: %',v_result;
  end if;
  v_result:=public.phase14_test_try_expired_lease_recovery(
    '22000000-0000-0000-0000-000000000042','restart-worker','restart-worker',11,
    'cleanup_settle','Controlled resumption after process restart.',gen_random_uuid());
  if v_result like 'blocked:%' then raise exception 'Same-execution restart recovery failed: %',v_result; end if;
end
$before_expiry_and_bounded_failures$;

update public.phase14_worker_capabilities set lease_expires_at=clock_timestamp()-interval '1 minute'
where id='22000000-0000-0000-0000-000000000040';
select dblink_connect('phase14_takeover_a','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_connect('phase14_takeover_b','host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres');
select dblink_exec('phase14_takeover_a',$$set request.jwt.claims='{"role":"service_role","exp":4102444800}'$$);
select dblink_exec('phase14_takeover_b',$$set request.jwt.claims='{"role":"service_role","exp":4102444800}'$$);
select dblink_send_query('phase14_takeover_a',$$
  select public.phase14_test_try_expired_lease_recovery(
    '22000000-0000-0000-0000-000000000040','old-worker','replacement-a',7,
    'cleanup_settle','Competing replacement worker A.','22000000-0000-0000-0000-000000000044')
$$);
select dblink_send_query('phase14_takeover_b',$$
  select public.phase14_test_try_expired_lease_recovery(
    '22000000-0000-0000-0000-000000000040','old-worker','replacement-b',7,
    'cleanup_settle','Competing replacement worker B.','22000000-0000-0000-0000-000000000045')
$$);
create temp table phase14_takeover_results(worker text,result text);
insert into phase14_takeover_results select 'a',result
from dblink_get_result('phase14_takeover_a',false) as t(result text);
insert into phase14_takeover_results select 'b',result
from dblink_get_result('phase14_takeover_b',false) as t(result text);
select dblink_disconnect('phase14_takeover_a');
select dblink_disconnect('phase14_takeover_b');

do $assert_expired_lease_race$
declare v_cap public.phase14_worker_capabilities%rowtype; v_former text; v_stale text;
begin
  select * into strict v_cap from public.phase14_worker_capabilities
  where id='22000000-0000-0000-0000-000000000040';
  if (select count(*) from phase14_takeover_results where result not like 'blocked:%')<>1
     or (select count(*) from phase14_takeover_results where result like 'blocked:%')<>1
     or v_cap.workflow_execution_id not in ('replacement-a','replacement-b')
     or v_cap.lease_generation<>8 or v_cap.takeover_count<>1
     or v_cap.expected_step<>'cleanup_settle' then
    raise exception 'Expired-lease election was not exactly-one/preserved-step: %, %',
      (select jsonb_agg(to_jsonb(r)) from phase14_takeover_results r),to_jsonb(v_cap);
  end if;
  v_former:=public.phase14_test_try_former_worker_attestation(v_cap.id,'old-worker',7,gen_random_uuid());
  v_stale:=public.phase14_test_try_former_worker_attestation(v_cap.id,v_cap.workflow_execution_id,7,gen_random_uuid());
  if v_former not like 'blocked:%phase14_worker_attestation_step_or_lease_invalid%'
     or v_stale not like 'blocked:%phase14_worker_attestation_step_or_lease_invalid%' then
    raise exception 'Former execution or stale generation remained usable: %, %',v_former,v_stale;
  end if;
  if (select count(*) from public.audit_logs where entity_id=v_cap.id
      and action='phase14_worker_expired_lease_recovered')<>1 then
    raise exception 'Recovery audit evidence was not exactly once';
  end if;
  if not exists(select 1 from public.phase14_worker_capabilities
      where id='22000000-0000-0000-0000-000000000042'
        and workflow_execution_id='restart-worker' and lease_generation=12
        and expected_step='cleanup_settle' and takeover_count=1) then
    raise exception 'Controlled process-restart resumption did not preserve its step';
  end if;
end
$assert_expired_lease_race$;

drop function public.phase14_test_try_former_worker_attestation(uuid,text,integer,uuid);
drop function public.phase14_test_try_expired_lease_recovery(uuid,text,text,integer,text,text,uuid);
set request.jwt.claims='';

set request.jwt.claims = '';
begin;
set local session_replication_role = replica;
delete from storage.objects where bucket_id='generated-reports'
  and (name like 'PH14-MULTI-SESSION/%' or name like 'tmp/PH14-MULTI-SESSION/%');
delete from public.assessment_events
where assessment_id='22000000-0000-0000-0000-000000000001'
  and dedupe_key like 'phase14-bounce-remediation:%';
delete from public.audit_logs
where assessment_id='22000000-0000-0000-0000-000000000001'
  and entity_table in ('customer_contact_verifications','report_delivery_remediations');
delete from public.customer_contact_verifications
where order_id='22000000-0000-0000-0000-000000000003';
delete from public.report_delivery_remediations
where prior_email_event_id='22000000-0000-0000-0000-000000000031';
delete from public.email_events where id='22000000-0000-0000-0000-000000000031';
delete from public.email_provider_events where email_event_id = '22000000-0000-0000-0000-000000000030';
delete from public.email_events where id = '22000000-0000-0000-0000-000000000030';
delete from public.report_generation_claims where assessment_id = '22000000-0000-0000-0000-000000000001';
delete from public.reports where assessment_id = '22000000-0000-0000-0000-000000000001';
delete from public.orders where id = '22000000-0000-0000-0000-000000000003';
delete from public.score_question_traces where score_run_id = '22000000-0000-0000-0000-000000000002';
delete from public.score_domain_results where score_run_id = '22000000-0000-0000-0000-000000000002';
delete from public.assessments where id = '22000000-0000-0000-0000-000000000001';
delete from public.score_runs where id = '22000000-0000-0000-0000-000000000002';
update public.phase14_feature_policies
set enabled=false,approved_gate_version=null,approved_authority_epoch=null,
    approved_at=null,updated_by=null,
    reason='Multi-session test cleanup restored the inert policy.',updated_at=now()
where policy_key in ('manual_generation','manual_delivery','automatic_fulfilment','storage_cleanup');
delete from public.audit_logs where entity_table='phase14_worker_capabilities'
  and entity_id in ('22000000-0000-0000-0000-000000000040','22000000-0000-0000-0000-000000000042');
delete from phase14_private.worker_recovery_nonces
where capability_id in (
  '22000000-0000-0000-0000-000000000040','22000000-0000-0000-0000-000000000041',
  '22000000-0000-0000-0000-000000000042','22000000-0000-0000-0000-000000000043'
);
delete from public.phase14_worker_capabilities where id in (
  '22000000-0000-0000-0000-000000000040','22000000-0000-0000-0000-000000000041',
  '22000000-0000-0000-0000-000000000042','22000000-0000-0000-0000-000000000043'
);
with removed_key as (
  delete from phase14_private.worker_attestation_keys where key_id='multi-session-recovery-key'
  returning vault_secret_id
)
delete from vault.secrets where id in (select vault_secret_id from removed_key);
delete from public.admin_profiles where id = '22000000-0000-0000-0000-000000000020';
delete from auth.sessions where user_id='22000000-0000-0000-0000-000000000020';
update public.phase14_security_gates
set satisfied_version = 0, status = 'unsatisfied', satisfied_by = null, satisfied_at = null,
    reason = 'Multi-session test cleanup restored the inert gate.', updated_at = now()
where gate_key = 'phase14-premium-report';
commit;

-- dblink is a test-only dependency. Remove its public extension-owned
-- functions so subsequent schema-equivalence snapshots observe only the
-- application schema produced by migrations.
drop extension dblink;

select 'phase14_multi_session_concurrency_tests_passed' as result;

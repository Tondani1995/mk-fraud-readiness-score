\set ON_ERROR_STOP on
begin;

set local session_replication_role = replica;
insert into public.audit_logs(id,actor_type,entity_table,action,after_json,phase14_operation_ref)
values ('26000000-0000-0000-0000-000000000001','system','reports','report_generated','{}','phase14:runtime-guard-audit');
insert into public.report_events(id,report_id,event_type,metadata_json,phase14_operation_ref)
values ('26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000099',
  'generated','{}','phase14:runtime-guard-report');
insert into public.assessment_events(id,assessment_id,event_type,dedupe_key,metadata_json,phase14_operation_ref)
values ('26000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000098',
  'report_generated','phase14-runtime-guard-fixture','{}','phase14:runtime-guard-assessment');
insert into public.email_events(id,recipient_email,status,notification_type,provider_request_key,phase14_operation_ref)
values ('26000000-0000-0000-0000-000000000004','guard@example.invalid','queued',
  'premium_report_pdf','phase14-runtime-guard-request','phase14:runtime-guard-email');
insert into public.email_provider_events(
  id,email_event_id,provider,provider_event_id,event_type,payload_json,supported_event,phase14_operation_ref
) values (
  '26000000-0000-0000-0000-000000000005','26000000-0000-0000-0000-000000000004',
  'resend','phase14-runtime-guard-event','email.sent','{}',true,'phase14:runtime-guard-provider'
);
set local session_replication_role = origin;

create or replace function public.phase14_test_expect_error(p_sql text,p_pattern text)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then return; end if;
    raise exception 'unexpected error for [%]: %',p_sql,sqlerrm;
  end;
  raise exception 'statement unexpectedly succeeded: %',p_sql;
end;
$function$;

create or replace function public.phase14_test_service_role_mutations()
returns void
language plpgsql
set search_path = ''
as $function$
declare v_row record;
begin
  -- 'reports' predates Phase 14 (migration 0001) and is a cross-phase shared table: migration
  -- 0023 (Phase 1's own manual-fulfilment-recovery migration, out of scope for this remediation
  -- pass) explicitly grants service_role direct `select, insert, update` on it for its own
  -- security-definer-gated RPCs -- a disclosed, intentional, pre-existing design independent of
  -- the strictly RPC-only Phase 14 operational tables below. It is excluded from this loop (which
  -- asserts a genuine Postgres GRANT-level 'permission denied' on every mutation verb) and
  -- checked separately for exactly the boundary that must still hold: service_role must never
  -- gain DELETE or TRUNCATE on it, regardless of the legitimate insert/update grant.
  perform public.phase14_test_expect_error('delete from public.reports where false','%permission denied%');
  perform public.phase14_test_expect_error('truncate public.reports','%permission denied%');

  for v_row in select * from (values
    ('report_fulfilments','id'),('report_generation_runs','id'),
    ('report_ai_attempts','id'),('report_generation_claims','assessment_id'),
    ('report_delivery_authorizations','id'),('report_delivery_finalizations','authorization_id'),
    ('report_delivery_remediations','id'),('phase14_operational_alerts','id'),
    ('phase14_storage_cleanup_queue','id'),('phase14_provider_attestations','id'),
    ('phase14_provider_attestation_consumptions','attestation_id'),
    ('phase14_worker_capabilities','id'),('phase14_feature_policies','policy_key'),
    ('phase14_security_gates','gate_key'),('phase14_ai_route_policies','requested_provider')
  ) as x(table_name,key_column)
  loop
    perform public.phase14_test_expect_error(
      format('insert into public.%I default values',v_row.table_name),'%permission denied%');
    perform public.phase14_test_expect_error(
      format('update public.%I set %I=%I where false',v_row.table_name,v_row.key_column,v_row.key_column),
      '%permission denied%');
    perform public.phase14_test_expect_error(
      format('delete from public.%I where false',v_row.table_name),'%permission denied%');
    perform public.phase14_test_expect_error(
      format('truncate public.%I',v_row.table_name),'%permission denied%');
  end loop;

  perform set_config('phase14.authoritative_transition','',true);
  perform public.phase14_test_expect_error(
    $$insert into public.audit_logs(actor_type,entity_table,action,after_json)
      values('system','reports','report_generated','{}')$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$update public.audit_logs set after_json='{}' where id='26000000-0000-0000-0000-000000000001'$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$delete from public.audit_logs where id='26000000-0000-0000-0000-000000000001'$$,
    '%phase14_authoritative_rpc_required%');

  perform public.phase14_test_expect_error(
    $$insert into public.report_events(report_id,event_type,metadata_json)
      values('26000000-0000-0000-0000-000000000099','generated','{}')$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$update public.report_events set metadata_json='{}' where id='26000000-0000-0000-0000-000000000002'$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$delete from public.report_events where id='26000000-0000-0000-0000-000000000002'$$,
    '%phase14_authoritative_rpc_required%');

  perform public.phase14_test_expect_error(
    $$insert into public.assessment_events(assessment_id,event_type,dedupe_key,metadata_json)
      values('26000000-0000-0000-0000-000000000098','report_generated','forged','{}')$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$update public.assessment_events set metadata_json='{}' where id='26000000-0000-0000-0000-000000000003'$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$delete from public.assessment_events where id='26000000-0000-0000-0000-000000000003'$$,
    '%phase14_authoritative_rpc_required%');

  perform public.phase14_test_expect_error(
    $$insert into public.email_events(recipient_email,status,notification_type,provider_request_key)
      values('forged@example.invalid','queued','premium_report_pdf','forged-request')$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$update public.email_events set status='sending' where id='26000000-0000-0000-0000-000000000004'$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$delete from public.email_events where id='26000000-0000-0000-0000-000000000004'$$,
    '%phase14_authoritative_rpc_required%');

  perform public.phase14_test_expect_error(
    $$insert into public.email_provider_events(provider,provider_event_id,event_type,payload_json,phase14_operation_ref)
      values('resend','forged-provider-event','email.sent','{}','phase14:forged-provider-event')$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$update public.email_provider_events set payload_json='{}' where id='26000000-0000-0000-0000-000000000005'$$,
    '%phase14_authoritative_rpc_required%');
  perform public.phase14_test_expect_error(
    $$delete from public.email_provider_events where id='26000000-0000-0000-0000-000000000005'$$,
    '%phase14_authoritative_rpc_required%');

  -- A generic caller cannot bypass the guard by inventing a GUC value.
  perform set_config('phase14.authoritative_transition','forged_context',true);
  perform public.phase14_test_expect_error(
    $$insert into public.audit_logs(actor_type,entity_table,action,after_json)
      values('system','reports','report_generated','{}')$$,
    '%phase14_authoritative_rpc_required%');

  for v_row in select * from (values
    ('audit_logs'),('report_events'),('assessment_events'),
    ('email_events'),('email_provider_events')
  ) as x(table_name)
  loop
    perform public.phase14_test_expect_error(
      format('truncate public.%I',v_row.table_name),'%permission denied%');
  end loop;
end;
$function$;

grant execute on function public.phase14_test_expect_error(text,text) to service_role;
grant execute on function public.phase14_test_service_role_mutations() to service_role;
grant execute on function public.phase14_test_expect_error(text,text) to authenticated;
set local role service_role;
select public.phase14_test_service_role_mutations();
reset role;
set local role authenticated;
select public.phase14_test_expect_error(
  $$select public.resolve_premium_report_delivery_reconciliation(
    null::uuid,'accepted',null::text,'{}'::jsonb,false,'caller-authored evidence')$$,
  '%permission denied%'
);
reset role;

-- ===========================================================================
-- Positive-path regression (migration 0033): Phase 1's manual report
-- generation RPC chain (claim -> start -> complete) must succeed end-to-end
-- against the FULL migration set, including 0017's authoritative-mutation
-- guard exercised above in phase14_test_service_role_mutations(). Before
-- 0033, complete_manual_report_generation's insert into report_events was
-- rejected with phase14_authoritative_rpc_required on every real production
-- attempt (see 0033's migration header for the full incident). The isolated
-- Phase 1 harness (scripts/phase1-0023-replay-tests.sh) never caught this:
-- it resets to schema version 0016 and applies only 0023 in isolation, so
-- 0017's guard trigger never exists in that database. This block runs in the
-- ordinary full migration chain, so it is the first regression coverage that
-- actually exercises 0017 and 0023/0033 together, the exact combination that
-- broke in production.
-- ===========================================================================

select id as phase1_methodology_id from public.methodology_versions where status = 'active' limit 1 \gset
select id as phase1_product_id from public.products where product_code = 'essential_self_assessment' limit 1 \gset
select id as phase1_template_id from public.report_templates where status = 'active' and report_type = 'essential_self_assessment' order by version_number desc limit 1 \gset

-- NOTE: psql does not interpolate :'var' references inside dollar-quoted
-- (do $$ ... $$) bodies -- that is deliberate psql behaviour, so that a
-- PL/pgSQL function body's own use of ':=' and similar is never corrupted by
-- variable substitution. Every assertion below is therefore written as a
-- plain top-level statement (where substitution does apply), using a
-- division-by-zero as the "raise an error" mechanism in place of a plpgsql
-- raise exception -- ON_ERROR_STOP still aborts the script on the resulting
-- SQL error either way.

set local session_replication_role = replica;

insert into public.organisations(id, legal_name)
values ('27000000-0000-0000-0000-000000000001', 'Phase 1 Guard Regression Org');

insert into public.admin_profiles(id, email, full_name, role, status, mfa_required)
values ('27000000-0000-0000-0000-000000000002', 'phase1-guard-regression@example.invalid',
  'Phase1 Guard Regression Admin', 'platform_admin', 'active', false);

insert into public.assessments(id, assessment_reference, organisation_id, methodology_version_id, status, submitted_at, locked_at, current_score_run_id)
values ('27000000-0000-0000-0000-000000000003', 'PH1-GUARD-REGRESSION',
  '27000000-0000-0000-0000-000000000001', :'phase1_methodology_id', 'scored', now(), now(),
  '27000000-0000-0000-0000-000000000004');

insert into public.score_runs(
  id, assessment_id, methodology_version_id, run_number, run_type, status,
  overall_score, calculated_maturity, final_maturity, exposure_score, exposure_band,
  coverage_pct, n_a_rate_pct, critical_gap_count, major_gap_count, cap_applied, input_hash, locked_at
) values (
  '27000000-0000-0000-0000-000000000004', '27000000-0000-0000-0000-000000000003',
  :'phase1_methodology_id', 1, 'test_fixture', 'completed', 60,
  'Developing', 'Developing', 40, 'High', 100, 0, 0, 0, false, repeat('d',64), now()
);

insert into public.orders(
  id, order_reference, assessment_id, product_id, status, amount_cents, currency,
  product_name, customer_email, customer_name, organisation_name, verified_at, verified_by
) values (
  '27000000-0000-0000-0000-000000000005', 'ORDER-PH1-GUARD-REGRESSION',
  '27000000-0000-0000-0000-000000000003', :'phase1_product_id', 'payment_received', 500000, 'ZAR',
  'Essential Self-Assessment', 'phase1-guard-regression@example.invalid',
  'Phase1 Guard Regression', 'Phase 1 Guard Regression Org', now(),
  '27000000-0000-0000-0000-000000000002'
);

set local session_replication_role = origin;

set local role service_role;

select public.claim_manual_report_generation(
  'ORDER-PH1-GUARD-REGRESSION', '27000000-0000-0000-0000-000000000002',
  'ph1-guard-regression-request', 'admin_generate', '27000000-0000-0000-0000-000000000006'
) as phase1_claim \gset

select case when (:'phase1_claim'::jsonb ->> 'claimed')::boolean then 1 else 1/0 end
  as phase1_claim_assertion;

select :'phase1_claim'::jsonb -> 'attempt' ->> 'id' as phase1_attempt_id \gset

select public.start_manual_report_generation(:'phase1_attempt_id'::uuid) as phase1_start \gset

select public.complete_manual_report_generation(
  :'phase1_attempt_id'::uuid,
  :'phase1_template_id'::uuid,
  'essential_self_assessment'::public.report_type,
  'generated-reports',
  'phase1-guard-regression-org/27000000-0000-0000-0000-000000000005/v1/report.pdf',
  'report.pdf',
  'application/pdf',
  1024,
  repeat('e',64)
) as phase1_complete \gset

-- If the report_events authoritative-context regression reappeared, the RPC
-- either raised (aborting the script under ON_ERROR_STOP before this point)
-- or returned no report; the ::uuid cast below fails loudly on an
-- empty/invalid id either way, so no separate null-check is needed here.
select (:'phase1_complete'::jsonb -> 'report' ->> 'id')::uuid as phase1_report_id \gset

-- TEMPORARY DIAGNOSTIC (to be removed once CI run #3's division-by-zero is
-- root-caused): dump the intermediate values feeding the assertion below.
select :'phase1_attempt_id' as diag_attempt_id;
select :'phase1_report_id' as diag_report_id;
select :'phase1_complete' as diag_complete_raw;
select report_id, event_type, from_status, to_status
  from public.report_events
  where report_id = :'phase1_report_id'::uuid;
select count(*) as diag_report_id_only_count
  from public.report_events
  where report_id = :'phase1_report_id'::uuid;

select case when (
  select count(*) from public.report_events
  where report_id = :'phase1_report_id'::uuid and event_type = 'generated'
) = 1 then 1 else 1/0 end as phase1_report_event_assertion;

select case when (
  select status from public.manual_report_generation_attempts where id = :'phase1_attempt_id'::uuid
) = 'REPORT_READY' then 1 else 1/0 end as phase1_attempt_ready_assertion;

reset role;

rollback;
select 'phase14_runtime_mutation_guard_tests_passed' as result;

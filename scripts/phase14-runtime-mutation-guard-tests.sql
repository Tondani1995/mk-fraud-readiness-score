\set ON_ERROR_STOP on
begin;

set local session_replication_role = replica;
insert into public.audit_logs(id,actor_type,entity_table,action,after_json)
values ('26000000-0000-0000-0000-000000000001','system','reports','report_generated','{}');
insert into public.report_events(id,report_id,event_type,metadata_json)
values ('26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000099',
  'generated','{}');
insert into public.assessment_events(id,assessment_id,event_type,dedupe_key,metadata_json)
values ('26000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000098',
  'report_generated','phase14-runtime-guard-fixture','{}');
insert into public.email_events(id,recipient_email,status,notification_type,provider_request_key)
values ('26000000-0000-0000-0000-000000000004','guard@example.invalid','queued',
  'premium_report_pdf','phase14-runtime-guard-request');
insert into public.email_provider_events(
  id,email_event_id,provider,provider_event_id,event_type,payload_json,supported_event
) values (
  '26000000-0000-0000-0000-000000000005','26000000-0000-0000-0000-000000000004',
  'resend','phase14-runtime-guard-event','email.sent','{}',true
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
  for v_row in select * from (values
    ('reports','id'),('report_fulfilments','id'),('report_generation_runs','id'),
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
    $$insert into public.email_provider_events(provider,provider_event_id,event_type,payload_json)
      values('resend','forged-provider-event','email.sent','{}')$$,
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

rollback;
select 'phase14_runtime_mutation_guard_tests_passed' as result;

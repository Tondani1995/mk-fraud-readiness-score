\set ON_ERROR_STOP on

-- Disposable synthetic rows exercise every pre-existing Phase 14 data table.
-- Addresses use .invalid and no external operation is invoked.
begin;
set local session_replication_role=replica;
insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
values ('27000000-0000-0000-0000-000000000020','production-history@example.invalid',
  'Production History Fixture','platform_admin','active',true);
do $fixture$
declare v_methodology uuid; v_product uuid; v_template uuid;
begin
  select id into strict v_methodology from public.methodology_versions where status='active';
  select id into strict v_product from public.products where product_code='essential_self_assessment';
  select id into strict v_template from public.report_templates
    where report_type='essential_self_assessment' and status='active'
    order by version_number desc limit 1;
  -- Migration 0023 (phase1_manual_fulfilment_recovery) adds
  -- public.reports.organisation_id with a foreign key to public.organisations, and backfills it
  -- from public.assessments.organisation_id for every existing report. This fixture referenced
  -- organisation '...0010' via the assessments row below without ever inserting it, which was
  -- never caught before because the "Prove exact production-history convergence without external
  -- writes" step could not previously run to completion (blocked by an unrelated ordering bug
  -- fixed earlier in this same remediation pass) -- confirmed via the real failing job log on
  -- this exact head: "ERROR: insert or update on table reports violates foreign key constraint
  -- reports_organisation_id_fkey" while 0023 backfilled this fixture's row. legal_name is the only
  -- required column beyond id.
  insert into public.organisations(id,legal_name)
  values ('27000000-0000-0000-0000-000000000010','Synthetic Fixture Org');
  insert into public.assessments(id,assessment_reference,organisation_id,methodology_version_id,status,
    submitted_at,locked_at,current_score_run_id)
  values ('27000000-0000-0000-0000-000000000001','PH14-PRODUCTION-HISTORY',
    '27000000-0000-0000-0000-000000000010',v_methodology,'scored',now(),now(),
    '27000000-0000-0000-0000-000000000002');
  insert into public.score_runs(id,assessment_id,methodology_version_id,run_number,run_type,status,
    overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,
    n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,input_hash,locked_at)
  values ('27000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000001',
    v_methodology,1,'test_fixture','completed',60,'Developing','Developing',40,'High',100,0,0,0,
    false,repeat('7',64),now());
  insert into public.orders(id,order_reference,assessment_id,product_id,status,amount_cents,currency,
    product_name,customer_email,customer_name,organisation_name,verified_at,verified_by)
  select '27000000-0000-0000-0000-000000000003','ORDER-PH14-PRODUCTION-HISTORY',
    '27000000-0000-0000-0000-000000000001',v_product,'payment_received',500000,'ZAR',name,
    'production-history@example.invalid','Synthetic Fixture','Synthetic Fixture Org',now(),
    '27000000-0000-0000-0000-000000000020' from public.products where id=v_product;
  insert into public.report_fulfilments(id,order_id,assessment_id,score_run_id,idempotency_key,
    trigger_source,status,current_step,requested_by_admin_user_id)
  values ('27000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000003',
    '27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002',
    'phase14-production-history-fixture','admin_generate','completed','fixture_complete',
    '27000000-0000-0000-0000-000000000020');
  insert into public.report_generation_runs(id,fulfilment_id,attempt_number,generation_mode,
    prompt_version,schema_version,evidence_checksum,status,completed_at)
  values ('27000000-0000-0000-0000-000000000005','27000000-0000-0000-0000-000000000004',
    1,'deterministic_fallback','production-history','production-history',repeat('8',64),'used',now());
  insert into public.reports(id,assessment_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,generated_at,
    fulfilment_id,generation_run_id)
  values ('27000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000001',
    '27000000-0000-0000-0000-000000000003','27000000-0000-0000-0000-000000000002',v_template,
    'essential_self_assessment','generated','RPT-PH14-PRODUCTION-HISTORY',1,'generated-reports',
    'PH14-PRODUCTION-HISTORY/synthetic.pdf',repeat('9',64),now(),
    '27000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000005');
  update public.report_fulfilments set report_id='27000000-0000-0000-0000-000000000006'
    where id='27000000-0000-0000-0000-000000000004';
  update public.report_generation_runs set report_id='27000000-0000-0000-0000-000000000006'
    where id='27000000-0000-0000-0000-000000000005';
  insert into public.email_events(id,assessment_id,order_id,report_id,recipient_email,
    provider_message_id,status,sent_at,provider_event_id,delivered_at,delivery_updated_at,attempt_number)
  values ('27000000-0000-0000-0000-000000000007','27000000-0000-0000-0000-000000000001',
    '27000000-0000-0000-0000-000000000003','27000000-0000-0000-0000-000000000006',
    'production-history@example.invalid','synthetic-provider-message','sent',now(),
    'synthetic-provider-event',now(),now(),1);
  insert into public.email_provider_events(id,email_event_id,provider,provider_event_id,
    provider_message_id,event_type,event_created_at,received_at,processed_at,payload_json)
  values ('27000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000007',
    'synthetic','synthetic-provider-event-1','synthetic-provider-message','email.delivered',
    now(),now(),now(),'{}');
end;
$fixture$;
set local session_replication_role=origin;
commit;

-- Stable columns that the reconciliation is forbidden to change.
select encode(extensions.digest(convert_to(string_agg(payload,E'\n' order by payload),'utf8'),'sha256'),'hex')
  as preservation_sha256
from (
  select 'fulfilment|'||id||'|'||order_id||'|'||assessment_id||'|'||score_run_id||'|'||
    idempotency_key||'|'||trigger_source from public.report_fulfilments where id='27000000-0000-0000-0000-000000000004'
  union all select 'run|'||id||'|'||fulfilment_id||'|'||attempt_number||'|'||generation_mode||'|'||
    evidence_checksum from public.report_generation_runs where id='27000000-0000-0000-0000-000000000005'
  union all select 'report|'||id||'|'||assessment_id||'|'||order_id||'|'||score_run_id||'|'||
    report_reference||'|'||version_number||'|'||checksum from public.reports where id='27000000-0000-0000-0000-000000000006'
  union all select 'email|'||id||'|'||assessment_id||'|'||order_id||'|'||report_id||'|'||
    recipient_email||'|'||provider_message_id from public.email_events where id='27000000-0000-0000-0000-000000000007'
  union all select 'provider|'||id||'|'||email_event_id||'|'||provider||'|'||provider_event_id||'|'||
    provider_message_id from public.email_provider_events where id='27000000-0000-0000-0000-000000000008'
) preserved(payload);

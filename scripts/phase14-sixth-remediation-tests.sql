\set ON_ERROR_STOP on

begin;
set local session_replication_role=replica;

insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
values ('26000000-0000-0000-0000-000000000020','sixth-remediation@example.invalid',
  'Sixth Remediation Admin','platform_admin','active',true);
insert into auth.sessions(id,user_id,aal,not_after)
values ('26000000-0000-0000-0000-000000000099',
  '26000000-0000-0000-0000-000000000020','aal2',now()+interval '1 day');

do $fixture$
declare v_methodology uuid; v_product uuid;
begin
  select id into strict v_methodology from public.methodology_versions where status='active';
  select id into strict v_product from public.products where product_code='essential_self_assessment';
  insert into public.assessments(
    id,assessment_reference,organisation_id,methodology_version_id,status,
    submitted_at,locked_at,current_score_run_id
  ) values (
    '26000000-0000-0000-0000-000000000001','PH14-SIXTH-REMEDIATION',
    '26000000-0000-0000-0000-000000000010',v_methodology,'scored',now(),now(),
    '26000000-0000-0000-0000-000000000002'
  );
  insert into public.score_runs(
    id,assessment_id,methodology_version_id,run_number,run_type,status,
    overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,
    coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,input_hash,locked_at
  ) values (
    '26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000001',
    v_methodology,1,'test_fixture','completed',60,'Developing','Developing',40,'High',
    100,0,0,0,false,repeat('a',64),now()
  );
  insert into public.score_domain_results(
    score_run_id,domain_id,raw_score,weighted_contribution,coverage_pct,critical_gap_count
  ) select '26000000-0000-0000-0000-000000000002',id,60,0,100,0
    from public.domains where methodology_version_id=v_methodology;
  insert into public.score_question_traces(
    score_run_id,question_id,response_value,normalised_score,question_weight,
    applicable,numerator_contribution,denominator_contribution
  ) select '26000000-0000-0000-0000-000000000002',id,3,60,weight,true,60*weight,100*weight
    from public.questions where methodology_version_id=v_methodology and active;
  insert into public.orders(
    id,order_reference,assessment_id,product_id,status,amount_cents,currency,
    product_name,customer_email,customer_name,organisation_name,verified_at,verified_by
  ) select '26000000-0000-0000-0000-000000000003','ORDER-PH14-SIXTH',
    '26000000-0000-0000-0000-000000000001',v_product,'payment_received',500000,'ZAR',
    name,'sixth@example.invalid','Sixth Test','Sixth Org',now(),
    '26000000-0000-0000-0000-000000000020'
  from public.products where id=v_product;
  insert into public.report_fulfilments(
    id,order_id,assessment_id,score_run_id,idempotency_key,trigger_source,status,current_step,
    requested_by_admin_user_id
  ) values (
    '26000000-0000-0000-0000-000000000004','26000000-0000-0000-0000-000000000003',
    '26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002',
    'phase14-sixth-remediation','payment_confirmation','queued','authorized_work',
    '26000000-0000-0000-0000-000000000020'
  );
end;
$fixture$;

set local session_replication_role=origin;

create or replace function pg_temp.phase14_test_attestation(
  p_capability_id uuid,p_execution_id text,p_action text,p_payload text,p_nonce uuid
) returns jsonb language plpgsql as $function$
declare v_cap public.phase14_worker_capabilities%rowtype; v_now bigint; v_hash text;
begin
  select * into strict v_cap from public.phase14_worker_capabilities where id=p_capability_id;
  v_now:=floor(extract(epoch from clock_timestamp()))::bigint;
  v_hash:=encode(extensions.digest(convert_to(p_payload,'utf8'),'sha256'),'hex');
  return jsonb_build_object(
    'key_id','sixth-test-key','capability_id',v_cap.id::text,
    'capability_type',v_cap.capability_type,'operation_key',v_cap.operation_key,
    'execution_id',p_execution_id,'action',p_action,'step',v_cap.expected_step,
    'order_id',coalesce(v_cap.order_id::text,''),'assessment_id',coalesce(v_cap.assessment_id::text,''),
    'score_run_id',coalesce(v_cap.score_run_id::text,''),'fulfilment_id',coalesce(v_cap.fulfilment_id::text,''),
    'report_id',coalesce((p_payload::jsonb->>'report_id'),v_cap.report_id::text,''),
    'recipient',coalesce(lower((p_payload::jsonb->>'recipient')),lower(v_cap.recipient_email::text),''),
    'lease_generation',v_cap.lease_generation::text,'request_payload_hash',v_hash,
    'issued_at_epoch',v_now::text,'expires_at_epoch',(v_now+60)::text,
    'nonce',p_nonce::text,'authority_epoch',v_cap.authority_epoch::text
  );
end;
$function$;

create or replace function pg_temp.phase14_test_signature(p_att jsonb)
returns text language sql as $function$
  select encode(extensions.hmac(convert_to(concat_ws('|',
    p_att->>'key_id',p_att->>'capability_id',p_att->>'capability_type',
    p_att->>'operation_key',p_att->>'execution_id',p_att->>'action',p_att->>'step',
    coalesce(p_att->>'order_id',''),coalesce(p_att->>'assessment_id',''),
    coalesce(p_att->>'score_run_id',''),coalesce(p_att->>'fulfilment_id',''),
    coalesce(p_att->>'report_id',''),coalesce(lower(p_att->>'recipient'),''),
    p_att->>'lease_generation',p_att->>'request_payload_hash',p_att->>'issued_at_epoch',
    p_att->>'expires_at_epoch',p_att->>'nonce',p_att->>'authority_epoch'
  ),'utf8'),convert_to('sixth-test-worker-attestation-secret-000000000001','utf8'),'sha256'),'hex');
$function$;

create or replace function pg_temp.phase14_call_step(
  p_capability_id uuid,p_execution_id text,p_action text,p_payload text,p_nonce uuid default extensions.gen_random_uuid()
) returns jsonb language plpgsql as $function$
declare v_att jsonb;
begin
  v_att:=pg_temp.phase14_test_attestation(p_capability_id,p_execution_id,p_action,p_payload,p_nonce);
  return public.execute_phase14_worker_step(v_att,pg_temp.phase14_test_signature(v_att),p_payload);
end;
$function$;

do $setup$
declare v_secret_id uuid;
begin
  v_secret_id:=vault.create_secret(
    'sixth-test-worker-attestation-secret-000000000001',
    'phase14-sixth-test-worker-key','Disposable local test key',null
  );
  insert into phase14_private.worker_attestation_keys(key_id,vault_secret_id,status,valid_from)
  values ('sixth-test-key',v_secret_id,'current',clock_timestamp()-interval '1 minute');
  perform set_config('request.jwt.claims',
    '{"sub":"26000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"26000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_security_gate_version(1,'Sixth remediation disposable behavioural test.');
  perform public.set_phase14_feature_policy('automatic_fulfilment',true,'Disposable attestation test.');
  perform public.set_phase14_feature_policy('ai_narrative',true,'Disposable authority-epoch test.');
  perform public.set_phase14_ai_route_policy('openai',true);
end;
$setup$;

do $test$
declare v_auth jsonb; v_cap uuid; v_result jsonb; v_nonce uuid:=extensions.gen_random_uuid();
  v_att jsonb; v_stale jsonb;
begin
  v_auth:=public.authorize_phase14_worker_operation(
    'generation_recovery','sixth-generation-recovery',
    '26000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000004',
    null,null,3600,'Sixth remediation generation-recovery capability.'
  );
  v_cap:=(v_auth->>'capability_id')::uuid;
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);

  if has_function_privilege('service_role','public.worker_commit_premium_report_draft(uuid,uuid,uuid,text,text,text,uuid)','EXECUTE')
     or has_function_privilege('service_role','public.claim_phase14_worker_operation(uuid,text)','EXECUTE') then
    raise exception 'Legacy capability-ID-only worker facade remains executable';
  end if;
  begin
    perform public.execute_phase14_worker_step(
      pg_temp.phase14_test_attestation(v_cap,'sixth-worker','claim_phase14_worker_operation','{}',extensions.gen_random_uuid()),
      repeat('0',64),'{}');
    raise exception 'NO_EXPECTED_EXCEPTION:forged_worker_hmac';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:forged_worker_hmac' then raise; end if;
    if sqlerrm not like '%phase14_worker_attestation_signature_invalid%' then raise; end if;
  end;

  v_result:=pg_temp.phase14_call_step(v_cap,'sixth-worker','claim_phase14_worker_operation','{}');
  if v_result->>'expected_step'<>'generation_claim' then raise exception 'Generation recovery did not enter generation_claim'; end if;

  begin
    perform pg_temp.phase14_call_step(v_cap,'other-worker','worker_claim_premium_report_generation',
      '{"order_reference":"ORDER-PH14-SIXTH","claim_owner":"other","fulfilment_id":"26000000-0000-0000-0000-000000000004","report_type":"essential_self_assessment"}');
    raise exception 'NO_EXPECTED_EXCEPTION:other_worker_attestation';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:other_worker_attestation' then raise; end if;
    if sqlerrm not like '%phase14_worker_attestation_step_or_lease_invalid%' then raise; end if;
  end;

  begin
    perform pg_temp.phase14_call_step(v_cap,'sixth-worker','worker_commit_premium_report_draft',
      '{"claim_token":"26000000-0000-0000-0000-000000000090","template_id":"26000000-0000-0000-0000-000000000091","storage_bucket":"generated-reports","temp_storage_path":"tmp/skip.pdf","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","generation_run_id":"26000000-0000-0000-0000-000000000092"}');
    raise exception 'NO_EXPECTED_EXCEPTION:skip_to_draft_commit';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:skip_to_draft_commit' then raise; end if;
    if sqlerrm not like '%phase14_worker_step_out_of_order%' then raise; end if;
  end;

  v_result:=pg_temp.phase14_call_step(v_cap,'sixth-worker','worker_claim_premium_report_generation',
    '{"order_reference":"ORDER-PH14-SIXTH","claim_owner":"sixth-worker","fulfilment_id":"26000000-0000-0000-0000-000000000004","report_type":"essential_self_assessment"}',v_nonce);
  if not (v_result->'result'->>'claimed')::boolean then raise exception 'Attested generation claim failed'; end if;

  v_stale:=pg_temp.phase14_test_attestation(v_cap,'sixth-worker','transition_premium_report_fulfilment',
    '{"fulfilment_id":"26000000-0000-0000-0000-000000000004","status":"assembling","current_step":"assemble_evidence","generation_mode":null,"report_id":null,"increment_attempt":true,"error_code":null,"error_message":null}',extensions.gen_random_uuid());
  v_stale:=jsonb_set(v_stale,'{lease_generation}',to_jsonb(((v_stale->>'lease_generation')::integer-1)::text));
  begin
    perform public.execute_phase14_worker_step(v_stale,pg_temp.phase14_test_signature(v_stale),
      '{"fulfilment_id":"26000000-0000-0000-0000-000000000004","status":"assembling","current_step":"assemble_evidence","generation_mode":null,"report_id":null,"increment_attempt":true,"error_code":null,"error_message":null}');
    raise exception 'NO_EXPECTED_EXCEPTION:stale_lease_generation';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:stale_lease_generation' then raise; end if;
    if sqlerrm not like '%phase14_worker_attestation_step_or_lease_invalid%' then raise; end if;
  end;

  begin
    perform pg_temp.phase14_call_step(v_cap,'sixth-worker','transition_premium_report_fulfilment',
      '{"fulfilment_id":"26000000-0000-0000-0000-000000000004","status":"assembling","current_step":"assemble_evidence","generation_mode":null,"report_id":null,"increment_attempt":true,"error_code":null,"error_message":null}',v_nonce);
    raise exception 'NO_EXPECTED_EXCEPTION:nonce_replay';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:nonce_replay' then raise; end if;
    if sqlerrm not like '%phase14_worker_attestation_replay%' then raise; end if;
  end;
  perform pg_temp.phase14_call_step(v_cap,'sixth-worker','transition_premium_report_fulfilment',
    '{"fulfilment_id":"26000000-0000-0000-0000-000000000004","status":"assembling","current_step":"assemble_evidence","generation_mode":null,"report_id":null,"increment_attempt":true,"error_code":null,"error_message":null}');
end;
$test$;

do $test$
declare v_auth jsonb; v_cap uuid; v_result jsonb; v_outbox uuid; v_epoch bigint;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"26000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"26000000-0000-0000-0000-000000000099"}',true);
  v_auth:=public.authorize_phase14_worker_operation(
    'automatic_generation','sixth-workflow-start',
    '26000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000004',
    null,null,3600,'Sixth remediation workflow-start outbox capability.'
  );
  v_cap:=(v_auth->>'capability_id')::uuid;
  select authority_epoch into v_epoch from public.phase14_security_gates where gate_key='phase14-premium-report';
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  perform pg_temp.phase14_call_step(v_cap,'sixth-workflow','claim_phase14_worker_operation','{}');
  begin
    perform pg_temp.phase14_call_step(v_cap,'competing-dispatcher','claim_premium_report_workflow_start',
      '{"fulfilment_id":"26000000-0000-0000-0000-000000000004"}');
    raise exception 'NO_EXPECTED_EXCEPTION:competing_dispatcher';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:competing_dispatcher' then raise; end if;
  end;
  v_result:=pg_temp.phase14_call_step(v_cap,'sixth-workflow','claim_premium_report_workflow_start',
    '{"fulfilment_id":"26000000-0000-0000-0000-000000000004"}');
  v_outbox:=(v_result->'result'->>'outbox_id')::uuid;
  perform pg_temp.phase14_call_step(v_cap,'sixth-workflow','mark_phase14_workflow_start_dispatching',
    jsonb_build_object('outbox_id',v_outbox)::text);
  v_result:=pg_temp.phase14_call_step(v_cap,'sixth-workflow','record_premium_report_workflow_start',
    jsonb_build_object('outbox_id',v_outbox,'run_id',null,'error','lost provider response')::text);
  if v_result->'result'->>'status'<>'reconciliation_required' then
    raise exception 'Lost workflow response was not retained as reconciliation_required';
  end if;
  if exists(select 1 from public.phase14_workflow_start_outbox where id=v_outbox and status='failed_before_provider') then
    raise exception 'Uncertain workflow acceptance was misclassified as failed_before_provider';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"26000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"26000000-0000-0000-0000-000000000099"}',true);
  perform public.suspend_phase14_security_gate('Exercise same-version authority epoch invalidation.');
  perform public.set_phase14_security_gate_version(1,'Re-satisfy the same numeric version under a new epoch.');
  if (select authority_epoch from public.phase14_security_gates where gate_key='phase14-premium-report')<>v_epoch+2 then
    raise exception 'Authority epoch did not advance for suspend and same-version re-satisfaction';
  end if;
  if exists(select 1 from public.phase14_feature_policies where enabled or approved_authority_epoch is not null) then
    raise exception 'Feature policy authority survived an epoch change';
  end if;
  if exists(select 1 from public.phase14_ai_route_policies where enabled or approved_authority_epoch is not null) then
    raise exception 'AI route authority survived an epoch change';
  end if;
  if exists(select 1 from public.phase14_worker_capabilities where id=v_cap and status<>'revoked') then
    raise exception 'Worker capability survived an epoch change';
  end if;
end;
$test$;

-- The terminal publication RPC is exercised at every declared fault point.
-- Each call runs in a PL/pgSQL subtransaction, so the assertions prove that
-- the complete business transition (including nonce consumption) rolled back.
do $terminal_fixture$
declare v_epoch bigint; v_template uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"26000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"26000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_feature_policy('automatic_fulfilment',true,
    'Disposable terminal-publication rollback test.');
  select authority_epoch into strict v_epoch from public.phase14_security_gates
  where gate_key='phase14-premium-report';
  select id into strict v_template from public.report_templates
  where report_type='essential_self_assessment' and status='active'
  order by version_number desc limit 1;

  set local session_replication_role=replica;
  delete from public.report_generation_claims
  where assessment_id='26000000-0000-0000-0000-000000000001'
    and report_type='essential_self_assessment';
  update public.report_fulfilments set status='storing',current_step='store',report_id=null
  where id='26000000-0000-0000-0000-000000000004';
  insert into public.phase14_worker_capabilities(
    id,capability_type,policy_key,operation_key,issue_secret_hash,order_id,
    assessment_id,score_run_id,fulfilment_id,report_id,security_gate_version,
    authorised_by,authorised_session_id,reason,status,expires_at,lease_expires_at,
    claimed_at,lease_owner,lease_generation,last_heartbeat_at,authority_epoch,
    expected_step,workflow_execution_id
  ) values (
    '26000000-0000-0000-0000-000000000080','automatic_generation',
    'automatic_fulfilment','sixth-terminal-publication',repeat('1',64),
    '26000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000004',
    null,1,'26000000-0000-0000-0000-000000000020',
    '26000000-0000-0000-0000-000000000099','Terminal rollback fixture','leased',
    now()+interval '1 hour',now()+interval '30 minutes',now(),'sixth-terminal-worker',9,
    now(),v_epoch,'terminal_publication','sixth-terminal-worker'
  );
  insert into public.report_generation_runs(
    id,fulfilment_id,attempt_number,generation_mode,prompt_version,schema_version,
    evidence_checksum,status,completed_at,accounting_status
  ) values (
    '26000000-0000-0000-0000-000000000081','26000000-0000-0000-0000-000000000004',
    99,'deterministic_fallback','terminal-test','terminal-test',repeat('2',64),
    'validated',now(),'not_applicable'
  );
  insert into public.reports(
    id,assessment_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,
    generated_at,fulfilment_id
  ) values (
    '26000000-0000-0000-0000-000000000082','26000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000002',
    v_template,'essential_self_assessment','draft','RPT-PH14-SIXTH-TERMINAL',1,
    'generated-reports','tmp/sixth-terminal.pdf',repeat('3',64),now(),
    '26000000-0000-0000-0000-000000000004'
  );
  update public.phase14_worker_capabilities
  set report_id='26000000-0000-0000-0000-000000000082'
  where id='26000000-0000-0000-0000-000000000080';
  update public.report_fulfilments
  set generation_capability_id='26000000-0000-0000-0000-000000000080'
  where id='26000000-0000-0000-0000-000000000004';
  insert into public.report_generation_claims(
    assessment_id,report_type,claim_token,order_id,score_run_id,fulfilment_id,
    claim_owner,report_id,version_number,report_reference,lease_expires_at,state,
    score_input_hash,temporary_storage_bucket,temporary_storage_path,
    final_storage_bucket,final_storage_path,expected_checksum,committed_at
  ) values (
    '26000000-0000-0000-0000-000000000001','essential_self_assessment',
    '26000000-0000-0000-0000-000000000083','26000000-0000-0000-0000-000000000003',
    '26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000004',
    'sixth-terminal-worker','26000000-0000-0000-0000-000000000082',1,
    'RPT-PH14-SIXTH-TERMINAL',now()+interval '30 minutes','committed',repeat('a',64),
    'generated-reports','tmp/sixth-terminal.pdf','generated-reports',
    'reports/sixth-terminal.pdf',repeat('3',64),now()
  );
  insert into public.phase14_storage_cleanup_queue(
    id,storage_bucket,storage_path,expected_checksum,claim_token,report_id,
    owner_capability_id,cleanup_reason,status
  ) values (
    '26000000-0000-0000-0000-000000000084','generated-reports',
    'reports/sixth-terminal.pdf',repeat('3',64),
    '26000000-0000-0000-0000-000000000083','26000000-0000-0000-0000-000000000082',
    '26000000-0000-0000-0000-000000000080','Final-object orphan recovery','pending'
  );
  insert into storage.buckets(id,name,public) values ('generated-reports','generated-reports',false)
  on conflict (id) do nothing;
  insert into storage.objects(bucket_id,name,metadata)
  values ('generated-reports','reports/sixth-terminal.pdf',
    jsonb_build_object('mimetype','application/pdf','sha256',repeat('3',64)))
  on conflict (bucket_id,name) do update set metadata=excluded.metadata;
  set local session_replication_role=origin;
end;
$terminal_fixture$;

do $manual_terminal_faults$
declare v_point text; v_payload jsonb; v_result jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"26000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"26000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_feature_policy('manual_generation',true,
    'Disposable manual terminal-publication rollback test.');
  set local session_replication_role=replica;
  update public.phase14_storage_cleanup_queue set
    owner_admin_user_id='26000000-0000-0000-0000-000000000020',owner_capability_id=null
  where id='26000000-0000-0000-0000-000000000084';
  set local session_replication_role=origin;
  foreach v_point in array array[
    'after_administrator_authorization','after_claim_lock','after_report_lock',
    'after_fulfilment_lock','after_generation_run_lock','after_cleanup_lock','after_order_read',
    'after_entitlement','after_storage_binding','after_previous_report_supersession',
    'after_report_publication','after_generation_run_link','after_claim_settlement',
    'after_fulfilment_transition','after_cleanup_transition','after_report_event',
    'after_assessment_event','after_audit_event'
  ] loop
    v_payload:=jsonb_build_object(
      'claim_token','26000000-0000-0000-0000-000000000083',
      'fulfilment_id','26000000-0000-0000-0000-000000000004',
      'generation_run_id','26000000-0000-0000-0000-000000000081',
      'report_id','26000000-0000-0000-0000-000000000082',
      'final_cleanup_id','26000000-0000-0000-0000-000000000084',
      'generation_mode','deterministic_fallback','metadata','{}'::jsonb,
      'fault_after',v_point);
    begin
      perform public.admin_terminal_phase14_generation_publication(v_payload);
      raise exception 'NO_EXPECTED_EXCEPTION:manual_terminal_fault_%',v_point;
    exception when others then
      if sqlerrm like 'NO_EXPECTED_EXCEPTION:%' then raise; end if;
      if sqlerrm not like '%phase14_terminal_fault:'||v_point||'%' then raise; end if;
    end;
    if not exists(select 1 from public.reports
        where id='26000000-0000-0000-0000-000000000082' and status='draft'
          and storage_path='tmp/sixth-terminal.pdf' and generation_run_id is null)
       or not exists(select 1 from public.report_generation_claims
        where claim_token='26000000-0000-0000-0000-000000000083' and state='committed')
       or not exists(select 1 from public.report_generation_runs
        where id='26000000-0000-0000-0000-000000000081' and report_id is null and status='validated')
       or not exists(select 1 from public.report_fulfilments
        where id='26000000-0000-0000-0000-000000000004' and status='storing' and report_id is null)
       or not exists(select 1 from public.phase14_storage_cleanup_queue
        where id='26000000-0000-0000-0000-000000000084' and status='pending')
       or exists(select 1 from public.report_events
        where report_id='26000000-0000-0000-0000-000000000082') then
      raise exception 'Manual terminal fault % left partial durable state',v_point;
    end if;
  end loop;
  v_payload:=v_payload-'fault_after';
  v_result:=public.admin_terminal_phase14_generation_publication(v_payload);
  if not coalesce((v_result->>'completed')::boolean,false)
     or v_result->>'entry_point'<>'manual'
     or not exists(select 1 from public.reports
       where id='26000000-0000-0000-0000-000000000082' and status='generated'
         and generation_run_id='26000000-0000-0000-0000-000000000081')
     or not exists(select 1 from public.report_generation_claims
       where claim_token='26000000-0000-0000-0000-000000000083' and state='settled')
     or not exists(select 1 from public.report_fulfilments
       where id='26000000-0000-0000-0000-000000000004' and status='ready_for_delivery'
         and report_id='26000000-0000-0000-0000-000000000082')
     or not exists(select 1 from public.phase14_storage_cleanup_queue
       where id='26000000-0000-0000-0000-000000000084' and status='retained') then
    raise exception 'Successful manual terminal publication was not atomic';
  end if;

  -- Restore the identical business identities for the worker-wrapper proof.
  set local session_replication_role=replica;
  delete from public.report_events where report_id='26000000-0000-0000-0000-000000000082';
  delete from public.assessment_events
  where dedupe_key='phase14-terminal-generation:26000000-0000-0000-0000-000000000083';
  delete from public.audit_logs where entity_id='26000000-0000-0000-0000-000000000082'
    and action in ('premium_report_generated','premium_report_regenerated');
  update public.reports set status='draft',storage_path='tmp/sixth-terminal.pdf',generation_run_id=null
  where id='26000000-0000-0000-0000-000000000082';
  update public.report_generation_runs set report_id=null,status='validated'
  where id='26000000-0000-0000-0000-000000000081';
  update public.report_generation_claims set state='committed'
  where claim_token='26000000-0000-0000-0000-000000000083';
  update public.report_fulfilments set status='storing',current_step='store',report_id=null
  where id='26000000-0000-0000-0000-000000000004';
  update public.phase14_storage_cleanup_queue set status='pending',
    owner_admin_user_id=null,owner_capability_id='26000000-0000-0000-0000-000000000080'
  where id='26000000-0000-0000-0000-000000000084';
  set local session_replication_role=origin;
end;
$manual_terminal_faults$;

do $terminal_faults$
declare v_point text; v_payload text; v_att jsonb; v_result jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  foreach v_point in array array[
    'after_attestation','after_capability_lock','after_claim_lock',
    'after_report_lock','after_fulfilment_lock','after_generation_run_lock','after_cleanup_lock','after_order_read',
    'after_entitlement','after_storage_binding','after_previous_report_supersession',
    'after_report_publication','after_generation_run_link','after_claim_settlement',
    'after_fulfilment_transition','after_cleanup_transition','after_report_event',
    'after_assessment_event','after_audit_event','after_capability_consumption'
  ] loop
    v_payload:=jsonb_build_object(
      'capability_id','26000000-0000-0000-0000-000000000080',
      'claim_token','26000000-0000-0000-0000-000000000083',
      'fulfilment_id','26000000-0000-0000-0000-000000000004',
      'generation_run_id','26000000-0000-0000-0000-000000000081',
      'report_id','26000000-0000-0000-0000-000000000082',
      'final_cleanup_id','26000000-0000-0000-0000-000000000084',
      'generation_mode','deterministic_fallback','metadata','{}'::jsonb,
      'fault_after',v_point)::text;
    v_att:=pg_temp.phase14_test_attestation(
      '26000000-0000-0000-0000-000000000080','sixth-terminal-worker',
      'terminal_phase14_generation_publication',v_payload,extensions.gen_random_uuid());
    begin
      perform public.terminal_phase14_generation_publication(
        v_att,pg_temp.phase14_test_signature(v_att),v_payload);
      raise exception 'NO_EXPECTED_EXCEPTION:terminal_fault_%',v_point;
    exception when others then
      if sqlerrm like 'NO_EXPECTED_EXCEPTION:%' then raise; end if;
      if sqlerrm not like '%phase14_terminal_fault:'||v_point||'%' then raise; end if;
    end;
    if not exists(select 1 from public.reports where id='26000000-0000-0000-0000-000000000082'
          and status='draft' and storage_path='tmp/sixth-terminal.pdf' and generation_run_id is null)
       or not exists(select 1 from public.report_generation_claims
          where claim_token='26000000-0000-0000-0000-000000000083' and state='committed')
       or not exists(select 1 from public.report_generation_runs
          where id='26000000-0000-0000-0000-000000000081' and report_id is null and status='validated')
       or not exists(select 1 from public.report_fulfilments
          where id='26000000-0000-0000-0000-000000000004' and status='storing' and report_id is null)
       or not exists(select 1 from public.phase14_storage_cleanup_queue
          where id='26000000-0000-0000-0000-000000000084' and status='pending')
       or not exists(select 1 from public.phase14_worker_capabilities
          where id='26000000-0000-0000-0000-000000000080' and status='leased'
            and expected_step='terminal_publication' and lease_generation=9)
       or exists(select 1 from public.report_events where report_id='26000000-0000-0000-0000-000000000082') then
      raise exception 'Terminal fault % left partial durable state',v_point;
    end if;
  end loop;

  v_payload:=jsonb_build_object(
    'capability_id','26000000-0000-0000-0000-000000000080',
    'claim_token','26000000-0000-0000-0000-000000000083',
    'fulfilment_id','26000000-0000-0000-0000-000000000004',
    'generation_run_id','26000000-0000-0000-0000-000000000081',
    'report_id','26000000-0000-0000-0000-000000000082',
    'final_cleanup_id','26000000-0000-0000-0000-000000000084',
    'generation_mode','deterministic_fallback','metadata','{}'::jsonb)::text;
  v_att:=pg_temp.phase14_test_attestation(
    '26000000-0000-0000-0000-000000000080','sixth-terminal-worker',
    'terminal_phase14_generation_publication',v_payload,extensions.gen_random_uuid());
  v_result:=public.terminal_phase14_generation_publication(
    v_att,pg_temp.phase14_test_signature(v_att),v_payload);
  if not coalesce((v_result->>'completed')::boolean,false)
     or not exists(select 1 from public.reports where id='26000000-0000-0000-0000-000000000082'
       and status='generated' and storage_path='reports/sixth-terminal.pdf')
     or not exists(select 1 from public.report_generation_claims
       where claim_token='26000000-0000-0000-0000-000000000083' and state='settled')
     or not exists(select 1 from public.phase14_storage_cleanup_queue
       where id='26000000-0000-0000-0000-000000000084' and status='retained')
     or not exists(select 1 from public.phase14_worker_capabilities
       where id='26000000-0000-0000-0000-000000000080' and status='consumed'
         and expected_step='consumed') then
    raise exception 'Successful terminal publication was not atomic';
  end if;
  begin
    perform public.terminal_phase14_generation_publication(
      v_att,pg_temp.phase14_test_signature(v_att),v_payload);
    raise exception 'NO_EXPECTED_EXCEPTION:terminal_replay';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:terminal_replay' then raise; end if;
  end;
end;
$terminal_faults$;

do $contact_verification$
declare v_event uuid:='26000000-0000-0000-0000-000000000090';
  v_expired uuid; v_cross_customer uuid; v_valid uuid; v_remediation uuid;
  v_complaint_verification uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"26000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"26000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_feature_policy('manual_delivery',true,
    'Disposable contact-verification test.');
  set local session_replication_role=replica;
  insert into public.email_events(
    id,assessment_id,order_id,report_id,recipient_email,status,provider,
    provider_request_key,phase14_operation_ref
  ) values (
    v_event,'26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000003',
    '26000000-0000-0000-0000-000000000082','sixth@example.invalid','bounced','resend',
    'sixth-bounced-request','phase14:contact-verification-test'
  );
  insert into public.orders(
    id,order_reference,assessment_id,product_id,status,amount_cents,currency,
    product_name,customer_email,customer_name,organisation_name,verified_at,verified_by
  ) select
    '26000000-0000-0000-0000-000000000093','ORDER-PH14-SIXTH-CROSS-CUSTOMER',
    assessment_id,product_id,status,amount_cents,currency,product_name,
    'different-customer@example.invalid','Different Customer','Different Organisation',
    verified_at,verified_by
  from public.orders where id='26000000-0000-0000-0000-000000000003';
  set local session_replication_role=origin;

  begin
    perform public.authorize_bounced_report_redelivery(
      v_event,'26000000-0000-0000-0000-000000000091','Forged verification must fail.');
    raise exception 'NO_EXPECTED_EXCEPTION:forged_contact_verification';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:forged_contact_verification' then raise; end if;
  end;
  v_expired:=public.create_customer_contact_verification(
    '26000000-0000-0000-0000-000000000003','expired@example.invalid',
    'support_callback','support-case-expired',300);
  set local session_replication_role=replica;
  update public.customer_contact_verifications
  set verified_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 minute'
  where id=v_expired;
  set local session_replication_role=origin;
  begin
    perform public.authorize_bounced_report_redelivery(v_event,v_expired,'Expired verification must fail.');
    raise exception 'NO_EXPECTED_EXCEPTION:expired_contact_verification';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:expired_contact_verification' then raise; end if;
  end;
  v_cross_customer:=public.create_customer_contact_verification(
    '26000000-0000-0000-0000-000000000093','cross-customer-corrected@example.invalid',
    'support_callback','support-case-cross-customer',600);
  begin
    perform public.authorize_bounced_report_redelivery(
      v_event,v_cross_customer,'Cross-customer verification must fail.');
    raise exception 'NO_EXPECTED_EXCEPTION:cross_customer_contact_verification';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:cross_customer_contact_verification' then raise; end if;
    if sqlerrm not like '%bounce_remediation_verification_binding_invalid%' then raise; end if;
  end;
  v_valid:=public.create_customer_contact_verification(
    '26000000-0000-0000-0000-000000000003','corrected@example.invalid',
    'verified_email_link','verification-link-opaque-reference',600);
  v_remediation:=public.authorize_bounced_report_redelivery(
    v_event,v_valid,'Consume independently verified corrected contact.');
  if not exists(select 1 from public.customer_contact_verifications
      where id=v_valid and status='consumed' and consumed_by_remediation_id=v_remediation)
     or (select lower(customer_email::text) from public.orders
      where id='26000000-0000-0000-0000-000000000003')<>'corrected@example.invalid' then
    raise exception 'Contact verification was not atomically consumed with recipient update';
  end if;
  begin
    perform public.authorize_bounced_report_redelivery(v_event,v_valid,'Consumed verification replay.');
    raise exception 'NO_EXPECTED_EXCEPTION:consumed_contact_verification';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:consumed_contact_verification' then raise; end if;
  end;

  set local session_replication_role=replica;
  insert into public.email_events(
    id,assessment_id,order_id,report_id,recipient_email,status,provider,
    provider_request_key,phase14_operation_ref
  ) values (
    '26000000-0000-0000-0000-000000000092','26000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000082',
    'corrected@example.invalid','complained','resend','sixth-complaint-request',
    'phase14:contact-verification-test'
  );
  set local session_replication_role=origin;
  v_complaint_verification:=public.create_customer_contact_verification(
    '26000000-0000-0000-0000-000000000003','third@example.invalid',
    'support_callback','support-case-after-complaint',600);
  begin
    perform public.authorize_bounced_report_redelivery(
      v_event,v_complaint_verification,'Complaint must stay permanently blocked.');
    raise exception 'NO_EXPECTED_EXCEPTION:complaint_permanent';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:complaint_permanent' then raise; end if;
    if sqlerrm not like '%bounce_remediation_complaint_permanent%' then raise; end if;
  end;
end;
$contact_verification$;

do $provider_attestation$
declare v_epoch bigint; v_id uuid; v_kind text; v_recorded timestamptz; v_auth_updated timestamptz;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"26000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"26000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_feature_policy('manual_delivery',true,
    'Disposable bounded provider-attestation test.');
  select authority_epoch into strict v_epoch from public.phase14_security_gates
  where gate_key='phase14-premium-report';
  set local session_replication_role=replica;
  foreach v_kind in array array['stale','future','state_changed','valid'] loop
    v_id:=case v_kind
      when 'stale' then '26000000-0000-0000-0000-0000000000a1'
      when 'future' then '26000000-0000-0000-0000-0000000000a2'
      when 'state_changed' then '26000000-0000-0000-0000-0000000000a3'
      else '26000000-0000-0000-0000-0000000000a4' end;
    insert into public.email_events(
      id,assessment_id,order_id,report_id,recipient_email,status,provider,
      provider_request_key,phase14_operation_ref
    ) values (
      v_id,'26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000003',
      '26000000-0000-0000-0000-000000000082','corrected@example.invalid',
      'reconciliation_required','resend','sixth-provider-'||v_kind,
      'phase14:provider-attestation-test'
    );
    insert into public.report_delivery_authorizations(
      id,report_id,report_checksum,recipient_email,order_id,assessment_id,score_run_id,
      security_gate_version,authorised_by,authorised_session_id,provider,email_event_id,
      status,dispatch_started_at,updated_at
    ) values (
      v_id,'26000000-0000-0000-0000-000000000082',repeat('3',64),
      'corrected@example.invalid','26000000-0000-0000-0000-000000000003',
      '26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002',
      1,'26000000-0000-0000-0000-000000000020','26000000-0000-0000-0000-000000000099',
      'resend',v_id,'reconciliation_required',clock_timestamp()-interval '2 minutes',clock_timestamp()
    ) returning updated_at into v_auth_updated;
    v_recorded:=case v_kind when 'stale' then clock_timestamp()-interval '11 minutes'
      when 'future' then clock_timestamp()+interval '1 minute' else clock_timestamp() end;
    insert into public.phase14_provider_attestations(
      id,attestation_source,provider,provider_request_key,authorization_id,email_event_id,
      provider_state,payload_sha256,nonce,attested_at,recorded_at,authority_epoch,
      authorization_status,authorization_updated_at
    ) values (
      gen_random_uuid(),'provider_lookup','resend','sixth-provider-'||v_kind,v_id,v_id,
      'not_found',repeat('4',64),gen_random_uuid(),v_recorded,v_recorded,v_epoch,
      case when v_kind='state_changed' then 'dispatching' else 'reconciliation_required' end,
      v_auth_updated
    );
  end loop;
  set local session_replication_role=origin;

  foreach v_kind in array array['stale','future','state_changed'] loop
    v_id:=case v_kind when 'stale' then '26000000-0000-0000-0000-0000000000a1'
      when 'future' then '26000000-0000-0000-0000-0000000000a2'
      else '26000000-0000-0000-0000-0000000000a3' end;
    begin
      perform public.resolve_premium_report_delivery_reconciliation(
        v_id,'not_accepted',(select id from public.phase14_provider_attestations where authorization_id=v_id),
        true,'Reject invalid bounded attestation.');
      raise exception 'NO_EXPECTED_EXCEPTION:provider_attestation_%',v_kind;
    exception when others then
      if sqlerrm like 'NO_EXPECTED_EXCEPTION:%' then raise; end if;
      if sqlerrm not like '%delivery_reconciliation_attestation_binding_or_age_invalid%' then raise; end if;
    end;
  end loop;
  v_id:='26000000-0000-0000-0000-0000000000a4';
  perform public.resolve_premium_report_delivery_reconciliation(
    v_id,'not_accepted',(select id from public.phase14_provider_attestations where authorization_id=v_id),
    true,'Consume current provider attestation exactly once.');
  if not exists(select 1 from public.phase14_provider_attestation_consumptions where authorization_id=v_id)
     or not exists(select 1 from public.report_delivery_authorizations where id=v_id and status='revoked') then
    raise exception 'Provider attestation was not atomically consumed with reconciliation';
  end if;
end;
$provider_attestation$;

-- Shared-table guard tests execute as the actual service_role, not merely with
-- a service-role-shaped JWT.
insert into public.audit_logs(id,actor_type,entity_table,action,after_json)
values ('26000000-0000-0000-0000-000000000070','system','legacy_shared_service','legacy_event','{}');
select set_config('phase14.authoritative_transition','migration',true);
insert into public.audit_logs(id,actor_type,entity_table,action,after_json)
values ('26000000-0000-0000-0000-000000000071','system','reports','phase14_test_owned','{}');

set local role service_role;
set local request.jwt.claims='{"role":"service_role","exp":4102444800}';

do $test$
begin
  begin
    update public.audit_logs set action='legacy_unknown_event',entity_table='legacy_shared_service'
    where id='26000000-0000-0000-0000-000000000071';
    raise exception 'NO_EXPECTED_EXCEPTION:protected_to_unprotected';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:protected_to_unprotected' then raise; end if;
    if sqlerrm not like '%phase14_authoritative_rpc_required%' then raise; end if;
  end;
  begin
    update public.audit_logs set action='phase14_forged_event'
    where id='26000000-0000-0000-0000-000000000070';
    raise exception 'NO_EXPECTED_EXCEPTION:unprotected_to_protected';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:unprotected_to_protected' then raise; end if;
  end;
  begin
    update public.audit_logs set phase14_operation_ref=null where id='26000000-0000-0000-0000-000000000071';
    raise exception 'NO_EXPECTED_EXCEPTION:marker_nullification';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:marker_nullification' then raise; end if;
  end;
  begin
    insert into public.audit_logs(id,actor_type,entity_table,action,after_json)
    values ('26000000-0000-0000-0000-000000000071','system','legacy_shared_service','legacy_upsert','{}')
    on conflict (id) do update set action=excluded.action,entity_table=excluded.entity_table;
    raise exception 'NO_EXPECTED_EXCEPTION:protected_upsert_declassification';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:protected_upsert_declassification' then raise; end if;
  end;
  begin
    update public.audit_logs set action='bulk_rewrite'
    where id in ('26000000-0000-0000-0000-000000000071','26000000-0000-0000-0000-000000000070');
    raise exception 'NO_EXPECTED_EXCEPTION:bulk_update';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:bulk_update' then raise; end if;
  end;
  if (select action from public.audit_logs where id='26000000-0000-0000-0000-000000000070')<>'legacy_event' then
    raise exception 'Bulk protected-row failure did not roll back the non-Phase-14 row';
  end if;
  begin
    delete from public.audit_logs where id='26000000-0000-0000-0000-000000000071';
    raise exception 'NO_EXPECTED_EXCEPTION:protected_delete';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:protected_delete' then raise; end if;
  end;
end;
$test$;

reset role;

do $test$
begin
  if not public.phase14_storage_result_is_verified_absence('object_not_found') then
    raise exception 'Explicit object_not_found was not accepted as verified absence';
  end if;
  if exists(select 1 from unnest(array[
    'authentication_failure','authorization_failure','rate_limited','timeout','network_failure',
    'provider_outage','malformed_response','checksum_read_failure','unknown_provider_error'
  ]) c where public.phase14_storage_result_is_verified_absence(c)) then
    raise exception 'A non-not-found storage result was classified as absence';
  end if;
end;
$test$;

rollback;

select 'phase14 sixth remediation behavioural tests passed' as result;

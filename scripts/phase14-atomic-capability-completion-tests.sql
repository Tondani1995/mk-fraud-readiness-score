\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;

insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
values ('25000000-0000-0000-0000-000000000020','atomic-completion@example.invalid',
  'Atomic Completion Admin','platform_admin','active',true);
insert into auth.sessions(id,user_id,aal,not_after)
values ('25000000-0000-0000-0000-000000000099',
  '25000000-0000-0000-0000-000000000020','aal2',now()+interval '1 day');

do $fixture$
declare v_methodology uuid; v_product uuid;
begin
  select id into strict v_methodology from public.methodology_versions where status='active';
  select id into strict v_product from public.products where product_code='essential_self_assessment';
  insert into public.assessments(
    id,assessment_reference,organisation_id,methodology_version_id,status,
    submitted_at,locked_at,current_score_run_id
  ) values (
    '25000000-0000-0000-0000-000000000001','PH14-ATOMIC-COMPLETION',
    '25000000-0000-0000-0000-000000000010',v_methodology,'scored',now(),now(),
    '25000000-0000-0000-0000-000000000002'
  );
  insert into public.score_runs(
    id,assessment_id,methodology_version_id,run_number,run_type,status,
    overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,
    coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,input_hash,locked_at
  ) values (
    '25000000-0000-0000-0000-000000000002','25000000-0000-0000-0000-000000000001',
    v_methodology,1,'test_fixture','completed',60,'Developing','Developing',40,'High',
    100,0,0,0,false,repeat('a',64),now()
  );
  insert into public.score_domain_results(
    score_run_id,domain_id,raw_score,weighted_contribution,coverage_pct,critical_gap_count
  ) select '25000000-0000-0000-0000-000000000002',id,60,0,100,0
    from public.domains where methodology_version_id=v_methodology;
  insert into public.score_question_traces(
    score_run_id,question_id,response_value,normalised_score,question_weight,
    applicable,numerator_contribution,denominator_contribution
  ) select '25000000-0000-0000-0000-000000000002',id,3,60,weight,true,60*weight,100*weight
    from public.questions where methodology_version_id=v_methodology and active;
  insert into public.orders(
    id,order_reference,assessment_id,product_id,status,amount_cents,currency,
    product_name,customer_email,customer_name,organisation_name,verified_at,verified_by
  ) select '25000000-0000-0000-0000-000000000003','ORDER-PH14-ATOMIC',
    '25000000-0000-0000-0000-000000000001',v_product,'payment_received',500000,'ZAR',
    name,'atomic@example.invalid','Atomic Test','Atomic Org',now(),
    '25000000-0000-0000-0000-000000000020'
  from public.products where id=v_product;
  insert into public.report_fulfilments(
    id,order_id,assessment_id,score_run_id,idempotency_key,trigger_source,status,current_step,
    requested_by_admin_user_id
  ) values (
    '25000000-0000-0000-0000-000000000004','25000000-0000-0000-0000-000000000003',
    '25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000002',
    'phase14-atomic-completion','payment_confirmation','queued','authorized_work',
    '25000000-0000-0000-0000-000000000020'
  );
end;
$fixture$;

set local session_replication_role = origin;

do $test$
declare
  v_authorization jsonb; v_lease jsonb; v_capability_id uuid;
  v_generation_run_id uuid; v_template_id uuid; v_result jsonb;
  v_ai_attempt jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"25000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"25000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_security_gate_version(1,'Atomic capability completion test.');
  perform public.set_phase14_feature_policy('automatic_fulfilment',true,
    'Atomic capability completion test.');
  v_authorization := public.authorize_phase14_worker_operation(
    'automatic_generation','atomic-generation-completion',
    '25000000-0000-0000-0000-000000000003','25000000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000002','25000000-0000-0000-0000-000000000004',
    null,null,3600,'Exercise rollback and atomic completion.'
  );
  v_capability_id := (v_authorization->>'capability_id')::uuid;

  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  v_lease := public.claim_phase14_worker_operation(v_capability_id,'atomic-worker');
  if (v_lease->>'status') <> 'leased' then raise exception 'atomic capability was not leased'; end if;

  perform set_config('request.jwt.claims',
    '{"sub":"25000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"25000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_feature_policy('ai_narrative',true,'Transactional identity-mismatch test only.');
  perform public.set_phase14_ai_route_policy('openai',true);
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  v_ai_attempt := public.claim_phase14_ai_attempt(v_capability_id,jsonb_build_object(
    'fulfilment_id','25000000-0000-0000-0000-000000000004',
    'generation_identity','phase14-ai-identity-test','attempt_kind','generate',
    'provider_request_key','phase14-ai-identity-test-1','requested_provider','openai',
    'requested_model','openai/gpt-test','evidence_checksum',repeat('8',64),
    'prompt_version','test-v1','schema_version','test-v1','input_size_bytes',100,
    'estimated_input_tokens',25,'max_output_tokens',100,
    'max_estimated_cost_micros',1000,'timeout_ms',1000
  ));
  begin
    perform public.settle_phase14_ai_attempt(v_capability_id,(v_ai_attempt->>'id')::uuid,
      jsonb_build_object('status','succeeded','accounting_status','verified',
        'resolved_provider','unexpected-provider','resolved_model','unexpected-model',
        'output_json','{}'::jsonb,'input_token_count',1,'output_token_count',1,
        'total_token_count',2,'estimated_cost_micros',1));
    raise exception 'NO_EXPECTED_EXCEPTION:unexpected_ai_provider_accepted';
  exception when others then
    if sqlerrm not like '%phase14_ai_unexpected_provider_route%' then raise; end if;
  end;
  if not exists(select 1 from public.report_ai_attempts
    where id=(v_ai_attempt->>'id')::uuid and status='started') then
    raise exception 'provider identity mismatch did not roll back AI settlement';
  end if;
  perform public.settle_phase14_ai_attempt(v_capability_id,(v_ai_attempt->>'id')::uuid,
    jsonb_build_object('status','failed_before_provider','accounting_status','not_applicable',
      'error_message','Transactional identity-mismatch test cleanup.'));

  perform public.transition_premium_report_fulfilment(v_capability_id,
    '25000000-0000-0000-0000-000000000004','assembling','assemble',null,null,true,null,null);
  perform public.transition_premium_report_fulfilment(v_capability_id,
    '25000000-0000-0000-0000-000000000004','generating','generate',null,null,false,null,null);
  perform public.transition_premium_report_fulfilment(v_capability_id,
    '25000000-0000-0000-0000-000000000004','validating','validate','deterministic_fallback',null,false,null,null);
  perform public.transition_premium_report_fulfilment(v_capability_id,
    '25000000-0000-0000-0000-000000000004','rendering','render','deterministic_fallback',null,false,null,null);
  perform public.transition_premium_report_fulfilment(v_capability_id,
    '25000000-0000-0000-0000-000000000004','storing','store','deterministic_fallback',null,false,null,null);
  v_generation_run_id := public.record_premium_report_generation_run(
    v_capability_id,'25000000-0000-0000-0000-000000000004',jsonb_build_object(
      'generation_mode','deterministic_fallback','prompt_version','test-v1',
      'schema_version','test-v1','evidence_checksum',repeat('b',64),
      'evidence_snapshot_json','{}'::jsonb,'validation_result_json','{}'::jsonb,
      'validation_errors_json','[]'::jsonb,'accounting_status','not_applicable',
      'status','used','completed_at',now()
    )
  );
  select id into strict v_template_id from public.report_templates
  where report_type='essential_self_assessment' and status='active'
  order by version_number desc limit 1;
  insert into public.reports(
    id,assessment_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,
    generated_at,fulfilment_id,generation_run_id
  ) values (
    '25000000-0000-0000-0000-000000000005','25000000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000003','25000000-0000-0000-0000-000000000002',
    v_template_id,'essential_self_assessment','superseded','RPT-PH14-ATOMIC',1,
    'generated-reports','atomic/report.pdf',repeat('c',64),now(),
    '25000000-0000-0000-0000-000000000004',v_generation_run_id
  );

  -- The deliberately invalid event fails after the linkage and fulfilment
  -- statements execute inside the RPC. PostgreSQL must roll all of them back.
  begin
    perform public.complete_phase14_generation_operation(
      v_capability_id,'25000000-0000-0000-0000-000000000004',v_generation_run_id,
      '25000000-0000-0000-0000-000000000005','deterministic_fallback',null,
      'invalid_event','force atomic rollback','{}'::jsonb
    );
    raise exception 'NO_EXPECTED_EXCEPTION:atomic_completion_failure';
  exception when others then
    if sqlerrm='NO_EXPECTED_EXCEPTION:atomic_completion_failure' then raise; end if;
    if sqlerrm not like '%phase14_report_event_type_invalid%' then raise; end if;
  end;
  if exists(select 1 from public.report_generation_runs
      where id=v_generation_run_id and report_id is not null)
     or exists(select 1 from public.report_fulfilments
      where id='25000000-0000-0000-0000-000000000004' and
        (status<>'storing' or report_id is not null))
     or exists(select 1 from public.report_events
      where report_id='25000000-0000-0000-0000-000000000005')
     or not exists(select 1 from public.phase14_worker_capabilities
      where id=v_capability_id and status='leased') then
    raise exception 'failed generation completion left partial durable state';
  end if;

  v_result := public.complete_phase14_generation_operation(
    v_capability_id,'25000000-0000-0000-0000-000000000004',v_generation_run_id,
    '25000000-0000-0000-0000-000000000005','deterministic_fallback',null,
    'generated','atomic completion','{}'::jsonb
  );
  if not coalesce((v_result->>'completed')::boolean,false)
     or coalesce((v_result->>'idempotent_replay')::boolean,true) then
    raise exception 'generation atomic completion did not commit exactly once: %',v_result;
  end if;
  if not exists(select 1 from public.report_generation_runs
      where id=v_generation_run_id and report_id='25000000-0000-0000-0000-000000000005')
     or not exists(select 1 from public.report_fulfilments
      where id='25000000-0000-0000-0000-000000000004'
        and status='ready_for_delivery' and report_id='25000000-0000-0000-0000-000000000005')
     or not exists(select 1 from public.report_events
      where report_id='25000000-0000-0000-0000-000000000005'
        and metadata_json->>'worker_capability_id'=v_capability_id::text)
     or not exists(select 1 from public.phase14_worker_capabilities
      where id=v_capability_id and status='consumed') then
    raise exception 'successful generation completion was not atomic';
  end if;

  v_result := public.complete_phase14_generation_operation(
    v_capability_id,'25000000-0000-0000-0000-000000000004',v_generation_run_id,
    '25000000-0000-0000-0000-000000000005','deterministic_fallback',null,
    'generated','atomic completion','{}'::jsonb
  );
  if not coalesce((v_result->>'idempotent_replay')::boolean,false) then
    raise exception 'exact generation completion replay was not idempotent: %',v_result;
  end if;
end;
$test$;

rollback;
select 'phase14_atomic_capability_completion_tests_passed' as result;

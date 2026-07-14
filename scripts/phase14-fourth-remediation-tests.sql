\set ON_ERROR_STOP on

-- Fourth adversarial remediation: gate mutation, scoped worker authority,
-- policy revocation, report ownership, cleanup bounds, and schema identity.
begin;
set local session_replication_role = replica;

insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
values ('24000000-0000-0000-0000-000000000020','fourth-remediation@example.invalid',
  'Fourth Remediation Admin','platform_admin','active',true);

do $fixture$
declare v_methodology uuid; v_product uuid;
begin
  select id into strict v_methodology from public.methodology_versions where status='active';
  select id into strict v_product from public.products where product_code='essential_self_assessment';
  insert into public.assessments(
    id,assessment_reference,organisation_id,methodology_version_id,status,
    submitted_at,locked_at,current_score_run_id
  ) values (
    '24000000-0000-0000-0000-000000000001','PH14-FOURTH-REMEDIATION',
    '24000000-0000-0000-0000-000000000010',v_methodology,'scored',now(),now(),
    '24000000-0000-0000-0000-000000000002'
  );
  insert into public.score_runs(
    id,assessment_id,methodology_version_id,run_number,run_type,status,
    overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,
    coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,input_hash,locked_at
  ) values (
    '24000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000001',
    v_methodology,1,'test_fixture','completed',60,'Developing','Developing',40,'High',
    100,0,0,0,false,repeat('a',64),now()
  );
  insert into public.score_domain_results(
    score_run_id,domain_id,raw_score,weighted_contribution,coverage_pct,critical_gap_count
  ) select '24000000-0000-0000-0000-000000000002',id,60,0,100,0
    from public.domains where methodology_version_id=v_methodology;
  insert into public.score_question_traces(
    score_run_id,question_id,response_value,normalised_score,question_weight,
    applicable,numerator_contribution,denominator_contribution
  ) select '24000000-0000-0000-0000-000000000002',id,3,60,weight,true,60*weight,100*weight
    from public.questions where methodology_version_id=v_methodology and active;
  insert into public.orders(
    id,order_reference,assessment_id,product_id,status,amount_cents,currency,
    product_name,customer_email,customer_name,organisation_name,verified_at,verified_by
  ) select '24000000-0000-0000-0000-000000000003','ORDER-PH14-FOURTH',
    '24000000-0000-0000-0000-000000000001',v_product,'payment_received',500000,'ZAR',
    name,'fourth@example.invalid','Fourth Test','Fourth Org',now(),
    '24000000-0000-0000-0000-000000000020'
  from public.products where id=v_product;
  insert into public.report_fulfilments(
    id,order_id,assessment_id,score_run_id,idempotency_key,trigger_source,status,current_step,
    requested_by_admin_user_id
  ) values (
    '24000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000003',
    '24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002',
    'phase14-fourth-remediation','payment_confirmation','queued','authorized_work',
    '24000000-0000-0000-0000-000000000020'
  );
end
$fixture$;

set local session_replication_role = origin;

do $tests$
declare
  v_generation_authorization jsonb; v_generation_lease jsonb; v_claim jsonb;
  v_cleanup_authorization jsonb; v_cleanup_lease jsonb; v_template uuid;
begin
  -- A generic service-role JWT cannot mutate any gate row through any verb.
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  begin
    update public.phase14_security_gates set reason='service update' where gate_key='phase14-premium-report';
    raise exception 'NO_EXPECTED_EXCEPTION:service_gate_update';
  exception when others then
    if sqlerrm not like '%phase14_no_session%' then raise; end if;
  end;
  begin
    insert into public.phase14_security_gates(gate_key,required_version,reason)
    values ('service-insert',1,'service insert');
    raise exception 'NO_EXPECTED_EXCEPTION:service_gate_insert';
  exception when others then
    if sqlerrm not like '%phase14_no_session%' then raise; end if;
  end;
  begin
    delete from public.phase14_security_gates where gate_key='phase14-premium-report';
    raise exception 'NO_EXPECTED_EXCEPTION:service_gate_delete';
  exception when others then
    if sqlerrm not like '%phase14_no_session%' then raise; end if;
  end;
  begin
    truncate public.phase14_security_gates;
    raise exception 'NO_EXPECTED_EXCEPTION:service_gate_truncate';
  exception when others then
    if sqlerrm not like '%phase14_no_session%' then raise; end if;
  end;

  -- The approved AAL2 path can satisfy the gate and independently enable policy.
  perform set_config('request.jwt.claims',
    '{"sub":"24000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"24000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_security_gate_version(1,'Fourth remediation isolated behavioral test.');
  perform public.set_phase14_feature_policy('automatic_fulfilment',true,'Isolated capability test.');
  perform public.set_phase14_feature_policy('storage_cleanup',true,'Isolated cleanup test.');

  v_generation_authorization := public.authorize_phase14_worker_operation(
    'automatic_generation','fourth-generation-operation',
    '24000000-0000-0000-0000-000000000003','24000000-0000-0000-0000-000000000001',
    '24000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000004',
    null,null,3600,'Human-approved isolated generation capability.'
  );
  if coalesce(v_generation_authorization->>'issue_secret','')='' then
    raise exception 'Worker authorization did not return its one-time issue secret.';
  end if;

  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  begin
    perform public.claim_premium_report_generation(
      'ORDER-PH14-FOURTH','generic-service',
      '24000000-0000-0000-0000-000000000004','essential_self_assessment'
    );
    raise exception 'NO_EXPECTED_EXCEPTION:generic_service_generation';
  exception when others then
    if sqlerrm not like '%phase14_worker_context_missing%' then raise; end if;
  end;
  v_generation_lease := public.claim_phase14_worker_capability(
    (v_generation_authorization->>'capability_id')::uuid,
    v_generation_authorization->>'issue_secret'
  );
  begin
    perform public.worker_claim_premium_report_generation(
      (v_generation_lease->>'capability_id')::uuid,v_generation_lease->>'lease_token',
      'ORDER-PH14-FOURTH','wrong-binding','24000000-0000-0000-0000-000000000099',
      'essential_self_assessment'
    );
    raise exception 'NO_EXPECTED_EXCEPTION:wrong_fulfilment_binding';
  exception when others then
    if sqlerrm not like '%worker_capability_fulfilment_mismatch%' then raise; end if;
  end;
  v_claim := public.worker_claim_premium_report_generation(
    (v_generation_lease->>'capability_id')::uuid,v_generation_lease->>'lease_token',
    'ORDER-PH14-FOURTH','scoped-worker','24000000-0000-0000-0000-000000000004',
    'essential_self_assessment'
  );
  if not (v_claim->>'claimed')::boolean then raise exception 'Scoped generation capability was not usable: %',v_claim; end if;

  -- Policy and gate versions are checked again after capability issue and claim.
  perform set_config('request.jwt.claims',
    '{"sub":"24000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"24000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_feature_policy('automatic_fulfilment',false,'Exercise fail-closed policy revocation.');
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  begin
    perform public.worker_renew_premium_report_generation_lease(
      (v_generation_lease->>'capability_id')::uuid,v_generation_lease->>'lease_token',
      (v_claim->>'claim_token')::uuid
    );
    raise exception 'NO_EXPECTED_EXCEPTION:policy_revoked_after_claim';
  exception when others then
    if sqlerrm not like '%phase14_policy_disabled%' then raise; end if;
  end;
  perform set_config('request.jwt.claims',
    '{"sub":"24000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"24000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_feature_policy('automatic_fulfilment',true,'Restore isolated policy for gate-version test.');
  perform public.set_phase14_security_gate_version(2,'Exercise stale capability gate version.');
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  begin
    perform public.worker_renew_premium_report_generation_lease(
      (v_generation_lease->>'capability_id')::uuid,v_generation_lease->>'lease_token',
      (v_claim->>'claim_token')::uuid
    );
    raise exception 'NO_EXPECTED_EXCEPTION:gate_changed_after_claim';
  exception when others then
    if sqlerrm not like '%phase14_worker_capability_gate_changed%' then raise; end if;
  end;
  perform set_config('request.jwt.claims',
    '{"sub":"24000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"24000000-0000-0000-0000-000000000099"}',true);
  perform public.set_phase14_security_gate_version(1,'Restore isolated gate version.');
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  perform public.worker_renew_premium_report_generation_lease(
    (v_generation_lease->>'capability_id')::uuid,v_generation_lease->>'lease_token',
    (v_claim->>'claim_token')::uuid
  );
  perform public.complete_phase14_worker_capability(
    (v_generation_lease->>'capability_id')::uuid,v_generation_lease->>'lease_token'
  );

  -- Maintenance capabilities are unbound and retention is positively bounded.
  perform set_config('request.jwt.claims',
    '{"sub":"24000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"24000000-0000-0000-0000-000000000099"}',true);
  v_cleanup_authorization := public.authorize_phase14_worker_operation(
    'storage_cleanup','fourth-cleanup-operation',null,null,null,null,null,null,3600,
    'Human-approved isolated cleanup capability.'
  );
  perform set_config('request.jwt.claims','{"role":"service_role","exp":4102444800}',true);
  v_cleanup_lease := public.claim_phase14_worker_capability(
    (v_cleanup_authorization->>'capability_id')::uuid,v_cleanup_authorization->>'issue_secret'
  );
  begin
    perform public.worker_cleanup_expired_premium_report_claims(
      (v_cleanup_lease->>'capability_id')::uuid,v_cleanup_lease->>'lease_token',interval '-1 hour'
    );
    raise exception 'NO_EXPECTED_EXCEPTION:negative_cleanup_retention';
  exception when others then
    if sqlerrm not like '%phase14_cleanup_retention_out_of_range%' then raise; end if;
  end;

  -- The current-report partial unique index rejects a second active version.
  perform set_config('request.jwt.claims',
    '{"sub":"24000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"24000000-0000-0000-0000-000000000099"}',true);
  select id into strict v_template from public.report_templates
  where report_type='essential_self_assessment' and status='active'
  order by version_number desc limit 1;
  insert into public.reports(
    assessment_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,checksum
  ) values (
    '24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000003',
    '24000000-0000-0000-0000-000000000002',v_template,'essential_self_assessment','generated',
    'RPT-PH14-FOURTH-V1',1,repeat('1',64)
  );
  begin
    insert into public.reports(
      assessment_id,order_id,score_run_id,template_id,report_type,status,
      report_reference,version_number,checksum
    ) values (
      '24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000003',
      '24000000-0000-0000-0000-000000000002',v_template,'essential_self_assessment','approved',
      'RPT-PH14-FOURTH-V2',2,repeat('2',64)
    );
    raise exception 'NO_EXPECTED_EXCEPTION:duplicate_current_report';
  exception when unique_violation then null;
  end;

  if has_table_privilege('service_role','public.reports','insert')
     or has_table_privilege('service_role','public.reports','update')
     or has_table_privilege('service_role','public.reports','delete')
     or has_table_privilege('service_role','public.reports','truncate') then
    raise exception 'service_role retains a direct report write privilege';
  end if;
  if not exists (
    select 1 from information_schema.columns where table_schema='public'
      and table_name='report_ai_attempts' and column_name='requested_model'
  ) or not exists (
    select 1 from information_schema.columns where table_schema='public'
      and table_name='report_ai_attempts' and column_name='resolved_model'
  ) then raise exception 'AI requested/resolved identity columns are incomplete'; end if;
end
$tests$;

rollback;
select 'phase14_fourth_remediation_tests_passed' as result;

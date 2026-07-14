\set ON_ERROR_STOP on

begin;

set local session_replication_role = replica;

do $fixture$
declare
  v_methodology uuid;
  v_product uuid;
  v_template uuid;
  v_assessment constant uuid := '21000000-0000-0000-0000-000000000001';
  v_score constant uuid := '21000000-0000-0000-0000-000000000002';
  v_order constant uuid := '21000000-0000-0000-0000-000000000003';
begin
  select id into strict v_methodology from public.methodology_versions where status = 'active';
  select id into strict v_product from public.products where product_code = 'essential_self_assessment';
  select id into strict v_template from public.report_templates
  where report_type = 'essential_self_assessment' and status = 'active'
  order by version_number desc limit 1;

  insert into public.assessments(
    id, assessment_reference, organisation_id, methodology_version_id, status,
    submitted_at, locked_at, current_score_run_id
  ) values (
    v_assessment, 'PH14-REMEDIATION-INTEGRATION', '21000000-0000-0000-0000-000000000010',
    v_methodology, 'scored', now(), now(), v_score
  );

  insert into public.score_runs(
    id, assessment_id, methodology_version_id, run_number, run_type, status,
    overall_score, calculated_maturity, final_maturity, exposure_score, exposure_band,
    coverage_pct, n_a_rate_pct, critical_gap_count, major_gap_count, cap_applied,
    input_hash, locked_at
  ) values (
    v_score, v_assessment, v_methodology, 1, 'test_fixture', 'completed',
    60, 'Developing', 'Developing', 40, 'High', 100, 0, 0, 0, false,
    repeat('a', 64), now()
  );

  insert into public.score_domain_results(
    score_run_id, domain_id, raw_score, weighted_contribution, coverage_pct, critical_gap_count
  ) select v_score, d.id, 60, 0, 100, 0
    from public.domains d where d.methodology_version_id = v_methodology;

  insert into public.score_question_traces(
    score_run_id, question_id, response_value, normalised_score, question_weight,
    applicable, numerator_contribution, denominator_contribution
  ) select v_score, q.id, 3, 60, q.weight, true, 60 * q.weight, 100 * q.weight
    from public.questions q where q.methodology_version_id = v_methodology and q.active;

  insert into public.orders(
    id, order_reference, assessment_id, product_id, status, amount_cents, currency,
    product_name, customer_email, customer_name, organisation_name, verified_at, verified_by
  ) select v_order, 'ORDER-PH14-REMEDIATION', v_assessment, v_product, 'payment_received',
    500000, 'ZAR', p.name, 'integration@example.invalid', 'Integration Test',
    'Integration Organisation', now(), '21000000-0000-0000-0000-000000000020'
  from public.products p where p.id = v_product;

  insert into public.reports(
    id, assessment_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, generated_at
  ) values (
    '21000000-0000-0000-0000-000000000004', v_assessment, v_order, v_score, v_template,
    'essential_self_assessment', 'generated', 'RPT-PH14-REMEDIATION-INTEGRATION-V1', 1,
    'generated-reports', 'PH14/V1.pdf', repeat('1', 64), now()
  );
end
$fixture$;

do $tests$
declare
  v_context jsonb;
  v_claim_a jsonb;
  v_claim_b jsonb;
  v_claim_c jsonb;
  v_report_id uuid;
  v_published jsonb;
  v_template uuid;
  v_domain_result uuid;
  v_email uuid := '21000000-0000-0000-0000-000000000030';
  v_stale_email uuid := '21000000-0000-0000-0000-000000000031';
begin
  v_context := public.assert_premium_report_generation_entitlement('ORDER-PH14-REMEDIATION');
  if (v_context->>'expected_domain_count')::int <> 10
     or (v_context->>'expected_trace_count')::int <> 68 then
    raise exception 'Authoritative entitlement completeness counts were not 10/68: %', v_context;
  end if;

  update public.orders set verified_at = null where id = '21000000-0000-0000-0000-000000000003';
  begin
    perform public.assert_premium_report_generation_entitlement('ORDER-PH14-REMEDIATION');
    raise exception 'NO_EXPECTED_EXCEPTION:unverified';
  exception when others then
    if sqlerrm not like '%order_missing_verified_at%' then raise; end if;
  end;
  update public.orders set verified_at = now(), verified_by = null where id = '21000000-0000-0000-0000-000000000003';
  begin
    perform public.assert_premium_report_generation_entitlement('ORDER-PH14-REMEDIATION');
    raise exception 'NO_EXPECTED_EXCEPTION:partial_verification';
  exception when others then
    if sqlerrm not like '%order_missing_verified_by%' then raise; end if;
  end;
  update public.orders set verified_by = '21000000-0000-0000-0000-000000000020' where id = '21000000-0000-0000-0000-000000000003';
  update public.score_runs set locked_at = null where id = '21000000-0000-0000-0000-000000000002';
  begin
    perform public.assert_premium_report_generation_entitlement('ORDER-PH14-REMEDIATION');
    raise exception 'NO_EXPECTED_EXCEPTION:unlocked';
  exception when others then
    if sqlerrm not like '%score_run_not_locked%' then raise; end if;
  end;
  update public.score_runs set locked_at = now(), input_hash = null where id = '21000000-0000-0000-0000-000000000002';
  begin
    perform public.assert_premium_report_generation_entitlement('ORDER-PH14-REMEDIATION');
    raise exception 'NO_EXPECTED_EXCEPTION:missing_hash';
  exception when others then
    if sqlerrm not like '%score_run_input_hash_invalid%' then raise; end if;
  end;
  update public.score_runs set input_hash = repeat('a', 64) where id = '21000000-0000-0000-0000-000000000002';
  select id into v_domain_result from public.score_domain_results
    where score_run_id = '21000000-0000-0000-0000-000000000002' limit 1;
  delete from public.score_domain_results where id = v_domain_result;
  begin
    perform public.assert_premium_report_generation_entitlement('ORDER-PH14-REMEDIATION');
    raise exception 'NO_EXPECTED_EXCEPTION:domain_incomplete';
  exception when others then
    if sqlerrm not like '%score_run_domain_results_incomplete%' then raise; end if;
  end;
  insert into public.score_domain_results(id, score_run_id, domain_id, raw_score, weighted_contribution, coverage_pct, critical_gap_count)
  select v_domain_result, '21000000-0000-0000-0000-000000000002', d.id, 60, 0, 100, 0
  from public.domains d
  where d.id not in (select domain_id from public.score_domain_results where score_run_id = '21000000-0000-0000-0000-000000000002')
  limit 1;

  v_claim_a := public.claim_premium_report_generation(
    'ORDER-PH14-REMEDIATION', 'worker-a', null, 'essential_self_assessment'
  );
  v_claim_b := public.claim_premium_report_generation(
    'ORDER-PH14-REMEDIATION', 'worker-b', null, 'essential_self_assessment'
  );
  if not (v_claim_a->>'claimed')::boolean or (v_claim_b->>'claimed')::boolean then
    raise exception 'Concurrent generation claim did not elect exactly one winner: %, %', v_claim_a, v_claim_b;
  end if;
  if (v_claim_a->>'version_number')::int <> 2 or (v_claim_b->>'version_number')::int <> 2 then
    raise exception 'Concurrent generation workers did not observe deterministic version 2.';
  end if;

  select id into strict v_template from public.report_templates
  where report_type = 'essential_self_assessment' and status = 'active'
  order by version_number desc limit 1;
  v_report_id := public.commit_premium_report_draft(
    (v_claim_a->>'claim_token')::uuid, v_template, 'generated-reports',
    'tmp/PH14/worker-a.pdf', repeat('2', 64), null, null
  );
  v_published := public.publish_premium_report_generation(
    (v_claim_a->>'claim_token')::uuid, v_report_id,
    'PH14/RPT-PH14-REMEDIATION-INTEGRATION-V2-' || repeat('2', 64) || '.pdf'
  );
  if (v_published->>'version_number')::int <> 2
     or not exists (select 1 from public.reports where id = v_report_id and status = 'generated' and checksum = repeat('2', 64))
     or not exists (select 1 from public.reports where id = '21000000-0000-0000-0000-000000000004' and status = 'superseded') then
    raise exception 'Atomic generation publication or deterministic supersession failed: %', v_published;
  end if;

  v_claim_c := public.claim_premium_report_generation(
    'ORDER-PH14-REMEDIATION', 'worker-c', null, 'essential_self_assessment'
  );
  if not (v_claim_c->>'claimed')::boolean or (v_claim_c->>'version_number')::int <> 3 then
    raise exception 'Post-publication version allocation was not deterministic: %', v_claim_c;
  end if;
  if not public.release_premium_report_generation_claim((v_claim_c->>'claim_token')::uuid) then
    raise exception 'Uncommitted generation claim could not be safely released.';
  end if;

  perform public.assert_premium_report_delivery_entitlement(v_report_id, 'integration@example.invalid', false);
  begin
    perform public.assert_premium_report_delivery_entitlement(v_report_id, 'attacker@example.invalid', false);
    raise exception 'NO_EXPECTED_EXCEPTION:recipient_override';
  exception when others then
    if sqlerrm not like '%delivery_recipient_override_forbidden%' then raise; end if;
  end;

  insert into public.email_events(
    id, assessment_id, order_id, report_id, recipient_email, status, provider_message_id,
    provider_request_key, provider_idempotency_key, dedupe_key, notification_type,
    attempt_number, delivery_updated_at
  ) values (
    v_email, '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003',
    v_report_id, 'integration@example.invalid', 'sent', 'provider-message-1',
    'request-1', 'request-1', 'dedupe-1', 'premium_report_pdf', 1, '2026-07-14T12:00:00Z'
  );
  perform public.apply_email_provider_event_atomic(
    'resend', 'provider-event-delivered', 'provider-message-1', 'email.delivered',
    '2026-07-14T12:05:00Z', '{"reason":null}'::jsonb
  );
  perform public.apply_email_provider_event_atomic(
    'resend', 'provider-event-stale-sent', 'provider-message-1', 'email.sent',
    '2026-07-14T12:01:00Z', '{}'::jsonb
  );
  perform public.apply_email_provider_event_atomic(
    'resend', 'provider-event-delivered', 'provider-message-1', 'email.delivered',
    '2026-07-14T12:05:00Z', '{}'::jsonb
  );
  if (select status from public.email_events where id = v_email) <> 'delivered'
     or (select count(*) from public.email_provider_events where email_event_id = v_email) <> 2 then
    raise exception 'Webhook event claim/deduplication or monotonic transition failed.';
  end if;

  insert into public.email_events(
    id, assessment_id, order_id, report_id, recipient_email, status, provider_request_key,
    provider_idempotency_key, dedupe_key, notification_type, attempt_number, send_lease_token,
    send_lease_expires_at
  ) values (
    v_stale_email, '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003',
    v_report_id, 'integration@example.invalid', 'sending', 'request-stale', 'request-stale',
    'dedupe-stale', 'premium_report_pdf', 1, gen_random_uuid(), now() - interval '1 minute'
  );
  perform public.recover_stale_premium_report_email_sends();
  if (select status from public.email_events where id = v_stale_email) <> 'reconciliation_required' then
    raise exception 'Stale sending lease was not moved to reconciliation_required.';
  end if;
end
$tests$;

rollback;

select 'phase14_remediation_integration_tests_passed' as result;

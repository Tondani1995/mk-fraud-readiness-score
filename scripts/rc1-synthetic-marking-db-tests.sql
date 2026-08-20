\set ON_ERROR_STOP on

-- Live database regression suite for 20260801220000: the synthetic-certification marking control.
--
-- The marker is what makes an organisation deletable by the RC1 cleanups, so these assertions run
-- against the fully replayed schema with every guard live. Fixture rows are seeded with
-- session_replication_role=replica, the convention the Phase 14 suites use; every call under test
-- runs at origin.
--
--   K1      a fresh, unused, recently created organisation is marked exactly once
--   K2      the marker is exactly the reference supplied, and the audit records a count only
--   K3      marking the same organisation again is refused
--   K4      an organisation that has been used is refused
--   K5      an organisation created more than 24 hours ago is refused
--   K6      an unknown assessment reference is refused
--   K7      a malformed synthetic reference is refused
--   K8      the control is inert without the environment enablement
--   K9      exactly one function exists for the expected signature, SECURITY DEFINER, empty path

\echo RC1_SYNTHETIC_MARKING_DB_BEGIN

create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'PASS  %  %', p_name, p_detail;
  else raise exception 'FAIL  %  %', p_name, p_detail; end if;
end $$;

-- ---------------------------------------------------------------------------
do $t$
declare v_n integer; v_secdef boolean; v_cfg text; v_owner text;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rc1_mark_synthetic_certification_organisation';
  perform pg_temp.check('K9a exactly one marking function', v_n = 1, 'count='||v_n);

  select p.prosecdef, coalesce(array_to_string(p.proconfig,','),''), pg_get_userbyid(p.proowner)
  into v_secdef, v_cfg, v_owner
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rc1_mark_synthetic_certification_organisation';
  perform pg_temp.check('K9b SECURITY DEFINER, empty search path, owned by postgres',
    v_secdef = true and v_cfg = 'search_path=""' and v_owner = 'postgres',
    'secdef='||v_secdef||' cfg='||v_cfg||' owner='||v_owner);

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rc1_surface_for_relation';
  perform pg_temp.check('K9c no surface-map overload was introduced', v_n = 1, 'count='||v_n);
  perform pg_temp.check('K9d the marking audit is on a freeze surface',
    public.rc1_surface_for_relation('public','rc1_synthetic_marking_audit') = 'activation_control',
    coalesce(public.rc1_surface_for_relation('public','rc1_synthetic_marking_audit'),'<null>'));
end $t$;

-- ---------------------------------------------------------------------------
begin;
set local session_replication_role = replica;

insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
values ('60000000-0000-0000-0000-000000000020','synthetic-marking@example.invalid',
  'Synthetic Marking Admin','platform_admin','active',true);
insert into auth.sessions(id,user_id,aal,not_after)
values ('60000000-0000-0000-0000-000000000099',
  '60000000-0000-0000-0000-000000000020','aal2',now()+interval '1 day');

do $fixture$
declare v_methodology uuid; v_product uuid;
begin
  select id into strict v_methodology from public.methodology_versions where status='active';
  select id into strict v_product from public.products where product_code='essential_self_assessment';

  -- A: fresh, unused, recently created. The only one that may be marked.
  insert into public.organisations(id,legal_name,created_at)
  values ('60000000-0000-0000-0000-00000000000a','Marking Fresh Org',now());
  insert into public.assessments(id,assessment_reference,organisation_id,methodology_version_id,status)
  values ('60000000-0000-0000-0000-00000000001a','RC1-MARK-FRESH',
          '60000000-0000-0000-0000-00000000000a',v_methodology,'draft');

  -- B: recently created but already used -- it has an order.
  insert into public.organisations(id,legal_name,created_at)
  values ('60000000-0000-0000-0000-00000000000b','Marking Used Org',now());
  insert into public.assessments(id,assessment_reference,organisation_id,methodology_version_id,status)
  values ('60000000-0000-0000-0000-00000000001b','RC1-MARK-USED',
          '60000000-0000-0000-0000-00000000000b',v_methodology,'draft');
  insert into public.orders(
    id,order_reference,assessment_id,product_id,status,amount_cents,currency,
    product_name,customer_email,customer_name,organisation_name
  ) select '60000000-0000-0000-0000-00000000002b','ORDER-RC1-MARK-USED',
    '60000000-0000-0000-0000-00000000001b',v_product,'awaiting_payment',500000,'ZAR',
    name,'used@example.invalid','Used Test','Marking Used Org'
  from public.products where id=v_product;

  -- C: unused, but created more than a day ago. Stands in for a real customer organisation.
  insert into public.organisations(id,legal_name,created_at)
  values ('60000000-0000-0000-0000-00000000000c','Marking Old Org',now() - interval '25 hours');
  insert into public.assessments(id,assessment_reference,organisation_id,methodology_version_id,status)
  values ('60000000-0000-0000-0000-00000000001c','RC1-MARK-OLD',
          '60000000-0000-0000-0000-00000000000c',v_methodology,'draft');
end;
$fixture$;

insert into public.app_settings(setting_key, value_json)
values ('rc1_synthetic_certification_cleanup', jsonb_build_object('enabled', true))
on conflict (setting_key) do update set value_json = excluded.value_json;

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
do $t$
declare v_result jsonb; v_msg text; v_ok boolean; v_audit jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"60000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2",'
    '"exp":4102444800,"session_id":"60000000-0000-0000-0000-000000000099"}', true);

  -- K1 the fresh organisation is marked exactly once.
  v_result := public.rc1_mark_synthetic_certification_organisation(
    'RC1-MARK-FRESH', 'MKTEST-RC1-20260801-60', 'Marking the fresh certification organisation for regression.');
  perform pg_temp.check('K1 a fresh unused organisation is marked exactly once',
    (v_result->>'marked')::integer = 1, v_result::text);

  -- K2 the marker is exactly what was supplied, and only that organisation moved.
  perform pg_temp.check('K2a the marker is exactly the supplied reference',
    (select o.synthetic_certification_ref from public.organisations o
     where o.id = '60000000-0000-0000-0000-00000000000a') = 'MKTEST-RC1-20260801-60', '');
  perform pg_temp.check('K2b no other organisation was touched',
    (select count(*) from public.organisations o
     where o.synthetic_certification_ref is not null) = 1,
    (select count(*)::text from public.organisations o where o.synthetic_certification_ref is not null));

  select to_jsonb(a) into v_audit from public.rc1_synthetic_marking_audit a
  order by a.marked_at desc limit 1;
  perform pg_temp.check('K2c the audit records the reference, fingerprints and a count only',
    v_audit->>'synthetic_reference' = 'MKTEST-RC1-20260801-60'
    and (v_audit->>'marked_count')::integer = 1
    and v_audit->>'reason_fingerprint' ~ '^[0-9a-f]{64}$'
    and v_audit->>'actor_fingerprint' ~ '^[0-9a-f]{64}$'
    and not (v_audit::text ilike '%Marking the fresh%')
    and not (v_audit::text ilike '%example.invalid%')
    and not (v_audit::text ilike '%Marking Fresh Org%'),
    v_audit::text);

  -- K3 marking the same organisation again is refused.
  v_ok := false;
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-MARK-FRESH', 'MKTEST-RC1-20260801-61', 'Attempting to relabel an already marked organisation.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_synthetic_marking:organisation_already_marked_or_missing';
  end;
  perform pg_temp.check('K3 an already marked organisation is refused', v_ok, coalesce(v_msg,'call succeeded'));
  perform pg_temp.check('K3b the original marker is unchanged',
    (select o.synthetic_certification_ref from public.organisations o
     where o.id = '60000000-0000-0000-0000-00000000000a') = 'MKTEST-RC1-20260801-60', '');

  -- K4 an organisation that has been used is refused.
  v_ok := false; v_msg := null;
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-MARK-USED', 'MKTEST-RC1-20260801-62', 'Attempting to mark an organisation that has an order.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_synthetic_marking:organisation_already_in_use';
  end;
  perform pg_temp.check('K4 an organisation already in use is refused', v_ok, coalesce(v_msg,'call succeeded'));

  -- K5 an organisation created more than an hour ago is refused.
  v_ok := false; v_msg := null;
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-MARK-OLD', 'MKTEST-RC1-20260801-63', 'Attempting to mark an organisation created more than a day ago.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_synthetic_marking:organisation_not_recent';
  end;
  perform pg_temp.check('K5 an organisation older than 24 hours is refused', v_ok, coalesce(v_msg,'call succeeded'));

  -- K6 an unknown assessment reference is refused.
  v_ok := false; v_msg := null;
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-MARK-DOES-NOT-EXIST', 'MKTEST-RC1-20260801-64', 'Attempting to mark an unknown assessment.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_synthetic_marking:assessment_not_found';
  end;
  perform pg_temp.check('K6 an unknown assessment reference is refused', v_ok, coalesce(v_msg,'call succeeded'));

  -- K7 a malformed synthetic reference is refused before anything is resolved.
  v_ok := false; v_msg := null;
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-MARK-USED', 'PROD-RC1-20260801-01', 'Attempting to mark with a non-MKTEST reference.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_synthetic_marking:synthetic_reference_invalid';
  end;
  perform pg_temp.check('K7 a malformed synthetic reference is refused', v_ok, coalesce(v_msg,'call succeeded'));

  perform pg_temp.check('K7b still exactly one marked organisation',
    (select count(*) from public.organisations o where o.synthetic_certification_ref is not null) = 1,
    (select count(*)::text from public.organisations o where o.synthetic_certification_ref is not null));
end $t$;

-- ---------------------------------------------------------------------------
-- K8 without the environment enablement the control is inert.
update public.app_settings set value_json = jsonb_build_object('enabled', false)
where setting_key = 'rc1_synthetic_certification_cleanup';

do $t$
declare v_msg text; v_ok boolean := false;
begin
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-MARK-USED', 'MKTEST-RC1-20260801-65', 'Attempting to mark without the environment enablement.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_synthetic_marking:not_enabled_in_this_environment';
  end;
  perform pg_temp.check('K8 the control is inert without the enablement', v_ok, coalesce(v_msg,'call succeeded'));
end $t$;


-- ---------------------------------------------------------------------------
-- 20260802120000: the placeholder allowance, and every event that must still block.
--
-- One organisation per variant. Each is a fresh, otherwise-markable journey whose only difference
-- is the email event attached to it, so any refusal is attributable to that event alone.
-- K8 above deliberately disabled the environment switch; the variants need it back on.
update public.app_settings set value_json = jsonb_build_object('enabled', true)
where setting_key = 'rc1_synthetic_certification_cleanup';

-- ---------------------------------------------------------------------------
set local session_replication_role = replica;

do $variants$
declare
  v_methodology uuid; v_product uuid; v_org uuid; v_assessment uuid; v_event uuid;
  v_auth uuid; v_report uuid; v_score uuid; v_order uuid; v_att uuid;
  v_variants text[] := array[
    'ok_placeholder','second_event','real_message','provider_mode_live','has_message_id',
    'has_sent_at','not_queued','has_provider_event','has_attestation','has_consumption',
    'two_placeholders','too_old','has_answers','has_score_run','no_email_at_all'];
  v_name text;
  i integer := 0;
begin
  select id into strict v_methodology from public.methodology_versions where status='active';
  select id into strict v_product from public.products where product_code='essential_self_assessment';

  foreach v_name in array v_variants loop
    i := i + 1;
    v_org := ('61000000-0000-0000-0000-0000000001' || lpad(i::text,2,'0'))::uuid;
    v_assessment := ('61000000-0000-0000-0000-0000000002' || lpad(i::text,2,'0'))::uuid;
    v_event := ('61000000-0000-0000-0000-0000000003' || lpad(i::text,2,'0'))::uuid;

    insert into public.organisations(id,legal_name,created_at)
    values (v_org, 'Variant ' || v_name,
            case when v_name = 'too_old' then now() - interval '25 hours' else now() end);
    insert into public.assessments(id,assessment_reference,organisation_id,methodology_version_id,status)
    values (v_assessment, 'RC1-VAR-' || upper(v_name), v_org, v_methodology, 'draft');

    -- Every variant except the last gets the baseline placeholder.
    if v_name <> 'no_email_at_all' then
      insert into public.email_events(id,assessment_id,recipient_email,template_key,status,provider_mode)
      values (v_event, v_assessment, 'variant@example.invalid',
              case when v_name = 'real_message' then 'premium_report_pdf'
                   else 'resume_link_phase4_placeholder' end,
              case when v_name = 'not_queued' then 'sent' else 'queued' end,
              case when v_name = 'provider_mode_live' then 'external' else 'disabled' end);
    end if;

    if v_name = 'has_message_id' then
      update public.email_events set provider_message_id = 'msg_variant' where id = v_event;
    elsif v_name = 'has_sent_at' then
      update public.email_events set sent_at = now() where id = v_event;
    elsif v_name = 'second_event' then
      insert into public.email_events(assessment_id,recipient_email,template_key,status,provider_mode)
      values (v_assessment,'variant2@example.invalid','payment_confirmed','queued','disabled');
    elsif v_name = 'two_placeholders' then
      insert into public.email_events(assessment_id,recipient_email,template_key,status,provider_mode)
      values (v_assessment,'variant2@example.invalid','resume_link_phase4_placeholder','queued','disabled');
    elsif v_name = 'has_provider_event' then
      insert into public.email_provider_events(email_event_id,provider,provider_event_id,event_type)
      values (v_event,'resend','rc1-var-'||i,'email.delivered');
    elsif v_name in ('has_attestation','has_consumption') then
      insert into public.phase14_provider_attestations(
        id,attestation_source,provider,provider_event_id,email_event_id,provider_state,
        payload_sha256,nonce,attested_at,recorded_at,minimal_payload_json,authority_epoch)
      values (gen_random_uuid(),'webhook','resend','rc1-var-att-'||i,v_event,'delivered',
              repeat('7',64),gen_random_uuid(),now(),now(),'{}'::jsonb,1)
      returning id into v_att;
      if v_name = 'has_consumption' then
        -- A consumption needs an authorisation, which needs a full journey; build the minimum.
        insert into public.score_runs(id,assessment_id,methodology_version_id,run_number,run_type,status,
          overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,
          coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,input_hash,locked_at)
        values (gen_random_uuid(),v_assessment,v_methodology,1,'test_fixture','completed',60,
          'Developing','Developing',40,'High',100,0,0,0,false,repeat('a',64),now())
        returning id into v_score;
        insert into public.orders(id,order_reference,assessment_id,product_id,status,amount_cents,
          currency,product_name,customer_email,customer_name,organisation_name)
        select gen_random_uuid(),'ORDER-RC1-VAR-'||i,v_assessment,v_product,'awaiting_payment',500000,
          'ZAR',name,'variant@example.invalid','Variant','Variant Org'
        from public.products where id=v_product returning id into v_order;
        insert into public.reports(id,assessment_id,score_run_id,template_id,report_type,report_reference)
        select gen_random_uuid(),v_assessment,v_score,(select id from public.report_templates order by created_at limit 1),
          'essential_self_assessment'::public.report_type,'RPT-RC1-VAR-'||i returning id into v_report;
        insert into public.report_delivery_authorizations(
          id,report_id,report_checksum,recipient_email,order_id,assessment_id,score_run_id,
          provider,email_event_id,status)
        values (gen_random_uuid(),v_report,repeat('c',64),'variant@example.invalid',v_order,
          v_assessment,v_score,'resend',v_event,'finalized') returning id into v_auth;
        insert into public.phase14_provider_attestation_consumptions(
          attestation_id,authorization_id,consumed_by,consumed_session_id)
        values (v_att,v_auth,'60000000-0000-0000-0000-000000000020',gen_random_uuid());
      end if;
    elsif v_name = 'has_answers' then
      insert into public.assessment_answers(assessment_id,question_id,response_value)
      select v_assessment,q.id,3 from public.questions q
      where q.methodology_version_id=v_methodology and q.active limit 1;
    elsif v_name = 'has_score_run' then
      insert into public.score_runs(id,assessment_id,methodology_version_id,run_number,run_type,status,
        overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,
        coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,input_hash,locked_at)
      values (gen_random_uuid(),v_assessment,v_methodology,1,'test_fixture','completed',60,
        'Developing','Developing',40,'High',100,0,0,0,false,repeat('b',64),now());
    end if;
  end loop;
end
$variants$;

set local session_replication_role = origin;

do $t$
declare
  v_expect jsonb := jsonb_build_object(
    'ok_placeholder','',            -- must succeed
    'no_email_at_all','',           -- must succeed
    'second_event','rc1_synthetic_marking:organisation_already_in_use',
    'real_message','rc1_synthetic_marking:organisation_already_in_use',
    'provider_mode_live','rc1_synthetic_marking:organisation_already_in_use',
    'has_message_id','rc1_synthetic_marking:organisation_already_in_use',
    'has_sent_at','rc1_synthetic_marking:organisation_already_in_use',
    'not_queued','rc1_synthetic_marking:organisation_already_in_use',
    'has_provider_event','rc1_synthetic_marking:organisation_already_in_use',
    'has_attestation','rc1_synthetic_marking:organisation_already_in_use',
    'has_consumption','rc1_synthetic_marking:organisation_already_in_use',
    'two_placeholders','rc1_synthetic_marking:multiple_placeholder_events',
    'too_old','rc1_synthetic_marking:organisation_not_recent',
    'has_answers','rc1_synthetic_marking:organisation_already_in_use',
    'has_score_run','rc1_synthetic_marking:organisation_already_in_use');
  v_name text; v_expected text; v_msg text; v_ok boolean; v_succeeded boolean; i integer := 0;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"60000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2",'
    '"exp":4102444800,"session_id":"60000000-0000-0000-0000-000000000099"}', true);

  for v_name, v_expected in select key, value from jsonb_each_text(v_expect) loop
    i := i + 1;
    v_succeeded := false; v_msg := null;
    begin
      perform public.rc1_mark_synthetic_certification_organisation(
        'RC1-VAR-' || upper(v_name), 'MKTEST-RC1-20260802-' || lpad(i::text,2,'0'),
        'Variant regression for the placeholder allowance: ' || v_name);
      v_succeeded := true;
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;

    if v_expected = '' then
      v_ok := v_succeeded;
    else
      v_ok := (not v_succeeded) and v_msg = v_expected;
    end if;
    perform pg_temp.check('P' || i || ' ' || v_name,
      v_ok, coalesce(v_msg, 'marked') || ' (expected ' || coalesce(nullif(v_expected,''),'success') || ')');
  end loop;
end $t$;

do $t$
declare v_marked integer;
begin
  select count(*)::integer into v_marked from public.organisations
  where synthetic_certification_ref is not null
    and legal_name in ('Variant ok_placeholder','Variant no_email_at_all');
  perform pg_temp.check('P16 exactly the two admissible variants were marked', v_marked = 2,
    'marked='||v_marked);
  select count(*)::integer into v_marked from public.organisations
  where synthetic_certification_ref is not null and legal_name like 'Variant %';
  perform pg_temp.check('P17 no refused variant was marked', v_marked = 2, 'marked='||v_marked);
end $t$;

-- ---------------------------------------------------------------------------
-- P18: authority. AAL1, the wrong role, anon and service_role are all refused.
-- ---------------------------------------------------------------------------
do $t$
declare v_msg text; v_ok boolean; v_succeeded boolean;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"60000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal1",'
    '"exp":4102444800,"session_id":"60000000-0000-0000-0000-000000000099"}', true);
  v_succeeded := false;
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-VAR-SECOND_EVENT','MKTEST-RC1-20260802-90','An AAL1 session must never mark.');
    v_succeeded := true;
  exception when others then get stacked diagnostics v_msg = message_text; end;
  perform pg_temp.check('P18a AAL1 is refused', not v_succeeded and v_msg like 'rc1_freeze_control:%',
    coalesce(v_msg,'marked'));

  perform set_config('request.jwt.claims', '{}', true);
  v_succeeded := false; v_msg := null;
  begin
    perform public.rc1_mark_synthetic_certification_organisation(
      'RC1-VAR-SECOND_EVENT','MKTEST-RC1-20260802-91','An anonymous caller must never mark.');
    v_succeeded := true;
  exception when others then get stacked diagnostics v_msg = message_text; end;
  perform pg_temp.check('P18b an unauthenticated caller is refused', not v_succeeded,
    coalesce(v_msg,'marked'));
end $t$;

do $t$
declare v_can boolean;
begin
  select has_function_privilege('service_role',
    'public.rc1_mark_synthetic_certification_organisation(text,text,text)', 'EXECUTE') into v_can;
  perform pg_temp.check('P18c service_role cannot execute the control', v_can = false, 'execute='||v_can);
  select has_function_privilege('anon',
    'public.rc1_mark_synthetic_certification_organisation(text,text,text)', 'EXECUTE') into v_can;
  perform pg_temp.check('P18d anon cannot execute the control', v_can = false, 'execute='||v_can);
end $t$;

-- ---------------------------------------------------------------------------
-- P19: the marked failed-start residue is removed through the real Storage-aware contract.
--
-- The contract is prepare-then-execute with a proof carried between them:
--   public.rc1_prepare_synthetic_storage_cleanup(p_reference text) -> jsonb
--        { reference, target_count, target_fingerprint, targets }
--   public.rc1_cleanup_synthetic_certification(
--        p_reference text, p_reason text,
--        p_expected_target_fingerprint text, p_expected_target_count integer) -> jsonb
--
-- Prepare is called once and its result captured; the execute call is given those exact values by
-- name. Nothing here weakens or bypasses the production requirement -- the mismatch probes below
-- prove the proof is still enforced.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_ref text;
  v_prepared jsonb;
  v_reprepared jsonb;
  v_fingerprint text;
  v_target_count integer;
  v_result jsonb;
  v_msg text;
  v_succeeded boolean;
  v_remaining integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"60000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2",'
    '"exp":4102444800,"session_id":"60000000-0000-0000-0000-000000000099"}', true);

  select o.synthetic_certification_ref into v_ref
  from public.organisations o where o.legal_name = 'Variant ok_placeholder';
  perform pg_temp.check('P19a the failed-start residue shape is marked', v_ref is not null,
    coalesce(v_ref, '<unmarked>'));

  -- Exactly one prepare. Everything execute needs comes from this result.
  v_prepared := public.rc1_prepare_synthetic_storage_cleanup(v_ref);
  v_fingerprint := v_prepared->>'target_fingerprint';
  v_target_count := (v_prepared->>'target_count')::integer;
  perform pg_temp.check('P19b prepare returns a usable storage proof',
    v_fingerprint ~ '^[0-9a-f]{64}$' and v_target_count >= 0,
    v_prepared::text);

  -- The proof is still current at the moment of execute.
  v_reprepared := public.rc1_prepare_synthetic_storage_cleanup(v_ref);
  perform pg_temp.check('P19c the fingerprint and counts are unchanged immediately before execute',
    v_reprepared->>'target_fingerprint' = v_fingerprint
    and (v_reprepared->>'target_count')::integer = v_target_count,
    v_reprepared::text);

  -- A wrong fingerprint is refused, and nothing is removed.
  v_succeeded := false; v_msg := null;
  begin
    perform public.rc1_cleanup_synthetic_certification(
      p_reference => v_ref,
      p_reason => 'A stale storage fingerprint must never be accepted.',
      p_expected_target_fingerprint => repeat('0', 64),
      p_expected_target_count => v_target_count);
    v_succeeded := true;
  exception when others then get stacked diagnostics v_msg = message_text; end;
  perform pg_temp.check('P19d a mismatched storage fingerprint is refused',
    not v_succeeded and v_msg = 'rc1_synthetic_cleanup:storage_target_mismatch',
    coalesce(v_msg, 'cleanup succeeded'));

  -- A wrong count is refused, and nothing is removed.
  v_succeeded := false; v_msg := null;
  begin
    perform public.rc1_cleanup_synthetic_certification(
      p_reference => v_ref,
      p_reason => 'A stale storage target count must never be accepted.',
      p_expected_target_fingerprint => v_fingerprint,
      p_expected_target_count => v_target_count + 1);
    v_succeeded := true;
  exception when others then get stacked diagnostics v_msg = message_text; end;
  perform pg_temp.check('P19e a mismatched storage target count is refused',
    not v_succeeded and v_msg = 'rc1_synthetic_cleanup:storage_target_mismatch',
    coalesce(v_msg, 'cleanup succeeded'));

  -- An absent proof is refused: the two-argument form exists only to say so.
  v_succeeded := false; v_msg := null;
  begin
    perform public.rc1_cleanup_synthetic_certification(
      p_reference => v_ref,
      p_reason => 'The two-argument form must refuse without a storage proof.');
    v_succeeded := true;
  exception when others then get stacked diagnostics v_msg = message_text; end;
  perform pg_temp.check('P19f the proofless form still refuses',
    not v_succeeded and v_msg like 'rc1_synthetic_cleanup:%',
    coalesce(v_msg, 'cleanup succeeded'));

  select count(*)::integer into v_remaining from public.organisations o
  where o.legal_name = 'Variant ok_placeholder';
  perform pg_temp.check('P19g no refused attempt removed anything', v_remaining = 1,
    'remaining='||v_remaining);

  -- The real contract, with the values carried from that one prepare.
  v_result := public.rc1_cleanup_synthetic_certification(
    p_reference => v_ref,
    p_reason => 'Removing the marked failed-start residue through the real cleanup contract.',
    p_expected_target_fingerprint => v_fingerprint,
    p_expected_target_count => v_target_count);

  select count(*)::integer into v_remaining from public.organisations o
  where o.synthetic_certification_ref = v_ref;
  perform pg_temp.check('P19h the real cleanup removed the marked residue entirely',
    v_remaining = 0, 'remaining='||v_remaining||' result='||coalesce(v_result::text,'null'));

  select (select count(*) from public.assessments a where a.assessment_reference = 'RC1-VAR-OK_PLACEHOLDER')
       + (select count(*) from public.email_events e where e.recipient_email::text = 'variant@example.invalid'
            and e.assessment_id in (select id from public.assessments where assessment_reference = 'RC1-VAR-OK_PLACEHOLDER'))
  into v_remaining;
  perform pg_temp.check('P19i its assessment and placeholder went with it', v_remaining = 0,
    'remaining='||v_remaining);

  -- Retrying against the now-empty result is safe and changes nothing.
  v_prepared := public.rc1_prepare_synthetic_storage_cleanup(v_ref);
  v_result := public.rc1_cleanup_synthetic_certification(
    p_reference => v_ref,
    p_reason => 'Retrying the cleanup against an already clean reference.',
    p_expected_target_fingerprint => v_prepared->>'target_fingerprint',
    p_expected_target_count => (v_prepared->>'target_count')::integer);
  perform pg_temp.check('P19j a retry against the empty result is safe',
    coalesce((v_result->>'already_clean')::boolean, false), coalesce(v_result::text,'null'));
end $t$;

rollback;

\echo RC1_SYNTHETIC_MARKING_DB_PASS

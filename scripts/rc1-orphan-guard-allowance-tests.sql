\set ON_ERROR_STOP on

-- Regression suite for 20260801200000: the orphan-remediation allowance on
-- guard_phase14_provider_attestation_immutable.
--
-- Every assertion runs against the fully replayed schema with all guards live. Fixture rows are
-- seeded with session_replication_role=replica, the convention the Phase 14 suites already use, so
-- that seeding cannot be mistaken for an exercise of the controls; every DELETE and UPDATE under
-- test runs at session_replication_role=origin, so each one really passes through the trigger.
--
-- The suite proves, in order:
--   G1-G2   exactly one function per expected signature, and the guard's security mode preserved
--   G3-G6   UPDATE, plain DELETE and a forged marker are all still refused
--   G7-G8   neither API role can create a function in public to spoof the execution frame
--   G9-G10  a same-named function in another schema, and an overload in public, do not match
--   G11-G13 stale fingerprint and mismatched total refuse and change nothing
--   G14-G15 a substituted candidate set naming a linked attestation is refused
--   G16-G17 foreign-key drift makes the two-link orphan proof incomplete, so the guard refuses
--   G18-G23 the certification shape succeeds, removes exactly the orphans, leaves linked rows,
--           audits counts only, and leaves no marker behind
--   G24-G25 a retry against zero candidates is safe
--   G26-G27 the synthetic-journey branch is unchanged and still succeeds
--   G28-G30 one failing row rolls back every deletion and discards the marker

\echo RC1_ORPHAN_GUARD_ALLOWANCE_BEGIN

create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'PASS  %  %', p_name, p_detail;
  else raise exception 'FAIL  %  %', p_name, p_detail; end if;
end $$;

create or replace function pg_temp.fingerprint() returns text language sql stable as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(pg_catalog.string_agg(relation || ':' || record_id::text, E'\n' order by relation, record_id), ''),
        'UTF8'), 'sha256'), 'hex')
  from public.rc1_orphan_remediation_candidates();
$$;

create or replace function pg_temp.total() returns integer language sql stable as $$
  select pg_catalog.count(*)::integer from public.rc1_orphan_remediation_candidates();
$$;

create or replace function pg_temp.counts() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'email_events', (select count(*) from public.email_events),
    'email_provider_events', (select count(*) from public.email_provider_events),
    'attestations', (select count(*) from public.phase14_provider_attestations));
$$;

-- ---------------------------------------------------------------------------
-- Structural assertions. No fixture required.
-- ---------------------------------------------------------------------------
do $t$
declare v_n integer; v_secdef boolean; v_cfg text; v_owner text;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='rc1_execute_orphan_remediation';
  perform pg_temp.check('G1a exactly one rc1_execute_orphan_remediation', v_n = 1, 'count='||v_n);

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='rc1_prepare_orphan_remediation';
  perform pg_temp.check('G1b exactly one rc1_prepare_orphan_remediation', v_n = 1, 'count='||v_n);

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='rc1_orphan_remediation_candidates';
  perform pg_temp.check('G1c exactly one rc1_orphan_remediation_candidates', v_n = 1, 'count='||v_n);

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='guard_phase14_provider_attestation_immutable';
  perform pg_temp.check('G1d exactly one attestation guard', v_n = 1, 'count='||v_n);

  select p.prosecdef, coalesce(array_to_string(p.proconfig,','),''), pg_get_userbyid(p.proowner)
  into v_secdef, v_cfg, v_owner
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='guard_phase14_provider_attestation_immutable';
  perform pg_temp.check('G2 guard keeps SECURITY INVOKER, empty search path and owner',
    v_secdef = false and v_cfg = 'search_path=""' and v_owner = 'postgres',
    'secdef='||v_secdef||' cfg='||v_cfg||' owner='||v_owner);

  perform pg_temp.check('G7 authenticated cannot create in schema public',
    has_schema_privilege('authenticated','public','CREATE') = false, '');
  perform pg_temp.check('G8 service_role cannot create in schema public',
    has_schema_privilege('service_role','public','CREATE') = false, '');
end $t$;

-- ---------------------------------------------------------------------------
-- Fixture. Seeding only; every control under test is exercised at origin below.
-- ---------------------------------------------------------------------------
begin;
set local session_replication_role = replica;

insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
values ('59000000-0000-0000-0000-000000000020','orphan-guard-allowance@example.invalid',
  'Orphan Guard Allowance Admin','platform_admin','active',true);
insert into auth.sessions(id,user_id,aal,not_after)
values ('59000000-0000-0000-0000-000000000099',
  '59000000-0000-0000-0000-000000000020','aal2',now()+interval '1 day');

do $fixture$
declare v_methodology uuid; v_product uuid; v_template uuid; i integer;
begin
  select id into strict v_methodology from public.methodology_versions where status='active';
  select id into strict v_product from public.products where product_code='essential_self_assessment';
  select id into v_template from public.report_templates order by created_at limit 1;

  insert into public.organisations(id,legal_name,synthetic_certification_ref)
  values ('59000000-0000-0000-0000-000000000010','Orphan Guard Org','MKTEST-RC1-20260801-59');

  insert into public.assessments(
    id,assessment_reference,organisation_id,methodology_version_id,status,
    submitted_at,locked_at,current_score_run_id
  ) values (
    '59000000-0000-0000-0000-000000000001','RC1-ORPHAN-GUARD',
    '59000000-0000-0000-0000-000000000010',v_methodology,'scored',now(),now(),
    '59000000-0000-0000-0000-000000000002'
  );
  insert into public.score_runs(
    id,assessment_id,methodology_version_id,run_number,run_type,status,
    overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,
    coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,input_hash,locked_at
  ) values (
    '59000000-0000-0000-0000-000000000002','59000000-0000-0000-0000-000000000001',
    v_methodology,1,'test_fixture','completed',60,'Developing','Developing',40,'High',
    100,0,0,0,false,repeat('a',64),now()
  );
  insert into public.orders(
    id,order_reference,assessment_id,product_id,status,amount_cents,currency,
    product_name,customer_email,customer_name,organisation_name,verified_at,verified_by
  ) select '59000000-0000-0000-0000-000000000003','ORDER-RC1-ORPHAN-GUARD',
    '59000000-0000-0000-0000-000000000001',v_product,'payment_received',500000,'ZAR',
    name,'orphan-guard@example.invalid','Orphan Guard','Orphan Guard Org',now(),
    '59000000-0000-0000-0000-000000000020'
  from public.products where id=v_product;
  insert into public.reports(
    id,assessment_id,score_run_id,template_id,report_type,report_reference
  ) values (
    '59000000-0000-0000-0000-000000000004',
    '59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000002',
    v_template,'essential_self_assessment'::public.report_type,'RPT-RC1-ORPHAN-GUARD'
  );

  -- The orphan email event: no assessment, order, report or data request.
  insert into public.email_events(id,recipient_email,status)
  values ('59000000-0000-0000-0000-000000000100','orphan@example.invalid','sent');
  -- A linked email event on the same synthetic organisation.
  insert into public.email_events(id,assessment_id,recipient_email,status)
  values ('59000000-0000-0000-0000-000000000101','59000000-0000-0000-0000-000000000001',
          'linked@example.invalid','sent');

  insert into public.report_delivery_authorizations(
    id,report_id,report_checksum,recipient_email,order_id,assessment_id,score_run_id,
    provider,email_event_id,status
  ) values (
    '59000000-0000-0000-0000-000000000005','59000000-0000-0000-0000-000000000004',repeat('c',64),
    'linked@example.invalid','59000000-0000-0000-0000-000000000003',
    '59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000002',
    'resend','59000000-0000-0000-0000-000000000101','sent'
  );

  -- Seven orphan provider events, all on the orphan email event.
  for i in 1..7 loop
    insert into public.email_provider_events(email_event_id,provider,provider_event_id,event_type)
    values ('59000000-0000-0000-0000-000000000100','resend','rc1-orphan-guard-'||i,'email.delivered');
  end loop;

  -- Seven orphan attestations: no delivery authorisation, orphan email event.
  for i in 1..7 loop
    insert into public.phase14_provider_attestations(
      attestation_source,provider,email_event_id,provider_state,payload_sha256,
      nonce,attested_at,recorded_at,minimal_payload_json,authority_epoch
    ) values (
      'provider_webhook','resend','59000000-0000-0000-0000-000000000100','delivered',repeat('d',64),
      gen_random_uuid(),now(),now(),'{}'::jsonb,1
    );
  end loop;

  -- Two controls that orphan remediation must never touch.
  insert into public.phase14_provider_attestations(
    id,attestation_source,provider,authorization_id,provider_state,payload_sha256,
    nonce,attested_at,recorded_at,minimal_payload_json,authority_epoch
  ) values (
    '59000000-0000-0000-0000-000000000201','provider_webhook','resend',
    '59000000-0000-0000-0000-000000000005','delivered',repeat('e',64),
    gen_random_uuid(),now(),now(),'{}'::jsonb,1
  );
  insert into public.phase14_provider_attestations(
    id,attestation_source,provider,email_event_id,provider_state,payload_sha256,
    nonce,attested_at,recorded_at,minimal_payload_json,authority_epoch
  ) values (
    '59000000-0000-0000-0000-000000000202','provider_webhook','resend',
    '59000000-0000-0000-0000-000000000101','delivered',repeat('f',64),
    gen_random_uuid(),now(),now(),'{}'::jsonb,1
  );
end;
$fixture$;

insert into public.app_settings(setting_key, value_json)
values ('rc1_orphan_remediation', jsonb_build_object('enabled', true, 'scope', 'staging_certification_only'))
on conflict (setting_key) do update set value_json = excluded.value_json;

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Refusals that must survive the new branch.
-- ---------------------------------------------------------------------------
do $t$
declare v_id uuid; v_msg text; v_before jsonb := pg_temp.counts(); v_ok boolean;
begin
  select a.id into v_id from public.phase14_provider_attestations a
  where a.authorization_id is null and a.email_event_id = '59000000-0000-0000-0000-000000000100' limit 1;

  v_ok := false;
  begin
    delete from public.phase14_provider_attestations where id = v_id;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'phase14_provider_attestation_immutable';
  end;
  perform pg_temp.check('G3 plain DELETE on an orphan attestation refused', v_ok, coalesce(v_msg,'delete succeeded'));

  v_ok := false; v_msg := null;
  begin
    perform pg_catalog.set_config('rc1.orphan_remediation_context', 'active', true);
    update public.phase14_provider_attestations set provider_state = 'bounced' where id = v_id;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'phase14_provider_attestation_immutable';
  end;
  perform pg_temp.check('G4 UPDATE refused even inside the marker', v_ok, coalesce(v_msg,'update succeeded'));

  v_ok := false; v_msg := null;
  begin
    perform pg_catalog.set_config('rc1.orphan_remediation_context', 'active', true);
    delete from public.phase14_provider_attestations where id = v_id;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'phase14_provider_attestation_immutable';
  end;
  perform pg_temp.check('G5 a manually set marker is not sufficient', v_ok, coalesce(v_msg,'delete succeeded'));
  perform pg_catalog.set_config('rc1.orphan_remediation_context', '', true);

  perform pg_temp.check('G6 nothing removed by G3-G5', pg_temp.counts() = v_before, pg_temp.counts()::text);
end $t$;

-- ---------------------------------------------------------------------------
-- The execution frame cannot be spoofed by name.
-- ---------------------------------------------------------------------------
create schema rc1_orphan_guard_spoof;
create function rc1_orphan_guard_spoof.rc1_execute_orphan_remediation(a text, b text, c integer)
returns void language plpgsql as $$
begin
  perform pg_catalog.set_config('rc1.orphan_remediation_context', 'active', true);
  delete from public.phase14_provider_attestations
  where id = (select id from public.phase14_provider_attestations
              where authorization_id is null limit 1);
end $$;

create function public.rc1_execute_orphan_remediation(p_spoof integer)
returns void language plpgsql as $$
begin
  perform pg_catalog.set_config('rc1.orphan_remediation_context', 'active', true);
  delete from public.phase14_provider_attestations
  where id = (select id from public.phase14_provider_attestations
              where authorization_id is null limit 1);
end $$;

do $t$
declare v_msg text; v_before jsonb := pg_temp.counts(); v_ok boolean;
begin
  v_ok := false;
  begin
    perform rc1_orphan_guard_spoof.rc1_execute_orphan_remediation('a','b',1);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'phase14_provider_attestation_immutable';
  end;
  perform pg_temp.check('G9 a same-named function in another schema does not match', v_ok,
    coalesce(v_msg,'delete succeeded'));

  v_ok := false; v_msg := null;
  begin
    perform public.rc1_execute_orphan_remediation(1);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'phase14_provider_attestation_immutable';
  end;
  perform pg_temp.check('G10 an overload in public does not match', v_ok, coalesce(v_msg,'delete succeeded'));
  perform pg_temp.check('G10b nothing removed by spoofs', pg_temp.counts() = v_before, pg_temp.counts()::text);
end $t$;

drop function public.rc1_execute_orphan_remediation(integer);
drop schema rc1_orphan_guard_spoof cascade;

-- ---------------------------------------------------------------------------
-- The prepare/execute contract.
-- ---------------------------------------------------------------------------
do $t$
declare v_msg text; v_before jsonb := pg_temp.counts(); v_fp text; v_ok boolean;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"59000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal2",'
    '"exp":4102444800,"session_id":"59000000-0000-0000-0000-000000000099"}', true);
  v_fp := pg_temp.fingerprint();

  v_ok := false;
  begin
    perform public.rc1_execute_orphan_remediation('stale fingerprint probe for regression', repeat('0',64), pg_temp.total());
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_orphan_remediation:candidate_fingerprint_mismatch';
  end;
  perform pg_temp.check('G11 stale fingerprint refused', v_ok, coalesce(v_msg,'execute succeeded'));

  v_ok := false; v_msg := null;
  begin
    perform public.rc1_execute_orphan_remediation('count mismatch probe for regression', v_fp, pg_temp.total() - 1);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_orphan_remediation:candidate_total_mismatch';
  end;
  perform pg_temp.check('G12 mismatched total refused', v_ok, coalesce(v_msg,'execute succeeded'));

  perform pg_temp.check('G13 nothing removed by G11-G12', pg_temp.counts() = v_before, pg_temp.counts()::text);
  perform pg_temp.check('G13b marker absent after refusals',
    coalesce(pg_catalog.current_setting('rc1.orphan_remediation_context', true),'') = '', '');
end $t$;

-- ---------------------------------------------------------------------------
-- A substituted candidate set naming a linked attestation is refused.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.restore_candidates() returns void language plpgsql as $restore$
begin
  execute $f$
    create or replace function public.rc1_orphan_remediation_candidates()
    returns table(relation text, record_id uuid)
    language sql stable security definer set search_path = ''
    as $body$
      with orphan_email_events as (
        select e.id from public.email_events e
        where e.assessment_id is null and e.order_id is null
          and e.report_id is null and e.data_request_id is null),
      orphan_provider_events as (
        select pe.id from public.email_provider_events pe
        where pe.email_event_id is null
           or not exists (select 1 from public.email_events e where e.id = pe.email_event_id)
           or pe.email_event_id in (select id from orphan_email_events)),
      orphan_attestations as (
        select a.id from public.phase14_provider_attestations a
        where (a.authorization_id is null
               or not exists (select 1 from public.report_delivery_authorizations d where d.id = a.authorization_id))
          and (a.email_event_id is null
               or not exists (select 1 from public.email_events e where e.id = a.email_event_id)
               or a.email_event_id in (select id from orphan_email_events))),
      orphan_consumptions as (
        select c.attestation_id as id from public.phase14_provider_attestation_consumptions c
        where c.attestation_id in (select id from orphan_attestations))
      select 'email_events'::text, id from orphan_email_events
      union all select 'email_provider_events'::text, id from orphan_provider_events
      union all select 'phase14_provider_attestations'::text, id from orphan_attestations
      union all select 'phase14_provider_attestation_consumptions'::text, id from orphan_consumptions
    $body$;
  $f$;
end $restore$;

do $t$
declare v_msg text; v_before jsonb := pg_temp.counts(); v_ok boolean;
begin
  execute $f$
    create or replace function public.rc1_orphan_remediation_candidates()
    returns table(relation text, record_id uuid)
    language sql stable security definer set search_path = ''
    as $body$ select 'phase14_provider_attestations'::text,
                     '59000000-0000-0000-0000-000000000201'::uuid $body$;
  $f$;

  v_ok := false;
  begin
    perform public.rc1_execute_orphan_remediation('substituted candidate set probe for regression',
      pg_temp.fingerprint(), pg_temp.total());
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_orphan_remediation:candidate_still_linked';
  end;
  perform pg_temp.check('G14 a substituted candidate set naming a linked row is refused', v_ok,
    coalesce(v_msg,'execute succeeded'));
  perform pg_temp.check('G15 the linked attestation survived', pg_temp.counts() = v_before,
    pg_temp.counts()::text);
end $t$;
select pg_temp.restore_candidates();

-- ---------------------------------------------------------------------------
-- Foreign-key drift makes the two-link orphan proof incomplete.
-- ---------------------------------------------------------------------------
do $t$
declare v_msg text; v_before jsonb := pg_temp.counts(); v_ok boolean;
begin
  alter table public.phase14_provider_attestations add column rc1_drift_id uuid
    references public.orders(id) on delete restrict;

  v_ok := false;
  begin
    perform public.rc1_execute_orphan_remediation('foreign key drift probe for regression',
      pg_temp.fingerprint(), pg_temp.total());
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'phase14_provider_attestation_immutable:orphan_proof_incomplete';
  end;
  perform pg_temp.check('G16 an unrecognised foreign key makes the guard refuse', v_ok,
    coalesce(v_msg,'execute succeeded'));

  alter table public.phase14_provider_attestations drop column rc1_drift_id;
  perform pg_temp.check('G17 nothing removed under drift', pg_temp.counts() = v_before,
    pg_temp.counts()::text);
end $t$;

-- ---------------------------------------------------------------------------
-- The certification shape succeeds, and only the orphans are removed.
-- ---------------------------------------------------------------------------
do $t$
declare v_result jsonb; v_after jsonb; v_audit jsonb;
begin
  v_result := public.rc1_execute_orphan_remediation(
    'orphan remediation success path for regression', pg_temp.fingerprint(), pg_temp.total());
  v_after := pg_temp.counts();

  perform pg_temp.check('G18 orphan remediation succeeded',
    (v_result->>'already_clean') = 'false' and (v_result->>'total')::integer = 15, v_result::text);
  perform pg_temp.check('G19 seven orphan attestations removed, both linked survive',
    (v_after->>'attestations')::integer = 2
    and exists (select 1 from public.phase14_provider_attestations where id='59000000-0000-0000-0000-000000000201')
    and exists (select 1 from public.phase14_provider_attestations where id='59000000-0000-0000-0000-000000000202'),
    v_after::text);
  perform pg_temp.check('G20 seven orphan provider events removed',
    (v_after->>'email_provider_events')::integer = 0, v_after::text);
  perform pg_temp.check('G21 the orphan email event removed, the linked one survives',
    not exists (select 1 from public.email_events where id='59000000-0000-0000-0000-000000000100')
    and exists (select 1 from public.email_events where id='59000000-0000-0000-0000-000000000101'),
    v_after::text);
  perform pg_temp.check('G22 marker absent after success',
    coalesce(pg_catalog.current_setting('rc1.orphan_remediation_context', true),'') = '', '');

  select to_jsonb(a) into v_audit from public.rc1_orphan_remediation_audit a
  order by a.executed_at desc limit 1;
  perform pg_temp.check('G23 audit carries counts and fingerprints only',
    (v_audit->>'candidate_total')::integer = 15
    and v_audit->>'candidate_fingerprint' ~ '^[0-9a-f]{64}$'
    and v_audit->>'reason_fingerprint' ~ '^[0-9a-f]{64}$'
    and v_audit->>'actor_fingerprint' ~ '^[0-9a-f]{64}$'
    and (v_audit->'deleted_counts')::text !~ '[0-9a-f]{8}-[0-9a-f]{4}',
    (v_audit->'deleted_counts')::text);
end $t$;

-- ---------------------------------------------------------------------------
-- A retry against zero candidates is safe.
-- ---------------------------------------------------------------------------
do $t$
declare v_result jsonb; v_before jsonb := pg_temp.counts();
begin
  v_result := public.rc1_execute_orphan_remediation(
    'retry against an already clean environment', pg_temp.fingerprint(), pg_temp.total());
  perform pg_temp.check('G24 a retry reports already_clean', (v_result->>'already_clean') = 'true',
    v_result::text);
  perform pg_temp.check('G25 the retry changed nothing', pg_temp.counts() = v_before,
    pg_temp.counts()::text);
end $t$;

-- ---------------------------------------------------------------------------
-- The synthetic-journey branch is unchanged.
-- ---------------------------------------------------------------------------
do $t$
declare v_msg text; v_n integer; v_ok boolean;
begin
  v_ok := false;
  begin
    perform pg_catalog.set_config('rc1.synthetic_cleanup_ref', 'MKTEST-RC1-20260101-99', true);
    delete from public.phase14_provider_attestations where id='59000000-0000-0000-0000-000000000202';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'phase14_provider_attestation_immutable';
  end;
  perform pg_temp.check('G26 a non-matching synthetic marker is still refused', v_ok,
    coalesce(v_msg,'delete succeeded'));

  perform pg_catalog.set_config('rc1.synthetic_cleanup_ref', 'MKTEST-RC1-20260801-59', true);
  delete from public.phase14_provider_attestations where id='59000000-0000-0000-0000-000000000202';
  get diagnostics v_n = row_count;
  perform pg_temp.check('G27 proven synthetic provenance still succeeds', v_n = 1, 'deleted='||v_n);
  perform pg_catalog.set_config('rc1.synthetic_cleanup_ref', '', true);
end $t$;

-- ---------------------------------------------------------------------------
-- One failing row rolls back every deletion.
-- ---------------------------------------------------------------------------
do $t$
declare v_msg text; v_state text; v_before jsonb; v_ok boolean; i integer;
begin
  -- Rebuild an orphan set, and give one orphan email event a surviving linked attestation so the
  -- last of the four deletes hits a RESTRICT foreign key after three have already succeeded.
  perform set_config('session_replication_role', 'replica', true);
  insert into public.email_events(id,recipient_email,status)
  values ('59000000-0000-0000-0000-000000000110','orphan2@example.invalid','sent');
  for i in 1..3 loop
    insert into public.email_provider_events(email_event_id,provider,provider_event_id,event_type)
    values ('59000000-0000-0000-0000-000000000110','resend','rc1-orphan-guard-rb-'||i,'email.delivered');
    insert into public.phase14_provider_attestations(
      attestation_source,provider,email_event_id,provider_state,payload_sha256,
      nonce,attested_at,recorded_at,minimal_payload_json,authority_epoch
    ) values ('provider_webhook','resend','59000000-0000-0000-0000-000000000110','delivered',
      repeat('9',64),gen_random_uuid(),now(),now(),'{}'::jsonb,1);
  end loop;
  -- Linked through a surviving delivery authorisation, so never a candidate, yet still pointing at
  -- the orphan email event.
  insert into public.phase14_provider_attestations(
    id,attestation_source,provider,authorization_id,email_event_id,provider_state,payload_sha256,
    nonce,attested_at,recorded_at,minimal_payload_json,authority_epoch
  ) values ('59000000-0000-0000-0000-000000000203','provider_webhook','resend',
    '59000000-0000-0000-0000-000000000005','59000000-0000-0000-0000-000000000110','delivered',
    repeat('8',64),gen_random_uuid(),now(),now(),'{}'::jsonb,1);
  perform set_config('session_replication_role', 'origin', true);

  v_before := pg_temp.counts();
  v_ok := false;
  begin
    perform public.rc1_execute_orphan_remediation('partial failure rollback probe for regression',
      pg_temp.fingerprint(), pg_temp.total());
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    v_ok := v_state = '23503';
  end;
  perform pg_temp.check('G28 a restricted reference aborts the run', v_ok,
    coalesce(v_state,'-')||' '||coalesce(v_msg,'execute succeeded'));
  perform pg_temp.check('G29 every deletion in the run rolled back', pg_temp.counts() = v_before,
    'before='||v_before::text||' after='||pg_temp.counts()::text);
  perform pg_temp.check('G30 marker absent after failure',
    coalesce(pg_catalog.current_setting('rc1.orphan_remediation_context', true),'') = '', '');
end $t$;

rollback;

\echo RC1_ORPHAN_GUARD_ALLOWANCE_PASS

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
--   K5      an organisation created more than an hour ago is refused
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

  -- C: unused, but created two hours ago. Stands in for a real customer organisation.
  insert into public.organisations(id,legal_name,created_at)
  values ('60000000-0000-0000-0000-00000000000c','Marking Old Org',now() - interval '2 hours');
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
      'RC1-MARK-OLD', 'MKTEST-RC1-20260801-63', 'Attempting to mark an organisation created two hours ago.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_ok := v_msg = 'rc1_synthetic_marking:organisation_not_recent';
  end;
  perform pg_temp.check('K5 an organisation older than an hour is refused', v_ok, coalesce(v_msg,'call succeeded'));

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

rollback;

\echo RC1_SYNTHETIC_MARKING_DB_PASS

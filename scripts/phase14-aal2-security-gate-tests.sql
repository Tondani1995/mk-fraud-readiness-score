\set ON_ERROR_STOP on

begin;
set local session_replication_role = replica;

insert into public.admin_profiles(id,email,full_name,role,status,mfa_required) values
  ('23000000-0000-0000-0000-000000000001','aal2-valid@example.invalid','AAL2 Valid','platform_admin','active',true),
  ('23000000-0000-0000-0000-000000000002','aal2-inactive@example.invalid','AAL2 Inactive','platform_admin','invited',true),
  ('23000000-0000-0000-0000-000000000003','aal2-revoked@example.invalid','AAL2 Revoked','platform_admin','revoked',true),
  ('23000000-0000-0000-0000-000000000004','aal2-role@example.invalid','AAL2 Role','finance_admin','active',true);

do $tests$
declare v_context jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"23000000-0000-0000-0000-000000000011"}', true);
  begin
    perform public.authorize_phase14_action('report_generation');
    raise exception 'NO_EXPECTED_EXCEPTION:gate_unsatisfied';
  exception when others then
    if sqlerrm not like '%phase14_security_gate_unsatisfied%' then raise; end if;
  end;

  update public.phase14_security_gates
  set satisfied_version = required_version, status = 'satisfied',
      satisfied_by = '23000000-0000-0000-0000-000000000001', satisfied_at = now(),
      reason = 'isolated AAL2 test', updated_at = now()
  where gate_key = 'phase14-premium-report';

  update public.phase14_feature_policies
  set enabled = true, updated_by = '23000000-0000-0000-0000-000000000001',
      reason = 'isolated AAL2 authorization test', updated_at = now()
  where policy_key = 'manual_generation';

  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.authorize_phase14_action('report_generation');
    raise exception 'NO_EXPECTED_EXCEPTION:no_session';
  exception when others then
    if sqlerrm not like '%phase14_no_session%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"23000000-0000-0000-0000-000000000012"}', true);
  begin
    perform public.authorize_phase14_action('report_generation');
    raise exception 'NO_EXPECTED_EXCEPTION:inactive_profile';
  exception when others then
    if sqlerrm not like '%phase14_profile_inactive%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1","exp":4102444800,"session_id":"23000000-0000-0000-0000-000000000013"}', true);
  begin
    perform public.authorize_phase14_action('report_generation');
    raise exception 'NO_EXPECTED_EXCEPTION:aal1';
  exception when others then
    if sqlerrm not like '%phase14_aal2_required%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"23000000-0000-0000-0000-000000000014"}', true);
  begin
    perform public.authorize_phase14_action('report_generation');
    raise exception 'NO_EXPECTED_EXCEPTION:disallowed_role';
  exception when others then
    if sqlerrm not like '%phase14_role_forbidden%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"23000000-0000-0000-0000-000000000015"}', true);
  begin
    perform public.authorize_phase14_action('report_generation');
    raise exception 'NO_EXPECTED_EXCEPTION:revoked_profile';
  exception when others then
    if sqlerrm not like '%phase14_profile_revoked%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","exp":1,"session_id":"23000000-0000-0000-0000-000000000016"}', true);
  begin
    perform public.authorize_phase14_action('report_generation');
    raise exception 'NO_EXPECTED_EXCEPTION:expired_session';
  exception when others then
    if sqlerrm not like '%phase14_session_expired%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"23000000-0000-0000-0000-000000000017"}', true);
  v_context := public.authorize_phase14_action('report_generation');
  if v_context->>'aal' <> 'aal2' or v_context->>'role' <> 'platform_admin' then
    raise exception 'Valid AAL2 session did not receive the expected authorization context: %', v_context;
  end if;
end
$tests$;

rollback;
select 'phase14_aal2_security_gate_tests_passed' as result;

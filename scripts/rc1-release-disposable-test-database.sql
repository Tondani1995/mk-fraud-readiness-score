\set ON_ERROR_STOP on

-- Release only a disposable local/CI database after its initial FROZEN state and schema have
-- already been verified. This keeps legacy mutation integration suites meaningful without adding
-- a test bypass to the Production migration or application.

begin;

insert into auth.users (id, email)
values (
  '2d100000-0000-0000-0000-000000000001',
  'rc1-disposable-ci@invalid.local'
)
on conflict (id) do nothing;

insert into auth.sessions (id, user_id, not_after)
values (
  '2d100000-0000-0000-0000-000000000002',
  '2d100000-0000-0000-0000-000000000001',
  pg_catalog.to_timestamp(4102444800)
)
on conflict (id) do nothing;

insert into public.admin_profiles (
  id,
  email,
  role,
  status,
  mfa_required
) values (
  '2d100000-0000-0000-0000-000000000001',
  'rc1-disposable-ci@invalid.local',
  'platform_admin',
  'active',
  true
)
on conflict (id) do update
set role = 'platform_admin',
    status = 'active',
    mfa_required = true;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"2d100000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"2d100000-0000-0000-0000-000000000002"}',
  true
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '2d100000-0000-0000-0000-000000000001',
  true
);

select public.rc1_release_freeze(
  'Disposable local integration-suite fixture setup',
  '2a6a771e99768ec08e04fe74b76e0f0c5324d6765996d899c084b628cb33a9af',
  1
);

commit;

select case
  when (public.rc1_freeze_status()->>'state') = 'released'
    then 'disposable_rc1_release_result|PASS'
  else 'disposable_rc1_release_result|STOP'
end;

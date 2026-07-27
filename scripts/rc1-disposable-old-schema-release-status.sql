-- Disposable local/CI compatibility fixture only.
--
-- Legacy route-integration suites intentionally exercise schemas that predate the RC1 freeze
-- bootstrap. The final application must remain frozen against those schemas in every real
-- environment. This fixture gives only a loopback disposable database an authoritative,
-- read-only RELEASED status so the historical mutation suites can still exercise their original
-- behavior. It is not a migration and must never be run against Production or a cloud database.

\set ON_ERROR_STOP on

\if :{?rc1_disposable_confirm}
\else
  \echo 'rc1_disposable_fixture:explicit_confirmation_required'
  \quit 3
\endif

\if :{?rc1_disposable_expected_boundary}
\else
  \echo 'rc1_disposable_fixture:expected_boundary_required'
  \quit 3
\endif

select pg_catalog.set_config(
  'rc1.disposable_confirm',
  :'rc1_disposable_confirm',
  false
);
select pg_catalog.set_config(
  'rc1.disposable_expected_boundary',
  :'rc1_disposable_expected_boundary',
  false
);

begin;

do $$
begin
  if pg_catalog.current_setting('rc1.disposable_confirm', true)
       <> 'LOCAL_CI_OLD_SCHEMA_ONLY' then
    raise exception 'rc1_disposable_fixture:explicit_confirmation_invalid';
  end if;
  if pg_catalog.current_database() <> 'postgres' then
    raise exception 'rc1_disposable_fixture:disposable_database_name_required';
  end if;
  if pg_catalog.current_setting(
       'rc1.disposable_expected_boundary',
       true
     ) not in ('0016', '0023', '0025') then
    raise exception 'rc1_disposable_fixture:unsupported_expected_boundary';
  end if;
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = pg_catalog.current_setting(
      'rc1.disposable_expected_boundary',
      true
    )
  ) or (
    select pg_catalog.max(version)
    from supabase_migrations.schema_migrations
  ) <> pg_catalog.current_setting(
    'rc1.disposable_expected_boundary',
    true
  ) then
    raise exception 'rc1_disposable_fixture:exact_expected_boundary_required';
  end if;
  if pg_catalog.to_regclass('public.rc1_operation_freeze_state') is not null
     or pg_catalog.to_regprocedure('public.rc1_freeze_status()') is not null then
    raise exception 'rc1_disposable_fixture:freeze_bootstrap_or_fixture_already_present';
  end if;
  if exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260722120000'
  ) then
    raise exception 'rc1_disposable_fixture:bootstrap_ledger_entry_present';
  end if;
end;
$$;

create table public.rc1_operation_freeze_state (
  singleton boolean primary key check (singleton),
  state text not null check (state in ('FROZEN', 'RELEASED')),
  freeze_epoch bigint not null check (freeze_epoch > 0),
  release_evidence_fingerprint text not null
    check (release_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  canary_authorization_active boolean not null check (not canary_authorization_active)
);

alter table public.rc1_operation_freeze_state enable row level security;
alter table public.rc1_operation_freeze_state force row level security;
revoke all on table public.rc1_operation_freeze_state
  from public, anon, authenticated, service_role;

insert into public.rc1_operation_freeze_state (
  singleton,
  state,
  freeze_epoch,
  release_evidence_fingerprint,
  canary_authorization_active
) values (
  true,
  'RELEASED',
  1,
  pg_catalog.repeat('a', 64),
  false
);

create function public.rc1_freeze_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state public.rc1_operation_freeze_state%rowtype;
  v_count bigint;
begin
  select pg_catalog.count(*) into v_count
  from public.rc1_operation_freeze_state;
  if v_count <> 1 then
    raise exception 'rc1_operation_frozen:freeze_row_cardinality';
  end if;

  select * into v_state
  from public.rc1_operation_freeze_state
  where singleton = true;
  if not found
     or v_state.state <> 'RELEASED'
     or v_state.freeze_epoch < 1
     or v_state.release_evidence_fingerprint !~ '^[0-9a-f]{64}$'
     or v_state.canary_authorization_active then
    raise exception 'rc1_operation_frozen:freeze_row_malformed';
  end if;

  return pg_catalog.jsonb_build_object(
    'state', pg_catalog.lower(v_state.state),
    'freeze_epoch', v_state.freeze_epoch,
    'release_evidence_fingerprint', v_state.release_evidence_fingerprint,
    'canary_authorization_active', v_state.canary_authorization_active
  );
end;
$$;

revoke all on function public.rc1_freeze_status()
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_freeze_status()
  to service_role;

comment on table public.rc1_operation_freeze_state is
  'DISPOSABLE LOOPBACK TEST FIXTURE ONLY; not the RC1 bootstrap implementation.';

notify pgrst, 'reload schema';

commit;

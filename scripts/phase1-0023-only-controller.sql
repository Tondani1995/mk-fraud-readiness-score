\set ON_ERROR_STOP on

-- This controller is intentionally psql-only. The wrapper verifies the target
-- fingerprint and reviewed migration checksum before the apply branch reaches it.
lock table supabase_migrations.schema_migrations in exclusive mode;

do $phase1_preflight$
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where version in ('0017','0018','0019','0020','0021','0022')
       or lower(name) ~ 'phase[ _-]?14'
  ) then
    raise exception 'phase1_0023_refused_prohibited_migration_history';
  end if;
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where version='0023' or name='phase1_manual_fulfilment_recovery'
  ) then
    raise exception 'phase1_0023_refused_already_recorded';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='0016' or name in ('0016_platform_database_hardening','platform_database_hardening')
  ) then
    raise exception 'phase1_0023_refused_0016_boundary_not_confirmed';
  end if;
  if to_regclass('public.orders') is null
     or to_regclass('public.reports') is null
     or to_regclass('public.email_events') is null
     or to_regclass('public.app_settings') is null
     or to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'phase1_0023_refused_base_precondition_missing';
  end if;
  if to_regclass('public.phase14_security_gates') is not null
     or to_regclass('public.phase14_feature_policies') is not null
     or exists (
       select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname like 'phase14%'
     )
     or exists (
       select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname like 'phase14%'
     )
     or to_regclass('public.manual_report_generation_attempts') is not null
     or to_regclass('public.manual_report_delivery_attempts') is not null
     or to_regprocedure('public.phase1_manual_fulfilment_capability()') is not null
     or exists (
       select 1 from unnest(array[
         'claim_manual_report_generation(text,uuid,text,text,text)',
         'start_manual_report_generation(uuid)',
         'complete_manual_report_generation(uuid,uuid,report_type,text,text,text,text,bigint,text)',
         'fail_manual_report_generation(uuid,text,text)',
         'claim_manual_report_delivery(uuid,text,uuid,text,text,text)',
         'complete_manual_report_delivery(uuid,text,text,text)'
       ]) required_name
       where to_regprocedure('public.' || required_name) is not null
     )
     or exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='reports'
         and column_name in ('organisation_id','file_name','mime_type','file_size_bytes','storage_status','storage_verified_at')
     )
     or exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='email_events'
         and column_name in ('request_id','provider_mode','retry_count','updated_at')
     )
     or exists (
       select 1 from public.app_settings
       where setting_key='v2_phase1_manual_fulfilment'
     ) then
    raise exception 'phase1_0023_refused_unexpected_or_partial_state';
  end if;
end;
$phase1_preflight$;

select version, name
from supabase_migrations.schema_migrations
order by version, name;

\if :phase1_readiness_only
  \echo 'Phase 1 0023 preconditions passed; readiness-only transaction made no changes.'
  \quit
\endif

\ir ../supabase/migrations/0023_phase1_manual_fulfilment_recovery.sql

\if :phase1_controlled_failure
  do $$ begin raise exception 'phase1_0023_controlled_failure_before_ledger'; end $$;
\endif

do $phase1_verify$
declare
  v_capability jsonb;
begin
  v_capability := public.phase1_manual_fulfilment_capability();
  if coalesce((v_capability->>'available')::boolean,false) is not true
     or v_capability->>'schema_version' <> '0023' then
    raise exception 'phase1_0023_postcondition_failed';
  end if;
  if to_regclass('public.phase14_security_gates') is not null
     or to_regclass('public.phase14_feature_policies') is not null then
    raise exception 'phase1_0023_postcondition_prohibited_object_present';
  end if;
end;
$phase1_verify$;

insert into supabase_migrations.schema_migrations(version,name,statements)
values(
  '0023',
  'phase1_manual_fulfilment_recovery',
  array['exact reviewed migration file sha256=' || :'phase1_migration_sha256']
);

select version, name, statements
from supabase_migrations.schema_migrations
where version='0023';

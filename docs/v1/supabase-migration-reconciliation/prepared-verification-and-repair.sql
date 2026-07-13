-- MK Fraud Readiness Score V1
-- Supabase migration-chain reconciliation prepared SQL
--
-- STATUS: CONTROLLER REVIEW ONLY.
-- DO NOT RUN THE MUTATION SECTION AGAINST PRODUCTION WITHOUT EXPLICIT APPROVAL.
-- This file is documentation/preparation only. It was not executed as a migration.

-- -----------------------------------------------------------------------------
-- A. Read-only production ledger shape
-- -----------------------------------------------------------------------------

select column_name, data_type, ordinal_position
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;

select version, name, cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
order by version;

-- Expected current issue:
-- - first observed production record is 20260708181207 / 0010_phase9_manual_eft_order_flow
-- - no records exist for 0001, 0002, 0003, 0004, 0005, 0006, 0007 or 0009

-- -----------------------------------------------------------------------------
-- B. Read-only foundational object checks
-- -----------------------------------------------------------------------------

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

select n.nspname as schema_name, t.typname as type_name
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typtype = 'e'
order by t.typname;

select id, name, public
from storage.buckets
where name in ('generated-reports', 'report-assets')
order by name;

select version_code, status
from public.methodology_versions
order by version_code;

select setting_key, value_json
from public.app_settings
where setting_key in (
  'phase14_autonomous_report_engine',
  'phase13_commercial_event_foundation',
  'phase9_manual_eft_order_flow'
)
order by setting_key;

-- -----------------------------------------------------------------------------
-- C. Missing foundational ledger rows check
-- -----------------------------------------------------------------------------

with expected(version, name) as (
  values
    ('0001', '0001_phase2_v1_1_schema_rls'),
    ('0002', '0002_phase4_dev_seed'),
    ('0003', '0003_phase5_methodology_seed'),
    ('0004', '0004_phase4_v1_2_rate_limiting'),
    ('0005', '0005_phase5_v1_1_guards'),
    ('0006', '0006_phase6_scoring_guards'),
    ('0007', '0007_phase6_v1_1_atomic_scoring'),
    ('0009', '0009_methodology_copy_polish')
)
select e.version, e.name,
       case when m.version is null then 'missing' else 'present' end as ledger_status
from expected e
left join supabase_migrations.schema_migrations m
  on m.version = e.version
order by e.version;

-- -----------------------------------------------------------------------------
-- D. Preferred repair path
-- -----------------------------------------------------------------------------
-- Prefer Supabase CLI migration repair after controller approval, because it is
-- the supported migration-history repair mechanism.
--
-- Conceptual commands only:
--   supabase link --project-ref jvjxlphdyzerrhwcgkup
--   supabase migration repair --status applied 0001
--   supabase migration repair --status applied 0002
--   supabase migration repair --status applied 0003
--   supabase migration repair --status applied 0004
--   supabase migration repair --status applied 0005
--   supabase migration repair --status applied 0006
--   supabase migration repair --status applied 0007
--   supabase migration repair --status applied 0009
--   supabase migration list
--
-- Open controller question: production uses timestamp versions for 0010+ while
-- repository filenames use numeric prefixes. Confirm that numeric versions are
-- the intended repair target before running CLI repair.

-- -----------------------------------------------------------------------------
-- E. Emergency/controller-only direct metadata template
-- -----------------------------------------------------------------------------
-- This transaction is intentionally ROLLBACK by default.
-- It is included only so the controller can review the exact metadata-only shape
-- if Supabase CLI repair cannot represent the approved version mapping.
-- It must not be used to bypass Supabase CLI repair casually.

begin;

-- Safety assertions: this should return zero rows before an approved repair.
select version, name
from supabase_migrations.schema_migrations
where version in ('0001','0002','0003','0004','0005','0006','0007','0009')
order by version;

-- Metadata-only insert template. Does not execute any schema DDL/DML.
-- The statements text is deliberately a marker, not executable source SQL.
insert into supabase_migrations.schema_migrations
  (version, statements, name, created_by, idempotency_key, rollback)
select v.version,
       array[v.statement_marker]::text[] as statements,
       v.name,
       'controller-approved-metadata-repair' as created_by,
       v.idempotency_key,
       array[]::text[] as rollback
from (
  values
    ('0001', '0001_phase2_v1_1_schema_rls', '-- metadata-only: production schema already contains foundation 0001', 'mkfrs-ledger-repair-0001-20260713'),
    ('0002', '0002_phase4_dev_seed', '-- metadata-only: production seed state already contains foundation 0002', 'mkfrs-ledger-repair-0002-20260713'),
    ('0003', '0003_phase5_methodology_seed', '-- metadata-only: production seed state already contains foundation 0003', 'mkfrs-ledger-repair-0003-20260713'),
    ('0004', '0004_phase4_v1_2_rate_limiting', '-- metadata-only: production schema already contains foundation 0004', 'mkfrs-ledger-repair-0004-20260713'),
    ('0005', '0005_phase5_v1_1_guards', '-- metadata-only: production schema already contains foundation 0005', 'mkfrs-ledger-repair-0005-20260713'),
    ('0006', '0006_phase6_scoring_guards', '-- metadata-only: production schema already contains foundation 0006', 'mkfrs-ledger-repair-0006-20260713'),
    ('0007', '0007_phase6_v1_1_atomic_scoring', '-- metadata-only: production schema already contains foundation 0007', 'mkfrs-ledger-repair-0007-20260713'),
    ('0009', '0009_methodology_copy_polish', '-- metadata-only: production schema already contains foundation 0009', 'mkfrs-ledger-repair-0009-20260713')
) as v(version, name, statement_marker, idempotency_key)
where not exists (
  select 1
  from supabase_migrations.schema_migrations existing
  where existing.version = v.version
     or existing.name = v.name
);

-- Review what would be present after the template insert.
select version, name, created_by, idempotency_key
from supabase_migrations.schema_migrations
where version in ('0001','0002','0003','0004','0005','0006','0007','0009')
order by version;

-- Keep this rollback unless the controller explicitly approves the exact SQL.
rollback;

-- -----------------------------------------------------------------------------
-- F. Expected before/after if controller later approves metadata repair
-- -----------------------------------------------------------------------------
-- Before:
--   - public schema contains foundational objects
--   - production schema_migrations has no 0001/0002/0003/0004/0005/0006/0007/0009 rows
--   - Supabase branch replay starts at 0010+ and fails against an empty public schema
--
-- After approved metadata repair:
--   - public schema is unchanged
--   - customer/application data is unchanged
--   - automation flags remain unchanged/off
--   - schema_migrations includes approved foundational records
--   - a new disposable branch can be attempted for clean replay validation
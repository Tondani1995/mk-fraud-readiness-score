-- MK Fraud Readiness Score V1
-- Supabase migration-chain reconciliation prepared SQL
--
-- STATUS: CONTROLLER REVIEW ONLY.
-- Do not execute any production mutation from this file.
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

-- Expected current issue before approved repair:
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
select e.version,
       e.name,
       case when m.version is null then 'missing' else 'present' end as ledger_status
from expected e
left join supabase_migrations.schema_migrations m
  on m.version = e.version
order by e.version;

-- -----------------------------------------------------------------------------
-- D. Approved preferred repair path
-- -----------------------------------------------------------------------------
-- Controller decision: retain numeric migration versions.
-- Do not introduce a timestamped baseline.
-- Do not squash migrations at this stage.
--
-- Preferred production operation after controller approval:
--
--   supabase link --project-ref jvjxlphdyzerrhwcgkup
--
--   supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 \
--     --status applied
--
--   supabase migration list
--
-- Exact CLI version pinned for CI validation:
--   Supabase CLI 2.81.3
--
-- The repair operation is metadata-only. It must store the real migration
-- version, migration name and parsed SQL statements read from the repository
-- migration files. It must not execute the foundational SQL against production.

-- -----------------------------------------------------------------------------
-- E. Removed marker-only fallback
-- -----------------------------------------------------------------------------
-- The previous emergency SQL template inserted comment-only marker statements
-- into supabase_migrations.schema_migrations. That fallback has been removed.
--
-- Do not store placeholders, marker comments or comment-only statement arrays in
-- supabase_migrations.schema_migrations. A branch replay must be able to see the
-- real foundational SQL statements.
--
-- The controller-review-only full-statement artefact is generated in CI by:
--
--   node scripts/phase14-generate-numeric-repair-artifact.mjs \
--     --out tmp/migration-replay/numeric-migration-repair-full-statement-artifact.sql
--
-- That generated artefact is uploaded with the Supabase Migration Replay workflow
-- evidence and contains:
--
-- - real versions 0001, 0002, 0003, 0004, 0005, 0006, 0007 and 0009;
-- - real migration names from supabase/migrations;
-- - parsed executable SQL statements from the real migration files;
-- - fail-closed duplicate checks;
-- - one transaction;
-- - rollback instructions.
--
-- It is not placed in supabase/migrations and must not be executed unless the
-- controller explicitly approves emergency equivalence instead of CLI repair.

-- -----------------------------------------------------------------------------
-- F. Metadata-only rollback preparation
-- -----------------------------------------------------------------------------
-- Preferred rollback command if controller-approved repair needs to be reverted:
--
--   supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 \
--     --status reverted
--
-- Read-only verification before and after rollback:

select version, name, cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
where version in ('0001','0002','0003','0004','0005','0006','0007','0009')
order by version;

select count(*) as public_table_count
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';

select count(*) as customer_or_assessment_row_count
from public.assessments;

select count(*) as report_fulfilment_row_count
from public.report_fulfilments;

select count(*) as report_generation_run_row_count
from public.report_generation_runs;

select count(*) as report_row_count
from public.reports;

select count(*) as email_event_row_count
from public.email_events;

-- Expected rollback effect:
-- - only rows in supabase_migrations.schema_migrations for the listed versions change;
-- - public schema object counts remain unchanged;
-- - customer, assessment, order, fulfilment, report and email rows remain unchanged;
-- - Phase 14 flags remain unchanged/off.

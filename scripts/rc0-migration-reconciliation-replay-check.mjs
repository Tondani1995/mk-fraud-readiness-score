// Ad-hoc verification script for docs/safe-launch/25-source-cloud-migration-reconciliation.md.
// Boots disposable embedded Postgres, replays every committed migration file in exact filename
// (version) order, and reports the exact failure point if any. Not part of the release test suite
// registry -- a one-off reconciliation-proof artifact, referenced by doc 25.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const PgClient = createRequire(import.meta.url)('pg').Client;

const port = 58500 + (process.pid % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0-reconciliation-replay-'));
const postgres = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false });
const db = new PgClient({ host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb' });

function assert(condition, message) {
  if (!condition) throw new Error(`RECONCILIATION ASSERTION FAILED: ${message}`);
}

async function scalar(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0]?.value;
}

async function assertMethodologyCloneAfter0009() {
  const methodology = await db.query(`
    select id, status from public.methodology_versions where version_code = 'MFRS-V1.1'
  `);
  assert(methodology.rows.length === 1, `0009 must create exactly one MFRS-V1.1 row; got ${methodology.rows.length}`);
  assert(methodology.rows[0].id === 'df96e242-9625-4b2a-bc62-615ae402483a', `MFRS-V1.1 id must be deterministic; got ${methodology.rows[0].id}`);
  assert(methodology.rows[0].status === 'active', `MFRS-V1.1 must be active after 0009; got ${methodology.rows[0].status}`);
  const oldMethodologyId = await scalar(`select id as value from public.methodology_versions where version_code = 'MFRS-V1.0'`);

  const checks = [
    ['response scales', `select count(*)::int as value from public.response_scale where methodology_version_id = $1`],
    ['domains', `select count(*)::int as value from public.domains where methodology_version_id = $1`],
    ['questions', `select count(*)::int as value from public.questions where methodology_version_id = $1`],
    ['exposure factors', `select count(*)::int as value from public.exposure_factors where methodology_version_id = $1`],
    ['recommendation rules', `select count(*)::int as value from public.recommendation_rules where methodology_version_id = $1`]
  ];
  for (const [label, sql] of checks) {
    const count = await scalar(sql, [methodology.rows[0].id]);
    assert(count > 0, `cloned ${label} must belong to MFRS-V1.1`);
  }

  const reportBlockCounts = await db.query(`
    select methodology_version_id, count(*)::int as count
    from public.report_content_blocks
    where methodology_version_id in ($1, $2)
    group by methodology_version_id
  `, [methodology.rows[0].id, oldMethodologyId]);
  const oldBlockCount = reportBlockCounts.rows.find((row) => row.methodology_version_id !== methodology.rows[0].id)?.count ?? 0;
  const newBlockCount = reportBlockCounts.rows.find((row) => row.methodology_version_id === methodology.rows[0].id)?.count ?? 0;
  assert(newBlockCount === oldBlockCount, `report-content block clone cardinality must match V1.0 at 0009; old=${oldBlockCount}, new=${newBlockCount}`);

  const applicabilityCounts = await db.query(`
    select q.methodology_version_id, count(*)::int as count
    from public.question_applicability_rules qar
    join public.questions q on q.id = qar.question_id
    where q.methodology_version_id in ($1, $2)
    group by q.methodology_version_id
  `, [oldMethodologyId, methodology.rows[0].id]);
  const oldApplicabilityCount = applicabilityCounts.rows.find((row) => row.methodology_version_id === oldMethodologyId)?.count ?? 0;
  const newApplicabilityCount = applicabilityCounts.rows.find((row) => row.methodology_version_id === methodology.rows[0].id)?.count ?? 0;
  assert(newApplicabilityCount === oldApplicabilityCount, `cloned applicability rules must reference cloned MFRS-V1.1 questions; old=${oldApplicabilityCount}, new=${newApplicabilityCount}`);
  return methodology.rows[0].id;
}

async function assertFinalCanonicalState() {
  const developingKeys = [
    'domain_fraud_incident_response_developing',
    'domain_whistleblowing_and_reporting_culture_developing',
    'domain_third_party_and_supply_chain_fraud_risk_developing',
    'domain_fraud_culture_and_awareness_developing',
    'domain_continuous_improvement_and_fraud_risk_monitoring_developing'
  ];
  const developing = await db.query(`
    select block_key, count(*)::int as count
    from public.report_content_blocks
    where block_key = any($1)
    group by block_key
    order by block_key
  `, [developingKeys]);
  assert(developing.rows.length === developingKeys.length, `all five Developing narrative blocks must exist; got ${developing.rows.length}`);
  assert(developing.rows.every((row) => row.count === 1), 'each Developing narrative block must exist exactly once');

  const constraint = await scalar(`
    select count(*)::int as value
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'report_content_blocks'
      and c.conname = 'report_content_blocks_domain_code_canonical'
  `);
  assert(constraint === 1, 'report_content_blocks_domain_code_canonical must exist');

  const activeMethodology = await db.query(`
    select version_code from public.methodology_versions where status = 'active' order by version_code
  `);
  assert(activeMethodology.rows.length === 1 && activeMethodology.rows[0].version_code === 'MFRS-V1.1', 'MFRS-V1.1 must remain the sole active methodology');

  const templates = await db.query(`
    select template_code, version_number, report_type, status
    from public.report_templates where report_type = 'essential_self_assessment' and status = 'active'
    order by template_code, version_number
  `);
  assert(templates.rows.length === 1, `exactly one active Essential template must exist; got ${templates.rows.length}`);
  assert(templates.rows[0].template_code === 'phase10_premium_v2' && templates.rows[0].version_number === 1, 'active Essential template must be phase10_premium_v2 v1');
  const forbiddenTemplates = await scalar(`
    select count(*)::int as value from public.report_templates
    where status = 'active' and template_code in ('mk_fraud_readiness_advisory_v1', 'mk_fraud_readiness_validated_advisory_v1')
  `);
  assert(forbiddenTemplates === 0, 'retired 0011 template codes must not be active');
  const validatedTemplates = await scalar(`
    select count(*)::int as value from public.report_templates
    where status = 'active' and report_type = 'mk_validated'
  `);
  assert(validatedTemplates === 0, 'absence of an active mk_validated template must remain explicit');
}

console.log('Booting disposable local Postgres...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');
await db.connect();

try {
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
    create schema if not exists vault;
    create table if not exists vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, owner uuid, owner_id text, public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, name text not null, statements text[] not null);
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser login; end if;
    end
    $$;
    grant anon, authenticated, service_role to postgres;
    alter database testdb set search_path=public,extensions;
  `);

  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
  assert(!migrationFiles.includes('0011_phase10_pdf_report_engine_additions.sql'), 'retired 0011 must not be in the active replay path');
  const migrationVersions = migrationFiles.map((name) => name.slice(0, name.indexOf('_')));
  assert(migrationVersions.every((version) => /^\d+$/.test(version)), 'every active migration must have a numeric version prefix');
  assert(new Set(migrationVersions).size === migrationVersions.length, 'active migration version prefixes must be unique');
  await db.query('create temp table expected_migration_versions (version text primary key)');
  await db.query(`insert into expected_migration_versions(version) values ${migrationVersions.map((version) => `($${migrationVersions.indexOf(version) + 1})`).join(', ')}`, migrationVersions);
  const pendingMigrations = [
    '20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql',
    '20260724150000_release_a_backlog_reconciliation.sql',
    '20260724160000_release_b_durable_fulfilment.sql',
    '20260724170000_release_c_email_secure_delivery.sql',
    '20260724180000_release_c_closure_delivery_exceptions.sql',
    '20260725090000_release_c_runtime_secret_admin_provisioning.sql',
    '20260725150000_release_d_operational_alert_lifecycle.sql'
  ];
  const appliedOrder = [];
  console.log(`Replaying ${migrationFiles.length} migration files in order...`);
  let lastOk = null;
  for (const name of migrationFiles) {
    try {
      const sql = fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
      await db.query(sql);
      const separator = name.indexOf('_');
      await db.query(
        'insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, $3)',
        [name.slice(0, separator), name.slice(separator + 1, -4), [sql]]
      );
      lastOk = name;
      appliedOrder.push(name);
      if (name === '0009_methodology_copy_polish.sql') {
        await assertMethodologyCloneAfter0009();
        console.log('0009 deterministic MFRS-V1.1 clone assertions passed.');
      }
    } catch (error) {
      console.log(`\nFAILED at ${name}`);
      console.log(`Last successful migration: ${lastOk}`);
      console.log(`Error: ${error.message}`);
      process.exitCode = 1;
      throw error;
    }
  }
  console.log('All migrations replayed successfully with no error.');

  assert(pendingMigrations.every((name, index) => appliedOrder.indexOf(name) >= 0 && (index === 0 || appliedOrder.indexOf(name) > appliedOrder.indexOf(pendingMigrations[index - 1]))), 'all seven pending migrations must apply in order');
  assert(appliedOrder.at(-1) === '20260725150000_release_d_operational_alert_lifecycle.sql', 'replay must reach Release D operational alert lifecycle');
  await assertFinalCanonicalState();
  console.log('Final canonical methodology, content, template and retired-migration assertions passed.');

  const releaseAssertions = fs.readFileSync(path.join(root, 'scripts/phase14-migration-replay-assertions.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
  await db.query(releaseAssertions);
  console.log('Release A-D integration assertions passed.');

  // Report-templates row count -- proves/disproves the documented 0011-vs-restored-migrations
  // duplicate-seed-state concern for report_templates specifically.
  const templates = await db.query(`select template_code, version_number from public.report_templates order by template_code, version_number`);
  console.log(`\nreport_templates rows after replay (${templates.rows.length}):`);
  for (const row of templates.rows) console.log(`  ${row.template_code} v${row.version_number}`);

  const buckets = await db.query(`select id, file_size_limit from storage.buckets order by id`);
  console.log(`\nstorage.buckets rows after replay (${buckets.rows.length}):`);
  for (const row of buckets.rows) console.log(`  ${row.id} -> ${row.file_size_limit}`);

  const blockCount = await db.query(`select count(*)::int as n from public.report_content_blocks`);
  console.log(`\nreport_content_blocks row count after replay: ${blockCount.rows[0].n}`);

  const funcDef = await db.query(`select pg_get_functiondef('public.invalidate_phase14_authority_on_gate_change()'::regprocedure) as def`);
  const hasWhereTrue = funcDef.rows[0].def.includes('where true');
  console.log(`\ninvalidate_phase14_authority_on_gate_change() has "where true": ${hasWhereTrue}`);
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

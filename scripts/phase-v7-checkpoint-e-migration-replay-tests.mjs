import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let EmbeddedPostgres;
let pg;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  pg = await import('pg');
} catch {
  console.log('SKIPPED: embedded-postgres/pg not installed.');
  process.exit(0);
}

const root = process.cwd();
const migrationName = '20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql';
const migrationPath = path.join(root, 'supabase/migrations', migrationName);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const port = 56300 + ((process.pid + 197) % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-e-migration-pg-'));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'testpass',
  port,
  persistent: false
});
const clients = [];

function client() {
  const value = new pg.default.Client({
    host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb'
  });
  clients.push(value);
  return value;
}

async function columnExists(db, table, column) {
  const result = await db.query(
    `select exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name=$1 and column_name=$2
     ) as present`,
    [table, column]
  );
  return result.rows[0].present;
}

async function activationSnapshot(db) {
  const settings = await db.query(`select setting_key, value_json from public.app_settings order by setting_key`);
  const policies = await db.query(`select policy_key, enabled from public.phase14_feature_policies order by policy_key`);
  const routes = await db.query(`select requested_provider, enabled, approved_gate_version from public.phase14_ai_route_policies order by requested_provider`);
  return JSON.stringify({ settings: settings.rows, policies: policies.rows, routes: routes.rows });
}

console.log('Booting disposable Postgres for Checkpoint E migration replay...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');
const db = client();
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

  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql') && name !== migrationName)
    .sort();
  for (const name of migrationFiles) {
    await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
  }
  console.log(`Applied ${migrationFiles.length} pre-Checkpoint E migrations from a clean database.`);

  assert.equal(await columnExists(db, 'report_ai_attempts', 'manual_generation_attempt_id'), false);
  const beforeActivation = await activationSnapshot(db);

  await db.query('begin');
  await db.query(migrationSql);
  assert.equal(await columnExists(db, 'report_ai_attempts', 'manual_generation_attempt_id'), true);
  assert.equal(await columnExists(db, 'report_ai_attempts', 'manual_order_id'), true);
  assert.equal(await columnExists(db, 'report_ai_attempts', 'manual_assessment_id'), true);
  assert.equal(await columnExists(db, 'report_ai_attempts', 'manual_score_run_id'), true);
  await db.query('rollback');
  assert.equal(await columnExists(db, 'report_ai_attempts', 'manual_generation_attempt_id'), false);
  console.log('  ok - transactional rollback restores the exact pre-migration schema');

  await db.query(migrationSql);
  assert.equal(await columnExists(db, 'report_ai_attempts', 'manual_generation_attempt_id'), true);
  assert.equal(await columnExists(db, 'manual_report_generation_attempts', 'final_narrative_json'), true);
  assert.equal(await columnExists(db, 'report_generation_runs', 'repair_validation_json'), true);
  const parentConstraint = await db.query(`
    select pg_get_constraintdef(oid) as definition, convalidated
    from pg_constraint where conname='report_ai_attempts_exactly_one_parent_chk'
  `);
  assert.equal(parentConstraint.rowCount, 1);
  assert.match(parentConstraint.rows[0].definition, /num_nonnulls\(fulfilment_id, manual_generation_attempt_id\) = 1/);
  assert.equal(parentConstraint.rows[0].convalidated, true);
  assert.equal(await activationSnapshot(db), beforeActivation);
  console.log('  ok - pre-migration state upgrades without activating AI, routes or delivery');

  await db.query(migrationSql);
  assert.equal(await activationSnapshot(db), beforeActivation);
  const functionCount = await db.query(`
    select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'authorize_manual_report_ai_action','claim_manual_report_ai_attempt',
      'settle_manual_report_ai_attempt','record_manual_report_narrative_provenance'
    )
  `);
  assert.equal(functionCount.rows[0].count, 4);
  console.log('  ok - post-migration replay is idempotent and preserves activation state');

  const adminId = (await db.query(`insert into auth.users(email) values ('checkpoint-e-admin@test.local') returning id`)).rows[0].id;
  await db.query(`insert into public.admin_profiles(id,email,role,status) values ($1,'checkpoint-e-admin@test.local','platform_admin','active')`, [adminId]);
  const sessionId = (await db.query(`insert into auth.sessions(user_id,not_after) values ($1,now()+interval '1 day') returning id`, [adminId])).rows[0].id;
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({
    sub: adminId, role: 'authenticated', aal: 'aal2', session_id: sessionId,
    exp: Math.floor(Date.now() / 1000) + 3600
  })]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [adminId]);
  const organisationId = (await db.query(`insert into public.organisations(legal_name) values ('Checkpoint E Test Organisation') returning id`)).rows[0].id;
  const methodologyId = (await db.query(`select id from public.methodology_versions order by created_at limit 1`)).rows[0].id;
  const assessmentId = (await db.query(`
    insert into public.assessments(assessment_reference,organisation_id,methodology_version_id,status,submitted_at)
    values ('CHECKPOINT-E-BINDING',$1,$2,'scored',now()) returning id
  `, [organisationId, methodologyId])).rows[0].id;
  const scoreRunId = (await db.query(`
    insert into public.score_runs(
      assessment_id,methodology_version_id,run_number,run_type,status,
      overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,
      coverage_pct,input_hash,locked_at
    ) values ($1,$2,1,'initial','completed',50,'Developing','Developing',20,'Low',100,repeat('b',64),now()) returning id
  `, [assessmentId, methodologyId])).rows[0].id;
  await db.query(`update public.assessments set current_score_run_id=$1 where id=$2`, [scoreRunId, assessmentId]);
  const orderId = (await db.query(`
    insert into public.orders(order_reference,assessment_id,product_id,status,amount_cents,currency)
    select 'CHECKPOINT-E-ORDER',$1,id,'payment_received',price_cents,currency
    from public.products where product_code='essential_self_assessment' returning id
  `, [assessmentId])).rows[0].id;
  const manualAttemptId = (await db.query(`
    insert into public.manual_report_generation_attempts(
      request_key,order_id,report_version,trigger_source,requested_by,status,technical_reference,started_at
    ) values ('checkpoint-e-binding',$1,1,'admin_generate',$2,'REPORT_GENERATING','checkpoint-e-test',now()) returning id
  `, [orderId, adminId])).rows[0].id;
  await db.query(`select public.set_phase14_security_gate_version(1,'Checkpoint E disposable binding test')`);
  await db.query(`select public.set_phase14_feature_policy('ai_narrative',true,'Checkpoint E disposable binding test')`);
  await db.query(`select public.set_phase14_ai_route_policy('openai',true)`);
  await db.query(`
    update public.app_settings set value_json=jsonb_set(value_json,'{premium_report_ai_narrative_enabled}','true'::jsonb,true)
    where setting_key in ('phase14_autonomous_report_engine','phase14_delivery_policy')
  `);
  const claimed = (await db.query(`select public.claim_manual_report_ai_attempt($1::jsonb) as value`, [JSON.stringify({
    manual_generation_attempt_id: manualAttemptId,
    generation_identity: `manual-report:${orderId}:${assessmentId}:${scoreRunId}:v1`,
    attempt_kind: 'generate', provider_request_key: 'checkpoint-e-provider-request-1',
    requested_provider: 'openai', requested_model: 'checkpoint-e-test-model',
    evidence_checksum: 'a'.repeat(64), prompt_version: 'checkpoint-e-prompt-v4',
    schema_version: 'checkpoint-e-schema-v4', input_size_bytes: 100,
    estimated_input_tokens: 25, max_output_tokens: 5000,
    max_estimated_cost_micros: 250000, timeout_ms: 45000
  })])).rows[0].value;
  assert.equal(claimed.manual_generation_attempt_id, manualAttemptId);
  assert.equal(claimed.manual_order_id, orderId);
  assert.equal(claimed.manual_assessment_id, assessmentId);
  assert.equal(claimed.manual_score_run_id, scoreRunId);
  assert.equal(claimed.evidence_checksum, 'a'.repeat(64));
  console.log('  ok - manual claim binds parent, order, assessment, locked score, identity and checksum');
  console.log('\n4 passed, 0 failed');
} finally {
  for (const value of clients) {
    try { if (!value.ended) await value.end(); } catch {}
  }
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

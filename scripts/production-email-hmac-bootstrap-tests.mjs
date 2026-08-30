// Focused contract test for the one-time Production email HMAC bootstrap.
//
// The test intentionally uses synthetic values in a disposable local Postgres.
// It proves the actual migration function and grants, while static assertions
// prove the narrow Production-only route has no Auth/MFA/admin-session seam.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const migrationFile = 'supabase/migrations/20260830190000_production_email_hmac_bootstrap.sql';
const routeFile = 'src/app/score/api/internal/phase14-email-hmac-bootstrap/route.ts';
const migration = fs.readFileSync(path.join(root, migrationFile), 'utf8');
const route = fs.readFileSync(path.join(root, routeFile), 'utf8');

function ok(condition, label) {
  assert.equal(Boolean(condition), true, `FAIL: ${label}`);
  console.log(`  ok - ${label}`);
}

function includes(text, needle, label) {
  ok(text.includes(needle), label);
}

function notIncludes(text, needle, label) {
  ok(!text.includes(needle), label);
}

console.log('--- 1. Static bootstrap boundary ---');
includes(migration, 'alter column rotated_by drop not null', 'only the actor column is relaxed for system bootstrap provenance');
includes(migration, 'create or replace function public.bootstrap_phase14_email_hmac_secrets(', 'dedicated bootstrap RPC exists');
includes(migration, "pg_catalog.char_length(p_webhook_secret) < 48", 'webhook bootstrap value requires at least 48 characters');
includes(migration, "pg_catalog.char_length(p_lookup_secret) < 48", 'lookup bootstrap value requires at least 48 characters');
includes(migration, "'phase14_email_hmac_bootstrap_already_complete'", 'completed bootstrap is permanently rejected');
includes(migration, "'phase14_email_hmac_bootstrap_partial_state'", 'partial pre-existing state is rejected');
includes(migration, "'phase14_email_hmac_bootstrap_values_must_be_distinct'", 'equal HMAC values are rejected');
includes(migration, "'phase14_runtime_secret_bootstrapped'", 'each bootstrap key receives an audit row');
includes(migration, "'fingerprint', v_webhook_fingerprint", 'webhook audit stores only a fingerprint');
includes(migration, "'fingerprint', v_lookup_fingerprint", 'lookup audit stores only a fingerprint');
includes(migration, 'grant execute on function public.bootstrap_phase14_email_hmac_secrets(text, text)\n  to service_role', 'only service_role receives RPC execution');
notIncludes(migration, 'grant select on table phase14_private.runtime_secrets', 'bootstrap adds no runtime-secret table SELECT grant');
notIncludes(migration, 'grant insert on table phase14_private.runtime_secrets', 'bootstrap adds no runtime-secret table INSERT grant');
notIncludes(migration, 'grant update on table phase14_private.runtime_secrets', 'bootstrap adds no runtime-secret table UPDATE grant');
notIncludes(migration, 'grant delete on table phase14_private.runtime_secrets', 'bootstrap adds no runtime-secret table DELETE grant');
notIncludes(migration, 'admin_profiles', 'bootstrap does not create or depend on an admin profile');

includes(route, "process.env.VERCEL_ENV === 'production'", 'route is unavailable outside Production');
includes(route, "process.env[BOOTSTRAP_SECRET_ENV]", 'route requires an ephemeral deployment-bound secret');
includes(route, 'MIN_BOOTSTRAP_SECRET_LENGTH = 48', 'route rejects low-entropy/short bootstrap credentials');
includes(route, 'crypto.timingSafeEqual', 'route compares the bootstrap credential in constant time');
includes(route, "db.rpc('bootstrap_phase14_email_hmac_secrets'", 'route calls only the dedicated RPC');
includes(route, 'Cache-Control', 'route prevents caching of bootstrap responses');
notIncludes(route, 'requireAdmin', 'route does not add admin-session gating');
notIncludes(route, 'getAdminAccessTokenFromCookies', 'route does not add browser-session dependency');
notIncludes(route, 'auth.', 'route does not add Supabase Auth dependency');
notIncludes(route, 'console.', 'route never logs secrets or provider configuration');
notIncludes(route, 'secretValue', 'route does not use or return the ordinary admin form payload');

console.log('--- 2. Disposable Postgres: grants, first write, audit, and one-time refusal ---');

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = await import('pg');
const port = 57900 + (process.pid % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-email-hmac-bootstrap-'));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'testpass',
  port,
  persistent: false,
});
const db = new pg.default.Client({
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password: 'testpass',
  database: 'testdb',
});

async function expectFailure(fn, expected, label) {
  try {
    await fn();
    throw new Error(`NO_EXPECTED_FAILURE: ${label}`);
  } catch (error) {
    const message = String(error?.message ?? error);
    ok(message.includes(expected), label);
  }
}

try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('testdb');
  await db.connect();
  await db.query(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create type public.audit_actor_type as enum ('admin', 'respondent_token', 'system');
    create table public.admin_profiles (id uuid primary key);
    create table public.audit_logs (
      id uuid primary key default extensions.gen_random_uuid(),
      actor_type public.audit_actor_type not null,
      actor_user_id uuid,
      entity_table text not null,
      entity_id uuid,
      action text not null,
      before_json jsonb,
      after_json jsonb,
      created_at timestamptz not null default now()
    );
    create schema phase14_private;
    create table phase14_private.runtime_secrets (
      secret_key text primary key check (secret_key in (
        'provider_webhook_db_hmac', 'provider_lookup_db_hmac'
      )),
      secret_value text not null check (length(secret_value) >= 32),
      rotated_at timestamptz not null default now(),
      rotated_by uuid not null references public.admin_profiles(id) on delete restrict
    );
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit; end if;
    end
    $$;
    grant anon, authenticated, service_role to postgres;
    revoke all on schema phase14_private from public, anon, authenticated, service_role;
    revoke all on table phase14_private.runtime_secrets from public, anon, authenticated, service_role;
  `);

  await db.query(migration);

  const privilegeRows = (await db.query(`
    select
      has_function_privilege('public', 'public.bootstrap_phase14_email_hmac_secrets(text,text)', 'execute') as public_execute,
      has_function_privilege('anon', 'public.bootstrap_phase14_email_hmac_secrets(text,text)', 'execute') as anon_execute,
      has_function_privilege('authenticated', 'public.bootstrap_phase14_email_hmac_secrets(text,text)', 'execute') as authenticated_execute,
      has_function_privilege('service_role', 'public.bootstrap_phase14_email_hmac_secrets(text,text)', 'execute') as service_execute,
      has_table_privilege('service_role', 'phase14_private.runtime_secrets', 'select') as service_select,
      has_table_privilege('service_role', 'phase14_private.runtime_secrets', 'insert') as service_insert,
      has_table_privilege('service_role', 'phase14_private.runtime_secrets', 'update') as service_update,
      has_table_privilege('service_role', 'phase14_private.runtime_secrets', 'delete') as service_delete
  `)).rows[0];
  ok(privilegeRows.public_execute === false, 'PUBLIC cannot execute the bootstrap RPC');
  ok(privilegeRows.anon_execute === false, 'anon cannot execute the bootstrap RPC');
  ok(privilegeRows.authenticated_execute === false, 'authenticated cannot execute the bootstrap RPC');
  ok(privilegeRows.service_execute === true, 'service_role can execute the bootstrap RPC');
  ok(privilegeRows.service_select === false, 'service_role has no runtime-secret SELECT grant');
  ok(privilegeRows.service_insert === false, 'service_role has no runtime-secret INSERT grant');
  ok(privilegeRows.service_update === false, 'service_role has no runtime-secret UPDATE grant');
  ok(privilegeRows.service_delete === false, 'service_role has no runtime-secret DELETE grant');

  const webhookSecret = crypto.randomBytes(48).toString('base64url');
  const lookupSecret = crypto.randomBytes(48).toString('base64url');
  const webhookFingerprint = crypto.createHash('sha256').update(webhookSecret).digest('hex');
  const lookupFingerprint = crypto.createHash('sha256').update(lookupSecret).digest('hex');

  await db.query('set role anon');
  await expectFailure(
    () => db.query('select public.bootstrap_phase14_email_hmac_secrets($1,$2)', [webhookSecret, lookupSecret]),
    'permission denied',
    'anon cannot invoke the bootstrap RPC'
  );
  await db.query('reset role');

  await db.query('set role authenticated');
  await expectFailure(
    () => db.query('select public.bootstrap_phase14_email_hmac_secrets($1,$2)', [webhookSecret, lookupSecret]),
    'permission denied',
    'authenticated cannot invoke the bootstrap RPC'
  );
  await db.query('reset role');

  await db.query('set role service_role');
  const first = (await db.query(
    'select public.bootstrap_phase14_email_hmac_secrets($1,$2) as result',
    [webhookSecret, lookupSecret]
  )).rows[0].result;
  await expectFailure(
    () => db.query('select * from phase14_private.runtime_secrets'),
    'permission denied',
    'service_role cannot read the runtime-secret table directly'
  );
  await expectFailure(
    () => db.query('select public.bootstrap_phase14_email_hmac_secrets($1,$2)', [crypto.randomBytes(48).toString('base64url'), crypto.randomBytes(48).toString('base64url')]),
    'phase14_email_hmac_bootstrap_already_complete',
    'a second service-role invocation is rejected as already complete'
  );
  await db.query('reset role');

  assert.equal(first.fingerprints.provider_webhook_db_hmac, webhookFingerprint);
  assert.equal(first.fingerprints.provider_lookup_db_hmac, lookupFingerprint);
  assert.equal(JSON.stringify(first).includes(webhookSecret), false);
  assert.equal(JSON.stringify(first).includes(lookupSecret), false);
  ok(true, 'successful response contains fingerprints only');

  const rows = (await db.query(`
    select secret_key,
      encode(extensions.digest(convert_to(secret_value, 'UTF8'), 'sha256'), 'hex') as fingerprint,
      rotated_by
    from phase14_private.runtime_secrets
    order by secret_key
  `)).rows;
  assert.deepEqual(rows.map((row) => row.secret_key), [
    'provider_lookup_db_hmac',
    'provider_webhook_db_hmac',
  ]);
  assert.deepEqual(rows.map((row) => row.fingerprint), [lookupFingerprint, webhookFingerprint]);
  assert.equal(rows.every((row) => row.rotated_by === null), true);
  ok(true, 'both exact runtime-secret rows persist with matching fingerprints and system provenance');

  const audits = (await db.query(`
    select action, after_json
      from public.audit_logs
     where entity_table = 'phase14_private.runtime_secrets'
       and action = 'phase14_runtime_secret_bootstrapped'
     order by after_json->>'secret_key'
  `)).rows;
  assert.equal(audits.length, 2);
  assert.equal(audits.every((row) => row.after_json.provisioning === 'one_time_production_bootstrap'), true);
  assert.equal(audits.some((row) => row.after_json.fingerprint === webhookFingerprint), true);
  assert.equal(audits.some((row) => row.after_json.fingerprint === lookupFingerprint), true);
  assert.equal(audits.every((row) => !JSON.stringify(row.after_json).includes(webhookSecret)), true);
  assert.equal(audits.every((row) => !JSON.stringify(row.after_json).includes(lookupSecret)), true);
  ok(true, 'exactly two fingerprint-only system audit rows are present');
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log('Production email HMAC bootstrap checks passed.');

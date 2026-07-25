// Release D: operational-alerts lifecycle tests.
//
// Three parts, matching this repo's established convention:
//  1. Static source assertions -- the page performs no write on initial render, never renders raw
//     detail_json, and gates mutation UI behind the capability check; the API route enforces
//     platform_admin/reviewer + AAL2 before calling the RPC and maps a capability-absent error to a
//     clean message rather than a raw PostgREST error.
//  2. Pure-function tests (loaded via TypeScript transpile, same pattern as
//     phase14-security-closure-tests.mjs's loadPureModule) for the capability-detection decision
//     logic and the category-to-safe-presentation mapping, run against fixtures rather than a real
//     PostgREST server -- this repo's live-check harness runs raw Postgres only, no PostgREST layer.
//  3. Live checks against a disposable local Postgres with every migration through Release D's own
//     replayed verbatim: the full auth/role/transition-matrix/audit-trail behaviour of
//     transition_phase14_operational_alert, and -- the one test that proves this isn't just a
//     synthetic fixture -- a REAL alert created by Release C's own bounce/complaint path
//     (apply_email_provider_event_atomic), read back and run through the real presentation mapper.
//
// Note on item 18 of this cycle's required test list ("all prior Release A/B/C tests remain
// green"): run separately via `npm run release-a:test-backlog-reconciliation`,
// `release-b:test-durable-fulfilment`, `release-c:test-email-secure-delivery`,
// `release-c:test-runtime-secret-provisioning`, and the order-detail-delivery-truth suite -- not
// re-embedded here, matching how no prior release cycle has ever nested another release's test
// script inside its own.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function ok(condition, label) { if (!condition) throw new Error(`FAIL: ${label}`); console.log(`  ok - ${label}`); }
function includes(file, needle, label) { ok(read(file).includes(needle), `${label} (expected ${file} to include ${JSON.stringify(needle)})`); }
function notIncludes(file, needle, label) { ok(!read(file).includes(needle), `${label} (expected ${file} NOT to include ${JSON.stringify(needle)})`); }

console.log('--- 1. Static: no write on initial render, no raw detail_json, capability-gated mutation UI, route auth ---');

const pageFile = 'src/app/score/admin/operational-alerts/page.tsx';
includes(pageFile, "requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin'])", 'the page permits exactly the four roles that already have table-select access');
notIncludes(pageFile, '.insert(', 'the page never inserts on initial render');
notIncludes(pageFile, '.update(', 'the page never updates on initial render');
notIncludes(pageFile, "db.rpc(", 'the page never calls an RPC on initial render (mutation is delegated entirely to the client component + API route)');
includes(pageFile, 'canMutate && capability', 'mutation controls are gated behind both role AND capability, not rendered unconditionally');
notIncludes(pageFile, 'detail_json}', 'the page never interpolates the raw detail_json object directly');
includes(pageFile, 'extractSafeAlertDetails', 'the page renders only the allow-listed safe detail fields, not raw detail_json');
includes(pageFile, '!capability', 'the page shows an explicit message when lifecycle capability is absent');
notIncludes(pageFile, 'recipient_email', 'the page never selects or renders recipient_email');
notIncludes(pageFile, 'customer_email', 'the page never selects or renders customer_email');
notIncludes(pageFile, 'customer_name', 'the page never selects or renders customer_name');

const routeFile = 'src/app/score/api/admin/operational-alerts/[alertId]/transition/route.ts';
includes(routeFile, "requireAdmin(['platform_admin', 'reviewer'])", 'the transition route restricts to the two mutation roles, narrower than the four read roles');
includes(routeFile, "decodeAalClaimForDisplayOnly(accessToken) !== 'aal2'", 'the route pre-checks AAL2 before calling the RPC');
includes(routeFile, "if (!reason)", 'the route requires a reason before calling the RPC');
includes(routeFile, "PGRST202", 'the route maps a capability-absent (function-not-found) error to a clean message');
notIncludes(routeFile, 'console.log', 'the route never logs anything');

const libFile = 'src/lib/reports/operational-alerts.ts';
includes(libFile, 'Accept: \'application/openapi+json\'', 'capability detection reads the PostgREST OpenAPI document, not a raw RPC call attempt');
includes(libFile, 'return false', 'capability detection has an explicit fail-closed path');

const migrationFile = 'supabase/migrations/20260725150000_release_d_operational_alert_lifecycle.sql';
includes(migrationFile, "array['platform_admin','reviewer']::public.admin_role[]", 'the RPC restricts mutation to platform_admin/reviewer at the database layer, not only the API route');
includes(migrationFile, 'phase14_require_actor(', 'the RPC uses the same actor/AAL2 gate as every other Phase14 admin mutation RPC');
includes(migrationFile, "v_reason = '' or length(v_reason) > 500", 'the RPC itself validates the reason, not only the API route');
includes(migrationFile, 'phase14_operational_alert_transition_invalid', 'the RPC rejects an invalid transition explicitly');
includes(migrationFile, 'phase14_operational_alert_not_found', 'the RPC rejects a nonexistent alert explicitly');
includes(migrationFile, "insert into public.audit_logs", 'the RPC writes an audit_logs entry');
includes(migrationFile, "set_config('phase14.authoritative_transition', 'operational_alert_rpc', true)", 'the RPC satisfies guard_phase14_authoritative_mutation() for both the alert row and the audit_logs write, using the context value 0017 already allow-lists for this purpose');
notIncludes(migrationFile, "'detail_json'", 'the RPC never places detail_json content into the audit record');
includes(migrationFile, 'acknowledged_at = null', 'reopening clears acknowledged metadata, not only resolved metadata');
includes(migrationFile, 'resolved_at = null', 'reopening clears resolved metadata');

console.log('--- 2. Pure-function checks (TypeScript transpiled, no live PostgREST server needed) ---');

function loadPureModule(relativePath, resolveImport) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(resolveImport ?? (() => ({})), module, module.exports);
  return module.exports;
}

const { specHasOperationalAlertLifecycleCapability, getOperationalAlertPresentation, extractSafeAlertDetails } = loadPureModule(
  'src/lib/reports/operational-alerts.ts',
  (specifier) => {
    if (specifier === '@/lib/env/server') return { requireServerEnv: () => 'unused-in-pure-tests' };
    throw new Error(`Unexpected runtime dependency in pure module: ${specifier}`);
  }
);

ok(specHasOperationalAlertLifecycleCapability({ paths: { '/rpc/transition_phase14_operational_alert': {} } }) === true, 'capability detection returns true when the RPC path is present in the OpenAPI document');
ok(specHasOperationalAlertLifecycleCapability({ paths: { '/rpc/set_phase14_runtime_secret': {} } }) === false, 'capability detection returns false when the RPC path is absent (present schema, wrong/missing path)');
ok(specHasOperationalAlertLifecycleCapability({ paths: {} }) === false, 'capability detection returns false for an empty paths object (pre-Release-D cloud schema)');
ok(specHasOperationalAlertLifecycleCapability(null) === false, 'capability detection fails closed on a null spec');
ok(specHasOperationalAlertLifecycleCapability(undefined) === false, 'capability detection fails closed on an undefined spec');

for (const category of [
  'provider_event_payload_conflict', 'report_temporary_object_cleanup_failed',
  'delivery_finalization_replay_conflict', 'storage_cleanup_verification_failed',
  'delivery_complaint', 'delivery_permanent_bounce', 'report_download_object_missing',
  'report_download_object_size_invalid', 'report_download_checksum_mismatch',
  'report_email_checksum_mismatch'
]) {
  const presentation = getOperationalAlertPresentation(category);
  ok(typeof presentation.summary === 'string' && presentation.summary.length > 0, `${category} has a non-empty summary`);
  ok(typeof presentation.recoveryGuidance === 'string' && presentation.recoveryGuidance.length > 0, `${category} has non-empty recovery guidance (never automatically executed, only described)`);
}
ok(getOperationalAlertPresentation('some_unknown_future_category').summary.length > 0, 'an unknown category falls through to a generic, non-empty summary rather than crashing');
ok(getOperationalAlertPresentation('some_unknown_future_category').safeDetailKeys.length === 0, 'an unknown category exposes zero detail keys');

{
  const dangerous = {
    provider: 'resend', order_id: 'abc', recipient_email: 'real-customer@example.com',
    customer_name: 'Real Customer', access_token: 'super-secret-token', bucket: 'reports'
  };
  const safe = extractSafeAlertDetails('provider_event_payload_conflict', dangerous);
  ok(Object.keys(safe).length === 1 && safe.provider === 'resend', 'extractSafeAlertDetails returns only the allow-listed keys for a known category, dropping everything else');
  ok(!('recipient_email' in safe) && !('customer_name' in safe) && !('access_token' in safe), 'extractSafeAlertDetails never leaks recipient_email/customer_name/access_token even when present in detail_json');
  const unknownCategorySafe = extractSafeAlertDetails('some_unknown_future_category', dangerous);
  ok(Object.keys(unknownCategorySafe).length === 0, 'an unknown category exposes zero detail_json fields, however sensitive-looking the raw data is');
}

console.log('--- 3. Live Postgres replay: full auth/role/transition-matrix/audit behaviour, and a real Release C alert through the real mapper ---');

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = await import('pg');

const port = 58100 + (process.pid % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-d-operational-alerts-pg-'));
const postgres = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false });
const clients = [];
function client() {
  const c = new pg.default.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb' });
  clients.push(c);
  return c;
}

console.log('Booting disposable local Postgres...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');
const db = client();
await db.connect();

async function asClaims(claimsJson) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claimsJson ? JSON.stringify(claimsJson) : '']);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [claimsJson?.sub ? String(claimsJson.sub) : '']);
}
async function asUnauthenticated() { await asClaims(null); }
async function expectException(fn, matchSubstring, label) {
  try {
    await fn();
    throw new Error(`NO_EXPECTED_EXCEPTION: ${label}`);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.includes(matchSubstring)) throw new Error(`FAIL: ${label} -- expected error containing "${matchSubstring}", got: ${message}`);
    ok(true, label);
  }
}

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

  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
  console.log(`Applying ${migrationFiles.length} real migration files verbatim, in order (including Release D's)...`);
  ok(migrationFiles.includes('20260725150000_release_d_operational_alert_lifecycle.sql'), 'Release D\'s migration is present in the replay set');
  for (const name of migrationFiles) {
    await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
  }
  console.log('All migrations applied.');

  // --- Fixtures: five admin profiles, one per role in the matrix ---
  async function makeAdmin(email, role) {
    const userId = (await db.query(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
    await db.query(`insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, $2, $3, 'active', true)`, [userId, email, role]);
    const sessionId = (await db.query(`insert into auth.sessions(user_id, not_after) values ($1, now() + interval '1 day') returning id`, [userId])).rows[0].id;
    return { userId, sessionId, claims: (aal) => ({ sub: userId, role: 'authenticated', aal, exp: 4102444800, session_id: sessionId }) };
  }
  const platformAdmin = await makeAdmin('opsd-platform@truth.local', 'platform_admin');
  const reviewer = await makeAdmin('opsd-reviewer@truth.local', 'reviewer');
  const approver = await makeAdmin('opsd-approver@truth.local', 'approver');
  const readOnlyAdmin = await makeAdmin('opsd-readonly@truth.local', 'read_only_admin');
  const financeAdmin = await makeAdmin('opsd-finance@truth.local', 'finance_admin');

  async function insertAlert(alertKey, overrides = {}) {
    const row = {
      alert_key: alertKey, severity: 'critical', category: 'report_temporary_object_cleanup_failed',
      detail_json: '{}', status: 'open', ...overrides
    };
    const result = await db.query(
      `insert into public.phase14_operational_alerts(alert_key, severity, category, detail_json, status)
       values ($1,$2,$3,$4::jsonb,$5) returning id`,
      [row.alert_key, row.severity, row.category, row.detail_json, row.status]
    );
    return result.rows[0].id;
  }

  console.log('Scenario 1: unauthenticated read fails (RLS)');
  await asUnauthenticated();
  const unauthRead = await db.query(`select * from public.phase14_operational_alerts`);
  ok(unauthRead.rows.length === 0, 'an unauthenticated session sees zero rows -- table select policy requires an authenticated role with an allowed admin role, and current_admin_role() returns null with no session');

  console.log('Scenario 2: non-admin (finance_admin, not in the read-permitted list) read fails');
  await asClaims(financeAdmin.claims('aal2'));
  const financeRead = await db.query(`select * from public.phase14_operational_alerts`);
  ok(financeRead.rows.length === 0, 'finance_admin (not platform_admin/reviewer/approver/read_only_admin) sees zero rows under RLS');

  console.log('Scenario 3: each permitted admin role can read');
  const readAlertId = await (async () => {
    // Insert as postgres superuser (bypasses RLS) to seed a row all four roles should then be able to see.
    return insertAlert('scenario-3-alert');
  })();
  for (const [label, admin] of [['platform_admin', platformAdmin], ['reviewer', reviewer], ['approver', approver], ['read_only_admin', readOnlyAdmin]]) {
    await asClaims(admin.claims('aal2'));
    const rows = (await db.query(`select id from public.phase14_operational_alerts where id = $1`, [readAlertId])).rows;
    ok(rows.length === 1, `${label} can read the alerts table under RLS`);
  }

  console.log('Scenario 4: read_only_admin cannot mutate');
  await asClaims(readOnlyAdmin.claims('aal2'));
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','test')`, [readAlertId]),
    'phase14_role_forbidden',
    'read_only_admin is rejected with phase14_role_forbidden'
  );

  console.log('Scenario 5: approver cannot mutate');
  await asClaims(approver.claims('aal2'));
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','test')`, [readAlertId]),
    'phase14_role_forbidden',
    'approver is rejected with phase14_role_forbidden'
  );

  console.log('Scenario 6: reviewer can acknowledge and resolve');
  const reviewerAlertId = await insertAlert('scenario-6-alert');
  await asClaims(reviewer.claims('aal2'));
  const ackResult = await db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','reviewer ack') as r`, [reviewerAlertId]);
  ok(ackResult.rows[0].r.status === 'acknowledged', 'reviewer can acknowledge');
  const resolveResult = await db.query(`select public.transition_phase14_operational_alert($1,'resolved','reviewer resolve') as r`, [reviewerAlertId]);
  ok(resolveResult.rows[0].r.status === 'resolved', 'reviewer can resolve');

  console.log('Scenario 7: platform_admin can acknowledge, resolve, and reopen');
  const platformAlertId = await insertAlert('scenario-7-alert');
  await asClaims(platformAdmin.claims('aal2'));
  await db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','platform ack') as r`, [platformAlertId]);
  await db.query(`select public.transition_phase14_operational_alert($1,'resolved','platform resolve') as r`, [platformAlertId]);
  const reopenResult = await db.query(`select public.transition_phase14_operational_alert($1,'open','platform reopen') as r`, [platformAlertId]);
  ok(reopenResult.rows[0].r.status === 'open', 'platform_admin can reopen a resolved alert');

  console.log('Scenario 8: note is required');
  const noteAlertId = await insertAlert('scenario-8-alert');
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','')`, [noteAlertId]),
    'phase14_operational_alert_reason_invalid',
    'an empty reason is rejected'
  );
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','   ')`, [noteAlertId]),
    'phase14_operational_alert_reason_invalid',
    'a whitespace-only reason is rejected (trimmed before the length/emptiness check)'
  );

  console.log('Scenario 9: invalid transitions fail');
  const invalidAlertId = await insertAlert('scenario-9-alert');
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'open','no-op reopen from open')`, [invalidAlertId]),
    'phase14_operational_alert_transition_invalid',
    'open -> open is rejected (no meaningful same-state transition)'
  );
  await db.query(`select public.transition_phase14_operational_alert($1,'resolved','skip straight to resolved')`, [invalidAlertId]);
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','cannot acknowledge a resolved alert')`, [invalidAlertId]),
    'phase14_operational_alert_transition_invalid',
    'resolved -> acknowledged is rejected (resolved can only reopen, per the approved transition matrix)'
  );

  console.log('Scenario 10: nonexistent alert fails');
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','test')`, [crypto.randomUUID()]),
    'phase14_operational_alert_not_found',
    'a nonexistent alert id is rejected with phase14_operational_alert_not_found'
  );

  console.log('Scenario 11: successful transition updates correct lifecycle fields');
  const fieldsAlertId = await insertAlert('scenario-11-alert');
  await db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','check fields')`, [fieldsAlertId]);
  const afterAck = (await db.query(`select status, acknowledged_at, acknowledged_by, resolved_at, resolved_by from public.phase14_operational_alerts where id = $1`, [fieldsAlertId])).rows[0];
  assert.equal(afterAck.status, 'acknowledged');
  assert.ok(afterAck.acknowledged_at, 'acknowledged_at is set');
  assert.equal(afterAck.acknowledged_by, platformAdmin.userId, 'acknowledged_by is the acting admin');
  assert.equal(afterAck.resolved_at, null, 'resolved_at is not touched by an acknowledge transition');
  ok(true, 'acknowledge sets exactly the expected fields');
  await db.query(`select public.transition_phase14_operational_alert($1,'open','reopen to check clearing')`, [fieldsAlertId]);
  const afterReopen = (await db.query(`select status, acknowledged_at, acknowledged_by, resolved_at, resolved_by from public.phase14_operational_alerts where id = $1`, [fieldsAlertId])).rows[0];
  assert.equal(afterReopen.status, 'open');
  assert.equal(afterReopen.acknowledged_at, null, 'reopen clears acknowledged_at');
  assert.equal(afterReopen.acknowledged_by, null, 'reopen clears acknowledged_by');
  ok(true, 'reopen clears both acknowledgement and resolution metadata, not only resolved_at');

  console.log('Scenario 12: successful transition writes one audit record');
  const auditAlertId = await insertAlert('scenario-12-alert');
  const auditCountBefore = (await db.query(`select count(*)::int as n from public.audit_logs where entity_table='phase14_operational_alerts' and entity_id=$1`, [auditAlertId])).rows[0].n;
  assert.equal(auditCountBefore, 0);
  await db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','audit check reason')`, [auditAlertId]);
  const auditRows = (await db.query(`select actor_type, actor_user_id, after_json from public.audit_logs where entity_table='phase14_operational_alerts' and entity_id=$1`, [auditAlertId])).rows;
  assert.equal(auditRows.length, 1, 'exactly one audit_logs row is written per successful transition');
  assert.equal(auditRows[0].actor_type, 'admin');
  assert.equal(auditRows[0].actor_user_id, platformAdmin.userId);
  assert.equal(auditRows[0].after_json.previous_status, 'open');
  assert.equal(auditRows[0].after_json.new_status, 'acknowledged');
  assert.equal(auditRows[0].after_json.reason, 'audit check reason');
  ok(true, 'the audit record captures actor, previous/new status, and reason');

  console.log('Scenario 13: secret or raw payload data is not exposed by the RPC return value');
  const detailAlertId = await insertAlert('scenario-13-alert', { detail_json: JSON.stringify({ access_token: 'super-secret-token', recipient_email: 'real@example.com' }) });
  const transitionReturn = (await db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','check return shape') as r`, [detailAlertId])).rows[0].r;
  assert.equal(Object.prototype.hasOwnProperty.call(transitionReturn, 'detail_json'), false, 'the RPC return value never includes detail_json');
  assert.equal(JSON.stringify(transitionReturn).includes('super-secret-token'), false, 'the RPC return value never contains the raw detail_json content, even indirectly');
  ok(true, 'the RPC return value exposes only safe lifecycle fields');

  console.log('Scenario 14: repeated identical transition does not duplicate audit effects -- rejected, not silently idempotent');
  const repeatAlertId = await insertAlert('scenario-14-alert');
  await db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','first call')`, [repeatAlertId]);
  await expectException(
    () => db.query(`select public.transition_phase14_operational_alert($1,'acknowledged','second identical call')`, [repeatAlertId]),
    'phase14_operational_alert_transition_invalid',
    'a second identical (already-acknowledged -> acknowledged) call is rejected, not treated as a silent no-op'
  );
  const repeatAuditCount = (await db.query(`select count(*)::int as n from public.audit_logs where entity_table='phase14_operational_alerts' and entity_id=$1`, [repeatAlertId])).rows[0].n;
  assert.equal(repeatAuditCount, 1, 'only one audit record exists after the rejected repeat call -- no duplicate audit effect');
  ok(true, 'by design, this RPC is not idempotent for same-state calls; the rejection itself is what prevents any duplicate audit effect');

  console.log('Scenario 15: a real alert created by Release C\'s own bounce/complaint path renders correctly through the real presentation mapper');
  // apply_email_provider_event_atomic requires the Phase14 security gate satisfied (it calls
  // phase14_require_security('webhook_mutation', ..., p_allow_service_role=true), which still
  // checks gate status even when the service_role short-circuit applies to the actor check) --
  // satisfied directly, matching release-c-runtime-secret-provisioning-tests.mjs's own pattern,
  // since the point under test here is the operational-alerts mapper, not the gate machinery.
  await db.query(
    `update public.phase14_security_gates
     set satisfied_version = required_version, status = 'satisfied',
         satisfied_by = $1, satisfied_at = now(), reason = 'isolated operational-alerts test', updated_at = now()
     where gate_key = 'phase14-premium-report'`,
    [platformAdmin.userId]
  );
  const orgId = (await db.query(`insert into public.organisations(legal_name) values ('Ops Alerts Test Org') returning id`)).rows[0].id;
  const methodology = (await db.query(`select id from public.methodology_versions order by created_at asc limit 1`)).rows[0];
  const product = (await db.query(`select id, price_cents, currency from public.products where product_code = 'essential_self_assessment'`)).rows[0];
  const assessmentId = (await db.query(
    `insert into public.assessments(assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
     values ('OPSD-ASMT-1', $1, $2, 'scored', now()) returning id`, [orgId, methodology.id]
  )).rows[0].id;
  const orderId = (await db.query(
    `insert into public.orders(order_reference, assessment_id, product_id, status, amount_cents, currency, customer_email, customer_name, organisation_name)
     values ('OPSD-ORDER-1', $1, $2, 'payment_received', $3, $4, 'customer@truth.local', 'OpsD Customer', 'Ops Alerts Test Org') returning id`,
    [assessmentId, product.id, product.price_cents, product.currency]
  )).rows[0].id;
  const emailEventId = (await db.query(
    `insert into public.email_events(order_id, assessment_id, recipient_email, status, provider, provider_message_id, notification_type)
     values ($1, $2, 'customer@truth.local', 'sent', 'resend', 'opsd-provider-message-1', 'report_ready') returning id`,
    [orderId, assessmentId]
  )).rows[0].id;
  await asClaims({ role: 'service_role', exp: 4102444800 });
  const payload = { type: 'email.bounced', created_at: new Date().toISOString() };
  const payloadFingerprint = crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  // phase14_require_security's service_role short-circuit for 'webhook_mutation' requires this
  // exact context marker (its authoritative definition, 0017 line ~4940) -- normally set by
  // ingest_phase14_provider_webhook itself right before it calls apply_email_provider_event_atomic;
  // set explicitly here since this test calls the atomic-apply function directly to isolate the
  // operational-alerts mapper from the webhook-signature-verification machinery already covered by
  // release-c-runtime-secret-provisioning-tests.mjs.
  await db.query(`select set_config('phase14.authoritative_transition', 'trusted_provider_attestation', false)`);
  await db.query(
    `select public.apply_email_provider_event_atomic($1,$2,$3,$4,$5,$6,$7::jsonb) as r`,
    ['resend', 'opsd-bounce-event-1', 'opsd-provider-message-1', 'email.bounced', new Date().toISOString(), payloadFingerprint, JSON.stringify(payload)]
  );
  const realAlertRow = (await db.query(
    `select * from public.phase14_operational_alerts where email_event_id = $1 and category = 'delivery_permanent_bounce'`,
    [emailEventId]
  )).rows[0];
  assert.ok(realAlertRow, 'apply_email_provider_event_atomic (Release C\'s real bounce-handling path) created a real phase14_operational_alerts row, not a fixture');
  const realPresentation = getOperationalAlertPresentation(realAlertRow.category);
  ok(realPresentation.summary.length > 0, 'the real page mapper produces a non-empty summary for the real alert\'s category');
  const realSafeDetails = extractSafeAlertDetails(realAlertRow.category, realAlertRow.detail_json);
  assert.equal(JSON.stringify(realSafeDetails).includes('customer@truth.local'), false, 'the real mapper never surfaces the real alert\'s recipient_email, even though it is present in the row\'s own order/email-event context');
  ok(true, 'a genuinely-emitted Release C alert is correctly read and safely presented by the real (not reimplemented) mapper functions');

  console.log('Scenario 16 (static, already covered in Part 1): the page performs no write on initial render -- see Part 1 assertions above.');
  console.log('Scenario 17 (pure-function, already covered in Part 2): cloud capability absence disables mutation cleanly -- see specHasOperationalAlertLifecycleCapability checks above.');
  console.log('Scenario 18: run separately -- see this file\'s header comment for the exact npm scripts.');

  console.log('\nAll Release D operational-alerts checks passed.');
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

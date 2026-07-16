// Phase 14 -- M2/M3: the real, authoritative AI attempt budget enforcement lives in
// public.claim_phase14_ai_attempt (migration 0027 fixes a cross-kind gap in it -- see that
// migration's header comment). This suite drives the real function directly against real Postgres
// with real migrations 0001-0027 applied verbatim, proving the exact "unusual histories" the task
// spec calls for: no prior attempt; one prior attempt of a different kind; budget exhausted across
// kinds; and a genuine concurrent race for the same next attempt.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
let EmbeddedPostgres, pg;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  pg = await import('pg');
} catch {
  console.log('SKIPPED: embedded-postgres/pg not installed.');
  process.exit(0);
}

const PORT = 55932 + ((process.pid + 131) % 400);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-ai-attempt-budget-pg-'));
const pgInstance = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port: PORT, persistent: false });
let passed = 0;
const clients = [];
function newClient() {
  const client = new pg.default.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'testpass', database: 'testdb' });
  clients.push(client);
  return client;
}
async function asAdmin(client, userId, sessionId) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal2', session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })
  ]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
}
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { console.error(`  FAIL - ${name}`); console.error(`    ${error.stack ?? error.message}`); throw error; }
}

console.log('Booting disposable local Postgres for M2/M3 AI attempt budget replay...');
await pgInstance.initialise();
await pgInstance.start();
await pgInstance.createDatabase('testdb');
const admin = newClient();
await admin.connect();
try {
  await admin.query(`
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
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin superuser login; end if;
    end
    $$;
    grant anon, authenticated, service_role to postgres;
    alter database testdb set search_path = public, extensions;
  `);
  await admin.end();

  const migrator = newClient();
  await migrator.connect();
  const migrationsDir = path.join(root, 'supabase/migrations');
  const files = [
    '0001_phase2_v1_1_schema_rls', '0002_phase4_dev_seed', '0003_phase5_methodology_seed',
    '0004_phase4_v1_2_rate_limiting', '0005_phase5_v1_1_guards', '0006_phase6_scoring_guards',
    '0007_phase6_v1_1_atomic_scoring', '0009_methodology_copy_polish', '0010_phase9_manual_eft_order_flow',
    '0011_phase10_pdf_report_engine_additions', '0012_phase13_commercial_event_foundation',
    '0013_phase13_event_index_cleanup', '0014_phase13_customer_commercial_conversion',
    '0015_phase13_data_request_policy_cleanup', '0016_platform_database_hardening',
    '0017_phase14_canonical_disabled_foundation', '0023_phase1_manual_fulfilment_recovery',
    '0024_phase14_workflow_start_admin_recovery', '0025_phase14_delivery_ambiguity_admin_resolution',
    '0026_phase14_attestation_canonicalisation_hardening', '0027_phase14_ai_attempt_cross_kind_budget'
  ];
  for (const f of files) await migrator.query(fs.readFileSync(path.join(migrationsDir, `${f}.sql`), 'utf8'));
  console.log('All migrations applied.');

  const orgId = (await migrator.query(`insert into public.organisations(legal_name) values ('Acme Test Org') returning id`)).rows[0].id;
  const methodology = (await migrator.query(`select id from public.methodology_versions order by created_at asc limit 1`)).rows[0];
  const assessmentId = (await migrator.query(
    `insert into public.assessments(assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
     values ('TEST-M2M3-ASMT', $1, $2, 'scored', now()) returning id`, [orgId, methodology.id]
  )).rows[0].id;
  const scoreRunId = (await migrator.query(
    `insert into public.score_runs(assessment_id, methodology_version_id, run_number, run_type, status)
     values ($1, $2, 1, 'initial', 'draft') returning id`, [assessmentId, methodology.id]
  )).rows[0].id;

  async function makeFulfilment(reference) {
    const orderId = (await migrator.query(
      `insert into public.orders(order_reference, assessment_id, product_id, status, amount_cents, currency, customer_email)
       select $1, $2, id, 'payment_received', price_cents, currency, 'customer@test.local'
       from public.products where product_code='essential_self_assessment' returning id`,
      [reference, assessmentId]
    )).rows[0].id;
    return (await migrator.query(
      `insert into public.report_fulfilments(order_id, assessment_id, score_run_id, idempotency_key, trigger_source, status)
       values ($1, $2, $3, $4, 'admin_generate', 'generating') returning id`,
      [orderId, assessmentId, scoreRunId, `test-m2m3-${reference}`]
    )).rows[0].id;
  }

  async function makeAdminUser(email, role) {
    const userId = (await migrator.query(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
    await migrator.query(`insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, $2, $3, 'active', true)`, [userId, email, role]);
    const sessionId = (await migrator.query(`insert into auth.sessions(user_id, not_after) values ($1, now() + interval '1 day') returning id`, [userId])).rows[0].id;
    return { userId, sessionId };
  }
  const { userId: adminUserId, sessionId: adminSessionId } = await makeAdminUser('admin@test.local', 'platform_admin');

  const adminSession = newClient();
  await adminSession.connect();
  await asAdmin(adminSession, adminUserId, adminSessionId);
  await adminSession.query(`select public.set_phase14_security_gate_version(1, 'M2/M3 test setup')`);
  await adminSession.query(`select public.set_phase14_feature_policy('ai_narrative', true, 'M2/M3 test setup')`);
  await adminSession.query(`select public.set_phase14_feature_policy('automatic_fulfilment', true, 'M2/M3 test setup')`);
  await adminSession.query(`select public.set_phase14_ai_route_policy('openai', true)`);

  const serviceRoleSession = newClient();
  await serviceRoleSession.connect();
  await serviceRoleSession.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'service_role' })]);

  // claim_phase14_ai_attempt calls phase14_activate_worker_operation, which (confirmed by reading
  // its body) hard-requires a service_role JWT -- not just an authenticated admin -- and a real
  // 'leased' capability row bound to the exact order/assessment/score_run/fulfilment and matching
  // the currently-satisfied security gate version. Rather than reconstruct the full
  // authorize->claim worker-lease lifecycle (a separate, already-covered concern -- see the H2
  // workflow-start suite's documented scope boundary), this seeds a capability row directly with
  // every field phase14_activate_worker_operation actually reads, so this suite can stay focused
  // on the attempt-budget arithmetic itself.
  async function makeCapability(fulfilmentId) {
    const orderRow = (await migrator.query(
      `select f.order_id, f.assessment_id, f.score_run_id from public.report_fulfilments f where f.id=$1`, [fulfilmentId]
    )).rows[0];
    return (await migrator.query(
      `insert into public.phase14_worker_capabilities(
         capability_type, policy_key, operation_key, order_id, assessment_id, score_run_id, fulfilment_id,
         issue_secret_hash, security_gate_version, authorised_by, reason,
         status, expires_at, lease_secret_hash, lease_owner, lease_expires_at, claimed_at
       ) values (
         'automatic_generation', 'automatic_fulfilment', $1, $2, $3, $4, $5,
         repeat('a',64), 1, $6, 'M2/M3 test capability',
         'leased', now() + interval '1 hour', repeat('b',64), $7, now() + interval '1 hour', now()
       ) returning id`,
      [`test-m2m3-op-${fulfilmentId}-${crypto.randomUUID()}`, orderRow.order_id, orderRow.assessment_id, orderRow.score_run_id, fulfilmentId, adminUserId, `test-worker-${crypto.randomUUID()}`]
    )).rows[0].id;
  }

  function attemptPayload(overrides = {}) {
    return {
      // The budget fingerprint (generation_identity + evidence_checksum + provider + model +
      // prompt/schema version) deliberately does NOT include fulfilment_id, so a shared constant
      // identity across test scenarios would let one scenario's attempts count toward another's
      // budget. Each scenario gets its own identity, scoped to its own fulfilmentId, so scenarios
      // stay independent of one another.
      generation_identity: overrides.generationIdentity ?? `gen-identity-${overrides.fulfilmentId}`,
      fulfilment_id: overrides.fulfilmentId,
      attempt_kind: overrides.kind ?? 'generate', provider_request_key: overrides.key ?? `req-${Math.random()}`,
      requested_provider: 'openai', requested_model: 'gpt-test', evidence_checksum: 'a'.repeat(64),
      prompt_version: 'v1', schema_version: 'v1', input_size_bytes: 100, estimated_input_tokens: 25,
      max_output_tokens: 3500, max_estimated_cost_micros: 100000, timeout_ms: 45000
    };
  }

  console.log('Fixtures ready. Running M2/M3 scenarios...');

  await test('no prior attempt: a first generate attempt is claimed successfully', async () => {
    const fulfilmentId = await makeFulfilment('no-prior');
    const capabilityId = await makeCapability(fulfilmentId);
    const row = (await serviceRoleSession.query(
      `select public.claim_phase14_ai_attempt($1, $2) as res`,
      [capabilityId, JSON.stringify(attemptPayload({ fulfilmentId, kind: 'generate' }))]
    )).rows[0].res;
    assert.equal(row.attempt_number, 1);
    assert.equal(row.attempt_kind, 'generate');
  });

  await test('one prior generate attempt: a repair attempt is allowed (combined total = 2)', async () => {
    const fulfilmentId = await makeFulfilment('one-prior-generate');
    const capabilityId1 = await makeCapability(fulfilmentId);
    await serviceRoleSession.query(
      `select public.claim_phase14_ai_attempt($1, $2)`,
      [capabilityId1, JSON.stringify(attemptPayload({ fulfilmentId, kind: 'generate', key: 'k1' }))]
    );
    const capabilityId2 = await makeCapability(fulfilmentId);
    const row = (await serviceRoleSession.query(
      `select public.claim_phase14_ai_attempt($1, $2) as res`,
      [capabilityId2, JSON.stringify(attemptPayload({ fulfilmentId, kind: 'repair', key: 'k2' }))]
    )).rows[0].res;
    assert.equal(row.attempt_number, 1, 'repair is its own kind, so its own attempt_number sequence starts at 1');
    assert.equal(row.attempt_kind, 'repair');
  });

  await test('budget exhausted across kinds: after one generate + one repair, a further attempt of either kind is blocked', async () => {
    const fulfilmentId = await makeFulfilment('budget-exhausted');
    const cap1 = await makeCapability(fulfilmentId);
    await serviceRoleSession.query(`select public.claim_phase14_ai_attempt($1, $2)`,
      [cap1, JSON.stringify(attemptPayload({ fulfilmentId, kind: 'generate', key: 'e1' }))]);
    const cap2 = await makeCapability(fulfilmentId);
    await serviceRoleSession.query(`select public.claim_phase14_ai_attempt($1, $2)`,
      [cap2, JSON.stringify(attemptPayload({ fulfilmentId, kind: 'repair', key: 'e2' }))]);
    const cap3 = await makeCapability(fulfilmentId);
    // A third attempt of a DIFFERENT kind ('generate' again) previously would have been allowed
    // by the old per-kind-only check (its own generate-only count would show only 1 prior). This
    // is exactly the gap migration 0027 closes.
    await assert.rejects(
      serviceRoleSession.query(`select public.claim_phase14_ai_attempt($1, $2)`,
        [cap3, JSON.stringify(attemptPayload({ fulfilmentId, kind: 'generate', key: 'e3' }))]),
      /phase14_ai_attempt_limit_reached/
    );
  });

  await test('a genuine concurrent race for the same next attempt is serialised safely, not double-counted', async () => {
    const fulfilmentId = await makeFulfilment('concurrent-race');
    const capA = await makeCapability(fulfilmentId);
    const capB = await makeCapability(fulfilmentId);
    const clientA = newClient(); await clientA.connect();
    await clientA.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'service_role' })]);
    const clientB = newClient(); await clientB.connect();
    await clientB.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'service_role' })]);
    const payloadA = attemptPayload({ fulfilmentId, kind: 'generate', key: 'race-a' });
    const payloadB = attemptPayload({ fulfilmentId, kind: 'generate', key: 'race-b' });
    const [resultA, resultB] = await Promise.allSettled([
      clientA.query(`select public.claim_phase14_ai_attempt($1, $2) as res`, [capA, JSON.stringify(payloadA)]),
      clientB.query(`select public.claim_phase14_ai_attempt($1, $2) as res`, [capB, JSON.stringify(payloadB)])
    ]);
    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
    const failed = outcomes.filter((o) => o.status === 'rejected');
    // Either both succeed with DIFFERENT attempt_numbers (Postgres serialised them one after the
    // other), or one succeeds and one fails on the unique constraint -- what must never happen is
    // both succeeding with the SAME attempt_number, which would mean two real provider calls were
    // permitted to share one budget slot.
    if (succeeded.length === 2) {
      const numbers = succeeded.map((o) => o.value.rows[0].res.attempt_number).sort();
      assert.deepEqual(numbers, [1, 2], 'two concurrent claims that both succeed must land on distinct attempt numbers');
    } else {
      assert.equal(succeeded.length, 1);
      assert.equal(failed.length, 1);
      assert.match(String(failed[0].reason), /report_ai_attempts_identity_attempt_unique|duplicate key/);
    }
    const rows = (await migrator.query(
      `select attempt_number from public.report_ai_attempts where generation_identity=$1 and fulfilment_id=$2`,
      [`gen-identity-${fulfilmentId}`, fulfilmentId]
    )).rows;
    assert.equal(new Set(rows.map((r) => r.attempt_number)).size, rows.length, 'no two persisted attempts for this fulfilment may share an attempt_number');
  });

  console.log(`\nPhase 14 M2/M3 AI attempt budget suite passed (${passed} cases).`);
} finally {
  for (const c of clients) { try { await c.end(); } catch { /* already closed */ } }
  await pgInstance.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// Phase 14 -- H2: workflow-start concurrency-safety and admin-recovery behavioural test.
//
// This is not a mock or a reimplementation. It boots a real, disposable local Postgres, applies
// the repo's actual migration files (0001 through 0017, 0023, 0024, 0025, 0026) verbatim and in order, seeds
// a real order/assessment/score-run/fulfilment through the real entitlement checks, and then
// drives the real SQL functions (authorize_phase14_worker_operation,
// phase14_private.claim_workflow_start, phase14_private.mark_workflow_start_uncertain,
// phase14_private.settle_workflow_start, and the new
// admin_resolve_premium_report_workflow_start_reconciliation) exactly as the application uses
// them, to prove the exact scenario specified for H2:
//
//   1. A workflow start is claimed and successfully completes (run id recorded, no reconciliation).
//   2. A second workflow start is claimed, and the application loses the response after the
//      external call is made ambiguous (outbox marked 'acceptance_uncertain') but before a run id
//      is persisted.
//   3. A retry is attempted: (a) authorizing a brand-new capability for the same operation key is
//      refused outright, and (b) re-claiming workflow-start on the SAME capability sees the
//      outbox's uncertain state and is refused a fresh claim. Neither path can start a second
//      workflow run.
//   4. The stuck outbox row is visible through the admin-facing read functions/RLS policy --
//      "the order enters a visible reconciliation state".
//   5. An authorised admin (platform_admin, real session-shaped JWT claims, AAL2) resolves it via
//      admin_resolve_premium_report_workflow_start_reconciliation -- both the "confirmed it did
//      start" and "confirmed it did not start" resolutions are proven, plus that a non-admin role
//      is refused and that a non-stuck outbox row cannot be "resolved" a second time.
//
// The one deliberate scope boundary: steps that would normally flow through
// public.execute_phase14_worker_step (the HMAC-worker-attested dispatcher) are invoked here by
// calling the same underlying phase14_private functions directly, replicating exactly the
// capability-state transitions execute_phase14_worker_step performs for the
// 'claim_phase14_worker_operation' / 'claim_premium_report_workflow_start' /
// 'mark_phase14_workflow_start_dispatching' steps (verified by direct source reading against
// supabase/migrations/0017_phase14_canonical_disabled_foundation.sql lines ~8035-8090). The HMAC
// attestation/signature verification itself is a separate, generic mechanism shared by every
// worker action (not unique to workflow-start) and is out of scope for this test.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = process.cwd();

let EmbeddedPostgres;
let pg;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  pg = await import('pg');
} catch {
  console.log('SKIPPED: embedded-postgres/pg not installed (npm install required for this test). See package.json devDependencies.');
  process.exit(0);
}

const PORT = 55532 + (process.pid % 400);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-workflow-start-pg-'));
const pgInstance = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'testpass',
  port: PORT,
  persistent: false
});

let passed = 0;
const clients = [];
function newClient(overrides = {}) {
  const client = new pg.default.Client({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'testpass', database: 'testdb', ...overrides
  });
  clients.push(client);
  return client;
}
async function q(client, sql, params) {
  return client.connect ? client.query(sql, params) : null;
}
async function asAdmin(client, userId, sessionId) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({
      sub: userId, role: 'authenticated', aal: 'aal2', session_id: sessionId,
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
}
async function asServiceRole(client) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'service_role' })]);
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.message}`);
    throw error;
  }
}

console.log('Booting disposable local Postgres for H2 workflow-start replay...');
await pgInstance.initialise();
await pgInstance.start();
await pgInstance.createDatabase('testdb');

const admin = newClient(); // bootstrap connection, used as superuser 'postgres' throughout for seeding
await admin.connect();

try {
  // ---- Platform shims: only the hosting infrastructure Supabase provides that a bare Postgres
  // does not (auth/vault/storage schemas, extensions, anon/authenticated/service_role roles).
  // None of this is application logic -- every table/function under test comes from the real
  // migration files applied immediately afterwards. ----
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
    create table if not exists auth.sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      not_after timestamptz
    );
    create schema if not exists vault;
    create table if not exists vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text not null, owner uuid, owner_id text, public boolean default false,
      avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[],
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
    );
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

  // Reconnect so the new search_path takes effect for the seeding/migration connection.
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
    '0017_phase14_canonical_disabled_foundation', '0023_phase1_manual_fulfilment_recovery', '0024_phase23_payment_automation', '0025_phase23_assessment_resume',
    '0026_phase14_workflow_start_admin_recovery', '0031_phase14_delivery_event_recency_precision_fix'
  ];
  console.log(`Applying ${files.length} real migration files verbatim...`);
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, `${f}.sql`), 'utf8');
    try {
      await migrator.query(sql);
    } catch (error) {
      console.error(`Migration failed: ${f}`);
      throw error;
    }
  }
  console.log('All migrations applied.');

  // ---- Fixture: a real order that satisfies phase14_generation_entitlement() end to end,
  // reusing the actual methodology/domain/question data seeded by migration 0003. ----
  const orgId = (await migrator.query(
    `insert into public.organisations(legal_name) values ('Acme Test Org') returning id`
  )).rows[0].id;
  const methodology = (await migrator.query(
    `select id from public.methodology_versions order by created_at asc limit 1`
  )).rows[0];
  assert.ok(methodology, 'expected migration 0003 to seed at least one methodology version');
  const assessmentId = (await migrator.query(
    `insert into public.assessments(assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
     values ('TEST-ASMT-0001', $1, $2, 'scored', now()) returning id`,
    [orgId, methodology.id]
  )).rows[0].id;
  // Score traces/domain results cannot be written once the parent run is 'completed' (a guard
  // trigger enforces this), so the run is created 'draft' first, populated, and completed last.
  const scoreRunId = (await migrator.query(
    `insert into public.score_runs(assessment_id, methodology_version_id, run_number, run_type, status)
     values ($1, $2, 1, 'initial', 'draft') returning id`,
    [assessmentId, methodology.id]
  )).rows[0].id;

  const domains = (await migrator.query(
    `select id from public.domains where methodology_version_id = $1`, [methodology.id]
  )).rows;
  assert.ok(domains.length > 0, 'expected seeded domains');
  for (const d of domains) {
    await migrator.query(
      `insert into public.score_domain_results(score_run_id, domain_id, raw_score, weighted_contribution, coverage_pct, critical_gap_count)
       values ($1, $2, 3, 1, 100, 0)`, [scoreRunId, d.id]
    );
  }
  const questions = (await migrator.query(
    `select id from public.questions where methodology_version_id = $1 and active`, [methodology.id]
  )).rows;
  assert.ok(questions.length > 0, 'expected seeded active questions');
  for (const qrow of questions) {
    await migrator.query(
      `insert into public.score_question_traces(score_run_id, question_id, response_value, normalised_score,
         question_weight, applicable, numerator_contribution, denominator_contribution)
       values ($1, $2, 3, 3, 1, true, 3, 5)`, [scoreRunId, qrow.id]
    );
  }
  await migrator.query(
    `update public.score_runs
     set status='completed', overall_score=75, calculated_maturity='Structured', final_maturity='Structured',
         exposure_score=10, exposure_band='Low', coverage_pct=100, input_hash=repeat('a',64), locked_at=now()
     where id=$1`, [scoreRunId]
  );
  await migrator.query(`update public.assessments set current_score_run_id = $1 where id = $2`, [scoreRunId, assessmentId]);

  const product = (await migrator.query(
    `select id, price_cents, currency from public.products where product_code = 'essential_self_assessment'`
  )).rows[0];
  assert.ok(product, 'expected migration 0001 to seed the essential_self_assessment product');

  async function makeAdminUser(email, role) {
    const userId = (await migrator.query(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
    await migrator.query(
      `insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, $2, $3, 'active', true)`,
      [userId, email, role]
    );
    const sessionId = (await migrator.query(
      `insert into auth.sessions(user_id, not_after) values ($1, now() + interval '1 day') returning id`, [userId]
    )).rows[0].id;
    return { userId, sessionId };
  }
  const { userId: adminUserId, sessionId: adminSessionId } = await makeAdminUser('admin@test.local', 'platform_admin');
  const { userId: reviewerUserId, sessionId: reviewerSessionId } = await makeAdminUser('reviewer@test.local', 'reviewer');
  const { userId: readOnlyUserId, sessionId: readOnlySessionId } = await makeAdminUser('readonly@test.local', 'read_only_admin');

  async function makeOrder(reference) {
    const orderId = (await migrator.query(
      `insert into public.orders(order_reference, assessment_id, product_id, status, amount_cents, currency, verified_by, verified_at)
       values ($1, $2, $3, 'payment_received', $4, $5, $6, now()) returning id`,
      [reference, assessmentId, product.id, product.price_cents, product.currency, adminUserId]
    )).rows[0].id;
    return orderId;
  }
  async function makeFulfilment(orderId, idemKey) {
    return (await migrator.query(
      `insert into public.report_fulfilments(order_id, assessment_id, score_run_id, idempotency_key, trigger_source, status)
       values ($1, $2, $3, $4, 'payment_confirmation', 'queued') returning id`,
      [orderId, assessmentId, scoreRunId, idemKey]
    )).rows[0].id;
  }

  // ---- Enable the gate + automatic_fulfilment policy as a real platform_admin session, exactly
  // as an operator would before the autonomous engine's later launch stage. ----
  const adminSession = newClient();
  await adminSession.connect();
  await asAdmin(adminSession, adminUserId, adminSessionId);
  await adminSession.query(`select public.set_phase14_security_gate_version(1, 'H2 behavioural test setup')`);
  await adminSession.query(`select public.set_phase14_feature_policy('automatic_fulfilment', true, 'H2 behavioural test setup')`);

  console.log('Fixtures ready. Running H2 scenario...');

  // =====================================================================================
  // Scenario 1: a workflow start claimed and completed cleanly has no reconciliation debt.
  // =====================================================================================
  let happyOrderId, happyFulfilmentId, happyCapabilityId;
  await test('a clean workflow start records the run id and leaves no reconciliation debt', async () => {
    happyOrderId = await makeOrder('TEST-ORDER-HAPPY');
    happyFulfilmentId = await makeFulfilment(happyOrderId, 'idem-happy-1');
    const authRes = await adminSession.query(
      `select public.authorize_phase14_worker_operation('automatic_generation', $1, $2, $3, $4, $5, null, null, 3600, 'test') as res`,
      ['op-happy-1', happyOrderId, assessmentId, scoreRunId, happyFulfilmentId]
    );
    happyCapabilityId = authRes.rows[0].res.capability_id;

    // Simulate execute_phase14_worker_step's 'claim_phase14_worker_operation' case: lease the
    // capability and set expected_step='workflow_start_claim' (capability_type=automatic_generation).
    await migrator.query(
      `update public.phase14_worker_capabilities set status='leased', workflow_execution_id='exec-happy',
         lease_owner='exec-happy', lease_expires_at=now()+interval '10 minutes', expected_step='workflow_start_claim'
       where id=$1`, [happyCapabilityId]
    );
    const claim = (await migrator.query(
      `select phase14_private.claim_workflow_start($1,$2,'exec-happy') as res`, [happyCapabilityId, happyFulfilmentId]
    )).rows[0].res;
    assert.equal(claim.claimed, true);
    const outboxId = claim.outbox_id;

    await migrator.query(`select phase14_private.mark_workflow_start_uncertain($1,$2)`, [happyCapabilityId, outboxId]);
    const settled = (await migrator.query(
      `select phase14_private.settle_workflow_start($1,$2,'run-happy-123',null) as res`, [happyCapabilityId, outboxId]
    )).rows[0].res;
    assert.equal(settled.status, 'started');
    assert.equal(settled.run_id, 'run-happy-123');

    const fulfilment = (await migrator.query(
      `select workflow_start_status, workflow_run_id from public.report_fulfilments where id=$1`, [happyFulfilmentId]
    )).rows[0];
    assert.equal(fulfilment.workflow_start_status, 'started');
    assert.equal(fulfilment.workflow_run_id, 'run-happy-123');
  });

  // =====================================================================================
  // Scenario 2-5: lost response -> retry cannot double-start -> visible -> admin recovers.
  // =====================================================================================
  let stuckOrderId, stuckFulfilmentId, stuckCapabilityId, stuckOutboxId;
  const stuckOperationKey = 'op-stuck-1';
  await test('workflow start reaches acceptance_uncertain (simulated lost response before run id persistence)', async () => {
    stuckOrderId = await makeOrder('TEST-ORDER-STUCK');
    stuckFulfilmentId = await makeFulfilment(stuckOrderId, 'idem-stuck-1');
    const authRes = await adminSession.query(
      `select public.authorize_phase14_worker_operation('automatic_generation', $1, $2, $3, $4, $5, null, null, 3600, 'test') as res`,
      [stuckOperationKey, stuckOrderId, assessmentId, scoreRunId, stuckFulfilmentId]
    );
    stuckCapabilityId = authRes.rows[0].res.capability_id;
    await migrator.query(
      `update public.phase14_worker_capabilities set status='leased', workflow_execution_id='exec-stuck',
         lease_owner='exec-stuck', lease_expires_at=now()+interval '10 minutes', expected_step='workflow_start_claim'
       where id=$1`, [stuckCapabilityId]
    );
    const claim = (await migrator.query(
      `select phase14_private.claim_workflow_start($1,$2,'exec-stuck') as res`, [stuckCapabilityId, stuckFulfilmentId]
    )).rows[0].res;
    assert.equal(claim.claimed, true);
    stuckOutboxId = claim.outbox_id;

    // The application is about to make the ambiguous external start() call.
    const uncertain = (await migrator.query(
      `select phase14_private.mark_workflow_start_uncertain($1,$2) as res`, [stuckCapabilityId, stuckOutboxId]
    )).rows[0].res;
    assert.equal(uncertain.status, 'acceptance_uncertain');
    // ... and then the HTTP response is lost. settle_workflow_start is never called.

    const outboxRow = (await migrator.query(
      `select status, reconciliation_status from public.phase14_workflow_start_outbox where id=$1`, [stuckOutboxId]
    )).rows[0];
    assert.equal(outboxRow.status, 'acceptance_uncertain');

    // Note: report_fulfilments.workflow_start_status is untouched by claim_workflow_start/
    // mark_workflow_start_uncertain -- only settle_workflow_start ever writes it, so it stays
    // 'not_started' for the whole uncertain window. The phase14_workflow_start_outbox row (just
    // asserted above) is the actual source of truth for "is a start currently ambiguous" -- the
    // important guarantee is simply that the fulfilment-level status never claims 'started' or
    // records a run id while acceptance is genuinely uncertain.
    const fulfilment = (await migrator.query(
      `select workflow_start_status, workflow_run_id from public.report_fulfilments where id=$1`, [stuckFulfilmentId]
    )).rows[0];
    assert.notEqual(fulfilment.workflow_start_status, 'started', 'the fulfilment must not claim started while acceptance is genuinely uncertain');
    assert.equal(fulfilment.workflow_run_id, null, 'no run id may be persisted while acceptance is uncertain');
  });

  await test('retry cannot start a second workflow run: a fresh capability authorization is refused', async () => {
    await assert.rejects(
      adminSession.query(
        `select public.authorize_phase14_worker_operation('automatic_generation', $1, $2, $3, $4, $5, null, null, 3600, 'retry') as res`,
        [stuckOperationKey, stuckOrderId, assessmentId, scoreRunId, stuckFulfilmentId]
      ),
      /phase14_worker_capability_already_active/
    );
  });

  await test('retry cannot start a second workflow run: re-claiming on the same capability sees the uncertain outbox and is refused', async () => {
    const reclaim = (await migrator.query(
      `select phase14_private.claim_workflow_start($1,$2,'exec-stuck') as res`, [stuckCapabilityId, stuckFulfilmentId]
    )).rows[0].res;
    assert.equal(reclaim.claimed, false);
    assert.equal(reclaim.status, 'acceptance_uncertain');
    assert.equal(reclaim.reconciliation_required, true);
  });

  await test('the order enters a visible reconciliation state (admin-facing listing + RLS-gated direct read)', async () => {
    const list = (await adminSession.query(
      `select public.admin_list_premium_report_workflow_start_reconciliations() as rows`
    )).rows[0].rows;
    assert.ok(list.some((r) => r.outbox_id === stuckOutboxId), 'the stuck outbox row must appear in the admin listing');
    const entry = list.find((r) => r.outbox_id === stuckOutboxId);
    assert.equal(entry.fulfilment_id, stuckFulfilmentId);
    assert.equal(entry.order_id, stuckOrderId);
    assert.equal(entry.status, 'acceptance_uncertain');

    // Direct RLS-gated table read, as a distinct authenticated admin session (reviewer role,
    // which the table's own admin-select policy permits).
    const reviewerSession = newClient();
    await reviewerSession.connect();
    await asAdmin(reviewerSession, reviewerUserId, reviewerSessionId);
    const direct = await reviewerSession.query(
      `select status from public.phase14_workflow_start_outbox where id = $1`, [stuckOutboxId]
    );
    assert.equal(direct.rows[0].status, 'acceptance_uncertain');
  });

  await test('a non-admin-authorised role cannot resolve the reconciliation', async () => {
    const readOnlySession = newClient();
    await readOnlySession.connect();
    await asAdmin(readOnlySession, readOnlyUserId, readOnlySessionId);
    await assert.rejects(
      readOnlySession.query(
        `select public.admin_resolve_premium_report_workflow_start_reconciliation($1,'confirmed_not_started',null,'test') as res`,
        [stuckOutboxId]
      ),
      /phase14_role_forbidden/
    );
  });

  await test('an authorised admin resolves the stuck outbox as "confirmed not started" and the order becomes eligible for a clean retry', async () => {
    const resolved = (await adminSession.query(
      `select public.admin_resolve_premium_report_workflow_start_reconciliation($1,'confirmed_not_started',null,$2) as res`,
      [stuckOutboxId, 'Verified via workflow platform dashboard: no run exists for this operation key.']
    )).rows[0].res;
    assert.equal(resolved.status, 'cancelled');

    const fulfilment = (await migrator.query(
      `select workflow_start_status, status, workflow_start_error from public.report_fulfilments where id=$1`, [stuckFulfilmentId]
    )).rows[0];
    assert.equal(fulfilment.workflow_start_status, 'failed');
    assert.equal(fulfilment.status, 'failed');
    assert.match(fulfilment.workflow_start_error, /Admin confirmed the external workflow did not start/);

    const cap = (await migrator.query(`select status from public.phase14_worker_capabilities where id=$1`, [stuckCapabilityId])).rows[0];
    assert.equal(cap.status, 'expired');

    // Resolving twice must fail -- it is no longer awaiting reconciliation.
    await assert.rejects(
      adminSession.query(
        `select public.admin_resolve_premium_report_workflow_start_reconciliation($1,'confirmed_not_started',null,'again') as res`,
        [stuckOutboxId]
      ),
      /phase14_workflow_start_not_awaiting_reconciliation/
    );
  });

  await test('a legitimate admin_retry fulfilment can now be authorised cleanly for the same order', async () => {
    const retryFulfilmentId = await makeFulfilment(stuckOrderId, 'idem-stuck-retry-1');
    const authRes = await adminSession.query(
      `select public.authorize_phase14_worker_operation('automatic_generation', $1, $2, $3, $4, $5, null, null, 3600, 'clean retry') as res`,
      ['op-stuck-1-retry', stuckOrderId, assessmentId, scoreRunId, retryFulfilmentId]
    );
    assert.ok(authRes.rows[0].res.capability_id);
  });

  // =====================================================================================
  // Scenario 6: the "confirmed it DID start" resolution path.
  // =====================================================================================
  await test('an authorised admin resolves a stuck outbox as "confirmed started" when external evidence shows the run exists', async () => {
    const orderId = await makeOrder('TEST-ORDER-CONFIRMED-STARTED');
    const fulfilmentId = await makeFulfilment(orderId, 'idem-confirmed-started-1');
    const authRes = await adminSession.query(
      `select public.authorize_phase14_worker_operation('automatic_generation', $1, $2, $3, $4, $5, null, null, 3600, 'test') as res`,
      ['op-confirmed-started-1', orderId, assessmentId, scoreRunId, fulfilmentId]
    );
    const capabilityId = authRes.rows[0].res.capability_id;
    await migrator.query(
      `update public.phase14_worker_capabilities set status='leased', workflow_execution_id='exec-cs',
         lease_owner='exec-cs', lease_expires_at=now()+interval '10 minutes', expected_step='workflow_start_claim'
       where id=$1`, [capabilityId]
    );
    const claim = (await migrator.query(
      `select phase14_private.claim_workflow_start($1,$2,'exec-cs') as res`, [capabilityId, fulfilmentId]
    )).rows[0].res;
    const outboxId = claim.outbox_id;
    await migrator.query(`select phase14_private.mark_workflow_start_uncertain($1,$2)`, [capabilityId, outboxId]);

    const resolved = (await adminSession.query(
      `select public.admin_resolve_premium_report_workflow_start_reconciliation($1,'confirmed_started',$2,$3) as res`,
      [outboxId, 'run-recovered-999', 'Verified via workflow platform dashboard: run run-recovered-999 exists and is executing.']
    )).rows[0].res;
    assert.equal(resolved.status, 'started');
    assert.equal(resolved.run_id, 'run-recovered-999');

    const fulfilment = (await migrator.query(
      `select workflow_start_status, workflow_run_id from public.report_fulfilments where id=$1`, [fulfilmentId]
    )).rows[0];
    assert.equal(fulfilment.workflow_start_status, 'started');
    assert.equal(fulfilment.workflow_run_id, 'run-recovered-999');
  });

  console.log(`\nPhase 14 workflow-start reconciliation suite passed (${passed} cases).`);
} finally {
  for (const c of clients) {
    try { await c.end(); } catch { /* already closed */ }
  }
  await pgInstance.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

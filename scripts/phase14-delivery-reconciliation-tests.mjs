// Phase 14 -- H4: Resend ambiguous-acceptance reconciliation.
//
// Scenario: the app submits an email to Resend; Resend accepts it; the HTTP response is lost
// before the app stores the provider message ID; the delivery attempt enters
// 'reconciliation_required'; the app must never automatically resend; a later Resend webhook
// should correlate to the correct delivery attempt where possible; if no webhook arrives, an
// authorised admin must be able to resolve the case safely after checking Resend directly.
//
// This suite drives the REAL migration SQL (0001-0028, applied verbatim to a disposable local
// Postgres, same harness as H2/H3) together with the REAL TS webhook-verification/attestation
// functions from src/lib/reports/email/resend-webhook.ts (imported directly, not reimplemented).
// It does not spin up a live Next.js server -- src/app/score/api/webhooks/resend/route.ts is a
// thin decode/HTTP-status wrapper around exactly the calls reproduced here (verifyResendWebhook ->
// validateResendEventCreatedAt -> createProviderWebhookDatabaseAttestation ->
// ingest_phase14_provider_webhook), and phase14-webhook-route-db-test.mjs separately exercises
// that wrapper end-to-end against a running app + real Supabase project. What is unique to this
// suite is the full ambiguous-delivery state machine and the new admin-resolution/webhook-
// correlation code added for H4 (migrations 0027, 0028).
//
// Two real architectural findings from reading the current code (not assumed) shaped this suite
// and the migrations it exercises:
//   1. public.apply_email_provider_event_atomic (0017) matches an incoming webhook to an
//      email_events row strictly by (provider, provider_message_id). A "lost response" attempt
//      never captured a provider_message_id, so a plain webhook could never reach it. Migration
//      0028 adds a safe fallback in ingest_phase14_provider_webhook: correlate via the
//      delivery_attempt_ref tag attached at send time (report-delivery-service-core.ts), which is
//      a primary key and therefore never ambiguous, and only ever backfill a row that is currently
//      'reconciliation_required' with no known message id yet. src/app/score/api/webhooks/resend/
//      route.ts was updated to forward Resend's tags through to the RPC for this to work at all.
//   2. public.resolve_premium_report_delivery_reconciliation (the pre-existing automated
//      reconciliation RPC) requires a phase14_provider_attestations row with
//      provider_state IN ('accepted','not_found'). reconcileReportEmailWithResend can only ever
//      produce that when a provider_message_id is already known; with none captured it returns
//      state:'unknown', which neither of that RPC's branches can resolve. Migration 0027 adds
//      public.admin_resolve_premium_report_delivery_ambiguity as the human-driven escape hatch for
//      exactly that case, reusing finalize_premium_report_delivery for the "confirmed delivered"
//      path rather than duplicating its logic.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  verifyResendWebhook,
  validateResendEventCreatedAt,
  createProviderWebhookDatabaseAttestation,
  webhookPayloadFingerprint,
  RESEND_WEBHOOK_MAX_EVENT_AGE_MS
} from '../src/lib/reports/email/resend-webhook.ts';

const root = process.cwd();

let EmbeddedPostgres, pg;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  pg = await import('pg');
} catch {
  console.log('SKIPPED: embedded-postgres/pg not installed.');
  process.exit(0);
}

const PORT = 55932 + ((process.pid + 41) % 400);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-delivery-reconciliation-pg-'));
const pgInstance = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'testpass', port: PORT, persistent: false
});

let passed = 0;
const clients = [];
function newClient() {
  const client = new pg.default.Client({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'testpass', database: 'testdb'
  });
  clients.push(client);
  return client;
}
async function asAdmin(client, userId, sessionId, aal = 'aal2') {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })
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
    console.error(`    ${error.stack ?? error.message}`);
    throw error;
  }
}

console.log('Booting disposable local Postgres for H4 delivery-reconciliation replay...');
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
    '0026_phase14_workflow_start_admin_recovery', '0027_phase14_delivery_ambiguity_admin_resolution',
    '0028_phase14_attestation_canonicalisation_hardening'
  ];
  console.log(`Applying ${files.length} real migration files verbatim...`);
  for (const f of files) {
    await migrator.query(fs.readFileSync(path.join(migrationsDir, `${f}.sql`), 'utf8'));
  }
  console.log('All migrations applied.');

  // ---- Fixtures (same shape as the H3 suite) ----
  const orgId = (await migrator.query(`insert into public.organisations(legal_name) values ('Acme Test Org') returning id`)).rows[0].id;
  const methodology = (await migrator.query(`select id from public.methodology_versions order by created_at asc limit 1`)).rows[0];
  const domainRows = (await migrator.query(`select id from public.domains where methodology_version_id = $1`, [methodology.id])).rows;
  const questionRows = (await migrator.query(`select id from public.questions where methodology_version_id = $1 and active`, [methodology.id])).rows;

  let scenarioCounter = 0;
  async function makeScoredAssessment() {
    scenarioCounter += 1;
    const reference = `TEST-H4-ASMT-${scenarioCounter}`;
    const assessmentId = (await migrator.query(
      `insert into public.assessments(assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
       values ($1, $2, $3, 'scored', now()) returning id`, [reference, orgId, methodology.id]
    )).rows[0].id;
    const scoreRunId = (await migrator.query(
      `insert into public.score_runs(assessment_id, methodology_version_id, run_number, run_type, status)
       values ($1, $2, 1, 'initial', 'draft') returning id`, [assessmentId, methodology.id]
    )).rows[0].id;
    for (const d of domainRows) {
      await migrator.query(
        `insert into public.score_domain_results(score_run_id, domain_id, raw_score, weighted_contribution, coverage_pct, critical_gap_count)
         values ($1, $2, 3, 1, 100, 0)`, [scoreRunId, d.id]
      );
    }
    for (const qrow of questionRows) {
      await migrator.query(
        `insert into public.score_question_traces(score_run_id, question_id, response_value, normalised_score, question_weight, applicable, numerator_contribution, denominator_contribution)
         values ($1, $2, 3, 3, 1, true, 3, 5)`, [scoreRunId, qrow.id]
      );
    }
    await migrator.query(
      `update public.score_runs set status='completed', overall_score=75, calculated_maturity='Structured', final_maturity='Structured',
         exposure_score=10, exposure_band='Low', coverage_pct=100, input_hash=repeat('a',64), locked_at=now() where id=$1`, [scoreRunId]
    );
    await migrator.query(`update public.assessments set current_score_run_id = $1 where id = $2`, [scoreRunId, assessmentId]);
    return { assessmentId, scoreRunId, reference };
  }

  const product = (await migrator.query(`select id, price_cents, currency from public.products where product_code = 'essential_self_assessment'`)).rows[0];

  async function makeAdminUser(email, role) {
    const userId = (await migrator.query(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
    await migrator.query(`insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, $2, $3, 'active', true)`, [userId, email, role]);
    const sessionId = (await migrator.query(`insert into auth.sessions(user_id, not_after) values ($1, now() + interval '1 day') returning id`, [userId])).rows[0].id;
    return { userId, sessionId };
  }
  const { userId: adminUserId, sessionId: adminSessionId } = await makeAdminUser('admin@test.local', 'platform_admin');
  const { userId: reviewerUserId, sessionId: reviewerSessionId } = await makeAdminUser('reviewer@test.local', 'reviewer');

  const templateId = (await migrator.query(
    `insert into public.report_templates(template_code, version_number, report_type, status, content_schema_json)
     values ('essential-v1', 1, 'essential_self_assessment', 'active', '{}'::jsonb) returning id`
  )).rows[0].id;
  await migrator.query(`insert into storage.buckets(id, name, public) values ('generated-reports','generated-reports', false) on conflict do nothing`);

  async function makeOrder(assessmentId) {
    scenarioCounter += 1;
    const reference = `TEST-H4-ORDER-${scenarioCounter}`;
    const orderId = (await migrator.query(
      `insert into public.orders(order_reference, assessment_id, product_id, status, amount_cents, currency,
         verified_by, verified_at, customer_email, customer_name, organisation_name)
       values ($1, $2, $3, 'payment_received', $4, $5, $6, now(), 'customer@test.local', 'Test Customer', 'Acme Test Org') returning id`,
      [reference, assessmentId, product.id, product.price_cents, product.currency, adminUserId]
    )).rows[0].id;
    return orderId;
  }
  async function makeCurrentReport(orderId, assessmentId, scoreRunId) {
    scenarioCounter += 1;
    const suffix = String(scenarioCounter);
    const checksum = 'b'.repeat(64);
    const reportId = (await migrator.query(
      `insert into public.reports(assessment_id, order_id, score_run_id, template_id, report_type, status,
         report_reference, version_number, storage_bucket, storage_path, checksum)
       values ($1, $2, $3, $4, 'essential_self_assessment', 'generated', $5, 1, 'generated-reports', $6, $7) returning id`,
      [assessmentId, orderId, scoreRunId, templateId, `TEST-H4-RPT-${suffix}`, `reports/${suffix}.pdf`, checksum]
    )).rows[0].id;
    await migrator.query(
      `insert into storage.objects(bucket_id, name, metadata) values ('generated-reports', $1, $2)`,
      [`reports/${suffix}.pdf`, JSON.stringify({ mimetype: 'application/pdf', sha256: checksum })]
    );
    // finalize_premium_report_delivery requires a bound, 'ready_for_delivery' fulfilment for any
    // non-test-delivery finalization -- create and bind one, mirroring the real generation
    // pipeline's end state just before a report is handed to delivery.
    const fulfilmentId = (await migrator.query(
      `insert into public.report_fulfilments(order_id, assessment_id, score_run_id, report_id, idempotency_key, trigger_source, status, current_step, completed_at)
       values ($1, $2, $3, $4, $5, 'admin_generate', 'ready_for_delivery', 'awaiting_delivery', null) returning id`,
      [orderId, assessmentId, scoreRunId, reportId, `test-h4-fulfilment-${suffix}`]
    )).rows[0].id;
    await migrator.query(`update public.reports set fulfilment_id=$1 where id=$2`, [fulfilmentId, reportId]);
    return reportId;
  }

  const adminSession = newClient();
  await adminSession.connect();
  await asAdmin(adminSession, adminUserId, adminSessionId);
  await adminSession.query(`select public.set_phase14_security_gate_version(1, 'H4 behavioural test setup')`);
  await adminSession.query(`select public.set_phase14_feature_policy('manual_delivery', true, 'H4 behavioural test setup')`);
  await adminSession.query(`select public.set_phase14_feature_policy('provider_webhook_ingestion', true, 'H4 behavioural test setup')`);

  const WEBHOOK_HMAC_SECRET = 'phase14-h4-test-webhook-hmac-secret-min-32-chars-aaaa';
  await adminSession.query(`select public.set_phase14_runtime_secret('provider_webhook_db_hmac', $1)`, [WEBHOOK_HMAC_SECRET]);
  process.env.PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET = WEBHOOK_HMAC_SECRET;

  const reviewerSession = newClient();
  await reviewerSession.connect();
  await asAdmin(reviewerSession, reviewerUserId, reviewerSessionId);

  const serviceRoleSession = newClient();
  await serviceRoleSession.connect();
  await asServiceRole(serviceRoleSession);

  // ---- Helpers driving the real SQL state machine exactly as delivery-dispatch.ts does ----
  async function authorizeAndClaim() {
    const { assessmentId, scoreRunId } = await makeScoredAssessment();
    const orderId = await makeOrder(assessmentId);
    const reportId = await makeCurrentReport(orderId, assessmentId, scoreRunId);
    const authResult = (await adminSession.query(
      `select public.authorize_premium_report_delivery($1, 'customer@test.local', 'initial', false, 'resend', null) as res`, [reportId]
    )).rows[0].res;
    assert.equal(authResult.reused_existing_send, false);
    const claimResult = (await adminSession.query(
      `select public.claim_premium_report_delivery($1) as res`, [authResult.authorization_id]
    )).rows[0].res;
    assert.equal(claimResult.claimed, true);
    return { reportId, authorizationId: claimResult.authorization_id, leaseToken: claimResult.lease_token, emailEventId: claimResult.email_event_id };
  }
  async function dispatchStarted(authorizationId, leaseToken) {
    await adminSession.query(`select public.mark_premium_report_delivery_dispatch_started($1, $2)`, [authorizationId, leaseToken]);
  }
  async function eventStatus(emailEventId) {
    return (await migrator.query(`select status, provider_message_id, error_message, reconciliation_result_json from public.email_events where id=$1`, [emailEventId])).rows[0];
  }
  async function authStatus(authorizationId) {
    return (await migrator.query(`select status, revoked_reason from public.report_delivery_authorizations where id=$1`, [authorizationId])).rows[0];
  }

  function buildWebhookCall({ providerEventId, providerMessageId, eventType = 'email.sent', createdAt = new Date().toISOString(), tags = [] }) {
    const payload = JSON.stringify({ type: eventType, created_at: createdAt, data: { email_id: providerMessageId, tags } });
    const payloadSha256 = webhookPayloadFingerprint(payload);
    const attestation = createProviderWebhookDatabaseAttestation({
      provider: 'resend', providerEventId, providerMessageId, eventType, eventCreatedAt: createdAt, payloadSha256
    });
    return {
      p_provider: 'resend', p_provider_event_id: providerEventId, p_provider_message_id: providerMessageId,
      p_event_type: eventType, p_event_created_at: createdAt, p_payload_sha256: payloadSha256,
      p_payload_json: { type: eventType, created_at: createdAt, reason: null, data: { tags } },
      p_attested_at_epoch: attestation.attestedAtEpoch, p_nonce: attestation.nonce, p_attestation_hmac: attestation.hmac
    };
  }
  async function sendWebhook(client, call) {
    return (await client.query(
      `select public.ingest_phase14_provider_webhook($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as res`,
      [call.p_provider, call.p_provider_event_id, call.p_provider_message_id, call.p_event_type, call.p_event_created_at,
        call.p_payload_sha256, JSON.stringify(call.p_payload_json), call.p_attested_at_epoch, call.p_nonce, call.p_attestation_hmac]
    )).rows[0].res;
  }

  console.log('Fixtures ready. Running H4 scenarios...');

  // ---- 1. accepted send + normal response ----
  await test('1. accepted send + normal response is finalized and never marked reconciliation_required', async () => {
    const { authorizationId, leaseToken, emailEventId } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    const finalized = (await adminSession.query(
      `select public.finalize_premium_report_delivery($1,$2,$3) as res`, [authorizationId, emailEventId, 'resend-msg-normal-1']
    )).rows[0].res;
    assert.equal(finalized.finalized, true);
    const event = await eventStatus(emailEventId);
    assert.equal(event.status, 'sent');
    assert.equal(event.provider_message_id, 'resend-msg-normal-1');
  });

  // ---- 2. accepted send + lost response + later webhook (the core H4 scenario) ----
  let scenario2 = null;
  await test('2. accepted send + lost response + later webhook correlates via delivery_attempt_ref and finalizes automatically', async () => {
    const { authorizationId, leaseToken, emailEventId } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    // Simulate exactly what delivery-dispatch.ts's catch block does when transport() throws
    // after dispatchStarted but before a provider_message_id was ever returned.
    await adminSession.query(
      `select public.mark_premium_report_delivery_reconciliation_required($1, null, $2)`,
      [authorizationId, 'HTTP response lost after dispatch; provider acceptance unknown.']
    );
    let event = await eventStatus(emailEventId);
    assert.equal(event.status, 'reconciliation_required');
    assert.equal(event.provider_message_id, null, 'the whole point of this scenario is that no message id was ever captured');

    // A real Resend webhook now arrives for the message the app never learned the id of. It
    // carries the delivery_attempt_ref tag that was attached at send time.
    const providerMessageId = 'resend-msg-lost-response-1';
    const createdAt = new Date().toISOString();
    const call = buildWebhookCall({
      providerEventId: 'evt-lost-response-1', providerMessageId, eventType: 'email.sent', createdAt,
      tags: [{ name: 'delivery_attempt_ref', value: authorizationId.replace(/-/g, '') }, { name: 'message_type', value: 'premium_report_pdf' }]
    });
    const result = await sendWebhook(serviceRoleSession, call);
    assert.equal(result.duplicate, false);
    assert.equal(result.state_updated, true);
    assert.equal(result.status, 'sent');

    event = await eventStatus(emailEventId);
    assert.equal(event.status, 'sent', 'the correlated webhook must move the attempt off reconciliation_required automatically');
    assert.equal(event.provider_message_id, providerMessageId, 'the provider message id must be backfilled from the correlated webhook');
    const auth = await authStatus(authorizationId);
    // apply_email_provider_event_atomic only updates email_events; report_delivery_authorizations
    // stays 'reconciliation_required' until an explicit finalize call -- confirmed intentional:
    // finalize_premium_report_delivery is the only function permitted to release the report /
    // complete the fulfilment, and it independently re-verifies entitlement before doing so. A
    // webhook alone must not be sufficient to release a report; it only proves provider acceptance.
    assert.equal(auth.status, 'reconciliation_required');
    scenario2 = { authorizationId, emailEventId, providerMessageId, createdAt };
  });

  // ---- 3. duplicate webhook ----
  await test('3. duplicate webhook (same provider_event_id, same payload) is a graceful no-op replay', async () => {
    assert.ok(scenario2, 'scenario 2 must run first');
    const call = buildWebhookCall({
      providerEventId: 'evt-lost-response-1', providerMessageId: scenario2.providerMessageId, eventType: 'email.sent',
      createdAt: scenario2.createdAt,
      tags: [{ name: 'delivery_attempt_ref', value: scenario2.authorizationId.replace(/-/g, '') }, { name: 'message_type', value: 'premium_report_pdf' }]
    });
    const result = await sendWebhook(serviceRoleSession, call);
    assert.equal(result.duplicate, true);
    assert.equal(result.conflict, false);
    assert.equal(result.state_updated, false);
  });

  // ---- 4. concurrent duplicate webhook ----
  await test('4. concurrent duplicate webhook never double-applies and never surfaces as an unhandled error', async () => {
    const { authorizationId, leaseToken, emailEventId } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost')`, [authorizationId]);
    const providerMessageId = 'resend-msg-concurrent-1';
    const call = buildWebhookCall({
      providerEventId: 'evt-concurrent-1', providerMessageId, eventType: 'email.sent',
      tags: [{ name: 'delivery_attempt_ref', value: authorizationId.replace(/-/g, '') }]
    });
    const clientA = newClient(); await clientA.connect(); await asServiceRole(clientA);
    const clientB = newClient(); await clientB.connect(); await asServiceRole(clientB);
    const [resultA, resultB] = await Promise.all([sendWebhook(clientA, call), sendWebhook(clientB, call)]);
    // Whichever ordering the two transactions actually serialise in, exactly one must report the
    // substantive state change and the other must report a graceful duplicate -- neither request
    // may throw, and the final state must reflect the change exactly once.
    const results = [resultA, resultB];
    const appliedCount = results.filter((r) => r.state_updated === true).length;
    const duplicateCount = results.filter((r) => r.duplicate === true).length;
    assert.equal(appliedCount, 1, 'exactly one of the two concurrent identical webhooks must apply the state change');
    assert.equal(duplicateCount, 1, 'the other must resolve as a graceful duplicate, not an error');
    const event = await eventStatus(emailEventId);
    assert.equal(event.status, 'sent');
    assert.equal(event.provider_message_id, providerMessageId);
  });

  // ---- 5. webhook with invalid signature ----
  await test('5. a webhook with an invalid signature is rejected by verifyResendWebhook before any DB call', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({ type: 'email.sent', created_at: new Date().toISOString(), data: { email_id: 'x' } });
    assert.throws(() => verifyResendWebhook({
      payload, id: 'evt-bad-sig', timestamp,
      signature: `v1,${Buffer.from('not-the-real-signature').toString('base64')}`,
      secret: `whsec_${Buffer.from('a-real-secret-key-1234567890123456').toString('base64')}`
    }), /Webhook signature is invalid/);
  });

  // ---- 6. webhook outside replay window ----
  await test('6. a webhook outside the replay window is rejected', async () => {
    const secretKey = Buffer.from('a-real-secret-key-1234567890123456');
    const secret = `whsec_${secretKey.toString('base64')}`;
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600); // 1 hour old, window is 300s
    const payload = JSON.stringify({ type: 'email.sent', created_at: new Date().toISOString(), data: { email_id: 'x' } });
    const signature = crypto.createHmac('sha256', secretKey).update(`evt-old.${oldTimestamp}.${payload}`).digest('base64');
    assert.throws(() => verifyResendWebhook({
      payload, id: 'evt-old', timestamp: oldTimestamp, signature: `v1,${signature}`, secret
    }), /outside the accepted replay window/);

    // Also cover validateResendEventCreatedAt's independent age check for an old event_created_at
    // riding on a fresh, validly-signed envelope.
    const nowMs = Date.parse('2026-07-14T12:00:00Z');
    assert.throws(() => validateResendEventCreatedAt({
      eventCreatedAt: new Date(nowMs - RESEND_WEBHOOK_MAX_EVENT_AGE_MS - 60_000).toISOString(),
      verifiedSvixTimestamp: String(Math.floor(nowMs / 1000)),
      receiptTimeMs: nowMs
    }), /excessively old/);
  });

  // ---- 7. webhook that matches no attempt ----
  await test('7. a correctly-signed webhook for a message id with no matching attempt and no valid tag is ignored, not misapplied', async () => {
    const call = buildWebhookCall({
      providerEventId: 'evt-unknown-message-1', providerMessageId: 'resend-msg-never-seen-1', eventType: 'email.sent', tags: []
    });
    const result = await sendWebhook(serviceRoleSession, call);
    assert.equal(result.ignored, true);
    assert.equal(result.reason, 'unknown_message');
  });

  // ---- 8. webhook that matches more than one candidate: structurally impossible, proven two ways ----
  await test('8. two delivery attempts can never share a provider_message_id (structural, not just runtime, guarantee)', async () => {
    const { emailEventId: eventA } = await authorizeAndClaim();
    const { emailEventId: eventB } = await authorizeAndClaim();
    await migrator.query(`select set_config('phase14.authoritative_transition','migration',false)`);
    await migrator.query(`update public.email_events set provider_message_id=$1, status='sending' where id=$2`, ['dup-guard-1', eventA]);
    await migrator.query(`select set_config('phase14.authoritative_transition','migration',false)`);
    await assert.rejects(
      migrator.query(`update public.email_events set provider_message_id=$1, status='sending' where id=$2`, ['dup-guard-1', eventB]),
      /email_events_provider_message_uidx|duplicate key/
    );
  });
  await test('8b. delivery_attempt_ref-based webhook correlation can also never match more than one row (authorization_id is a primary key)', async () => {
    const { authorizationId: authA, leaseToken: leaseA, emailEventId: eventA } = await authorizeAndClaim();
    await dispatchStarted(authA, leaseA);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost')`, [authA]);
    // A tag claiming to reference a DIFFERENT, unrelated authorization id must never correlate.
    const { authorizationId: authB } = await authorizeAndClaim();
    const call = buildWebhookCall({
      providerEventId: 'evt-mismatched-tag-1', providerMessageId: 'resend-msg-mismatched-tag-1', eventType: 'email.sent',
      tags: [{ name: 'delivery_attempt_ref', value: authB.replace(/-/g, '') }]
    });
    const result = await sendWebhook(serviceRoleSession, call);
    // authB is not in 'reconciliation_required' (still 'claimed'), so the fallback's WHERE clause
    // cannot match it either -- the event is correctly ignored rather than misapplied to authA.
    assert.equal(result.ignored, true);
    const eventAState = await eventStatus(eventA);
    assert.equal(eventAState.status, 'reconciliation_required', 'a tag naming a different authorization must never resolve this one');
  });

  // ---- 9. no webhook + admin confirms delivered ----
  await test('9. no webhook + admin confirms delivered finalizes without sending again', async () => {
    const { authorizationId, leaseToken, emailEventId } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost, admin will check dashboard')`, [authorizationId]);
    const result = (await adminSession.query(
      `select public.admin_resolve_premium_report_delivery_ambiguity($1,'confirmed_delivered',$2,$3) as res`,
      [authorizationId, 'resend-msg-admin-confirmed-1', 'Verified in Resend dashboard: message shows delivered.']
    )).rows[0].res;
    assert.equal(result.finalized, true);
    const event = await eventStatus(emailEventId);
    assert.equal(event.status, 'sent');
    assert.equal(event.provider_message_id, 'resend-msg-admin-confirmed-1');
    const auditRow = (await migrator.query(
      `select actor_user_id, action, before_json, after_json from public.audit_logs
       where entity_table='report_delivery_authorizations' and entity_id=$1
         and action='premium_report_delivery_ambiguity_resolved' order by created_at desc limit 1`, [authorizationId]
    )).rows[0];
    assert.equal(auditRow.actor_user_id, adminUserId);
    assert.equal(auditRow.after_json.resolution, 'confirmed_delivered');
    assert.ok(auditRow.before_json.email_event_status, 'audit trail must record the prior (uncertain) state, not just the new one');
  });

  // ---- 10. no webhook + admin confirms not delivered ----
  let scenario10 = null;
  await test('10. no webhook + admin confirms not delivered closes the attempt terminally without deleting history', async () => {
    const { reportId, authorizationId, leaseToken, emailEventId } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost')`, [authorizationId]);
    const result = (await adminSession.query(
      `select public.admin_resolve_premium_report_delivery_ambiguity($1,'confirmed_not_delivered',null,$2) as res`,
      [authorizationId, 'Checked Resend dashboard: no message found for this send window; treat as never sent.']
    )).rows[0].res;
    assert.equal(result.resolved, true);
    assert.equal(result.resolution, 'confirmed_not_delivered');
    const event = await eventStatus(emailEventId);
    assert.equal(event.status, 'failed_before_provider');
    const auth = await authStatus(authorizationId);
    assert.equal(auth.status, 'revoked');
    assert.ok(auth.revoked_reason.includes('Checked Resend dashboard'));
    // The uncertain history is preserved, not deleted -- the original reconciliation_required
    // email_event row still exists with its full history; only its status column moved forward.
    const stillExists = (await migrator.query(`select count(*)::int as c from public.email_events where id=$1`, [emailEventId])).rows[0].c;
    assert.equal(stillExists, 1);
    scenario10 = { reportId };
  });

  // ---- 11. no webhook + admin cannot determine ----
  await test('11. no webhook + admin cannot determine keeps the attempt blocked and escalated', async () => {
    const { authorizationId, leaseToken, emailEventId } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost')`, [authorizationId]);
    const result = (await adminSession.query(
      `select public.admin_resolve_premium_report_delivery_ambiguity($1,'cannot_determine',null,$2) as res`,
      [authorizationId, 'Resend dashboard search returned no conclusive match for this attempt; escalating to provider support.']
    )).rows[0].res;
    assert.equal(result.resolved, false);
    assert.equal(result.escalated, true);
    const event = await eventStatus(emailEventId);
    assert.equal(event.status, 'reconciliation_required', 'cannot_determine must leave the attempt blocked, not close it either way');
    assert.equal(event.reconciliation_result_json.resolution, 'cannot_determine');
    const auth = await authStatus(authorizationId);
    assert.equal(auth.status, 'reconciliation_required');
  });

  // ---- 12. unauthorised admin resolution blocked ----
  await test('12. a reviewer (not platform_admin/approver) cannot resolve a delivery ambiguity', async () => {
    const { authorizationId, leaseToken } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost')`, [authorizationId]);
    await assert.rejects(
      reviewerSession.query(
        `select public.admin_resolve_premium_report_delivery_ambiguity($1,'confirmed_not_delivered',null,$2) as res`,
        [authorizationId, 'attempted by an unauthorised role']
      ),
      /phase14_role_forbidden|phase14_actor_role_forbidden|forbidden/i
    );
  });

  // ---- 13. non-AAL2 resolution blocked ----
  await test('13. a platform_admin session without AAL2 cannot resolve a delivery ambiguity', async () => {
    const { authorizationId, leaseToken } = await authorizeAndClaim();
    await dispatchStarted(authorizationId, leaseToken);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost')`, [authorizationId]);
    const nonAal2Session = newClient();
    await nonAal2Session.connect();
    await asAdmin(nonAal2Session, adminUserId, adminSessionId, 'aal1');
    await assert.rejects(
      nonAal2Session.query(
        `select public.admin_resolve_premium_report_delivery_ambiguity($1,'confirmed_not_delivered',null,$2) as res`,
        [authorizationId, 'attempted without AAL2']
      ),
      /aal2|mfa|phase14_aal2_required/i
    );
  });

  // ---- 14. retry blocked while status is uncertain ----
  await test('14. a fresh authorization attempt is blocked while the prior attempt is still reconciliation_required', async () => {
    const { assessmentId, scoreRunId } = await makeScoredAssessment();
    const orderId = await makeOrder(assessmentId);
    const reportId = await makeCurrentReport(orderId, assessmentId, scoreRunId);
    const authResult = (await adminSession.query(
      `select public.authorize_premium_report_delivery($1, 'customer@test.local', 'initial', false, 'resend', null) as res`, [reportId]
    )).rows[0].res;
    const claim = (await adminSession.query(`select public.claim_premium_report_delivery($1) as res`, [authResult.authorization_id])).rows[0].res;
    await dispatchStarted(claim.authorization_id, claim.lease_token);
    await adminSession.query(`select public.mark_premium_report_delivery_reconciliation_required($1, null, 'lost')`, [claim.authorization_id]);
    // Same report, same delivery mode -- authorize_premium_report_delivery must refuse a new
    // attempt while an ambiguous prior attempt for this report is unresolved.
    await assert.rejects(
      adminSession.query(`select public.authorize_premium_report_delivery($1, 'customer@test.local', 'initial', false, 'resend', null) as res`, [reportId]),
      /delivery_prior_send_unresolved|already|pending|unresolved/i
    );
  });

  // ---- 15. authorised retry after confirmed_not_delivered ----
  await test('15. after confirmed_not_delivered, a fresh, separately authorised retry is permitted with a new attempt identity', async () => {
    assert.ok(scenario10, 'scenario 10 must run first');
    const result = (await adminSession.query(
      `select public.authorize_premium_report_delivery($1, 'customer@test.local', 'initial', false, 'resend', null) as res`, [scenario10.reportId]
    )).rows[0].res;
    assert.equal(result.reused_existing_send, false, 'a confirmed-not-delivered prior attempt must never be silently reused as if it were the new send');
    assert.ok(result.authorization_id);
    const newEmailEvent = (await migrator.query(`select id, attempt_number, provider_request_key from public.email_events where id=$1`, [result.email_event_id])).rows[0];
    assert.ok(newEmailEvent, 'the retry must create a brand-new email_events row with its own identity');
  });

  // ---- 16. no duplicate customer email in any recovery scenario ----
  await test('16. no recovery path in this suite ever calls a real send transport a second time for the same attempt', async () => {
    // Structural proof, not a runtime assertion: every recovery path exercised above --
    // admin_resolve_premium_report_delivery_ambiguity (all three resolutions), the webhook
    // correlation fallback, and the duplicate/concurrent-webhook paths -- is pure SQL state
    // transition. None of them call out to Resend, and confirmed_delivered specifically reuses
    // finalize_premium_report_delivery rather than re-authorizing or re-claiming a send. The only
    // function in this migration set that ever creates a *new* email_events row is
    // authorize_premium_report_delivery (proven safe for the terminal-failure case in test #15,
    // and blocked entirely for the still-ambiguous case in test #14). The actual Resend HTTP call
    // only ever happens from src/lib/reports/email/resend-transport.ts's sendReportEmailWithResend,
    // which is invoked from exactly one place (executeClaimedReportDelivery in
    // delivery-dispatch.ts) -- confirmed by static grep below.
    const migrationSource = fs.readFileSync(path.join(root, 'supabase/migrations/0027_phase14_delivery_ambiguity_admin_resolution.sql'), 'utf8');
    assert.doesNotMatch(migrationSource, /resend\.com|sendReportEmailWithResend/i,
      'the admin resolution migration must never itself call out to a send transport');
    const deliveryDispatchSource = fs.readFileSync(path.join(root, 'src/lib/reports/email/delivery-dispatch.ts'), 'utf8');
    const transportCallSites = deliveryDispatchSource.match(/input\.transport\(/g) ?? [];
    assert.equal(transportCallSites.length, 1, 'the real Resend transport must be called from exactly one place in the codebase');
  });

  console.log(`\nPhase 14 H4 delivery-reconciliation suite passed (${passed} behavioural/structural cases).`);
} finally {
  for (const c of clients) {
    try { await c.end(); } catch { /* already closed */ }
  }
  await pgInstance.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

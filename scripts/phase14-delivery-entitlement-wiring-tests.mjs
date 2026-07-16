// Phase 14 -- H3: delivery entitlement is enforced by one authoritative implementation.
//
// The original review flagged src/lib/reports/email/delivery-entitlement.ts
// (validatePremiumReportDeliveryEntitlement) as defined but never called from the real delivery
// path. Verifying the CURRENT code (not the prior finding) against the real migration SQL shows
// this is not a "forgot to wire it in" bug: an independent, more thorough entitlement check
// already exists at the authoritative layer and is already wired into BOTH delivery entry
// points before any email_event/authorization row is created, let alone before provider
// dispatch --
//
//   - public.authorize_premium_report_delivery (the manual/admin path used directly by
//     report-delivery-service-core.ts's non-worker branch) calls
//     public.phase14_delivery_entitlement(...) under an advisory lock before creating anything.
//   - public.worker_authorize_premium_report_delivery (the automatic/worker path, reached via
//     execute_phase14_worker_step's 'worker_authorize_premium_report_delivery' case) does not
//     duplicate or diverge from that check -- its body is a single line that delegates straight
//     to public.authorize_premium_report_delivery. There is no separate logic path to test.
//
// phase14_delivery_entitlement is also strictly MORE thorough than the removed TS function: it
// additionally verifies the report's storage.objects row actually exists with matching
// mimetype/sha256 metadata, which the TS version had no way to check at all. Keeping the weaker
// TS duplicate around and "wiring it in" as originally suggested would have added a second,
// divergent, race-prone entitlement definition without closing any real gap -- the disposition
// permitted by the task spec ("remove dead/duplicate validator code only if one clear
// authoritative implementation remains") is the correct one here, and
// src/lib/reports/email/delivery-entitlement.ts has been deleted accordingly.
//
// This suite proves the remaining claim by real behaviour, not by re-reading the SQL: it boots a
// disposable local Postgres (the same embedded-postgres harness used for H2), applies the real
// migrations, and calls the real public.authorize_premium_report_delivery RPC directly as an
// authenticated admin -- proving it accepts a fully-entitled report and rejects each of: a
// recipient that doesn't match the paid order (without an override), a report that is not the
// current version for its assessment/type, and an order whose manual payment verification is
// incomplete. Because worker_authorize_premium_report_delivery has no divergent logic (confirmed
// by static source assertion below), this is sufficient to prove both entry points.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = process.cwd();

// ---- Static proofs (cheap, no DB needed) ----
assert.equal(
  fs.existsSync(path.join(root, 'src/lib/reports/email/delivery-entitlement.ts')), false,
  'the dead/duplicate TS entitlement validator must be removed now that the authoritative SQL check is confirmed'
);
const migrationSource = fs.readFileSync(
  path.join(root, 'supabase/migrations/0017_phase14_canonical_disabled_foundation.sql'), 'utf8'
);
{
  // Isolate the LAST (authoritative) definition of each function -- this migration file
  // layers successive create-or-replace blocks, so the final occurrence is what actually runs.
  const lastDefinition = (name) => {
    const marker = `create or replace function public.${name}(`;
    const idx = migrationSource.lastIndexOf(marker);
    assert.ok(idx >= 0, `expected to find a definition of ${name}`);
    return migrationSource.slice(idx, migrationSource.indexOf('\n$$;', idx) + 4);
  };
  const authorizeBody = lastDefinition('authorize_premium_report_delivery');
  assert.match(authorizeBody, /phase14_delivery_entitlement\(/,
    'authorize_premium_report_delivery must call the authoritative entitlement check');
  const workerAuthorizeBody = lastDefinition('worker_authorize_premium_report_delivery');
  assert.match(workerAuthorizeBody, /return public\.authorize_premium_report_delivery\(/,
    'worker_authorize_premium_report_delivery must delegate to the same authorize function, not duplicate the check');
}
const deliveryServiceCore = fs.readFileSync(
  path.join(root, 'src/lib/reports/email/report-delivery-service-core.ts'), 'utf8'
);
assert.match(deliveryServiceCore, /authorize_premium_report_delivery/,
  'the manual delivery path must call authorize_premium_report_delivery');
assert.match(deliveryServiceCore, /worker_authorize_premium_report_delivery/,
  'the automatic delivery path must call worker_authorize_premium_report_delivery');
{
  const authorizeCallIdx = deliveryServiceCore.indexOf("authorize_premium_report_delivery'");
  const dispatchCallIdx = deliveryServiceCore.indexOf('executeClaimedReportDelivery({');
  assert.ok(authorizeCallIdx >= 0 && dispatchCallIdx > authorizeCallIdx,
    'entitlement authorization must happen before the transport dispatch call');
}
console.log('  ok - static: dead TS validator removed; both delivery entry points call the authoritative SQL check before dispatch');

// ---- Real-Postgres behavioural proof ----
let EmbeddedPostgres, pg;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  pg = await import('pg');
} catch {
  console.log('SKIPPED: embedded-postgres/pg not installed. Static proofs above still ran and passed.');
  process.exit(0);
}

const PORT = 55932 + (process.pid % 400);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-delivery-entitlement-pg-'));
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
async function asAdmin(client, userId, sessionId) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal2', session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })
  ]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
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

console.log('Booting disposable local Postgres for H3 delivery-entitlement replay...');
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
    '0017_phase14_canonical_disabled_foundation', '0023_phase1_manual_fulfilment_recovery',
    '0024_phase14_workflow_start_admin_recovery'
  ];
  console.log(`Applying ${files.length} real migration files verbatim...`);
  for (const f of files) {
    await migrator.query(fs.readFileSync(path.join(migrationsDir, `${f}.sql`), 'utf8'));
  }
  console.log('All migrations applied.');

  // ---- Fixtures: each test scenario gets its own assessment/score-run (reports has a unique
  // constraint on (assessment_id, report_type, version_number), and several scenarios below
  // deliberately create version 1 -- sharing an assessment across scenarios would collide). ----
  const orgId = (await migrator.query(`insert into public.organisations(legal_name) values ('Acme Test Org') returning id`)).rows[0].id;
  const methodology = (await migrator.query(`select id from public.methodology_versions order by created_at asc limit 1`)).rows[0];
  const domainRows = (await migrator.query(`select id from public.domains where methodology_version_id = $1`, [methodology.id])).rows;
  const questionRows = (await migrator.query(`select id from public.questions where methodology_version_id = $1 and active`, [methodology.id])).rows;

  async function makeScoredAssessment(reference) {
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
    return { assessmentId, scoreRunId };
  }

  const product = (await migrator.query(`select id, price_cents, currency from public.products where product_code = 'essential_self_assessment'`)).rows[0];

  async function makeAdminUser(email, role) {
    const userId = (await migrator.query(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
    await migrator.query(`insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, $2, $3, 'active', true)`, [userId, email, role]);
    const sessionId = (await migrator.query(`insert into auth.sessions(user_id, not_after) values ($1, now() + interval '1 day') returning id`, [userId])).rows[0].id;
    return { userId, sessionId };
  }
  const { userId: adminUserId, sessionId: adminSessionId } = await makeAdminUser('admin@test.local', 'platform_admin');

  const templateId = (await migrator.query(
    `insert into public.report_templates(template_code, version_number, report_type, status, content_schema_json)
     values ('essential-v1', 1, 'essential_self_assessment', 'active', '{}'::jsonb) returning id`
  )).rows[0].id;

  await migrator.query(`insert into storage.buckets(id, name, public) values ('generated-reports','generated-reports', false) on conflict do nothing`);

  async function makeOrder(reference, assessmentId, overrides = {}) {
    const o = {
      customerEmail: 'customer@test.local', customerName: 'Test Customer', organisationName: 'Acme Test Org',
      verifiedAt: 'now()', verifiedBy: adminUserId, ...overrides
    };
    const orderId = (await migrator.query(
      `insert into public.orders(order_reference, assessment_id, product_id, status, amount_cents, currency,
         verified_by, verified_at, customer_email, customer_name, organisation_name)
       values ($1, $2, $3, 'payment_received', $4, $5, $6, ${o.verifiedAt === null ? 'null' : o.verifiedAt}, $7, $8, $9) returning id`,
      [reference, assessmentId, product.id, product.price_cents, product.currency, o.verifiedBy, o.customerEmail, o.customerName, o.organisationName]
    )).rows[0].id;
    return orderId;
  }
  async function makeCurrentReport(orderId, assessmentId, scoreRunId, referenceSuffix, overrides = {}) {
    const checksum = 'b'.repeat(64);
    const o = { status: 'generated', versionNumber: 1, ...overrides };
    const reportId = (await migrator.query(
      `insert into public.reports(assessment_id, order_id, score_run_id, template_id, report_type, status,
         report_reference, version_number, storage_bucket, storage_path, checksum)
       values ($1, $2, $3, $4, 'essential_self_assessment', $5, $6, $7, 'generated-reports', $8, $9) returning id`,
      [assessmentId, orderId, scoreRunId, templateId, o.status, `TEST-H3-RPT-${referenceSuffix}`, o.versionNumber,
        `reports/${referenceSuffix}.pdf`, checksum]
    )).rows[0].id;
    await migrator.query(
      `insert into storage.objects(bucket_id, name, metadata) values ('generated-reports', $1, $2)`,
      [`reports/${referenceSuffix}.pdf`, JSON.stringify({ mimetype: 'application/pdf', sha256: checksum })]
    );
    return reportId;
  }

  const adminSession = newClient();
  await adminSession.connect();
  await asAdmin(adminSession, adminUserId, adminSessionId);
  await adminSession.query(`select public.set_phase14_security_gate_version(1, 'H3 behavioural test setup')`);
  await adminSession.query(`select public.set_phase14_feature_policy('manual_delivery', true, 'H3 behavioural test setup')`);

  console.log('Fixtures ready. Running H3 scenario...');

  await test('a fully-entitled report is accepted: recipient matches the paid order, report is current, order is verified', async () => {
    const { assessmentId, scoreRunId } = await makeScoredAssessment('TEST-H3-ASMT-OK');
    const orderId = await makeOrder('TEST-H3-ORDER-OK', assessmentId);
    const reportId = await makeCurrentReport(orderId, assessmentId, scoreRunId, 'OK');
    const result = (await adminSession.query(
      `select public.authorize_premium_report_delivery($1, 'customer@test.local', 'initial', false, 'resend', null) as res`, [reportId]
    )).rows[0].res;
    assert.equal(result.reused_existing_send, false);
    assert.ok(result.authorization_id);
    const auth = (await migrator.query(`select recipient_email, test_delivery from public.report_delivery_authorizations where id=$1`, [result.authorization_id])).rows[0];
    assert.equal(auth.recipient_email, 'customer@test.local');
    assert.equal(auth.test_delivery, false);
  });

  await test('a recipient that does not match the paid order is rejected without an override', async () => {
    const { assessmentId, scoreRunId } = await makeScoredAssessment('TEST-H3-ASMT-RECIPIENT-MISMATCH');
    const orderId = await makeOrder('TEST-H3-ORDER-RECIPIENT-MISMATCH', assessmentId);
    const reportId = await makeCurrentReport(orderId, assessmentId, scoreRunId, 'RECIPIENT-MISMATCH');
    await assert.rejects(
      adminSession.query(`select public.authorize_premium_report_delivery($1, 'attacker@evil.example', 'initial', false, 'resend', null) as res`, [reportId]),
      /delivery_recipient_override_forbidden/
    );
  });

  await test('a report that is not the current version for its assessment/type is rejected', async () => {
    const { assessmentId, scoreRunId } = await makeScoredAssessment('TEST-H3-ASMT-SUPERSEDED');
    const orderId = await makeOrder('TEST-H3-ORDER-SUPERSEDED', assessmentId);
    const oldReportId = await makeCurrentReport(orderId, assessmentId, scoreRunId, 'SUPERSEDED-OLD', { status: 'superseded', versionNumber: 1 });
    await makeCurrentReport(orderId, assessmentId, scoreRunId, 'SUPERSEDED-NEW', { status: 'generated', versionNumber: 2 });
    await assert.rejects(
      adminSession.query(`select public.authorize_premium_report_delivery($1, 'customer@test.local', 'initial', false, 'resend', null) as res`, [oldReportId]),
      /delivery_report_not_current/
    );
  });

  await test('an order whose manual payment verification is incomplete is rejected', async () => {
    const { assessmentId, scoreRunId } = await makeScoredAssessment('TEST-H3-ASMT-UNVERIFIED');
    const orderId = await makeOrder('TEST-H3-ORDER-UNVERIFIED', assessmentId, { verifiedAt: null, verifiedBy: null });
    const reportId = await makeCurrentReport(orderId, assessmentId, scoreRunId, 'UNVERIFIED');
    await assert.rejects(
      adminSession.query(`select public.authorize_premium_report_delivery($1, 'customer@test.local', 'initial', false, 'resend', null) as res`, [reportId]),
      /delivery_manual_verification_missing/
    );
  });

  await test('a test-recipient override is only accepted when explicitly requested and the recipient_override policy is enabled', async () => {
    const { assessmentId, scoreRunId } = await makeScoredAssessment('TEST-H3-ASMT-OVERRIDE');
    const orderId = await makeOrder('TEST-H3-ORDER-OVERRIDE', assessmentId);
    const reportId = await makeCurrentReport(orderId, assessmentId, scoreRunId, 'OVERRIDE');
    // Without the policy enabled, even an explicit override request must fail closed.
    await assert.rejects(
      adminSession.query(`select public.authorize_premium_report_delivery($1, 'qa-tester@test.local', 'initial', true, 'resend', null) as res`, [reportId]),
      /phase14_policy_disabled|phase14_security_gate_unsatisfied/
    );
    await adminSession.query(`select public.set_phase14_feature_policy('recipient_override', true, 'H3 behavioural test setup')`);
    const result = (await adminSession.query(
      `select public.authorize_premium_report_delivery($1, 'qa-tester@test.local', 'initial', true, 'resend', null) as res`, [reportId]
    )).rows[0].res;
    const auth = (await migrator.query(`select test_delivery from public.report_delivery_authorizations where id=$1`, [result.authorization_id])).rows[0];
    assert.equal(auth.test_delivery, true);
  });

  console.log(`\nPhase 14 delivery-entitlement wiring suite passed (${passed} behavioural cases + static proofs).`);
} finally {
  for (const c of clients) {
    try { await c.end(); } catch { /* already closed */ }
  }
  await pgInstance.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

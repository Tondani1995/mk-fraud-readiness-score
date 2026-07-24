// Release C order-detail delivery-truth unification tests.
//
// Proves the admin orders list (src/lib/reports/phase1-operations.ts's annotateOrdersWithPhase1State)
// and the order-detail page's primary fulfilment summary (src/app/score/admin/orders/
// [orderReference]/page.tsx, via src/lib/reports/delivery-recovery-service.ts's
// getOrderDeliveryState) can never disagree about an order's current Release C customer-delivery
// status -- including after a bounce/complaint, which only ever updates the linked email_events
// row, never report_delivery_authorizations.status itself (src/lib/reports/phase1-operations.ts's
// classifyDeliveryBucket() and the identical emailOutcome override in both files' delivery-status
// resolution) -- and that the legacy/manual manual_report_delivery_attempts channel (still driving
// FulfilmentActions' "Initiate/Retry Delivery" button, per
// src/lib/reports/phase1-manual-delivery.ts) never overrides or gets conflated with it.
//
// Two parts:
//  1. Static source assertions (no DB) -- legacy controls are still wired, the page clearly labels
//     legacy/manual delivery separately from real Release C delivery, and both call sites use the
//     same exported classification (not two independent reimplementations).
//  2. Live checks against a disposable local Postgres with every real migration applied verbatim
//     (same embedded-postgres harness as scripts/phase-v7-checkpoint-e-migration-replay-tests.mjs),
//     reproducing the exact query shape both call sites use (a LEFT JOIN to email_events, mirroring
//     Supabase's `email_events(status)` embedded-resource select) and the identical status-override
//     and bucket-classification logic. Not importing phase1-operations.ts directly -- like every
//     other live-DB script in this repo, it pulls in Next.js-coupled modules
//     (@/lib/supabase/server) that don't resolve/run outside a Next request context; the query
//     shape and pure classification logic are reproduced here instead, same as this repo's other
//     live-check scripts do for RPC/query logic.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function ok(condition, label) { if (!condition) throw new Error(`FAIL: ${label}`); console.log(`  ok - ${label}`); }
function includes(file, needle, label) { ok(read(file).includes(needle), `${label} (expected ${file} to include ${JSON.stringify(needle)})`); }

console.log('--- 1. Static: legacy controls remain wired, real vs legacy delivery clearly labelled (order-detail page) ---');
const pageFile = 'src/app/score/admin/orders/[orderReference]/page.tsx';
includes(pageFile, 'deliveryState={legacyDeliveryState}', 'FulfilmentActions still receives the legacy manual_report_delivery_attempts status (button stays functional)');
includes(pageFile, 'Legacy/manual delivery.', 'A caption explicitly names the legacy/manual delivery mechanism');
includes(pageFile, 'cannot change the current Release C customer-delivery status', 'The caption states the legacy action does not affect real delivery status');
includes(pageFile, 'Customer delivery status (Release C)', 'The primary summary labels the authoritative value as Release C delivery, not generic "Delivery state"');
includes(pageFile, 'realDeliveryState.currentDeliveryStatus', 'The primary summary is wired to the authoritative currentDeliveryStatus, not operations.latestDelivery');
includes(pageFile, 'Legacy manual delivery history', 'The legacy delivery-history section is explicitly labelled legacy');
includes(pageFile, 'Real delivery &amp; customer access', 'The real-delivery panel heading is retained');
includes(pageFile, 'canRetryDelivery={DELIVERY_RETRY_ROLES.includes(admin.role)}', 'Real-delivery retry control (DeliveryAccessPanel) remains wired for authorised roles');

const serviceFile = 'src/lib/reports/delivery-recovery-service.ts';
includes(serviceFile, 'currentDeliveryStatus', 'getOrderDeliveryState exposes an authoritative currentDeliveryStatus');
includes(serviceFile, 'currentDeliveryBucket', 'getOrderDeliveryState exposes an authoritative currentDeliveryBucket');
includes(serviceFile, "import { classifyDeliveryBucket } from './phase1-operations'", 'delivery-recovery-service.ts imports the shared classifier from phase1-operations.ts (not a reimplementation)');
includes(serviceFile, 'email_events(status)', "getOrderDeliveryState's own authorization query embeds the linked email_events outcome");

const opsFile = 'src/lib/reports/phase1-operations.ts';
includes(opsFile, 'export function classifyDeliveryBucket', 'phase1-operations.ts exports the shared classifier used by both call sites');
includes(opsFile, "db.from('manual_report_delivery_attempts')", 'getPhase1OrderOperations still queries the legacy table (untouched, still meaningfully used)');
ok(
  (() => {
    const body = read(opsFile);
    const fnStart = body.indexOf('export async function annotateOrdersWithPhase1State');
    const fnBody = body.slice(fnStart);
    return !fnBody.includes("db.from('manual_report_delivery_attempts')");
  })(),
  'annotateOrdersWithPhase1State (admin list) no longer reads the legacy table at all'
);

console.log('--- 2. Live Postgres replay: list and detail views never disagree ---');

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = await import('pg');

// Mirrors classifyDeliveryBucket() in src/lib/reports/phase1-operations.ts exactly.
const DELIVERY_IN_FLIGHT_STATUSES = ['queued', 'claimed', 'dispatching', 'retry_scheduled'];
const DELIVERY_ATTENTION_STATUSES = ['failed_terminal', 'reconciliation_required', 'revoked', 'bounced', 'complained'];
function classifyDeliveryBucket(status) {
  if (!status) return 'not_ready';
  if (DELIVERY_IN_FLIGHT_STATUSES.includes(status)) return 'delivery_pending';
  if (status === 'finalized') return 'delivered';
  if (DELIVERY_ATTENTION_STATUSES.includes(status)) return 'delivery_failed';
  return 'not_ready';
}
// Mirrors the emailOutcome override in both annotateOrdersWithPhase1State() and
// mapAuthorization() exactly: a bounce/complaint on the linked email_events row always wins,
// regardless of the authorization's own status.
function resolveStatus(authorizationStatus, emailEventStatus) {
  if (emailEventStatus === 'bounced' || emailEventStatus === 'complained') return emailEventStatus;
  return authorizationStatus ?? 'NOT_READY';
}

const port = 57500 + (process.pid % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-c-order-detail-truth-pg-'));
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
  console.log(`Applying ${migrationFiles.length} real migration files verbatim, in order...`);
  for (const name of migrationFiles) {
    await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
  }
  console.log('All migrations applied.');

  const orgId = (await db.query(`insert into public.organisations(legal_name) values ('Truth Test Org') returning id`)).rows[0].id;
  const methodology = (await db.query(`select id from public.methodology_versions order by created_at asc limit 1`)).rows[0];
  const product = (await db.query(`select id, price_cents, currency from public.products where product_code = 'essential_self_assessment'`)).rows[0];
  const adminUserId = (await db.query(`insert into auth.users(email) values ('admin@truth.local') returning id`)).rows[0].id;
  await db.query(`insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, 'admin@truth.local', 'platform_admin', 'active', true)`, [adminUserId]);
  const templateId = (await db.query(
    `insert into public.report_templates(template_code, version_number, report_type, status, content_schema_json)
     values ('essential-v1', 1, 'essential_self_assessment', 'active', '{}'::jsonb) returning id`
  )).rows[0].id;
  await db.query(`insert into storage.buckets(id, name, public) values ('generated-reports','generated-reports', false) on conflict do nothing`);

  let counter = 0;
  async function makeOrderWithReadyReport() {
    counter += 1;
    const suffix = String(counter);
    const assessmentId = (await db.query(
      `insert into public.assessments(assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
       values ($1, $2, $3, 'scored', now()) returning id`, [`TRUTH-ASMT-${suffix}`, orgId, methodology.id]
    )).rows[0].id;
    const scoreRunId = (await db.query(
      `insert into public.score_runs(assessment_id, methodology_version_id, run_number, run_type, status)
       values ($1, $2, 1, 'initial', 'draft') returning id`, [assessmentId, methodology.id]
    )).rows[0].id;
    await db.query(
      `update public.score_runs set status='completed', overall_score=75, calculated_maturity='Structured', final_maturity='Structured',
         exposure_score=10, exposure_band='Low', coverage_pct=100, input_hash=repeat('a',64), locked_at=now() where id=$1`, [scoreRunId]
    );
    await db.query(`update public.assessments set current_score_run_id = $1 where id = $2`, [scoreRunId, assessmentId]);
    const orderId = (await db.query(
      `insert into public.orders(order_reference, assessment_id, product_id, status, amount_cents, currency,
         verified_by, verified_at, customer_email, customer_name, organisation_name)
       values ($1, $2, $3, 'payment_received', $4, $5, $6, now(), 'customer@truth.local', 'Truth Customer', 'Truth Test Org') returning id`,
      [`TRUTH-ORDER-${suffix}`, assessmentId, product.id, product.price_cents, product.currency, adminUserId]
    )).rows[0].id;
    const checksum = 'b'.repeat(64);
    const reportId = (await db.query(
      `insert into public.reports(assessment_id, order_id, score_run_id, template_id, report_type, status,
         report_reference, version_number, storage_bucket, storage_path, checksum, storage_status)
       values ($1, $2, $3, $4, 'essential_self_assessment', 'released', $5, 1, 'generated-reports', $6, $7, 'VERIFIED') returning id`,
      [assessmentId, orderId, scoreRunId, templateId, `TRUTH-RPT-${suffix}`, `reports/${suffix}.pdf`, checksum]
    )).rows[0].id;
    return { orderId, reportId, assessmentId, scoreRunId };
  }

  async function makeAuthorization({ orderId, reportId, assessmentId, scoreRunId }, status) {
    const eventId = (await db.query(
      `insert into public.email_events(order_id, report_id, recipient_email, status) values ($1, $2, 'customer@truth.local', 'QUEUED') returning id`,
      [orderId, reportId]
    )).rows[0].id;
    await db.query(
      `insert into public.report_delivery_authorizations(
         report_id, report_checksum, recipient_email, order_id, assessment_id, score_run_id,
         security_gate_version, authorised_by, provider, email_event_id, status)
       values ($1, $2, 'customer@truth.local', $3, $4, $5, null, $6, 'resend', $7, $8)`,
      [reportId, 'b'.repeat(64), orderId, assessmentId, scoreRunId, adminUserId, eventId, status]
    );
    return eventId;
  }

  async function bounceOrComplain(emailEventId, outcome) {
    await db.query(`update public.email_events set status = $1, delivery_updated_at = now() where id = $2`, [outcome, emailEventId]);
  }

  async function makeLegacyAttempt(orderId, reportId, status) {
    await db.query(
      `insert into public.manual_report_delivery_attempts(order_id, report_id, request_key, requested_by, status, provider_mode, technical_reference)
       values ($1, $2, gen_random_uuid()::text, $3, $4, 'double', gen_random_uuid()::text)`,
      [orderId, reportId, adminUserId, status]
    );
  }

  // Mirrors phase1-operations.ts's annotateOrdersWithPhase1State delivery lookup exactly (a
  // LEFT JOIN to email_events, standing in for Supabase's `email_events(status)` embed).
  async function listViewDeliveryStatus(orderIds) {
    const rows = (await db.query(
      `select a.order_id, a.status, a.authorised_at, e.status as email_status
       from public.report_delivery_authorizations a
       left join public.email_events e on e.id = a.email_event_id
       where a.order_id = any($1) order by a.authorised_at desc`, [orderIds]
    )).rows;
    const latestByOrder = new Map();
    for (const row of rows) if (!latestByOrder.has(row.order_id)) latestByOrder.set(row.order_id, row);
    const result = new Map();
    for (const orderId of orderIds) {
      const latest = latestByOrder.get(orderId) ?? null;
      const status = resolveStatus(latest?.status ?? null, latest?.email_status ?? null);
      result.set(orderId, { status, bucket: classifyDeliveryBucket(status) });
    }
    return result;
  }

  // Mirrors delivery-recovery-service.ts's getOrderDeliveryState delivery lookup exactly.
  async function detailViewDeliveryStatus(orderId) {
    const rows = (await db.query(
      `select a.status, a.authorised_at, e.status as email_status
       from public.report_delivery_authorizations a
       left join public.email_events e on e.id = a.email_event_id
       where a.order_id = $1 order by a.authorised_at desc`, [orderId]
    )).rows;
    const latest = rows[0] ?? null;
    const status = resolveStatus(latest?.status ?? null, latest?.email_status ?? null);
    return { status, bucket: classifyDeliveryBucket(status) };
  }

  // --- Scenario 1: finalized -> delivered in both views ---
  const finalizedFixture = await makeOrderWithReadyReport();
  await makeAuthorization(finalizedFixture, 'finalized');

  // --- Scenario 2: pending (dispatching) -> delivery_pending in both views ---
  const pendingFixture = await makeOrderWithReadyReport();
  await makeAuthorization(pendingFixture, 'dispatching');

  // --- Scenario 3: bounced / complained Release C delivery remains a visible exception ---
  const bouncedFixture = await makeOrderWithReadyReport();
  const bouncedEventId = await makeAuthorization(bouncedFixture, 'finalized');
  await bounceOrComplain(bouncedEventId, 'bounced');

  const complainedFixture = await makeOrderWithReadyReport();
  const complainedEventId = await makeAuthorization(complainedFixture, 'finalized');
  await bounceOrComplain(complainedEventId, 'complained');

  // --- Scenario 4/6: a legacy delivery record must not override, and must not double-count
  // against, a real authorization -- a finalized authorization coexists with a legacy row
  // claiming the opposite outcome (DELIVERY_FAILED).
  const legacyConflictFixture = await makeOrderWithReadyReport();
  await makeAuthorization(legacyConflictFixture, 'finalized');
  await makeLegacyAttempt(legacyConflictFixture.orderId, legacyConflictFixture.reportId, 'DELIVERY_FAILED');

  // --- Scenario 5: a legacy-only order (manual_report_delivery_attempts row, no
  // report_delivery_authorizations row at all) must still show its legacy history, and must not
  // be miscounted as any real-delivery bucket.
  const legacyOnlyFixture = await makeOrderWithReadyReport();
  await makeLegacyAttempt(legacyOnlyFixture.orderId, legacyOnlyFixture.reportId, 'DELIVERED');

  const allFixtures = {
    finalized: finalizedFixture, pending: pendingFixture, bounced: bouncedFixture,
    complained: complainedFixture, legacyConflict: legacyConflictFixture, legacyOnly: legacyOnlyFixture
  };
  const allOrderIds = Object.values(allFixtures).map((f) => f.orderId);
  const listResults = await listViewDeliveryStatus(allOrderIds);

  console.log('Scenario 1: finalized -> delivered, identical in list and detail views');
  {
    const list = listResults.get(finalizedFixture.orderId);
    const detail = await detailViewDeliveryStatus(finalizedFixture.orderId);
    assert.equal(list.bucket, 'delivered'); assert.equal(detail.bucket, 'delivered');
    assert.deepEqual(list, detail, 'list and detail views must agree exactly');
    ok(true, 'finalized authorization -> "delivered" in both the admin list and the order-detail primary summary');
  }

  console.log('Scenario 2: pending (dispatching) -> delivery_pending, identical in both views');
  {
    const list = listResults.get(pendingFixture.orderId);
    const detail = await detailViewDeliveryStatus(pendingFixture.orderId);
    assert.equal(list.bucket, 'delivery_pending'); assert.equal(detail.bucket, 'delivery_pending');
    assert.deepEqual(list, detail);
    ok(true, 'dispatching authorization -> "delivery_pending" in both the admin list and the order-detail primary summary');
  }

  console.log('Scenario 3: bounced/complained Release C delivery remains a visible exception, not "delivered"');
  {
    const listBounced = listResults.get(bouncedFixture.orderId);
    const detailBounced = await detailViewDeliveryStatus(bouncedFixture.orderId);
    assert.equal(listBounced.status, 'bounced', 'raw status is preserved as "bounced", not relabelled generically');
    assert.equal(listBounced.bucket, 'delivery_failed');
    assert.deepEqual(listBounced, detailBounced);
    ok(true, 'a finalized send that later bounced shows as "bounced" / delivery_failed, in both views, never "delivered"');

    const listComplained = listResults.get(complainedFixture.orderId);
    const detailComplained = await detailViewDeliveryStatus(complainedFixture.orderId);
    assert.equal(listComplained.status, 'complained');
    assert.equal(listComplained.bucket, 'delivery_failed');
    assert.deepEqual(listComplained, detailComplained);
    ok(true, 'a finalized send later marked as spam shows as "complained" / delivery_failed, in both views, never "delivered"');
  }

  console.log('Scenario 4: a legacy delivery record does not override a current Release C authorization');
  {
    const list = listResults.get(legacyConflictFixture.orderId);
    const detail = await detailViewDeliveryStatus(legacyConflictFixture.orderId);
    assert.equal(list.status, 'finalized', 'the real status is the authorization\'s own status, unaffected by the legacy DELIVERY_FAILED row');
    assert.equal(list.bucket, 'delivered');
    assert.deepEqual(list, detail);
    const legacyRow = (await db.query(`select status from public.manual_report_delivery_attempts where order_id = $1`, [legacyConflictFixture.orderId])).rows[0];
    assert.equal(legacyRow.status, 'DELIVERY_FAILED', 'the legacy row itself is untouched and still independently readable');
    ok(true, 'a contradictory legacy manual_report_delivery_attempts row never overrides the real, finalized Release C status');
  }

  console.log('Scenario 5: a legacy-only order still shows its legacy delivery history');
  {
    const legacyRows = (await db.query(`select status from public.manual_report_delivery_attempts where order_id = $1`, [legacyOnlyFixture.orderId])).rows;
    assert.equal(legacyRows.length, 1);
    assert.equal(legacyRows[0].status, 'DELIVERED');
    ok(true, 'the legacy-only order\'s manual_report_delivery_attempts row is still present and queryable (drives the "Legacy manual delivery history" section)');

    const list = listResults.get(legacyOnlyFixture.orderId);
    const detail = await detailViewDeliveryStatus(legacyOnlyFixture.orderId);
    assert.equal(list.bucket, 'not_ready', 'no report_delivery_authorizations row exists, so the real bucket is "not_ready", regardless of the legacy row saying DELIVERED');
    assert.deepEqual(list, detail);
    ok(true, 'a legacy-only order is correctly "not_ready" for real delivery -- the legacy DELIVERED status is never read as real delivery');
  }

  console.log('Scenario 6: records in both systems are not double-counted');
  {
    const buckets = { delivery_pending: [], delivered: [], delivery_failed: [], not_ready: [] };
    for (const [orderId, entry] of listResults) buckets[entry.bucket].push(orderId);
    const allBucketed = Object.values(buckets).flat();
    assert.equal(new Set(allBucketed).size, allBucketed.length, 'no order appears in more than one bucket');
    assert.equal(allBucketed.length, allOrderIds.length, 'every order is classified into exactly one bucket');
    ok(true, `${allOrderIds.length} orders partition cleanly across buckets with no double-counting: ` +
      Object.entries(buckets).map(([k, v]) => `${k}=${v.length}`).join(', '));
  }

  console.log('\nAll live-DB order-detail delivery-truth checks passed.');
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

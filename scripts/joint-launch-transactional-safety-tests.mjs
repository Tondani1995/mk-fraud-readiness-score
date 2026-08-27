/**
 * Joint-launch transactional safety proofs, against a real disposable Postgres.
 *
 * Three things a static read of the code cannot establish, proved here by executing them:
 *
 *   A. CONCURRENCY. Two genuinely simultaneous Comprehensive order attempts for one assessment,
 *      on two separate connections in two separate transactions, produce exactly ONE live order
 *      and no legacy reviewed engagement.
 *
 *   B. COMPENSATION. The evidence-orphan alert path exists, accepts only safe identifiers, and is
 *      reachable through the category allow-list.
 *
 *   C. VERSION-SKEW / CATALOGUE SAFETY. A stale application cannot create a mispriced order because
 *      the database transactional primitive verifies the application's expected product/code/
 *      amount/currency against the authoritative current price version. RC1 operational gating is
 *      intentionally retired; its compatibility seam remains a no-op.
 */

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
const migrationsDir = path.join(root, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();

const port = 57100 + ((process.pid + 149) % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-launch-txn-pg-'));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false
});

let checks = 0;
function check(label) {
  checks += 1;
  console.log(`  ok - ${label}`);
}

function connect() {
  return new pg.default.Client({
    host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb'
  });
}

console.log('Booting disposable Postgres for the joint-launch transactional safety proofs...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');

const db = connect();
await db.connect();

const extraClients = [];
let failure = null;

try {
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create schema if not exists storage;
    create schema if not exists vault;
    create schema if not exists supabase_migrations;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz
    );
    create table if not exists storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text, owner uuid, metadata jsonb, user_metadata jsonb
    );
    alter table storage.objects enable row level security;
  `);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`);
  }
  await db.query('grant usage on schema public to anon, authenticated, service_role');

  for (const name of migrationFiles) {
    try {
      await db.query(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
    } catch (error) {
      throw new Error(`migration ${name} failed to replay: ${error.message}`);
    }

    if (name === '20260821090000_adaptive_v1_2_staging_activation.sql') {
      // The historical activation migration delegates V1.2 graph/scale registration to the
      // reviewed runtime RPC seam. Reproduce that seam here, as in the canonical replay, so the
      // forward correction is tested against the same historical 0-based rows before it runs.
      const v12GraphJson = fs.readFileSync(
        path.join(root, 'docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json'),
        'utf8',
      );
      await db.query(
        `select public.publish_adaptive_graph_version('MFRS-V1.1-ADAPTIVE-DRAFT-20260804')`,
      );
      await db.query(
        `select public.register_adaptive_staging_candidate($1::jsonb)`,
        [v12GraphJson],
      );
      const initialV12Scale = await db.query(
        `select string_agg(display_order::text, ',' order by response_value) as display_orders
         from public.response_scale
         where methodology_version_id = (
           select methodology_version_id
           from public.adaptive_graph_versions
           where graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
         )`,
      );
      assert.equal(
        initialV12Scale.rows[0].display_orders,
        '0,1,2,3,4,5',
        'historical V1.2 activation must create 0-based response-scale rows before correction',
      );
      check('historical V1.2 activation seam created the expected 0-based response scale');
    }
  }
  check(`all ${migrationFiles.length} migrations replayed`);

  const finalV12Scale = await db.query(
    `select string_agg(display_order::text, ',' order by response_value) as display_orders
     from public.response_scale
     where methodology_version_id = (
       select methodology_version_id
       from public.adaptive_graph_versions
       where graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
     )`,
  );
  assert.equal(
    finalV12Scale.rows[0].display_orders,
    '1,2,3,4,5,6',
    'forward V1.2 response-scale correction must produce 1-based display order',
  );
  check('forward V1.2 response-scale correction changed display order to 1..6');

  // RC1 operational gating is intentionally retired by the committed compatibility migration.
  // Ordinary operations now rely on authentication, RLS, private storage, webhook verification
  // and route authorisation; the old function remains only as a harmless compatibility seam.
  const retiredFreezeTriggers = await db.query(
    `select n.nspname as schema_name, c.relname as relation_name
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and t.tgname = 'trg_rc1_operation_freeze'
       and not t.tgisinternal`
  );
  assert.equal(retiredFreezeTriggers.rows.length, 0, 'RC1 operational freeze triggers must be retired');
  check('RC1 operational gating is retired: zero non-internal public freeze triggers remain');

  const compatibilityFunction = await db.query(
    `select to_regprocedure('public.rc1_require_operation_open(text)') is not null as present`
  );
  assert.equal(compatibilityFunction.rows[0].present, true, 'the RC1 compatibility seam must remain present');
  await db.query(`select public.rc1_require_operation_open('assessment_write')`);
  check('the retired RC1 compatibility seam exists and does not block ordinary operation');

  const orgId = (await db.query(
    `insert into public.organisations (legal_name) values ('Txn Safety Org') returning id`
  )).rows[0].id;
  const methodologyId = (await db.query(`select id from public.methodology_versions limit 1`)).rows[0].id;

  async function newAssessment(reference) {
    return (await db.query(
      `insert into public.assessments (assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
       values ($1, $2, $3, 'scored', now()) returning id`,
      [reference, orgId, methodologyId]
    )).rows[0].id;
  }

  // ---------------------------------------------------------------------------------------------
  // A. CONCURRENCY
  // ---------------------------------------------------------------------------------------------
  const raceAssessmentId = await newAssessment('MKFRS-TXN-RACE-0001');

  const clientA = connect();
  const clientB = connect();
  extraClients.push(clientA, clientB);
  await clientA.connect();
  await clientB.connect();

  await clientA.query('begin');
  await clientB.query('begin');

  const callComprehensive = (client) => client.query(
    `select public.create_paid_order('comprehensive', $1, 'mk_validated_assessment', 3500000, 'ZAR') as result`,
    [raceAssessmentId]
  );

  // A starts and takes the assessment lock. B then issues the same call and must block on that lock
  // rather than racing past it -- which is precisely the defect being fixed.
  const resultA = await callComprehensive(clientA);
  const pendingB = callComprehensive(clientB);

  // B must still be waiting while A holds the lock.
  const bSettledEarly = await Promise.race([
    pendingB.then(() => true, () => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 400))
  ]);
  assert.equal(bSettledEarly, false, 'the second concurrent attempt must block on the assessment lock, not race it');
  check('a concurrent Comprehensive attempt blocks on the assessment row lock instead of racing');

  await clientA.query('commit');
  const resultB = await pendingB;
  await clientB.query('commit');

  const a = resultA.rows[0].result;
  const b = resultB.rows[0].result;

  assert.equal(a.created, true, 'the first caller creates the order');
  assert.equal(b.created, false, 'the second caller must NOT create a second order');
  assert.equal(a.order_id, b.order_id, 'the loser must resolve to the winner’s order');
  assert.equal(a.engagement_id, null, 'the active Comprehensive path must not create a reviewed engagement');
  assert.equal(b.engagement_id, null, 'the active Comprehensive reuse path must not create a reviewed engagement');
  assert.equal(a.engagement_state, null, 'the active Comprehensive path must return no engagement state');
  assert.equal(b.engagement_state, null, 'the active Comprehensive reuse path must return no engagement state');
  check('two concurrent Comprehensive attempts yield exactly one order and no reviewed engagement');

  const raceOrders = await db.query(
    `select count(*)::int as n
     from public.orders o
     join public.products p on p.id = o.product_id
     where o.assessment_id = $1
       and p.product_code = 'mk_validated_assessment'
       and o.status::text <> 'cancelled'`,
    [raceAssessmentId]
  );
  assert.equal(raceOrders.rows[0].n, 1);
  const raceLegacyRows = await db.query(
    `select
       (select count(*)::int
        from public.comprehensive_engagements e
        join public.orders o on o.id = e.order_id
        join public.products p on p.id = o.product_id
        where e.assessment_id = $1 and p.product_code = 'mk_validated_assessment') as legacy_engagements,
       (select count(*)::int
        from public.comprehensive_engagement_events e
        join public.comprehensive_engagements g on g.id = e.engagement_id
        join public.orders o on o.id = g.order_id
        join public.products p on p.id = o.product_id
        where g.assessment_id = $1
          and p.product_code = 'mk_validated_assessment'
          and e.event_type = 'engagement_created') as legacy_created_events`,
    [raceAssessmentId]
  );
  assert.equal(raceLegacyRows.rows[0].legacy_engagements, 0);
  assert.equal(raceLegacyRows.rows[0].legacy_created_events, 0);
  check('exactly one non-cancelled Comprehensive order exists and the active path created no legacy engagement');

  // The order and its authoritative creation trail committed in one transaction.
  const trail = await db.query(
    `select
       (select count(*)::int from public.order_events oe
        where oe.order_id = $1 and oe.event_type = 'order_created_from_report_request') as order_events,
       (select count(*)::int from public.audit_logs al
        where al.entity_id = $1 and al.action = 'paid_order_created') as audit_rows,
       (select count(*)::int from public.audit_logs al
        where al.entity_id = $1
          and al.action = 'paid_order_created'
          and al.after_json->>'reviewed_engagement_created' = 'false') as no_reviewed_engagement_metadata`,
    [a.order_id]
  );
  assert.equal(trail.rows[0].order_events, 1);
  assert.equal(trail.rows[0].audit_rows, 1);
  assert.equal(trail.rows[0].no_reviewed_engagement_metadata, 1);
  check('the order and full creation trail committed in one transaction, exactly once, with no reviewed engagement');

  // A cancelled active Comprehensive order releases the assessment for a genuinely new order.
  await db.query(
    `update public.orders set status = 'cancelled' where id = $1`,
    [a.order_id]
  );
  const afterCancellation = (await db.query(
    `select public.create_paid_order('comprehensive', $1, 'mk_validated_assessment', 3500000, 'ZAR') as result`,
    [raceAssessmentId]
  )).rows[0].result;
  assert.equal(afterCancellation.created, true);
  assert.notEqual(afterCancellation.order_id, a.order_id);
  assert.equal(afterCancellation.engagement_id, null);
  assert.equal(afterCancellation.engagement_state, null);
  check('a cancelled Comprehensive order frees the assessment for a new order without a reviewed engagement');

  // Essential is idempotent per report request rather than creating duplicates.
  const essentialAssessmentId = await newAssessment('MKFRS-TXN-ESS-0001');
  const requestId = (await db.query(
    `insert into public.data_requests (assessment_id, organisation_id, request_type, status)
     values ($1, $2, 'detailed_report_request', 'received') returning id`,
    [essentialAssessmentId, orgId]
  )).rows[0].id;

  const essentialFirst = (await db.query(
    `select public.create_paid_order('essential', $1, 'essential_self_assessment', 750000, 'ZAR', $2) as result`,
    [essentialAssessmentId, requestId]
  )).rows[0].result;
  const essentialSecond = (await db.query(
    `select public.create_paid_order('essential', $1, 'essential_self_assessment', 750000, 'ZAR', $2) as result`,
    [essentialAssessmentId, requestId]
  )).rows[0].result;
  assert.equal(essentialFirst.created, true);
  assert.equal(essentialSecond.created, false);
  assert.equal(essentialFirst.order_id, essentialSecond.order_id);
  assert.equal(essentialFirst.amount_cents, 750000);
  assert.ok(essentialFirst.product_price_version_id, 'the Essential order must be bound to a price version');
  check('Essential uses the same primitive and stays idempotent per report request');

  const essentialEntitled = await db.query(
    `select public.order_price_version_entitled($1) as entitled`, [essentialFirst.order_id]
  );
  assert.equal(essentialEntitled.rows[0].entitled, true);
  check('every order the primitive creates is entitled under the versioned price contract');

  // ---------------------------------------------------------------------------------------------
  // C. VERSION-SKEW / CATALOGUE SAFETY. A stale application contract is refused, so no mispriced
  // order can be written against the authoritative current price version.
  // ---------------------------------------------------------------------------------------------
  const staleAssessmentId = await newAssessment('MKFRS-TXN-STALE-0001');
  const staleAttempt = await db
    .query(
      `select public.create_paid_order('essential', $1, 'essential_self_assessment', 500000, 'ZAR')`,
      [staleAssessmentId]
    )
    .then(() => null, (error) => error);
  assert.ok(staleAttempt, 'a stale R5,000 contract must be refused');
  assert.match(String(staleAttempt.message), /paid_order_catalogue_contract_mismatch/);
  check('a stale R5,000 deployment is refused: paid_order_catalogue_contract_mismatch');

  const staleOrders = await db.query(
    `select count(*)::int as n from public.orders where assessment_id = $1`, [staleAssessmentId]
  );
  assert.equal(staleOrders.rows[0].n, 0);
  check('the refused stale attempt wrote nothing at all -- no partial order');

  for (const [tier, code, amount, label] of [
    ['comprehensive', 'mk_validated_assessment', 5000000, 'the superseded R50,000 Comprehensive price'],
    ['essential', 'essential_self_assessment', 999999, 'an invented Essential price'],
    ['advisory', 'essential_self_assessment', 750000, 'the Advisory tier']
  ]) {
    const rejected = await db
      .query(
        `select public.create_paid_order($1, $2, $3, $4, 'ZAR')`,
        [tier, await newAssessment(`MKFRS-TXN-REJ-${amount}-${tier}`), code, amount]
      )
      .then(() => null, (error) => error);
    assert.ok(rejected, `${label} must be refused`);
  }
  check('the primitive refuses a superseded price, an invented price and the Advisory tier');

  // ---------------------------------------------------------------------------------------------
  // B. EVIDENCE ORPHAN ALERT
  // ---------------------------------------------------------------------------------------------
  const alertDef = (await db.query(
    `select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'record_phase14_operational_alert'`
  )).rows[0].def;
  assert.match(alertDef, /comprehensive_evidence_orphan_object/);
  for (const preserved of [
    'report_download_object_missing', 'report_download_object_size_invalid',
    'report_download_checksum_mismatch', 'report_email_checksum_mismatch',
    'report_temporary_object_cleanup_failed', 'storage_cleanup_verification_failed'
  ]) {
    assert.ok(alertDef.includes(preserved), `existing alert category ${preserved} must survive`);
  }
  check('the evidence-orphan alert category exists and no existing category was dropped');

  // phase14_operational_alerts is an independently audited alert surface. RC1 operational gating
  // is retired, so no obsolete freeze-trigger manipulation is needed to exercise it here.
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  const alertId = (await db.query(
    `select public.record_phase14_operational_alert(
       'comprehensive_evidence_orphan:comprehensive-evidence:org/MKORD-1/evidence.pdf',
       'comprehensive_evidence_orphan_object', null, null,
       jsonb_build_object('bucket','comprehensive-evidence','storage_path','org/MKORD-1/evidence.pdf','reason','evidence_row_insert_failed_and_object_cleanup_failed'),
       'warning') as id`
  )).rows[0].id;
  assert.ok(alertId);
  const alertRow = (await db.query(
    `select category, severity, status, detail_json from public.phase14_operational_alerts where id = $1`, [alertId]
  )).rows[0];
  assert.equal(alertRow.category, 'comprehensive_evidence_orphan_object');
  assert.equal(alertRow.status, 'open');
  // Only safe identifiers may reach an alert payload.
  const detailKeys = Object.keys(alertRow.detail_json).sort();
  assert.deepEqual(detailKeys, ['bucket', 'reason', 'storage_path']);
  for (const key of ['customer_email', 'customer_name', 'signed_url', 'url', 'token']) {
    assert.equal(key in alertRow.detail_json, false, `${key} must never appear in an alert payload`);
  }
  check('an evidence-orphan alert records only bucket, path and reason -- no customer identity, no URL');

  const rejectedCategory = await db
    .query(
      `select public.record_phase14_operational_alert('k', 'not_a_real_category', null, null, '{}'::jsonb, 'warning')`
    )
    .then(() => null, (error) => error);
  assert.ok(rejectedCategory);
  assert.match(String(rejectedCategory.message), /phase14_alert_category_invalid/);
  check('the alert category allow-list is still closed');

  console.log(`\njoint-launch transactional safety: ${checks} checks passed.`);
} catch (error) {
  failure = error;
} finally {
  for (const client of extraClients) await client.end().catch(() => {});
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

if (failure) {
  console.error('\njoint-launch transactional safety FAILED');
  console.error(failure);
  process.exit(1);
}

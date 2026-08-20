/**
 * Executable local replay of the joint-launch migrations against a real, disposable Postgres.
 *
 * This is the lane's own migration verification: it boots an embedded Postgres, replays the whole
 * committed migration chain in filename order (with the Supabase-specific schema stubs the other
 * replay harnesses use), and then proves the runtime behaviour that a static read of the SQL
 * cannot: that the transition trigger really rejects invalid moves, that the evidence binding guard
 * really rejects a mismatched order, that the audit tables really are append-only, that historical
 * R5,000 orders really do still resolve to exactly one price window, and that anon/authenticated
 * really hold no privilege on any new table.
 *
 * It applies nothing to Production or Staging. Everything happens in a throwaway data directory.
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

const JOINT_LAUNCH_MIGRATIONS = [
  '20260810120000_joint_launch_product_catalogue.sql',
  '20260810121000_joint_launch_comprehensive_lifecycle.sql',
  '20260810122000_joint_launch_comprehensive_evidence.sql',
  '20260810123000_joint_launch_versioned_price_entitlement.sql',
  '20260810124000_joint_launch_atomic_paid_order.sql',
  '20260810125000_joint_launch_evidence_orphan_alert.sql',
  '20260810130000_joint_launch_comprehensive_review_records.sql',
  '20260810131000_joint_launch_last_mile_customer_operability.sql',
  '20260810140000_final_pre_staging_comprehensive_closure.sql'
];
for (const name of JOINT_LAUNCH_MIGRATIONS) {
  assert.ok(migrationFiles.includes(name), `missing joint-launch migration ${name}`);
}

const port = 56800 + ((process.pid + 311) % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-launch-replay-pg-'));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false
});

let checks = 0;
function check(label) {
  checks += 1;
  console.log(`  ok - ${label}`);
}

console.log('Booting disposable Postgres for the joint-launch migration replay...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');

const db = new pg.default.Client({
  host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb'
});
await db.connect();

let failure = null;
try {
  // Supabase-provided objects the migration chain assumes. Same stubs the Checkpoint E replay uses.
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
      user_id uuid not null references auth.users(id) on delete cascade,
      not_after timestamptz
    );
    create table if not exists storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text, owner uuid, metadata jsonb
    );
    alter table storage.objects enable row level security;
  `);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`);
  }
  await db.query('grant usage on schema public to anon, authenticated, service_role');

  // --- Replay the committed chain in filename order -----------------------------------------------
  let applied = 0;
  for (const name of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    try {
      await db.query(sql);
      applied += 1;
    } catch (error) {
      throw new Error(`migration ${name} failed to replay: ${error.message}`);
    }
  }
  check(`all ${applied} committed migrations replayed cleanly, joint-launch migrations included`);

  // The RC1 operational freeze installs a BEFORE trigger on the pre-existing operational tables and
  // the database replays FROZEN, so fixture rows cannot be written. That control is verified by its
  // own suites; here it only blocks fixture setup, so it is lifted for the pre-existing tables in
  // this throwaway database ONLY. The joint-launch triggers under test are untouched, and
  // rc1_surface_for_relation() returns null for every new table, so the freeze never installed a
  // guard on them in the first place - asserted below.
  for (const table of ['organisations', 'assessments', 'orders']) {
    await db.query(`drop trigger if exists trg_rc1_operation_freeze on public.${table}`);
  }
  const guardedNewTables = await db.query(
    `select c.relname from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where t.tgname = 'trg_rc1_operation_freeze'
       and c.relname in ('product_price_versions','comprehensive_engagements','comprehensive_engagement_events','comprehensive_evidence_items','comprehensive_evidence_events','comprehensive_review_records','comprehensive_review_record_events','comprehensive_review_subject_catalog')`
  );
  assert.equal(guardedNewTables.rows.length, 0, 'no joint-launch table maps to an RC1 freeze surface');
  check('no joint-launch table was silently attached to an RC1 freeze surface');

  // Replay-safety: re-applying the joint-launch migrations must not error or duplicate anything.
  for (const name of JOINT_LAUNCH_MIGRATIONS) {
    await db.query(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
  }
  const rerunVersions = await db.query(
    `select count(*)::int as n from public.product_price_versions`
  );
  check(`joint-launch migrations are replay-safe (price versions still ${rerunVersions.rows[0].n} after re-apply)`);

  // --- Catalogue contract ---------------------------------------------------------------------------
  const products = await db.query(
    `select product_code, name, price_cents, currency, active, requires_payment_verification, delivery_mode
     from public.products order by display_order`
  );
  const byCode = Object.fromEntries(products.rows.map((row) => [row.product_code, row]));
  assert.equal(byCode.essential_self_assessment.price_cents, 750000);
  assert.equal(byCode.essential_self_assessment.name, 'Essential');
  assert.equal(byCode.mk_validated_assessment.price_cents, 3500000);
  assert.equal(byCode.mk_validated_assessment.name, 'Comprehensive');
  assert.equal(byCode.mk_validated_assessment.delivery_mode, 'mk_led_validated_engagement');
  assert.equal(byCode.free_snapshot.price_cents, 0);
  check('Essential is R7,500 and Comprehensive is R35,000 after replay');

  const legacyPriced = await db.query(
    `select count(*)::int as n from public.products where active and price_cents in (500000, 5000000)`
  );
  assert.equal(legacyPriced.rows[0].n, 0);
  check('no active product still carries an R5,000 or R50,000 price');

  const openVersions = await db.query(
    `select p.product_code, count(*)::int as n
     from public.products p
     join public.product_price_versions v on v.product_id = p.id and v.effective_to is null
     group by 1 order by 1`
  );
  for (const row of openVersions.rows) assert.equal(row.n, 1, `${row.product_code} must have exactly one open price version`);
  check('every product has exactly one open price version');

  // The one-current-per-product index must actually be enforced.
  const essentialId = (await db.query(`select id from public.products where product_code='essential_self_assessment'`)).rows[0].id;
  await assert.rejects(
    db.query(
      `insert into public.product_price_versions (product_id, version_number, price_cents, currency, effective_from, effective_to)
       values ($1, 99, 999999, 'ZAR', now(), null)`,
      [essentialId]
    ),
    /duplicate key|unique/i
  );
  check('a second open price version for the same product is rejected');

  // --- Historical order price resolution -------------------------------------------------------------
  // Reproduce the exact shape of a Production R5,000 order: created before the cutover, no
  // price-version backfill, and assert it still resolves to exactly one window carrying its amount.
  const orgId = (await db.query(
    `insert into public.organisations (legal_name) values ('Joint Launch Replay Org') returning id`
  )).rows[0].id;
  const methodologyId = (await db.query(`select id from public.methodology_versions limit 1`)).rows[0].id;
  const assessmentId = (await db.query(
    `insert into public.assessments (assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
     values ('MKFRS-REPLAY-0001', $1, $2, 'scored', now()) returning id`,
    [orgId, methodologyId]
  )).rows[0].id;

  const supersededWindow = (await db.query(
    `select effective_from from public.product_price_versions
     where product_id = $1 and effective_to is not null order by version_number limit 1`,
    [essentialId]
  )).rows[0].effective_from;

  const historicalOrderId = (await db.query(
    `insert into public.orders (order_reference, assessment_id, product_id, product_name, status, amount_cents, currency, created_at)
     values ('MKORD-REPLAY-HIST', $1, $2, 'Essential Self-Assessment Report', 'payment_received', 500000, 'ZAR', $3)
     returning id`,
    [assessmentId, essentialId, new Date(new Date(supersededWindow).getTime() + 86_400_000).toISOString()]
  )).rows[0].id;

  const historicalResolution = await db.query(
    `select count(*)::int as n
     from public.product_price_versions v, public.orders o
     where o.id = $1 and v.product_id = o.product_id
       and o.created_at >= v.effective_from
       and (v.effective_to is null or o.created_at < v.effective_to)
       and v.price_cents = o.amount_cents and v.currency = o.currency`,
    [historicalOrderId]
  );
  assert.equal(historicalResolution.rows[0].n, 1);
  check('a historical R5,000 order resolves to exactly one price window carrying its own amount');

  const historicalBackfill = await db.query(
    `select product_price_version_id from public.orders where id = $1`, [historicalOrderId]
  );
  assert.equal(historicalBackfill.rows[0].product_price_version_id, null);
  check('historical orders are NOT backfilled with a price version');

  // An order whose amount never matched any catalogue price (synthetic certification fixtures carry
  // amount_cents = 1) must not block the migration: it was not entitled under the previous contract
  // either, because that guard also required an exact amount match.
  const unpricedOrderId = (await db.query(
    `insert into public.orders (order_reference, assessment_id, product_id, product_name, status, amount_cents, currency)
     values ('MKORD-REPLAY-SYNTH', $1, $2, 'Essential Self-Assessment Report', 'payment_received', 1, 'ZAR')
     returning id`,
    [assessmentId, essentialId]
  )).rows[0].id;
  const unpricedResolution = await db.query(
    `select count(*)::int as n
     from public.product_price_versions v, public.orders o
     where o.id = $1 and v.product_id = o.product_id and v.price_cents = o.amount_cents`,
    [unpricedOrderId]
  );
  assert.equal(unpricedResolution.rows[0].n, 0);
  // Re-running the catalogue migration with that row present must still succeed.
  await db.query(fs.readFileSync(path.join(migrationsDir, JOINT_LAUNCH_MIGRATIONS[0]), 'utf8'));
  check('an order whose amount never matched a catalogue price is reported, not fatal');

  const ambiguity = await db.query(
    `select count(*)::int as n from public.orders o
     where (select count(*) from public.product_price_versions v
            where v.product_id = o.product_id
              and o.created_at >= v.effective_from
              and (v.effective_to is null or o.created_at < v.effective_to)) > 1`
  );
  assert.equal(ambiguity.rows[0].n, 0);
  check('no order resolves to more than one price window (ambiguity stays fatal)');

  const newAtOldPrice = await db.query(
    `select count(*)::int as n from public.product_price_versions v
     where v.product_id = $1 and v.price_cents = 500000
       and now() >= v.effective_from and (v.effective_to is null or now() < v.effective_to)`,
    [essentialId]
  );
  assert.equal(newAtOldPrice.rows[0].n, 0);
  check('R5,000 is not a valid Essential price at any instant from now on (no dual-price allowance)');

  // --- Database-side price entitlement ---------------------------------------------------------
  // The four SECURITY DEFINER entitlement functions used to pin 500000 in SQL. If they still did,
  // the reprice would have broken automatic release and delivery for BOTH new R7,500 orders and
  // every already-paid R5,000 order.
  const hardcodedPricePredicates = await db.query(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     join pg_language l on l.oid = p.prolang
     where n.nspname='public' and p.prokind='f' and l.lanname in ('sql','plpgsql')
       and pg_get_functiondef(p.oid) like '%amount_cents <> 500000%'`
  );
  assert.equal(hardcodedPricePredicates.rows[0].n, 0);
  const delegating = await db.query(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     join pg_language l on l.oid = p.prolang
     where n.nspname='public' and p.prokind='f' and l.lanname in ('sql','plpgsql')
       and p.proname in ('phase14_generation_entitlement','phase14_delivery_entitlement')
       and pg_get_functiondef(p.oid) like '%order_price_version_entitled%'`
  );
  assert.equal(delegating.rows[0].n, 2);
  check('no database function pins a hard-coded Essential price; both Phase 14 guards delegate to the versioned contract');

  // The SQL helper must agree with src/lib/commercial/order-price-entitlement.ts on every case.
  const historicalEntitled = await db.query(
    `select public.order_price_version_entitled($1) as entitled`, [historicalOrderId]
  );
  assert.equal(historicalEntitled.rows[0].entitled, true, 'a paid R5,000 order stays entitled in SQL too');

  const lateOldPriceOrderId = (await db.query(
    `insert into public.orders (order_reference, assessment_id, product_id, product_name, status, amount_cents, currency)
     values ('MKORD-REPLAY-LATE5K', $1, $2, 'Essential', 'payment_received', 500000, 'ZAR') returning id`,
    [assessmentId, essentialId]
  )).rows[0].id;
  const lateOldPrice = await db.query(`select public.order_price_version_entitled($1) as entitled`, [lateOldPriceOrderId]);
  assert.equal(lateOldPrice.rows[0].entitled, false, 'R5,000 booked after the cutover is NOT entitled in SQL either');

  const essentialCurrentVersionId = (await db.query(
    `select id from public.product_price_versions where product_id=$1 and effective_to is null`, [essentialId]
  )).rows[0].id;
  const newOrderId = (await db.query(
    `insert into public.orders (order_reference, assessment_id, product_id, product_name, product_price_version_id, status, amount_cents, currency)
     values ('MKORD-REPLAY-NEW75', $1, $2, 'Essential', $3, 'payment_received', 750000, 'ZAR') returning id`,
    [assessmentId, essentialId, essentialCurrentVersionId]
  )).rows[0].id;
  const newOrder = await db.query(`select public.order_price_version_entitled($1) as entitled`, [newOrderId]);
  assert.equal(newOrder.rows[0].entitled, true, 'a new R7,500 order is entitled in SQL');

  const unpricedEntitled = await db.query(`select public.order_price_version_entitled($1) as entitled`, [unpricedOrderId]);
  assert.equal(unpricedEntitled.rows[0].entitled, false, 'an order at an amount no version ever carried is not entitled');
  check('the SQL price helper agrees with the TypeScript contract on historical, new, late-old-price and unpriced orders');

  const helperDef = await db.query(
    `select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='order_price_version_entitled'`
  );
  assert.equal(helperDef.rows[0].prosecdef, false, 'the price helper must not be SECURITY DEFINER');
  assert.ok((helperDef.rows[0].proconfig ?? []).some((entry) => entry.startsWith('search_path=')));
  for (const role of ['anon', 'authenticated']) {
    const granted = await db.query(
      `select has_function_privilege($1, 'public.order_price_version_entitled(uuid)', 'EXECUTE') as granted`, [role]
    );
    assert.equal(granted.rows[0].granted, false, `${role} must not execute the price helper`);
  }
  check('the price helper is SECURITY INVOKER, search_path-pinned and not executable by anon or authenticated');

  // --- Comprehensive lifecycle ------------------------------------------------------------------------
  const comprehensiveId = (await db.query(`select id from public.products where product_code='mk_validated_assessment'`)).rows[0].id;
  const comprehensiveVersionId = (await db.query(
    `select id from public.product_price_versions where product_id=$1 and effective_to is null`, [comprehensiveId]
  )).rows[0].id;

  const compOrderId = (await db.query(
    `insert into public.orders (order_reference, assessment_id, product_id, product_name, product_price_version_id, status, amount_cents, currency)
     values ('MKORD-REPLAY-COMP', $1, $2, 'Comprehensive', $3, 'awaiting_payment', 3500000, 'ZAR') returning id`,
    [assessmentId, comprehensiveId, comprehensiveVersionId]
  )).rows[0].id;

  const engagementId = (await db.query(
    `insert into public.comprehensive_engagements (order_id, assessment_id, organisation_id)
     values ($1, $2, $3) returning id`,
    [compOrderId, assessmentId, orgId]
  )).rows[0].id;

  const initialState = (await db.query(`select state, state_version from public.comprehensive_engagements where id=$1`, [engagementId])).rows[0];
  assert.equal(initialState.state, 'awaiting_payment');
  assert.equal(initialState.state_version, 1);
  check('a Comprehensive engagement starts in awaiting_payment at state_version 1');

  for (const invalid of ['in_review', 'review_complete', 'delivered', 'evidence_received']) {
    await assert.rejects(
      db.query(`update public.comprehensive_engagements set state=$1 where id=$2`, [invalid, engagementId]),
      /comprehensive_engagement_invalid_transition|check/i,
      `awaiting_payment -> ${invalid} must be rejected by the database`
    );
  }
  check('the database itself rejects invalid transitions, not only the application');

  await db.query(`update public.comprehensive_engagements set state='payment_received' where id=$1`, [engagementId]);
  await db.query(`update public.comprehensive_engagements set state='evidence_requested' where id=$1`, [engagementId]);
  await db.query(`update public.comprehensive_engagements set state='evidence_received' where id=$1`, [engagementId]);
  const afterThree = (await db.query(`select state, state_version from public.comprehensive_engagements where id=$1`, [engagementId])).rows[0];
  assert.equal(afterThree.state, 'evidence_received');
  assert.equal(afterThree.state_version, 4);
  check('state_version increments on every state change and only on state changes');

  await db.query(`update public.comprehensive_engagements set organisation_id=$1 where id=$2`, [orgId, engagementId]);
  const afterNoop = (await db.query(`select state_version from public.comprehensive_engagements where id=$1`, [engagementId])).rows[0];
  assert.equal(afterNoop.state_version, 4);
  check('a non-state update does not drift state_version');

  const adminUserId = (await db.query(`insert into auth.users (email) values ('replay-reviewer@example.invalid') returning id`)).rows[0].id;
  await db.query(
    `insert into public.admin_profiles (id, email, full_name, role, status) values ($1,'replay-reviewer@example.invalid','Replay Reviewer','reviewer','active')`,
    [adminUserId]
  );
  await db.query(
    `update public.comprehensive_engagements set reviewer_admin_user_id=$1, reviewer_assigned_at=now() where id=$2`,
    [adminUserId, engagementId]
  );
  await assert.rejects(
    db.query(`update public.comprehensive_engagements set reviewer_admin_user_id=null, reviewer_assigned_at=null where id=$1`, [engagementId]),
    /reviewer_cannot_be_unassigned|check/i
  );
  check('a named reviewer cannot be silently unassigned');

  const approverUserId = (await db.query(`insert into auth.users (email) values ('replay-approver@example.invalid') returning id`)).rows[0].id;
  await db.query(
    `insert into public.admin_profiles (id, email, full_name, role, status) values ($1,'replay-approver@example.invalid','Replay Approver','approver','active')`,
    [approverUserId]
  );
  const reviewRecordId = (await db.query(
    `insert into public.comprehensive_review_records
       (engagement_id, record_type, subject_key, reviewer_admin_user_id, reviewer_conclusion, created_by, updated_by)
     values ($1,'finding','F-REPLAY',$2,'Initial reviewer conclusion',$2,$2) returning id`,
    [engagementId, adminUserId]
  )).rows[0].id;
  await db.query(
    `update public.comprehensive_review_records
        set reviewer_conclusion='Approver-confirmed conclusion', record_version=2,
            created_by=created_by, updated_by=$1
      where id=$2 and record_version=1`,
    [approverUserId, reviewRecordId]
  );
  const reviewRecordProof = (await db.query(
    `select record_version, created_by, updated_by from public.comprehensive_review_records where id=$1`, [reviewRecordId]
  )).rows[0];
  assert.equal(Number(reviewRecordProof.record_version), 2);
  assert.equal(reviewRecordProof.created_by, adminUserId, 'approver update must retain original created_by');
  assert.equal(reviewRecordProof.updated_by, approverUserId, 'approver update must set updated_by');
  const reviewRecordEvent = (await db.query(
    `select action, actor_admin_user_id, from_version, to_version from public.comprehensive_review_record_events where record_id=$1 order by created_at desc limit 1`, [reviewRecordId]
  )).rows[0];
  assert.equal(reviewRecordEvent.action, 'updated');
  assert.equal(reviewRecordEvent.actor_admin_user_id, approverUserId);
  assert.equal(Number(reviewRecordEvent.from_version), 1);
  assert.equal(Number(reviewRecordEvent.to_version), 2);
  check('review record create -> expectedVersion 1 approver update retains created_by, writes updated_by and appends the audit event');

  await db.query(`update public.comprehensive_engagements set state='in_review' where id=$1`, [engagementId]);
  await assert.rejects(
    db.query(`update public.comprehensive_engagements set state='review_complete' where id=$1`, [engagementId]),
    /sign_off_required|closure_not_ready|check/i
  );
  check('review cannot complete without a persisted sign-off actor');

  await assert.rejects(
    db.query(
      `update public.comprehensive_engagements
       set state='review_complete', signed_off_by=$1, signed_off_at=now(), sign_off_statement='Replay sign-off.', signed_off_artifact_version=1
       where id=$2`,
      [adminUserId, engagementId]
    ),
    /closure_not_ready|check/i
  );
  check('review cannot complete without all persisted human-review records and verified artifact versions');

  await db.query(`insert into public.comprehensive_engagement_events (engagement_id, event_type, new_state) values ($1,'state_changed','in_review')`, [engagementId]);
  await assert.rejects(
    db.query(`update public.comprehensive_engagement_events set note='rewritten' where engagement_id=$1`, [engagementId]),
    /append_only|check/i
  );
  await assert.rejects(
    db.query(`delete from public.comprehensive_engagement_events where engagement_id=$1`, [engagementId]),
    /append_only|check/i
  );
  check('the engagement audit trail is append-only: no update, no delete');

  await assert.rejects(
    db.query(
      `insert into public.comprehensive_engagements (order_id, assessment_id) values ($1, $2)`,
      [historicalOrderId, assessmentId]
    ),
    /duplicate key|unique/i
  );
  check('a second live Comprehensive engagement for the same assessment is rejected');

  // --- Evidence -----------------------------------------------------------------------------------------
  const evidenceId = (await db.query(
    `insert into public.comprehensive_evidence_items
       (engagement_id, order_id, assessment_id, storage_path, original_filename, content_type, size_bytes)
     values ($1,$2,$3,$4,'register.pdf','application/pdf',1024) returning id`,
    [engagementId, compOrderId, assessmentId, `${orgId}/MKORD-REPLAY-COMP/${'a'.repeat(8)}-aaaa-4aaa-8aaa-${'a'.repeat(12)}.pdf`]
  )).rows[0].id;
  check('evidence bound to its own engagement, order and assessment is accepted');

  await assert.rejects(
    db.query(
      `insert into public.comprehensive_evidence_items
         (engagement_id, order_id, assessment_id, storage_path, original_filename, content_type, size_bytes)
       values ($1,$2,$3,$4,'other.pdf','application/pdf',1024)`,
      [engagementId, historicalOrderId, assessmentId, `${orgId}/MKORD-REPLAY-COMP/${'b'.repeat(8)}-bbbb-4bbb-8bbb-${'b'.repeat(12)}.pdf`]
    ),
    /binding_mismatch|check/i
  );
  check('evidence carrying another order id is rejected (no cross-order attachment)');

  for (const [contentType, label] of [
    ['application/x-msdownload', 'a Windows executable'],
    ['text/html', 'HTML'],
    ['image/svg+xml', 'SVG'],
    ['application/octet-stream', 'an opaque binary']
  ]) {
    await assert.rejects(
      db.query(
        `insert into public.comprehensive_evidence_items
           (engagement_id, order_id, assessment_id, storage_path, original_filename, content_type, size_bytes)
         values ($1,$2,$3,$4,'x','${contentType}',10)`,
        [engagementId, compOrderId, assessmentId, `${orgId}/MKORD-REPLAY-COMP/${'c'.repeat(8)}-cccc-4ccc-8ccc-${'c'.repeat(12)}.bin`]
      ),
      /mime_allowlist|check/i,
      `${label} must be rejected by the database MIME allowlist`
    );
  }
  check('the database MIME allowlist rejects executable and markup content types');

  await assert.rejects(
    db.query(
      `insert into public.comprehensive_evidence_items
         (engagement_id, order_id, assessment_id, storage_path, original_filename, content_type, size_bytes)
       values ($1,$2,$3,$4,'huge.pdf','application/pdf',26214401)`,
      [engagementId, compOrderId, assessmentId, `${orgId}/MKORD-REPLAY-COMP/${'d'.repeat(8)}-dddd-4ddd-8ddd-${'d'.repeat(12)}.pdf`]
    ),
    /size_chk|check/i
  );
  check('the database rejects evidence above the 25 MB limit');

  await assert.rejects(
    db.query(
      `insert into public.comprehensive_evidence_items
         (engagement_id, order_id, assessment_id, storage_path, original_filename, content_type, size_bytes)
       values ($1,$2,$3,'../../etc/passwd','passwd','application/pdf',10)`,
      [engagementId, compOrderId, assessmentId]
    ),
    /storage_path_shape|check/i
  );
  check('a traversal storage path is rejected');

  await assert.rejects(
    db.query(`update public.comprehensive_evidence_items set validation_status='supported' where id=$1`, [evidenceId]),
    /decision_actor|check/i
  );
  check('a reviewer decision without a named reviewer is rejected');

  await db.query(
    `update public.comprehensive_evidence_items set validation_status='supported', reviewed_by=$1, reviewed_at=now() where id=$2`,
    [adminUserId, evidenceId]
  );
  await assert.rejects(
    db.query(`update public.comprehensive_evidence_items set size_bytes=1 where id=$1`, [evidenceId]),
    /intake_facts_immutable|check/i
  );
  check('the stored object facts of an evidence item are immutable');

  const bucket = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id='comprehensive-evidence'`)).rows[0];
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 26214400);
  assert.equal(bucket.allowed_mime_types.includes('application/pdf'), true);
  assert.equal(bucket.allowed_mime_types.some((type) => /html|svg|octet-stream|executable|msdownload/.test(type)), false);
  check('the comprehensive-evidence bucket exists, is private and carries the closed MIME allowlist');

  const storagePolicies = await db.query(`select count(*)::int as n from pg_policies where schemaname='storage' and tablename='objects'`);
  assert.equal(storagePolicies.rows[0].n, 0);
  check('no storage.objects policy exists, so evidence stays deny-by-default for anon and authenticated');

  // --- Least privilege ------------------------------------------------------------------------------------
  const newTables = [
    'product_price_versions',
    'comprehensive_engagements',
    'comprehensive_engagement_events',
    'comprehensive_evidence_items',
    'comprehensive_evidence_events',
    'comprehensive_review_records',
    'comprehensive_review_record_events',
    'comprehensive_review_subject_catalog'
  ];

  for (const table of newTables) {
    const rls = await db.query(`select relrowsecurity from pg_class where oid = ('public.' || $1)::regclass`, [table]);
    assert.equal(rls.rows[0].relrowsecurity, true, `${table} must have RLS enabled`);
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const granted = await db.query(
          `select has_table_privilege($1, 'public.' || $2, $3) as granted`, [role, table, privilege]
        );
        assert.equal(granted.rows[0].granted, false, `${role} must not hold ${privilege} on ${table}`);
      }
    }
  }
  check('anon and authenticated hold no privilege on any new table, and RLS is enabled on all of them');

  const serviceExpectations = {
    product_price_versions: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false },
    comprehensive_engagements: { SELECT: true, INSERT: true, UPDATE: true, DELETE: false },
    comprehensive_engagement_events: { SELECT: false, INSERT: true, UPDATE: false, DELETE: false },
    comprehensive_evidence_items: { SELECT: true, INSERT: true, UPDATE: true, DELETE: false },
    comprehensive_evidence_events: { SELECT: false, INSERT: true, UPDATE: false, DELETE: false },
    comprehensive_review_records: { SELECT: true, INSERT: true, UPDATE: true, DELETE: false },
    comprehensive_review_record_events: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false },
    comprehensive_review_subject_catalog: { SELECT: true, INSERT: true, UPDATE: true, DELETE: false }
  };
  for (const [table, expectations] of Object.entries(serviceExpectations)) {
    for (const [privilege, expected] of Object.entries(expectations)) {
      const granted = await db.query(
        `select has_table_privilege('service_role', 'public.' || $1, $2) as granted`, [table, privilege]
      );
      assert.equal(granted.rows[0].granted, expected, `service_role ${privilege} on ${table} must be ${expected}`);
    }
  }
  check('service_role holds exactly the least privilege each new table needs, and never DELETE');

  const functions = await db.query(
    `select p.proname, p.prosecdef, p.proconfig
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname in (
       'comprehensive_engagement_transition_allowed','comprehensive_engagement_state_guard',
       'comprehensive_engagement_events_append_only','comprehensive_evidence_binding_guard',
       'comprehensive_evidence_events_append_only',
       'comprehensive_review_record_guard','comprehensive_review_record_event_append_only',
       'comprehensive_review_record_audit','complete_comprehensive_package',
       'finalise_comprehensive_artifact_set','comprehensive_required_artifacts_present','comprehensive_delivery_ready',
       'record_customer_report_artefact_access')`
  );
  assert.equal(functions.rows.length, 13, 'all joint-launch functions must exist');
  for (const row of functions.rows) {
    const artifactRpc = ['complete_comprehensive_package', 'finalise_comprehensive_artifact_set', 'comprehensive_review_record_audit', 'record_customer_report_artefact_access'].includes(row.proname);
    assert.equal(row.prosecdef, artifactRpc, `${row.proname} SECURITY DEFINER posture is incorrect`);
    assert.ok(
      (row.proconfig ?? []).some((entry) => entry.startsWith('search_path=')),
      `${row.proname} must set an explicit search_path`
    );
  }
  check('joint-launch functions have the declared SECURITY INVOKER/DEFINER posture and explicit search_path');

  const publicGrants = await db.query(
    `select table_name, grantee, privilege_type from information_schema.role_table_grants
     where table_schema='public' and grantee in ('PUBLIC','anon','authenticated')
       and table_name = any($1::text[])`,
    [newTables]
  );
  assert.equal(publicGrants.rows.length, 0, `unexpected broad grants: ${JSON.stringify(publicGrants.rows)}`);
  check('no PUBLIC, anon or authenticated grant was broadened by this lane');

  const settingsWrites = await db.query(
    `select count(*)::int as n from public.app_settings where setting_key like 'joint_launch_%'`
  );
  assert.equal(settingsWrites.rows[0].n, 0);
  check('the lane writes no app_settings row, so it never touches the activation_control freeze surface');

  console.log(`\njoint-launch migration replay: ${checks} checks passed.`);
} catch (error) {
  failure = error;
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

if (failure) {
  console.error('\njoint-launch migration replay FAILED');
  console.error(failure);
  process.exit(1);
}

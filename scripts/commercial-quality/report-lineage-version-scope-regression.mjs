#!/usr/bin/env node
/**
 * Report lineage / version allocation scope regression -- MKORD-2026-1A22698B.
 *
 * Runs against a DISPOSABLE local PostgreSQL replay of every committed migration, started by
 * scripts/commercial-quality/report-lineage-postgres.sh. It never contacts Supabase, never calls a
 * provider, never renders a report and never sends email.
 *
 * Production shape reproduced exactly:
 *   assessment A, Essential V1 already generated for A, that V1 carries order_id = NULL,
 *   a new paid order O on the same assessment and the same locked score run, no report on O.
 *
 * Before: the order-scoped allocator saw no report for O, allocated version 1 again and built
 * RPT-<assessment>-V1, which collides with reports_report_reference_key.
 * After: allocation and previous-report resolution use assessment_id + report_type, so the claim
 * allocates V2, V1 is superseded transactionally and V2 becomes the current report bound to O.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const PORT = Number(process.env.MK_LINEAGE_POSTGRES_PORT);
assert.ok(Number.isInteger(PORT) && PORT > 0, 'MK_LINEAGE_POSTGRES_PORT is required (run via report-lineage-postgres.sh)');
const connection = { host: '127.0.0.1', port: PORT, user: 'postgres', database: 'mk_v12_replay' };

const client = new pg.Client(connection);
await client.connect();

const CHECKSUM = 'a'.repeat(64);
const results = {};

async function seedAssessment(label) {
  const orgId = randomUUID();
  const assessmentId = randomUUID();
  const scoreId = randomUUID();
  const adminId = randomUUID();
  const assessmentReference = `MKFRS-2026-${label}`;
  const method = (await client.query('select id from methodology_versions limit 1')).rows[0].id;
  await client.query('insert into auth.users (id,email) values ($1,$2)', [adminId, `${adminId}@example.test`]);
  await client.query("insert into admin_profiles (id,email,role) values ($1,$2,'platform_admin')", [adminId, `${adminId}@example.test`]);
  await client.query('insert into organisations (id,legal_name) values ($1,$2)', [orgId, 'Offline Lineage Certification']);
  await client.query("insert into assessments (id,assessment_reference,organisation_id,methodology_version_id,status,submitted_at,locked_at) values ($1,$2,$3,$4,'scored',now(),now())", [assessmentId, assessmentReference, orgId, method]);
  await client.query("insert into score_runs (id,assessment_id,methodology_version_id,run_number,status,locked_at,input_hash,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct) values ($1,$2,$3,1,'completed',now(),$4,57.29,'Developing','Developing',58,'High',100)", [scoreId, assessmentId, method, CHECKSUM]);
  await client.query('update assessments set current_score_run_id=$1 where id=$2', [scoreId, assessmentId]);
  return { orgId, assessmentId, scoreId, adminId, assessmentReference, method };
}

async function seedPaidOrder(seed, productCode = 'essential_self_assessment') {
  const orderId = randomUUID();
  const orderReference = `MKORD-2026-${randomUUID().slice(0, 8).toUpperCase()}`;
  const product = (await client.query('select * from products where product_code=$1', [productCode])).rows[0];
  await client.query("insert into orders (id,order_reference,assessment_id,product_id,status,amount_cents,currency,verified_by,verified_at) values ($1,$2,$3,$4,'payment_received',750000,'ZAR',$5,now())",
    [orderId, orderReference, seed.assessmentId, product.id, seed.adminId]);
  return { orderId, orderReference, productId: product.id };
}

/** The existing Production V1: generated for this assessment, carrying NO order_id. */
async function seedOrphanEssentialV1(seed) {
  const reportId = randomUUID();
  const template = (await client.query("select id from report_templates where report_type='essential_self_assessment' and status='active' order by version_number desc limit 1")).rows[0];
  await client.query(`insert into reports (
      id,assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,
      report_reference,version_number,storage_bucket,storage_path,checksum,file_name,mime_type,
      file_size_bytes,storage_status,storage_verified_at,generated_by,generated_at
    ) values ($1,$2,$3,null,$4,$5,'essential_self_assessment','generated',$6,1,'generated-reports',
      $7,$8,$9,'application/pdf',120000,'VERIFIED',now(),$10,now())`,
    [reportId, seed.assessmentId, seed.orgId, seed.scoreId, template.id,
      `RPT-${seed.assessmentReference}-V1`,
      `${seed.orgId}/${seed.assessmentId}/v1/RPT-${seed.assessmentReference}-V1.pdf`,
      CHECKSUM, `RPT-${seed.assessmentReference}-V1.pdf`, seed.adminId]);
  return { reportId, template };
}

const claim = (orderReference, adminId) => client.query(
  "select claim_manual_report_generation($1,$2,$3,'admin_generate',$4) as value",
  [orderReference, adminId, randomUUID(), randomUUID()]
).then((r) => r.rows[0].value);

// ---------------------------------------------------------------------------
// 1. The authoritative constraints are present and untouched by this correction.
// ---------------------------------------------------------------------------
const constraints = (await client.query(`
  select conname from pg_constraint where conrelid = 'public.reports'::regclass and contype = 'u'
  union all
  select indexname from pg_indexes where schemaname='public' and tablename='reports' and indexname like '%one_current%'
`)).rows.map((row) => row.conname ?? row.indexname);
assert.ok(constraints.some((name) => /report_reference/.test(name)), 'report_reference stays uniquely constrained');
assert.ok(constraints.some((name) => /version_number|assessment_id/.test(name)), '(assessment_id, report_type, version_number) stays uniquely constrained');
assert.ok(constraints.includes('reports_one_current_assessment_type_uidx'), 'one live report per (assessment_id, report_type) is preserved');
results.constraintsPreserved = constraints.sort();

// ---------------------------------------------------------------------------
// 2. BEFORE: the retired order-scoped rule, evaluated against the same live data.
//    Proven by running the exact allocator predicate the old RPC used.
// ---------------------------------------------------------------------------
const beforeSeed = await seedAssessment('BEFORE4739DF15F8');
await seedOrphanEssentialV1(beforeSeed);
const beforeOrder = await seedPaidOrder(beforeSeed);
const orderScopedVersion = Number((await client.query(
  'select coalesce(max(version_number),0) + 1 as v from reports where order_id = $1', [beforeOrder.orderId]
)).rows[0].v);
assert.equal(orderScopedVersion, 1, 'the retired order-scoped rule allocates version 1 again');
const orderScopedReference = `RPT-${beforeSeed.assessmentReference}-V1`;
const collision = (await client.query('select count(*)::int as n from reports where report_reference = $1', [orderScopedReference])).rows[0].n;
assert.equal(collision, 1, 'the version-1 reference the old rule would build is already taken');
// Prove the database really refuses it, rather than asserting the collision only in the test.
await client.query('begin');
let refused = null;
try {
  await client.query(`insert into reports (assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,report_reference,version_number)
    values ($1,$2,$3,$4,(select id from report_templates where report_type='essential_self_assessment' and status='active' limit 1),'essential_self_assessment','generated',$5,1)`,
    [beforeSeed.assessmentId, beforeSeed.orgId, beforeOrder.orderId, beforeSeed.scoreId, orderScopedReference]);
} catch (error) { refused = error.code; }
await client.query('rollback');
assert.equal(refused, '23505', 'the old rule ends in the Production unique_violation');
results.before = { allocatedVersion: orderScopedVersion, reference: orderScopedReference, postgresError: refused };

// ---------------------------------------------------------------------------
// 3. AFTER: the corrected claim, run for real.
// ---------------------------------------------------------------------------
const seed = await seedAssessment('4739DF15F8');
const v1 = await seedOrphanEssentialV1(seed);
const order = await seedPaidOrder(seed);
const claimed = await claim(order.orderReference, seed.adminId);
assert.equal(claimed.claimed, true, 'the corrected claim is granted');
assert.equal(Number(claimed.attempt.report_version), 2, 'the claim allocates V2 from the assessment + report_type scope');
assert.equal(claimed.report_type, 'essential_self_assessment', 'the report type is resolved from the purchased product');
assert.equal(claimed.report_reference, `RPT-${seed.assessmentReference}-V2`, 'the claim reports the reference finalisation will persist');
results.after = { allocatedVersion: Number(claimed.attempt.report_version), reference: claimed.report_reference, reportType: claimed.report_type };

// ---------------------------------------------------------------------------
// 4. Finalisation supersedes the assessment-scoped previous report and binds V2 to the order.
// ---------------------------------------------------------------------------
await client.query('select start_manual_report_generation($1)', [claimed.attempt.id]);
const storagePath = `${seed.orgId}/${order.orderId}/v2/RPT-${seed.assessmentReference}-V2.pdf`;
const completed = (await client.query(
  `select complete_manual_report_generation($1,$2,'essential_self_assessment'::report_type,'generated-reports',$3,$4,'application/pdf',120000,$5) as value`,
  [claimed.attempt.id, v1.template.id, storagePath, `RPT-${seed.assessmentReference}-V2.pdf`, CHECKSUM]
)).rows[0].value;
assert.equal(completed.superseded_report_id, v1.reportId, 'the prior V1 is selected as the previous current report by assessment + report type');
assert.equal(completed.report.version_number, 2);
assert.equal(completed.report.report_reference, `RPT-${seed.assessmentReference}-V2`);
assert.equal(completed.report.order_id, order.orderId, 'the new current report is bound to the paying order');
assert.equal(completed.report.supersedes_report_id, v1.reportId);
assert.equal(completed.attempt.id, claimed.attempt.id);

const rows = (await client.query('select id,version_number,status,order_id from reports where assessment_id=$1 order by version_number', [seed.assessmentId])).rows;
assert.equal(rows.length, 2, 'the historical V1 row still exists -- nothing is deleted');
assert.equal(rows[0].id, v1.reportId);
assert.equal(rows[0].status, 'superseded', 'V1 is superseded, not removed');
assert.equal(rows[0].order_id, null, 'the historical row is not retro-bound to this order');
assert.equal(rows[1].status, 'generated');
const live = (await client.query("select count(*)::int as n from reports where assessment_id=$1 and report_type='essential_self_assessment' and status in ('generated','under_review','approved','released')", [seed.assessmentId])).rows[0].n;
assert.equal(live, 1, 'exactly one current report per (assessment_id, report_type) is preserved');
const readyAttempt = (await client.query('select status,output_report_id from manual_report_generation_attempts where id=$1', [claimed.attempt.id])).rows[0];
assert.equal(readyAttempt.status, 'REPORT_READY');
assert.equal(readyAttempt.output_report_id, completed.report.id);
results.finalisation = {
  supersededReportId: completed.superseded_report_id,
  currentVersion: completed.report.version_number,
  currentReference: completed.report.report_reference,
  currentOrderId: completed.report.order_id === order.orderId ? 'paid_order' : completed.report.order_id,
  historicalV1Status: rows[0].status,
  liveReportsForIdentity: live,
  attemptStatus: readyAttempt.status
};

// ---------------------------------------------------------------------------
// 5. Concurrency: two orders on ONE assessment cannot both reserve the same version.
//    Real sessions, real row locks, no application-level serialisation.
// ---------------------------------------------------------------------------
const raceSeed = await seedAssessment('RACE4739DF15F8');
await seedOrphanEssentialV1(raceSeed);
const orderA = await seedPaidOrder(raceSeed);
const orderB = await seedPaidOrder(raceSeed);
const sessionA = new pg.Client(connection); const sessionB = new pg.Client(connection);
await sessionA.connect(); await sessionB.connect();
const claimIn = (session, orderReference) => session.query(
  "select claim_manual_report_generation($1,$2,$3,'admin_generate',$4) as value",
  [orderReference, raceSeed.adminId, randomUUID(), randomUUID()]
).then((r) => r.rows[0].value);

await sessionA.query('begin');
const raceA = await claimIn(sessionA, orderA.orderReference);
assert.equal(raceA.claimed, true, 'the first concurrent claim is granted');
assert.equal(Number(raceA.attempt.report_version), 2, 'the first claim reserves V2');

// B is started while A still holds the assessment row lock in an open transaction.
const raceBPromise = sessionB.query('begin').then(() => claimIn(sessionB, orderB.orderReference));
let bResolvedEarly = false;
await Promise.race([raceBPromise.then(() => { bResolvedEarly = true; }), new Promise((resolve) => setTimeout(resolve, 500))]);
assert.equal(bResolvedEarly, false, 'the second claim blocks on the assessment lock instead of reading a stale max(version_number)');
await sessionA.query('commit');
const raceB = await raceBPromise;
await sessionB.query('commit');

// Two claims that share a report identity cannot both hold it. manual_report_generation_one_active
// _assessment_uidx admits exactly one queued or generating claim per assessment, so the loser is
// refused outright rather than reserving the same version.
assert.equal(raceB.claimed, false, 'the second concurrent claim cannot also reserve a version');
assert.equal(raceB.reason, 'already_active');
assert.equal(raceB.attempt.id, raceA.attempt.id, 'the refusal names the claim that actually holds the identity');
const reservedVersions = (await client.query(
  "select report_version from manual_report_generation_attempts where assessment_id=$1 and status in ('REPORT_QUEUED','REPORT_GENERATING')",
  [raceSeed.assessmentId]
)).rows.map((row) => Number(row.report_version));
assert.deepEqual(reservedVersions, [2], 'exactly one V2 reservation exists for this assessment');

// Once the first claim closes, the next claim allocates the next version from the same scope.
await client.query("select fail_manual_report_generation($1,'generation_failed','Offline concurrency proof')", [raceA.attempt.id]);
const raceC = await claim(orderB.orderReference, raceSeed.adminId);
assert.equal(raceC.claimed, true);
assert.equal(Number(raceC.attempt.report_version), 2, 'a failed claim releases the version rather than skipping it');
results.concurrency = {
  firstClaimVersion: Number(raceA.attempt.report_version),
  secondConcurrentClaim: raceB.reason,
  secondClaimBlockedOnAssessmentLock: true,
  simultaneousReservationsForIdentity: reservedVersions.length,
  afterFirstClaimFailedNextVersion: Number(raceC.attempt.report_version)
};
await sessionA.end(); await sessionB.end();

// ---------------------------------------------------------------------------
// 6. Order-level idempotency is unchanged: an order that already has a ready report reuses it.
// ---------------------------------------------------------------------------
const reuse = await claim(order.orderReference, seed.adminId);
assert.equal(reuse.claimed, false);
assert.equal(reuse.reason, 'report_exists', 'an order that already has a ready report still reuses it');
assert.equal(reuse.report.id, completed.report.id);
results.orderIdempotency = { reason: reuse.reason, reusedReportVersion: reuse.report.version_number };

// ---------------------------------------------------------------------------
// 7. Report type is resolved from the purchased product, and an ineligible product fails closed.
// ---------------------------------------------------------------------------
const freeSeed = await seedAssessment('FREE4739DF15F8');
const freeOrder = await seedPaidOrder(freeSeed, 'free_snapshot');
let productRejection = null;
try { await claim(freeOrder.orderReference, freeSeed.adminId); } catch (error) { productRejection = error.message; }
assert.match(String(productRejection), /phase1_order_product_not_eligible/, 'a product with no paid report entitlement cannot claim a report identity');
assert.equal(
  (await client.query("select public.report_type_for_product_code('mk_validated_assessment') as t")).rows[0].t,
  'mk_validated',
  'the Comprehensive product resolves to its own report type'
);
results.productResolution = { essential: 'essential_self_assessment', comprehensive: 'mk_validated', freeSnapshot: 'phase1_order_product_not_eligible' };

// ---------------------------------------------------------------------------
// 8. The database reference rule and the application reference rule agree.
// ---------------------------------------------------------------------------
const { buildReportReference } = await import('../../src/lib/reports/report-reference.ts');
for (const [assessmentReference, reportType] of [
  ['MKFRS-2026-4739DF15F8', 'essential_self_assessment'],
  ['MKFRS-2026-COMP-EA26478B86', 'essential_self_assessment'],
  ['MKFRS-2026-COMP-EA26478B86', 'mk_validated']
]) {
  const dbReference = (await client.query('select public.mk_report_reference($1,$2::report_type,$3) as r', [assessmentReference, reportType, 2])).rows[0].r;
  assert.equal(dbReference, buildReportReference({ assessmentReference, reportType, versionNumber: 2 }),
    `application and database reference rules agree for ${reportType} / ${assessmentReference}`);
}
results.referenceRuleAgreement = 'application and database rules identical';

await client.end();
console.log(JSON.stringify({ status: 'PASS', providerCalls: 0, productionDatabaseWrites: 0, emailsSent: 0, ...results }, null, 2));

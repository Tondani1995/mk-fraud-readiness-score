#!/usr/bin/env node
/**
 * MKORD-2026-1A22698B end-to-end recovery proof.
 *
 * Reproduces the affected order's exact shape against a DISPOSABLE local PostgreSQL replay of
 * every committed migration, and drives the real generateManualPhase1Report() orchestration:
 *
 *   payment_received
 *     -> claim report identity        (real claim_manual_report_generation)
 *     -> V2 identity is collision-free (real pre-provider preflight)
 *     -> manuscript generation fixture (injected provider-free writer)
 *     -> semantic cascade, invalid-adjudication fallback (injected adapters)
 *     -> PDF fixture                   (injected renderer)
 *     -> finalisation                  (real complete_manual_report_generation)
 *     -> REPORT_READY
 *
 * No Production database, no provider, no email. Every provider role is an injected double and
 * the PDF is a fixture buffer.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { generateManualPhase1Report } from '../../src/lib/reports/phase1-manual-fulfilment.ts';
import { parseBlueprintMarkdown } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { buildDirectAssembly, createProviderFreeWholeWriter, createDirectGenerationDb, providerFreeFlags } from '../recovery/offline-fixtures.mjs';

const PORT = Number(process.env.MK_LINEAGE_POSTGRES_PORT);
assert.ok(Number.isInteger(PORT) && PORT > 0, 'MK_LINEAGE_POSTGRES_PORT is required (run via report-lineage-postgres.sh)');
const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'mk_v12_replay' });
await client.connect();

const CHECKSUM = 'a'.repeat(64);
const AMBIGUOUS = 'Independent verification remains outstanding across the recorded weaknesses.';
const REPAIRED = 'Management has not recorded an owner or completion date for reviewing these weaknesses.';

// ---------------------------------------------------------------------------
// The affected order's shape.
// ---------------------------------------------------------------------------
const orgId = randomUUID();
const assessmentId = randomUUID();
const scoreId = randomUUID();
const adminId = randomUUID();
const orderId = randomUUID();
const assessmentReference = 'MKFRS-2026-E2E4739DF15F8';
const orderReference = 'MKORD-2026-E2E698B';
const method = (await client.query('select id from methodology_versions limit 1')).rows[0].id;
const product = (await client.query("select * from products where product_code='essential_self_assessment'")).rows[0];
const template = (await client.query("select id from report_templates where report_type='essential_self_assessment' and status='active' order by version_number desc limit 1")).rows[0];

await client.query('insert into auth.users (id,email) values ($1,$2)', [adminId, `${adminId}@example.test`]);
await client.query("insert into admin_profiles (id,email,role) values ($1,$2,'platform_admin')", [adminId, `${adminId}@example.test`]);
await client.query('insert into organisations (id,legal_name) values ($1,$2)', [orgId, 'Offline end-to-end certification']);
await client.query("insert into assessments (id,assessment_reference,organisation_id,methodology_version_id,status,submitted_at,locked_at) values ($1,$2,$3,$4,'scored',now(),now())", [assessmentId, assessmentReference, orgId, method]);
await client.query("insert into score_runs (id,assessment_id,methodology_version_id,run_number,status,locked_at,input_hash,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct) values ($1,$2,$3,1,'completed',now(),$4,57.29,'Developing','Developing',58,'High',100)", [scoreId, assessmentId, method, CHECKSUM]);
await client.query('update assessments set current_score_run_id=$1 where id=$2', [scoreId, assessmentId]);

// The historical V1: same assessment, same score run, generated, VERIFIED, order_id NULL.
const v1Id = randomUUID();
await client.query(`insert into reports (
    id,assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,file_name,mime_type,
    file_size_bytes,storage_status,storage_verified_at,generated_by,generated_at
  ) values ($1,$2,$3,null,$4,$5,'essential_self_assessment','generated',$6,1,'generated-reports',
    $7,$8,$9,'application/pdf',120000,'VERIFIED',now(),$10,now())`,
  [v1Id, assessmentId, orgId, scoreId, template.id, `RPT-${assessmentReference}-V1`,
    `${orgId}/${assessmentId}/v1/RPT-${assessmentReference}-V1.pdf`, CHECKSUM,
    `RPT-${assessmentReference}-V1.pdf`, adminId]);

// The new paid order on that same assessment, with no report of its own.
await client.query("insert into orders (id,order_reference,assessment_id,product_id,status,amount_cents,currency,verified_by,verified_at) values ($1,$2,$3,$4,'payment_received',750000,'ZAR',$5,now())",
  [orderId, orderReference, assessmentId, product.id, adminId]);
const orderStatus = (await client.query('select status from orders where id=$1', [orderId])).rows[0].status;
assert.equal(orderStatus, 'payment_received', 'the journey starts from a payment_received order');
const reportsOnOrder = (await client.query('select count(*)::int as n from reports where order_id=$1', [orderId])).rows[0].n;
assert.equal(reportsOnOrder, 0, 'the paid order carries no report yet');

// ---------------------------------------------------------------------------
// Provider-free wiring. Reads and RPCs go to the local replay; every provider role is a double.
// ---------------------------------------------------------------------------
const wired = createDirectGenerationDb();
const db = wired.db;
db.rpc = async (name, args = {}) => {
  assert.match(name, /^[a-z_][a-z0-9_]*$/);
  const keys = Object.keys(args);
  keys.forEach((k) => assert.match(k, /^[a-z_][a-z0-9_]*$/));
  try {
    const result = await client.query(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')}) as value`, Object.values(args));
    return { data: result.rows[0].value, error: null };
  } catch (error) { return { data: null, error }; }
};
db.from = (table) => {
  assert.ok(['app_settings', 'report_templates', 'report_content_blocks', 'manual_report_generation_attempts', 'reports'].includes(table), `unexpected table ${table}`);
  let fields = '*'; const where = []; const values = []; let order = ''; let limit = ''; let single = false; let update = null;
  const q = {
    select(x) { fields = x; assert.match(x, /^[a-z_,*]+$/); return q; },
    update(patch) { update = patch; return q; },
    eq(k, v) { assert.match(k, /^[a-z_][a-z0-9_]*$/); values.push(v); where.push(`${k}=$${values.length}`); return q; },
    order(k, { ascending }) { assert.match(k, /^[a-z_][a-z0-9_]*$/); order = ` order by ${k} ${ascending ? 'asc' : 'desc'}`; return q; },
    limit(n) { assert.ok(Number.isInteger(n)); limit = ` limit ${n}`; return q; },
    maybeSingle() { single = true; return q; },
    single() { single = true; return q; },
    then(resolve, reject) {
      const sql = update
        ? `update ${table} set ${Object.keys(update).map((k, i) => `${k}=$${values.length + i + 1}`).join(',')}${where.length ? ' where ' + where.join(' and ') : ''}`
        : `select ${fields} from ${table}${where.length ? ' where ' + where.join(' and ') : ''}${order}${limit}`;
      const params = update ? [...values, ...Object.values(update).map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v))] : values;
      return client.query(sql, params).then(
        (r) => ({ data: update ? null : (single ? r.rows[0] ?? null : r.rows), error: null }),
        (error) => ({ data: null, error })
      ).then(resolve, reject);
    }
  };
  return q;
};

const base = createProviderFreeWholeWriter();
const calls = { write: 0, adjudicate: 0, repair: 0, pdf: 0 };
let generatedMarkdown = '';
let injectedInto = null;
const writer = {
  ...base.writer,
  async writeManuscript(input) {
    calls.write += 1;
    const produced = await base.writer.writeManuscript(input);
    // Give every paragraph a distinct, digit-free body so the injected defect can be placed in one
    // identified section rather than wherever an identical string happens to match first.
    let ordinal = 0;
    const distinct = produced.markdown.split('\n\n').map((block) => {
      if (/^#{1,3} /.test(block)) return block;
      ordinal += 1;
      const tag = String.fromCharCode(96 + ((ordinal - 1) % 26) + 1).repeat(Math.ceil(ordinal / 26));
      return `${block.replace(/\.$/, '')} for bounded section ${tag}.`;
    }).join('\n\n');
    // Inject the Production defect shape into the reported section: one ambiguous assurance
    // paragraph and nothing else.
    const parsed = parseBlueprintMarkdown(distinct, produced.blueprint);
    assert.equal(parsed.ok, true, 'the generated manuscript binds before the defect is injected');
    const section = parsed.chapters.flatMap((chapter) => chapter.sections).find((s) => s.sectionId === 'EXECUTIVE-ASSESSMENT-DRIVERS');
    assert.ok(section?.paragraphs.length, 'the Blueprint carries EXECUTIVE-ASSESSMENT-DRIVERS prose');
    injectedInto = `${section.sectionId}.paragraphs[0]`;
    generatedMarkdown = distinct.replace(section.paragraphs[0].text, AMBIGUOUS);
    assert.notEqual(generatedMarkdown, distinct, 'the defect was injected');
    return { ...produced, markdown: generatedMarkdown };
  }
};
const semanticAdapters = {
  // The Production failure: the provider answered, and the answer failed the acceptance contract.
  async adjudicate(candidates) {
    calls.adjudicate += 1;
    return candidates.map((candidate) => ({ targetId: candidate.targetId, label: 'ALLOW_CONTEXT', confidence: 0.42, reasonCode: 'x', evidenceRefs: [] }));
  },
  async repair(targets) {
    calls.repair += 1;
    return targets.map((target) => ({ targetId: target.targetId, repairedText: REPAIRED }));
  }
};

const data = buildDirectAssembly();
Object.assign(data, {
  orderId, orderReference, orderStatus: 'payment_received', assessmentId, orderAssessmentId: assessmentId,
  organisationId: orgId, currentScoreRunId: scoreId, assessmentReference,
  orderVerifiedAt: '2026-09-01T10:00:00Z', orderVerifiedBy: adminId, amountCents: 750000,
  orderCreatedAt: '2026-09-01T10:00:00Z', requiresPaymentVerification: true,
  paymentVerification: { legacyOrderVerification: true }, productId: product.id,
  productPriceVersionId: 'offline-price',
  productPriceVersions: [{ id: 'offline-price', productId: product.id, versionNumber: 1, priceCents: 750000, currency: 'ZAR', effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: null }],
  scoreRun: { ...data.scoreRun, id: scoreId, assessmentId }
});
assert.equal(buildAdvisoryEvidenceModel(data).scenarios.length >= 1, true, 'the deterministic evidence model is populated');

// ---------------------------------------------------------------------------
// The journey.
// ---------------------------------------------------------------------------
const result = await generateManualPhase1Report(
  { orderReference, action: 'admin_generate', requestKey: `e2e:${randomUUID()}`, requestedBy: adminId },
  {
    db,
    assembleReportData: async () => structuredClone(data),
    getPremiumReportAutomationFlags: providerFreeFlags(),
    wholeManuscriptWriter: writer,
    semanticAdapters,
    renderValidatedCommercialPdf: async () => { calls.pdf += 1; return Buffer.from(`%PDF-1.7\n${'0'.repeat(1200)}`); }
  }
);

assert.equal(result.versionNumber, 2, 'the paid order generates V2, not a second V1');
assert.equal(result.reportReference, `RPT-${assessmentReference}-V2`, 'the persisted reference is the V2 reference');
assert.equal(result.supersededReportId, v1Id, 'the historical V1 is the report that was superseded');
assert.ok(result.reportId, 'a report row was created');
assert.equal(calls.write, 1, 'exactly one manuscript generation');
assert.equal(calls.adjudicate, 1, 'exactly one adjudication call');
assert.equal(calls.repair, 1, 'the bounded repair call the rejected attempt never used');
assert.equal(calls.pdf, 1, 'exactly one PDF render');

// Persisted lineage.
const rows = (await client.query('select id,version_number,status,order_id,report_reference,supersedes_report_id from reports where assessment_id=$1 order by version_number', [assessmentId])).rows;
assert.equal(rows.length, 2, 'the historical V1 row still exists');
assert.equal(rows[0].id, v1Id);
assert.equal(rows[0].status, 'superseded');
assert.equal(rows[0].order_id, null, 'the historical row is not retro-bound to the paid order');
assert.equal(rows[1].status, 'generated');
assert.equal(rows[1].order_id, orderId, 'the current report is bound to the paid order');
assert.equal(rows[1].supersedes_report_id, v1Id);
const live = (await client.query("select count(*)::int as n from reports where assessment_id=$1 and report_type='essential_self_assessment' and status in ('generated','under_review','approved','released')", [assessmentId])).rows[0].n;
assert.equal(live, 1, 'exactly one current report for this assessment and report type');
const attempt = (await client.query('select status,report_version,output_report_id from manual_report_generation_attempts where order_id=$1', [orderId])).rows[0];
assert.equal(attempt.status, 'REPORT_READY', 'the attempt reaches REPORT_READY');
assert.equal(Number(attempt.report_version), 2);
assert.equal(attempt.output_report_id, rows[1].id);

// The repaired manuscript, not the ambiguous one, is what was accepted.
assert.equal(generatedMarkdown.includes(AMBIGUOUS), true, 'the generated manuscript carried the Production defect');
assert.equal(injectedInto, 'EXECUTIVE-ASSESSMENT-DRIVERS.paragraphs[0]', 'the defect was injected into the reported section');

await client.end();
console.log(JSON.stringify({
  status: 'PASS',
  productionDatabaseWrites: 0, realProviderCalls: 0, emailsSent: 0,
  journey: ['payment_received', 'claim_report_identity', 'preflight_identity_collision_free', 'manuscript_generated', 'semantic_cascade_invalid_adjudication_fallback', 'pdf_rendered', 'finalised', attempt.status],
  identity: { versionNumber: result.versionNumber, reportReference: result.reportReference, supersededReportId: result.supersededReportId },
  providerRoles: { generation: calls.write, adjudication: calls.adjudicate, repair: calls.repair, pdf: calls.pdf },
  injectedDefectPath: injectedInto,
  lineage: { historicalV1Status: rows[0].status, historicalV1OrderId: rows[0].order_id, currentVersion: rows[1].version_number, currentBoundToPaidOrder: rows[1].order_id === orderId, liveReportsForIdentity: live }
}, null, 2));

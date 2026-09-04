/**
 * Provider-free parity checks for the accepted Essential operating model.
 *
 * These assertions cover active source boundaries only. Historical Comprehensive review tables,
 * services and migrations remain in the repository for lineage/replay evidence; they are not active
 * application routes after the operating-model decision.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const orderPagePath = 'src/app/score/admin/orders/[orderReference]/page.tsx';
const orderPage = read(orderPagePath);
const paymentServicePath = 'src/lib/payments/payment-service.ts';
const paymentService = read(paymentServicePath);
const phase1Path = 'src/lib/reports/phase1-manual-fulfilment.ts';
const phase1 = read(phase1Path);
const migrationPath = 'supabase/migrations/20260904180000_align_paid_fulfilment_to_shared_manual_console.sql';
const migration = read(migrationPath);

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

check('shared order console renders manual delivery for every paid product', () => {
  assert.match(orderPage, /<ManualDeliveryPanel/);
  assert.doesNotMatch(orderPage, /\{!isComprehensive\s*\?\s*<ManualDeliveryPanel/);
  assert.match(orderPage, /description="MK-controlled report preparation, secure file access and manual customer delivery\."/);
  assert.match(orderPage, /operations\.latestGeneration && !isComprehensive/);
  assert.doesNotMatch(orderPage, /protected fulfilment worker and secure access record/);
});

check('Comprehensive shared console exposes both private files', () => {
  assert.match(orderPage, /report_artifacts/);
  assert.match(orderPage, /supporting_register/);
  assert.match(orderPage, /supportingRegisterFileName=/);
  assert.match(orderPage, /supportingRegisterReady=/);
  assert.match(read('src/components/admin/ManualDeliveryPanel.tsx'), /Supporting workbook/);
  assert.match(read('src/components/admin/ManualDeliveryPanel.tsx'), /artifacts\/supporting_register\/download/);
  assert.match(read('src/app/score/api/admin/orders/[orderReference]/mark-delivered/route.ts'), /supporting_register/);
});

check('supporting workbook access verifies private bytes and writes shared audit evidence', () => {
  const helper = read('src/lib/reports/phase1-artifact-access.ts');
  const route = read('src/app/score/api/admin/reports/[reportId]/artifacts/[artefactType]/download/route.ts');
  assert.match(helper, /assertReportAccessEligible/);
  assert.match(helper, /resolveCurrentReportId/);
  assert.match(helper, /\.download\(artifact\.storage_path\)/);
  assert.match(helper, /checksum !== artifact\.checksum_sha256/);
  assert.match(helper, /createSignedUrl/);
  assert.match(helper, /recordPrivateReportAccessEvidence/);
  assert.match(helper, /artefactType: SUPPORTING_REGISTER_ARTEFACT_TYPE/);
  assert.match(route, /getAdminSession/);
  assert.match(route, /supporting_register/);
});

check('payment confirmation has no automatic Comprehensive generation or customer send trigger', () => {
  assert.doesNotMatch(paymentService, /dispatchImmediateFulfilment/);
  assert.doesNotMatch(paymentService, /immediate-dispatch/);
  assert.match(paymentService, /fulfilment_trigger_result: 'NOT_REQUESTED'/);
  assert.match(paymentService, /manual fulfilment workflow/);
  assert.match(migration, /manual_fulfilment_pending/);
  assert.match(migration, /automatic_delivery_requested/);
  assert.match(migration, /'NOT_REQUESTED'/);
  assert.doesNotMatch(migration, /REPORT_QUEUED/);
  assert.doesNotMatch(migration, /payment_fulfilment:/);
  assert.doesNotMatch(migration, /automatic_release_completed_fulfilment/);
  assert.doesNotMatch(migration, /generation_requested[^\n]*true/);
});

check('Essential still owns the legacy automation-flag path while Comprehensive does not', () => {
  const comprehensiveStart = phase1.indexOf('if (isComprehensive) {');
  const essentialStart = phase1.indexOf('} else {', comprehensiveStart);
  assert.ok(comprehensiveStart >= 0 && essentialStart > comprehensiveStart);
  assert.doesNotMatch(phase1.slice(comprehensiveStart, essentialStart), /doGetAutomationFlags\(db\)/);
  assert.match(phase1.slice(essentialStart), /const doGetAutomationFlags =/);
  assert.match(phase1.slice(essentialStart), /const flags = await doGetAutomationFlags\(db\)/);
});

check('obsolete Comprehensive reviewer page, APIs and active workspace are absent', () => {
  for (const file of [
    'src/app/score/admin/comprehensive/[orderReference]/page.tsx',
    'src/app/score/api/admin/comprehensive/[orderReference]/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/generate/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/finalise/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/review-records/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/reviewer/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/transition/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/evidence/[evidenceId]/route.ts',
    'src/components/comprehensive/ComprehensiveReviewWorkspace.tsx'
  ]) assert.equal(exists(file), false, `${file} remains active`);
});

check('assessment and report admin surfaces are product-neutral', () => {
  const assessmentPage = read('src/app/score/admin/assessments/[assessmentRef]/page.tsx');
  const genericActions = read('src/components/admin/AssessmentReportActions.tsx');
  const alias = read('src/components/admin/AssessmentEssentialReportActions.tsx');
  const assessmentReview = read('src/lib/admin/assessment-review.ts');
  assert.match(assessmentPage, /AssessmentReportActions/);
  assert.doesNotMatch(assessmentPage, /AssessmentEssentialReportActions/);
  assert.match(genericActions, /Assessment reports/);
  assert.match(genericActions, /Generate assessment report/);
  assert.match(genericActions, /Download report/);
  assert.match(alias, /AssessmentReportActions as AssessmentEssentialReportActions/);
  assert.doesNotMatch(assessmentReview, /\.eq\('report_type', 'essential_self_assessment'\)/);
  assert.match(assessmentReview, /reportOrderResult/);
});

check('customer copy and delivery service retain the manual boundary', () => {
  const copy = read('src/lib/commercial/post-purchase-copy.ts');
  const delivery = read('src/lib/reports/email/report-delivery-service-core.ts');
  assert.doesNotMatch(copy, /prepared automatically/);
  assert.match(copy, /MK prepares/);
  assert.match(copy, /send the completed package directly/);
  assert.match(delivery, /void input;\s*throw new Error\(`\$\{MANUAL_CUSTOMER_DELIVERY_REASON\}/);
});

check('no worker route is configured as an active automatic trigger', () => {
  const vercelConfig = read('vercel.json');
  assert.doesNotMatch(vercelConfig, /fulfilment-worker/);
});

console.log(JSON.stringify({
  ok: true,
  checks: checks.length,
  checks,
  providerCalls: 0,
  customerEmailCalls: 0,
  productionActivity: false,
  historicalV3Event: 'untouched'
}, null, 2));

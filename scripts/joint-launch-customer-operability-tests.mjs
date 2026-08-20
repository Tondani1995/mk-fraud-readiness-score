import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log(`  ok - ${label}`); };

const eft = read('src/lib/orders/eft-instructions.ts');
const orderService = read('src/lib/commercial/order-service.ts');
const paidOrderRoute = read('src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts');
const snapshot = read('src/components/assessment/FreeSnapshot.tsx');
const statusPage = read('src/components/comprehensive/CustomerOrderStatusWorkspace.tsx');
const access = read('src/lib/reports/customer-report-access.ts');
const accessRoute = read('src/app/score/report/access/[token]/route.ts');
const reviewer = read('src/components/comprehensive/ComprehensiveReviewWorkspace.tsx');
const generation = read('src/lib/comprehensive/generation-service.ts');
const packageRegistration = read('src/lib/comprehensive/package-registration.ts');
const migration = read('supabase/migrations/20260810140000_final_pre_staging_comprehensive_closure.sql');
const lifecycleMigration = read('supabase/migrations/20260810131000_joint_launch_last_mile_customer_operability.sql');

check('EFT instructions are active-config gated, snapshot-bound and returned by paid-order creation', () => {
  assert.match(eft, /active === true/);
  assert.match(orderService, /eft_instructions_unavailable/);
  assert.match(orderService, /eft_instructions_snapshot/);
  assert.match(paidOrderRoute, /eftInstructions/);
  assert.match(snapshot, /View order status/);
});

check('customer evidence UI is token-bound, one-file-at-a-time and safe for customer display', () => {
  assert.match(statusPage, /form\.set\('snapshotToken', snapshotToken\)/);
  assert.match(statusPage, /form\.set\('file', file\)/);
  assert.match(statusPage, /Optional label/);
  assert.match(statusPage, /role="alert"/);
  assert.match(statusPage, /role="status"/);
  assert.doesNotMatch(statusPage, /storage_path|signedUrl|bucket/);
});

check('customer downloads cover all five Comprehensive artefacts and never expose signed URLs', () => {
  for (const selector of ['register', 'board', 'presentation', 'workshop']) assert.match(accessRoute, new RegExp(`'${selector}'`));
  for (const type of ['supporting_register', 'board_readout', 'executive_presentation', 'workshop_material']) assert.match(access, new RegExp(type));
  assert.match(access, /state !== 'delivered'/);
  assert.match(access, /signed_off_artifact_version/);
  assert.match(access, /release_state/);
  assert.doesNotMatch(access, /createSignedUrl\s*\(/);
});

check('reviewer workspace exposes payment, evidence, five human records, generation, signoff and release controls', () => {
  for (const type of ['finding', 'risk', 'control_design', 'decision', 'management_action']) assert.match(reviewer, new RegExp(type));
  for (const action of ['/reviewer', '/evidence/', '/review-records', '/generate', '/finalise', '/transition']) assert.match(reviewer, new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(reviewer, /Current analytical subject<select/);
  assert.match(reviewer, /subjectAuthority/);
  assert.match(reviewer, /evidenceRefs\.length === 0/);
  assert.doesNotMatch(reviewer, /Subject key<input/);
  assert.match(reviewer, /role="alert"/);
  assert.match(reviewer, /role="status"/);
});

check('generation is persisted-input based, real-file based and fail-closed for the presentation requirement', () => {
  assert.match(generation, /assembleReportData/);
  assert.match(generation, /fromAssembledReportData\(assembled\)/);
  assert.match(generation, /assertNarrativeCompositionReady/);
  assert.match(generation, /narrativeRelease/);
  assert.doesNotMatch(generation, /loadComprehensiveReviewerInput|reviewerInput/);
  assert.match(generation, /renderHtmlToPdfBuffer/);
  assert.match(generation, /buildComprehensiveRegisterWorkbookBytes/);
  assert.match(generation, /registerComprehensivePackageAtomically/);
  assert.match(packageRegistration, /complete_comprehensive_package/);
  assert.match(generation, /presentation_upload_required/);
  assert.doesNotMatch(generation, /completeComprehensiveArtifact/);
  assert.match(generation, /executive_presentation/);
});

check('database release ordering is exact-version and delivered-gated', () => {
  assert.match(lifecycleMigration, /state <> 'review_complete'/);
  assert.match(lifecycleMigration, /signed_off_artifact_version is distinct from p_artifact_version/);
  assert.match(lifecycleMigration, /release_state = 'released'/);
  assert.match(lifecycleMigration, /update public\.reports set status = 'released'/);
  assert.match(lifecycleMigration, /state = 'delivered' and not public\.comprehensive_delivery_ready/);
  assert.match(migration, /jsonb_array_length\(p_secondary\) <> 4/);
  assert.match(migration, /secondary_count', 4/);
});

console.log(JSON.stringify({ ok: true, checks, provider: 'none', surface: 'customer-operability-contract' }, null, 2));

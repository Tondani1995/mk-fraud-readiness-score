import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log(`  ok - ${label}`); };

const eft = read('src/lib/orders/eft-instructions.ts');
const orderService = read('src/lib/commercial/order-service.ts');
const catalogue = read('src/lib/commercial/product-catalogue.ts');
const paidOrderRoute = read('src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts');
// FreeSnapshot.tsx was intentionally retired. ProductChoice owns the tier-to-order handoff;
// OrderJourney owns paid-order creation and the resulting status link.
const productChoice = read('src/components/products/ProductChoice.tsx');
const orderJourney = read('src/components/commercial/OrderJourney.tsx');
const postPurchaseCopy = read('src/lib/commercial/post-purchase-copy.ts');
const statusPage = read('src/components/comprehensive/CustomerOrderStatusWorkspace.tsx');
const access = read('src/lib/reports/customer-report-access.ts');
const accessRoute = read('src/app/score/report/access/[token]/route.ts');

check('EFT instructions are active-config gated, snapshot-bound and returned by paid-order creation', () => {
  assert.match(eft, /active === true/);
  assert.match(orderService, /eft_instructions_unavailable/);
  assert.match(orderService, /eft_instructions_snapshot/);
  assert.match(paidOrderRoute, /eftInstructions/);
  assert.match(productChoice, /\$\{SCORE_BASE_PATH\}\/order\/new\?/);
  assert.match(orderJourney, /View order status/);
  assert.match(orderJourney, /MK confirms payment manually/);
});

check('Comprehensive customer status is the current manual-EFT order journey, not a retired reviewer workflow', () => {
  assert.match(catalogue, /COMPREHENSIVE_PRICE_CENTS = 3_500_000/);
  assert.match(catalogue, /COMPREHENSIVE_PRODUCT_CODE = 'mk_validated_assessment'/);
  assert.match(catalogue, /fulfilmentModel: 'automated_analytical'/);
  assert.match(catalogue, /selfServiceOrderable: true/);
  assert.match(paidOrderRoute, /parseInvoiceRequest/);
  assert.match(orderService, /create_paid_order_with_invoice/);
  assert.match(statusPage, /Payment instructions/);
  assert.match(statusPage, /Payment reference/);
  assert.match(statusPage, /Awaiting manual payment confirmation/);
  assert.match(statusPage, /Comprehensive package includes/);
  assert.match(statusPage, /Refresh order status/);
  assert.match(postPurchaseCopy, /full Comprehensive Fraud Readiness package/);
  const comprehensiveGeneration = read('src/lib/reports/comprehensive/narrative-generation.ts');
  assert.match(comprehensiveGeneration, /buildComprehensiveDeliveryModel/);
  assert.match(comprehensiveGeneration, /renderHtmlToPdfBuffer/);
  assert.doesNotMatch(statusPage, /Submit requested evidence|Upload evidence/);
  assert.doesNotMatch(statusPage, /Reviewer:|Sign-off:/);
  assert.doesNotMatch(statusPage, /Released Comprehensive package|supporting_register/);
  assert.doesNotMatch(statusPage, /form\.set\('snapshotToken'/);
  assert.doesNotMatch(statusPage, /storage_path|signedUrl|bucket/);
});

// The four checks that stood here asserted the retired reviewed-engagement lifecycle: five
// customer artefacts, signed_off_artifact_version, a reviewer sign-off workspace and a
// 'delivered' engagement state gate. That lifecycle is retired -- the active Comprehensive
// product is payment -> durable fulfilment -> verified PDF + workbook -> automatic release ->
// secure token -> customer access, with no reviewer and no human sign-off. The assertions below
// are the current contract. The security and operability properties those checks genuinely
// protected -- never exposing a signed URL, serving only verified bytes, binding an artefact to
// the exact current report version -- are preserved and strengthened here, not dropped.

check('the customer package is the automated PDF and supporting register, bound to the exact current version', () => {
  // Two customer artefacts, selected only after report-level token authority has passed.
  assert.match(accessRoute, /searchParams\.get\('artefact'\)/);
  assert.match(accessRoute, /requested === 'register'/);
  assert.match(access, /supporting_register/);
  // The active package has no reviewed engagement: the register is bound by null engagement_id
  // and the exact report version, and must actually be released and verified.
  assert.match(access, /\.is\('engagement_id', null\)/);
  assert.match(access, /\.eq\('artifact_version', report\.version_number\)/);
  assert.match(access, /\.eq\('release_state', 'released'\)/);
  assert.match(access, /\.eq\('storage_status', 'VERIFIED'\)/);
  // No reviewer sign-off may gate customer access any more.
  assert.doesNotMatch(access, /signed_off_artifact_version/);
});

check('customer bytes are verified in memory and never served through a signed URL', () => {
  assert.doesNotMatch(access, /createSignedUrl\s*\(/);
  assert.doesNotMatch(accessRoute, /createSignedUrl\s*\(/);
  // Byte-level integrity on the PDF instance that is actually returned.
  assert.match(access, /'%PDF'/);
  assert.match(access, /integrity_failed/);
  assert.match(access, /createHash\('sha256'\)/);
  // Superseded versions are unreachable even with a valid token for them.
  assert.match(access, /resolveCurrentReportId/);
  assert.match(access, /report_not_current_version/);
  // Possession is the control: revocation and expiry are enforced before anything is read.
  assert.match(access, /revoked_token/);
  assert.match(access, /expired_token/);
  // Every attempt, including a failure, records which artefact was asked for.
  assert.match(access, /record_customer_report_artefact_access/);
});

check('release is automatic after verified payment, with no reviewer or human sign-off in the path', () => {
  const automatedClosure = read('supabase/migrations/20260820120000_comprehensive_automated_launch_closure.sql');
  // The database refuses to leave an active Comprehensive order depending on a reviewed engagement.
  assert.match(automatedClosure, /comprehensive_active_order_still_depends_on_reviewed_engagement/);
  // Release binds the register to the exact report version with a deliberate null engagement_id.
  assert.match(automatedClosure, /release_state = 'released'/);
  assert.match(automatedClosure, /engagement_id is null/);
  assert.match(automatedClosure, /artifact_version = v_report\.version_number/);
  assert.match(automatedClosure, /comprehensive_package_release_binding_failed/);
  // Release is refused unless the exact PDF/register pair is present and verified.
  assert.match(automatedClosure, /comprehensive_package_incomplete/);
});

check('the accepted Comprehensive manuscript is durably bound before a package can be released', () => {
  const fulfilment = read('src/lib/reports/phase1-manual-fulfilment.ts');
  const guard = read('supabase/migrations/20260904030000_comprehensive_manuscript_provenance_and_v2_recovery_release.sql');
  assert.match(fulfilment, /persistComprehensiveNarrativeProvenance/);
  assert.match(guard, /comprehensive_manuscript_provenance_missing/);
  // A superseded version's customer access is closed by the version transition itself, and only
  // once the newer version is actually released.
  assert.match(guard, /supersede_prior_version_report_access/);
  assert.match(guard, /supersede_access_current_report_not_released/);
  assert.match(guard, /supersede_access_prior_version_still_live/);
});

console.log(JSON.stringify({ ok: true, checks, provider: 'none', surface: 'customer-operability-contract' }, null, 2));

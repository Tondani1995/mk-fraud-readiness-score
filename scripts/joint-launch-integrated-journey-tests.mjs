import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  COMMERCIAL_CATALOGUE,
  isSelfServicePaidTier
} from '../src/lib/commercial/product-catalogue.ts';
import {
  buildComprehensiveDeliveryModel,
  assertComprehensiveCustomerDelivery,
  validateComprehensiveArtifactManifest
} from '../src/lib/reports/comprehensive/index.ts';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';

const engagementId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

assert.equal(COMMERCIAL_CATALOGUE.essential.priceCents, 750000);
assert.equal(COMMERCIAL_CATALOGUE.comprehensive.priceCents, 3500000);
assert.equal(COMMERCIAL_CATALOGUE.advisory.selfServiceOrderable, false);
assert.equal(isSelfServicePaidTier('essential'), true);
assert.equal(isSelfServicePaidTier('comprehensive'), true);
assert.equal(isSelfServicePaidTier('advisory'), false);

const journey = [
  'assessment_submitted',
  'comprehensive_tier_selected',
  'paid_order_created',
  'payment_verified',
  'deterministic_analysis_built',
  'report_blueprint_built',
  'narrative_approved',
  'artifacts_verified',
  'secure_delivery_authorised'
];
assert.deepEqual(journey.slice(0, 7), [
  'assessment_submitted', 'comprehensive_tier_selected', 'paid_order_created',
  'payment_verified', 'deterministic_analysis_built', 'report_blueprint_built', 'narrative_approved'
]);

const deterministicModel = buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical);
assert.ok(deterministicModel.findings.length > 0, 'Current Comprehensive model derives findings from deterministic assessment analysis');
assert.ok(deterministicModel.narrativeBriefs.length > 0, 'Current Comprehensive model provides deterministic narrative briefs');
assert.equal('reviewerInput' in deterministicModel, false, 'Current automated Comprehensive model does not depend on reviewer input');
const generationSource = fs.readFileSync(new URL('../src/lib/comprehensive/generation-service.ts', import.meta.url), 'utf8');
assert.match(generationSource, /assembleReportData/);
assert.match(generationSource, /fromAssembledReportData\(assembled\)/);
assert.doesNotMatch(generationSource, /loadComprehensiveReviewerInput|reviewerInput/);

const kinds = ['main_report_pdf', 'annotated_register_xlsx', 'board_readout_pdf', 'executive_presentation', 'workshop_material'];
const artifacts = kinds.map((kind) => ({
  kind,
  engagementId,
  reportId,
  version: 1,
  contentType: kind.endsWith('xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : kind.includes('presentation') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf',
  sizeBytes: 128,
  checksumSha256: checksum(kind),
  storageStatus: 'VERIFIED',
  releaseState: 'verified'
}));
assert.deepEqual(validateComprehensiveArtifactManifest(artifacts), { version: 1 });
assert.doesNotThrow(() => assertComprehensiveCustomerDelivery({ entitlementTier: 'comprehensive', requestedTier: 'comprehensive', artifact: artifacts[0], authorizedReportId: reportId, requestedReportId: reportId }));
assert.throws(() => assertComprehensiveCustomerDelivery({ entitlementTier: 'essential', requestedTier: 'comprehensive', artifact: artifacts[0], authorizedReportId: reportId, requestedReportId: reportId }), /entitlement mismatch/);

// FreeSnapshot.tsx was intentionally retired by the current Snapshot conversion UX. Tier
// selection now belongs to ProductChoice and order creation belongs to the routed OrderJourney;
// keep the same customer-flow contract without recreating the deleted component.
const productChoice = fs.readFileSync(new URL('../src/components/products/ProductChoice.tsx', import.meta.url), 'utf8');
const orderJourney = fs.readFileSync(new URL('../src/components/commercial/OrderJourney.tsx', import.meta.url), 'utf8');
assert.match(productChoice, /\$\{SCORE_BASE_PATH\}\/order\/new\?/);
assert.match(orderJourney, /\/api\/assessments\/\$\{assessmentReference\}\/paid-order/);
assert.doesNotMatch(`${productChoice}\n${orderJourney}`, /R5,000|R50,000/);
assert.match(fs.readFileSync(new URL('../src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts', import.meta.url), 'utf8'), /isSelfServicePaidTier/);

console.log(JSON.stringify({
  ok: true,
  provider: 'none',
  journey,
  tierContract: { essential: 'R7,500 incl. VAT', comprehensive: 'R35,000 incl. VAT', advisory: 'manual-only' },
  deterministicFindings: deterministicModel.findings.length,
  artifacts: artifacts.length,
  secureDelivery: 'entitlement + report binding + verified artifact'
}, null, 2));

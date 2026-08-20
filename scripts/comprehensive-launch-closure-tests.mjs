import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {
  COMMERCIAL_CATALOGUE,
  COMPREHENSIVE_PRICE_CENTS,
  COMPREHENSIVE_PRODUCT_CODE,
  ESSENTIAL_PRICE_CENTS,
  ESSENTIAL_PRODUCT_CODE,
  isSelfServicePaidTier
} from '../src/lib/commercial/product-catalogue.ts';
import {
  assertComprehensiveCustomerDelivery,
  buildComprehensiveDeliveryModel,
  validateComprehensiveArtifactManifest
} from '../src/lib/reports/comprehensive/index.ts';
import { buildComprehensiveRegisterWorkbook } from '../src/lib/reports/comprehensive/workbook-builder.ts';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';
import { getCustomerOrderStatusCopy } from '../src/components/comprehensive/customer-order-status-copy.ts';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFile(new URL(path, root), 'utf8');
const checksum = (value) => crypto.createHash('sha256').update(value).digest('hex');
const orderId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';

assert.equal(COMMERCIAL_CATALOGUE.comprehensive.priceCents, COMPREHENSIVE_PRICE_CENTS);
assert.equal(COMPREHENSIVE_PRICE_CENTS, 3_500_000);
assert.equal(COMMERCIAL_CATALOGUE.comprehensive.productCode, COMPREHENSIVE_PRODUCT_CODE);
assert.equal(COMMERCIAL_CATALOGUE.comprehensive.deliveryMode, 'mk_controlled_pdf');
assert.equal(COMMERCIAL_CATALOGUE.comprehensive.fulfilmentModel, 'automated_analytical');
assert.equal(COMMERCIAL_CATALOGUE.comprehensive.selfServiceOrderable, true);
assert.equal(COMMERCIAL_CATALOGUE.comprehensive.requiresPaymentVerification, true);
assert.equal(COMMERCIAL_CATALOGUE.comprehensive.vatInclusive, true);
assert.equal(COMMERCIAL_CATALOGUE.essential.priceCents, ESSENTIAL_PRICE_CENTS);
assert.equal(isSelfServicePaidTier('comprehensive'), true);
assert.equal(isSelfServicePaidTier('advisory'), false);

const artifacts = [
  {
    kind: 'main_report_pdf', orderId, reportId, version: 1,
    fileName: 'RPT-MKFRS-2026-V1.pdf', contentType: 'application/pdf', sizeBytes: 128,
    checksumSha256: checksum('pdf'), storageStatus: 'VERIFIED', releaseState: 'released'
  },
  {
    kind: 'supporting_register_xlsx', orderId, reportId, version: 1,
    fileName: 'RPT-MKFRS-2026-V1-comprehensive-supporting-register.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: 256,
    checksumSha256: checksum('xlsx'), storageStatus: 'VERIFIED', releaseState: 'released'
  }
];
assert.deepEqual(validateComprehensiveArtifactManifest(artifacts), { version: 1 });
assert.throws(() => validateComprehensiveArtifactManifest([...artifacts, { ...artifacts[0] }]), /exactly|Duplicate/);
assert.throws(() => validateComprehensiveArtifactManifest(artifacts.map((item) => ({ ...item, orderId: item.kind === 'main_report_pdf' ? orderId : reportId }))), /order\/report binding/);
assert.doesNotThrow(() => assertComprehensiveCustomerDelivery({
  entitlementTier: 'comprehensive', requestedTier: 'comprehensive', artifact: artifacts[1],
  authorizedOrderId: orderId, requestedOrderId: orderId, authorizedReportId: reportId, requestedReportId: reportId
}));
assert.throws(() => assertComprehensiveCustomerDelivery({
  entitlementTier: 'essential', requestedTier: 'comprehensive', artifact: artifacts[1],
  authorizedOrderId: orderId, requestedOrderId: orderId, authorizedReportId: reportId, requestedReportId: reportId
}), /entitlement mismatch/);
assert.throws(() => assertComprehensiveCustomerDelivery({
  entitlementTier: 'comprehensive', requestedTier: 'comprehensive', artifact: artifacts[1],
  authorizedOrderId: orderId, requestedOrderId: reportId, authorizedReportId: reportId, requestedReportId: reportId
}), /order binding/);

const model = buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical);
assert.ok(model.findings.length > 0, 'Comprehensive retains the full deterministic finding universe');
assert.ok(model.riskRegister.length > 0, 'Comprehensive retains the deterministic risk register');
const workbook = await buildComprehensiveRegisterWorkbook(model, {
  orderReference: 'MKORD-2026-COMPLETE',
  reportReference: 'RPT-MKFRS-2026-V1',
  versionNumber: 1
});
assert.equal(workbook.sheetNames.length, 8, 'Comprehensive workbook has Read me, Summary and six deterministic registers');
assert.equal(workbook.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.match(workbook.fileName, /comprehensive-supporting-register\.xlsx$/i);
assert.ok(workbook.bytes.length > 0);
assert.match(workbook.checksumSha256, /^[0-9a-f]{64}$/);
assert.deepEqual(workbook.sheetNames.slice(0, 2), ['Read me', 'Summary']);
assert.equal(workbook.rowCounts['Material Findings'], model.materialFindings.length);

const phase1 = await read('src/lib/reports/phase1-manual-fulfilment.ts');
const manualGeneration = await read('src/lib/reports/comprehensive/manual-generation.ts');
const orderService = await read('src/lib/commercial/order-service.ts');
const customerStatus = await read('src/lib/commercial/customer-order-status.ts');
const customerWorkspace = await read('src/components/comprehensive/CustomerOrderStatusWorkspace.tsx');
const operationsPage = await read('src/app/score/admin/comprehensive/[orderReference]/page.tsx');
const operationsWorkspace = await read('src/components/comprehensive/ComprehensiveOperationsWorkspace.tsx');
const legacyAdminRoutes = [
  'src/app/score/api/admin/comprehensive/[orderReference]/evidence/[evidenceId]/route.ts',
  'src/app/score/api/admin/comprehensive/[orderReference]/finalise/route.ts',
  'src/app/score/api/admin/comprehensive/[orderReference]/generate/route.ts',
  'src/app/score/api/admin/comprehensive/[orderReference]/review-records/route.ts',
  'src/app/score/api/admin/comprehensive/[orderReference]/reviewer/route.ts',
  'src/app/score/api/admin/comprehensive/[orderReference]/transition/route.ts'
];
const access = await read('src/lib/reports/customer-report-access.ts');
const accessRoute = await read('src/app/score/report/access/[token]/route.ts');
const worker = await read('src/app/score/api/internal/fulfilment-worker/route.ts');
const launchMigration = await read('supabase/migrations/20260820120000_comprehensive_automated_launch_closure.sql');

const essentialStatusCopy = getCustomerOrderStatusCopy('essential');
const comprehensiveStatusCopy = getCustomerOrderStatusCopy('comprehensive');
assert.doesNotMatch(JSON.stringify(essentialStatusCopy), /Comprehensive/);
assert.match(essentialStatusCopy.assessmentTitle, /^Essential automated diagnostic$/);
assert.match(essentialStatusCopy.pdfLabel, /^Essential report PDF$/);
assert.match(essentialStatusCopy.registerLabel, /^Essential supporting register XLSX$/);
assert.doesNotMatch(JSON.stringify(comprehensiveStatusCopy), /Essential/);
assert.match(comprehensiveStatusCopy.assessmentTitle, /^Comprehensive automated assessment$/);
assert.match(comprehensiveStatusCopy.pdfLabel, /^Comprehensive report PDF$/);
assert.match(comprehensiveStatusCopy.registerLabel, /^Comprehensive supporting register XLSX$/);
assert.match(customerWorkspace, /getCustomerOrderStatusCopy/);
assert.doesNotMatch(customerWorkspace, /<CardTitle>Automated assessment<\/CardTitle>/);
assert.doesNotMatch(customerWorkspace, /label="Comprehensive report PDF"/);
assert.doesNotMatch(customerWorkspace, /label="Comprehensive supporting register XLSX"/);

assert.match(manualGeneration, /assembleComprehensive/);
assert.match(manualGeneration, /buildComprehensiveDeliveryModel/);
assert.match(manualGeneration, /buildComprehensiveRegisterWorkbook/);
assert.match(phase1, /renderComprehensiveReportPackage/);
assert.match(phase1, /storeVerifiedRegisterWorkbook/);
assert.match(phase1, /finalise_comprehensive_automated_report_with_supporting_register/);
assert.match(phase1, /finalise_manual_report_with_supporting_register/);
const comprehensiveBranch = phase1.slice(phase1.indexOf('const storedRegister = isComprehensive'));
assert.doesNotMatch(comprehensiveBranch.split(': await')[0], /buildAndStoreSupportingRegister/);
assert.doesNotMatch(orderService, /comprehensive_engagements|engagement-service/);
assert.doesNotMatch(customerStatus, /comprehensive_engagements|reviewer_admin_user_id|signed_off_by|evidenceCount/);
assert.doesNotMatch(customerWorkspace, /reviewer|sign.?off|upload|review workspace/i);
assert.doesNotMatch(operationsPage, /ComprehensiveReviewWorkspace|engagement-service/);
assert.doesNotMatch(operationsWorkspace, /reviewer|sign.?off|upload|review workspace/i);
for (const route of legacyAdminRoutes) {
  const routeSource = await read(route);
  assert.match(routeSource, /isAutomatedComprehensiveOrder/);
  assert.match(routeSource, /AUTOMATED_COMPREHENSIVE_ROUTE_RETIRED/);
}
assert.doesNotMatch(access, /comprehensive_engagements|signed_off_artifact_version|board_readout|executive_presentation|workshop_material/);
assert.match(access, /mk_validated_assessment/);
assert.match(access, /artifact_version.*report\.version_number|report\.version_number.*artifact_version/s);
assert.match(accessRoute, /unsupported-artifact/);
assert.doesNotMatch(accessRoute, /requested === 'board'|requested === 'presentation'|requested === 'workshop'/);
assert.match(worker, /generateManualPhase1Report/);
assert.match(worker, /automatic_release_completed_fulfilment/);
assert.match(worker, /processOneDelivery/);

const orderFunction = launchMigration.slice(
  launchMigration.indexOf('create or replace function public.create_paid_order'),
  launchMigration.indexOf('-- Comprehensive\'s atomic finalisation')
);
assert.doesNotMatch(orderFunction, /comprehensive_engagements/);
assert.match(launchMigration, /price_cents = 3500000/);
assert.match(launchMigration, /delivery_mode = 'mk_controlled_pdf'/);
assert.match(launchMigration, /finalise_comprehensive_automated_report_with_supporting_register/);
assert.match(launchMigration, /engagement_id is null/);
assert.match(launchMigration, /comprehensive_package_incomplete/);
assert.match(launchMigration, /phase14_delivery_entitlement/);
assert.match(launchMigration, /report_type = 'mk_validated'/);
assert.match(launchMigration, /supporting_register_checksum/);

console.log(JSON.stringify({
  passed: true,
  providerCalls: 0,
  productionMutations: 0,
  comprehensive: {
    price: 'R35,000 incl. VAT',
    artifactContract: ['main_report_pdf', 'supporting_register_xlsx'],
    workbookSheets: workbook.sheetNames,
    sourceFindings: model.findings.length,
    sourceRisks: model.riskRegister.length
  },
  boundaries: {
    automatedOrder: true,
    automatedFulfilment: true,
    securePdfAndXlsxAccess: true,
    legacyReviewedJourneyNotImported: true
  }
}, null, 2));

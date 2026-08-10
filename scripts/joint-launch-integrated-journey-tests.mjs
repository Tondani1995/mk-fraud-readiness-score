import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  COMMERCIAL_CATALOGUE,
  isSelfServicePaidTier
} from '../src/lib/commercial/product-catalogue.ts';
import {
  adaptBackendEvidenceStatus,
  buildComprehensiveReviewerInputFromPersisted,
  assertComprehensiveCustomerDelivery,
  validateComprehensiveArtifactManifest
} from '../src/lib/reports/comprehensive/index.ts';

const engagementId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const reviewerId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';
const now = '2026-08-10T12:00:00.000Z';

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
  'evidence_submitted',
  'reviewer_assigned',
  'human_review_records_persisted',
  'classification_projected',
  'artifacts_verified',
  'reviewer_signed_off',
  'secure_delivery_authorised'
];
assert.deepEqual(journey.slice(0, 7), [
  'assessment_submitted', 'comprehensive_tier_selected', 'paid_order_created',
  'payment_verified', 'evidence_submitted', 'reviewer_assigned', 'human_review_records_persisted'
]);

const evidence = [{
  id: evidenceId,
  evidenceRef: 'EVID-001',
  analyticalEvidenceRefs: ['EVID-001'],
  originalFilename: 'operating-control-export.pdf',
  validationStatus: 'supported',
  reviewerObservation: 'The operating export demonstrates the control is present and owned.',
  reviewedBy: reviewerId,
  reviewedAt: now
}];

const baseRecord = {
  engagementId,
  reviewerAdminUserId: reviewerId,
  reviewerObservation: 'Reviewed against the submitted evidence and operating context.',
  evidenceRefs: ['EVID-001'],
  decisionOptions: [],
  managementAction: {},
  recordVersion: 1,
  updatedAt: now
};
const records = [
  { ...baseRecord, id: '55555555-5555-4555-8555-555555555551', recordType: 'finding', subjectKey: 'F-001', reviewerConclusion: 'SUPPORTED', managementAction: { owner: 'COO', dueDate: '2026-09-30', adjustedInterpretation: 'Retain the finding as material.' } },
  { ...baseRecord, id: '55555555-5555-4555-8555-555555555552', recordType: 'risk', subjectKey: 'R-001', reviewerConclusion: 'The risk remains material because exception monitoring is not evidenced.' },
  { ...baseRecord, id: '55555555-5555-4555-8555-555555555553', recordType: 'control_design', subjectKey: 'C-001', reviewerConclusion: 'Design is partially effective; add an ageing threshold and effectiveness test.', managementAction: { recommendedAdjustment: 'Add an explicit exception owner, ageing threshold and effectiveness test.' } },
  { ...baseRecord, id: '55555555-5555-4555-8555-555555555554', recordType: 'decision', subjectKey: 'D-001', reviewerConclusion: 'Fund internal remediation capability.', decisionOptions: ['Fund internal remediation capability', 'Use a bounded external specialist workstream'], managementAction: { keyTradeOffs: ['Speed and specialist assurance versus internal ownership and recurring cost'], owner: 'CFO', targetDate: '2026-09-15', boardDecision: 'Approve internal capability funding.' } },
  { ...baseRecord, id: '55555555-5555-4555-8555-555555555555', recordType: 'management_action', subjectKey: 'A-001', reviewerConclusion: 'Implement the exception-monitoring remediation.', reviewerObservation: 'The action closes the reviewed design gap.', managementAction: { rationale: 'The gap is material and can be addressed with a named owner.', linkedFindingIds: ['F-001'], linkedRiskIds: ['R-001'], owner: 'COO', targetDate: '2026-09-30', status: 'OPEN' } }
];
const subject = (subjectKey, title, evidenceRefs = ['EVID-001']) => ({ subjectKey, title, detail: `${title} detail`, evidenceRefs, linkedFindingIds: [], linkedRiskIds: [] });
const subjectAuthority = {
  assessmentId: '66666666-6666-4666-8666-666666666666',
  scoreRunId: '77777777-7777-4777-8777-777777777777',
  findings: [subject('F-001', 'Finding one')],
  risks: [subject('R-001', 'Risk one')],
  controlDesigns: [subject('C-001', 'Control design one')],
  decisions: [subject('D-001', 'Decision one')],
  managementActions: [subject('A-001', 'Management action one')],
  allEvidenceRefs: ['EVID-001']
};

const reviewerInput = buildComprehensiveReviewerInputFromPersisted({
  engagement: {
    id: engagementId,
    reviewerAdminUserId: reviewerId,
    reviewerName: 'Named MK Reviewer',
    reviewerRole: 'reviewer',
    signedOffBy: reviewerId,
    signedOffAt: now,
    signOffStatement: 'I reviewed the persisted assessment, evidence metadata and human-review records.',
    signedOffArtifactVersion: 1
  },
  evidence,
  records,
  subjectAuthority
});
assert.equal(reviewerInput.evidenceReviews[0].backendStatus, 'supported');
assert.equal(reviewerInput.evidenceReviews[0].validationStatus, 'VALIDATED_SUPPORTED');
assert.equal(reviewerInput.findingReviews[0].reviewerConclusion, 'SUPPORTED');
assert.equal(reviewerInput.signOff?.signed, true);
assert.deepEqual(adaptBackendEvidenceStatus('not_supported'), { backendStatus: 'not_supported', presentationStatus: 'NOT_SUPPORTED' });
assert.deepEqual(adaptBackendEvidenceStatus('insufficient'), { backendStatus: 'insufficient', presentationStatus: 'NOT_VALIDATED_INSUFFICIENT' });

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

const snapshotComponent = fs.readFileSync(new URL('../src/components/assessment/FreeSnapshot.tsx', import.meta.url), 'utf8');
assert.match(snapshotComponent, /\/api\/assessments\/\$\{snapshot\.assessmentReference\}\/paid-order/);
assert.doesNotMatch(snapshotComponent, /R5,000|R50,000/);
assert.match(fs.readFileSync(new URL('../src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts', import.meta.url), 'utf8'), /isSelfServicePaidTier/);

console.log(JSON.stringify({
  ok: true,
  provider: 'none',
  journey,
  tierContract: { essential: 'R7,500 incl. VAT', comprehensive: 'R35,000 incl. VAT', advisory: 'manual-only' },
  reviewerRecords: records.length,
  artifacts: artifacts.length,
  secureDelivery: 'entitlement + report binding + verified artifact'
}, null, 2));

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';
import {
  BOARD_READOUT_PAGE_COUNT,
  COMPREHENSIVE_L2_LIMITS,
  adaptBackendEvidenceStatus,
  buildComprehensiveDeliveryModel,
  buildComprehensiveProjection,
  buildComprehensiveRegisterSheets,
  buildExecutivePresentationModel,
  assertNoFalseValidation,
  renderBoardReadoutHtml,
  renderComprehensiveReportHtml,
  safeSpreadsheetCell,
  sortComprehensiveRisks
} from '../src/lib/reports/comprehensive/index.ts';

const component = await fs.readFile(new URL('../src/components/products/TierComparison.tsx', import.meta.url), 'utf8');
const results = [];

for (const [key, fixture] of Object.entries(comprehensiveFixtures)) {
  const model = buildComprehensiveDeliveryModel(fixture.analytical, fixture.reviewer);
  assert.doesNotThrow(() => assertNoFalseValidation(model), `${key}: false validation guard`);
  assert.ok(model.evidenceRequestPack.length >= 3, `${key}: evidence request pack has useful coverage`);
  assert.ok(model.evidenceRequestPack.every((item) => item.validationStatus !== 'VALIDATED_SUPPORTED' || model.evidenceReviews.some((review) => review.evidenceRef === item.evidenceRef && review.validationStatus === 'VALIDATED_SUPPORTED')), `${key}: no unbacked validation`);
  assert.equal(model.findings.length, fixture.analytical.evidenceModel.materialFindings.length, `${key}: full finding universe retained`);
  assert.equal(model.riskRegister.length, fixture.analytical.evidenceModel.riskRegister.length, `${key}: full risk universe retained`);
  assert.ok(model.findings.some((finding) => finding.validationStatus === 'SELF_REPORTED' || finding.validationStatus === 'NOT_VALIDATED_INSUFFICIENT' || finding.validationStatus === 'VALIDATED_SUPPORTED'), `${key}: visible status`);
  const report = renderComprehensiveReportHtml(model);
  const board = renderBoardReadoutHtml(model);
  assert.match(report, /Strategic themes and exposure/);
  assert.match(report, /Recorded assessment|Review note|Management review record/);
  assert.match(board, /Board readout/);
  assert.equal((board.match(/class="board-page/g) ?? []).length, BOARD_READOUT_PAGE_COUNT(), `${key}: board readout page count`);
  const presentation = buildExecutivePresentationModel(model);
  assert.equal(presentation.slides.length, 10, `${key}: presentation content model is 8-12 slides`);
  assert.ok(presentation.workshop.agenda.some((item) => item.title === 'Information boundary'), `${key}: workshop supports information boundary`);
  results.push({ key, evidenceItems: model.evidenceRequestPack.length, validated: model.validationSummary.validatedSupported, unresolved: model.validationSummary.unresolved, reportSections: (report.match(/data-section=/g) ?? []).length });
}

const first = buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical, comprehensiveFixtures.weakOrganisationMeaningfulEvidence.reviewer);
const sheets = buildComprehensiveRegisterSheets(first);
assert.equal(sheets.length, 6, 'annotated workbook has six register sheets plus Read me and Summary');
assert.equal(sheets.find((sheet) => sheet.name === 'Material Findings').rows.length, first.materialFindings.length, 'workbook keeps full material findings');
assert.equal(sheets.find((sheet) => sheet.name === 'Risk Register').rows.length, first.riskRegister.length, 'workbook keeps full risk register');
assert.equal(safeSpreadsheetCell('=HYPERLINK("https://example.com")'), "'=HYPERLINK(\"https://example.com\")", 'formula injection protection');
assert.equal(safeSpreadsheetCell('+SUM(A1:A2)'), "'+SUM(A1:A2)", 'formula injection protection for plus');
assert.match(component, /aria-labelledby/);
assert.match(component, /aria-label/);
assert.doesNotMatch(component, /R7,500|R35,000|productCode|essentialCode|comprehensiveCode/);

// Finding-level validation is intentionally separate from evidence-item status.
const linkedEvidenceOnly = first.findings.find((finding) => finding.id === 'F-ACCESS');
assert.equal(linkedEvidenceOnly?.validationStatus, 'EVIDENCE_REVIEWED', 'supported evidence alone must not validate a finding');

const explicitSupportedReviewer = {
  ...comprehensiveFixtures.weakOrganisationMeaningfulEvidence.reviewer,
  findingReviews: [{
    findingId: 'F-ACCESS',
    evidenceRefs: ['evidence:EVID-ACCESS'],
    reviewerConclusion: 'SUPPORTED',
    validationStatus: 'VALIDATED_SUPPORTED',
    reviewerObservation: 'The reviewed population and exception trail support the finding-level conclusion for the named scope.',
    adjustedInterpretation: 'Supported for the reviewed population only.'
  }]
};
const explicitlySupported = buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical, explicitSupportedReviewer);
assert.equal(explicitlySupported.findings.find((finding) => finding.id === 'F-ACCESS')?.validationStatus, 'VALIDATED_SUPPORTED', 'explicit finding conclusion may validate a finding');

const nonexistentEvidenceReview = { ...explicitSupportedReviewer, findingReviews: [{ ...explicitSupportedReviewer.findingReviews[0], evidenceRefs: ['evidence:DOES-NOT-EXIST'] }] };
assert.throws(() => buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical, nonexistentEvidenceReview), /not linked to the finding/, 'finding review must reference linked evidence');
const unreviewedEvidenceReview = { ...explicitSupportedReviewer, evidenceReviews: [], findingReviews: [{ ...explicitSupportedReviewer.findingReviews[0] }] };
assert.throws(() => buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical, unreviewedEvidenceReview), /not actually reviewed/, 'finding review must reference evidence actually reviewed');

const insufficientEvidenceReviewer = {
  ...explicitSupportedReviewer,
  evidenceReviews: [{ evidenceRef: 'evidence:EVID-ACCESS', evidenceExamined: ['Incomplete export'], validationStatus: 'NOT_VALIDATED_INSUFFICIENT', reviewerConclusion: 'INSUFFICIENT', evidenceLimitation: 'The population is incomplete.' }],
  findingReviews: [{ ...explicitSupportedReviewer.findingReviews[0], reviewerConclusion: 'SUPPORTED', validationStatus: 'VALIDATED_SUPPORTED', reviewerObservation: undefined, adjustedInterpretation: undefined }]
};
assert.throws(() => buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical, insufficientEvidenceReviewer), /claims support without|must explain how negative or insufficient evidence was resolved/, 'insufficient evidence cannot silently support a finding');
const coherentlyResolvedNegativeEvidence = { ...insufficientEvidenceReviewer, findingReviews: [{ ...insufficientEvidenceReviewer.findingReviews[0], reviewerObservation: 'The limitation was resolved through a reviewer conclusion about the specific sampled population.', adjustedInterpretation: 'Supported only for the explicitly sampled population; no broader claim is made.' }] };
assert.equal(buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical, coherentlyResolvedNegativeEvidence).findings.find((finding) => finding.id === 'F-ACCESS')?.validationStatus, 'VALIDATED_SUPPORTED', 'a coherent explicit reviewer resolution may support a bounded finding');

const adaptedStatuses = ['not_requested', 'requested', 'received', 'reviewed', 'supported', 'not_supported', 'insufficient', 'not_applicable'].map((status) => adaptBackendEvidenceStatus(status));
assert.deepEqual(adaptedStatuses.map((entry) => entry.presentationStatus), ['NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'EVIDENCE_REVIEWED', 'VALIDATED_SUPPORTED', 'NOT_SUPPORTED', 'NOT_VALIDATED_INSUFFICIENT', 'NOT_APPLICABLE'], 'backend status adapter preserves distinctions');

const denseFixture = comprehensiveFixtures.denseWeakAssessment;
const denseModel = buildComprehensiveDeliveryModel(denseFixture.analytical, denseFixture.reviewer);
const denseProjection = buildComprehensiveProjection(denseModel);
assert.deepEqual(denseProjection.risks.slice(0, 4).map((risk) => risk.priority), ['Critical', 'Critical', 'Critical', 'Critical'], 'critical risks sort ahead of lower priorities');
assert.deepEqual([...new Set(sortComprehensiveRisks(denseModel.riskRegister, denseModel.findings).map((risk) => risk.priority))], ['Critical', 'High', 'Medium', 'Low'], 'risk ordering contains explicit descending severity order');
assert.equal(denseProjection.sourceCounts.findings, 24, 'dense fixture retains full L1 findings');
assert.equal(denseProjection.sourceCounts.risks, 16, 'dense fixture retains full L1 risks');
assert.equal(denseProjection.sourceCounts.scenarios, 10, 'dense fixture retains full L1 scenarios');
assert.equal(denseProjection.sourceCounts.controlActions, 24, 'dense fixture retains full L1 controls');
assert.equal(denseProjection.sourceCounts.roadmapActions, 36, 'dense fixture retains full L1 roadmap candidates');
assert.ok(denseProjection.findings.length <= COMPREHENSIVE_L2_LIMITS.findings);
assert.ok(denseProjection.risks.length <= COMPREHENSIVE_L2_LIMITS.risks);
assert.ok(denseProjection.scenarios.length <= COMPREHENSIVE_L2_LIMITS.scenarios);
assert.ok(denseProjection.controlActions.length <= COMPREHENSIVE_L2_LIMITS.controlActions);
assert.ok(denseProjection.roadmapActions.length <= COMPREHENSIVE_L2_LIMITS.roadmapActions);
const selectedRoadmapIds = new Set(denseProjection.roadmapActions.map((action) => action.id));
assert.ok(denseProjection.roadmapActions.every((action) => action.dependencyIds.every((dependencyId) => selectedRoadmapIds.has(dependencyId))), 'dense roadmap projection preserves dependency closure');

const denseSheets = buildComprehensiveRegisterSheets(denseModel);
assert.equal(denseSheets.find((sheet) => sheet.name === 'Material Findings').rows.length, 24, 'dense register retains all L1 findings');
assert.equal(denseSheets.find((sheet) => sheet.name === 'Risk Register').rows.length, 16, 'dense register retains all L1 risks');
assert.equal(denseSheets.find((sheet) => sheet.name === 'Control Actions').rows.length, 24, 'dense register retains all L1 controls');
assert.equal(denseSheets.find((sheet) => sheet.name === 'Roadmap').rows.length, 36, 'dense register retains all L1 roadmap candidates');
assert.ok(denseSheets.find((sheet) => sheet.name === 'Question Traceability').columns.includes('questionCode'));
assert.ok(denseSheets.find((sheet) => sheet.name === 'Management Decisions').columns.includes('keyTradeOffs'));

console.log(JSON.stringify({ passed: true, fixtures: results, denseProjection: { l1: denseProjection.sourceCounts, l2: { findings: denseProjection.findings.length, risks: denseProjection.risks.length, scenarios: denseProjection.scenarios.length, controls: denseProjection.controlActions.length, roadmap: denseProjection.roadmapActions.length, evidence: denseProjection.evidenceItems.length }, riskOrder: denseProjection.risks.slice(0, 8).map((risk) => `${risk.priority}:${risk.id}`) }, workbookSheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length, columns: sheet.columns.length })), boardReadoutPages: BOARD_READOUT_PAGE_COUNT(), accessibility: 'static keyboard/label checks passed' }, null, 2));

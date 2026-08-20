import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';
import {
  BOARD_READOUT_PAGE_COUNT,
  COMPREHENSIVE_REPORT_SECTIONS,
  buildComprehensiveDeliveryModel,
  buildComprehensiveProjection,
  buildComprehensiveRegisterSheets,
  buildExecutivePresentationModel,
  assertComprehensiveBlueprintContract,
  renderBoardReadoutHtml,
  renderComprehensiveReportHtml
} from '../src/lib/reports/comprehensive/index.ts';

const forbiddenCustomerLanguage = /Named reviewer|Independent reviewer|Human review|Evidence validated|Supported for stated scope|Insufficient evidence|Not supported|Evidence reconciliation|Review notes in scope|Reviewer judgement|Reviewer sign-off|reviewerObservation|validationStatus/i;
const component = await fs.readFile(new URL('../src/components/products/TierComparison.tsx', import.meta.url), 'utf8');
const results = [];

for (const [key, fixture] of Object.entries(comprehensiveFixtures)) {
  const model = buildComprehensiveDeliveryModel(fixture.analytical);
  assert.doesNotThrow(() => assertComprehensiveBlueprintContract(model), `${key}: blueprint contract`);
  assert.equal(model.findings.length, fixture.analytical.evidenceModel.materialFindings.length, `${key}: full finding universe retained`);
  assert.ok(model.proofRequirements.length >= 3, `${key}: proof requirements have useful coverage`);
  assert.ok(model.decisionOptionSets.every((set) => set.optionDetails.length === 3), `${key}: deterministic decision library has three options`);
  const report = renderComprehensiveReportHtml(model);
  const board = renderBoardReadoutHtml(model);
  assert.match(report, /Fraud Readiness Strategy and Control Blueprint/);
  assert.match(report, /Fraud Readiness assessment responses/);
  assert.doesNotMatch(report, forbiddenCustomerLanguage);
  assert.doesNotMatch(board, forbiddenCustomerLanguage);
  assert.equal((board.match(/class="board-page/g) ?? []).length, BOARD_READOUT_PAGE_COUNT(), `${key}: board readout page count`);
  const presentation = buildExecutivePresentationModel(model);
  assert.equal(presentation.slides.length, 10, `${key}: presentation content model`);
  assert.ok(presentation.workshop.agenda.some((item) => item.title === 'Target-state control design'), `${key}: workshop is design-oriented`);
  results.push({ key, findings: model.findings.length, proofRequirements: model.proofRequirements.length, reportSections: (report.match(/data-section=/g) ?? []).length });
}

assert.ok(COMPREHENSIVE_REPORT_SECTIONS.every((section) => ['diagnosis', 'interpretation', 'design'].includes(section.layer)), 'every Comprehensive section maps to diagnosis, interpretation or design');
assert.ok(!COMPREHENSIVE_REPORT_SECTIONS.some((section) => /validation|reconciliation|signoff|reviewer|observations|gaps/i.test(section.key)), 'old reviewer/evidence-review sections are removed');
const first = buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical);
const sheets = buildComprehensiveRegisterSheets(first);
assert.equal(sheets.length, 6, 'Comprehensive register has six blueprint sheets plus Read me and Summary');
assert.equal(sheets.find((sheet) => sheet.name === 'Material Findings').rows.length, first.materialFindings.length);
assert.equal(sheets.find((sheet) => sheet.name === 'Implementation Blueprint').rows.length, first.proofRequirements.length + first.roadmapActions.length);
assert.ok(sheets.find((sheet) => sheet.name === 'Management Decisions').columns.includes('deterministicRecommendation'));
assert.match(component, /aria-labelledby/);
assert.match(component, /aria-label/);
assert.doesNotMatch(component, /R7,500|R35,000|productCode|essentialCode|comprehensiveCode/);

const denseModel = buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical);
const denseProjection = buildComprehensiveProjection(denseModel);
assert.deepEqual(denseProjection.risks.slice(0, 4).map((risk) => risk.priority), ['Critical', 'Critical', 'Critical', 'Critical']);
assert.equal(denseProjection.sourceCounts.findings, 24);
assert.equal(denseProjection.sourceCounts.risks, 16);
assert.equal(denseProjection.sourceCounts.scenarios, 10);
assert.equal(denseProjection.sourceCounts.controlActions, 24);
assert.equal(denseProjection.sourceCounts.roadmapActions, 36);

console.log(JSON.stringify({ passed: true, fixtures: results, blueprintSections: COMPREHENSIVE_REPORT_SECTIONS.length, workbookSheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length, columns: sheet.columns.length })), boardReadoutPages: BOARD_READOUT_PAGE_COUNT(), accessibility: 'static keyboard/label checks passed' }, null, 2));

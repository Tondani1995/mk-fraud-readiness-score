import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';
import {
  BOARD_READOUT_PAGE_COUNT,
  buildComprehensiveDeliveryModel,
  buildComprehensiveRegisterSheets,
  buildExecutivePresentationModel,
  assertNoFalseValidation,
  renderBoardReadoutHtml,
  renderComprehensiveReportHtml,
  safeSpreadsheetCell
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
  assert.match(report, /Evidence-validation summary/);
  assert.match(report, /SELF-REPORTED|VALIDATED \/ SUPPORTED/);
  assert.match(board, /Board readout/);
  assert.equal((board.match(/class="board-page/g) ?? []).length, BOARD_READOUT_PAGE_COUNT(), `${key}: board readout page count`);
  const presentation = buildExecutivePresentationModel(model);
  assert.equal(presentation.slides.length, 10, `${key}: presentation content model is 8-12 slides`);
  assert.ok(presentation.workshop.agenda.some((item) => item.title === 'Evidence disagreements'), `${key}: workshop supports evidence disagreements`);
  results.push({ key, evidenceItems: model.evidenceRequestPack.length, validated: model.validationSummary.validatedSupported, unresolved: model.validationSummary.unresolved, reportSections: (report.match(/data-section=/g) ?? []).length });
}

const first = buildComprehensiveDeliveryModel(comprehensiveFixtures.weakOrganisationMeaningfulEvidence.analytical, comprehensiveFixtures.weakOrganisationMeaningfulEvidence.reviewer);
const sheets = buildComprehensiveRegisterSheets(first);
assert.equal(sheets.length, 7, 'annotated workbook has seven required sheets');
assert.equal(sheets.find((sheet) => sheet.name === 'Material Findings').rows.length, first.materialFindings.length, 'workbook keeps full material findings');
assert.equal(sheets.find((sheet) => sheet.name === 'Risk Register').rows.length, first.riskRegister.length, 'workbook keeps full risk register');
assert.equal(safeSpreadsheetCell('=HYPERLINK("https://example.com")'), "'=HYPERLINK(\"https://example.com\")", 'formula injection protection');
assert.equal(safeSpreadsheetCell('+SUM(A1:A2)'), "'+SUM(A1:A2)", 'formula injection protection for plus');
assert.match(component, /aria-labelledby/);
assert.match(component, /aria-label/);
assert.doesNotMatch(component, /R7,500|R35,000|productCode|essentialCode|comprehensiveCode/);

console.log(JSON.stringify({ passed: true, fixtures: results, workbookSheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length, columns: sheet.columns.length })), boardReadoutPages: BOARD_READOUT_PAGE_COUNT(), accessibility: 'static keyboard/label checks passed' }, null, 2));


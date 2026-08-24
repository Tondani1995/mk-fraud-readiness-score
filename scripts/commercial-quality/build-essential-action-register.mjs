#!/usr/bin/env node
/**
 * Offline visual-QA builder for the focused Essential Action & Proof Register.
 *
 * This uses @oai/artifact-tool for the review fixture, but reads the same canonical projection
 * used by the production workbook builder. It never calls Supabase, a provider or a database.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildVhutshiloEssentialFixture } from './essential-companion-fixture.mjs';
import {
  buildEssentialActionProofRegisterProjection,
  ESSENTIAL_ACTION_REGISTER_HEADERS,
  ESSENTIAL_ACTION_REGISTER_STATUS_VALUES,
  ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME,
  ESSENTIAL_ACTION_REGISTER_SHEET_NAME
} from '../../src/lib/reports/essential/action-proof-register.ts';
import { MK_TOKENS } from '../../src/lib/reports/design/tokens.ts';

const moduleRoot = process.env.CODEX_NODE_MODULES
  ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const requireFromBundle = createRequire(path.join(moduleRoot, 'package.json'));
const { SpreadsheetFile, Workbook } = requireFromBundle('@oai/artifact-tool');

const repoRoot = path.resolve('.');
const outputDir = path.resolve(process.env.ESSENTIAL_COMPANION_OUTPUT_DIR ?? 'outputs');
const qaDir = path.resolve(process.env.ESSENTIAL_COMPANION_QA_DIR ?? 'work/essential-companion-register');
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(qaDir, { recursive: true });

const { data, adaptedModel, projection } = buildVhutshiloEssentialFixture();
const canonical = buildEssentialActionProofRegisterProjection({ data, model: adaptedModel, projection });
const workbook = Workbook.create();

function columnName(index) {
  let number = index + 1;
  let result = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function summaryRows() {
  const count = (period) => canonical.rows.filter((row) => row.targetPeriod === period).length;
  return [
    ['Product', canonical.productLabel, 'Focused customer action and proof companion.'],
    ['Organisation', canonical.organisationName, 'Same assembled assessment as the PDF.'],
    ['Assessment reference', canonical.assessmentReference, 'Frozen assessment trace reference.'],
    ['Report reference', canonical.reportReference, 'Tier-correct Essential report version.'],
    ['Reported readiness', Number(canonical.score).toFixed(2), 'Recorded score; no recalculation.'],
    ['Final maturity', canonical.maturity, 'Recorded maturity; no methodology change.'],
    ['Priority action rows', String(canonical.rows.length), 'Focused 30/60/90 subset only.'],
    ['30-day actions', String(count('30 days')), 'Ownership, stabilisation and first foundations.'],
    ['60-day actions', String(count('60 days')), 'Implementation and operating proof.'],
    ['90-day actions', String(count('90 days')), 'Effectiveness, monitoring and sustained operation.'],
    ['Package promise', 'Focused Action & Proof Register', 'The PDF and workbook use the same promise.'],
    ['Status guidance', ESSENTIAL_ACTION_REGISTER_STATUS_VALUES.join(' · '), 'Status is management follow-up, not assurance.'],
    ['Assessment basis', "Management's recorded Fraud Readiness self-assessment responses", 'No independent verification is claimed.']
  ];
}

const summary = workbook.worksheets.add(ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME);
summary.showGridLines = false;
summary.getRange('A1:C1').merge();
summary.getRange('A1').values = [['MK Fraud Readiness · Essential Action & Proof Register']];
summary.getRange('A1:C1').format = {
  fill: MK_TOKENS.navy900,
  font: { bold: true, color: MK_TOKENS.white, size: 15 },
  rowHeight: 30,
  wrapText: true
};
summary.getRange('A3:C3').values = [['Field', 'Value', 'Note']];
summary.getRange(`A4:C${summaryRows().length + 3}`).values = summaryRows();
summary.getRange('A3:C3').format = { fill: MK_TOKENS.navy900, font: { bold: true, color: MK_TOKENS.white }, wrapText: true, rowHeight: 30 };
summary.getRange(`A4:C${summaryRows().length + 3}`).format = { wrapText: true, verticalAlignment: 'top', rowHeight: 28 };
summary.getRange('A:A').format.columnWidth = 28;
summary.getRange('B:B').format.columnWidth = 58;
summary.getRange('C:C').format.columnWidth = 58;
const summaryTable = summary.tables.add(`A3:C${summaryRows().length + 3}`, true, 'EssentialSummaryTable');
summaryTable.showFilterButton = true;
summaryTable.showBandedColumns = false;
summary.freezePanes.freezeRows(3);

const register = workbook.worksheets.add(ESSENTIAL_ACTION_REGISTER_SHEET_NAME);
register.showGridLines = false;
const headers = [...ESSENTIAL_ACTION_REGISTER_HEADERS];
const visibleRows = canonical.rows.map((row) => [
  row.priorityId,
  row.priorityTitle,
  row.domain,
  row.assessedCondition,
  row.priorityRationale,
  row.managementAction,
  row.accountableRole,
  row.targetPeriod,
  row.requiredPopulation,
  row.evidenceToRetain,
  row.completionEffectivenessTest,
  row.escalationTrigger,
  row.status,
  row.managementNotes
]);
const endColumn = columnName(headers.length - 1);
register.getRange(`A1:${endColumn}1`).values = [headers];
register.getRange(`A2:${endColumn}${visibleRows.length + 1}`).values = visibleRows;
register.getRange(`A1:${endColumn}1`).format = {
  fill: MK_TOKENS.navy900,
  font: { bold: true, color: MK_TOKENS.white },
  wrapText: true,
  rowHeight: 40
};
register.getRange(`A2:${endColumn}${visibleRows.length + 1}`).format = {
  wrapText: true,
  verticalAlignment: 'top',
  rowHeight: 52
};
register.getRange('A:A').format.columnWidth = 12;
register.getRange('B:B').format.columnWidth = 34;
register.getRange('C:C').format.columnWidth = 30;
for (const column of ['D', 'E', 'F', 'I', 'J', 'K', 'L']) register.getRange(`${column}:${column}`).format.columnWidth = 68;
register.getRange('G:G').format.columnWidth = 28;
register.getRange('H:H').format.columnWidth = 16;
register.getRange('M:M').format.columnWidth = 16;
register.getRange('N:N').format.columnWidth = 30;
const registerTable = register.tables.add(`A1:${endColumn}${visibleRows.length + 1}`, true, 'EssentialActionProofRegisterTable');
registerTable.showFilterButton = true;
registerTable.showBandedColumns = false;
register.getRange(`M2:M${visibleRows.length + 1}`).dataValidation = {
  rule: { type: 'list', values: [...ESSENTIAL_ACTION_REGISTER_STATUS_VALUES] }
};
register.freezePanes.freezeRows(1);
register.freezePanes.freezeColumns(2);

const formulaErrors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 100 },
  summary: 'Focused Essential register formula error scan'
});
const summaryInspect = await workbook.inspect({
  kind: 'table',
  range: `${ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME}!A1:C${summaryRows().length + 3}`,
  include: 'values,formulas',
  tableMaxRows: 20,
  tableMaxCols: 5
});
const registerInspect = await workbook.inspect({
  kind: 'table',
  range: `${ESSENTIAL_ACTION_REGISTER_SHEET_NAME}!A1:${endColumn}${visibleRows.length + 1}`,
  include: 'values,formulas',
  tableMaxRows: 12,
  tableMaxCols: headers.length
});

const renderedSheets = [];
const renderTargets = [
  { name: ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME, range: `A1:C${summaryRows().length + 3}`, label: 'summary' },
  { name: ESSENTIAL_ACTION_REGISTER_SHEET_NAME, range: `A1:H${visibleRows.length + 1}`, label: 'action-proof-register-left' },
  { name: ESSENTIAL_ACTION_REGISTER_SHEET_NAME, range: `I1:N${visibleRows.length + 1}`, label: 'action-proof-register-right' }
];
for (const target of renderTargets) {
  const preview = await workbook.render({ sheetName: target.name, range: target.range, scale: 1, format: 'png' });
  const previewPath = path.join(qaDir, `${target.label}.png`);
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
  renderedSheets.push(previewPath);
}

const outputPath = path.join(outputDir, canonical.registerFileName);
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
const qa = {
  output: outputPath,
  renderedSheets,
  source: 'frozen Vhutshilo V1.2 response vector through the live Essential model',
  organisation: canonical.organisationName,
  score: canonical.score,
  maturity: canonical.maturity,
  assessmentReference: canonical.assessmentReference,
  reportReference: canonical.reportReference,
  sheetNames: [ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME, ESSENTIAL_ACTION_REGISTER_SHEET_NAME],
  rowCounts: { Summary: summaryRows().length, [ESSENTIAL_ACTION_REGISTER_SHEET_NAME]: visibleRows.length },
  formulaErrors: formulaErrors.ndjson,
  summaryInspect: summaryInspect.ndjson,
  registerInspect: registerInspect.ndjson
};
await fs.writeFile(path.join(qaDir, 'qa.json'), JSON.stringify(qa, null, 2));
console.log(JSON.stringify(qa, null, 2));

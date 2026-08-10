import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveDeliveryModel, buildComprehensiveRegisterSheets } from '../src/lib/reports/comprehensive/index.ts';

const moduleRoot = process.env.CODEX_NODE_MODULES ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const requireFromBundle = createRequire(path.join(moduleRoot, 'package.json'));
const { SpreadsheetFile, Workbook } = requireFromBundle('@oai/artifact-tool');

const outputDir = path.resolve(process.env.COMPREHENSIVE_OUTPUT_DIR ?? './outputs/comprehensive');
await fs.mkdir(outputDir, { recursive: true });

const fixture = comprehensiveFixtures.weakOrganisationMeaningfulEvidence;
const model = buildComprehensiveDeliveryModel(fixture.analytical, fixture.reviewer);
const sheets = buildComprehensiveRegisterSheets(model);
const workbook = Workbook.create();

const navy = '#142f4c';
const amber = '#c77b35';
const pale = '#f3f6f8';
const grid = '#d9e1e7';

const summary = workbook.worksheets.add('Summary');
summary.showGridLines = false;
summary.getRange('A1:F1').merge();
summary.getRange('A1').values = [['MK Fraud Readiness · Comprehensive annotated register']];
summary.getRange('A1:F1').format = { fill: navy, font: { bold: true, color: '#FFFFFF', size: 16 }, rowHeight: 30 };
summary.getRange('A3:B8').values = [
  ['Review organisation', fixture.analytical.organisationName],
  ['Named reviewer', `${fixture.reviewer.reviewer.name} · ${fixture.reviewer.reviewer.role}`],
  ['Review date', fixture.reviewer.reviewer.reviewDate],
  ['Deterministic readiness', null],
  ['Validated / supported evidence', null],
  ['Unresolved evidence', null]
];
summary.getRange('B6').values = [[fixture.analytical.score.overallScore]];
summary.getRange('A3:A8').format = { fill: pale, font: { bold: true, color: navy } };
summary.getRange('A3:B8').format.borders = { preset: 'outside', style: 'thin', color: grid };
summary.getRange('D3:F3').merge();
summary.getRange('D3').values = [['Status vocabulary']];
summary.getRange('D3:F3').format = { fill: amber, font: { bold: true, color: '#FFFFFF' } };
summary.getRange('D4:F8').values = [
  ['SELF_REPORTED', 'Recorded assessment answer', 'Not independently supported'],
  ['EVIDENCE_REVIEWED', 'Artefact examined', 'Not automatically validated'],
  ['VALIDATED_SUPPORTED', 'Named reviewer support', 'Only for stated scope'],
  ['NOT_VALIDATED_INSUFFICIENT', 'Evidence limitation', 'Reliance remains bounded'],
  ['REVIEWER_JUDGEMENT', 'Human interpretation', 'Distinct from deterministic score']
];
summary.getRange('D4:F8').format = { wrapText: true, borders: { preset: 'all', style: 'thin', color: grid } };
summary.getRange('A10:F10').merge();
summary.getRange('A10').values = [['Full analytical universe retained in sheets; this summary is a navigation and QA layer.']];
summary.getRange('A10:F10').format = { fill: '#fff6e8', font: { italic: true, color: '#6d4c1d' }, wrapText: true };
summary.getRange('A:A').format.columnWidth = 30;
summary.getRange('B:B').format.columnWidth = 31;
summary.getRange('C:C').format.columnWidth = 3;
summary.getRange('D:D').format.columnWidth = 26;
summary.getRange('E:E').format.columnWidth = 31;
summary.getRange('F:F').format.columnWidth = 28;
summary.freezePanes.freezeRows(2);

for (const sheetData of sheets) {
  const sheet = workbook.worksheets.add(sheetData.name);
  sheet.showGridLines = false;
  const header = sheetData.columns;
  const values = sheetData.rows.map((row) => header.map((column) => row[column] ?? null));
  const endColumn = String.fromCharCode(64 + Math.max(1, header.length));
  sheet.getRange(`A1:${endColumn}1`).values = [header];
  if (values.length > 0) sheet.getRange(`A2:${endColumn}${values.length + 1}`).values = values;
  sheet.getRange(`A1:${endColumn}1`).format = { fill: navy, font: { bold: true, color: '#FFFFFF' }, wrapText: true, rowHeight: 34 };
  if (values.length > 0) {
    const table = sheet.tables.add(`A1:${endColumn}${values.length + 1}`, true, `${sheetData.name.replaceAll(' ', '')}Table`);
    table.showFilterButton = true;
    table.showBandedColumns = false;
    sheet.getRange(`A2:${endColumn}${values.length + 1}`).format = { wrapText: true, verticalAlignment: 'top' };
  }
  sheet.getRange(`A:${endColumn}`).format.columnWidth = 22;
  sheet.getRange(`A:A`).format.columnWidth = 18;
  sheet.getRange(`B:B`).format.columnWidth = 34;
  sheet.getRange(`C:${endColumn}`).format.columnWidth = 24;
  sheet.freezePanes.freezeRows(1);
}

// All referenced worksheets exist before cross-sheet formulas are written.
summary.getRange('B7').formulas = [["=COUNTIF('Evidence Validation'!K2:K1000,\"VALIDATED_SUPPORTED\")"]];
summary.getRange('B8').formulas = [["=COUNTIF('Evidence Validation'!K2:K1000,\"SELF_REPORTED\")+COUNTIF('Evidence Validation'!K2:K1000,\"NOT_VALIDATED_INSUFFICIENT\")"]];

const scan = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 300 }, summary: 'Comprehensive workbook formula error scan' });
const summaryInspect = await workbook.inspect({ kind: 'table', range: 'Summary!A1:F10', include: 'values,formulas', tableMaxRows: 12, tableMaxCols: 8 });
const qa = { fixture: fixture.label, sheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length, columns: sheet.columns.length })), formulaErrorScan: scan.ndjson, summaryInspect: summaryInspect.ndjson };
await fs.writeFile(path.join(outputDir, 'comprehensive-register-qa.json'), JSON.stringify(qa, null, 2));

for (const sheetData of ['Summary', ...sheets.map((sheet) => sheet.name)]) {
  const preview = await workbook.render({ sheetName: sheetData, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(path.join(outputDir, `${sheetData.toLowerCase().replaceAll(' ', '-')}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, 'comprehensive-annotated-register.xlsx'));
console.log(JSON.stringify({ output: path.join(outputDir, 'comprehensive-annotated-register.xlsx'), previewDir: outputDir, qa }, null, 2));

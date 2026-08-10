import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ComprehensiveDeliveryModel } from './types';
import { buildComprehensiveRegisterSheets } from './register';

function artifactTool() {
  const moduleRoot = process.env.CODEX_NODE_MODULES;
  if (!moduleRoot) throw new Error('artifact_tool_runtime_unavailable');
  const requireFromBundle = createRequire(path.join(moduleRoot, 'package.json'));
  return requireFromBundle('@oai/artifact-tool') as any;
}

function excelColumn(index: number) {
  let number = index + 1;
  let result = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

/** Production workbook path: uses the bundled artifact-tool runtime and returns the exact XLSX bytes. */
export async function buildComprehensiveRegisterWorkbookBytes(model: ComprehensiveDeliveryModel): Promise<Buffer> {
  const { Workbook, SpreadsheetFile } = artifactTool();
  const workbook = Workbook.create();
  const navy = '#142f4c';
  const pale = '#f3f6f8';
  const grid = '#d9e1e7';
  const summary = workbook.worksheets.add('Summary');
  summary.showGridLines = false;
  summary.getRange('A1:F1').merge();
  summary.getRange('A1').values = [['MK Fraud Readiness · Comprehensive annotated register']];
  summary.getRange('A1:F1').format = { fill: navy, font: { bold: true, color: '#FFFFFF', size: 16 }, rowHeight: 30 };
  summary.getRange('A3:B8').values = [
    ['Review organisation', model.analytical.organisationName],
    ['Named reviewer', `${model.reviewerInput.reviewer.name} · ${model.reviewerInput.reviewer.role}`],
    ['Review date', model.reviewerInput.reviewer.reviewDate],
    ['Deterministic readiness', model.analytical.score.overallScore],
    ['Validated / supported evidence', model.validationSummary.validatedSupported],
    ['Unresolved evidence', model.validationSummary.unresolved]
  ];
  summary.getRange('A3:A8').format = { fill: pale, font: { bold: true, color: navy } };
  summary.getRange('A3:B8').format.borders = { preset: 'outside', style: 'thin', color: grid };
  summary.getRange('D3:F3').merge();
  summary.getRange('D3').values = [['Status vocabulary']];
  summary.getRange('D3:F3').format = { fill: '#c77b35', font: { bold: true, color: '#FFFFFF' } };
  summary.getRange('D4:F10').values = [
    ['SELF_REPORTED', 'Recorded assessment answer', 'Not independently supported'],
    ['EVIDENCE_REVIEWED', 'Artefact examined', 'Not automatically validated'],
    ['VALIDATED_SUPPORTED', 'Named reviewer support', 'Only for stated scope'],
    ['NOT_VALIDATED_INSUFFICIENT', 'Evidence limitation', 'Reliance remains bounded'],
    ['NOT_SUPPORTED / NOT_APPLICABLE', 'Reviewer conclusion', 'Distinct from insufficient'],
    ['Backend lifecycle', 'not_requested → received', 'Not equivalent to support'],
    ['Reviewer judgement', 'Human interpretation', 'Separate from evidence status']
  ];
  summary.getRange('D4:F10').format = { wrapText: true, borders: { preset: 'all', style: 'thin', color: grid } };
  summary.getRange('A:A').format.columnWidth = 30;
  summary.getRange('B:B').format.columnWidth = 34;
  summary.getRange('C:C').format.columnWidth = 3;
  summary.getRange('D:D').format.columnWidth = 28;
  summary.getRange('E:E').format.columnWidth = 32;
  summary.getRange('F:F').format.columnWidth = 30;
  summary.freezePanes.freezeRows(2);

  const sheets = buildComprehensiveRegisterSheets(model);
  for (const sheetData of sheets) {
    const sheet = workbook.worksheets.add(sheetData.name);
    sheet.showGridLines = false;
    const headers = sheetData.columns;
    const endColumn = excelColumn(headers.length - 1);
    const values = sheetData.rows.map((row) => headers.map((column) => row[column] ?? null));
    sheet.getRange(`A1:${endColumn}1`).values = [headers];
    if (values.length) sheet.getRange(`A2:${endColumn}${values.length + 1}`).values = values;
    sheet.getRange(`A1:${endColumn}1`).format = { fill: navy, font: { bold: true, color: '#FFFFFF' }, wrapText: true, rowHeight: 34 };
    if (values.length) {
      const table = sheet.tables.add(`A1:${endColumn}${values.length + 1}`, true, `${sheetData.name.replaceAll(' ', '')}Table`);
      table.showFilterButton = true;
      sheet.getRange(`A2:${endColumn}${values.length + 1}`).format = { wrapText: true, verticalAlignment: 'top' };
    }
    sheet.getRange(`A:${endColumn}`).format.columnWidth = 22;
    sheet.getRange('A:A').format.columnWidth = 18;
    sheet.getRange('B:B').format.columnWidth = 34;
    sheet.getRange(`C:${endColumn}`).format.columnWidth = 24;
    sheet.freezePanes.freezeRows(1);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mk-comprehensive-register-'));
  const outputPath = path.join(tempDir, 'register.xlsx');
  try {
    const output = await SpreadsheetFile.exportXlsx(workbook);
    await output.save(outputPath);
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { supportingRegisterSheetData } from '../../src/lib/reports/supporting-register-workbook.ts';

const moduleRoot = process.env.CODEX_NODE_MODULES ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const requireFromBundle = createRequire(path.join(moduleRoot, 'package.json'));
const { SpreadsheetFile, Workbook } = requireFromBundle('@oai/artifact-tool');
const outputDir = path.resolve(process.env.ESSENTIAL_OUTPUT_DIR ?? 'outputs/commercial-quality');
await fs.mkdir(outputDir, { recursive: true });

const orderReference = process.env.ESSENTIAL_ORDER_REFERENCE ?? 'MKORD-2026-22FF6B69';
const data = await assembleReportData(orderReference);
const model = buildAdvisoryEvidenceModel(data);
const projection = buildEssentialProjection(data, model);
const built = supportingRegisterSheetData(data, model);
const sheets = [...built.sheets, 'Control Improvements'];
const rows = [...built.data, built.controlImprovements.rows];
const schemas = [...built.schemas, built.controlImprovements.schema];
const workbook = Workbook.create();
const navy = '#142f4c';
const pale = '#f3f6f8';
const grid = '#d9e1e7';

function columnName(index) {
  let n = index + 1; let out = '';
  while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

for (let index = 0; index < sheets.length; index += 1) {
  const sheet = workbook.worksheets.add(sheets[index]);
  sheet.showGridLines = false;
  const schemaHeaders = schemas[index].map((column) => column.header);
  const headers = schemaHeaders.map((header) => header
    .replace(/\btested\b/gi, 'validated')
    .replace(/\btesting\b/gi, 'validation')
    .replace(/\btest\b/gi, 'validation'));
  const values = rows[index].map((row) => schemaHeaders.map((header) => {
    const column = schemas[index].find((entry) => entry.header === header);
    return column?.cell(row) ?? null;
  }));
  const end = columnName(headers.length - 1);
  sheet.getRange(`A1:${end}1`).values = [headers];
  if (values.length) sheet.getRange(`A2:${end}${values.length + 1}`).values = values;
  sheet.getRange(`A1:${end}1`).format = { fill: navy, font: { bold: true, color: '#FFFFFF' }, wrapText: true, rowHeight: 34 };
  if (values.length) {
    const table = sheet.tables.add(`A1:${end}${values.length + 1}`, true, `${sheets[index].replaceAll(' ', '')}Table`);
    table.showFilterButton = true;
    table.showBandedColumns = false;
    sheet.getRange(`A2:${end}${values.length + 1}`).format = { wrapText: true, verticalAlignment: 'top' };
  }
  sheet.getRange(`A:${end}`).format.columnWidth = 22;
  sheet.getRange('A:A').format.columnWidth = 20;
  sheet.getRange('B:B').format.columnWidth = 32;
  sheet.getRange(`C:${end}`).format.columnWidth = 24;
  sheet.freezePanes.freezeRows(1);
}

const qa = {
  source: 'persisted Rivonia assessment',
  orderReference,
  sheets: sheets.map((name, index) => ({ name, rows: rows[index].length, columns: schemas[index].length })),
  universe: {
    findings: model.materialFindings.length,
    risks: model.riskRegister.length,
    controlImprovements: model.controlImprovements.length,
    evidenceChecklist: model.evidenceChecklist.length,
    roadmapActions: model.roadmapActions.length,
    functionalAgenda: model.functionalAgenda.length,
    questionTraces: data.questionTraces.length,
    projectionRoadmapActions: projection.roadmapActions.length
  }
};
await fs.writeFile(path.join(outputDir, 'essential-register-qa.json'), JSON.stringify(qa, null, 2));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, 'essential-supporting-register.xlsx'));
for (const name of sheets) {
  try {
    const preview = await workbook.render({ sheetName: name, autoCrop: 'all', scale: Number(process.env.RENDER_SCALE ?? 0.25), format: 'png' });
    await fs.writeFile(path.join(outputDir, `${name.toLowerCase().replaceAll(' ', '-')}.png`), new Uint8Array(await preview.arrayBuffer()));
  } catch (error) {
    await fs.writeFile(path.join(outputDir, `${name.toLowerCase().replaceAll(' ', '-')}.render-error.txt`), String(error?.message ?? error));
  }
}
console.log(JSON.stringify({ output: path.join(outputDir, 'essential-supporting-register.xlsx'), qa }, null, 2));

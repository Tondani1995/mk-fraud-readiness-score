// Render and inspect every sheet in the provider-free product-acceptance workbook.
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, SpreadsheetFile } from '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const root = path.resolve('outputs/product-acceptance-v12-repaired-20260821');
const workbookPath = path.join(root, 'RPT-MKFRS-CEDAR-RIDGE-FIXTURE-V2-comprehensive-supporting-register-repaired.xlsx');
const renderDir = path.join(root, 'xlsx-renders');
await fs.mkdir(renderDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const sheetInspection = await workbook.inspect({ kind: 'sheet', include: 'id,name' });
const sheetNames = workbook.worksheets.items.map((sheet) => sheet.name);
const renders = [];
for (const sheetName of sheetNames) {
  const inspection = await workbook.inspect({ kind: 'region,computedStyle', sheetId: sheetName, range: 'A1:K8', maxChars: 5000, tableMaxRows: 8, tableMaxCols: 11, tableMaxCellChars: 160 });
  const blob = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  const fileName = `${sheetName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.png`;
  await fs.writeFile(path.join(renderDir, fileName), new Uint8Array(await blob.arrayBuffer()));
  renders.push({ sheetName, file: path.join(renderDir, fileName), inspection });
}
const audit = { workbookPath, sheetNames, sheetInspection, renders, visualInspectionRequired: true };
await fs.writeFile(path.join(root, 'workbook-usability-inspection.json'), JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ sheetNames, renderDir, inspectionFile: path.join(root, 'workbook-usability-inspection.json') }, null, 2));

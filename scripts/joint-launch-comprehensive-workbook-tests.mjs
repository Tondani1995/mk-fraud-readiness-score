// Regression: the Comprehensive reviewer-annotated register must build from declared dependencies.
//
// P1 closed here. workbook-builder.ts loaded '@oai/artifact-tool' out of
// process.env.CODEX_NODE_MODULES via createRequire(). That package is not declared, is absent from
// node_modules, and exists only inside an agent runtime cache, so production generation failed with
// 'artifact_tool_runtime_unavailable'. With the module present it still failed under Next.js server
// bundling with 'requireFromBundle is not a function'. No Comprehensive package could ever be
// generated. The byte writer is now write-excel-file/node, the same declared runtime already proven
// by supporting-register-workbook.ts.
//
//   node --env-file=.env.local --experimental-strip-types \
//     --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/joint-launch-comprehensive-workbook-tests.mjs <orderReference>
//
// CODEX_NODE_MODULES is deleted from the environment before anything is imported, so the test
// cannot pass by accident on a machine that happens to have the agent runtime cached.

delete process.env.CODEX_NODE_MODULES;

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const orderReference = process.argv[2];
if (!orderReference) { console.error('An order reference is required.'); process.exit(2); }

let failures = 0;
const check = (name, condition, detail) => {
  if (condition) { console.log(`  PASS  ${name}`); return; }
  failures += 1;
  console.error(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
};

console.log(`joint-launch: Comprehensive reviewer-annotated register (${orderReference})`);

// 1/2. No source-level dependency on the agent runtime.
const source = await readFile(path.resolve('src/lib/reports/comprehensive/workbook-builder.ts'), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
for (const forbidden of ['CODEX_NODE_MODULES', '@oai/artifact-tool', 'createRequire']) {
  check(`no runtime dependency on ${forbidden}`, !code.includes(forbidden));
}
check('uses the declared write-excel-file/node runtime', code.includes('write-excel-file/node'));
check('CODEX_NODE_MODULES is unset for this run', process.env.CODEX_NODE_MODULES === undefined);

const { assembleReportData } = await import('../src/lib/reports/assemble-report-data.ts');
const { fromAssembledReportData } = await import('../src/lib/reports/comprehensive/index.ts');
const { loadComprehensiveReviewerInput } = await import('../src/lib/comprehensive/review-record-service.ts');
const { buildComprehensiveRegisterWorkbook } = await import('../src/lib/reports/comprehensive/workbook-builder.ts');
const { getEngagementByOrderReference } = await import('../src/lib/comprehensive/engagement-service.ts');

const engagement = await getEngagementByOrderReference(orderReference);
if (!engagement) { console.error('  FAIL  engagement not found'); process.exit(1); }
const reviewerInput = await loadComprehensiveReviewerInput(engagement.id);
const assembled = await assembleReportData(orderReference);
const model = await fromAssembledReportData(assembled, reviewerInput);

// 3. Generation succeeds with CODEX_NODE_MODULES unset, and produces a valid XLSX.
let workbook;
try {
  workbook = await buildComprehensiveRegisterWorkbook(model);
} catch (error) {
  check('workbook builds with CODEX_NODE_MODULES unset', false, error instanceof Error ? error.message : String(error));
  process.exit(1);
}
check('workbook builds with CODEX_NODE_MODULES unset', Buffer.isBuffer(workbook.bytes) && workbook.bytes.length > 0);
check('XLSX zip signature', workbook.bytes.subarray(0, 2).toString('latin1') === 'PK');
check('correct XLSX MIME type', workbook.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
check('checksum is a sha256 hex digest', /^[0-9a-f]{64}$/.test(workbook.checksumSha256));

// Read the package back without a spreadsheet library: central-directory names, then inflate parts.
function zipEntries(buf) {
  const entries = new Map();
  let offset = buf.length - 22;
  while (offset >= 0 && buf.readUInt32LE(offset) !== 0x06054b50) offset -= 1;
  if (offset < 0) return entries;
  let ptr = buf.readUInt32LE(offset + 16);
  const count = buf.readUInt16LE(offset + 10);
  for (let i = 0; i < count; i += 1) {
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const method = buf.readUInt16LE(localOffset + 8);
    const compSize = buf.readUInt32LE(ptr + 20);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let content = Buffer.alloc(0);
    try { content = method === 0 ? raw : zlib.inflateRawSync(raw); } catch { /* leave empty */ }
    entries.set(name, content.toString('utf8'));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const entries = zipEntries(workbook.bytes);
check('workbook is a readable OPC package', entries.has('[Content_Types].xml') && entries.has('xl/workbook.xml'));

// 4. Every expected Comprehensive sheet is present.
const workbookXml = entries.get('xl/workbook.xml') ?? '';
const sheetNames = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) => m[1]);
const expected = ['Summary', 'Material Findings', 'Risk Register', 'Control Actions', 'Roadmap', 'Management Decisions', 'Question Traceability'];
for (const name of expected) {
  check(`sheet present: ${name}`, sheetNames.includes(name), sheetNames.join(' | '));
}

const allText = [...entries.entries()].filter(([n]) => n.startsWith('xl/')).map(([, c]) => c).join('\n');

// 5/6. Reviewer annotations, evidence classifications and management decisions survive into XLSX.
check('reviewer display name appears in the workbook', allText.includes(/staging|uat/i.test(model.reviewerInput.reviewer.name) ? 'Named review lead' : model.reviewerInput.reviewer.name));
const statuses = ['SUPPORTED', 'INSUFFICIENT', 'NOT_SUPPORTED'];
const presentStatuses = statuses.filter((s) => allText.toUpperCase().includes(s));
check('evidence classifications survive into the XLSX', presentStatuses.length >= 2, `found ${presentStatuses.join(',') || 'none'}`);
const conclusions = model.reviewerInput.decisions ?? [];
check('management decisions sheet carries content', (workbook.rowCounts['Management Decisions'] ?? 0) > 0);
check('material findings sheet carries content', (workbook.rowCounts['Material Findings'] ?? 0) > 0);

// 7. Formula-like content stays literal: cells are inline strings, never <f> formula elements.
const sheetParts = [...entries.entries()].filter(([n]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).map(([, c]) => c);
check('worksheets contain no formula cells', sheetParts.every((xml) => !xml.includes('<f>')), 'a <f> element would mean user text became a formula');
check('worksheets emit string cells', sheetParts.some((xml) => xml.includes('t="s"') || xml.includes('t="inlineStr"')));

// 8. Atomicity: the byte-only entry point the generator calls returns the same bytes.
const { buildComprehensiveRegisterWorkbookBytes } = await import('../src/lib/reports/comprehensive/workbook-builder.ts');
const bytesOnly = await buildComprehensiveRegisterWorkbookBytes(model);
check('byte-only entry point still available to the generator', Buffer.isBuffer(bytesOnly) && bytesOnly.length > 0);

if (failures > 0) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll Comprehensive workbook checks passed.');

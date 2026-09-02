#!/usr/bin/env node
/**
 * Provider-free owner-review workbook authoring for the current Comprehensive path.
 *
 * The production byte path remains write-excel-file/node. This script is a bounded
 * standalone QA/owner-review artifact authoring path and deliberately uses the
 * spreadsheet skill's artifact-tool runtime so every worksheet can be inspected and
 * rendered before handoff.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildComprehensiveRegisterSheets } from '../../src/lib/reports/comprehensive/register.ts';
import { MK_TOKENS } from '../../src/lib/reports/design/tokens.ts';

const moduleRoot = process.env.CODEX_NODE_MODULES ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const requireFromBundle = createRequire(path.join(moduleRoot, 'package.json'));
const { SpreadsheetFile, Workbook } = requireFromBundle('@oai/artifact-tool');
const outputDir = path.resolve(process.env.CURRENT_COMPREHENSIVE_OUTPUT_DIR ?? path.join(process.cwd(), 'outputs', 'comprehensive-current-path'));
const previewRoot = path.join(outputDir, 'workbook-previews');
const previewScale = Number(process.env.RENDER_SCALE ?? 0.25);
const profileKeys = (process.env.COMPREHENSIVE_PROFILE_KEYS ?? 'motheo,bokamoso').split(',').map((value) => value.trim().toLowerCase()).filter((value) => ['motheo', 'bokamoso'].includes(value));
if (!profileKeys.length) throw new Error('COMPREHENSIVE_PROFILE_KEYS must include at least one supported profile.');

const SHEET_NAMES = [
  'Read me',
  'Summary',
  'Material Findings',
  'Risk Register',
  'Control Blueprints',
  'Implementation Blueprint',
  'Management Decisions',
  'Question Traceability'
];

function analyticalFor(data, evidenceModel) {
  return {
    assembled: data,
    evidenceModel,
    score: {
      overallScore: data.scoreRun.overallScore,
      calculatedMaturity: data.scoreRun.calculatedMaturity,
      finalMaturity: data.scoreRun.finalMaturity,
      exposureScore: data.scoreRun.exposureScore,
      exposureBand: data.scoreRun.exposureBand,
      coveragePct: data.scoreRun.coveragePct,
      nARatePct: data.scoreRun.nARatePct,
      criticalGapCount: data.scoreRun.criticalGapCount,
      majorGapCount: data.scoreRun.majorGapCount,
      capApplied: data.scoreRun.capApplied,
      capReason: data.scoreRun.capReason,
      methodologyVersionId: data.scoreRun.methodologyVersionId
    },
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    generatedAt: data.generatedAt
  };
}

function excelColumn(index) {
  let number = index + 1;
  let result = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function friendlyHeader(column) {
  return column
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^(?:id|technical id)$/i, 'Technical ID')
    .replace(/^question code$/i, 'Question code (technical)')
    .replace(/^source refs$/i, 'Source references (technical)')
    .replace(/^proof ref$/i, 'Proof reference (technical)')
    .replace(/^linked (finding|risk|control) ids?$/i, 'Linked $1 IDs (technical)')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function value(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function rowsToValues(rows, columns) {
  return rows.map((row) => columns.map((column) => value(row[column])));
}

function workbookDate(value) {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(parsed.getTime())) return value;
  // Store a numeric Excel date with an explicit number format below. The
  // artifact-tool renderer then displays a date/time rather than serial text.
  return (parsed.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function readMeRows(factPack) {
  return [
    ['Workbook purpose', 'Comprehensive Fraud Readiness Strategy and Control Blueprint', 'Companion record for management use alongside the report.'],
    ['Customer basis', "The workbook is grounded in management's recorded Fraud Readiness assessment responses.", 'It does not independently verify operating effectiveness.'],
    ['Current product mode', factPack.narrativeMode, factPack.narrativeMode === 'SUSTAINMENT' ? 'Preserve and monitor the recorded positive position.' : 'Remediate the recorded material weaknesses.'],
    ['Assessment reference', factPack.assessment.reference, 'Reference used in the accompanying report.'],
    ['How to read', 'Start with Summary, then review findings and risks, control blueprints, management decisions and the Implementation Blueprint.', 'Use the detailed records to assign ownership, timing, proof and review.'],
    ['Implementation Blueprint', 'The Implementation Blueprint records sequenced work, maturation steps and the management records that show progress.', 'Use the period, owner, dependency, proof and measure fields together.'],
    ['Sustainment sequence', 'PRESERVE → EMBED → MEASURE → OPTIMISE', 'Positive-state operating language; not a weakness register.'],
    ['Enterprise integration', 'The report links the recorded domains, management priorities, decision routes and review signals.', 'Use the linked outcomes and dependencies to keep management attention connected.'],
    ['Resilience checks', 'Conditional checks show when management should revisit the recorded standard after material change.', 'These are forward-looking review prompts, not findings.'],
    ['Traceability', 'Question codes and source references are retained to support review and follow-through.', 'Use the assessment reference when discussing a record.']
  ];
}

function exposureSummary(score) {
  const exposureScore = score?.exposureScore;
  const exposureBand = String(score?.exposureBand ?? '').trim();
  const hasScore = exposureScore !== null && exposureScore !== undefined && exposureScore !== '';
  const hasBand = exposureBand && !/not supplied|not applicable|unknown/i.test(exposureBand);
  if (!hasScore && !hasBand) return null;
  return [hasScore ? String(exposureScore) : '', hasBand ? exposureBand : ''].filter(Boolean).join(' · ');
}

function buildWorkbookData(model, factPack, blueprint, registerSheets) {
  const readMeColumns = ['field', 'value', 'note'];
  const summaryColumns = ['field', 'value', 'note'];
  const summaryRows = [
    ['Organisation', model.analytical.organisationName, ''],
    ['Assessment reference', model.analytical.assessmentReference, 'Reference used in the accompanying report.'],
    ['Product mode', factPack.narrativeMode, 'The treatment route for this assessment.'],
    ['Readiness score', model.analytical.score.overallScore, 'Recorded assessment score; the accompanying report interpretation does not alter it.'],
    ['Final maturity', model.analytical.score.finalMaturity, ''],
    ['Material findings', null, 'Number of material findings in this report.'],
    ['Risk register rows', null, 'Number of risk records in this report.'],
    ['Control blueprint rows', null, 'Number of control blueprints.'],
    ['Implementation rows', null, 'Number of implementation records.'],
    ['Leadership decisions', null, 'Number of management decisions.'],
    ['Question traces', null, 'Number of assessment question traces.'],
    ['Enterprise integration relationships', factPack.enterpriseIntegrationMap?.dependencies.length ?? 0, 'Recorded relationships connecting domains, decisions, controls and outcomes.'],
    ['Assurance coverage rows', factPack.assuranceCoverage?.length ?? 0, 'Recorded domain coverage used to keep the full profile in view.'],
    ['Context applications', factPack.contextApplications?.length ?? 0, 'Selective context links with an analytical consequence and management implication.'],
    ['Conditional resilience checks', factPack.resilienceTests?.length ?? 0, 'Forward-looking checks linked to recorded change conditions.'],
    ['Control-to-outcome links', factPack.controlOutcomeLinks?.length ?? 0, 'Links between each sustainment control, its decision route and protected outcome.'],
    ['Total detailed records', null, 'Formula sum across the detailed records.'],
    ['Scoring method reference', model.analytical.score.methodologyVersionId, 'Reference for the recorded result.'],
    ['Generated', workbookDate(model.analytical.generatedAt), 'Workbook generation time.']
  ];
  const exposure = exposureSummary(model.analytical.score);
  if (exposure) summaryRows.splice(5, 0, ['Exposure position', exposure, 'Recorded exposure position where supplied.']);
  return [
    { name: 'Read me', columns: readMeColumns, rows: readMeRows(factPack).map(([field, cellValue, note]) => ({ field, value: cellValue, note })) },
    { name: 'Summary', columns: summaryColumns, rows: summaryRows.map(([field, cellValue, note]) => ({ field, value: cellValue, note })) },
    ...registerSheets
  ];
}

function styleSheet(sheet, sheetData, colors) {
  sheet.showGridLines = false;
  const endColumn = excelColumn(sheetData.columns.length - 1);
  sheet.getRange(`A1:${endColumn}1`).format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 10 },
    wrapText: true,
    rowHeight: 34
  };
  sheet.getRange(`A:${endColumn}`).format.columnWidth = 22;
  sheet.getRange('A:A').format.columnWidth = 24;
  sheet.getRange('B:B').format.columnWidth = 38;
  if (sheetData.columns.length > 2) sheet.getRange(`C:${endColumn}`).format.columnWidth = 25;
  sheet.freezePanes.freezeRows(1);
}

async function buildForProfile(profileKey) {
  const { data } = buildV12ProfileAssembled(profileKey);
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const model = buildComprehensiveDeliveryModel(analyticalFor(data, evidenceModel));
  assertComprehensiveBlueprintContract(model);
  const factPack = buildComprehensiveNarrativeFactPack(model);
  assertNarrativeFactPack(factPack);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  assertReportBlueprint(blueprint, factPack);
  const registerSheets = buildComprehensiveRegisterSheets(model, factPack).map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, cell]) => [key, value(cell)])))
  }));
  const workbookData = buildWorkbookData(model, factPack, blueprint, registerSheets);
  assert.deepEqual(workbookData.map((sheet) => sheet.name), SHEET_NAMES);

  const workbook = Workbook.create();
  const colors = { navy: MK_TOKENS.navy900, navy700: MK_TOKENS.navy700, green: MK_TOKENS.confirmed, brass: MK_TOKENS.brass, rule: MK_TOKENS.rule, cream: MK_TOKENS.cream, white: MK_TOKENS.white };
  const worksheets = new Map();

  for (const sheetData of workbookData) {
    const sheet = workbook.worksheets.add(sheetData.name);
    worksheets.set(sheetData.name, sheet);
    const endColumn = excelColumn(sheetData.columns.length - 1);
    const values = rowsToValues(sheetData.rows, sheetData.columns);
    sheet.getRange(`A1:${endColumn}1`).values = [sheetData.columns.map(friendlyHeader)];
    if (values.length) sheet.getRange(`A2:${endColumn}${values.length + 1}`).values = values;
    styleSheet(sheet, sheetData, colors);
    if (values.length && !['Read me', 'Summary'].includes(sheetData.name)) {
      const tableName = `${sheetData.name.replace(/[^A-Za-z0-9]/g, '')}Table`;
      const table = sheet.tables.add(`A1:${endColumn}${values.length + 1}`, true, tableName);
      table.showFilterButton = true;
      table.showBandedColumns = false;
      sheet.getRange(`A2:${endColumn}${values.length + 1}`).format = { wrapText: true, verticalAlignment: 'top' };
    }
  }

  const readMe = worksheets.get('Read me');
  readMe.getRange('A1:C1').format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 12 }, rowHeight: 30 };
  const readMeRowCount = workbookData.find((sheet) => sheet.name === 'Read me')?.rows.length ?? 0;
  readMe.getRange(`A2:A${readMeRowCount + 1}`).format = { fill: colors.cream, font: { bold: true, color: colors.navy700 } };
  readMe.getRange(`A1:C${readMeRowCount + 1}`).format.borders = { preset: 'all', style: 'thin', color: colors.rule };

  const summary = worksheets.get('Summary');
  summary.getRange('A1:F1').merge();
  summary.getRange('A1').values = [[`MK Fraud Insights · Comprehensive workbook · ${factPack.assessment.reference}`]];
  summary.getRange('A1:F1').format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 15 }, rowHeight: 32 };
  summary.getRange('A2:C2').format = { fill: colors.brass, font: { bold: true, color: colors.white } };
  const summaryData = workbookData.find((sheet) => sheet.name === 'Summary');
  const summaryRowCount = summaryData?.rows.length ?? 0;
  summary.getRange(`A2:A${summaryRowCount + 1}`).format = { fill: colors.cream, font: { bold: true, color: colors.navy700 } };
  summary.getRange(`A1:C${summaryRowCount + 1}`).format.borders = { preset: 'all', style: 'thin', color: colors.rule };
  summary.getRange('E3:G3').merge();
  summary.getRange('E3').values = [['Semantic palette']];
  summary.getRange('E3:G3').format = { fill: colors.brass, font: { bold: true, color: colors.white } };
  summary.getRange('E4:G7').values = [
    ['Navy', colors.navy, 'Structure and identity'],
    ['Green', colors.green, 'Positive Strategic / Sustainment state'],
    ['Brass', colors.brass, 'Restrained accent only'],
    ['Amber', 'Deterioration signal only', 'Not a general MK accent']
  ];
  summary.getRange('E4:E7').format = { font: { bold: true, color: colors.navy700 } };
  summary.getRange('E3:G7').format.borders = { preset: 'all', style: 'thin', color: colors.rule };
  summary.getRange('E:E').format.columnWidth = 24;
  summary.getRange('F:F').format.columnWidth = 31;
  summary.getRange('G:G').format.columnWidth = 28;
  summary.freezePanes.freezeRows(2);

  const summaryRow = (field) => (summaryData?.rows.findIndex((row) => row.field === field) ?? -1) + 2;
  const summaryCell = (field) => `B${summaryRow(field)}`;

  const counts = {
    findings: workbookData.find((sheet) => sheet.name === 'Material Findings'),
    risks: workbookData.find((sheet) => sheet.name === 'Risk Register'),
    controls: workbookData.find((sheet) => sheet.name === 'Control Blueprints'),
    implementation: workbookData.find((sheet) => sheet.name === 'Implementation Blueprint'),
    decisions: workbookData.find((sheet) => sheet.name === 'Management Decisions'),
    traces: workbookData.find((sheet) => sheet.name === 'Question Traceability')
  };
  const firstDataRow = (sheetData) => `A2:A${Math.max(2, sheetData.rows.length + 1)}`;
  summary.getRange(summaryCell('Material findings')).formulas = [[`=COUNTA('Material Findings'!${firstDataRow(counts.findings)})`]];
  summary.getRange(summaryCell('Risk register rows')).formulas = [[`=COUNTA('Risk Register'!${firstDataRow(counts.risks)})`]];
  summary.getRange(summaryCell('Control blueprint rows')).formulas = [[`=COUNTA('Control Blueprints'!${firstDataRow(counts.controls)})`]];
  summary.getRange(summaryCell('Implementation rows')).formulas = [[`=COUNTA('Implementation Blueprint'!${firstDataRow(counts.implementation)})`]];
  summary.getRange(summaryCell('Leadership decisions')).formulas = [[`=COUNTA('Management Decisions'!${firstDataRow(counts.decisions)})`]];
  summary.getRange(summaryCell('Question traces')).formulas = [[`=COUNTA('Question Traceability'!${firstDataRow(counts.traces)})`]];
  const firstCountRow = summaryRow('Material findings');
  const lastCountRow = summaryRow('Question traces');
  summary.getRange(summaryCell('Total detailed records')).formulas = [[`=SUM(B${firstCountRow}:B${lastCountRow})`]];
  summary.getRange(`B${firstCountRow}:B${summaryRow('Total detailed records')}`).format = { font: { bold: true, color: colors.navy700 } };
  summary.getRange(summaryCell('Readiness score')).setNumberFormat('0.0');
  summary.getRange(summaryCell('Generated')).setNumberFormat('yyyy-mm-dd hh:mm');
  const formulaCells = [
    'Material findings', 'Risk register rows', 'Control blueprint rows', 'Implementation rows',
    'Leadership decisions', 'Question traces', 'Total detailed records'
  ].map((field) => `Summary!${summaryCell(field)}`);

  const formulaScan = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 300 }, summary: 'Current Comprehensive workbook formula error scan' });
  const summaryInspect = await workbook.inspect({ kind: 'table', range: `Summary!A1:G${Math.max(18, summaryRowCount + 1)}`, include: 'values,formulas', tableMaxRows: 20, tableMaxCols: 8 });
  const sheetInspects = [];
  for (const sheetData of workbookData) {
    const endColumn = excelColumn(sheetData.columns.length - 1);
    const inspection = await workbook.inspect({
      kind: 'table',
      range: `'${sheetData.name}'!A1:${endColumn}${Math.max(1, sheetData.rows.length + 1)}`,
      include: 'values,formulas',
      tableMaxRows: Math.max(20, sheetData.rows.length + 1),
      tableMaxCols: Math.max(8, sheetData.columns.length),
      summary: `Rendered ${sheetData.name} inspection`
    });
    sheetInspects.push({ sheet: sheetData.name, inspection: inspection.ndjson ?? inspection });
  }
  const previewDir = path.join(previewRoot, profileKey);
  await fs.mkdir(previewDir, { recursive: true });
  const previews = [];
  for (const name of SHEET_NAMES) {
    const preview = await workbook.render({ sheetName: name, autoCrop: 'all', scale: previewScale, format: 'png' });
    const previewPath = path.join(previewDir, `${name.toLowerCase().replaceAll(' ', '-')}.png`);
    await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
    previews.push({ sheet: name, path: previewPath });
  }

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  const xlsxName = `MK-Comprehensive-${profileKey === 'motheo' ? 'Motheo' : 'Bokamoso'}-owner-review.xlsx`;
  const xlsxPath = path.join(outputDir, xlsxName);
  await xlsx.save(xlsxPath);
  const bytes = await fs.readFile(xlsxPath);
  const qa = {
    status: 'PASS',
    profile: profileKey,
    providerCalls: 0,
    workbook: { path: xlsxPath, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
    sheets: workbookData.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length, columns: sheet.columns.length })),
    formulaCells,
    formulaErrorScan: formulaScan.ndjson ?? formulaScan,
    summaryInspect: summaryInspect.ndjson ?? summaryInspect,
    sheetInspects,
    renderedSheets: previews.map((preview) => preview.sheet),
    previewDir,
    deterministic: { narrativeMode: factPack.narrativeMode, score: factPack.assessment.score, blueprintChapters: blueprint.chapters.length }
  };
  await fs.writeFile(path.join(outputDir, `MK-Comprehensive-${profileKey}-workbook-qa.json`), `${JSON.stringify(qa, null, 2)}\n`);
  return { profileKey, qa, xlsxPath, previews, factPack, blueprint, model };
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewRoot, { recursive: true });
const results = [];
for (const profileKey of profileKeys) results.push(await buildForProfile(profileKey));

console.log(JSON.stringify({
  status: 'PASS',
  gate: 'comprehensive-current-workbooks',
  providerCalls: 0,
  sheetCount: SHEET_NAMES.length,
  workbooks: results.map((result) => result.qa)
}, null, 2));

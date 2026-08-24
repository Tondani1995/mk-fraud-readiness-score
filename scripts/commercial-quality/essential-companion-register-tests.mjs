#!/usr/bin/env node
/**
 * Increment 5 contract for the customer-facing Essential Action & Proof Register.
 *
 * This is deterministic and provider-free. It exercises the frozen Vhutshilo score, the live
 * adapted Essential model, the production workbook bytes, the PDF template projection and the
 * manual fulfilment/atomic SQL boundaries without touching a database or external service.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import readXlsxFile from 'read-excel-file/node';
import { buildVhutshiloEssentialFixture } from './essential-companion-fixture.mjs';
import {
  buildEssentialActionProofRegisterProjection,
  buildEssentialActionRegisterFileName,
  buildEssentialCustomerPdfFileName,
  buildEssentialReportReference,
  customerManagementAction,
  ESSENTIAL_ACTION_REGISTER_HEADERS,
  ESSENTIAL_ACTION_REGISTER_PROMISE,
  ESSENTIAL_ACTION_REGISTER_SHEET_NAME,
  ESSENTIAL_ACTION_REGISTER_STATUS_VALUES,
  ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME,
  assertEssentialPackageComplete,
  EssentialPackageCompletenessError
} from '../../src/lib/reports/essential/action-proof-register.ts';
import { buildEssentialActionProofRegisterWorkbook } from '../../src/lib/reports/essential/action-proof-register-workbook.ts';
import { supportingRegisterSheetData } from '../../src/lib/reports/supporting-register-workbook.ts';
import { selectContent } from '../../src/lib/reports/select-content-blocks.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../../src/lib/reports/roadmap.ts';
import { renderReportHtml } from '../../src/lib/reports/templates/report-template.ts';

const root = process.cwd();
const { data, model, adaptedModel, projection } = buildVhutshiloEssentialFixture();
const canonical = buildEssentialActionProofRegisterProjection({ data, model: adaptedModel, projection });

function assertEvery(values, predicate, message) {
  values.forEach((value, index) => assert.ok(predicate(value), `${message} [${index}]`));
}

function visibleText(rows) {
  return rows.flatMap((row) => row.map((value) => String(value ?? ''))).join(' | ');
}

function source(pathname) {
  return fs.readFileSync(`${root}/${pathname}`, 'utf8');
}

function parseWorkbook(bytes) {
  return readXlsxFile(Readable.from(bytes)).then((sheets) => Object.fromEntries(sheets.map((sheet) => [sheet.sheet, sheet.data])));
}

// ---------------------------------------------------------------------------
// Frozen score and canonical lineage
assert.equal(data.assessmentReference, 'MKFRS-V12-COMP-VHUTSHILO');
assert.equal(data.reportReference, 'RPT-MKFRS-V12-ESS-VHUTSHILO-V1');
assert.equal(data.scoreRun.overallScore, 43.33);
assert.equal(data.scoreRun.finalMaturity, 'Developing');
assert.equal(canonical.reportReference, data.reportReference);
assert.equal(canonical.assessmentReference, data.assessmentReference);
assert.equal(canonical.organisationName, data.organisationName);
assert.equal(canonical.requiredArtefacts.join(','), 'pdf,supporting_register');
assert.equal(canonical.rows.length, projection.roadmapActions.length);
assert.ok(canonical.rows.length > 0 && canonical.rows.length <= 15);
assert.deepEqual(new Set(canonical.rows.map((row) => row.targetPeriod)), new Set(['30 days', '60 days', '90 days']));
assert.deepEqual(canonical.rows.map((row) => row.priorityId), canonical.rows.map((_, index) => `P-${String(index + 1).padStart(2, '0')}`));
assert.equal(new Set(canonical.rows.map((row) => row.priorityTitle)).size, canonical.rows.length);

assertEvery(canonical.rows, (row) => row.priorityTitle.length > 12 && !/D\d+-Q\d+|\bquestion\b/i.test(row.priorityTitle), 'business-quality title');
assertEvery(canonical.rows, (row) => row.assessedCondition && /Recorded response:|Diagnosis:/i.test(row.assessedCondition), 'specific assessed condition');
assertEvery(canonical.rows, (row) => row.priorityRationale && row.priorityRationale.length > 50, 'specific priority rationale');
assertEvery(canonical.rows, (row) => row.managementAction && /Implement the target control design|Independently validate/i.test(row.managementAction), 'specific management action');
assertEvery(canonical.rows, (row) => row.accountableRole && row.targetPeriod, 'owner and target period');
assertEvery(canonical.rows, (row) => row.requiredPopulation && /complete (?:in-scope )?population/i.test(row.requiredPopulation), 'specific required population');
assertEvery(canonical.rows, (row) => row.evidenceToRetain && /Minimum characteristics|Action completion record|dated approval/i.test(row.evidenceToRetain), 'specific evidence to retain');
assertEvery(canonical.rows, (row) => row.completionEffectivenessTest && row.escalationTrigger, 'completion test and escalation trigger');
assertEvery(canonical.rows, (row) => ESSENTIAL_ACTION_REGISTER_STATUS_VALUES.includes(row.status), 'controlled status');
assert.ok(canonical.rows.some((row) => /external service provider|internal procurement/i.test(`${row.priorityRationale} ${row.requiredPopulation}`)), 'governed supplier context is used');
assert.ok(canonical.rows.some((row) => /manufacturing|stock|cash|operating locations/i.test(`${row.priorityRationale} ${row.requiredPopulation}`)), 'governed operating context is used');

// ---------------------------------------------------------------------------
// Production workbook bytes, not only in-memory objects
const workbook = await buildEssentialActionProofRegisterWorkbook(data, adaptedModel, projection);
assert.equal(workbook.fileName, buildEssentialActionRegisterFileName(data.organisationName));
assert.match(workbook.fileName, /^MK_Fraud_Readiness_Essential_Action_Register_[A-Za-z0-9_]+\.xlsx$/);
assert.equal(workbook.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.match(workbook.checksumSha256, /^[0-9a-f]{64}$/);
assert.ok(workbook.bytes.length > 0);
assert.deepEqual(workbook.sheetNames, [ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME, ESSENTIAL_ACTION_REGISTER_SHEET_NAME]);
assert.deepEqual(workbook.rowCounts, { Summary: 13, [ESSENTIAL_ACTION_REGISTER_SHEET_NAME]: canonical.rows.length });

const parsed = await parseWorkbook(workbook.bytes);
assert.deepEqual(Object.keys(parsed), [ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME, ESSENTIAL_ACTION_REGISTER_SHEET_NAME]);
const summaryRows = parsed[ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME];
const registerRows = parsed[ESSENTIAL_ACTION_REGISTER_SHEET_NAME];
assert.equal(summaryRows[0][0], 'Field');
assert.deepEqual(registerRows[0], [...ESSENTIAL_ACTION_REGISTER_HEADERS]);
assert.equal(registerRows.length - 1, canonical.rows.length);
assert.deepEqual(registerRows.slice(1).map((row) => String(row[0])), canonical.rows.map((row) => row.priorityId));
assert.deepEqual(registerRows.slice(1).map((row) => String(row[6])), canonical.rows.map((row) => row.accountableRole));
assert.deepEqual(registerRows.slice(1).map((row) => String(row[7])), canonical.rows.map((row) => row.targetPeriod));
assertEvery(registerRows.slice(1), (row) => /complete (?:in-scope )?population/i.test(String(row[8])), 'XLSX population');
assertEvery(registerRows.slice(1), (row) => String(row[9]).length > 40, 'XLSX retained evidence');
assertEvery(registerRows.slice(1), (row) => String(row[12]) === 'Not started', 'XLSX initial status');
const registerVisibleText = visibleText(registerRows);
assert.doesNotMatch(registerVisibleText, /D\d+-Q\d+|\b(?:Finding|Risk|Control|Evidence) ID\b|Question Trace|raw JSON/i);
assert.doesNotMatch(registerVisibleText, /complete (?:risk|question|evidence) register/i);
const summaryText = visibleText(summaryRows);
assert.match(summaryText, /MKFRS-V12-COMP-VHUTSHILO/);
assert.match(summaryText, /RPT-MKFRS-V12-ESS-VHUTSHILO-V1/);
assert.match(summaryText, /43\.33/);
assert.match(summaryText, /Developing/);

// ---------------------------------------------------------------------------
// PDF/register reconciliation from the same canonical objects
const content = selectContent(data, [], projection);
const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
const html = renderReportHtml(data, content, roadmap, adaptedModel, undefined, projection);
const escapedPromise = ESSENTIAL_ACTION_REGISTER_PROMISE.replace('&', '&amp;');
assert.ok(html.includes(escapedPromise), 'PDF must state the exact focused register promise');
assert.ok(html.includes(canonical.reportReference), 'PDF must carry the Essential report reference');
assert.ok(html.includes(data.organisationName), 'PDF must carry the same organisation');
assert.ok(html.includes(String(data.scoreRun.overallScore)), 'PDF must carry the frozen score');
assert.ok(html.includes(String(data.scoreRun.finalMaturity)), 'PDF must carry the frozen maturity');
assertEvery(canonical.rows, (row) => html.includes(row.priorityId), 'PDF priority ID');
assertEvery(canonical.rows, (row) => html.includes(row.managementAction.slice(0, 55)), 'PDF/register action wording');
assertEvery(canonical.rows, (row) => html.includes(row.accountableRole), 'PDF/register owner');
assertEvery(canonical.rows, (row) => html.includes(row.targetPeriod), 'PDF/register target period');
assert.doesNotMatch(html, /The complete evidence checklist is not reproduced in this report/i);
assert.doesNotMatch(html, /complete finding, risk, control-action, evidence, roadmap and question-trace registers/i);
assert.match(html, /focused Action &amp; Proof Register/);

// ---------------------------------------------------------------------------
// Fulfilment and atomic-package closure
assert.equal(buildEssentialReportReference(data.assessmentReference, 2), 'RPT-MKFRS-V12-ESS-VHUTSHILO-V2');
assert.equal(buildEssentialCustomerPdfFileName(data.organisationName), 'MK_Fraud_Readiness_Essential_Vhutshilo_Foods_Manufacturing.pdf');
assert.throws(
  () => assertEssentialPackageComplete({ pdfBytes: Buffer.from('%PDF-1.7'), register: null }),
  (error) => error instanceof EssentialPackageCompletenessError && error.missingArtifacts.includes('supporting_register')
);
assert.doesNotThrow(() => assertEssentialPackageComplete({
  pdfBytes: Buffer.from('%PDF-1.7'),
  register: {
    storagePath: 'org/order/v1/action-register.xlsx',
    fileName: workbook.fileName,
    mimeType: workbook.mimeType,
    fileSizeBytes: workbook.bytes.length,
    checksumSha256: workbook.checksumSha256
  }
}));
const fulfilmentSource = source('src/lib/reports/phase1-manual-fulfilment.ts');
assert.match(fulfilmentSource, /buildAndStoreEssentialActionRegister/);
assert.match(fulfilmentSource, /buildEssentialReportReference/);
assert.match(fulfilmentSource, /buildEssentialCustomerPdfFileName/);
assert.match(fulfilmentSource, /assertEssentialPackageComplete/);
assert.ok(fulfilmentSource.indexOf('assertEssentialPackageComplete') < fulfilmentSource.indexOf("finalise_manual_report_with_supporting_register"), 'package gate precedes atomic finalisation');
const atomicSql = source('supabase/migrations/20260808160000_atomic_report_finalisation_with_register.sql');
assert.match(atomicSql, /p_report_type = 'essential_self_assessment'::public\.report_type/);
assert.match(atomicSql, /replace\(v_assessment\.assessment_reference, '-COMP-', '-ESS-'\)/);
assert.match(atomicSql, /p_register_file_size_bytes/);
const accessSource = source('src/lib/reports/customer-report-access.ts');
assert.match(accessSource, /artefact_type', 'supporting_register'/);
assert.match(accessSource, /action-register\.xlsx/);
const adminAccessSource = source('src/lib/reports/phase1-report-access.ts');
assert.match(adminAccessSource, /ReportAccessArtefact = 'pdf' \| 'register'/);
assert.match(adminAccessSource, /from\('report_artifacts'\)/);
assert.match(adminAccessSource, /createSignedUrl\(servedStoragePath/);
assert.match(source('src/app/score/api/admin/reports/[reportId]/download/route.ts'), /artefact: requestedArtefact === 'register' \? 'register' : 'pdf'/);
assert.match(source('src/app/score/api/admin/reports/[reportId]/preview/route.ts'), /artefact: requestedArtefact === 'register' \? 'register' : 'pdf'/);

// ---------------------------------------------------------------------------
// Before/after quality metrics and explicit legacy boundary
const legacy = supportingRegisterSheetData(data, adaptedModel);
const legacySchemas = [...legacy.schemas, legacy.controlImprovements.schema];
const legacyRows = [...legacy.data, legacy.controlImprovements.rows];
const before = {
  sheetCount: legacy.sheets.length + 1,
  visibleRows: legacyRows.reduce((sum, rows) => sum + rows.length, 0),
  technicalColumns: legacySchemas.flat().filter((column) => /ID|question code|linked/i.test(column.header)).length,
  focusedActionRows: legacyRows[5]?.length ?? 0,
  customerPromise: 'complete analytical universe / question trace'
};
const after = {
  sheetCount: workbook.sheetNames.length,
  visibleRows: canonical.rows.length,
  technicalColumns: 0,
  focusedActionRows: canonical.rows.length,
  priorityRowsWithPopulationEvidenceAndTest: canonical.rows.filter((row) => row.requiredPopulation && row.evidenceToRetain && row.completionEffectivenessTest).length,
  businessQualityTitles: canonical.rows.filter((row) => !/D\d+-Q\d+|\bquestion\b/i.test(row.priorityTitle)).length,
  customerPromise: ESSENTIAL_ACTION_REGISTER_PROMISE
};
assert.ok(before.sheetCount > after.sheetCount);
assert.ok(before.visibleRows > after.visibleRows);
assert.ok(before.technicalColumns > after.technicalColumns);
assert.equal(after.priorityRowsWithPopulationEvidenceAndTest, after.focusedActionRows);
assert.equal(after.businessQualityTitles, after.focusedActionRows);

console.log(JSON.stringify({
  passed: true,
  fixture: 'VHUTSHILO-V12',
  score: data.scoreRun.overallScore,
  maturity: data.scoreRun.finalMaturity,
  assessmentReference: data.assessmentReference,
  reportReference: canonical.reportReference,
  workbook: { fileName: workbook.fileName, bytes: workbook.bytes.length, sheets: workbook.sheetNames, rows: workbook.rowCounts },
  before,
  after,
  providerCalls: 0,
  databaseMutations: 0
}, null, 2));

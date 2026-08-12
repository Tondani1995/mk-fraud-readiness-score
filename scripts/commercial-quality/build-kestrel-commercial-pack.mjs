#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildComprehensiveDeliveryModel, fromAssembledReportData, renderBoardReadoutHtml, renderComprehensiveReportHtml, renderWorkshopMaterialHtml } from '../../src/lib/reports/comprehensive/index.ts';
import { buildComprehensiveRegisterWorkbook } from '../../src/lib/reports/comprehensive/workbook-builder.ts';
import { renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';
import { COMMERCIAL_PRODUCT_VERSION, REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';

const outputDir = path.resolve(process.env.COMMERCIAL_OUTPUT_DIR ?? 'outputs/commercial-quality');
const orderReference = process.env.COMPREHENSIVE_ORDER_REFERENCE ?? 'MKORD-2026-7FBBEE23';
await fs.mkdir(outputDir, { recursive: true });

const assembled = await assembleReportData(orderReference);
// The paid artefact is generated from the persisted deterministic analytical universe only.
// The Reporting Bible makes the deterministic engine the source of truth; narrative explains
// the result but does not require reviewer records or customer evidence upload.
const model = await fromAssembledReportData(assembled);

const pdfs = [
  ['comprehensive-main-report.pdf', renderComprehensiveReportHtml(model), 'MK Fraud Readiness · Comprehensive · Confidential'],
  ['comprehensive-board-readout.pdf', renderBoardReadoutHtml(model), 'MK Fraud Readiness · Board readout · Confidential'],
  ['comprehensive-workshop-material.pdf', renderWorkshopMaterialHtml(model), 'MK Fraud Readiness · Workshop material · Confidential']
];
for (const [filename, html, footerLabel] of pdfs) {
  await fs.writeFile(path.join(outputDir, filename), await renderHtmlToPdfBuffer(html, { footerLabel }));
}

const workbook = await buildComprehensiveRegisterWorkbook(model);
await fs.writeFile(path.join(outputDir, 'comprehensive-annotated-register.xlsx'), workbook.bytes);
await fs.writeFile(path.join(outputDir, 'comprehensive-source-manifest.json'), JSON.stringify({
  reportingBibleVersion: REPORTING_BIBLE_VERSION,
  productVersion: COMMERCIAL_PRODUCT_VERSION,
  source: 'persisted deterministic assessment analytical universe',
  organisation: assembled.organisationName,
  orderReference,
  assessmentReference: assembled.assessmentReference,
  scoreRunId: assembled.currentScoreRunId,
  methodologyVersionId: assembled.scoreRun.methodologyVersionId,
  analyticalCounts: {
    findings: model.findings.length,
    risks: model.riskRegister.length,
    controls: model.controlImprovements.length,
    proofRequirements: model.proofRequirements.length,
    roadmapActions: model.roadmapActions.length,
    questionTraces: assembled.questionTraces.length,
    leadershipDecisions: model.leadershipDecisions.length
  }
}, null, 2));

console.log(JSON.stringify({
  source: 'persisted Kestrel assessment analytical universe',
  orderReference,
  assessmentReference: assembled.assessmentReference,
  organisationName: assembled.organisationName,
  counts: {
    findings: model.findings.length,
    risks: model.riskRegister.length,
    proofRequirements: model.proofRequirements.length,
    controlBlueprints: model.controlImprovements.length,
    managementDecisions: model.leadershipDecisions.length
  },
  outputs: pdfs.map(([filename]) => filename).concat('comprehensive-annotated-register.xlsx')
}, null, 2));

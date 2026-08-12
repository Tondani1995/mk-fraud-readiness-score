#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { getEngagementByOrderReference } from '../../src/lib/comprehensive/engagement-service.ts';
import { loadComprehensiveReviewerInput } from '../../src/lib/comprehensive/review-record-service.ts';
import { buildComprehensiveDeliveryModel, fromAssembledReportData, renderBoardReadoutHtml, renderComprehensiveReportHtml, renderWorkshopMaterialHtml } from '../../src/lib/reports/comprehensive/index.ts';
import { buildComprehensiveRegisterWorkbook } from '../../src/lib/reports/comprehensive/workbook-builder.ts';
import { renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';
import { COMMERCIAL_PRODUCT_VERSION, REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';

const outputDir = path.resolve(process.env.COMMERCIAL_OUTPUT_DIR ?? 'outputs/commercial-quality');
const orderReference = process.env.COMPREHENSIVE_ORDER_REFERENCE ?? 'MKORD-2026-7FBBEE23';
await fs.mkdir(outputDir, { recursive: true });

const engagement = await getEngagementByOrderReference(orderReference);
if (!engagement) throw new Error(`Comprehensive engagement not found for ${orderReference}`);
const assembled = await assembleReportData(orderReference);
const persistedReviewerInput = await loadComprehensiveReviewerInput(engagement.id);
// The paid artefact must be generated from the persisted deterministic analytical universe and
// the persisted human-review record. Do not expand, cycle or replace those records with a fixture
// or synthetic stress profile: the Reporting Bible makes the deterministic engine the sole source
// of truth and requires every narrative section to remain traceable to supplied facts.
const model = await fromAssembledReportData(assembled, persistedReviewerInput);

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
  source: 'persisted deterministic analytical universe and persisted management review record',
  organisation: assembled.organisationName,
  orderReference,
  assessmentReference: assembled.assessmentReference,
  scoreRunId: assembled.currentScoreRunId,
  methodologyVersionId: assembled.scoreRun.methodologyVersionId,
  analyticalCounts: {
    findings: model.findings.length,
    risks: model.riskRegister.length,
    controls: model.controlImprovements.length,
    evidenceRequirements: model.evidenceRequestPack.length,
    roadmapActions: model.roadmapActions.length,
    questionTraces: assembled.questionTraces.length,
    leadershipDecisions: model.leadershipDecisions.length
  }
}, null, 2));

console.log(JSON.stringify({
  source: 'persisted Kestrel engagement and persisted management review record',
  orderReference,
  assessmentReference: assembled.assessmentReference,
  organisationName: assembled.organisationName,
  engagementId: engagement.id,
    reviewer: persistedReviewerInput.reviewer,
  counts: {
    findings: model.findings.length,
    risks: model.riskRegister.length,
    evidence: model.validationSummary.totalEvidenceItems,
    supported: model.validationSummary.validatedSupported,
    insufficient: model.validationSummary.notValidatedInsufficient,
    notSupported: model.evidenceReviews.filter((item) => item.validationStatus === 'NOT_SUPPORTED').length,
    managementDecisions: model.managementDecisions.length,
    decisionReviews: model.decisionReviews.length,
    controlDesignReviews: model.controlDesignReviews.length
  },
  outputs: pdfs.map(([filename]) => filename).concat('comprehensive-annotated-register.xlsx')
}, null, 2));

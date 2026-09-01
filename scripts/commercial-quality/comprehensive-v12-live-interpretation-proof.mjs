#!/usr/bin/env node
/**
 * One-call live interpretation proof for the V1.2 Comprehensive Sustainment case.
 *
 * HARD BOUNDARIES:
 * - Synthetic Motheo profile only.
 * - Exactly one provider call.
 * - Zero repair calls.
 * - No database reads or writes.
 * - No storage writes.
 * - No fulfilment RPCs.
 * - No Production/customer journey.
 *
 * The script persists provider output and validation/accounting evidence before
 * enforcing final acceptance, so a rejected call is still inspectable without
 * authorising another paid attempt.
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import {
  adaptComprehensiveEvidenceModel,
  adaptComprehensiveScenarioFacts
} from '../../src/lib/reports/comprehensive/customer-visible-adaptation.ts';
import { comprehensiveAssessmentScopeFromData } from '../../src/lib/reports/comprehensive/assessment-scope.ts';
import {
  buildInterpretationBrief,
  generateComprehensiveInterpretation,
  assertComprehensiveInterpretationAccepted,
  interpretationToCommentary
} from '../../src/lib/reports/comprehensive/interpretation.ts';
import { renderComprehensiveManagementReportHtml } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';
import { auditPdfLayout } from './layout-fit-gate.mjs';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';

const outDir = process.env.LIVE_OUTPUT_DIR ?? 'outputs/comprehensive-v12-live-proof';
fs.mkdirSync(outDir, { recursive: true });

const MODEL = 'openai/gpt-5.6-luna';
const PROFILE = 'motheo';

const { data, score, profile } = buildV12ProfileAssembled(PROFILE);
const assessmentScope = comprehensiveAssessmentScopeFromData(data);
const evidence = buildAdvisoryEvidenceModel(data);
const customerEvidence = adaptComprehensiveEvidenceModel(evidence);
const projection = buildEssentialProjection(data, customerEvidence);
const pack = buildEssentialNarrativeFactPack(data, customerEvidence, projection);

const domains = pack.domains
  .filter((domain) => typeof domain.score === 'number')
  .map((domain) => ({
    name: domain.name,
    score: domain.score,
    band: getMaturityBand(domain.score)
  }));

const model = buildComprehensiveManagementModel(
  assembleComprehensive(customerEvidence, {
    scenarioFacts: adaptComprehensiveScenarioFacts(pack.scenarios),
    domains
  })
);

if (model.narrativeMode !== 'SUSTAINMENT') {
  throw new Error(`Motheo must remain SUSTAINMENT for live proof; received ${model.narrativeMode}.`);
}
if (score.resultStatus === 'INSUFFICIENT_VISIBILITY') {
  throw new Error('Motheo live proof is not issuable under the V1.2 adaptive scorer.');
}

const brief = buildInterpretationBrief({
  model,
  organisationName: pack.organisation.name,
  score: pack.assessment.score,
  maturity: pack.assessment.maturity,
  assessmentScope,
  domains
});

const startedAt = new Date().toISOString();
let run;
try {
  run = await generateComprehensiveInterpretation(brief, {
    model: MODEL,
    maxRepairsPerSlot: 0,
    timeoutMs: 240_000
  });
} catch (error) {
  fs.writeFileSync(path.join(outDir, 'provider-failure.json'), JSON.stringify({
    profile: PROFILE,
    organisation: profile.organisationName,
    model: MODEL,
    startedAt,
    providerCallsAuthorised: 1,
    repairsAuthorised: 0,
    databaseReads: 0,
    databaseWrites: 0,
    storageWrites: 0,
    error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
  }, null, 2) + '\n');
  throw error;
}

const evidencePayload = {
  profile: PROFILE,
  organisation: profile.organisationName,
  model: MODEL,
  startedAt,
  completedAt: new Date().toISOString(),
  score: pack.assessment.score,
  maturity: pack.assessment.maturity,
  narrativeMode: model.narrativeMode,
  resultStatus: score.resultStatus,
  assessmentScope,
  providerCallsAuthorised: 1,
  repairsAuthorised: 0,
  databaseReads: 0,
  databaseWrites: 0,
  storageWrites: 0,
  accounting: run.accounting,
  issues: run.issues,
  interpretation: run.interpretation
};
fs.writeFileSync(path.join(outDir, 'interpretation.json'), JSON.stringify(evidencePayload, null, 2) + '\n');

// This is the final customer-output boundary. If the single call is rejected,
// evidence above remains available, but no interpreted PDF is created.
assertComprehensiveInterpretationAccepted(run, { maxCalls: 1, maxRepairs: 0 });

const html = renderComprehensiveManagementReportHtml({
  model,
  organisationName: pack.organisation.name,
  assessmentReference: pack.assessment.reference,
  reportReference: profile.reportReference,
  score: pack.assessment.score,
  maturity: pack.assessment.maturity,
  assessmentScope,
  domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band })),
  commentary: interpretationToCommentary(run.interpretation)
});
fs.writeFileSync(path.join(outDir, 'motheo-live.html'), html);

let pdf;
try {
  pdf = await renderHtmlToPdfBuffer(html, {
    footerLabel: 'MK Fraud Readiness Comprehensive · V1.2 live interpretation proof'
  });
} finally {
  await closeRenderBrowser();
}
const pdfPath = path.join(outDir, 'motheo-live.pdf');
fs.writeFileSync(pdfPath, pdf);

const layout = auditPdfLayout(pdfPath);
fs.writeFileSync(path.join(outDir, 'layout.json'), JSON.stringify(layout, null, 2) + '\n');

const final = {
  ...evidencePayload,
  accepted: true,
  pdfBytes: pdf.length,
  pages: layout.pageCount,
  layoutFailures: layout.failCount,
  blankPages: layout.pages.filter((page) => page.blank).map((page) => page.page),
  clippedPages: layout.pages.filter((page) => page.clippedElements.length > 0).map((page) => page.page),
  footerIntrusions: layout.pages.filter((page) => page.footerIntrusionMm > 0).map((page) => page.page)
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(final, null, 2) + '\n');

if (run.accounting.calls !== 1) throw new Error(`Expected exactly one provider call, received ${run.accounting.calls}.`);
if (run.accounting.repairs !== 0) throw new Error(`Expected zero repairs, received ${run.accounting.repairs}.`);
if (layout.failCount !== 0) throw new Error(`Interpreted Motheo PDF has ${layout.failCount} page-level layout failure(s).`);

console.log(JSON.stringify({
  status: 'PASS',
  profile: PROFILE,
  model: MODEL,
  calls: run.accounting.calls,
  repairs: run.accounting.repairs,
  inputTokens: run.accounting.inputTokens,
  outputTokens: run.accounting.outputTokens,
  totalTokens: run.accounting.totalTokens,
  costMicros: run.accounting.costMicros,
  issues: run.issues.length,
  pages: layout.pageCount,
  layoutFailures: layout.failCount
}, null, 2));
process.exit(0);

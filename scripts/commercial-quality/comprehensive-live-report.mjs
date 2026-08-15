#!/usr/bin/env node
/**
 * Comprehensive live report — ONE structured provider call per report.
 *
 * Renders the same case twice: deterministic (no AI) and interpreted. Both PDFs
 * are kept so the question the mandate asks — does the AI make the report
 * better? — can be answered by reading them side by side rather than asserted.
 *
 * Budget: this script makes exactly one provider call per report, plus at most
 * two targeted repair calls for fields that fail validation. It never
 * regenerates a whole report.
 *
 * Usage:
 *   ORDER=MKORD-2026-22FF6B69 CASE=CASE-05 npm run v11:comprehensive-live
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';
import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';
import {
  buildInterpretationBrief, generateComprehensiveInterpretation,
  validateInterpretation, interpretationToCommentary, INTERPRETATION_CONTRACTS
} from '../../src/lib/reports/comprehensive/interpretation.ts';

const order = process.env.ORDER;
const caseId = process.env.CASE ?? 'CASE';
if (!order) { console.error('Set ORDER.'); process.exit(2); }

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/comprehensive-c5-live';
fs.mkdirSync(outDir, { recursive: true });

const data = await assembleReportData(order);
const evidence = buildAdvisoryEvidenceModel(data);
const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
const model = buildComprehensiveManagementModel(assembleComprehensive(evidence, { scenarioFacts: pack.scenarios, domains: pack.domains.filter((d) => typeof d.score === 'number').map((d) => ({ name: d.name, score: d.score, band: getMaturityBand(d.score) })) }));
const domains = pack.domains.filter((domain) => typeof domain.score === 'number')
  .map((domain) => ({ name: domain.name, score: domain.score, band: getMaturityBand(domain.score) }));

const brief = buildInterpretationBrief({
  model, organisationName: pack.organisation.name, score: pack.assessment.score,
  maturity: pack.assessment.maturity, domains
});

const base = {
  model,
  organisationName: pack.organisation.name,
  assessmentReference: pack.assessment.reference,
  score: pack.assessment.score,
  maturity: pack.assessment.maturity,
  domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band }))
};

console.log(`${caseId} ${order} | ${pack.organisation.name} | ${pack.assessment.score} ${pack.assessment.maturity} | ${model.narrativeMode}`);
console.log(`brief ${(JSON.stringify(brief).length / 1024).toFixed(1)}KB | calling provider once...`);

const run = await generateComprehensiveInterpretation(brief);
const { interpretation, issues, accounting } = run;

// Re-validate independently of the generator, so the recorded verdict is not
// the generator's own opinion of itself.
const finalIssues = validateInterpretation(interpretation, brief);

const footerLabel = `MK Fraud Readiness Comprehensive — ${pack.organisation.name}`;
const deterministicHtml = renderComprehensiveManagementReportHtml(base);
const interpretedHtml = renderComprehensiveManagementReportHtml({ ...base, commentary: interpretationToCommentary(interpretation) });

const deterministicPdf = await renderHtmlToPdfBuffer(deterministicHtml, { footerLabel });
const interpretedPdf = await renderHtmlToPdfBuffer(interpretedHtml, { footerLabel });
await closeRenderBrowser();

const detPath = path.join(outDir, `${caseId}-deterministic.pdf`);
const aiPath = path.join(outDir, `${caseId}-interpreted.pdf`);
fs.writeFileSync(detPath, deterministicPdf);
fs.writeFileSync(aiPath, interpretedPdf);

const pageCount = (buffer) => (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const wordCount = (value) => String(value).trim().split(/\s+/).filter(Boolean).length;

const report = {
  caseId, order, organisation: pack.organisation.name,
  score: pack.assessment.score, maturity: pack.assessment.maturity, mode: model.narrativeMode,
  briefKB: Number((JSON.stringify(brief).length / 1024).toFixed(1)),
  accounting,
  generatorIssues: issues.length,
  finalIssues,
  slots: INTERPRETATION_CONTRACTS.map((contract) => ({
    id: contract.id, words: wordCount(interpretation[contract.id]),
    band: `${contract.minWords}-${contract.maxWords}`
  })),
  pdf: {
    deterministic: { path: detPath, bytes: deterministicPdf.length, pages: pageCount(deterministicPdf) },
    interpreted: { path: aiPath, bytes: interpretedPdf.length, pages: pageCount(interpretedPdf) }
  },
  interpretation
};

fs.writeFileSync(path.join(outDir, `${caseId}-run.json`), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, `${caseId}-interpretation.txt`),
  INTERPRETATION_CONTRACTS.map((contract) => `=== ${contract.label} (${contract.id}) ===\n${interpretation[contract.id]}\n`).join('\n'));

console.log(JSON.stringify({ ...report, interpretation: undefined }, null, 2));
if (finalIssues.length) {
  console.error(`\nUNRESOLVED: ${finalIssues.length} issue(s) survived repair.`);
  for (const issue of finalIssues) console.error(`  ${issue.slot} ${issue.kind} ${issue.code}: ${issue.detail}`);
  process.exit(1);
}
console.log('\nPASS: all six interpretation slots satisfy their contracts.');

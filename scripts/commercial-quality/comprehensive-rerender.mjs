#!/usr/bin/env node
/**
 * Re-render a Comprehensive PDF from an already-produced interpretation.
 *
 * Zero provider calls: the AI manuscript is read from the stored run.json, so a
 * renderer correction can be proved without buying another report.
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
import { interpretationToCommentary } from '../../src/lib/reports/comprehensive/interpretation.ts';

const order = process.env.ORDER;
const runJson = process.env.RUN_JSON;
const out = process.env.OUT;
const run = JSON.parse(fs.readFileSync(runJson, 'utf8'));
if (!run.interpretation) throw new Error('stored run carries no interpretation');

const data = await assembleReportData(order);
const evidence = buildAdvisoryEvidenceModel(data);
const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
const domains = pack.domains.filter((d) => typeof d.score === 'number').map((d) => ({ name: d.name, score: d.score, band: getMaturityBand(d.score) }));
const model = buildComprehensiveManagementModel(assembleComprehensive(evidence, { scenarioFacts: pack.scenarios, domains }));
const html = renderComprehensiveManagementReportHtml({
  model, organisationName: pack.organisation.name, assessmentReference: pack.assessment.reference,
  score: pack.assessment.score, maturity: pack.assessment.maturity,
  domains: domains.map((d) => ({ title: d.name, score: d.score, band: d.band })),
  commentary: interpretationToCommentary(run.interpretation)
});
const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: `MK Fraud Readiness Comprehensive — ${pack.organisation.name}` });
await closeRenderBrowser();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, pdf);
console.log(`${order} -> ${out} (${(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length} pages, provider calls: 0)`);

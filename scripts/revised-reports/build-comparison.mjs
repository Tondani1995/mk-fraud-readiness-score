#!/usr/bin/env node
// Fictional report comparison: the same fictional organisations reported "before" (MFRS V1.2 assessment through the
// existing, unchanged Essential and Comprehensive engines) and "after" (the staged review assessment through the
// revised evidence model and the same engines). No AI manuscript stage runs on either side, no database, order,
// payment or provider is touched, and every number on the "after" side is a labelled test fixture.
//
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/revised-reports/build-comparison.mjs [--pdf] [--out docs/readiness-review/report-comparison]
import fs from 'node:fs';
import path from 'node:path';
import { runJourney } from '../lib/build16-driver.mjs';
import { simulate, bandOf } from '../research/scoring-simulation/calculator.mjs';
import { ORGANISATIONS, gatewaysFor, mfrsResponse } from './organisations.mjs';
import { buildStagedReportInput } from '../../src/lib/readiness-review/report-input.ts';
import { buildMfrsBaselineFixture } from '../../src/lib/reports/revised/baseline-mfrs-fixture.ts';
import { buildRevisedEvidenceModel, REVISED_RAW_ID } from '../../src/lib/reports/revised/evidence-model.ts';
import { buildRevisedAssembledData, REVISED_FIXTURE_LABEL } from '../../src/lib/reports/revised/assembled-data.ts';
import { buildRevisedEssentialPresentation, labelRevisedEssentialHtml } from '../../src/lib/reports/revised/essential-presentation.ts';
import { buildRevisedComprehensive } from '../../src/lib/reports/revised/comprehensive.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { validateEssentialPresentation } from '../../src/lib/reports/essential/presentation-validation.ts';
import { renderEssentialReportHtml } from '../../src/lib/reports/essential/render-essential-html.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';

const args = process.argv.slice(2);
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/readiness-review/report-comparison');
const PDF = args.includes('--pdf');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : Object.keys(ORGANISATIONS);
const GENERATED = '2026-11-11T12:00:00Z';
const BEFORE_BANNER = 'FICTIONAL COMPARISON. MFRS V1.2 answers derived from a fictional organisation; scored by the existing calculator. Not a customer report.';
const AFTER_BANNER = 'FICTIONAL PROTOTYPE. Staged review answers from a fictional organisation. All figures are test fixtures, not an approved score.';

const banner = (html, text, colour) => html.replace('<body>', `<body><div style="position:fixed;top:0;left:0;right:0;z-index:9;background:${colour};color:#fff;font:600 7.5pt/1.4 sans-serif;padding:1.2mm 4mm;text-align:center">${text}</div>`);
const textOf = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function essentialChain(data, evidence) {
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const thesis = buildReportThesis(pack, blueprint);
  const model = buildEssentialPresentationModel({ factPack: pack, thesis, blueprint, commentary: {} });
  return { pack, blueprint, model };
}

function comprehensive(evidence, scenarioFacts, domains, identity) {
  const assembly = assembleComprehensive(evidence, { scenarioFacts, domains });
  const model = buildComprehensiveManagementModel(assembly);
  const html = renderComprehensiveManagementReportHtml({
    model, organisationName: identity.organisationName, assessmentReference: identity.reference, score: identity.score, maturity: identity.maturity,
    domains: domains.map((d) => ({ title: d.name, score: d.score, band: d.band })), commentary: {}
  });
  return { assembly, model, html };
}

const results = {};
fs.mkdirSync(OUT, { recursive: true });
for (const key of ONLY) {
  const org = ORGANISATIONS[key];
  const dir = path.join(OUT, key);
  fs.mkdirSync(dir, { recursive: true });
  const reference = `FX-${key}`;

  // ------------------------------------------------------------------ before: MFRS V1.2 through the existing engines
  const bData = buildMfrsBaselineFixture({ organisationName: org.label, assessmentReference: reference, generatedAt: GENERATED, gatewayAnswers: gatewaysFor(key), responseFor: (q) => mfrsResponse(key, q) });
  const bEvidence = buildAdvisoryEvidenceModel(bData);
  const bEss = essentialChain(bData, bEvidence);
  const bValidation = validateEssentialPresentation(bEss.model);
  const bEssHtml = banner(renderEssentialReportHtml(bEss.model), BEFORE_BANNER, '#5a4a12');
  const bDomains = bEss.pack.domains.filter((d) => typeof d.score === 'number').map((d) => ({ name: d.name, score: d.score, band: getMaturityBand(d.score) }));
  const bComp = comprehensive(bEvidence, bEss.pack.scenarios, bDomains, { organisationName: org.label, reference, score: bEss.pack.assessment.score, maturity: bEss.pack.assessment.maturity });
  const bCompHtml = banner(bComp.html, BEFORE_BANNER, '#5a4a12');

  // ------------------------------------------------------------------ after: staged review through the revised evidence model
  const journey = runJourney(key);
  const staged = buildStagedReportInput(journey.live);
  const sim = simulate(journey.live.engine.report(), { treatment: 'midpoint', aggregation: 'equalDomains', falseComfort: 'F0', caps: 'none', visibility: 'fixture' });
  const fixture = { label: REVISED_FIXTURE_LABEL, overall: sim.overall.point, maturity: bandOf(sim.overall.point), areas: sim.domains.map((d) => ({ area: d.id, value: d.point })) };
  const { model: aEvidence, analysis } = buildRevisedEvidenceModel(staged);
  const aData = buildRevisedAssembledData({ staged, evidence: aEvidence, organisationName: org.label, assessmentReference: reference, generatedAt: GENERATED, gatewayAnswers: gatewaysFor(key), fixture });
  const aBase = essentialChain(aData, aEvidence);
  const aBaseValidation = validateEssentialPresentation(aBase.model);
  const aEssModel = buildRevisedEssentialPresentation({ base: aBase.model, evidence: aEvidence, analysis, fixtureLabel: REVISED_FIXTURE_LABEL });
  const aValidation = validateEssentialPresentation(aEssModel);
  const aEssHtml = labelRevisedEssentialHtml(renderEssentialReportHtml(aEssModel), AFTER_BANNER);
  const aBaseHtml = banner(renderEssentialReportHtml(aBase.model), `${AFTER_BANNER} Existing presentation builder, without the rework.`, '#7a1f1f');
  const aDomains = aData.domainResults.filter((d) => typeof d.rawScore === 'number').map((d) => ({ name: d.domainName, score: d.rawScore, band: getMaturityBand(d.rawScore) }));
  const aComp = buildRevisedComprehensive({ evidence: aEvidence, analysis, domains: aDomains, organisationName: org.label, assessmentReference: reference, score: fixture.overall ?? 0, maturity: fixture.maturity ?? 'Not shown' });
  const aCompHtml = banner(aComp.html, AFTER_BANNER, '#7a1f1f');

  const files = {
    'before-essential.html': bEssHtml, 'before-comprehensive.html': bCompHtml,
    'after-essential.html': aEssHtml, 'after-comprehensive.html': aCompHtml, 'after-essential-existing-builder.html': aBaseHtml
  };
  for (const [name, html] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), html);
  fs.writeFileSync(path.join(dir, 'artefacts.json'), JSON.stringify({
    fictional: true, organisation: org.label, journeyProfile: key,
    before: { methodology: bData.scoreRun.methodologyVersionId, score: bData.scoreRun.overallScore, maturity: bData.scoreRun.finalMaturity, evidence: bEvidence, essentialModel: bEss.model, essentialValidation: bValidation, comprehensive: { model: bComp.model } },
    after: { fixture, staged: { contract: staged.contract, interview: staged.interview, stages: staged.staged.stages, consistency: staged.staged.consistency, workload: staged.staged.workload }, analysis: { scenarios: analysis.scenarios.map((s) => ({ id: s.id, name: s.name, tier: s.tier, area: s.area, kind: s.kind, confirmGaps: s.confirmGaps.map((m) => m.c.id), supportGaps: s.supportGaps.map((m) => m.c.id), inPlace: s.inPlace.length, outstanding: s.outstanding.map((m) => m.c.id) })), outstanding: analysis.outstandingItems.map((o) => ({ id: o.c.id, reason: o.reason, fn: o.fn, declineReason: o.declineReason })) }, evidence: aEvidence, essentialModel: aEssModel, essentialValidation: aValidation, existingBuilderValidation: aBaseValidation, comprehensive: { model: aComp.model } }
  }, null, 1));

  // Customer prose must never carry a bank question, scenario, objective or profile identifier.
  const leaks = (html) => { const t = textOf(html); const m = t.match(new RegExp(REVISED_RAW_ID.source, 'g')); return m ? [...new Set(m)] : []; };
  results[key] = {
    organisation: org.label,
    before: { score: bData.scoreRun.overallScore, maturity: bData.scoreRun.finalMaturity, essentialValidation: { ok: bValidation.ok, issues: bValidation.issues.map((i) => i.code), words: bValidation.customerWordCount } },
    after: { fixtureScore: fixture.overall, fixtureBand: fixture.maturity, essentialValidation: { ok: aValidation.ok, issues: aValidation.issues.map((i) => i.code), words: aValidation.customerWordCount }, existingBuilderValidation: { ok: aBaseValidation.ok, issues: aBaseValidation.issues.map((i) => i.code), words: aBaseValidation.customerWordCount }, essentialIdLeaks: leaks(aEssHtml) }
  };
  console.log(key, JSON.stringify(results[key]));
}

if (PDF) {
  const { renderHtmlToPdfBuffer, closeRenderBrowser } = await import('../../src/lib/reports/render-pdf.ts');
  for (const key of ONLY) {
    for (const name of ['before-essential', 'before-comprehensive', 'after-essential', 'after-comprehensive']) {
      const html = fs.readFileSync(path.join(OUT, key, `${name}.html`), 'utf8');
      const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: `FICTIONAL ${name.startsWith('after') ? 'PROTOTYPE' : 'COMPARISON'}: ${ORGANISATIONS[key].label}` });
      fs.writeFileSync(path.join(OUT, key, `${name}.pdf`), pdf);
      results[key][`${name}Pages`] = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    }
  }
  await closeRenderBrowser();
}
fs.writeFileSync(path.join(OUT, 'build-summary.json'), JSON.stringify({ fictional: true, generated: GENERATED, aiManuscriptStage: 'not run on either side', results }, null, 1));
console.log(JSON.stringify(results, null, 1));

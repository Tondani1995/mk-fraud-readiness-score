#!/usr/bin/env node
// Fictional report comparison. The same fictional organisations reported "before" (MFRS V1.2 assessment through the
// existing, unchanged Essential and Comprehensive engines, optional with --before) and as the corrected prototype (the
// staged review assessment through the revised report model: Essential through the existing presentation model,
// validator and renderer; Comprehensive through the revised renderer on the existing style sheet; plus the supporting
// workbook). No AI manuscript stage runs, no database, order, payment or provider is touched, and every number on the
// prototype side is a labelled test fixture. The first prototype (commit 5fb4dc2) is kept in report-comparison/.
//
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/revised-reports/build-comparison.mjs [--pdf] [--before] [--out docs/readiness-review/report-correction]
import fs from 'node:fs';
import path from 'node:path';
import { ORGANISATIONS, gatewaysFor, mfrsResponse } from './organisations.mjs';
import { REVISED_RAW_ID } from '../../src/lib/reports/revised/evidence-model.ts';
import { buildCorrected, essentialChain, textOf, GENERATED, PROTOTYPE_FOOTER } from './pipeline.mjs';
import { buildMfrsBaselineFixture } from '../../src/lib/reports/revised/baseline-mfrs-fixture.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { renderEssentialReportHtml } from '../../src/lib/reports/essential/render-essential-html.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';

const args = process.argv.slice(2);
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/readiness-review/report-correction');
const BEFORE = args.includes('--before');
const PDF = args.includes('--pdf');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : Object.keys(ORGANISATIONS);
const BEFORE_BANNER = 'FICTIONAL COMPARISON. MFRS V1.2 answers derived from a fictional organisation; scored by the existing calculator. Not a customer report.';

const banner = (html, text, colour) => html.replace('<body>', `<body><div style="position:fixed;top:0;left:0;right:0;z-index:9;background:${colour};color:#fff;font:600 7.5pt/1.4 sans-serif;padding:1.2mm 4mm;text-align:center">${text}</div>`);
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

  const files = {};
  if (BEFORE) {
    // ---------------------------------------------------------------- before: MFRS V1.2 through the existing engines
    const bData = buildMfrsBaselineFixture({ organisationName: org.label, assessmentReference: reference, generatedAt: GENERATED, gatewayAnswers: gatewaysFor(key), responseFor: (q) => mfrsResponse(key, q) });
    const bEvidence = buildAdvisoryEvidenceModel(bData);
    const bEss = essentialChain(bData, bEvidence);
    const bDomains = bEss.pack.domains.filter((d) => typeof d.score === 'number').map((d) => ({ name: d.name, score: d.score, band: getMaturityBand(d.score) }));
    const bComp = comprehensive(bEvidence, bEss.pack.scenarios, bDomains, { organisationName: org.label, reference, score: bEss.pack.assessment.score, maturity: bEss.pack.assessment.maturity });
    files['before-essential.html'] = banner(renderEssentialReportHtml(bEss.model), BEFORE_BANNER, '#5a4a12');
    files['before-comprehensive.html'] = banner(bComp.html, BEFORE_BANNER, '#5a4a12');
  }

  // ------------------------------------------------------------------ corrected prototype: staged review, revised report model
  const c = await buildCorrected(key, { workbook: true });
  const { report, fixture, essentialModel: aEssModel, validation: aValidation, essentialHtml: aEssHtml, comprehensiveHtml: aCompHtml, comprehensive: aComp, workbook, staged } = c;
  files['corrected-essential.html'] = aEssHtml;
  files['corrected-comprehensive.html'] = aCompHtml;
  for (const [name, html] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), html);
  fs.writeFileSync(path.join(dir, 'corrected-registers.xlsx'), workbook.bytes);
  const { analysis: _analysis, ...reportJson } = report;
  fs.writeFileSync(path.join(dir, 'model.json'), JSON.stringify({
    fictional: true, organisation: org.label, journeyProfile: key, fixture,
    staged: { contract: staged.contract, interview: staged.interview, stages: staged.staged.stages, consistency: staged.staged.consistency },
    report: reportJson, essentialModel: aEssModel, essentialValidation: aValidation, comprehensive: { sections: aComp.sections, appendices: aComp.appendices }, workbook: { sha256: workbook.sha256, sheets: workbook.sheets }
  }, null, 1));

  // Customer prose must never carry a bank question, scenario, objective or profile identifier.
  const leaks = (html) => { const t = textOf(html); const m = t.match(new RegExp(REVISED_RAW_ID.source, 'g')); return m ? [...new Set(m)] : []; };
  results[key] = {
    organisation: org.label,
    corrected: {
      fixtureScore: fixture.overall, fixtureBand: fixture.maturity, r1: report.r1, schemes: report.summary,
      essentialValidation: { ok: aValidation.ok, issues: aValidation.issues.map((i) => `${i.code}: ${i.message}`), words: aValidation.customerWordCount },
      essentialIdLeaks: leaks(aEssHtml), comprehensiveIdLeaks: leaks(aCompHtml), comprehensive: aComp.appendices, workbook: workbook.sheets
    }
  };
  console.log(key, JSON.stringify(results[key].corrected.essentialValidation), 'leaks', results[key].corrected.essentialIdLeaks, results[key].corrected.comprehensiveIdLeaks);
}

if (PDF) {
  const { renderHtmlToPdfBuffer, closeRenderBrowser } = await import('../../src/lib/reports/render-pdf.ts');
  for (const key of ONLY) {
    for (const name of [...(BEFORE ? ['before-essential', 'before-comprehensive'] : []), 'corrected-essential', 'corrected-comprehensive']) {
      const html = fs.readFileSync(path.join(OUT, key, `${name}.html`), 'utf8');
      const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: name.startsWith('corrected') ? PROTOTYPE_FOOTER : `FICTIONAL COMPARISON: ${ORGANISATIONS[key].label}` });
      fs.writeFileSync(path.join(OUT, key, `${name}.pdf`), pdf);
      results[key][`${name}Pages`] = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    }
  }
  await closeRenderBrowser();
}
fs.writeFileSync(path.join(OUT, 'build-summary.json'), JSON.stringify({ fictional: true, generated: GENERATED, aiManuscriptStage: 'not run on either side', results }, null, 1));
console.log(JSON.stringify(results, null, 1));

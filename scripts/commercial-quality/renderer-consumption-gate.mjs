#!/usr/bin/env node
/**
 * Renderer-consumption gate.
 *
 * The presentation model built `strengths` and `watchpoints` for every
 * sustainment report. The renderer had no block for either, so four of eleven
 * real cases shipped a six-page PDF missing the two exhibits that carry a
 * high-readiness report's analytical value — and every existing gate passed.
 * Presentation validation checks the model, the layout gate checks ink on the
 * pages that exist, and nothing reconciled the two.
 *
 * The rule: a customer-facing presentation object is either rendered, or it is
 * explicitly declared non-rendered with a reason. Never silently dropped.
 *
 * Usage:
 *   npm run v11:renderer-consumption-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { renderEssentialReportHtml } from '../../src/lib/reports/essential/render-essential-html.ts';

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};

/**
 * The customer-facing objects, how to prove each one reached the page, and the
 * documented reason where an object is deliberately not rendered.
 *
 * `evidence` returns strings that must appear in the rendered HTML. They are
 * drawn from row content, not titles alone: a heading can survive while the
 * rows behind it are dropped.
 */
const REGISTRY = [
  { object: 'readinessScore', rendered: true, evidence: (m) => [String(m.readinessScore.maturity), m.readinessScore.strongest.title] },
  { object: 'domainProfile', rendered: true, evidence: (m) => m.domainProfile.rows.slice(0, 3).map((r) => r.title) },
  { object: 'materialContrasts', rendered: true, optional: true, evidence: (m) => (m.materialContrasts?.contrasts ?? []).slice(0, 1).flatMap((c) => [c.strongerTitle, c.weakerTitle]) },
  { object: 'diagnosis', rendered: true, evidence: (m) => [m.diagnosis.title, ...m.diagnosis.rows.slice(0, 2).map((r) => r.pattern)] },
  { object: 'strengths', rendered: true, optional: true, evidence: (m) => [m.strengths?.title, ...(m.strengths?.rows ?? []).slice(0, 2).map((r) => r.capability)] },
  { object: 'exposures', rendered: true, optional: true, evidence: (m) => [m.exposures?.title, ...(m.exposures?.rows ?? []).slice(0, 2).map((r) => r.exposure)] },
  { object: 'watchpoints', rendered: true, optional: true, evidence: (m) => [m.watchpoints?.title, ...(m.watchpoints?.rows ?? []).slice(0, 2).map((r) => r.currentStrength)] },
  { object: 'scenarios', rendered: true, optional: true, evidence: (m) => [m.scenarios?.title, ...(m.scenarios?.scenarios ?? []).slice(0, 2).map((s) => s.title)] },
  { object: 'priorities', rendered: true, evidence: (m) => [m.priorities.title, ...m.priorities.rows.slice(0, 2).map((r) => r.outcome)] },
  { object: 'roadmap', rendered: true, evidence: (m) => [m.roadmap.title, ...m.roadmap.stages.flatMap((s) => s.actions.slice(0, 1).map((a) => a.action))] },
  { object: 'dashboard', rendered: true, evidence: (m) => [m.dashboard.title, ...m.dashboard.rows.slice(0, 2).map((r) => r.measure)] },
  { object: 'cover.centralJudgement', rendered: true, evidence: (m) => [m.cover.centralJudgement] },
  { object: 'conclusion', rendered: true, evidence: (m) => [m.conclusion] },
  { object: 'reportBasis', rendered: true, evidence: (m) => [m.reportBasis] }
];

/** HTML-escape the way the renderer does, so comparisons are like for like. */
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const cases = [];
const violations = [];

for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const thesis = buildReportThesis(pack, blueprint);
  const model = buildEssentialPresentationModel({ factPack: pack, thesis, blueprint, commentary: {} });
  const html = renderEssentialReportHtml(model);

  const objects = [];
  for (const entry of REGISTRY) {
    const values = (entry.evidence(model) ?? []).filter((value) => typeof value === 'string' && value.trim());
    // An optional object that the model did not build for this mode is not a
    // silent drop — there is nothing to render.
    if (!values.length) {
      objects.push({ object: entry.object, state: entry.optional ? 'NOT_BUILT_FOR_THIS_MODE' : 'MISSING_FROM_MODEL' });
      if (!entry.optional) violations.push({ caseId, order, object: entry.object, reason: 'required presentation object absent from the model' });
      continue;
    }
    const missing = values.filter((value) => !html.includes(esc(value)));
    objects.push({ object: entry.object, state: missing.length ? 'NOT_RENDERED' : 'RENDERED', checked: values.length, missing });
    if (missing.length) {
      violations.push({ caseId, order, object: entry.object, reason: 'built by the presentation model but absent from the rendered report', missing: missing.slice(0, 3) });
    }
  }

  // Every page the model declares must exist in the rendered output. The cover
  // carries a placeholder heading that is never printed, so it is proved by its
  // central judgement instead, above.
  const pageHeadings = model.pages.filter((page) => page.kind !== 'cover').map((page) => page.heading);
  const missingPages = pageHeadings.filter((heading) => !html.includes(esc(heading)));
  if (missingPages.length) {
    violations.push({ caseId, order, object: 'pages', reason: 'declared page missing from the rendered report', missing: missingPages });
  }

  const renderedPages = (html.match(/<section class="page/g) ?? []).length;
  if (renderedPages !== model.pages.length) {
    violations.push({ caseId, order, object: 'pageCount', reason: `model declares ${model.pages.length} pages; renderer emitted ${renderedPages}` });
  }

  cases.push({ caseId, order, mode: model.narrativeMode, modelPages: model.pages.length, renderedPages, objects });
}

const summary = {
  cases: cases.length,
  violations: violations.length,
  byCase: cases.map((entry) => ({
    caseId: entry.caseId,
    mode: entry.mode,
    modelPages: entry.modelPages,
    renderedPages: entry.renderedPages,
    rendered: entry.objects.filter((o) => o.state === 'RENDERED').length,
    notBuilt: entry.objects.filter((o) => o.state === 'NOT_BUILT_FOR_THIS_MODE').length,
    notRendered: entry.objects.filter((o) => o.state === 'NOT_RENDERED').map((o) => o.object)
  })),
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-pass3-final-certification/preflight';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'renderer-consumption-map.json'), `${JSON.stringify({ summary, cases }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} customer-facing presentation object(s) never reach the page.`);
  process.exit(1);
}
console.log('\nPASS: every customer-facing presentation object is rendered.');

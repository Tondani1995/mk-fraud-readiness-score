#!/usr/bin/env node
/**
 * Maturity semantic consistency gate.
 *
 * Pass 3's visual review found the product carrying three incompatible maturity
 * scales, so one page could print two different labels for the same number:
 * CASE-08 stated overall maturity "Structured" for 60 while labelling every
 * 60.00 domain "Developing"; CASE-11 stated "Strategic" for 100 while labelling
 * every 100 domain "Managed".
 *
 * Every customer-facing maturity label, overall or per domain, must agree with
 * the single authoritative scale in src/lib/scoring/maturity-band.ts.
 *
 * Usage:
 *   npm run v11:maturity-consistency-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { renderEssentialReportHtml } from '../../src/lib/reports/essential/render-essential-html.ts';
import { getMaturityBand, MATURITY_BAND_THRESHOLDS } from '../../src/lib/scoring/maturity-band.ts';
import { bandFor } from '../../src/lib/reports/essential/presentation-model.ts';
import { bandForScore } from '../../src/lib/reports/select-content-blocks.ts';

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};

/** Band names that existed only in the Essential presentation layer. */
const RETIRED_LABELS = ['Initial', 'Defined', 'Managed'];

const violations = [];

// ---- 1. Boundary tests: one scale, agreed by every implementation ----------
const BOUNDARY_EXPECTATIONS = [
  [0, 'Reactive'], [20, 'Reactive'], [35.55, 'Reactive'], [39.99, 'Reactive'],
  [40, 'Developing'], [45, 'Developing'], [59.99, 'Developing'],
  [60, 'Structured'], [65, 'Structured'], [73.57, 'Structured'], [79.99, 'Structured'],
  [80, 'Strategic'], [85, 'Strategic'], [100, 'Strategic']
];
const boundaries = [];
for (const [score, expected] of BOUNDARY_EXPECTATIONS) {
  const central = getMaturityBand(score);
  const presentation = bandFor(score);
  const contentBlocks = bandForScore(score);
  const agree = central === expected && presentation === expected && contentBlocks === expected;
  boundaries.push({ score, expected, central, presentation, contentBlocks, agree });
  if (!agree) violations.push({ code: 'MATURITY_BOUNDARY_DISAGREEMENT', score, expected, central, presentation, contentBlocks });
}

// ---- 2. Every rendered report agrees with the central scale ----------------
const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const cases = [];
for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const model = buildEssentialPresentationModel({ factPack: pack, thesis: buildReportThesis(pack, blueprint), blueprint, commentary: {} });
  const html = renderEssentialReportHtml(model);

  // Overall maturity must match the overall score.
  const expectedOverall = getMaturityBand(model.readinessScore.score);
  if (model.readinessScore.maturity && model.readinessScore.maturity !== expectedOverall) {
    violations.push({ code: 'MATURITY_SEMANTIC_CONSISTENCY', caseId, where: 'overall maturity', score: model.readinessScore.score, printed: model.readinessScore.maturity, expected: expectedOverall });
  }

  // Every domain row's band must match its own score.
  const badRows = model.domainProfile.rows
    .map((row) => ({ title: row.title, score: row.score, printed: row.band, expected: getMaturityBand(row.score) }))
    .filter((row) => row.printed !== row.expected);
  for (const row of badRows) {
    violations.push({ code: 'MATURITY_SEMANTIC_CONSISTENCY', caseId, where: `domain row "${row.title}"`, score: row.score, printed: row.printed, expected: row.expected });
  }

  // The retired labels must not reach a customer page at all.
  const retiredOnPage = RETIRED_LABELS.filter((label) => new RegExp(`>\\s*${label}\\s*<`).test(html));
  for (const label of retiredOnPage) {
    violations.push({ code: 'RETIRED_MATURITY_LABEL_RENDERED', caseId, label });
  }

  cases.push({
    caseId, order, mode: model.narrativeMode,
    overallScore: model.readinessScore.score, overallMaturity: model.readinessScore.maturity, expectedOverall,
    domainRows: model.domainProfile.rows.length,
    contradictoryRows: badRows.length,
    rows: model.domainProfile.rows.map((r) => ({ title: r.title, score: r.score, band: r.band })),
    retiredLabelsRendered: retiredOnPage
  });
}

const summary = {
  authoritativeScale: MATURITY_BAND_THRESHOLDS.map((b) => `${b.label} ${b.min}-${Number.isFinite(b.max) ? b.max : '100+'}`),
  boundaryTests: { total: boundaries.length, agreed: boundaries.filter((b) => b.agree).length },
  cases: cases.length,
  contradictoryRowsTotal: cases.reduce((sum, c) => sum + c.contradictoryRows, 0),
  violations: violations.length,
  byCase: cases.map((c) => ({ caseId: c.caseId, score: c.overallScore, maturity: c.overallMaturity, contradictoryRows: `${c.contradictoryRows}/${c.domainRows}`, retired: c.retiredLabelsRendered })),
  boundaries,
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-pass4-freeze-certification/preflight';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'maturity-consistency-analysis.json'), `${JSON.stringify({ summary, cases }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} maturity contradiction(s). One score must not carry two band names.`);
  process.exit(1);
}
console.log('\nPASS: one maturity scale, agreed by every implementation and every rendered report.');

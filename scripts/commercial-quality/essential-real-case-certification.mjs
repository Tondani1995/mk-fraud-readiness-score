#!/usr/bin/env node
/**
 * Deterministic certification across the real scored, order-backed assessments.
 *
 * No provider calls and no rendering. The point is to know the analytical state
 * is trustworthy before spending anything on generation.
 *
 * Database access is read-only throughout.
 *
 * Usage:
 *   ORDERS="MKORD-...,MKORD-..." npm run v11:essential-real-cases
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
import { validateEssentialPresentation } from '../../src/lib/reports/essential/presentation-validation.ts';
import { exposureClusters, unownedScenarios } from '../../src/lib/reports/essential/content-families.ts';

/** The eleven real scored, order-backed assessments in Staging. */
const DEFAULT_ORDERS = [
  'MKORD-2026-B1DN82OG', 'MKORD-2026-D1U0CTO8', 'MKORD-2026-RHFC6DYH', 'MKORD-2026-HB0OT81P',
  'MKORD-2026-22FF6B69', 'MKORD-2026-7FBBEE23', 'MKORD-2026-O8E19UPV', 'MKORD-2026-RXXUNVD9',
  'MKORD-2026-1EOLBY7Y', 'MKORD-2026-72BCEIDN', 'MKORD-2026-O9DT0QTT'
];

/** Rivonia is the frozen remediation reference and must not drift. */
const RIVONIA = { order: 'MKORD-2026-22FF6B69', score: 35.55, maturity: 'Reactive', mode: 'REMEDIATION', exposures: 3, scenarios: 3 };

const orders = (process.env.ORDERS ?? DEFAULT_ORDERS.join(',')).split(',').map((entry) => entry.trim()).filter(Boolean);
const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-reproducibility-hardening-phase2';

const cases = [];
for (const order of orders) {
  try {
    const data = await assembleReportData(order);
    const evidence = buildAdvisoryEvidenceModel(data);
    const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
    const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
    const thesis = buildReportThesis(pack, blueprint);
    const model = buildEssentialPresentationModel({ factPack: pack, thesis, blueprint, commentary: {} });
    const validation = validateEssentialPresentation(model);
    const clusters = exposureClusters(blueprint);
    cases.push({
      order,
      ok: validation.ok,
      mode: model.narrativeMode,
      score: model.readinessScore.score,
      maturity: model.readinessScore.maturity,
      strongest: model.readinessScore.strongest.title,
      weakest: model.readinessScore.weakest.title,
      contrasts: model.materialContrasts?.contrasts.length ?? 0,
      diagnostics: model.diagnosis.rows.length,
      strengths: model.strengths?.rows.length ?? 0,
      watchpoints: model.watchpoints?.rows.length ?? 0,
      exposures: model.exposures?.rows.length ?? 0,
      clusterIds: clusters.map((cluster) => cluster.clusterId),
      scenarios: model.scenarios?.scenarios.length ?? 0,
      unownedScenarios: unownedScenarios(clusters, pack.scenarios ?? []),
      priorities: model.priorities.rows.map((row) => row.outcome),
      roadmapStages: model.roadmap.stages.map((stage) => ({ stage: stage.stage, actions: stage.actions.length })),
      metrics: model.dashboard.rows.length,
      pages: model.pages.length,
      words: validation.customerWordCount,
      centralJudgement: model.cover.centralJudgement,
      issues: validation.issues
    });
  } catch (error) {
    cases.push({ order, ok: false, error: String(error?.message ?? error).slice(0, 300) });
  }
}

const failures = cases.filter((entry) => !entry.ok);
const distinctJudgements = new Set(cases.map((entry) => entry.centralJudgement).filter(Boolean)).size;
const distinctPriorities = new Set(cases.map((entry) => (entry.priorities ?? []).join('|')).filter(Boolean)).size;

// Rivonia non-regression. The reference must not move while other shapes are fixed.
const rivonia = cases.find((entry) => entry.order === RIVONIA.order);
const rivoniaChecks = rivonia ? {
  present: true,
  score: rivonia.score === RIVONIA.score,
  maturity: rivonia.maturity === RIVONIA.maturity,
  mode: rivonia.mode === RIVONIA.mode,
  exposures: rivonia.exposures === RIVONIA.exposures,
  scenarios: rivonia.scenarios === RIVONIA.scenarios,
  validation: rivonia.ok
} : { present: false };
const rivoniaOk = Object.values(rivoniaChecks).every(Boolean);

// A sustainment report must not carry an exposure register or crisis language.
const sustainment = cases.filter((entry) => entry.mode === 'SUSTAINMENT');
const manufacturedWeakness = sustainment.filter((entry) => (entry.exposures ?? 0) > 0 || (entry.scenarios ?? 0) > 0);
const sustainmentSubstantive = sustainment.every((entry) => (entry.strengths ?? 0) > 0 && (entry.watchpoints ?? 0) > 0);

const summary = {
  attempted: cases.length,
  passed: cases.length - failures.length,
  failed: failures.length,
  byMode: cases.reduce((acc, entry) => { acc[entry.mode ?? 'ERROR'] = (acc[entry.mode ?? 'ERROR'] ?? 0) + 1; return acc; }, {}),
  wordRange: [Math.min(...cases.map((c) => c.words ?? Infinity)), Math.max(...cases.map((c) => c.words ?? 0))],
  distinctJudgements,
  distinctPriorities,
  unownedScenarioTotal: cases.reduce((sum, entry) => sum + (entry.unownedScenarios?.length ?? 0), 0),
  rivoniaNonRegression: rivoniaOk ? 'PASS' : 'FAIL',
  rivoniaChecks,
  sustainmentCases: sustainment.length,
  sustainmentSubstantive: sustainmentSubstantive ? 'PASS' : 'FAIL',
  manufacturedWeakness: manufacturedWeakness.length,
  failures: failures.map((entry) => ({ order: entry.order, issues: entry.issues?.map((i) => i.code) ?? entry.error }))
};

fs.mkdirSync(path.join(outDir, 'analysis'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'analysis', 'real-11-summary.json'), `${JSON.stringify({ summary, cases }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

const certified = failures.length === 0 && rivoniaOk && manufacturedWeakness.length === 0 && sustainmentSubstantive;
process.exit(certified ? 0 : 1);

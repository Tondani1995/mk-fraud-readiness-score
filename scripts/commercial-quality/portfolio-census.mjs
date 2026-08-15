#!/usr/bin/env node
/**
 * Portfolio census and analytical-shape analysis. Zero provider calls, zero writes.
 *
 * Runs the existing deterministic analytical engine over every order-backed
 * scored assessment and records the lightweight characteristics needed to choose
 * an owner-acceptance case. No AI, no PDF, no database mutation.
 *
 * Usage:
 *   npm run v11:portfolio-census
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';

/** Every order-backed assessment carrying a score, from the read-only census. */
const ORDERS = (process.env.ORDERS ?? '').split(',').filter(Boolean).map((o) => [o, '']);

/**
 * Profile-shape rule, stated so it can be argued with.
 *
 * Based on the domain-score range (max - min) across the ten domains, with the
 * population standard deviation recorded alongside it. The thresholds are set
 * from the observed portfolio: flat fixtures produce exactly 0, and the widest
 * real profile produces 53.57.
 *
 *   FLAT          range = 0
 *   NEAR_FLAT     range < 10
 *   MODERATELY_VARIED  10 <= range < 30
 *   HIGHLY_VARIED range >= 30
 */
function profileShape(range) {
  if (range === 0) return 'FLAT';
  if (range < 10) return 'NEAR_FLAT';
  if (range < 30) return 'MODERATELY_VARIED';
  return 'HIGHLY_VARIED';
}

/**
 * Provenance, conservatively assigned.
 *
 * An organisation name is not evidence of a customer. Names carrying an
 * engineering marker — a QA/gate/journey/test tag, or an embedded build date —
 * are fixtures. Everything else is UNCERTAIN unless it reads as an ordinary
 * trading name, and even then it is only CUSTOMER_LIKE, never "real".
 */
const FIXTURE_MARKER = /\b(?:MKG?\d*|QA|TEST|MKTEST|MKTST|MKADAPT|PRE-G\d+|G\d{2}|JOURNEY|SYNTHETIC|CERTIFICATION|CORRECTION|FIXTURE|SMOKE|DEMO|RC1)\b|\d{8}/i;
const TRADING_SUFFIX = /\((?:Pty|Proprietary)\)\s*Ltd|\bLimited\b|\bInc\b|\bCC\b/i;
function provenance(name) {
  if (FIXTURE_MARKER.test(name)) return 'TEST_FIXTURE';
  if (TRADING_SUFFIX.test(name)) return 'CUSTOMER_LIKE';
  return 'UNCERTAIN';
}

const rows = [];
const failures = [];

for (const [order, expectedOrg] of ORDERS) {
  try {
    const data = await assembleReportData(order);
    const evidence = buildAdvisoryEvidenceModel(data);
    const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
    const assembly = assembleComprehensive(evidence);
    const model = buildComprehensiveManagementModel(assembly);

    const domains = pack.domains.filter((d) => typeof d.score === 'number');
    const scores = domains.map((d) => d.score);
    const range = scores.length ? Number((Math.max(...scores) - Math.min(...scores)).toFixed(2)) : 0;
    const mean = scores.reduce((s, v) => s + v, 0) / (scores.length || 1);
    const sd = Number(Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (scores.length || 1)).toFixed(2));
    const sorted = [...domains].sort((a, b) => a.score - b.score);

    rows.push({
      order,
      organisation: pack.organisation.name,
      provenance: provenance(pack.organisation.name),
      score: pack.assessment.score,
      maturity: pack.assessment.maturity,
      mode: model.narrativeMode,
      domainRange: range,
      domainSd: sd,
      shape: profileShape(range),
      lowestDomain: sorted[0] ? `${sorted[0].name} (${sorted[0].score})` : null,
      highestDomain: sorted.at(-1) ? `${sorted.at(-1).name} (${sorted.at(-1).score})` : null,
      bandsPresent: [...new Set(scores.map(getMaturityBand))],
      findings: assembly.counts.findings,
      risks: assembly.counts.risks,
      controls: assembly.counts.controls,
      evidenceItems: model.registers.evidence.reduce((s, g) => s + g.items.length, 0),
      scenarios: assembly.counts.scenarios ?? null,
      decisions: model.core.decisionAgenda.length,
      actions: assembly.counts.programmeActions,
      managementThemes: model.core.managementThemes.length,
      exposureThemes: model.core.exposureThemes.length,
      governanceRoles: model.core.governanceRoles.length
    });
    process.stderr.write(`  ok ${order} ${pack.organisation.name}\n`);
  } catch (error) {
    failures.push({ order, expectedOrg, error: String(error?.message ?? error) });
    process.stderr.write(`  FAIL ${order}: ${error?.message ?? error}\n`);
  }
}

// Distinct analytical shapes: identical score + domain range + mode is one shape.
const shapeKey = (r) => `${r.score}|${r.domainRange}|${r.mode}`;
const shapeGroups = new Map();
for (const row of rows) {
  const key = shapeKey(row);
  if (!shapeGroups.has(key)) shapeGroups.set(key, []);
  shapeGroups.get(key).push(row.order);
}

const summary = {
  generatedAt: new Date().toISOString(),
  providerCalls: 0,
  databaseWrites: 0,
  analysed: rows.length,
  failures,
  distinctAnalyticalShapes: shapeGroups.size,
  shapeGroups: [...shapeGroups.entries()].map(([key, orders]) => ({ key, orders, duplicated: orders.length > 1 })),
  byMode: rows.reduce((acc, r) => ({ ...acc, [r.mode]: (acc[r.mode] ?? 0) + 1 }), {}),
  byShape: rows.reduce((acc, r) => ({ ...acc, [r.shape]: (acc[r.shape] ?? 0) + 1 }), {}),
  byProvenance: rows.reduce((acc, r) => ({ ...acc, [r.provenance]: (acc[r.provenance] ?? 0) + 1 }), {}),
  profiles: rows.sort((a, b) => b.domainRange - a.domainRange)
};

const outDir = process.env.OUT_DIR ?? '/Users/tondani/Documents/Codex/mk-fraud-readiness-score-joint-launch-integration/outputs/product-owner-acceptance/portfolio';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'expanded-scored-portfolio.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ analysed: summary.analysed, failures: failures.length, distinctAnalyticalShapes: summary.distinctAnalyticalShapes, byMode: summary.byMode, byShape: summary.byShape, byProvenance: summary.byProvenance }, null, 2));

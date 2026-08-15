#!/usr/bin/env node
/**
 * Programme taxonomy gate — zero provider calls.
 *
 * The report described all 83 P06 programme objects as "implementation actions"
 * when only 31 were initial control establishment; the remaining 52 were
 * operating-cycle and effectiveness work. This gate proves every object carries a
 * work type assigned at creation, that the types sum to the total, and that later
 * work is never counted or described as initial implementation.
 *
 * Usage:
 *   npm run v11:comprehensive-programme-taxonomy-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';

const DEFAULT_ORDERS = [
  'MKORD-2026-B1DN82OG', 'MKORD-2026-D1U0CTO8', 'MKORD-2026-RHFC6DYH', 'MKORD-2026-HB0OT81P',
  'MKORD-2026-22FF6B69', 'MKORD-2026-7FBBEE23', 'MKORD-2026-O8E19UPV', 'MKORD-2026-RXXUNVD9',
  'MKORD-2026-1EOLBY7Y', 'MKORD-2026-72BCEIDN', 'MKORD-2026-O9DT0QTT',
  'MKORD-2026-OAP06NIM', 'MKORD-2026-OAP08AUR'
];
const orders = (process.env.ORDERS ?? DEFAULT_ORDERS.join(',')).split(',').map((v) => v.trim()).filter(Boolean);
const VALID = new Set(['IMPLEMENT', 'CONFIRM', 'EMBED_AND_EVIDENCE', 'ASSURE_AND_REVIEW']);
const INITIAL = new Set(['30 days', '60 days', '90 days']);
const LATER = new Set(['3-6 months', '6-12 months']);

const cases = [];
const violations = [];

for (const order of orders) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const assembly = assembleComprehensive(evidence, { scenarioFacts: pack.scenarios });
  const add = (code, detail) => violations.push({ order, code, detail });

  const actions = assembly.programme.horizons.flatMap((horizon) => horizon.actions.map((action) => ({ ...action, horizon: horizon.horizon })));
  const counts = {};
  for (const action of actions) {
    if (!VALID.has(action.workType)) { add('MISSING_WORK_TYPE', `${action.actionId} has "${action.workType}"`); continue; }
    counts[action.workType] = (counts[action.workType] ?? 0) + 1;
    // Later horizons are never initial establishment work.
    if (LATER.has(action.horizon) && (action.workType === 'IMPLEMENT' || action.workType === 'CONFIRM')) {
      add('LATER_WORK_AS_INITIAL', `${action.actionId} in ${action.horizon} is ${action.workType}`);
    }
    if (INITIAL.has(action.horizon) && (action.workType === 'EMBED_AND_EVIDENCE' || action.workType === 'ASSURE_AND_REVIEW')) {
      add('INITIAL_WORK_AS_LATER', `${action.actionId} in ${action.horizon} is ${action.workType}`);
    }
    // Sustainment initial work confirms; it does not remediate.
    if (assembly.narrativeMode === 'SUSTAINMENT' && action.workType === 'IMPLEMENT') {
      add('SUSTAINMENT_LABELLED_REMEDIATION', `${action.actionId} is IMPLEMENT in a sustainment programme`);
    }
    // Later work must be grounded in real operating data.
    if (LATER.has(action.horizon) && !action.effectivenessMeasure && !action.completionCriterion) {
      add('LATER_WORK_UNGROUNDED', `${action.actionId} has no effectiveness or completion basis`);
    }
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total !== actions.length) add('COUNTS_DO_NOT_SUM', `${total} typed vs ${actions.length} objects`);
  if (total !== assembly.counts.programmeActions) add('COUNTS_DO_NOT_SUM', `${total} typed vs ${assembly.counts.programmeActions} reported`);
  const ids = actions.map((action) => action.actionId);
  if (ids.length !== new Set(ids).size) add('DUPLICATE_ACTION', `${ids.length - new Set(ids).size} duplicate id(s)`);

  cases.push({ order, mode: assembly.narrativeMode, total: actions.length, ...counts });
}

const summary = { cases: cases.length, violations: violations.length, byCase: cases, violationDetail: violations };
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/product-owner-acceptance/final-comprehensive-correction/session-c1';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'programme-taxonomy.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ cases: summary.cases, violations: summary.violations, byCase: cases.slice(-2) }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} programme-taxonomy violation(s).`);
  for (const violation of violations.slice(0, 10)) console.error(`  ${violation.order} ${violation.code}: ${violation.detail}`);
  process.exit(1);
}
console.log('\nPASS: every programme object is typed, the counts sum, and later work is never called initial implementation.');

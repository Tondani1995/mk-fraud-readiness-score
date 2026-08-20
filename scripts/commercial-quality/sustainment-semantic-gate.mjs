#!/usr/bin/env node
/**
 * Sustainment semantic gate — zero provider calls.
 *
 * A Structured report said "Fraud risk is not yet managed through a repeatable
 * cycle of ownership, assessment and review" on one page, and on another said
 * "These are not weaknesses. Each one is a capability the assessment shows is
 * working." Both came from the same deterministic model. The absence claim was
 * a fixed pattern template applied regardless of the assessed state.
 *
 * This gate checks the one rule that makes those two statements incompatible:
 * where the deterministic state says a capability is operating, customer-facing
 * text may discuss preservation, evidence, dependency, coverage, drift and
 * deterioration, but may not assert the capability is absent or failing.
 *
 * The word "weakness" is not banned. Only an unsupported absence claim about an
 * operating capability is.
 *
 * Usage:
 *   npm run v11:sustainment-semantic-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis } from '../../src/lib/reports/narrative/bounded-section-engine.ts';

const DEFAULT_ORDERS = [
  'MKORD-2026-B1DN82OG', 'MKORD-2026-D1U0CTO8', 'MKORD-2026-RHFC6DYH', 'MKORD-2026-HB0OT81P',
  'MKORD-2026-22FF6B69', 'MKORD-2026-7FBBEE23', 'MKORD-2026-O8E19UPV', 'MKORD-2026-RXXUNVD9',
  'MKORD-2026-1EOLBY7Y', 'MKORD-2026-72BCEIDN', 'MKORD-2026-O9DT0QTT',
  'MKORD-2026-OAP06NIM', 'MKORD-2026-OAP08AUR'
];
const orders = (process.env.ORDERS ?? DEFAULT_ORDERS.join(',')).split(',').map((v) => v.trim()).filter(Boolean);

/**
 * Claims that the capability does not exist or is not managed.
 *
 * Deliberately narrow. "Weakness" alone is legitimate — a sustainment report may
 * discuss what a weakness would look like, and the drift exhibit explicitly says
 * "these are not weaknesses". Only a positive assertion of absence counts.
 */
const ABSENCE_CLAIM = [
  /\bis not (?:yet )?managed\b/i,
  /\bnot (?:yet )?managed through\b/i,
  /\bdoes not exist\b/i,
  /\bis not in place\b/i,
  /\bno repeatable\b/i,
  /\blacks? (?:a|any) \w+/i,
  /\bis (?:absent|missing)\b/i,
  /\bhas not been established\b/i,
  /\bis failing\b/i
];

/** A denial of the claim is not the claim. */
const NEGATED = /\b(?:not|never|no longer|rather than|instead of)\s+(?:a\s+)?(?:weakness|failure|absence)\b/i;

const cases = [];
const violations = [];

for (const order of orders) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const model = buildEssentialPresentationModel({ factPack: pack, thesis: buildReportThesis(pack, blueprint), blueprint, commentary: {} });
  const add = (code, detail) => violations.push({ order, code, detail });

  const rows = Array.isArray(model.diagnosis) ? model.diagnosis : (model.diagnosis?.rows ?? []);
  let operatingRows = 0;
  for (const row of rows) {
    const operating = row.assessedState === 'OPERATING';
    if (!operating) continue;
    operatingRows += 1;
    const text = String(row.whyItMatters ?? '');
    if (NEGATED.test(text)) continue;
    for (const pattern of ABSENCE_CLAIM) {
      const match = text.match(pattern);
      if (match) add('OPERATING_CAPABILITY_DESCRIBED_AS_ABSENT', `${row.patternId}: "${match[0]}" — every contributing domain is Structured or better`);
    }
  }

  cases.push({ order, mode: pack.narrativeMode ?? 'UNKNOWN', diagnosisRows: rows.length, operatingRows });
}

// Negative control: the pre-fix text against an operating state must be caught.
const controlText = 'Fraud risk is not yet managed through a repeatable cycle of ownership, assessment and review.';
const controlCaught = ABSENCE_CLAIM.some((pattern) => pattern.test(controlText)) && !NEGATED.test(controlText);
// Positive control: the drift exhibit's own denial must NOT be caught.
const denialText = 'These are not weaknesses. Each one is a capability the assessment shows is working.';
const denialCaught = ABSENCE_CLAIM.some((pattern) => pattern.test(denialText)) && !NEGATED.test(denialText);
if (!controlCaught) violations.push({ order: 'NEGATIVE-CONTROL', code: 'CONTROL_DID_NOT_FIRE', detail: 'pre-fix absence claim not detected' });
if (denialCaught) violations.push({ order: 'POSITIVE-CONTROL', code: 'FALSE_POSITIVE', detail: 'the drift exhibit denial was flagged' });

const summary = {
  cases: cases.length, violations: violations.length,
  negativeControl: controlCaught ? 'PASS' : 'FAIL',
  positiveControl: denialCaught ? 'FAIL' : 'PASS',
  byCase: cases, violationDetail: violations
};
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/product-owner-acceptance/correction-review';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sustainment-semantic.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ cases: summary.cases, violations: summary.violations, negativeControl: summary.negativeControl, positiveControl: summary.positiveControl, operatingRows: cases.reduce((s, c) => s + c.operatingRows, 0) }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} sustainment-semantic violation(s).`);
  for (const violation of violations.slice(0, 8)) console.error(`  ${violation.order} ${violation.code}: ${violation.detail}`);
  process.exit(1);
}
console.log('\nPASS: no operating capability is described as absent.');

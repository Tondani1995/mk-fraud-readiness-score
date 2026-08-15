#!/usr/bin/env node
/**
 * Supported-maturity-vocabulary gate.
 *
 * Pass 4 lost CASE-06 because the hard-truth validator rejected any maturity
 * band other than the report's overall one. A domain profile legitimately spans
 * bands: CASE-06 is Developing overall with five Structured domains, and page 2
 * prints exactly that. The narrative was failed for saying what the exhibit
 * shows.
 *
 * The rule is now: a band the assessment evidences may be used; a band no
 * assessed object carries may not. This gate proves both halves across the
 * portfolio at zero provider cost.
 *
 * Usage:
 *   npm run v11:maturity-vocabulary-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis, buildNarrativeSlotPlan, buildNarrativeSectionContract, usesUnsupportedMaturityLabel } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};
const ALL_BANDS = ['Reactive', 'Developing', 'Structured', 'Strategic'];

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
  const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);

  const overall = thesis.overallPosition?.maturity ?? pack.assessment?.maturity;
  const domainBands = [...new Set(pack.domains.filter((d) => typeof d.score === 'number').map((d) => getMaturityBand(d.score)))];
  const expected = [...new Set([overall, ...domainBands].filter(Boolean))];
  const unsupported = ALL_BANDS.filter((band) => !expected.includes(band));

  // Every slot must carry the same supported set.
  const contracts = plan.slots.map((slot) => buildNarrativeSectionContract(slot, pack, thesis));
  for (const contract of contracts) {
    const actual = contract.supportedMaturityBands ?? [];
    if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
      violations.push({ caseId, code: 'SUPPORTED_BAND_SET_MISMATCH', slotId: contract.slotId, expected, actual });
    }
  }

  // Every band the assessment evidences must be usable as a label.
  for (const band of expected) {
    const probe = `The assessed maturity band here is ${band} on the recorded profile.`;
    if (usesUnsupportedMaturityLabel(probe, expected)) {
      violations.push({ caseId, code: 'LEGITIMATE_LABEL_REJECTED', band, expected, probe });
    }
  }
  // A band no assessed object carries must still be rejected.
  for (const band of unsupported) {
    const probe = `The assessed maturity band here is ${band} on the recorded profile.`;
    if (!usesUnsupportedMaturityLabel(probe, expected)) {
      violations.push({ caseId, code: 'UNSUPPORTED_LABEL_ACCEPTED', band, expected, probe });
    }
  }

  cases.push({ caseId, order, mode: pack.narrativeMode, overallScore: pack.assessment?.score, overallMaturity: overall, domainBands, supported: expected, rejected: unsupported, slots: contracts.length });
}

const summary = {
  cases: cases.length,
  violations: violations.length,
  legitimateRejections: violations.filter((v) => v.code === 'LEGITIMATE_LABEL_REJECTED').length,
  unsupportedAcceptances: violations.filter((v) => v.code === 'UNSUPPORTED_LABEL_ACCEPTED').length,
  byCase: cases.map((c) => ({ caseId: c.caseId, mode: c.mode, score: c.overallScore, overall: c.overallMaturity, supported: c.supported, rejected: c.rejected })),
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-targeted-closure/preflight';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'maturity-vocabulary-analysis.json'), `${JSON.stringify({ summary, cases }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} maturity-vocabulary violation(s).`);
  process.exit(1);
}
console.log('\nPASS: every evidenced band is usable, every unevidenced band is rejected.');

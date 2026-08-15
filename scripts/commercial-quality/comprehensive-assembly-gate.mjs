#!/usr/bin/env node
/**
 * Comprehensive deterministic assembly gate.
 *
 * Runs the six-register assembly across the real cases with no provider calls
 * and checks the small number of things that would make the registers unsafe to
 * put in front of a customer:
 *
 *   PROVENANCE_PRESENT                        every row says where it came from
 *   NO_UNSUPPORTED_ORGANISATION_FACT          library content never claims MK saw it
 *   CURRENT_STATE_VS_RECOMMENDATION_SEPARATION  what is, kept apart from what should be
 *   NO_DUPLICATE_IMPLEMENTATION_ACTION        management is not told to do one thing twice
 *   NO_UNOWNED_SCENARIO                       every pathway has an owning risk
 *   MODE_COHERENCE                            sustainment does not manufacture weakness
 *
 * Usage:
 *   npm run v11:comprehensive-assembly-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { assembleComprehensive, unownedScenarioIds } from '../../src/lib/reports/comprehensive/assembly.ts';
import { claimsVerification, COMPREHENSIVE_PROVENANCE_RULES } from '../../src/lib/reports/comprehensive/product-contract.ts';

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};

/**
 * Phrasing that turns standing methodology into a claim about this customer.
 * "Your organisation currently operates a monthly review" is an observation MK
 * never made; "the control should operate monthly" is the recommendation.
 */
const ORGANISATION_FACT_VOICE = [
  /\byour organisation currently\b/i,
  /\byou currently (?:operate|maintain|perform)\b/i,
  /\bwe observed\b/i,
  /\bwe found\b/i,
  /\bthe organisation was found to\b/i
];

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const cases = [];
const violations = [];

for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const assembly = assembleComprehensive(evidence);
  const add = (code, detail) => violations.push({ caseId, order, code, detail });

  const everyRow = [
    ...assembly.findingRegister,
    ...assembly.riskRegister,
    ...assembly.controlBlueprints,
    ...assembly.governance.roles,
    ...assembly.governance.decisions,
    ...assembly.evidenceRequirements.flatMap((group) => group.items),
    ...assembly.programme.horizons.flatMap((horizon) => horizon.actions)
  ];

  // PROVENANCE_PRESENT
  for (const row of everyRow) {
    if (!row.provenance || !(row.provenance in COMPREHENSIVE_PROVENANCE_RULES)) {
      add('PROVENANCE_PRESENT', `row without a valid provenance class: ${JSON.stringify(row).slice(0, 120)}`);
      break;
    }
  }

  // NO_UNSUPPORTED_ORGANISATION_FACT — library rows may not assert observation
  // or verification.
  for (const row of everyRow.filter((entry) => entry.provenance === 'CONTROL_LIBRARY')) {
    const prose = Object.values(row).filter((value) => typeof value === 'string').join(' ');
    const verification = claimsVerification(prose);
    if (verification.violation) add('NO_UNSUPPORTED_ORGANISATION_FACT', `library row claims verification (${verification.matched})`);
    const observed = ORGANISATION_FACT_VOICE.find((pattern) => pattern.test(prose));
    if (observed) add('NO_UNSUPPORTED_ORGANISATION_FACT', `library row asserts an observation (${observed})`);
  }

  // CURRENT_STATE_VS_RECOMMENDATION_SEPARATION — both must exist and differ.
  for (const control of assembly.controlBlueprints) {
    if (!control.currentState) add('CURRENT_STATE_VS_RECOMMENDATION_SEPARATION', `${control.controlId} has no assessed current state`);
    if (!control.targetState && !control.controlDesign) add('CURRENT_STATE_VS_RECOMMENDATION_SEPARATION', `${control.controlId} has no recommended design`);
    if (control.currentState && control.currentState === control.targetState) {
      add('CURRENT_STATE_VS_RECOMMENDATION_SEPARATION', `${control.controlId} states the same text as current and target`);
    }
  }

  // NO_DUPLICATE_IMPLEMENTATION_ACTION
  const actions = assembly.programme.horizons.flatMap((horizon) => horizon.actions);
  const deliverables = actions.map((action) => `${action.targetPeriod}::${action.deliverable.toLowerCase()}`);
  if (new Set(deliverables).size !== deliverables.length) {
    add('NO_DUPLICATE_IMPLEMENTATION_ACTION', 'two actions in the same horizon specify identical work');
  }

  // NO_UNOWNED_SCENARIO
  const orphans = unownedScenarioIds(evidence);
  if (orphans.length) add('NO_UNOWNED_SCENARIO', `scenarios without an owning risk: ${orphans.join(', ')}`);

  // MODE_COHERENCE — a sustainment assessment must not be given a remediation
  // sized problem, and a remediation assessment must not come back empty.
  const mode = assembly.narrativeMode;
  if (mode === 'SUSTAINMENT' && assembly.counts.findings > 10) {
    add('MODE_COHERENCE', `sustainment carries ${assembly.counts.findings} findings, which reads as manufactured weakness`);
  }
  if (mode !== 'SUSTAINMENT' && assembly.counts.findings === 0) {
    add('MODE_COHERENCE', `${mode} produced no findings`);
  }
  if (assembly.counts.controls > 0 && assembly.counts.evidenceItems === 0) {
    add('MODE_COHERENCE', 'controls exist with no evidence requirement behind any of them');
  }

  cases.push({ caseId, order, mode, counts: assembly.counts, unownedScenarios: orphans.length });
}

const summary = {
  cases: cases.length,
  violations: violations.length,
  byCase: cases,
  ranges: ['findings', 'risks', 'controls', 'evidenceGroups', 'evidenceItems', 'governanceRoles', 'decisions', 'programmeActions', 'measures']
    .reduce((acc, key) => {
      const values = cases.map((entry) => entry.counts[key]);
      acc[key] = { min: Math.min(...values), max: Math.max(...values) };
      return acc;
    }, {}),
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/comprehensive-c2-assembly';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'assembly-portfolio.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ cases: summary.cases, violations: summary.violations, ranges: summary.ranges }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} assembly violation(s).`);
  for (const violation of violations.slice(0, 8)) console.error(`  ${violation.caseId} ${violation.code}: ${violation.detail}`);
  process.exit(1);
}
console.log('\nPASS: six registers assemble deterministically across every case.');

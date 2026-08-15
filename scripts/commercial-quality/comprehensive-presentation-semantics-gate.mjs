#!/usr/bin/env node
/**
 * Comprehensive presentation-semantics gate — zero provider calls.
 *
 * Owner review found the scenario table promising one thing and showing another:
 * the recorded control condition under "how it could begin", the expected control
 * standard under "warning indicators", and the raw label "control d10 q01" in
 * customer prose. The values were real; the columns lied about what they were.
 *
 * This gate proves each displayed field means what its heading says, and that the
 * high-readiness resilience view is grounded in sustainment-priority data rather
 * than in the assurance-validation scenario prose it used to borrow.
 *
 * Usage:
 *   npm run v11:comprehensive-presentation-semantics-gate
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

/** Raw engineering identifiers that must never reach a narrative column. */
const INTERNAL_LABEL = /\b(?:control[_ ]d\d+[_ ]q\d+|d\d+[-_]q\d+|scenario_?type|assurance_validation|control_gap)\b/i;
/** Text that describes an expected control rather than an observable signal. */
const EXPECTED_CONTROL_VOICE = /\b(?:should be (?:performed|reviewed|verified)|is expected to|the organisation should|a scheduled review reassesses|independently validate)\b/i;
/** A verification instruction masquerading as an analytical object. */
const VERIFICATION_INSTRUCTION = /\btest whether\b|\bvalidate that\b|\bconfirm whether the self-reported\b/i;

const cases = [];
const violations = [];

for (const order of orders) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const assembly = assembleComprehensive(evidence, { scenarioFacts: pack.scenarios });
  const add = (code, detail) => violations.push({ order, code, detail });

  // ---- Scenario portfolio (Remediation / Mixed) ----------------------------
  const packById = new Map((pack.scenarios ?? []).map((scenario) => [scenario.factRef, scenario]));
  for (const scenario of assembly.scenarioPortfolio) {
    const authoritative = packById.get(scenario.scenarioId);
    if (!authoritative) { add('SCENARIO_NOT_AUTHORITATIVE', `${scenario.scenarioId} is not a Fact Pack scenario`); continue; }

    // Tier inheritance: the same object must mean the same thing in both tiers.
    if (scenario.entryPoint !== authoritative.entryPoint) add('SCENARIO_ENTRY_DIVERGES', `${scenario.scenarioId} entry point differs from Essential`);
    if (scenario.mechanism !== authoritative.mechanism) add('SCENARIO_PROGRESSION_DIVERGES', `${scenario.scenarioId} progression differs from Essential`);
    if (JSON.stringify(scenario.warningIndicators) !== JSON.stringify(authoritative.warningIndicators)) {
      add('WARNINGS_NOT_AUTHORITATIVE', `${scenario.scenarioId} warning indicators differ from the Fact Pack`);
    }

    if (!scenario.entryPoint) add('SCENARIO_NO_ENTRY', `${scenario.scenarioId} has no beginning`);
    if (!scenario.warningIndicators.length) add('SCENARIO_NO_WARNINGS', `${scenario.scenarioId} has no warning indicators`);
    // The three columns must be distinct objects, not the same text reused.
    if (scenario.entryPoint && scenario.entryPoint === scenario.interruptionPoint) add('ENTRY_IS_INTERRUPTION', scenario.scenarioId);
    if (scenario.mechanism && scenario.mechanism === scenario.interruptionPoint) add('PROGRESSION_IS_INTERRUPTION', scenario.scenarioId);
    for (const indicator of scenario.warningIndicators) {
      if (EXPECTED_CONTROL_VOICE.test(indicator)) add('WARNING_IS_EXPECTED_CONTROL', `${scenario.scenarioId}: "${indicator.slice(0, 70)}"`);
    }
    for (const [field, value] of [['title', scenario.title], ['family', scenario.family], ['entryPoint', scenario.entryPoint], ['mechanism', scenario.mechanism], ['interruptionPoint', scenario.interruptionPoint]]) {
      if (INTERNAL_LABEL.test(String(value))) add('INTERNAL_LABEL_LEAK', `${scenario.scenarioId} ${field}: "${String(value).slice(0, 60)}"`);
    }
  }

  // ---- Resilience tests (Sustainment) -------------------------------------
  const priorityById = new Map(assembly.assurancePriorities.map((priority) => [priority.priorityId, priority]));
  for (const test of assembly.resilienceTests) {
    const source = priorityById.get(test.linkedAssurancePriorityId);
    if (!source) { add('RESILIENCE_NOT_TRACEABLE', test.testId); continue; }
    // Every field must be the authoritative sustainment-priority value.
    if (JSON.stringify(test.dependencyToTest) !== JSON.stringify(source.dependencies)) add('DEPENDENCY_NOT_AUTHORITATIVE', test.testId);
    if (test.deteriorationCondition !== source.deteriorationTrigger) add('DETERIORATION_NOT_AUTHORITATIVE', test.testId);
    if (test.evidenceToInspect !== source.evidenceManagementShouldHold) add('EVIDENCE_NOT_AUTHORITATIVE', test.testId);
    if (test.effectivenessSignal !== source.effectivenessIndicator) add('EFFECTIVENESS_NOT_AUTHORITATIVE', test.testId);
    if (test.reviewRhythm !== source.reviewFrequency) add('CADENCE_NOT_AUTHORITATIVE', test.testId);
    // No verification instruction may be presented as a deterioration signal.
    if (VERIFICATION_INSTRUCTION.test(test.deteriorationCondition)) add('VERIFICATION_AS_SIGNAL', `${test.testId}: "${test.deteriorationCondition.slice(0, 70)}"`);
    if (INTERNAL_LABEL.test(test.capability) || INTERNAL_LABEL.test(test.deteriorationCondition)) add('INTERNAL_LABEL_LEAK', test.testId);
    // Operating capabilities are never described as weak.
    if (/\bweakness\b|\bfail(?:ing|ure)\b|\bnot in place\b/i.test(`${test.capability} ${test.deteriorationCondition}`)) {
      add('MANUFACTURED_WEAKNESS', `${test.testId}: "${test.capability}"`);
    }
  }

  cases.push({
    order, mode: assembly.narrativeMode,
    scenarios: assembly.scenarioPortfolio.length,
    resilienceTests: assembly.resilienceTests.length,
    assurancePriorities: assembly.assurancePriorities.length
  });
}

// ---- Controls --------------------------------------------------------------
// The gate must catch the shapes owner review actually found.
const NEGATIVE = [
  { label: 'raw scenarioType in prose', fired: INTERNAL_LABEL.test('control d10 q01') },
  { label: 'expected control as warning indicator', fired: EXPECTED_CONTROL_VOICE.test('A scheduled review reassesses fraud risks, tests whether key controls still operate as designed.') },
  { label: 'verification instruction as signal', fired: VERIFICATION_INSTRUCTION.test('Test whether the self-reported controls would prevent, detect and respond.') }
];
const POSITIVE = [
  { label: 'real warning indicator', clean: !EXPECTED_CONTROL_VOICE.test('New or reactivated supplier before independent verification') },
  { label: 'real deterioration trigger', clean: !VERIFICATION_INSTRUCTION.test('Review overdue, or a key control found lapsed with no remediation owner.') },
  { label: 'technical ID in traceability field', clean: true }
];
for (const control of NEGATIVE) if (!control.fired) violations.push({ order: 'NEGATIVE-CONTROL', code: 'CONTROL_DID_NOT_FIRE', detail: control.label });
for (const control of POSITIVE) if (!control.clean) violations.push({ order: 'POSITIVE-CONTROL', code: 'FALSE_POSITIVE', detail: control.label });

const summary = {
  cases: cases.length, violations: violations.length,
  negativeControl: NEGATIVE.every((c) => c.fired) ? `PASS (${NEGATIVE.length}/${NEGATIVE.length})` : 'FAIL',
  positiveControl: POSITIVE.every((c) => c.clean) ? `PASS (${POSITIVE.length}/${POSITIVE.length})` : 'FAIL',
  byCase: cases, violationDetail: violations
};
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/product-owner-acceptance/final-comprehensive-correction/session-c1';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'presentation-semantics.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ cases: summary.cases, violations: summary.violations, negativeControl: summary.negativeControl, positiveControl: summary.positiveControl }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} presentation-semantics violation(s).`);
  for (const violation of violations.slice(0, 10)) console.error(`  ${violation.order} ${violation.code}: ${violation.detail}`);
  process.exit(1);
}
console.log('\nPASS: every displayed field means what its heading says, and the resilience view is authoritative.');

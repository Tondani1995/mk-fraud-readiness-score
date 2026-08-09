#!/usr/bin/env node
/**
 * Behavioural proof for deterministic risk composition: sentence grammar and exposure grounding.
 *
 * These call consequenceClause() and buildRiskRegister() directly with deliberately malformed and
 * label-prefixed source fragments, rather than asserting on an already-clean literal. The V7
 * artefact they lock out:
 *   "...resulting in Alert backlogs can conceal important anomalies.; Direct -- unreviewed
 *    exceptions can allow losses to compound.."
 * and the unsupported exposure framing ("multiple linked exposure factors", "critical, hard-gate,
 * exposure and cap evidence") on an assessment where exposure was never assessed.
 *
 * No provider is called.
 */
import assert from 'node:assert/strict';
import { consequenceClause, buildRiskRegister, deriveRiskRatings } from '../src/lib/reports/evidence-model/registers.ts';
import { buildMaterialFindings } from '../src/lib/reports/evidence-model/material-findings.ts';
import { buildMateriallyWeakDecisionFixture } from '../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';

// Real findings from the accepted fixture, so the register builder is exercised against genuine
// source material rather than a hand-rolled shape that can drift from MaterialFinding.
const realFindings = buildMaterialFindings(buildMateriallyWeakDecisionFixture());

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  not ok - ${name}\n    ${error.message}`); }
}

const ARTEFACTS = ['.;', '..', 'Direct --', 'Indirect --'];
function assertClean(text, where) {
  for (const artefact of ARTEFACTS) {
    assert.ok(!String(text).includes(artefact),
      `${where} must not contain ${JSON.stringify(artefact)}: ${String(text).slice(0, 160)}`);
  }
}

// --------------------------------------------------------------- the normaliser itself
test('consequenceClause strips a Direct label and the trailing terminator', () => {
  assert.equal(
    consequenceClause('Direct -- Alert backlogs can conceal important anomalies.'),
    'Alert backlogs can conceal important anomalies');
});
test('consequenceClause strips an Indirect label and a doubled terminator', () => {
  assert.equal(
    consequenceClause('Indirect -- unreviewed exceptions can allow losses to compound..'),
    'unreviewed exceptions can allow losses to compound');
});
test('consequenceClause handles empty, null and already-clean input', () => {
  assert.equal(consequenceClause(''), '');
  assert.equal(consequenceClause(null), '');
  assert.equal(consequenceClause(undefined), '');
  assert.equal(consequenceClause('already clean'), 'already clean');
  // It must not eat meaningful interior punctuation.
  assert.equal(consequenceClause('losses compound; controls fail.'), 'losses compound; controls fail');
});
test('consequenceClause collapses whitespace and trailing semicolons', () => {
  assert.equal(consequenceClause('  spaced   out   text ;  '), 'spaced out text');
});

// --------------------------------------------------------------- the real register builder
test('built risk statements are free of composer artefacts', () => {
  const register = buildRiskRegister(realFindings);
  assert.ok(register.length > 0, 'the builder must produce entries');
  for (const risk of register) {
    assertClean(risk.riskStatement, 'riskStatement');
    assertClean(risk.currentControlPosition, 'currentControlPosition');
    assertClean(risk.likelihoodRationale, 'likelihoodRationale');
    assertClean(risk.impactRationale, 'impactRationale');
    assert.match(risk.riskStatement, /^Because .+, there is a risk that .+\.$/,
      'the statement must remain a terminated sentence');
  }
});

// --------------------------------------------------------------- exposure grounding
const exposureWords = /exposure/i;

test('exposure assessed: exposure-linked reasoning may remain', () => {
  const register = buildRiskRegister(realFindings, true);
  const text = register.map((r) => `${r.likelihoodRationale} ${r.impactRationale}`).join(' ');
  assert.match(text, exposureWords,
    'a genuinely assessed exposure may still inform the rationale');
});

test('exposure NOT assessed: no rationale may mention or imply exposure', () => {
  const register = buildRiskRegister(realFindings, false);
  assert.ok(register.length > 0);
  for (const risk of register) {
    assert.ok(!exposureWords.test(risk.likelihoodRationale),
      `likelihood rationale must not cite exposure: ${risk.likelihoodRationale}`);
    assert.ok(!exposureWords.test(risk.impactRationale),
      `impact rationale must not cite exposure: ${risk.impactRationale}`);
    // Nor may it silently substitute a "low exposure" claim.
    assert.ok(!/low exposure|no exposure/i.test(`${risk.likelihoodRationale} ${risk.impactRationale}`));
    // The remaining supported evidence must still be reasoned from.
    assert.match(`${risk.likelihoodRationale} ${risk.impactRationale}`,
      /hard-gate|critical|cap|scenario|dependency|self-assessment/i,
      'supported evidence must still carry the reasoning');
  }
});

test('unassessed exposure cannot influence the rating through linked factor codes', () => {
  // This finding is High only because two exposure factors are linked; with exposure unassessed
  // that evidence does not exist and must not drive the rating.
  // Built from a GENUINE finding, then minimally adjusted to isolate the exposure-only driver.
  // The algorithm treats a hard-gate/capping finding as High when responseValue <= 1 OR two or more
  // exposure factors are linked; setting responseValue above 1 removes the independent driver so
  // only the linked exposure can produce High. Nothing else about the finding is invented.
  const base = realFindings.find((f) => f.isHardGate || f.maturityCapStatus === 'capping');
  assert.ok(base, 'the accepted fixture must contain a hard-gate or capping finding');
  const softGate = {
    ...base,
    responseValue: 3,
    isHardGate: true,
    maturityCapStatus: 'capping',
    materialityClass: base.materialityClass === 'assurance_priority' ? 'critical_gap' : base.materialityClass,
    linkedExposureFactorCodes: ['EX-A', 'EX-B']
  };
  const withExposure = deriveRiskRatings([softGate], 'Major', true);
  const withoutExposure = deriveRiskRatings([softGate], 'Major', false);
  assert.equal(withExposure.likelihood, 'High',
    'two linked exposure factors justify High when exposure was assessed');
  assert.notEqual(withoutExposure.likelihood, 'High',
    'unassessed exposure must not manufacture a High likelihood');
  assert.ok(!exposureWords.test(withoutExposure.likelihoodRationale));
});

test('the default keeps existing callers unchanged', () => {
  const explicit = deriveRiskRatings(realFindings, 'Major', true);
  const defaulted = deriveRiskRatings(realFindings, 'Major');
  assert.deepEqual(defaulted, explicit, 'omitting the flag must behave as exposure assessed');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);

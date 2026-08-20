#!/usr/bin/env node
/**
 * Behavioural proof that scenarios name the supported mechanism.
 *
 * V7 gave every scenario the generic risk title ("Fraud Risk Identification control effectiveness
 * risk") and an identical entry point ("An ordinary process, system, person or third-party
 * interaction relevant to <domain>."), so two materially different mechanisms read the same. These
 * tests drive the real model builders with the accepted fixture. No provider is called.
 */
import assert from 'node:assert/strict';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { buildMateriallyWeakDecisionFixture } from '../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  not ok - ${name}\n    ${error.message}`); }
}

const model = buildAdvisoryEvidenceModel(buildMateriallyWeakDecisionFixture());
const scenarios = model.plausibleScenarios ?? model.scenarios ?? [];
const GENERIC = 'An ordinary process, system, person or third-party interaction relevant to';

test('the fixture produces scenarios to inspect', () => {
  assert.ok(scenarios.length >= 2, `expected at least two scenarios, got ${scenarios.length}`);
});

test('two materially different mechanisms produce different titles and entry points', () => {
  const gapScenarios = scenarios.filter((s) => s.scenarioBasis !== 'assurance_validation');
  const titles = new Set(gapScenarios.map((s) => s.title));
  const entries = new Set(gapScenarios.map((s) => s.entryPoint));
  assert.ok(titles.size >= 2,
    `distinct mechanisms must yield distinct titles; got ${JSON.stringify([...titles])}`);
  assert.ok(entries.size >= 2,
    `distinct mechanisms must yield distinct entry points; got ${entries.size}`);
});

test('no control-gap scenario keeps the generic entry-point placeholder where a mechanism exists', () => {
  for (const scenario of scenarios) {
    const hasMechanism = (scenario.linkedControlWeaknesses ?? []).length > 0
      && scenario.scenarioBasis !== 'assurance_validation';
    if (hasMechanism && scenario.entryPoint.includes(GENERIC)) {
      // Only acceptable when the linked findings assert no scenario type at all.
      assert.ok(false, `generic entry point survived: ${scenario.title}`);
    }
  }
});

test('titles are not bare domain or "control effectiveness risk" labels', () => {
  for (const scenario of scenarios.filter((s) => s.scenarioBasis !== 'assurance_validation')) {
    assert.ok(!/control effectiveness risk$/i.test(scenario.title),
      `generic title survived: ${scenario.title}`);
  }
});

test('provenance, disclaimer and non-allegation framing are retained', () => {
  for (const scenario of scenarios) {
    assert.ok(scenario.disclaimer && /not an allegation/i.test(scenario.disclaimer),
      'every scenario must retain its disclaimer');
    assert.ok((scenario.evidenceRefs ?? []).length > 0, 'evidence refs must remain');
    assert.ok((scenario.linkedRiskIds ?? []).length > 0 || scenario.scenarioType,
      'risk/type provenance must remain');
    assert.ok(!/did occur|has occurred|committed fraud/i.test(scenario.title + ' ' + scenario.fraudSequence),
      'a scenario must never allege an event occurred');
  }
});

test('assurance-validation scenarios stay non-assertive', () => {
  for (const scenario of scenarios.filter((s) => s.scenarioBasis === 'assurance_validation')) {
    assert.match(scenario.fraudSequence, /resilience exercise|Test whether/i,
      'a self-reported operating control must not be restated as an asserted weakness');
  }
});

test('scenario composition is deterministic across repeated builds', () => {
  const again = buildAdvisoryEvidenceModel(buildMateriallyWeakDecisionFixture());
  const other = again.plausibleScenarios ?? again.scenarios ?? [];
  assert.deepEqual(other.map((s) => [s.id, s.title, s.entryPoint]),
    scenarios.map((s) => [s.id, s.title, s.entryPoint]),
    'repeated builds must produce identical scenario presentation');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);

#!/usr/bin/env node
/**
 * Snapshot conversion experience -- deterministic contract tests.
 *
 * Covers the two modules the frozen UX specification makes load-bearing:
 *   - the gap inventory (variants A-E, and the critical-vs-major attribution guard); and
 *   - the next-step recommendation (every rule, plus its reachable boundaries).
 *
 * Both are pure functions of persisted score-run fields. Nothing here may call a model.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGapInventory, buildFalseComfortPairing } from '../../src/lib/snapshot/gap-inventory.ts';
import { buildNextStepRecommendation } from '../../src/lib/snapshot/next-step-recommendation.ts';
import {
  inventoryBody,
  inventoryDefinition,
  meaningHeading,
  tensionLine,
  factStrip
} from '../../src/lib/snapshot/result-copy.ts';

function domain(code, name, rawScore, criticalGapCount = 0, coveragePct = 100, weightPct = 10) {
  return {
    domainId: `id-${code}`,
    domainCode: code,
    domainName: name,
    weightPct,
    rawScore,
    weightedContribution: rawScore === null ? null : rawScore * (weightPct / 100),
    coveragePct,
    criticalGapCount
  };
}

function snapshotFixture(overrides = {}) {
  return {
    assessmentId: 'assessment-1',
    assessmentReference: 'MKFRS-TEST-0001',
    organisationName: 'Test Organisation (Pty) Ltd',
    respondentName: 'Test Respondent',
    respondentEmail: 'respondent@example.invalid',
    scoreRunId: 'run-1',
    methodologyVersionId: 'methodology-1',
    runNumber: 1,
    overallScore: 55,
    calculatedMaturity: 'Developing',
    finalMaturity: 'Developing',
    exposureScore: null,
    exposureBand: null,
    coveragePct: 100,
    nARatePct: 0,
    criticalGapCount: 0,
    majorGapCount: 0,
    capApplied: false,
    capReason: null,
    scoredAt: '2026-08-29T08:00:00.000Z',
    domains: [domain('D1', 'Fraud Leadership and Governance', 55), domain('D2', 'Fraud Risk Identification', 60)],
    resultStatus: 'NORMAL',
    adaptiveMetrics: null,
    comparabilityStatement: null,
    ...overrides
  };
}

/* ------------------------------------------------------------------ inventory */

test('Inventory variant A states both classifications and attributes only critical gaps', () => {
  const snapshot = snapshotFixture({
    criticalGapCount: 3,
    majorGapCount: 5,
    domains: [
      domain('D4', 'Fraud Detection Capability', 30, 2),
      domain('D1', 'Fraud Leadership and Governance', 40, 1),
      domain('D3', 'Operational Fraud Controls', 72, 0)
    ]
  });
  const inventory = buildGapInventory(snapshot);
  assert.equal(inventory.variant, 'A');
  assert.equal(inventory.criticalGapCount, 3);
  assert.equal(inventory.majorGapCount, 5);
  // Critical and major predicates overlap for some controls, so their run totals cannot be
  // added into a unique "control weaknesses" count without the underlying trace set.
  assert.equal(inventory.totalWeaknessCount, null);
  assert.equal(inventory.applicableAreaCount, 3);
  assert.equal(inventory.showsAreaTable, true);
  assert.equal(inventory.includesMajorGapNote, true);
  assert.deepEqual(inventory.rows.map((r) => [r.domainCode, r.criticalGapCount]), [['D4', 2], ['D1', 1]]);
  // Rows sum to the run critical count, and never include the major count.
  assert.equal(inventory.rows.reduce((sum, r) => sum + r.criticalGapCount, 0), snapshot.criticalGapCount);
  assert.match(inventoryDefinition(inventory), /Major gaps are counted across the assessment as a whole/);
  assert.match(inventoryBody(inventory), /3 critical-control gaps and 5 major gaps/);
  assert.doesNotMatch(inventoryBody(inventory), /8 control weaknesses/);
});

test('Inventory variant B omits the major-gap attribution note', () => {
  const inventory = buildGapInventory(snapshotFixture({
    criticalGapCount: 1,
    majorGapCount: 0,
    domains: [domain('D4', 'Fraud Detection Capability', 30, 1)]
  }));
  assert.equal(inventory.variant, 'B');
  assert.equal(inventory.showsAreaTable, true);
  assert.equal(inventory.includesMajorGapNote, false);
  assert.doesNotMatch(inventoryDefinition(inventory), /Major gaps/);
});

test('Inventory variant C reports major gaps but renders no area table', () => {
  const inventory = buildGapInventory(snapshotFixture({ criticalGapCount: 0, majorGapCount: 4 }));
  assert.equal(inventory.variant, 'C');
  assert.equal(inventory.majorGapCount, 4);
  assert.equal(inventory.showsAreaTable, false);
  assert.deepEqual(inventory.rows, []);
  // The copy must say the count without ever implying an area carries it.
  assert.match(inventoryBody(inventory), /4 major gaps/);
  assert.match(inventoryBody(inventory), /no critical-control gap/);
});

test('Inventory variant D pivots to consistency when nothing was recorded', () => {
  const inventory = buildGapInventory(snapshotFixture({ criticalGapCount: 0, majorGapCount: 0 }));
  assert.equal(inventory.variant, 'D');
  assert.equal(inventory.showsAreaTable, false);
  assert.match(inventoryBody(inventory), /no critical-control or major gap/);
});

test('Inventory variant E states no total at all', () => {
  const inventory = buildGapInventory(snapshotFixture({
    resultStatus: 'INSUFFICIENT_VISIBILITY',
    criticalGapCount: 3,
    majorGapCount: 5
  }));
  assert.equal(inventory.variant, 'E');
  assert.equal(inventory.criticalGapCount, null);
  assert.equal(inventory.majorGapCount, null);
  assert.equal(inventory.totalWeaknessCount, null);
  assert.equal(inventory.applicableAreaCount, null);
  assert.equal(inventory.showsAreaTable, false);
  // No digit may appear: an unreliable base cannot produce a reliable count.
  assert.doesNotMatch(inventoryBody(inventory), /\d/);
});

test('Major gaps are never attributed to an area in any variant', () => {
  const cases = [
    snapshotFixture({ criticalGapCount: 3, majorGapCount: 5, domains: [domain('D4', 'Fraud Detection Capability', 30, 3)] }),
    snapshotFixture({ criticalGapCount: 0, majorGapCount: 9 }),
    snapshotFixture({ criticalGapCount: 1, majorGapCount: 0, domains: [domain('D1', 'Fraud Leadership and Governance', 20, 1)] }),
    snapshotFixture({ resultStatus: 'INSUFFICIENT_VISIBILITY', criticalGapCount: 2, majorGapCount: 2 })
  ];
  for (const snapshot of cases) {
    const inventory = buildGapInventory(snapshot);
    const attributed = inventory.rows.reduce((sum, row) => sum + row.criticalGapCount, 0);
    assert.ok(attributed <= snapshot.criticalGapCount, 'attributed gaps exceed the recorded critical count');
    if (inventory.rows.length) assert.equal(attributed, snapshot.criticalGapCount);
  }
});

test('Inventory copy never uses invented classifications', () => {
  const banned = /material finding|issues identified|findings identified|observations?\b/i;
  for (const fixture of [
    snapshotFixture({ criticalGapCount: 2, majorGapCount: 2, domains: [domain('D1', 'Fraud Leadership and Governance', 20, 2)] }),
    snapshotFixture({ criticalGapCount: 0, majorGapCount: 3 }),
    snapshotFixture({ criticalGapCount: 0, majorGapCount: 0 }),
    snapshotFixture({ resultStatus: 'INSUFFICIENT_VISIBILITY' })
  ]) {
    const inventory = buildGapInventory(fixture);
    assert.doesNotMatch(inventoryBody(inventory), banned);
    assert.doesNotMatch(inventoryDefinition(inventory), banned);
  }
});

/* -------------------------------------------------------------- false comfort */

test('False-comfort pairing renders only when both ends and the separation exist', () => {
  const qualifying = snapshotFixture({
    domains: [domain('D3', 'Operational Fraud Controls', 78, 0), domain('D4', 'Fraud Detection Capability', 30, 2)]
  });
  const pairing = buildFalseComfortPairing(qualifying);
  assert.equal(pairing.strongestDomainName, 'Operational Fraud Controls');
  assert.equal(pairing.weakestDomainName, 'Fraud Detection Capability');

  // The tightest pair that can pass both end gates -- strongest exactly 70, weakest just under
  // 45 -- still separates by more than 25, so the separation guard is defensive rather than
  // reachable. Asserting the qualifying result keeps that fact visible if a threshold moves.
  assert.notEqual(buildFalseComfortPairing(snapshotFixture({
    domains: [domain('D3', 'Operational Fraud Controls', 70, 0), domain('D4', 'Fraud Detection Capability', 44, 0)]
  })), null, 'the tightest pair passing both end gates should still qualify');

  // A weak end at or above 45 does not qualify.
  assert.equal(buildFalseComfortPairing(snapshotFixture({
    domains: [domain('D3', 'Operational Fraud Controls', 80, 0), domain('D4', 'Fraud Detection Capability', 46, 0)]
  })), null);

  // No strong end.
  assert.equal(buildFalseComfortPairing(snapshotFixture({
    domains: [domain('D3', 'Operational Fraud Controls', 60, 0), domain('D4', 'Fraud Detection Capability', 20, 1)]
  })), null);

  // Low coverage disqualifies.
  assert.equal(buildFalseComfortPairing(snapshotFixture({
    domains: [domain('D3', 'Operational Fraud Controls', 80, 0, 40), domain('D4', 'Fraud Detection Capability', 20, 1)]
  })), null);

  // Insufficient visibility suppresses it entirely.
  assert.equal(buildFalseComfortPairing(snapshotFixture({
    resultStatus: 'INSUFFICIENT_VISIBILITY',
    domains: [domain('D3', 'Operational Fraud Controls', 80, 0), domain('D4', 'Fraud Detection Capability', 20, 1)]
  })), null);
});

/* ----------------------------------------------------------- recommendation */

const RULE_CASES = [
  {
    rule: 'C1',
    tier: null,
    snapshot: snapshotFixture({ resultStatus: 'INSUFFICIENT_VISIBILITY', criticalGapCount: 4, capApplied: true })
  },
  {
    rule: 'C2',
    tier: 'comprehensive',
    snapshot: snapshotFixture({
      criticalGapCount: 3,
      domains: [domain('D1', 'Fraud Leadership and Governance', 20, 2), domain('D4', 'Fraud Detection Capability', 25, 1)]
    })
  },
  {
    rule: 'C2',
    tier: 'comprehensive',
    label: 'cap applied with a single gap',
    snapshot: snapshotFixture({ capApplied: true, criticalGapCount: 1, domains: [domain('D1', 'Fraud Leadership and Governance', 20, 1)] })
  },
  {
    rule: 'C3',
    tier: 'comprehensive',
    snapshot: snapshotFixture({
      overallScore: 30,
      finalMaturity: 'Reactive',
      criticalGapCount: 0,
      majorGapCount: 0,
      domains: Array.from({ length: 6 }, (_, i) => domain(`D${i + 1}`, `Area ${i + 1}`, 30))
    })
  },
  {
    rule: 'C4',
    tier: 'essential',
    snapshot: snapshotFixture({
      overallScore: 65,
      finalMaturity: 'Structured',
      criticalGapCount: 2,
      domains: [domain('D1', 'Fraud Leadership and Governance', 40, 2), domain('D2', 'Fraud Risk Identification', 70)]
    })
  },
  {
    rule: 'C5',
    tier: 'essential',
    snapshot: snapshotFixture({ overallScore: 82, finalMaturity: 'Strategic', criticalGapCount: 0, majorGapCount: 1 })
  },
  {
    rule: 'C6',
    tier: 'comprehensive',
    snapshot: snapshotFixture({ finalMaturity: 'Developing', criticalGapCount: 0, majorGapCount: 4 })
  },
  {
    rule: 'C7',
    tier: 'essential',
    snapshot: snapshotFixture({ finalMaturity: 'Developing', criticalGapCount: 0, majorGapCount: 1, nARatePct: 30 })
  },
  {
    rule: 'C8',
    tier: 'essential',
    snapshot: snapshotFixture({ finalMaturity: 'Developing', criticalGapCount: 0, majorGapCount: 1, nARatePct: 10 })
  }
];

test('Every recommendation rule matches its own case and exactly one rule fires', () => {
  for (const testCase of RULE_CASES) {
    const result = buildNextStepRecommendation(testCase.snapshot);
    const label = testCase.label ? `${testCase.rule} (${testCase.label})` : testCase.rule;
    assert.equal(result.ruleId, testCase.rule, `expected ${label}, got ${result.ruleId}`);
    assert.equal(result.recommendedTier, testCase.tier, `${label} tier`);
    assert.ok(result.reason.trim().length > 0, `${label} must carry a reason`);
    assert.ok(result.freedomClause.trim().length > 0, `${label} must carry a freedom clause`);
  }
});

test('INSUFFICIENT_VISIBILITY never recommends a paid analytical report', () => {
  for (const extra of [
    { criticalGapCount: 0, majorGapCount: 0 },
    { criticalGapCount: 9, majorGapCount: 9, capApplied: true },
    { finalMaturity: 'Strategic', overallScore: 95 },
    { finalMaturity: 'Reactive', overallScore: 10, domains: Array.from({ length: 8 }, (_, i) => domain(`D${i + 1}`, `Area ${i + 1}`, 10)) }
  ]) {
    const result = buildNextStepRecommendation(snapshotFixture({ resultStatus: 'INSUFFICIENT_VISIBILITY', ...extra }));
    assert.equal(result.ruleId, 'C1');
    assert.equal(result.recommendedTier, null);
    assert.equal(result.speakToMkFirst, true);
    assert.match(result.freedomClause, /still order either report/);
  }
});

test('Recommendation boundaries behave as specified', () => {
  const withCritical = (criticalGapCount, domains) => snapshotFixture({
    overallScore: 65, finalMaturity: 'Structured', criticalGapCount, domains
  });

  // criticalGapCount 0 / 1 / 3 -- C5, C4, C2 respectively.
  assert.equal(buildNextStepRecommendation(withCritical(0, [domain('D1', 'A', 70)])).ruleId, 'C5');
  assert.equal(buildNextStepRecommendation(withCritical(1, [domain('D1', 'A', 40, 1)])).ruleId, 'C4');
  assert.equal(buildNextStepRecommendation(withCritical(3, [domain('D1', 'A', 40, 3)])).ruleId, 'C2');

  // majorGapCount 3 / 4 at Developing -- C8 then C6.
  assert.equal(buildNextStepRecommendation(snapshotFixture({ finalMaturity: 'Developing', majorGapCount: 3 })).ruleId, 'C8');
  assert.equal(buildNextStepRecommendation(snapshotFixture({ finalMaturity: 'Developing', majorGapCount: 4 })).ruleId, 'C6');

  // unknownShare 25 / 26 -- C8 then C7.
  assert.equal(buildNextStepRecommendation(snapshotFixture({ finalMaturity: 'Developing', nARatePct: 25 })).ruleId, 'C8');
  assert.equal(buildNextStepRecommendation(snapshotFixture({ finalMaturity: 'Developing', nARatePct: 26 })).ruleId, 'C7');

  // areas 5 / 6 at Reactive -- C8 then C3.
  const reactive = (count) => snapshotFixture({
    overallScore: 30, finalMaturity: 'Reactive',
    domains: Array.from({ length: count }, (_, i) => domain(`D${i + 1}`, `Area ${i + 1}`, 30))
  });
  assert.equal(buildNextStepRecommendation(reactive(5)).ruleId, 'C8');
  assert.equal(buildNextStepRecommendation(reactive(6)).ruleId, 'C3');
});

test('Recommendation reasons introduce no figure the page does not already show', () => {
  for (const testCase of RULE_CASES) {
    const result = buildNextStepRecommendation(testCase.snapshot);
    const numbers = (result.reason.match(/\d+/g) ?? []).map(Number);
    const snapshot = testCase.snapshot;
    const visible = new Set([
      snapshot.criticalGapCount,
      snapshot.majorGapCount,
      snapshot.domains.filter((d) => d.criticalGapCount > 0).length,
      snapshot.domains.filter((d) => d.rawScore !== null && d.coveragePct > 0).length,
      Math.round(snapshot.nARatePct)
    ]);
    for (const value of numbers) {
      assert.ok(visible.has(value), `rule ${result.ruleId} introduced ${value}, which is not shown elsewhere`);
    }
  }
});

test('Recommendation is a pure function of the snapshot', () => {
  const snapshot = snapshotFixture({ criticalGapCount: 3, domains: [domain('D1', 'A', 20, 3)] });
  const first = buildNextStepRecommendation(snapshot);
  const second = buildNextStepRecommendation(snapshot);
  assert.deepEqual(first, second);
});

/* ------------------------------------------------------------------- copy */

test('Tension line and meaning heading follow the recorded state', () => {
  assert.match(tensionLine(snapshotFixture({ overallScore: null })), /^Not issued/);
  assert.match(
    tensionLine(snapshotFixture({ capApplied: true, calculatedMaturity: 'Structured', finalMaturity: 'Developing' })),
    /Calculated as Structured, capped at Developing/
  );
  assert.match(tensionLine(snapshotFixture({ criticalGapCount: 1, majorGapCount: 1 })), /1 critical-control gap and 1 major gap recorded\./);
  assert.match(tensionLine(snapshotFixture({ criticalGapCount: 0, majorGapCount: 2 })), /2 major gaps recorded\. No critical-control gap\./);
  assert.equal(tensionLine(snapshotFixture()), 'No critical-control or major gap recorded.');

  assert.match(meaningHeading(snapshotFixture({ resultStatus: 'INSUFFICIENT_VISIBILITY' })), /unconfirmed/);
  assert.match(meaningHeading(snapshotFixture({ capApplied: true })), /holding your result down/);
  assert.match(meaningHeading(snapshotFixture({ criticalGapCount: 3 })), /^3 controls/);
  assert.match(meaningHeading(snapshotFixture({ criticalGapCount: 1 })), /^A control/);
  assert.match(meaningHeading(snapshotFixture()), /starting position/);
});

test('The cap line never claims an uncapped numeric score', () => {
  // The engine caps maturity, not the score, and persists no uncapped number. A numeric
  // "calculated 71" would be a figure the database cannot reproduce.
  const line = tensionLine(snapshotFixture({ capApplied: true, calculatedMaturity: 'Structured', finalMaturity: 'Developing', overallScore: 62 }));
  assert.doesNotMatch(line, /\b\d{2}\b/);
});

test('Fact strip renders both the adaptive and legacy paths', () => {
  const legacy = factStrip(snapshotFixture({ coveragePct: 87, nARatePct: 6, criticalGapCount: 3 }), 9);
  assert.deepEqual(legacy.map((f) => f.label), ['Coverage', 'Not applicable', 'Critical-control gaps', 'Areas assessed']);

  const adaptive = factStrip(snapshotFixture({
    adaptiveMetrics: { assessmentCoveragePct: 87.4, controlVisibilityPct: 91.2, unknownSharePct: 4.1 }
  }), 9);
  assert.deepEqual(adaptive.map((f) => f.label), ['Assessment coverage', 'Control visibility', 'Unknown responses', 'Areas assessed']);
  assert.equal(adaptive[0].value, '87%');
});

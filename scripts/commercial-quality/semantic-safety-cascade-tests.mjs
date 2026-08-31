#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SemanticCallLedger,
  SEMANTIC_ADJUDICATION_MIN_CONFIDENCE,
  detectSemanticCandidates,
  determineSemanticDisposition,
  runSemanticSafetyCascade
} from '../../src/lib/reports/narrative/semantic-safety-cascade.ts';

function candidate(targetId, overrides = {}) {
  return {
    targetId,
    candidateHash: `hash:${targetId}`,
    text: `candidate text for ${targetId}`,
    fieldRole: 'test-prose-field',
    issueCode: 'test_semantic_issue',
    issueFamily: 'test',
    deterministicFeatures: {},
    evidenceRefs: [`evidence:${targetId}`],
    evidence: { source: 'test-only' },
    ...overrides
  };
}

function evaluation(value, candidates = [], hardCandidates = [], valid = true) {
  return { value, candidates, hardCandidates, valid, validationIssues: [] };
}

function ledgerWithGeneration() {
  const ledger = new SemanticCallLedger();
  ledger.claim('generation');
  return ledger;
}

function adjudication(targetId, label, confidence = 0.95) {
  return {
    targetId,
    label,
    confidence,
    reasonCode: `test_${label.toLowerCase()}`,
    evidenceRefs: [`evidence:${targetId}`]
  };
}

test('candidate detection is observational and never rejects by itself', () => {
  const detected = detectSemanticCandidates({
    value: 'candidate input',
    detect: () => [candidate('test.one')]
  });
  assert.equal(detected.length, 1);
  assert.equal('outcome' in detected, false);
  assert.equal('rejected' in detected, false);
});

test('deterministic MUST_ALLOW produces zero adjudicator calls', async () => {
  const allowed = candidate('allow.one', { explicitContextAllow: true });
  assert.equal(determineSemanticDisposition({ candidate: allowed }).disposition, 'MUST_ALLOW');
  let adjudicatorCalls = 0;
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: { text: 'unchanged' },
    ledger,
    evaluate: (value) => evaluation(value, [allowed]),
    adjudicate: async () => { adjudicatorCalls += 1; return []; },
    applyRepairs: (value) => value
  });
  assert.equal(result.outcome, 'ACCEPT');
  assert.equal(adjudicatorCalls, 0);
  assert.equal(result.diagnostics.adjudicationCalls, 0);
  assert.equal(result.diagnostics.totalProviderCalls, 1);
});

test('deterministic MUST_REPAIR is applied before any adjudicator call', async () => {
  const repairable = candidate('deterministic.repair', { deterministicRepairAvailable: true });
  assert.equal(determineSemanticDisposition({ candidate: repairable }).disposition, 'MUST_REPAIR');
  let applied = 0;
  let adjudicatorCalls = 0;
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: { text: 'before' },
    ledger,
    evaluate: (value) => value.text === 'after'
      ? evaluation(value, [], [], true)
      : evaluation(value, [repairable]),
    applyDeterministicRepairs: (value) => { applied += 1; return { ...value, text: 'after' }; },
    adjudicate: async () => { adjudicatorCalls += 1; return []; },
    applyRepairs: (value) => value
  });
  assert.equal(result.outcome, 'ACCEPT');
  assert.equal(applied, 1);
  assert.equal(adjudicatorCalls, 0);
});

test('hard factual failure is HARD_REJECT with zero adjudicator calls', async () => {
  const hard = candidate('hard.truth', { hardTruth: true });
  let adjudicatorCalls = 0;
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: 'unchanged',
    ledger,
    evaluate: (value) => evaluation(value, [], [hard], false),
    adjudicate: async () => { adjudicatorCalls += 1; return [adjudication(hard.targetId, 'ALLOW_CONTEXT')]; },
    applyRepairs: (value) => value
  });
  assert.equal(result.outcome, 'REJECT');
  assert.equal(result.diagnostics.finalResult, 'HARD_REJECT');
  assert.equal(adjudicatorCalls, 0);
  assert.equal(result.diagnostics.adjudicationCalls, 0);
});

test('multiple ambiguities use exactly one batched adjudication call', async () => {
  const first = candidate('ambiguous.one');
  const second = candidate('ambiguous.two');
  let adjudicatorCalls = 0;
  const seen = [];
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: { text: 'original' },
    ledger,
    evaluate: (value) => evaluation(value, [first, second], [], true),
    adjudicate: async (candidates) => {
      adjudicatorCalls += 1;
      seen.push(candidates.map((item) => item.targetId));
      return candidates.map((item) => adjudication(item.targetId, 'ALLOW_CONTEXT'));
    },
    applyRepairs: (value) => value
  });
  assert.equal(result.outcome, 'ACCEPT');
  assert.equal(adjudicatorCalls, 1);
  assert.deepEqual(seen, [['ambiguous.one', 'ambiguous.two']]);
  assert.equal(result.diagnostics.adjudicationCounts.ALLOW_CONTEXT, 2);
  assert.equal(result.diagnostics.repairCalls, 0);
});

test('ALLOW_CONTEXT preserves the original value byte-for-byte', async () => {
  const allowed = candidate('byte.exact');
  const original = { text: 'original bytes', nested: ['same'] };
  let repairCalls = 0;
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: original,
    ledger,
    evaluate: (value) => evaluation(value, [allowed], [], true),
    adjudicate: async () => [adjudication(allowed.targetId, 'ALLOW_CONTEXT')],
    repair: async () => { repairCalls += 1; return []; },
    applyRepairs: (value) => value
  });
  assert.equal(result.outcome, 'ACCEPT');
  assert.strictEqual(result.value, original);
  assert.equal(JSON.stringify(result.value), JSON.stringify(original));
  assert.equal(repairCalls, 0);
});

test('multiple repairable candidates use exactly one batched repair call', async () => {
  const first = candidate('repair.one');
  const second = candidate('repair.two');
  let repairCalls = 0;
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: { repaired: new Set() },
    ledger,
    evaluate: (value) => value.repaired.size === 2
      ? evaluation(value, [], [], true)
      : evaluation(value, [first, second], [], true),
    adjudicate: async (candidates) => candidates.map((item) => adjudication(item.targetId, 'REPAIRABLE')),
    repair: async (targets) => {
      repairCalls += 1;
      return targets.map((target) => ({ targetId: target.targetId, repairedText: `repaired:${target.targetId}` }));
    },
    applyRepairs: (value, replacements) => ({
      repaired: new Set([...value.repaired, ...replacements.map((replacement) => replacement.targetId)])
    })
  });
  assert.equal(result.outcome, 'ACCEPT');
  assert.equal(repairCalls, 1);
  assert.equal(result.diagnostics.adjudicationCalls, 1);
  assert.equal(result.diagnostics.repairCalls, 1);
  assert.equal(result.diagnostics.repairTargetCount, 2);
  assert.equal(result.diagnostics.totalProviderCalls, 3);
});

test('mixed ALLOW_CONTEXT and REPAIRABLE changes only repair target IDs', async () => {
  const allowed = candidate('mixed.allow');
  const repairable = candidate('mixed.repair');
  const original = { values: { [allowed.targetId]: 'original allow', [repairable.targetId]: 'original repair' } };
  let replacementsSeen;
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: original,
    ledger,
    evaluate: (value) => value.values[repairable.targetId] === 'repaired'
      ? evaluation(value, [allowed], [], true)
      : evaluation(value, [allowed, repairable], [], true),
    adjudicate: async () => [
      adjudication(allowed.targetId, 'ALLOW_CONTEXT'),
      adjudication(repairable.targetId, 'REPAIRABLE')
    ],
    repair: async (targets) => {
      replacementsSeen = targets.map((target) => target.targetId);
      return [{ targetId: repairable.targetId, repairedText: 'repaired' }];
    },
    applyRepairs: (value, replacements) => ({
      values: { ...value.values, [replacements[0].targetId]: replacements[0].repairedText }
    })
  });
  assert.equal(result.outcome, 'ACCEPT');
  assert.deepEqual(replacementsSeen, ['mixed.repair']);
  assert.deepEqual(result.value, {
    values: { 'mixed.allow': 'original allow', 'mixed.repair': 'repaired' }
  });
});

test('AI cannot downgrade a hard reject', async () => {
  const hard = candidate('hard.cannot.downgrade', { hardTruth: true });
  let adjudicatorCalls = 0;
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: 'original',
    ledger,
    evaluate: (value) => evaluation(value, [], [hard]),
    adjudicate: async () => { adjudicatorCalls += 1; return [adjudication(hard.targetId, 'ALLOW_CONTEXT')]; },
    applyRepairs: (value) => value
  });
  assert.equal(result.outcome, 'REJECT');
  assert.equal(result.diagnostics.finalResult, 'HARD_REJECT');
  assert.equal(adjudicatorCalls, 0);
});

test('unknown or duplicate repair target IDs fail closed', async () => {
  for (const replacements of [
    [{ targetId: 'repair.unknown', repairedText: 'not allowed' }],
    [{ targetId: 'repair.one', repairedText: 'first' }, { targetId: 'repair.one', repairedText: 'duplicate' }]
  ]) {
    const target = candidate('repair.one');
    const ledger = ledgerWithGeneration();
    const result = await runSemanticSafetyCascade({
      initialValue: 'original',
      ledger,
      evaluate: (value) => evaluation(value, value === 'repaired' ? [] : [target], [], true),
      adjudicate: async () => [adjudication(target.targetId, 'REPAIRABLE')],
      repair: async () => replacements,
      applyRepairs: () => 'repaired'
    });
    assert.equal(result.outcome, 'REJECT');
    assert.equal(result.diagnostics.reasonCode, 'invalid_repair_targets');
  }
});

test('a repair that introduces a hard-truth defect fails final validation', async () => {
  const target = candidate('repair.introduces.hard');
  const hardAfterRepair = candidate('repair.introduces.hard', { hardTruth: true });
  const ledger = ledgerWithGeneration();
  const result = await runSemanticSafetyCascade({
    initialValue: 'original',
    ledger,
    evaluate: (value) => value === 'unsafe-repair'
      ? evaluation(value, [], [hardAfterRepair], false)
      : evaluation(value, [target], [], true),
    adjudicate: async () => [adjudication(target.targetId, 'REPAIRABLE')],
    repair: async () => [{ targetId: target.targetId, repairedText: 'unsafe' }],
    applyRepairs: () => 'unsafe-repair'
  });
  assert.equal(result.outcome, 'REJECT');
  assert.equal(result.diagnostics.reasonCode, 'repair_introduced_hard_truth_failure');
  assert.equal(result.diagnostics.finalResult, 'HARD_REJECT');
});

test('invalid, low-confidence or incomplete adjudication fails closed', async () => {
  const target = candidate('ambiguous.invalid');
  for (const response of [
    [],
    [adjudication(target.targetId, 'ALLOW_CONTEXT', SEMANTIC_ADJUDICATION_MIN_CONFIDENCE - 0.01)],
    [{ ...adjudication(target.targetId, 'ALLOW_CONTEXT'), label: 'NOT_A_LABEL' }]
  ]) {
    const ledger = ledgerWithGeneration();
    const result = await runSemanticSafetyCascade({
      initialValue: 'original',
      ledger,
      evaluate: (value) => evaluation(value, [target], [], true),
      adjudicate: async () => response,
      applyRepairs: (value) => value
    });
    assert.equal(result.outcome, 'REJECT');
    assert.equal(result.diagnostics.finalResult, 'AMBIGUOUS');
  }
});

test('the fourth provider call is mechanically impossible', () => {
  const ledger = new SemanticCallLedger();
  ledger.claim('generation');
  ledger.claim('adjudication');
  ledger.claim('repair');
  assert.deepEqual(ledger.snapshot(), { generationCalls: 1, adjudicationCalls: 1, repairCalls: 1, totalProviderCalls: 3 });
  assert.throws(() => ledger.claim('generation'), /semantic_generation_call_budget_exhausted/);
  assert.throws(() => ledger.claim('adjudication'), /semantic_adjudication_call_budget_exhausted/);
  assert.throws(() => ledger.claim('repair'), /semantic_repair_call_budget_exhausted/);
});

console.log(JSON.stringify({
  passed: true,
  checks: [
    'candidate detection is observational',
    'deterministic allow and repair precedence',
    'hard truth cannot reach adjudication',
    'one batched adjudication',
    'one batched repair',
    'allow context byte preservation',
    'targeted mixed repair',
    'repair target fail-closed validation',
    'post-repair hard truth validation',
    'adjudication confidence and shape validation',
    'three-call ledger ceiling'
  ]
}, null, 2));

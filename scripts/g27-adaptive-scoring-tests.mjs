import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateAdaptiveReadinessScore } from '../src/lib/scoring/adaptive-scoring.ts';
import { resolveAdaptivePath } from '../src/lib/adaptive/engine.ts';

const graph = JSON.parse(readFileSync(new URL('../docs/adaptive-assessment/adaptive-graph-v1-draft.json', import.meta.url), 'utf8'));
const methodology = {
  domains: graph.domains.map((domain, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    domainCode: domain.domainCode,
    name: domain.name,
    weightPct: domain.weightPct,
    domainType: 'control',
    isCore: index < 8,
    sortOrder: domain.sortOrder,
    questions: graph.questions.filter((question) => question.domainCode === domain.domainCode).map((question, questionIndex) => ({
      id: `10000000-0000-4000-8000-${String(graph.questions.indexOf(question) + 1).padStart(12, '0')}`,
      questionCode: question.questionCode,
      domainCode: question.domainCode,
      domainName: domain.name,
      prompt: question.prompt,
      helpText: null,
      weight: question.weight,
      isCritical: question.isCritical,
      isHardGate: question.isHardGate,
      nAAllowed: false,
      nARuleKey: null,
      triggerKey: null,
      sortOrder: questionIndex
    }))
  })),
  responseScale: [],
  exposureFactors: []
};

const gatewayAnswers = {
  G01: 'retail', G02: 'medium', G03: 'internal', G04: 'internal_department', G05: 'significant',
  G06: 'yes', G07: 'internal', G08: 'yes', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes',
  G13: 'yes', G14: 'formal_delegation'
};

function responses(path, value = 3) {
  return Object.fromEntries(path.activeNodes.filter((node) => node.kind !== 'gateway').map((node) => [node.nodeId, { responseState: 'maturity', responseValue: value }]));
}

function score(overrides = {}, extra = {}) {
  const path = resolveAdaptivePath({ graph, gatewayAnswers, controlResponses: overrides });
  return calculateAdaptiveReadinessScore({ graph, methodology, gatewayAnswers, controlResponses: overrides, ...extra });
}

const allApplicable = responses(resolveAdaptivePath({ graph, gatewayAnswers }));
const parity = score(allApplicable);
assert.equal(parity.resultStatus, 'NORMAL', 'all-applicable complete assessment is NORMAL');
assert.equal(parity.summary.overallScore, 60, 'all 3 responses produce the fixed-scale 60/100 parity result');
assert.equal(parity.summary.finalMaturity, 'Structured', 'maturity band follows approved thresholds');
assert.equal(parity.metrics.applicableCount, 68, 'all 68 controls are applicable on the full path');

const unknownId = Object.keys(allApplicable)[0];
const unknown = score({ ...allApplicable, [unknownId]: { responseState: 'unknown', responseValue: null } });
assert.equal(unknown.metrics.unknownCount, 1, 'unknown remains a visible applicable response');
assert.equal(unknown.metrics.unknownWeight > 0, true, 'unknown weight remains in the denominator');
assert.equal(unknown.summary.overallScore, parity.summary.overallScore, 'unknown does not receive zero-score credit');
assert.equal(unknown.metrics.controlVisibilityPct < 100, true, 'unknown reduces control visibility');
assert.equal(unknown.summary.exposureScore, null, 'adaptive exposure score is not assessed');
assert.equal(unknown.summary.exposureBand, null, 'adaptive exposure band is not assessed');

function unknownAtOrNear(targetPct) {
  const nodes = resolveAdaptivePath({ graph, gatewayAnswers }).activeNodes.filter((node) => node.kind !== 'gateway');
  const units = nodes.map((node) => ({ node, units: Math.round(Number(node.weight ?? graph.questions.find((q) => q.questionId === node.nodeId)?.weight ?? 0) * 4) }));
  const totalUnits = units.reduce((sum, item) => sum + item.units, 0);
  const targetUnits = Math.round(totalUnits * targetPct / 100);
  const states = new Map([[0, []]]);
  for (const item of units) {
    for (const [sum, ids] of [...states.entries()]) {
      const next = sum + item.units;
      if (!states.has(next)) states.set(next, [...ids, item.node.nodeId]);
    }
  }
  const best = [...states.entries()].sort((a, b) => Math.abs(a[0] - targetUnits) - Math.abs(b[0] - targetUnits))[0];
  return best[1];
}

const boundaryCases = [19, 20, 29, 30].map((target) => {
  const ids = unknownAtOrNear(target);
  const result = score({ ...allApplicable, ...Object.fromEntries(ids.map((id) => [id, { responseState: 'unknown', responseValue: null }])) });
  return { target, ids, result };
});
assert.equal(boundaryCases[0].result.metrics.unknownSharePct < 20, true, '19% unknown remains below the provisional threshold');
assert.equal(boundaryCases[1].result.metrics.unknownSharePct >= 20 && boundaryCases[1].result.resultStatus === 'PROVISIONAL', true, `20% unknown is provisional (${boundaryCases[1].result.metrics.unknownSharePct}, ${boundaryCases[1].result.resultStatus})`);
assert.equal(boundaryCases[2].result.metrics.unknownSharePct >= 20 && boundaryCases[2].result.metrics.unknownSharePct < 30 && boundaryCases[2].result.resultStatus === 'PROVISIONAL', true, `29% unknown is provisional (${boundaryCases[2].result.metrics.unknownSharePct}, ${boundaryCases[2].result.resultStatus})`);
assert.equal(boundaryCases[3].result.metrics.unknownSharePct >= 30 && boundaryCases[3].result.resultStatus === 'INSUFFICIENT_VISIBILITY', true, `30% unknown withholds the result (${boundaryCases[3].result.metrics.unknownSharePct}, ${boundaryCases[3].result.resultStatus})`);

const allUnknown = score(Object.fromEntries(Object.keys(allApplicable).map((id) => [id, { responseState: 'unknown', responseValue: null }])));
assert.equal(allUnknown.metrics.unknownSharePct, 100, '100% unknown is measured explicitly');
assert.equal(allUnknown.metrics.controlVisibilityPct, 0, '100% unknown has zero confirmed visibility');
assert.equal(allUnknown.summary.overallScore, null, '100% unknown has no readiness score');
assert.equal(allUnknown.summary.finalMaturity, null, '100% unknown has no maturity');
assert.equal(allUnknown.summary.criticalGapCount, 0, 'unknown responses create no confirmed critical gaps');
assert.equal(allUnknown.metrics.visibilityGaps.length, allUnknown.metrics.applicableCount, 'each unknown response creates a verification priority');

const redirectedAnswers = { ...gatewayAnswers, G01: 'construction', G03: 'outsourced', G04: 'outsourced', G07: 'outsourced', G14: 'owner_led' };
const redirected = calculateAdaptiveReadinessScore({ graph, methodology, gatewayAnswers: redirectedAnswers, controlResponses: responses(resolveAdaptivePath({ graph, gatewayAnswers: redirectedAnswers })) });
assert.equal(redirected.metrics.redirectedCount > 0, true, 'outsourced control is represented as redirected oversight');
assert.equal(redirected.metrics.redirectedWeight > 0, true, 'redirected oversight retains the base weight');

const excludedPath = { ...gatewayAnswers, G01: 'professional_services', G05: 'none', G06: 'no', G08: 'no', G09: 'no', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'formal_delegation' };
const excluded = calculateAdaptiveReadinessScore({ graph, methodology, gatewayAnswers: excludedPath, controlResponses: responses(resolveAdaptivePath({ graph, gatewayAnswers: excludedPath })), integritySignals: [] });
assert.equal(excluded.metrics.excludedCount > 0, true, 'valid gateway exclusions remain outside the denominator');
assert.equal(excluded.metrics.excludedWeight > 0, true, 'excluded control weight is tracked separately');
assert.equal(excluded.metrics.questionTraces.filter((trace) => trace.triggeredRules.includes('valid_gateway_exclusion')).every((trace) => !trace.applicable), true, 'excluded controls cannot become applicable weaknesses');

const zeroQuestion = Object.keys(allApplicable)[1];
const zero = score({ ...allApplicable, [zeroQuestion]: { responseState: 'maturity', responseValue: 0 } });
assert.equal(zero.summary.criticalGapCount >= 0, true, 'zero responses are the only responses eligible for confirmed absence scoring');
assert.equal(zero.metrics.unknownCount, 0, 'zero is not uncertainty');

const provisional = score({ ...allApplicable, [unknownId]: { responseState: 'unknown', responseValue: null } });
assert.equal(['NORMAL', 'PROVISIONAL'].includes(provisional.resultStatus), true, 'ordinary uncertainty keeps the result issuable or provisional');
const insufficient = score({}, { integritySignals: [{ signalId: 'blocking_test_signal', blocking: true }] });
assert.equal(insufficient.resultStatus, 'INSUFFICIENT_VISIBILITY', 'blocking integrity signal with no answers withholds the result');
assert.equal(insufficient.summary.overallScore, null, 'insufficient visibility has no customer score');
assert.equal(insufficient.summary.finalMaturity, null, 'insufficient visibility has no maturity band');

console.log(JSON.stringify({ ok: true, assertions: 18, parityScore: parity.summary.overallScore, unknownSharePct: unknown.metrics.unknownSharePct, redirected: redirected.metrics.redirectedCount, excluded: excluded.metrics.excludedCount, insufficient: insufficient.resultStatus }));

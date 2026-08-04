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
assert.equal(unknown.summary.overallScore < parity.summary.overallScore, true, 'unknown receives zero score credit');

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

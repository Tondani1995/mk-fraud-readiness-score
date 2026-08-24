import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FROZEN_ADAPTIVE_GRAPH_FINGERPRINT,
  FROZEN_ADAPTIVE_GRAPH_VERSION,
  deriveAdaptiveIntegritySignals,
  evaluateAdaptiveCondition,
  previewGatewayChange,
  resolveAdaptivePath,
  validateAdaptiveGraph
} from '../src/lib/adaptive/engine.ts';

const graph = JSON.parse(readFileSync(new URL('../docs/adaptive-assessment/adaptive-graph-v1-draft.json', import.meta.url), 'utf8'));

function expect(condition, message) {
  assert.equal(Boolean(condition), true, message);
}

function answers(overrides = {}) {
  return {
    G01: 'professional_services', G02: 'medium', G03: 'internal', G04: 'internal_department',
    G05: 'none', G06: 'no', G07: 'internal', G08: 'no', G09: 'no', G10: 'no', G11: 'no',
    G12: 'no', G13: 'no', G14: 'formal_delegation', ...overrides
  };
}

function allMaturity(path, value = 3) {
  return Object.fromEntries(path.activeNodes.filter((node) => node.kind !== 'gateway').map((node) => [node.nodeId, { responseState: 'maturity', responseValue: value }]));
}

assert.deepEqual(validateAdaptiveGraph(graph, FROZEN_ADAPTIVE_GRAPH_FINGERPRINT), []);
assert.equal(graph.graphVersion, FROZEN_ADAPTIVE_GRAPH_VERSION);
assert.equal(graph.graphFingerprint, FROZEN_ADAPTIVE_GRAPH_FINGERPRINT);
assert.equal(evaluateAdaptiveCondition(null, {}), true);
assert.equal(evaluateAdaptiveCondition({ questionId: 'G03', equals: 'internal' }, answers()), true);
assert.equal(evaluateAdaptiveCondition({ questionId: 'G03', in: ['outsourced', 'shared_service'] }, answers()), false);
assert.equal(evaluateAdaptiveCondition({ any: [{ questionId: 'G03', equals: 'internal' }, { questionId: 'G08', equals: 'platform' }] }, answers()), true);
assert.equal(evaluateAdaptiveCondition({ all: [{ questionId: 'G03', equals: 'internal' }, { questionId: 'G08', equals: 'platform' }] }, answers()), false);
assert.equal(evaluateAdaptiveCondition({ not: { questionId: 'G03', equals: 'outsourced' } }, answers()), true);
assert.equal(evaluateAdaptiveCondition({ questionId: 'G03', equals: 'internal' }, {}), false);

const professional = resolveAdaptivePath({ graph, gatewayAnswers: answers() });
expect(professional.profileOnlyNodes.length === 14, 'answered gateways must be retained as profile-only nodes');
expect(professional.currentNextNode === 'D1-Q01', 'completed profile gateways must lead to the first applicable control');
expect(professional.currentPreviousNode === 'G09', 'back navigation must retain the last answered profile gateway');
expect(professional.excludedCount > 0, 'professional path should exclude out-of-scope controls');

const retail = resolveAdaptivePath({ graph, gatewayAnswers: answers({ G01: 'retail', G05: 'significant', G06: 'yes', G08: 'yes', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes' }) });
expect(retail.activePathCount > professional.activePathCount, 'retail path should expose more controls than the reduced professional path');

const construction = resolveAdaptivePath({ graph, gatewayAnswers: answers({ G01: 'construction', G03: 'outsourced', G04: 'outsourced', G05: 'significant', G06: 'yes', G07: 'outsourced', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G14: 'owner_led' }) });
expect(construction.redirectedCount > 0, 'construction outsourced path must retain oversight variants');
expect(construction.nodes.some((node) => node.kind === 'oversight' && node.replacementFor), 'oversight replacement must be explicit');

const online = resolveAdaptivePath({ graph, gatewayAnswers: answers({ G01: 'online', G03: 'shared_service', G04: 'shared_service', G07: 'shared_service', G08: 'platform', G09: 'yes', G10: 'yes' }) });
expect(online.nodes.some((node) => node.nodeId === 'OV-D8-Q02'), 'online platform path must include the D8 oversight variant');

const small = resolveAdaptivePath({ graph, gatewayAnswers: answers({ G02: 'small', G03: 'none', G04: 'owner_led', G07: 'none', G13: 'no' }) });
expect(small.activePathCount < professional.activePathCount, 'small reduced path must reduce the applicable denominator');

const unknown = resolveAdaptivePath({ graph, gatewayAnswers: answers({ G01: 'unknown', G02: 'unknown', G03: 'unknown', G04: 'unknown', G05: 'unknown', G06: 'unknown', G07: 'unknown', G08: 'unknown', G09: 'unknown', G10: 'unknown', G11: 'unknown', G12: 'unknown', G13: 'unknown', G14: 'unknown' }) });
const unknownResponses = allMaturity(unknown);
for (const id of Object.keys(unknownResponses)) unknownResponses[id] = { responseState: 'unknown', responseValue: null };
const unknownSignals = deriveAdaptiveIntegritySignals({ graph, path: resolveAdaptivePath({ graph, gatewayAnswers: answers({ G01: 'unknown', G02: 'unknown', G03: 'unknown', G04: 'unknown', G05: 'unknown', G06: 'unknown', G07: 'unknown', G08: 'unknown', G09: 'unknown', G10: 'unknown', G11: 'unknown', G12: 'unknown', G13: 'unknown', G14: 'unknown' }), controlResponses: unknownResponses }), navigation: { currentQuestionId: null, currentScreen: 'question' }, gatewayAnswers: answers() });
expect(unknownSignals.some((signal) => signal.signalId === 'high_unknown_share'), 'unknown responses must remain distinct and produce an uncertainty signal');

const answeredD3 = { 'D3-Q03': { responseState: 'maturity', responseValue: 4 } };
const change = previewGatewayChange({ graph, currentAnswers: answers({ G03: 'internal' }), nextAnswers: answers({ G03: 'outsourced' }), controlResponses: answeredD3 });
expect(change.requiresConfirmation && change.affectedQuestionIds.includes('D3-Q03'), 'gateway change must require confirmation before invalidating downstream answers');
expect(change.after.nodes.find((node) => node.nodeId === 'D3-Q03')?.state === 'redirected', 'gateway change must expose the post-change redirected path');

const complete = resolveAdaptivePath({ graph, gatewayAnswers: answers(), controlResponses: allMaturity(professional) });
const completeSignals = deriveAdaptiveIntegritySignals({ graph, path: complete, navigation: { currentQuestionId: null, currentScreen: 'review' }, gatewayAnswers: answers() });
expect(!completeSignals.some((signal) => signal.blocking), 'a fully answered path must have no blocking integrity signal');

console.log(JSON.stringify({
  ok: true,
  graphVersion: graph.graphVersion,
  fingerprint: graph.graphFingerprint,
  assertions: 22,
  paths: {
    professional: { active: professional.activePathCount, excluded: professional.excludedCount },
    retail: { active: retail.activePathCount, excluded: retail.excludedCount },
    construction: { redirected: construction.redirectedCount },
    online: { redirected: online.redirectedCount },
    small: { active: small.activePathCount },
    unknown: { signals: unknownSignals.map((signal) => signal.signalId) }
  },
  gatewayInvalidation: change.affectedQuestionIds
}));

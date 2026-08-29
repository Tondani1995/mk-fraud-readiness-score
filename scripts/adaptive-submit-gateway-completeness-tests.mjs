#!/usr/bin/env node
/**
 * Provider-free regression for submit completeness and conditional gateways.
 *
 * Submission must validate the already-resolved customer path, so a conditional gateway
 * hidden by an upstream answer is not treated as an unanswered required gateway.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveAdaptiveIntegritySignals, resolveAdaptivePath } from '../src/lib/adaptive/engine.ts';
import { missingAdaptiveGatewayIds, requiredAdaptiveGatewayIds } from '../src/lib/adaptive/server.ts';

const graph = JSON.parse(readFileSync(new URL('../src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json', import.meta.url), 'utf8'));
const serverSource = readFileSync(new URL('../src/lib/adaptive/server.ts', import.meta.url), 'utf8');
const submitSource = serverSource.slice(serverSource.indexOf('export async function submitAdaptiveAssessment'));

assert.match(submitSource, /missingAdaptiveGatewayIds\(current\.path,\s*current\.gatewayAnswers\)/,
  'submission must use the resolved path gateway completeness helper');
assert.doesNotMatch(submitSource, /current\.graph\.gateways\.filter\(/,
  'submission must not enumerate every graph gateway');

const allGatewayAnswers = Object.fromEntries(
  graph.gateways.map((gateway) => [gateway.questionId, gateway.responseOptions[0].value])
);

function completeControls(path) {
  return Object.fromEntries(path.activeNodes
    .filter((node) => node.kind !== 'gateway')
    .map((node) => [node.nodeId, { responseState: 'maturity', responseValue: 0 }]));
}

function blockingSignals(path, gatewayAnswers, controlResponses) {
  return deriveAdaptiveIntegritySignals({
    graph,
    path,
    gatewayAnswers,
    navigation: { currentQuestionId: null, currentScreen: 'review' }
  }).filter((signal) => signal.blocking);
}

// A G03=unknown profile legitimately hides conditional G04. The omitted G04 answer is
// not missing because G04 is absent from the resolved path.
const { G04: _hiddenGatewayAnswer, ...g03UnknownAnswers } = { ...allGatewayAnswers, G03: 'unknown' };
const g03UnknownInitialPath = resolveAdaptivePath({ graph, gatewayAnswers: g03UnknownAnswers });
const g03UnknownPath = resolveAdaptivePath({ graph, gatewayAnswers: g03UnknownAnswers, controlResponses: completeControls(g03UnknownInitialPath) });
const g03UnknownRequired = requiredAdaptiveGatewayIds(g03UnknownPath);
assert.equal(g03UnknownPath.nodes.some((node) => node.nodeId === 'G04'), false, 'G04 must be absent when G03 is unknown');
assert.equal(g03UnknownRequired.includes('G04'), false, 'hidden G04 must not be a required gateway');
assert.deepEqual(missingAdaptiveGatewayIds(g03UnknownPath, g03UnknownAnswers), [], 'G03 unknown must not block complete submission');
const g03UnknownControls = completeControls(g03UnknownPath);
assert.equal(g03UnknownPath.unansweredApplicableCount, 0, 'all applicable controls are complete for G03 unknown');
assert.deepEqual(blockingSignals(g03UnknownPath, g03UnknownAnswers, g03UnknownControls), [], 'complete G03 unknown path must have no blocking submit signal');

// If G03 makes G04 applicable, the resolved path contains G04 and an absent answer blocks.
const { G04: _unansweredGatewayAnswer, ...g03YesBaseAnswers } = allGatewayAnswers;
const g03YesAnswers = { ...g03YesBaseAnswers, G03: 'yes' };
const g03YesPath = resolveAdaptivePath({ graph, gatewayAnswers: g03YesAnswers });
assert.equal(g03YesPath.nodes.some((node) => node.nodeId === 'G04'), true, 'G04 must be present when G03 makes it applicable');
assert.equal(requiredAdaptiveGatewayIds(g03YesPath).includes('G04'), true, 'applicable G04 must be required while unanswered');
assert.deepEqual(missingAdaptiveGatewayIds(g03YesPath, { ...g03YesAnswers, G04: undefined }), ['G04'], 'unanswered applicable G04 must block');

// Once G04 is answered, the same path has no missing gateway requirement.
const g04AnsweredAnswers = { ...g03YesAnswers, G04: graph.gateways.find((gateway) => gateway.questionId === 'G04').responseOptions[0].value };
const g04AnsweredInitialPath = resolveAdaptivePath({ graph, gatewayAnswers: g04AnsweredAnswers });
const g04AnsweredPath = resolveAdaptivePath({ graph, gatewayAnswers: g04AnsweredAnswers, controlResponses: completeControls(g04AnsweredInitialPath) });
assert.deepEqual(missingAdaptiveGatewayIds(g04AnsweredPath, g04AnsweredAnswers), [], 'answered applicable G04 must pass gateway completeness');
const g04Controls = completeControls(g04AnsweredPath);
assert.equal(g04AnsweredPath.unansweredApplicableCount, 0, 'all applicable controls are complete after G04 is answered');
assert.deepEqual(blockingSignals(g04AnsweredPath, g04AnsweredAnswers, g04Controls), [], 'complete applicable-G04 path must have no blocking submit signal');

console.log(JSON.stringify({
  ok: true,
  graphVersion: graph.graphVersion,
  assertions: 13,
  scenarios: {
    g03Unknown: { requiredGatewayCount: g03UnknownRequired.length, g04Present: false, missingGatewayCount: 0, activeControlCount: g03UnknownPath.activePathCount },
    g03YesMissingG04: { g04Present: true, missingGateways: ['G04'] },
    g03YesAnsweredG04: { g04Present: true, missingGatewayCount: 0, activeControlCount: g04AnsweredPath.activePathCount }
  },
  provider: 'none'
}, null, 2));

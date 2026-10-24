import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildAdaptiveVisualReviewState } from '../src/lib/visual-review/fixtures.ts';
import { benchmarkPublicState } from '../src/lib/visual-review/benchmark-service.ts';
import { compactAdaptiveState, mergeAdaptiveState } from '../src/lib/adaptive/state-transfer.ts';
import { deriveAdaptiveAnswerDelta, buildAdaptivePostSaveState } from '../src/lib/adaptive/server.ts';
import { previewGatewayChange } from '../src/lib/adaptive/engine.ts';

for (const variant of ['early', 'mid', 'late', 'review', 'submitted']) {
  const state = buildAdaptiveVisualReviewState(variant);
  const full = benchmarkPublicState(state);
  const compact = compactAdaptiveState(full);
  assert.deepEqual(
    mergeAdaptiveState(full, compact),
    full,
    `${variant}: lossless transfer of every path, prompt, response, count, status and definition`
  );
  assert.deepEqual(
    compact.path.activeNodeIds,
    full.path.activeNodes.map((node) => node.nodeId)
  );
  assert.equal('activeNodes' in compact.path, false);
  assert.equal('responseScale' in compact, false);
  assert.equal('gateways' in compact, false);
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < Buffer.byteLength(JSON.stringify(full)));
  assert.throws(
    () => mergeAdaptiveState({ ...full, graphFingerprint: 'different' }, compact),
    /definition_mismatch/
  );
  const bad = structuredClone(compact);
  bad.path.activeNodeIds.push('not-a-real-node');
  assert.throws(() => mergeAdaptiveState(full, bad), /state_invalid/);
  if (bad.path.activeNodeIds.length > 1) {
    bad.path.activeNodeIds = [bad.path.activeNodeIds[0], bad.path.activeNodeIds[0]];
    assert.throws(() => mergeAdaptiveState(full, bad), /state_invalid/);
  }
}
const original = buildAdaptiveVisualReviewState('mid');
const id = original.path.currentNextNode;
const next = { ...original.controlResponses, [id]: { responseState: 'maturity', responseValue: 0 } };
const delta = deriveAdaptiveAnswerDelta({
  currentGatewayAnswers: original.gatewayAnswers,
  currentControlResponses: original.controlResponses,
  nextGatewayAnswers: original.gatewayAnswers,
  nextControlResponses: next
});
assert.equal(delta.ok, true);
const updated = buildAdaptivePostSaveState({
  current: original,
  saveInput: { currentScreen: 'question', currentQuestionId: id, visitedQuestionIds: [id] },
  delta: delta.delta,
  invalidatedQuestionIds: [],
  saveSequence: 13,
  savedAt: '2026-10-24T12:00:00Z'
});
assert.equal(updated.controlResponses[id].responseValue, 0);
assert.notEqual(updated.path.currentNextNode, id);
assert.equal(updated.navigation.save_sequence, 13);
const publicUpdated = benchmarkPublicState(updated);
assert.deepEqual(
  mergeAdaptiveState(benchmarkPublicState(original), compactAdaptiveState(publicUpdated)),
  publicUpdated
);
const two = { ...next, [updated.path.currentNextNode]: { responseState: 'maturity', responseValue: 5 } };
assert.equal(
  deriveAdaptiveAnswerDelta({
    currentGatewayAnswers: original.gatewayAnswers,
    currentControlResponses: original.controlResponses,
    nextGatewayAnswers: original.gatewayAnswers,
    nextControlResponses: two
  }).ok,
  false,
  'multiple answer deltas remain prohibited'
);
for (const gateway of original.graph.gateways) {
  for (const option of gateway.responseOptions) {
    const changed = { ...original.gatewayAnswers, [gateway.questionId]: option.value };
    const preview = previewGatewayChange({
      graph: original.graph,
      currentAnswers: original.gatewayAnswers,
      nextAnswers: changed,
      controlResponses: original.controlResponses
    });
    if (preview.requiresConfirmation) {
      assert.ok(preview.affectedQuestionIds.length > 0);
      assert.ok(preview.affectedQuestionIds.every((question) => original.controlResponses[question]));
    }
  }
}
const controller = readFileSync('src/components/adaptive/AdaptiveAssessmentExperience.tsx', 'utf8');
assert.match(controller, /const confirmed = mergeAdaptiveState\(state, body.state\)/);
assert.match(controller, /setCurrentId\(confirmed.path\?\.currentNextNode/);
assert.match(controller, /if \(savingRef.current\) return/);
assert.match(controller, /pendingWriteRef.current = write/);
assert.match(controller, /expectedSaveSequence: Number\(state.navigation.save_sequence\)/);
assert.doesNotMatch(
  controller,
  /resolveAdaptivePath|setTimeout\([^)]*setCurrentId/,
  'browser has no divergent branching or timed navigation'
);
assert.match(controller, /beforeunload/);
assert.match(controller, /Continue with saved response/);
assert.match(controller, /Boolean\(pendingWriteRef.current\)/);
const canvas = readFileSync('src/components/adaptive/AdaptiveResponseCanvas.tsx', 'utf8');
assert.match(canvas, /type="radio"/);
assert.match(canvas, /onTransitionEnd/);
assert.match(canvas, /!removed/);
assert.match(canvas, /prefers-reduced-motion/);
assert.match(canvas, /onChoose\(choice.value\)/);
const start = readFileSync('src/components/adaptive/AdaptiveStartForm.tsx', 'utf8');
assert.doesNotMatch(start, /trackEventBeforeNavigation|prefetch\(.*resume/);
assert.match(start, /busyRef.current/);
assert.match(start, /resume.origin !== window.location.origin/);
assert.match(start, /body.data.initialState/);
assert.match(start, /window.history.replaceState/);
const service = readFileSync('src/lib/adaptive/server.ts', 'utf8');
assert.ok(
  service.indexOf('isCurrentLegalAcceptance(input.legalAcceptance)') <
    service.indexOf('initialState: publicState')
);
assert.match(service, /deferEventTracking\(recordProgress\)/);
assert.match(service, /else await recordProgress\(\)/, 'non-route test callers retain awaited tracking');
const route = readFileSync('src/app/score/api/adaptive/[assessmentRef]/state/route.ts', 'utf8');
assert.match(route, /deferEventTracking: after/);
assert.match(route, /request.headers.get\('x-mk-graph-fingerprint'\) === result.state.graphFingerprint/);
const full = benchmarkPublicState(original),
  compact = compactAdaptiveState(full);
console.log(
  JSON.stringify({
    fullLogicalBytes: Buffer.byteLength(JSON.stringify(full)),
    compactLogicalBytes: Buffer.byteLength(JSON.stringify(compact)),
    fullGzipBytes: gzipSync(JSON.stringify(full)).byteLength,
    compactGzipBytes: gzipSync(JSON.stringify(compact)).byteLength
  })
);
console.log(
  'Adaptive experience contracts passed: lossless transfer, authoritative eligibility, zero/unknown handling, delta boundaries, local recovery, native controls, consent and navigation privacy.'
);

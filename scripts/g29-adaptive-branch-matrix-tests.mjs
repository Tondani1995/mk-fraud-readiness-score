import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveAdaptiveIntegritySignals, previewGatewayChange, resolveAdaptivePath, validateAdaptiveGraph } from '../src/lib/adaptive/engine.ts';

const graph = JSON.parse(readFileSync(new URL('../docs/adaptive-assessment/adaptive-graph-v1-draft.json', import.meta.url), 'utf8'));
const base = {
  G01: 'professional_services', G02: 'medium', G03: 'internal', G04: 'internal_department',
  G05: 'none', G06: 'no', G07: 'internal', G08: 'no', G09: 'no', G10: 'no', G11: 'no',
  G12: 'no', G13: 'no', G14: 'formal_delegation'
};

const scenarios = [
  ['professional-services-no-exposure', {}],
  ['retail-physical-sites', { G01: 'retail', G05: 'significant', G06: 'yes', G08: 'yes', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes' }],
  ['construction-outsourced-controls', { G01: 'construction', G03: 'outsourced', G04: 'outsourced', G07: 'outsourced', G05: 'significant', G06: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G14: 'owner_led' }],
  ['digital-platform-without-sites', { G01: 'online', G08: 'platform', G09: 'yes', G11: 'no', G13: 'no' }],
  ['payroll-outsourced', { G07: 'outsourced' }],
  ['payroll-absent-procurement-absent', { G07: 'none', G03: 'none', G04: 'owner_led', G08: 'no', G09: 'no', G13: 'no' }],
  ['shared-service', { G03: 'shared_service', G04: 'shared_service', G07: 'shared_service', G14: 'shared_service' }],
  ['all-unknown', Object.fromEntries(Object.keys(base).map((key) => [key, 'unknown']))]
];

const expectedGraphNodeIds = new Set([
  ...graph.gateways.map((gateway) => gateway.questionId),
  ...graph.questions.map((question) => question.questionId),
  ...graph.oversightVariants.map((variant) => variant.questionId)
]);
const seenOversightVariants = new Set();
const evidence = [];

assert.deepEqual(validateAdaptiveGraph(graph), [], 'adaptive graph must pass structural validation');
assert.equal(graph.graphVersion, 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804');
assert.equal(graph.graphFingerprint, 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab');

for (const [name, overrides] of scenarios) {
  const path = resolveAdaptivePath({ graph, gatewayAnswers: { ...base, ...overrides } });
  const nodeIds = new Set(path.nodes.map((node) => node.nodeId));
  const counts = { active: 0, excluded: 0, redirected: 0, 'profile-only': 0, invalidated: 0 };
  for (const node of path.nodes) counts[node.state] += 1;
  for (const node of path.nodes.filter((node) => node.kind === 'oversight')) seenOversightVariants.add(node.nodeId);
  assert.equal(nodeIds.size, path.nodes.length, `${name}: duplicate resolved node`);
  assert.equal(counts.active + counts.excluded + counts.redirected + counts['profile-only'] + counts.invalidated, path.nodes.length, `${name}: graph accounting does not reconcile`);
  assert.equal(path.profileOnlyNodes.length, counts['profile-only'], `${name}: profile-only count mismatch`);
  assert.ok(path.nodes.every((node) => expectedGraphNodeIds.has(node.nodeId)), `${name}: unreachable/unknown node materialised`);
  evidence.push({ name, nodes: path.nodes.length, counts, activeControls: path.activePathCount, activeWeight: path.activePathWeight, oversight: path.nodes.filter((node) => node.kind === 'oversight').map((node) => node.nodeId) });
}

assert.deepEqual([...seenOversightVariants].sort(), graph.oversightVariants.map((variant) => variant.questionId).sort(), 'every declared oversight variant must be reachable in at least one approved branch');

const before = resolveAdaptivePath({ graph, gatewayAnswers: { ...base, G03: 'internal' }, controlResponses: { 'D3-Q03': { responseState: 'maturity', responseValue: 4 } } });
const change = previewGatewayChange({
  graph,
  currentAnswers: { ...base, G03: 'internal' },
  nextAnswers: { ...base, G03: 'outsourced' },
  controlResponses: { 'D3-Q03': { responseState: 'maturity', responseValue: 4 } }
});
assert.ok(before.nodes.some((node) => node.nodeId === 'D3-Q03' && node.state === 'active'));
assert.equal(change.requiresConfirmation, true);
assert.ok(change.affectedQuestionIds.includes('D3-Q03'));
assert.ok(change.after.nodes.some((node) => node.nodeId === 'OV-D3-Q03' && node.state === 'active'));

const complete = resolveAdaptivePath({ graph, gatewayAnswers: { ...base, ...scenarios[1][1] }, controlResponses: Object.fromEntries(resolveAdaptivePath({ graph, gatewayAnswers: { ...base, ...scenarios[1][1] } }).activeNodes.filter((node) => node.kind !== 'gateway').map((node) => [node.nodeId, { responseState: 'maturity', responseValue: 5 }])) });
const signals = deriveAdaptiveIntegritySignals({ graph, path: complete, gatewayAnswers: { ...base, ...scenarios[1][1] }, navigation: { currentQuestionId: null, currentScreen: 'review' } });
assert.equal(signals.some((signal) => signal.blocking), false, 'complete high-control branch must not produce a blocking signal');

console.log(JSON.stringify({
  ok: true,
  graphVersion: graph.graphVersion,
  graphFingerprint: graph.graphFingerprint,
  scenarioCount: scenarios.length,
  oversightVariants: [...seenOversightVariants].sort(),
  gatewayChange: { requiresConfirmation: change.requiresConfirmation, affectedQuestionIds: change.affectedQuestionIds },
  scenarios: evidence
}));

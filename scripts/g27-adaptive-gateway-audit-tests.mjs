import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAdaptivePath } from '../src/lib/adaptive/engine.ts';

const graph = JSON.parse(readFileSync(new URL('../docs/adaptive-assessment/adaptive-graph-v1-draft.json', import.meta.url), 'utf8'));
const base = { G01: 'retail', G02: 'medium', G03: 'internal', G04: 'internal_department', G05: 'significant', G06: 'yes', G07: 'internal', G08: 'yes', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'formal_delegation' };
const audit = {};
for (const gatewayId of ['G01', 'G07', 'G11', 'G14']) {
  const gateway = graph.gateways.find((item) => item.questionId === gatewayId);
  assert.ok(gateway, `${gatewayId} exists in the real graph`);
  audit[gatewayId] = [];
  for (const option of gateway.responseOptions) {
    const answers = { ...base, [gatewayId]: option.value };
    const path = resolveAdaptivePath({ graph, gatewayAnswers: answers, controlResponses: {} });
    assert.ok(path.nodes.length > 0, `${gatewayId}:${option.value} reaches a real graph path`);
    assert.equal(new Set(path.nodes.map((node) => node.nodeId)).size, path.nodes.length, `${gatewayId}:${option.value} has no duplicate path nodes`);
    audit[gatewayId].push({ option: option.value, active: path.activePathCount, excluded: path.excludedCount, redirected: path.redirectedCount });
  }
}
const sharedService = resolveAdaptivePath({ graph, gatewayAnswers: { ...base, G07: 'shared_service', G14: 'shared_service' }, controlResponses: {} });
assert.ok(sharedService.nodes.some((node) => node.state === 'redirected' || node.state === 'active'), 'shared-service response reaches an auditable path');
console.log(JSON.stringify({ ok: true, gateways: audit, sharedService: { active: sharedService.activePathCount, redirected: sharedService.redirectedCount } }));

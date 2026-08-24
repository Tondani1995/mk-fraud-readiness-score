import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FROZEN_ADAPTIVE_GRAPH_FINGERPRINT,
  FROZEN_ADAPTIVE_GRAPH_VERSION,
  PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT,
  PREVIEW_ADAPTIVE_GRAPH_VERSION,
  resolveAdaptivePath,
  validateAdaptiveGraph
} from '../src/lib/adaptive/engine.ts';

const root = resolve(new URL('..', import.meta.url).pathname);
const v11 = JSON.parse(readFileSync(resolve(root, 'docs/adaptive-assessment/adaptive-graph-v1-draft.json'), 'utf8'));
const v12 = JSON.parse(readFileSync(resolve(root, 'docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json'), 'utf8'));

assert.deepEqual(validateAdaptiveGraph(v11, FROZEN_ADAPTIVE_GRAPH_FINGERPRINT), []);
assert.deepEqual(validateAdaptiveGraph(v12, PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT), []);
assert.equal(v11.graphVersion, FROZEN_ADAPTIVE_GRAPH_VERSION);
assert.equal(v12.graphVersion, PREVIEW_ADAPTIVE_GRAPH_VERSION);

function v12Answers(overrides = {}) {
  return {
    G01: 'technology_digital_platform', G02: 'employees_50_249', G03: 'yes', G04: 'organisation',
    G05: 'dedicated_internal', G06: 'yes', G07: 'yes', G08: 'organisation', G09: 'own', G10: 'yes',
    G11: 'yes', G12: 'yes', G13: 'yes', G14: 'yes', G15: 'yes', G16: 'two_or_more', G17: 'yes', ...overrides
  };
}

const noSupplier = resolveAdaptivePath({ graph: v12, gatewayAnswers: v12Answers({ G03: 'no' }) });
assert.equal(noSupplier.nodes.filter((node) => node.kind === 'gateway').length, 16);
assert.equal(noSupplier.nodes.some((node) => node.nodeId === 'G04'), false);
assert.equal(noSupplier.nodes.find((node) => node.nodeId === 'D3-Q03')?.state, 'excluded');

const supplier = resolveAdaptivePath({ graph: v12, gatewayAnswers: v12Answers({ G04: 'external_provider' }) });
assert.equal(supplier.nodes.filter((node) => node.kind === 'gateway').length, 17);
assert.equal(supplier.nodes.find((node) => node.nodeId === 'G04')?.state, 'profile-only');
assert.equal(supplier.nodes.find((node) => node.nodeId === 'D3-Q03')?.state, 'redirected');
assert.equal(supplier.nodes.find((node) => node.nodeId === 'OV-D3-Q03')?.state, 'active');

const providerPayment = resolveAdaptivePath({ graph: v12, gatewayAnswers: v12Answers({ G09: 'provider', G10: 'yes', G15: 'no' }) });
assert.equal(providerPayment.nodes.find((node) => node.nodeId === 'D8-Q02')?.state, 'active');
assert.equal(providerPayment.nodes.some((node) => node.nodeId === 'OV-D8-Q02'), false);

const providerOnly = resolveAdaptivePath({ graph: v12, gatewayAnswers: v12Answers({ G09: 'provider', G10: 'no', G15: 'no' }) });
assert.equal(providerOnly.nodes.find((node) => node.nodeId === 'D8-Q02')?.state, 'redirected');
assert.equal(providerOnly.nodes.find((node) => node.nodeId === 'OV-D8-Q02')?.state, 'active');

const remoteProvider = resolveAdaptivePath({ graph: v12, gatewayAnswers: v12Answers({ G09: 'provider', G10: 'no', G15: 'yes' }) });
assert.equal(remoteProvider.nodes.find((node) => node.nodeId === 'D8-Q02')?.state, 'active');
assert.equal(remoteProvider.nodes.some((node) => node.nodeId === 'OV-D8-Q02'), false);

console.log(JSON.stringify({
  ok: true,
  suite: 'adaptive-v1-2-runtime',
  assertions: 15,
  v11: { version: v11.graphVersion, fingerprint: v11.graphFingerprint, gateways: v11.gateways.length },
  v12: { version: v12.graphVersion, fingerprint: v12.graphFingerprint, gateways: v12.gateways.length, questions: v12.questions.length, variants: v12.oversightVariants.length },
  conditionalGateway: { withoutSupplier: noSupplier.nodes.filter((node) => node.kind === 'gateway').length, withSupplier: supplier.nodes.filter((node) => node.kind === 'gateway').length },
  providerDigitalMonitoring: { payment: 'base', providerOnly: 'third_party_oversight', remote: 'base' }
}));

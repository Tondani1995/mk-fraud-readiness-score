import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function load(relativePath, stubs = {}) {
  const absolutePath = path.resolve(relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  const requireShim = (specifier) => {
    if (stubs[specifier]) return stubs[specifier];
    if (specifier.startsWith('.')) return load(path.resolve(path.dirname(absolutePath), specifier), stubs);
    throw new Error(`Unexpected dependency ${specifier}`);
  };
  new Function('require', 'module', 'exports', compiled)(requireShim, module, module.exports);
  return module.exports;
}

const types = load('src/lib/reports/automation/types.ts');
const identity = load('src/lib/reports/automation/ai-gateway-identity.ts', { './types': types });
const classification = load('src/lib/reports/automation/ai-failure-classification.ts', {
  ai: { APICallError: { isInstance: () => false } },
  './ai-gateway-identity': identity
});

const requestedProvider = 'openai';
const requestedModel = 'openai/gpt-5.5';
const valid = {
  gateway: {
    generationId: 'gen_v3_001',
    cost: '0.012345',
    routing: {
      originalModelId: requestedModel,
      canonicalSlug: requestedModel,
      resolvedProvider: 'openai',
      finalProvider: 'openai',
      resolvedProviderApiModelId: 'gpt-5.5'
    }
  }
};

const parsed = identity.parseAiGatewayExecutionIdentity({
  requestedProvider,
  requestedModel,
  providerMetadata: valid,
  response: { modelId: 'openai/gpt-5.5' }
});
assert.equal(parsed.identity.generationId, 'gen_v3_001');
assert.equal(parsed.identity.resolvedProviderApiModelId, 'gpt-5.5');
assert.equal(parsed.identity.identitySource, 'gateway.routing');
assert.equal(parsed.gatewayCostMicros, 12345);
assert.equal(classification.classifyAiProviderFailure(new identity.AiGatewayIdentityVerificationError('fixture')), 'provider_declared');
assert.equal(classification.aiAttemptStatusForFailureClass('provider_declared'), 'provider_result_uncertain');

const cases = [
  ['routing missing', (m) => ({ ...m, gateway: { generationId: 'g', routing: null } })],
  ['generation id missing', (m) => ({ ...m, gateway: { ...m.gateway, generationId: '' } })],
  ['provider missing', (m) => ({ ...m, gateway: { ...m.gateway, routing: { ...m.gateway.routing, finalProvider: '', resolvedProvider: '' } } })],
  ['non-openai provider', (m) => ({ ...m, gateway: { ...m.gateway, routing: { ...m.gateway.routing, finalProvider: 'anthropic' } } })],
  ['provider disagreement', (m) => ({ ...m, gateway: { ...m.gateway, routing: { ...m.gateway.routing, finalProvider: 'openai', resolvedProvider: 'azure' } } })],
  ['resolved api model missing', (m) => ({ ...m, gateway: { ...m.gateway, routing: { ...m.gateway.routing, resolvedProviderApiModelId: '' } } })],
  ['original model rewrite', (m) => ({ ...m, gateway: { ...m.gateway, routing: { ...m.gateway.routing, originalModelId: 'openai/gpt-4.1' } } })],
  ['canonical model rewrite', (m) => ({ ...m, gateway: { ...m.gateway, routing: { ...m.gateway.routing, canonicalSlug: 'openai/gpt-4.1' } } })],
  ['no model proof', (m) => ({ ...m, gateway: { ...m.gateway, routing: { ...m.gateway.routing, originalModelId: '', canonicalSlug: '' } } })],
  ['sdk contradiction', (m) => ({ metadata: m, response: { modelId: 'anthropic/claude' } })]
];

for (const [name, mutate] of cases) {
  const changed = mutate(valid);
  const providerMetadata = changed.metadata ?? changed;
  const response = changed.response ?? { modelId: 'openai/gpt-5.5' };
  assert.throws(
    () => identity.parseAiGatewayExecutionIdentity({ requestedProvider, requestedModel, providerMetadata, response }),
    (error) => error instanceof identity.AiGatewayIdentityVerificationError,
    name
  );
}

for (const cost of [undefined, '', 'not-a-number', -1]) {
  const metadata = { ...valid, gateway: { ...valid.gateway, cost } };
  const result = identity.parseAiGatewayExecutionIdentity({ requestedProvider, requestedModel, providerMetadata: metadata, response: { modelId: requestedModel } });
  assert.equal(result.gatewayCostMicros, undefined, `invalid cost should remain accounting-unverified: ${String(cost)}`);
}

console.log(JSON.stringify({
  ok: true,
  positive: 'Gateway routing identity, provenance, provider-declared classification and decimal-string cost passed',
  negativeCases: cases.length + 4,
  historicalV2: 'not referenced or mutated'
}));

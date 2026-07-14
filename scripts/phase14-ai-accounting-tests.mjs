import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/reports/automation/durable-ai-attempts.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)((specifier) => {
  if (specifier === 'node:crypto') return { __esModule: true, default: crypto };
  if (specifier === '@/lib/supabase/server') return { createSupabaseServiceClient() { throw new Error('test must inject db'); } };
  if (specifier === '../phase14-security') return { requirePhase14Action() { throw new Error('test must inject authorization'); } };
  if (specifier === './ai-sdk-generator') return {
    PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS: 3500,
    PREMIUM_REPORT_AI_TIMEOUT_MS: 45_000
  };
  if (specifier === './types') return {};
  throw new Error(`Unexpected dependency: ${specifier}`);
}, module, module.exports);

const { createDurablePremiumReportNarrativeGenerator } = module.exports;

function databaseDouble(existing = null) {
  const calls = [];
  return {
    calls,
    db: {
      from(table) {
        const state = { operation: 'lookup', selected: false };
        const builder = {
          select() { state.selected = true; return builder; },
          eq(column, value) { calls.push(['eq', table, column, value]); return builder; },
          order() { return builder; },
          limit() { return builder; },
          async maybeSingle() {
            if (state.operation === 'update') return { data: { id: 'attempt-1' }, error: null };
            return { data: existing, error: null };
          },
          insert(value) { state.operation = 'insert'; calls.push(['insert', table, value]); return builder; },
          async single() { return { data: { id: 'attempt-1' }, error: null }; },
          update(value) { state.operation = 'update'; calls.push(['update', table, value]); return builder; },
          then(resolve) { resolve({ data: null, error: null }); }
        };
        return builder;
      }
    }
  };
}

const generationInput = {
  evidenceChecksum: 'a'.repeat(64),
  promptVersion: 'mk-premium-report-v2-evidence-plan',
  schemaVersion: 'mk-premium-ai-evidence-plan-v2',
  evidence: { items: [] }
};

function generator(overrides = {}) {
  let calls = 0;
  const result = {
    output: { executiveEvidenceRefs: [] },
    provider: overrides.provider ?? 'openai',
    model: overrides.model ?? 'gpt-test',
    latencyMs: 1,
    usage: overrides.usage
  };
  return {
    get calls() { return calls; },
    provider: result.provider,
    model: result.model,
    async generate() { calls += 1; return result; },
    async repair() { calls += 1; return result; }
  };
}

{
  const persistedOutput = {
    output: { executiveEvidenceRefs: ['score:overall'] },
    provider: 'openai', model: 'gpt-test', latencyMs: 1,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostMicros: 100 }
  };
  const database = databaseDouble({
    id: 'existing', status: 'succeeded', output_json: persistedOutput,
    attempt_number: 1, accounting_status: 'verified'
  });
  const provider = generator();
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-1',
    db: database.db,
    authorizeAction: async () => true
  });
  assert.deepEqual(await durable.generate(generationInput), persistedOutput);
  assert.equal(provider.calls, 0, 'verified exact-match result must be reused without a provider call');
  const fingerprintFields = Object.fromEntries(database.calls
    .filter(([name, table]) => name === 'eq' && table === 'report_ai_attempts')
    .map(([, , column, value]) => [column, value]));
  assert.deepEqual(fingerprintFields, {
    generation_identity: 'generation-1',
    evidence_checksum: generationInput.evidenceChecksum,
    provider: 'openai',
    model: 'gpt-test',
    prompt_version: generationInput.promptVersion,
    schema_version: generationInput.schemaVersion,
    attempt_kind: 'generate'
  });
}

{
  const database = databaseDouble(null);
  const provider = generator();
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-missing-accounting',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate(generationInput), /accounting metadata is unverified/);
  assert.equal(provider.calls, 1);
  const accounting = database.calls.find(([name, table, value]) =>
    name === 'update' && table === 'report_ai_attempts' && value.status === 'accounting_unverified');
  assert(accounting, 'missing usage/cost must persist accounting_unverified, never numeric zero');
  assert.equal(accounting[2].estimated_cost_micros, null);
}

{
  const database = databaseDouble(null);
  const provider = generator({
    provider: 'different-provider',
    model: 'different-model',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostMicros: 100 }
  });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-2',
    db: database.db,
    authorizeAction: async () => true
  });
  await durable.generate(generationInput);
  assert.equal(provider.calls, 1, 'different provider/model identity must create a new attempt');
  const inserted = database.calls.find(([name]) => name === 'insert')[2];
  assert.equal(inserted.provider, 'different-provider');
  assert.equal(inserted.model, 'different-model');
}

{
  const database = databaseDouble(null);
  const provider = generator({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostMicros: 1 } });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-oversized',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate({ ...generationInput, evidence: { value: 'x'.repeat(200_000) } }), /byte limit/);
  assert.equal(provider.calls, 0, 'pre-dispatch size ceiling must block before provider invocation');
  assert.equal(database.calls.length, 0, 'pre-dispatch size ceiling must block before attempt lookup or insertion');
}

console.log('phase14_ai_accounting_tests_passed');

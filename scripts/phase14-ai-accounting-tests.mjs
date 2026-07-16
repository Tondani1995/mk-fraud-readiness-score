import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);

const source = fs.readFileSync('src/lib/reports/automation/durable-ai-attempts.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;
const module = { exports: {} };
let activeDb = null;
new Function('require', 'module', 'exports', compiled)((specifier) => {
  if (specifier === 'node:crypto') return { __esModule: true, default: crypto };
  if (specifier === '@/lib/supabase/server') return { createSupabaseServiceClient() { throw new Error('test must inject db'); } };
  if (specifier === '../phase14-security') return {
    requirePhase14Action() { throw new Error('test must inject authorization'); },
    async loadPhase14WorkerLease(capabilityId) { return { capabilityId, expectedStep: 'ai_attempt_claim' }; },
    async executePhase14WorkerStep(_lease, action, payload) {
      if (!activeDb) throw new Error('AI test database was not installed.');
      const args = action === 'claim_phase14_ai_attempt'
        ? { p_attempt: payload.attempt }
        : { p_attempt_id: payload.attempt_id, p_result: payload.result };
      const { data, error } = await activeDb.rpc(action, args);
      if (error) throw error;
      return data;
    }
  };
  if (specifier === './ai-sdk-generator') return {
    PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS: 3500,
    PREMIUM_REPORT_AI_TIMEOUT_MS: 45_000
  };
  // M1: load the REAL classification module (not a fake), transpiled the same way as
  // the module under test, so this suite exercises the actual AI-SDK-error-class
  // matching logic rather than a stand-in. Its own dependency ('ai', a real installed
  // package) is resolved via Node's normal require -- only the durable-ai-attempts.ts
  // module under test needs its dependencies faked.
  if (specifier === './ai-failure-classification') {
    const classificationSource = fs.readFileSync('src/lib/reports/automation/ai-failure-classification.ts', 'utf8');
    const classificationCompiled = ts.transpileModule(classificationSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    const classificationModule = { exports: {} };
    new Function('require', 'module', 'exports', classificationCompiled)(
      (nested) => { if (nested === 'ai') return nodeRequire('ai'); throw new Error(`Unexpected classification dependency: ${nested}`); },
      classificationModule, classificationModule.exports
    );
    return classificationModule.exports;
  }
  if (specifier === './types') return {};
  throw new Error(`Unexpected dependency: ${specifier}`);
}, module, module.exports);

const { createDurablePremiumReportNarrativeGenerator } = module.exports;

function databaseDouble(existing = null, totalPriorAttempts = 0) {
  const calls = [];
  const result = {
    calls,
    db: {
      async rpc(name, value) {
        calls.push(['rpc', name, value]);
        if (name === 'claim_phase14_ai_attempt') return { data: { id: 'attempt-1' }, error: null };
        return { data: { id: 'attempt-1' }, error: null };
      },
      from(table) {
        const state = { operation: 'lookup', selected: false, isCountQuery: false };
        const builder = {
          select(_columns, options) {
            state.selected = true;
            // M2/M3: distinguishes the cross-kind budget count query (head:true, no
            // order/limit/maybeSingle in its chain) from the same-kind existing-attempt lookup
            // (which always terminates via .maybeSingle()) -- mirrors how the real Supabase
            // client differentiates a `{ count: 'exact', head: true }` request.
            if (options && options.head) state.isCountQuery = true;
            return builder;
          },
          eq(column, value) { calls.push(['eq', table, column, value]); return builder; },
          neq(column, value) { calls.push(['neq', table, column, value]); return builder; },
          order() { return builder; },
          limit() { return builder; },
          async maybeSingle() {
            if (state.operation === 'update') return { data: { id: 'attempt-1' }, error: null };
            return { data: existing, error: null };
          },
          insert(value) { state.operation = 'insert'; calls.push(['insert', table, value]); return builder; },
          async single() { return { data: { id: 'attempt-1' }, error: null }; },
          update(value) { state.operation = 'update'; calls.push(['update', table, value]); return builder; },
          then(resolve) {
            resolve(state.isCountQuery
              ? { data: null, error: null, count: totalPriorAttempts }
              : { data: null, error: null });
          }
        };
        return builder;
      }
    }
  };
  activeDb = result.db;
  return result;
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
    provider: overrides.requestedProvider ?? result.provider,
    model: overrides.requestedModel ?? result.model,
    async generate() { calls += 1; if (overrides.throws) throw overrides.throws; return result; },
    async repair() { calls += 1; if (overrides.throws) throw overrides.throws; return result; }
  };
}

{
  const database = databaseDouble(null);
  const provider = generator({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostMicros: 1 } });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-policy-disabled',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => { throw new Error('phase14_policy_disabled:ai_narrative'); }
  });
  await assert.rejects(durable.generate(generationInput), /phase14_policy_disabled:ai_narrative/);
  assert.equal(provider.calls, 0, 'AI policy revocation must fail before provider invocation');
  assert.equal(database.calls.length, 0, 'AI policy revocation must fail before durable attempt lookup');
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
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
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
    requested_provider: 'openai',
    requested_model: 'gpt-test',
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
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate(generationInput), /accounting metadata is unverified/);
  assert.equal(provider.calls, 1);
  const accounting = database.calls.find(([name, rpc, value]) =>
    name === 'rpc' && rpc === 'settle_phase14_ai_attempt' && value.p_result.status === 'accounting_unverified');
  assert(accounting, 'missing usage/cost must persist accounting_unverified, never numeric zero');
  assert.equal(accounting[2].p_result.estimated_cost_micros, null);
}

{
  const database = databaseDouble(null);
  const provider = generator({
    requestedProvider: 'vercel-ai-gateway',
    requestedModel: 'gateway/production-alias',
    provider: 'different-provider',
    model: 'different-model',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostMicros: 100 }
  });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-2',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await durable.generate(generationInput);
  assert.equal(provider.calls, 1, 'different provider/model identity must create a new attempt');
  const inserted = database.calls.find(([name, rpc]) => name === 'rpc' && rpc === 'claim_phase14_ai_attempt')[2].p_attempt;
  assert.equal(inserted.requested_provider, 'vercel-ai-gateway');
  assert.equal(inserted.requested_model, 'gateway/production-alias');
  const succeeded = database.calls.find(([name, rpc, value]) =>
    name === 'rpc' && rpc === 'settle_phase14_ai_attempt' && value.p_result.status === 'succeeded');
  assert.equal(succeeded[2].p_result.resolved_provider, 'different-provider');
  assert.equal(succeeded[2].p_result.resolved_model, 'different-model');
}

{
  const database = databaseDouble(null);
  const provider = generator({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostMicros: 1 } });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-oversized',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate({ ...generationInput, evidence: { value: 'x'.repeat(200_000) } }), /byte limit/);
  assert.equal(provider.calls, 0, 'pre-dispatch size ceiling must block before provider invocation');
  assert.equal(database.calls.length, 0, 'pre-dispatch size ceiling must block before attempt lookup or insertion');
}

// M2/M3: the attempt budget is a COMBINED generate+repair total, not counted separately per kind.
// This is a same-kind ('generate') lookup returning null (no prior 'generate' attempt) -- the old
// hard-coded `kind === 'repair' ? 1 : 0` logic would have let this straight through regardless of
// how many attempts of OTHER kinds already existed. The authoritative cross-kind count (2 here)
// must still block it.
{
  const database = databaseDouble(null, 2);
  const provider = generator({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostMicros: 1 } });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-cross-kind-budget-exhausted',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate(generationInput), /maximum attempt limit reached/);
  assert.equal(provider.calls, 0, 'the combined budget must block before any provider call, regardless of kind');
}

// One prior attempt of any kind (here simulating "one prior generate, now attempting repair") is
// within the combined budget of 2 and must be allowed through to the provider call.
{
  const database = databaseDouble(null, 1);
  const provider = generator({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostMicros: 1 } });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-cross-kind-budget-ok',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await durable.repair(generationInput);
  assert.equal(provider.calls, 1, 'the second of two combined attempts must be allowed through');
}

// M1: AI retry classification. A failure the AI SDK raises before any HTTP request is
// dispatched (here, an invalid argument to generateText) must be persisted as
// `failed_before_provider`, not the generic `provider_result_uncertain` every failure
// used to receive regardless of when it happened.
{
  const { InvalidArgumentError } = nodeRequire('ai');
  const database = databaseDouble(null);
  const provider = generator({
    throws: new InvalidArgumentError({ argument: 'model', message: 'Unknown model id.' })
  });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-pre-dispatch-failure',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate(generationInput), /Unknown model id/);
  const settled = database.calls.find(([name, rpc]) => name === 'rpc' && rpc === 'settle_phase14_ai_attempt');
  assert(settled, 'a settle call must persist the classified outcome');
  assert.equal(settled[2].p_result.status, 'failed_before_provider',
    'an AI SDK error proven to precede dispatch must not block automatic retry the way an ambiguous outcome does');
  assert.match(settled[2].p_result.error_message, /^\[pre_dispatch\]/);
}

// A generic/unrecognised error (simulating a network-level failure or our own request
// timeout, where the request may or may not have reached the provider) must remain the
// safe, blocking default -- `provider_result_uncertain` -- exactly as before this
// classifier existed. An error is only ever classified as pre_dispatch by explicit,
// positive identification; every unrecognised error fails toward the more conservative
// outcome.
{
  const database = databaseDouble(null);
  const provider = generator({ throws: new Error('fetch failed') });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-ambiguous-failure',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate(generationInput), /fetch failed/);
  const settled = database.calls.find(([name, rpc]) => name === 'rpc' && rpc === 'settle_phase14_ai_attempt');
  assert.equal(settled[2].p_result.status, 'provider_result_uncertain',
    'an unrecognised error must default to the safe, blocking classification, never to pre_dispatch');
  assert.match(settled[2].p_result.error_message, /^\[ambiguous\]/);
}

// A non-retryable APICallError with a concrete status code means the provider actually
// responded and explicitly rejected the request (e.g. an auth failure or content-policy
// rejection). This is "provider-declared", not ambiguous -- but it must still block
// automatic retry (retrying would almost certainly reach the provider again for the
// same rejection), so it persists to the same blocking status, tagged distinctly in the
// error message for operator diagnosis.
{
  const { APICallError } = nodeRequire('ai');
  const database = databaseDouble(null);
  const provider = generator({
    throws: new APICallError({
      message: 'The model rejected this request.', url: 'https://gateway.example/v1/generate',
      requestBodyValues: {}, statusCode: 400, isRetryable: false
    })
  });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-provider-declared-failure',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate(generationInput), /rejected this request/);
  const settled = database.calls.find(([name, rpc]) => name === 'rpc' && rpc === 'settle_phase14_ai_attempt');
  assert.equal(settled[2].p_result.status, 'provider_result_uncertain',
    'a provider-declared terminal rejection must not auto-retry, exactly like an ambiguous outcome');
  assert.match(settled[2].p_result.error_message, /^\[provider_declared\]/);
}

// A *retryable* APICallError (rate limit, 5xx, or a transport failure with no status
// code -- i.e. we cannot tell whether the provider ever received the request) cannot be
// distinguished from a lost-response scenario and must fall through to the ambiguous
// default, never to pre_dispatch.
{
  const { APICallError } = nodeRequire('ai');
  const database = databaseDouble(null);
  const provider = generator({
    throws: new APICallError({
      message: 'Upstream timed out.', url: 'https://gateway.example/v1/generate',
      requestBodyValues: {}, isRetryable: true
    })
  });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-retryable-transport-failure',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await assert.rejects(durable.generate(generationInput), /Upstream timed out/);
  const settled = database.calls.find(([name, rpc]) => name === 'rpc' && rpc === 'settle_phase14_ai_attempt');
  assert.equal(settled[2].p_result.status, 'provider_result_uncertain');
  assert.match(settled[2].p_result.error_message, /^\[ambiguous\]/);
}

// M1: the cross-kind budget count query must explicitly exclude failed_before_provider
// attempts (a `failed_before_provider` attempt made zero real provider calls, so it
// must not consume the same combined generate+repair budget as one that did) -- proven
// here by asserting the query builder actually received a
// .neq('status', 'failed_before_provider') call, matching the SQL-side exclusion added
// to public.claim_phase14_ai_attempt in migration 0028.
{
  const database = databaseDouble(null, 0);
  const provider = generator({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostMicros: 1 } });
  const durable = createDurablePremiumReportNarrativeGenerator({
    generator: provider,
    generationIdentity: 'generation-budget-exclusion-wiring',
    fulfilmentId: 'fulfilment-1', workerCapabilityId: 'capability-1',
    db: database.db,
    authorizeAction: async () => true
  });
  await durable.generate(generationInput);
  const excluded = database.calls.find(([name, table, column, value]) =>
    name === 'neq' && table === 'report_ai_attempts' && column === 'status' && value === 'failed_before_provider');
  assert(excluded, 'the combined-budget count query must exclude failed_before_provider attempts');
}

console.log('phase14_ai_accounting_tests_passed');

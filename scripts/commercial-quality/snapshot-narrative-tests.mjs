#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCachedSnapshotNarrative,
  buildDeterministicSnapshotNarrative,
  buildSnapshotNarrative,
  buildSnapshotNarrativeInput,
  SNAPSHOT_NARRATIVE_MAX_WORDS,
  snapshotNarrativeContentSchema,
  validateSnapshotNarrative
} from '../../src/lib/snapshot/narrative.ts';
import { selectSnapshotModel } from '../../src/lib/reports/ai-model-policy.ts';
import { buildCommercialSnapshotInsights } from '../../src/lib/snapshot/commercial-insights.ts';

const snapshot = {
  assessmentId: 'assessment-snapshot',
  assessmentReference: 'TEST-SNAPSHOT',
  organisationName: 'Example Health Logistics (Pty) Ltd',
  respondentName: null,
  respondentEmail: null,
  scoreRunId: 'score-run',
  methodologyVersionId: 'methodology-v1-2',
  runNumber: 1,
  overallScore: 35.55,
  calculatedMaturity: 'Reactive',
  finalMaturity: 'Reactive',
  exposureScore: 60,
  exposureBand: 'High',
  coveragePct: 100,
  nARatePct: 0,
  criticalGapCount: 2,
  majorGapCount: 4,
  capApplied: false,
  capReason: null,
  scoredAt: null,
  domains: [
    { domainId: 'd1', domainCode: 'D1', domainName: 'Fraud Leadership and Governance', weightPct: 10, rawScore: 20, weightedContribution: 2, coveragePct: 100, criticalGapCount: 1 },
    { domainId: 'd2', domainCode: 'D2', domainName: 'Fraud Risk Identification', weightPct: 10, rawScore: 25, weightedContribution: 2.5, coveragePct: 100, criticalGapCount: 0 }
  ]
};
const insights = buildCommercialSnapshotInsights(snapshot);
const input = buildSnapshotNarrativeInput(snapshot, insights);

test('Snapshot narrative input is bounded to approved deterministic facts', () => {
  assert.deepEqual(Object.keys(input).sort(), [
    'assuranceBoundary', 'attentionAreas', 'coveragePct', 'criticalGapCount', 'maturity', 'majorGapCount',
    'nARatePct', 'nextStepDirection', 'organisationName', 'overallScore', 'resultStatus', 'strongestAreas'
  ].sort());
  assert.equal(JSON.stringify(input).includes('D1'), false);
  assert.equal(JSON.stringify(input).includes('roadmap'), false);
});

test('Snapshot narrative uses the strict five-field customer contract', () => {
  const fallback = buildDeterministicSnapshotNarrative({ snapshot, insights, fallbackReason: 'test-only' });
  assert.deepEqual(Object.keys(snapshotNarrativeContentSchema.parse({
    headline: fallback.headline,
    executiveDiagnosis: fallback.executiveDiagnosis,
    strength: fallback.strength,
    prioritySignals: fallback.prioritySignals,
    managementImplication: fallback.managementImplication
  })).sort(), [
    'executiveDiagnosis', 'headline', 'managementImplication', 'prioritySignals', 'strength'
  ].sort());
  assert.equal(fallback.prioritySignals.length, 2);
  assert.equal(fallback.mode, 'deterministic');
  assert.equal(fallback.aiCallCount, 0);
  assert.doesNotMatch(JSON.stringify(fallback), /personalised interpretation unavailable/i);
  assert.equal(snapshot.overallScore, 35.55);
  assert.equal(snapshot.finalMaturity, 'Reactive');
});

test('Snapshot AI preflight accepts Vercel OIDC and uses the explicit Gateway auth path', async () => {
  const previous = {
    apiKey: process.env.AI_GATEWAY_API_KEY,
    vercelApiKey: process.env.VERCEL_AI_GATEWAY_API_KEY,
    oidc: process.env.VERCEL_OIDC_TOKEN,
    fetch: globalThis.fetch
  };
  try {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    const unavailable = await buildSnapshotNarrative({ snapshot, insights });
    assert.equal(unavailable.mode, 'deterministic');
    assert.equal(unavailable.aiCallCount, 0);
    assert.equal(unavailable.fallbackReason, 'snapshot_ai_unavailable');

    process.env.VERCEL_OIDC_TOKEN = 'test-only-oidc-token';
    let requestHeaders;
    globalThis.fetch = async (_url, init) => {
      requestHeaders = new Headers(init?.headers);
      throw new Error('TEST_PROVIDER_MOCK');
    };
    const oidcPath = await buildSnapshotNarrative({ snapshot, insights });
    assert.equal(oidcPath.mode, 'deterministic');
    assert.equal(oidcPath.aiCallCount, 1);
    assert.deepEqual(oidcPath.attemptedModels, ['openai/gpt-5-mini']);
    assert.equal(oidcPath.fallbackReason, 'gateway_provider_unavailable');
    assert.equal(requestHeaders.get('ai-gateway-auth-method'), 'oidc');
    assert.equal(requestHeaders.get('authorization'), 'Bearer test-only-oidc-token');
  } finally {
    if (previous.apiKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previous.apiKey;
    if (previous.vercelApiKey === undefined) delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    else process.env.VERCEL_AI_GATEWAY_API_KEY = previous.vercelApiKey;
    if (previous.oidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previous.oidc;
    globalThis.fetch = previous.fetch;
  }
});

test('Snapshot validation rejects invented numbers and paid-tier leakage', () => {
  const issues = validateSnapshotNarrative({
    headline: 'Example Health Logistics has a clear position.',
    executiveDiagnosis: 'The score is 99 and the result includes a detailed roadmap.',
    strength: 'The strongest area is recorded in the Snapshot.',
    prioritySignals: ['Leadership attention is needed.', 'A second signal needs review.'],
    managementImplication: 'Use the detailed report blueprint.'
  }, input);
  assert.ok(issues.includes('invented_number'));
  assert.ok(issues.includes('paid_tier_detail_leakage'));
});

test('Snapshot validation rejects malformed field counts and assurance language', () => {
  const malformed = validateSnapshotNarrative({
    headline: 'Example Health Logistics has a recorded position.',
    executiveDiagnosis: 'The result needs attention.',
    strength: 'A useful foundation is visible.',
    prioritySignals: ['One signal.', 'Two signals.', 'Three signals.'],
    managementImplication: 'Leadership should assign ownership.'
  }, input);
  assert.deepEqual(malformed, ['snapshot_narrative_schema_invalid']);

  const assurance = validateSnapshotNarrative({
    headline: 'Example Health Logistics has a recorded position.',
    executiveDiagnosis: 'The result needs attention.',
    strength: 'The assessment independently verified the controls and their effectiveness.',
    prioritySignals: ['One signal.', 'Two signals.'],
    managementImplication: 'Leadership should assign ownership.'
  }, input);
  assert.ok(assurance.includes('assurance_claim'));
});

test('Snapshot validation accepts a concise grounded five-field narrative', () => {
  const value = {
    headline: 'Example Health Logistics has a reactive position.',
    executiveDiagnosis: 'The recorded result points to a reactive position. The strongest areas offer a base for focused improvement.',
    strength: 'Fraud Leadership and Governance is the clearest recorded foundation.',
    prioritySignals: ['Fraud Leadership and Governance: Immediate attention.', 'Fraud Risk Identification: Immediate attention.'],
    managementImplication: 'Leadership should clarify ownership and prioritise the recorded attention areas.'
  };
  const issues = validateSnapshotNarrative(value, input);
  assert.deepEqual(issues, []);
  assert.ok(Object.values(value).join(' ').split(/\s+/).length < SNAPSHOT_NARRATIVE_MAX_WORDS);
});

test('a valid Snapshot cache hit avoids another narrative generation', async () => {
  const rows = new Map();
  let reads = 0;
  let writes = 0;
  let generatorCalls = 0;
  const cache = {
    async read(key) {
      reads += 1;
      return rows.get(JSON.stringify(key)) ?? null;
    },
    async write(key, record) {
      writes += 1;
      rows.set(JSON.stringify(key), record);
    }
  };
  const generator = async (value) => {
    generatorCalls += 1;
    return buildDeterministicSnapshotNarrative(value);
  };

  const first = await buildCachedSnapshotNarrative({ snapshot, insights, cache, generator });
  const second = await buildCachedSnapshotNarrative({ snapshot, insights, cache, generator });

  assert.equal(reads, 2);
  assert.equal(writes, 1);
  assert.equal(generatorCalls, 1);
  assert.deepEqual(second, {
    headline: first.headline,
    executiveDiagnosis: first.executiveDiagnosis,
    strength: first.strength,
    prioritySignals: first.prioritySignals,
    managementImplication: first.managementImplication,
    mode: 'deterministic',
    model: 'deterministic',
    promptVersion: first.promptVersion,
    aiCallCount: 0,
    fallbackReason: undefined,
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    providerCostMicros: undefined
  });
  const cacheKey = [...rows.keys()][0];
  assert.match(cacheKey, /assessment-snapshot/);
  assert.match(cacheKey, /score-run/);
  assert.match(cacheKey, /methodology-v1-2/);
  assert.match(cacheKey, /mk-snapshot-five-part-advisory-v2/);
});

test('Snapshot policy is Mini-first with technical fallback and one successful generation', () => {
  const policy = selectSnapshotModel();
  assert.equal(policy.primaryModel, 'openai/gpt-5-mini');
  assert.deepEqual(policy.fallbackModels, ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol']);
  assert.equal(policy.maxSuccessfulGenerations, 1);
});

console.log(JSON.stringify({ passed: true, checks: ['bounded Snapshot input', 'strict five-field contract', 'deterministic fallback', 'invented number rejection', 'paid-tier leakage rejection', 'assurance rejection', 'cache hit avoids another generation', 'Mini-first policy'] }, null, 2));

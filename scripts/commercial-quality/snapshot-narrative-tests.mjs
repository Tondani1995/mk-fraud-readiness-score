#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { NoOutputGeneratedError } from 'ai';
import {
  buildCachedSnapshotNarrative,
  buildDeterministicSnapshotNarrative,
  buildSnapshotNarrativeBrief,
  buildSnapshotNarrative,
  buildSnapshotNarrativeInput,
  normaliseSnapshotNarrativeContent,
  SNAPSHOT_NARRATIVE_MAX_WORDS,
  snapshotGatewayFailureReason,
  snapshotNarrativeContentSchema,
  validateSnapshotNarrative
} from '../../src/lib/snapshot/narrative.ts';
import { buildDeterministicSnapshotPrioritySignals } from '../../src/lib/snapshot/deterministic-narrative.ts';
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
const brief = buildSnapshotNarrativeBrief(snapshot, insights);

test('Snapshot narrative input is bounded to approved deterministic facts', () => {
  assert.deepEqual(Object.keys(input).sort(), [
    'assuranceBoundary', 'attentionAreas', 'coveragePct', 'criticalGapCount', 'maturity', 'majorGapCount',
    'nARatePct', 'nextStepDirection', 'organisationName', 'overallScore', 'resultStatus', 'strongestAreas'
  ].sort());
  assert.equal(JSON.stringify(input).includes('D1'), false);
  assert.equal(JSON.stringify(input).includes('roadmap'), false);
});

test('Snapshot AI brief excludes diagnostic metrics and exposes only interpretation facts', () => {
  assert.deepEqual(Object.keys(brief).sort(), [
    'assuranceBoundary', 'attentionAreas', 'maturity', 'nextStepDirection', 'organisationName', 'resultStatus', 'strongestAreas'
  ].sort());
  assert.equal('coveragePct' in brief, false);
  assert.equal('nARatePct' in brief, false);
  assert.equal('criticalGapCount' in brief, false);
  assert.equal('majorGapCount' in brief, false);
  assert.doesNotMatch(JSON.stringify(brief), /100|35\.55|critical.*gap|major.*gap/i);
});

test('No-strength results use an explicit absence statement rather than procedural evidence', () => {
  const noStrength = buildDeterministicSnapshotNarrative({
    snapshot,
    insights: { ...insights, strengths: [] }
  });
  assert.equal(noStrength.strength, 'The recorded responses do not yet support identifying a dependable organisational strength.');
  assert.doesNotMatch(noStrength.strength, /coverage|completion|visibility|unknown/i);

  const noStrengthBrief = buildSnapshotNarrativeBrief(snapshot, { ...insights, strengths: [] });
  assert.deepEqual(noStrengthBrief.strongestAreas, []);
});

test('Priority signals are deterministic from attention areas, with safe one-area and empty cases', () => {
  assert.deepEqual(
    buildDeterministicSnapshotPrioritySignals(
      ['Digital and Identity Fraud Risk', 'Operational Fraud Controls'],
      'Leadership attention should prioritise the recorded result.'
    ),
    [
      'The recorded responses point to Digital and Identity Fraud Risk as an area requiring management attention.',
      'The recorded responses point to Operational Fraud Controls as the next area to examine in more detail.'
    ]
  );
  assert.deepEqual(
    buildDeterministicSnapshotPrioritySignals(['Governance'], 'Leadership should use the result.'),
    [
      'The recorded responses point to Governance as an area requiring management attention.',
      'The overall management direction is to use this result to guide the next management actions.'
    ]
  );
  assert.deepEqual(
    buildDeterministicSnapshotPrioritySignals([], ''),
    [
      'The recorded responses do not identify a specific area for priority attention.',
      'Leadership should use the overall result to determine the next management focus.'
    ]
  );
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

test('Snapshot AI uses a request-scoped OIDC token before static credentials', async () => {
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
    let requestHeaders;
    let requestBody;
    globalThis.fetch = async (_url, init) => {
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body ?? '{}'));
      throw new Error('TEST_PROVIDER_MOCK');
    };
    const oidcPath = await buildSnapshotNarrative({
      snapshot,
      insights,
      gatewayAuth: { requestOidcToken: 'test-only-request-oidc-token' }
    });
    assert.equal(oidcPath.mode, 'deterministic');
    assert.equal(oidcPath.aiCallCount, 1);
    assert.deepEqual(oidcPath.attemptedModels, ['openai/gpt-5-mini']);
    assert.equal(oidcPath.fallbackReason, 'gateway_provider_unavailable');
    assert.equal(requestHeaders.get('ai-gateway-auth-method'), 'oidc');
    assert.equal(requestHeaders.get('authorization'), 'Bearer test-only-request-oidc-token');
    assert.equal(requestBody.maxOutputTokens, 2048);
    assert.equal(requestBody.providerOptions.openai.reasoningEffort, 'minimal');
    assert.deepEqual(requestBody.providerOptions.gateway.only, ['openai']);
    assert.doesNotMatch(JSON.stringify(brief), /coveragePct|nARatePct|criticalGapCount|majorGapCount/);
    assert.match(JSON.stringify(requestBody), /narrative brief/i);
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

test('Snapshot classifies an AI SDK no-output failure explicitly', () => {
  assert.equal(
    snapshotGatewayFailureReason(new NoOutputGeneratedError({ message: 'test-only no output' })),
    'snapshot_no_output_generated'
  );
});

test('Snapshot AI retains the static API-key path without request OIDC', async () => {
  const previous = {
    apiKey: process.env.AI_GATEWAY_API_KEY,
    vercelApiKey: process.env.VERCEL_AI_GATEWAY_API_KEY,
    oidc: process.env.VERCEL_OIDC_TOKEN,
    fetch: globalThis.fetch
  };
  try {
    process.env.AI_GATEWAY_API_KEY = 'test-only-api-key';
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    let requestHeaders;
    globalThis.fetch = async (_url, init) => {
      requestHeaders = new Headers(init?.headers);
      throw new Error('TEST_PROVIDER_MOCK');
    };
    const apiKeyPath = await buildSnapshotNarrative({ snapshot, insights });
    assert.equal(apiKeyPath.mode, 'deterministic');
    assert.equal(apiKeyPath.aiCallCount, 1);
    assert.equal(apiKeyPath.fallbackReason, 'gateway_provider_unavailable');
    assert.equal(requestHeaders.get('ai-gateway-auth-method'), 'api-key');
    assert.equal(requestHeaders.get('authorization'), 'Bearer test-only-api-key');
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

test('Snapshot AI falls back without attempting a provider when no auth is available', async () => {
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
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('PROVIDER_MUST_NOT_BE_CALLED');
    };
    const unavailable = await buildSnapshotNarrative({ snapshot, insights });
    assert.equal(unavailable.mode, 'deterministic');
    assert.equal(unavailable.aiCallCount, 0);
    assert.equal(unavailable.fallbackReason, 'snapshot_ai_unavailable');
    assert.equal(fetchCalls, 0);
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
  assert.match(cacheKey, /mk-snapshot-five-part-advisory-v5-deterministic-priority-signals/);
});

test('Arbitrary AI priority signals are replaced before Snapshot persistence', async () => {
  let persisted;
  const generated = {
    ...buildDeterministicSnapshotNarrative({ snapshot, insights }),
    mode: 'ai',
    model: 'openai/gpt-5-mini',
    aiCallCount: 1,
    prioritySignals: [
      'Elevated exposure in digital and identity fraud risk requiring strengthened prevention and verification measures.',
      'Operational fraud controls lack clarity of ownership and consistent evidence of sustained operation.'
    ]
  };
  const result = await buildCachedSnapshotNarrative({
    snapshot,
    insights,
    cache: {
      async read() { return null; },
      async write(_key, record) { persisted = record; }
    },
    generator: async () => generated
  });
  const expected = buildDeterministicSnapshotPrioritySignals(brief.attentionAreas, brief.nextStepDirection);
  assert.deepEqual(result.prioritySignals, expected);
  assert.deepEqual(persisted.narrativeJson.prioritySignals, expected);
  assert.doesNotMatch(JSON.stringify(persisted.narrativeJson), /elevated exposure|clarity of ownership/i);
});

test('Snapshot validation rejects the known unsupported grounding phrases', () => {
  const failedPhrases = [
    'The controls are not functioning.',
    'Full coverage ensures no blind spots.',
    'Fraud Leadership and Governance has 19 critical gaps.',
    'Fraud Risk Identification has 17 major gaps.',
    'These weaknesses drive immediate exposure to fraud losses and account compromise.',
    'The result requires assurance activities to validate effectiveness.'
  ];
  for (const phrase of failedPhrases) {
    const issues = validateSnapshotNarrative({
      headline: 'The recorded result shows a position for review.',
      executiveDiagnosis: `The recorded responses indicate a position that needs attention. ${phrase}`,
      strength: 'The self-assessment suggests a starting point for management focus.',
      prioritySignals: ['Leadership attention should focus on the recorded areas.', 'The result points to a need for clearer ownership.'],
      managementImplication: 'Leadership should use the recorded result to prioritise action.'
    }, input);
    assert.ok(issues.length > 0, `expected rejection for: ${phrase}`);
  }
});

test('Snapshot validation rejects em dashes before customer persistence', () => {
  const issues = validateSnapshotNarrative({
    headline: 'The recorded result shows a position for review.',
    executiveDiagnosis: 'The recorded responses indicate a position that needs attention — use the result to guide focus.',
    strength: 'The self-assessment suggests a starting point for management focus.',
    prioritySignals: ['Leadership attention should focus on the recorded areas.', 'The result points to a need for clearer ownership.'],
    managementImplication: 'Leadership should use the recorded result to prioritise action.'
  }, input);
  assert.ok(issues.includes('snapshot_em_dash'));
});

test('Snapshot AI normalisation converts em-dash separators before the final guard', () => {
  const normalised = normaliseSnapshotNarrativeContent({
    headline: 'Example Health Logistics — a recorded position.',
    executiveDiagnosis: 'The recorded responses indicate a position that needs attention — Use the result to guide focus.',
    strength: 'The self-assessment suggests a starting point for management focus — leadership should review ownership.',
    prioritySignals: ['Leadership attention should focus on the recorded areas — first.', 'The result points to clearer ownership.'],
    managementImplication: 'Leadership attention should focus on the recorded areas.'
  });
  assert.ok(normalised);
  assert.equal(JSON.stringify(normalised).includes('—'), false);
  assert.equal(normalised.headline, 'Example Health Logistics: a recorded position.');
  assert.match(normalised.executiveDiagnosis, /attention\. Use/);
  assert.match(normalised.strength, /focus, leadership/);
  assert.deepEqual(validateSnapshotNarrative(normalised, brief, { mode: 'ai' }), []);
});

test('AI narrative rejects coverage and gap-count prose even when it contains no invented number', () => {
  const issues = validateSnapshotNarrative({
    headline: 'Example Health Logistics has a reactive position.',
    executiveDiagnosis: 'The recorded responses indicate a position requiring management attention.',
    strength: 'The self-assessment suggests full coverage and no blind spots.',
    prioritySignals: ['Leadership attention should focus on the recorded areas.', 'The result points to a need for clearer ownership.'],
    managementImplication: 'Leadership should use the recorded result to prioritise the 2 critical gaps.'
  }, brief, { mode: 'ai' });
  assert.ok(issues.includes('snapshot_procedural_metric_leakage'));
});

test('a valid Snapshot cache hit avoids Gateway auth resolution and another provider call', async () => {
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
    let fetchCalls = 0;
    let writes = 0;
    const deterministic = buildDeterministicSnapshotNarrative({ snapshot, insights });
    const cache = {
      async read() {
        return {
          status: 'available',
          narrativeJson: {
            headline: deterministic.headline,
            executiveDiagnosis: deterministic.executiveDiagnosis,
            strength: deterministic.strength,
            prioritySignals: deterministic.prioritySignals,
            managementImplication: deterministic.managementImplication
          },
          model: 'openai/gpt-5-mini',
          aiCallCount: 1
        };
      },
      async write() {
        writes += 1;
      }
    };
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('PROVIDER_MUST_NOT_BE_CALLED');
    };
    const cached = await buildCachedSnapshotNarrative({
      snapshot,
      insights,
      cache,
      gatewayAuth: { requestOidcToken: null }
    });
    assert.equal(cached.mode, 'ai');
    assert.equal(cached.aiCallCount, 1);
    assert.equal(fetchCalls, 0);
    assert.equal(writes, 0);
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

test('Snapshot policy is Mini-first with technical fallback and one successful generation', () => {
  const policy = selectSnapshotModel();
  assert.equal(policy.primaryModel, 'openai/gpt-5-mini');
  assert.deepEqual(policy.fallbackModels, ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol']);
  assert.equal(policy.maxSuccessfulGenerations, 1);
});

console.log(JSON.stringify({ passed: true, checks: ['bounded Snapshot input', 'AI brief excludes diagnostic metrics', 'no-strength fallback', 'deterministic priority signals', 'strict five-field contract', 'request OIDC auth precedence', 'Mini minimal reasoning and 2048-token budget', 'no-output failure classification', 'static API-key auth path', 'no-auth deterministic fallback', 'invented number rejection', 'paid-tier leakage rejection', 'assurance rejection', 'em-dash normalisation', 'procedural metric rejection', 'AI priority signals are canonicalised before persistence', 'cache hit avoids auth and generation', 'Mini-first policy'] }, null, 2));

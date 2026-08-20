#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  MAX_FALLBACK_ATTEMPTS_PER_STAGE,
  MAX_MINI_ATTEMPTS_PER_STAGE,
  MAX_PROVIDER_ATTEMPTS_PER_STAGE,
  NARRATIVE_FALLBACK_MODELS,
  PRIMARY_NARRATIVE_MODEL,
  selectNarrativeModel,
  selectNarrativeModelForRequestedModel
} from '../../src/lib/reports/ai-model-policy.ts';
import { buildSemanticReviewRequestPayload } from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';
import { semanticReviewEnvelopeSchema, validateSemanticReviewResult } from '../../src/lib/reports/narrative/semantic-reviewer.ts';
import { runNarrativeProviderAttempts } from '../../src/lib/reports/narrative/provider-attempt-policy.ts';

function technicalError(code, options = {}) {
  const error = new Error(code);
  error.narrativeProviderFailure = {
    classification: options.classification ?? 'retryable_technical',
    code,
    retryable: options.retryable ?? true,
    fallbackEligible: options.fallbackEligible ?? true,
    ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {})
  };
  if (options.providerResponse) error.providerResponse = options.providerResponse;
  return error;
}

function classifier(error) {
  return error.narrativeProviderFailure;
}

function response(attempt, text = undefined) {
  return {
    usage: { inputTokens: 100 + attempt, outputTokens: 20 + attempt, totalTokens: 120 + attempt },
    providerMetadata: { gateway: { generationId: `gen-${attempt}`, cost: '0.000001' } },
    response: { id: `resp-${attempt}`, body: text ? { choices: [{ message: { content: text } }] } : undefined },
    finishReason: 'stop'
  };
}

async function runStage({ logicalStage = 'semantic_review', selection = selectNarrativeModel({}), execute }) {
  return runNarrativeProviderAttempts({ logicalStage, modelSelection: selection, execute, classifyFailure: classifier });
}

assert.equal(selectNarrativeModel({}).requestedModel, PRIMARY_NARRATIVE_MODEL);
assert.equal(selectNarrativeModelForRequestedModel('openai/gpt-5.5').requestedModel, PRIMARY_NARRATIVE_MODEL);
assert.equal(MAX_MINI_ATTEMPTS_PER_STAGE, 4);
assert.equal(MAX_FALLBACK_ATTEMPTS_PER_STAGE, 3);
assert.equal(MAX_PROVIDER_ATTEMPTS_PER_STAGE, 7);

const secondAttemptContexts = [];
const secondAttempt = await runStage({
  execute: async (context) => {
    secondAttemptContexts.push(context);
    if (context.attempt === 1) throw technicalError('provider_timeout');
    return { value: 'accepted', response: response(context.attempt) };
  }
});
assert.equal(secondAttempt.value, 'accepted');
assert.deepEqual(secondAttemptContexts.map((context) => context.model), [PRIMARY_NARRATIVE_MODEL, PRIMARY_NARRATIVE_MODEL]);
assert.equal(secondAttempt.accounting.totalMiniAttempts, 2);
assert.equal(secondAttempt.accounting.totalFallbackAttempts, 0);
assert.equal(secondAttempt.accounting.totalPhysicalProviderRequests, 2);

const miniThenLunaContexts = [];
const miniThenLuna = await runStage({
  execute: async (context) => {
    miniThenLunaContexts.push(context);
    if (context.model === PRIMARY_NARRATIVE_MODEL) throw technicalError('provider_transient_http');
    return { value: 'fallback-accepted', response: response(context.attempt) };
  }
});
assert.deepEqual(miniThenLunaContexts.map((context) => context.model), [
  PRIMARY_NARRATIVE_MODEL,
  PRIMARY_NARRATIVE_MODEL,
  PRIMARY_NARRATIVE_MODEL,
  PRIMARY_NARRATIVE_MODEL,
  NARRATIVE_FALLBACK_MODELS[0]
]);
assert.equal(miniThenLuna.accounting.totalMiniAttempts, 4);
assert.equal(miniThenLuna.accounting.totalFallbackAttempts, 1);
assert.equal(miniThenLuna.accounting.totalPhysicalProviderRequests, 5);

const exactFallbackContexts = [];
const exactFallback = await runStage({
  execute: async (context) => {
    exactFallbackContexts.push(context);
    if (context.model !== NARRATIVE_FALLBACK_MODELS.at(-1)) {
      throw technicalError('model_unavailable', {
        classification: 'fallback_technical',
        retryable: false,
        fallbackReason: 'model_unavailable'
      });
    }
    return { value: 'sol-accepted', response: response(context.attempt) };
  }
});
assert.deepEqual(exactFallbackContexts.map((context) => context.model), [PRIMARY_NARRATIVE_MODEL, ...NARRATIVE_FALLBACK_MODELS]);
assert.equal(exactFallback.accounting.totalPhysicalProviderRequests, 4);
assert.equal(exactFallback.accounting.totalFallbackAttempts, 3);

const deterministicOutcomeContexts = [];
const deterministicOutcome = await runStage({
  execute: async (context) => {
    deterministicOutcomeContexts.push(context);
    return { value: { disposition: 'REJECT' }, response: response(context.attempt) };
  }
});
assert.equal(deterministicOutcome.value.disposition, 'REJECT');
assert.equal(deterministicOutcomeContexts.length, 1, 'REJECT is a semantic outcome, not a provider retry/fallback signal');

for (const disposition of ['HOLD', 'REJECT']) {
  const contexts = [];
  const result = await runStage({
    execute: async (context) => {
      contexts.push(context);
      return { value: { disposition }, response: response(context.attempt) };
    }
  });
  assert.equal(result.value.disposition, disposition);
  assert.equal(contexts.length, 1, `${disposition} is not a provider retry/fallback signal`);
}

const validationFailureContexts = [];
await assert.rejects(
  runStage({
    execute: async (context) => {
      validationFailureContexts.push(context);
      throw technicalError('semantic_deterministic_validation_failed', {
        classification: 'non_retryable',
        retryable: false,
        fallbackEligible: false
      });
    }
  }),
  /semantic_deterministic_validation_failed/
);
assert.equal(validationFailureContexts.length, 1, 'deterministic validation failure cannot retry or fallback');

const candidate = {
  candidateId: 'candidate-1',
  ruleCode: 'semantic_grounding_block',
  path: 'SEC.paragraphs[0]',
  candidateSpan: 'A bounded paragraph about the control route.',
  paragraph: 'A bounded paragraph about the control route.',
  surroundingProse: 'Opening context. A bounded paragraph about the control route. Closing context.',
  blueprintPath: 'SEC',
  chapterTitle: 'Chapter',
  sectionTitle: 'Section',
  permittedClaimRefs: ['FACT-1'],
  permittedFacts: [{ id: 'FACT-1', kind: 'control', value: 'The control route is deterministic.' }],
  requiredManagementTakeaway: 'Management should document the route and review ownership.',
  assuranceBoundary: 'The assessment does not independently verify operating effectiveness.',
  warningSignals: [{ code: 'fixture_signal', matchedSpan: 'route', message: 'detector context only' }]
};
const candidates = Array.from({ length: 45 }, (_, index) => ({ ...candidate, candidateId: `candidate-${index + 1}`, paragraph: `Bounded paragraph ${index + 1} about the control route.` }));
const allAllowEnvelope = {
  decisions: candidates.map((_, index) => ({ reviewId: `B${String(index + 1).padStart(2, '0')}`, disposition: 'ALLOW', reasonCode: 'grounded' })),
  repair: null
};
const oneRepairEnvelope = {
  decisions: allAllowEnvelope.decisions.map((decision, index) => index === 0 ? { ...decision, disposition: 'REPAIR' } : decision),
  repair: { reviewId: 'B01', replacementProse: 'Management should document the bounded control route and review ownership through the relevant process.' }
};
const multipleRepairEnvelope = {
  decisions: allAllowEnvelope.decisions.map((decision, index) => index < 2 ? { ...decision, disposition: 'REPAIR' } : decision),
  repair: null
};
const estimateTokens = (value) => Math.ceil(Buffer.byteLength(JSON.stringify(value), 'utf8') / 4);
assert.ok(estimateTokens(allAllowEnvelope) <= 2000, `all-ALLOW envelope should remain compact: ${estimateTokens(allAllowEnvelope)}`);
assert.ok(estimateTokens(oneRepairEnvelope) < 4000, `one-repair envelope should remain bounded: ${estimateTokens(oneRepairEnvelope)}`);
assert.ok(estimateTokens(multipleRepairEnvelope) <= 2000, `multiple-repair envelope must stay compact: ${estimateTokens(multipleRepairEnvelope)}`);
assert.throws(() => semanticReviewEnvelopeSchema.parse({ decisions: [{ disposition: 'ALLOW', reasonCode: 'grounded' }], repair: null }));
assert.deepEqual(validateSemanticReviewResult({ candidates }, semanticReviewEnvelopeSchema.parse(allAllowEnvelope)).repair, null);
assert.equal(validateSemanticReviewResult({ candidates }, semanticReviewEnvelopeSchema.parse(oneRepairEnvelope)).repair?.candidateId, 'candidate-1');
assert.equal(validateSemanticReviewResult({ candidates }, semanticReviewEnvelopeSchema.parse(multipleRepairEnvelope)).repair, null);

const richPayload = buildSemanticReviewRequestPayload({ candidates: [candidate] });
assert.equal(richPayload.blocks[0].paragraph, candidate.paragraph);
assert.match(richPayload.blocks[0].adjacentContext, /\[TARGET_BLOCK\]/);
assert.deepEqual(richPayload.blocks[0].permittedClaimRefs, candidate.permittedClaimRefs);
assert.deepEqual(richPayload.blocks[0].permittedFactIds, ['FACT-1']);
assert.equal(richPayload.blocks[0].requiredManagementTakeaway, candidate.requiredManagementTakeaway);
assert.equal(richPayload.blocks[0].assuranceBoundary, candidate.assuranceBoundary);
assert.deepEqual(richPayload.blocks[0].warningSignals, candidate.warningSignals);

const diagnosticError = technicalError('provider_timeout', {
  providerResponse: { ...response(1, 'CUSTOMER_PROSE_SHOULD_NOT_BE_LOGGED'), finishReason: 'stop' }
});
await assert.rejects(
  runStage({ execute: async () => { throw diagnosticError; } }),
  (error) => {
    const accountingText = JSON.stringify(error.narrativeAttemptAccounting);
    assert.doesNotMatch(accountingText, /CUSTOMER_PROSE_SHOULD_NOT_BE_LOGGED/);
    assert.equal(error.narrativeAttemptAccounting.totalPhysicalProviderRequests, 7, 'all physical attempts are recorded before terminal exhaustion');
    return true;
  }
);

console.log(JSON.stringify({
  passed: true,
  miniAttemptsPerStage: MAX_MINI_ATTEMPTS_PER_STAGE,
  fallbackOrder: NARRATIVE_FALLBACK_MODELS,
  maxPhysicalRequestsPerStage: MAX_PROVIDER_ATTEMPTS_PER_STAGE,
  outputTokenEstimates: {
    allAllow45: estimateTokens(allAllowEnvelope),
    oneRepair45: estimateTokens(oneRepairEnvelope),
    multipleRepair45: estimateTokens(multipleRepairEnvelope)
  },
  proof: ['default Mini', 'attempt 2 stops', 'four total Mini attempts', 'technical fallback order', 'REJECT no retry', 'compact output', 'mandatory identity', 'rich semantic input preserved', 'customer prose excluded from diagnostics', 'physical counts']
}, null, 2));

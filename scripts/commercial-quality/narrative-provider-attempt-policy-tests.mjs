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
import {
  SEMANTIC_REVIEW_INITIAL_MAX_OUTPUT_TOKENS,
  SEMANTIC_REVIEW_MAX_OUTPUT_TOKENS,
  buildSemanticReviewRequestPayload,
  classifyNarrativeProviderFailure,
  createManuscriptConformanceError,
  validateWholeManuscriptConformance,
  semanticReviewMaxOutputTokensForAttempt
} from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';
import { semanticReviewEnvelopeSchema, validateSemanticReviewEnvelope } from '../../src/lib/reports/narrative/semantic-reviewer.ts';
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
    usage: {
      inputTokens: 100 + attempt,
      outputTokens: 20 + attempt,
      outputTokenDetails: { reasoningTokens: 5 + attempt, textTokens: 15 },
      totalTokens: 120 + attempt
    },
    providerMetadata: { gateway: { generationId: `gen-${attempt}`, cost: '0.000001' } },
    response: { id: `resp-${attempt}`, body: text ? { choices: [{ message: { content: text } }] } : undefined },
    finishReason: 'stop'
  };
}

async function runStage({ logicalStage = 'semantic_review', selection = selectNarrativeModel({}), execute, classifyFailure = classifier }) {
  return runNarrativeProviderAttempts({ logicalStage, modelSelection: selection, execute, classifyFailure });
}

assert.equal(selectNarrativeModel({}).requestedModel, PRIMARY_NARRATIVE_MODEL);
assert.equal(selectNarrativeModelForRequestedModel('openai/gpt-5.5').requestedModel, PRIMARY_NARRATIVE_MODEL);
assert.equal(MAX_MINI_ATTEMPTS_PER_STAGE, 4);
assert.equal(MAX_FALLBACK_ATTEMPTS_PER_STAGE, 3);
assert.equal(MAX_PROVIDER_ATTEMPTS_PER_STAGE, 7);
assert.equal(SEMANTIC_REVIEW_INITIAL_MAX_OUTPUT_TOKENS, 4500);
assert.equal(SEMANTIC_REVIEW_MAX_OUTPUT_TOKENS, 6000);
assert.deepEqual([1, 2, 3, 4].map(semanticReviewMaxOutputTokensForAttempt), [4500, 6000, 6000, 6000]);

const secondAttemptContexts = [];
const secondAttempt = await runStage({
  execute: async (context) => {
    secondAttemptContexts.push(context);
    if (context.attempt === 1) throw technicalError('provider_timeout', { providerResponse: response(context.attempt) });
    return { value: 'accepted', response: response(context.attempt) };
  }
});
assert.equal(secondAttempt.value, 'accepted');
assert.deepEqual(secondAttemptContexts.map((context) => context.model), [PRIMARY_NARRATIVE_MODEL, PRIMARY_NARRATIVE_MODEL]);
assert.equal(secondAttempt.accounting.totalMiniAttempts, 2);
assert.equal(secondAttempt.accounting.totalFallbackAttempts, 0);
assert.equal(secondAttempt.accounting.totalPhysicalProviderRequests, 2);
assert.equal(secondAttempt.accounting.outputTokens, 43);
assert.equal(secondAttempt.accounting.reasoningTokens, 13);
assert.equal(secondAttempt.accounting.visibleOutputTokens, 30);
assert.equal(secondAttempt.accounting.reasoningTokens + secondAttempt.accounting.visibleOutputTokens, secondAttempt.accounting.outputTokens);
assert.equal(secondAttempt.accounting.attemptRecords[1].reasoningTokens, 7);
assert.equal(secondAttempt.accounting.attemptRecords[1].visibleOutputTokens, 15);

function semanticLengthError() {
  const error = new Error('semantic_output_contract_too_large');
  error.semanticReviewFailureCode = 'semantic_output_contract_too_large';
  error.providerResponse = { ...response(1), finishReason: 'length' };
  return error;
}

const semanticLengthClassification = classifyNarrativeProviderFailure(semanticLengthError(), {
  logicalStage: 'semantic_review',
  attempt: 1,
  modelAttempt: 1,
  model: PRIMARY_NARRATIVE_MODEL,
  provider: 'openai',
  primaryOrFallback: 'primary'
});
assert.equal(semanticLengthClassification.classification, 'retryable_technical');
assert.equal(semanticLengthClassification.retryable, true);
assert.equal(semanticLengthClassification.fallbackEligible, false);

const semanticRetryContexts = [];
const semanticRetry = await runStage({
  classifyFailure: classifyNarrativeProviderFailure,
  execute: async (context) => {
    context.maxOutputTokens = semanticReviewMaxOutputTokensForAttempt(context.modelAttempt);
    semanticRetryContexts.push({ ...context });
    if (context.modelAttempt === 1) throw semanticLengthError();
    return { value: 'semantic-accepted-on-second-mini-attempt', response: response(context.attempt) };
  }
});
assert.equal(semanticRetry.value, 'semantic-accepted-on-second-mini-attempt');
assert.deepEqual(semanticRetryContexts.map((context) => context.model), [PRIMARY_NARRATIVE_MODEL, PRIMARY_NARRATIVE_MODEL]);
assert.deepEqual(semanticRetryContexts.map((context) => context.maxOutputTokens), [4500, 6000]);
assert.equal(semanticRetry.accounting.totalMiniAttempts, 2);
assert.equal(semanticRetry.accounting.totalFallbackAttempts, 0);
assert.equal(semanticRetry.accounting.totalPhysicalProviderRequests, 2);
assert.deepEqual(semanticRetry.accounting.attemptRecords.map((record) => record.maxOutputTokens), [4500, 6000]);

const fourSemanticTruncations = [];
await assert.rejects(
  runStage({
    classifyFailure: classifyNarrativeProviderFailure,
    execute: async (context) => {
      context.maxOutputTokens = semanticReviewMaxOutputTokensForAttempt(context.modelAttempt);
      fourSemanticTruncations.push({ ...context });
      throw semanticLengthError();
    }
  }),
  (error) => {
    assert.equal(error.message, 'semantic_output_contract_too_large');
    assert.equal(error.narrativeAttemptAccounting.totalMiniAttempts, 4);
    assert.equal(error.narrativeAttemptAccounting.totalFallbackAttempts, 0);
    assert.equal(error.narrativeAttemptAccounting.totalPhysicalProviderRequests, 4);
    assert.deepEqual(error.narrativeAttemptAccounting.attemptRecords.map((record) => record.maxOutputTokens), [4500, 6000, 6000, 6000]);
    return true;
  }
);
assert.deepEqual(fourSemanticTruncations.map((context) => context.model), Array(4).fill(PRIMARY_NARRATIVE_MODEL));

const manuscriptBlueprint = {
  chapters: [{
    chapterId: 'CH',
    title: 'Chapter',
    sections: [{
      sectionId: 'SEC',
      title: 'Section',
      requiredFacts: [],
      claimRefs: [],
      optionalSubsections: []
    }]
  }]
};
const manuscriptFactPack = { facts: [] };
const rawIdManuscript = '# Chapter\n\n## Section\n\nThe issue MF-ABC remains in the route.';
const unsupportedNumericManuscript = '# Chapter\n\n## Section\n\nThe reported score is 91.';
const malformedManuscript = '# Wrong heading\n\n## Section\n\nManagement should document the route.';
const cleanManuscript = '# Chapter\n\n## Section\n\nManagement should document the control route.';

function manuscriptResponse(attempt) {
  return response(attempt, 'CUSTOMER_PROSE_SHOULD_NOT_BE_LOGGED');
}

async function runManuscriptConformanceSequence(outputs, state) {
  const contexts = [];
  const result = await runStage({
    logicalStage: 'manuscript',
    classifyFailure: classifyNarrativeProviderFailure,
    execute: async (context) => {
      contexts.push({ ...context });
      const markdown = outputs[context.modelAttempt - 1] ?? outputs.at(-1);
      const checked = validateWholeManuscriptConformance({ markdown, blueprint: manuscriptBlueprint, factPack: manuscriptFactPack });
      if (!checked.ok) throw createManuscriptConformanceError(manuscriptResponse(context.attempt), checked.failure);
      return { value: checked.markdown, response: manuscriptResponse(context.attempt) };
    }
  });
  state.semanticCalls += 1;
  return { result, contexts };
}

const rawIdThenCleanState = { semanticCalls: 0 };
const rawIdThenClean = await runManuscriptConformanceSequence([rawIdManuscript, cleanManuscript], rawIdThenCleanState);
assert.deepEqual(rawIdThenClean.contexts.map((context) => context.model), [PRIMARY_NARRATIVE_MODEL, PRIMARY_NARRATIVE_MODEL]);
assert.equal(rawIdThenClean.result.accounting.totalMiniAttempts, 2);
assert.equal(rawIdThenClean.result.accounting.totalFallbackAttempts, 0);
assert.equal(rawIdThenClean.result.accounting.totalPhysicalProviderRequests, 2);
assert.equal(rawIdThenCleanState.semanticCalls, 1, 'semantic review starts only after a conformance-valid manuscript');
assert.equal(rawIdThenClean.result.accounting.attemptRecords[0].conformanceFailureCode, 'raw_internal_id');
assert.equal(rawIdThenClean.result.accounting.attemptRecords[0].conformancePath, 'SEC.paragraphs[0]');
assert.equal(rawIdThenClean.result.accounting.attemptRecords[0].conformancePatternFamily, 'raw_internal_id');
assert.equal(rawIdThenClean.result.accounting.attemptRecords[0].providerCostMicros, 1);
assert.equal(rawIdThenClean.result.accounting.costMicros, 2);
assert.equal(rawIdThenClean.result.accounting.attemptRecords[1].success, true);
assert.doesNotMatch(JSON.stringify(rawIdThenClean.result.accounting), /CUSTOMER_PROSE_SHOULD_NOT_BE_LOGGED/);

const numericThenCleanState = { semanticCalls: 0 };
const numericThenClean = await runManuscriptConformanceSequence([unsupportedNumericManuscript, cleanManuscript], numericThenCleanState);
assert.equal(numericThenClean.result.accounting.totalMiniAttempts, 2);
assert.equal(numericThenClean.result.accounting.attemptRecords[0].conformanceFailureCode, 'unsupported_numeric_claim');
assert.equal(numericThenClean.result.accounting.attemptRecords[0].conformancePath, 'SEC.paragraphs[0]');
assert.equal(numericThenCleanState.semanticCalls, 1);

const malformedThenCleanState = { semanticCalls: 0 };
const malformedThenClean = await runManuscriptConformanceSequence([malformedManuscript, cleanManuscript], malformedThenCleanState);
assert.equal(malformedThenClean.result.accounting.totalMiniAttempts, 2);
assert.equal(malformedThenClean.result.accounting.attemptRecords[0].conformanceFailureCode, 'structural');
assert.ok(malformedThenClean.result.accounting.attemptRecords[0].structuralErrorCodes.includes('heading_order_or_name'));
assert.equal(malformedThenCleanState.semanticCalls, 1);

const fourRawIdState = { semanticCalls: 0 };
await assert.rejects(
  runManuscriptConformanceSequence(Array(4).fill(rawIdManuscript), fourRawIdState),
  (error) => {
    assert.equal(error.narrativeAttemptAccounting.totalMiniAttempts, 4);
    assert.equal(error.narrativeAttemptAccounting.totalFallbackAttempts, 0, 'manuscript conformance never escalates to Luna/Terra/Sol');
    assert.equal(error.narrativeAttemptAccounting.totalPhysicalProviderRequests, 4);
    assert.equal(error.narrativeAttemptAccounting.attemptRecords.every((record) => record.model === PRIMARY_NARRATIVE_MODEL), true);
    assert.equal(error.narrativeAttemptAccounting.attemptRecords.every((record) => record.conformanceFailureCode === 'raw_internal_id'), true);
    assert.equal(fourRawIdState.semanticCalls, 0, 'semantic review is never called for a rejected manuscript');
    assert.doesNotMatch(JSON.stringify(error.narrativeAttemptAccounting), /CUSTOMER_PROSE_SHOULD_NOT_BE_LOGGED/);
    assert.equal(error.narrativeAttemptAccounting.costMicros, 4, 'all four physical conformance attempts remain cost-accounted');
    return true;
  }
);

const cleanFirstState = { semanticCalls: 0 };
const cleanFirst = await runManuscriptConformanceSequence([cleanManuscript], cleanFirstState);
assert.equal(cleanFirst.result.accounting.totalMiniAttempts, 1, 'a clean manuscript consumes one Mini request');
assert.equal(cleanFirst.result.accounting.totalPhysicalProviderRequests, 1);
assert.equal(cleanFirstState.semanticCalls, 1);

assert.equal(validateWholeManuscriptConformance({ markdown: rawIdManuscript, blueprint: manuscriptBlueprint, factPack: manuscriptFactPack }).failure.conformanceFailureCode, 'raw_internal_id');
assert.equal(validateWholeManuscriptConformance({ markdown: unsupportedNumericManuscript, blueprint: manuscriptBlueprint, factPack: manuscriptFactPack }).failure.conformanceFailureCode, 'unsupported_numeric_claim');

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
assert.deepEqual(validateSemanticReviewEnvelope({ candidates }, semanticReviewEnvelopeSchema.parse(allAllowEnvelope)).repair, null);
assert.equal(validateSemanticReviewEnvelope({ candidates }, semanticReviewEnvelopeSchema.parse(oneRepairEnvelope)).repair?.candidateId, 'candidate-1');
assert.equal(validateSemanticReviewEnvelope({ candidates }, semanticReviewEnvelopeSchema.parse(multipleRepairEnvelope)).repair, null);

const richPayload = buildSemanticReviewRequestPayload({ candidates: [candidate] });
assert.equal(richPayload.blocks[0].paragraph, candidate.paragraph);
assert.equal(richPayload.blocks[0].ruleCode, candidate.ruleCode);
assert.equal(richPayload.blocks[0].candidateSpan, candidate.candidateSpan);
assert.equal(richPayload.blocks[0].surroundingProse, candidate.surroundingProse);
assert.deepEqual(richPayload.blocks[0].permittedClaimRefs, candidate.permittedClaimRefs);
assert.deepEqual(richPayload.blocks[0].permittedFacts, candidate.permittedFacts);
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
  proof: ['default Mini', 'semantic length retries Mini with increased headroom', 'second semantic Mini success stops', 'four semantic truncations fail closed', 'manuscript raw-ID conformance retries Mini', 'manuscript numeric conformance retries Mini', 'manuscript structural conformance retries Mini', 'four manuscript conformance failures fail closed without fallback', 'clean manuscript uses one Mini request', 'reasoning-token accounting', 'four total Mini attempts', 'technical fallback order', 'REJECT no retry', 'compact output', 'mandatory identity', 'full semantic input preserved', 'customer prose excluded from diagnostics', 'physical counts']
}, null, 2));

import { APICallError } from 'ai';

/**
 * Phase 14 launch readiness -- M1: AI retry classification.
 *
 * Before this module existed, every failure from the narrative generator -- regardless
 * of whether the request ever left this process -- was persisted as
 * `provider_result_uncertain` in durable-ai-attempts.ts, which permanently blocks
 * further automatic attempts for that fingerprint until an operator intervenes. That is
 * the correct, safe default for any failure where the provider MAY have received and
 * processed the request. It is needlessly conservative for a failure that is PROVEN to
 * have happened before any network call was dispatched (a bad model id, a missing API
 * key, an invalid argument to the SDK): nothing was sent, nothing could have been
 * charged or partially generated, so it is safe to let the durable workflow claim a
 * fresh attempt automatically rather than stall the whole fulfilment on an operator.
 *
 * `pre_dispatch` -- proven, by the specific AI SDK error class thrown, to have failed
 *   before any HTTP request was made. Safe for the caller to treat as retryable.
 * `provider_declared` -- the provider produced an actual response (a definitive
 *   non-retryable HTTP rejection, or content that failed provider-side/parse
 *   validation). Known, not ambiguous -- but retrying with identical inputs would
 *   almost certainly reach the provider again for the same result, so this is NOT
 *   auto-retryable and is recorded with its own diagnostic prefix.
 * `ambiguous` -- the default, fail-safe classification for everything else, including
 *   network-level failures with no response, our own request timeout/abort, and any
 *   error this module does not specifically recognise. The request may or may not have
 *   reached the provider; automatic replay is never safe here.
 *
 * This is a closed, explicit allow-list classifier: an error can only be classified as
 * `pre_dispatch` by positively matching a known pre-dispatch AI SDK error class. Every
 * unrecognised error defaults to `ambiguous`, never to `pre_dispatch` -- classification
 * errors must fail toward the safer (more conservative, reconciliation-required)
 * outcome, never toward silently permitting extra provider spend.
 */
export type AiProviderFailureClass = 'pre_dispatch' | 'provider_declared' | 'ambiguous';

// AI SDK error class `.name` values that are only ever thrown during argument, prompt,
// model-resolution or credential/setting validation -- all of which happen
// synchronously, before `fetch` is ever called. Confirmed by direct inspection of the
// installed `ai` package's exported error classes and their constructors.
const PRE_DISPATCH_ERROR_NAMES = new Set([
  'AI_InvalidArgumentError',
  'AI_InvalidPromptError',
  'AI_NoSuchModelError',
  'AI_LoadAPIKeyError',
  'AI_LoadSettingError',
  'AI_UnsupportedFunctionalityError'
]);

// AI SDK error class `.name` values that are only ever thrown once some response body
// has actually been received and processed (a body that could not be parsed as JSON, a
// structured-output/object result that failed schema or provider-side content
// validation, or an explicitly empty response body). The provider is proven to have
// been reached in every one of these cases.
const PROVIDER_DECLARED_ERROR_NAMES = new Set([
  'AI_NoContentGeneratedError',
  'AI_NoObjectGeneratedError',
  'AI_NoOutputGeneratedError',
  'AI_JSONParseError',
  'AI_InvalidResponseDataError',
  'AI_TypeValidationError',
  'AI_EmptyResponseBodyError'
]);

export function classifyAiProviderFailure(error: unknown): AiProviderFailureClass {
  if (error instanceof Error && PRE_DISPATCH_ERROR_NAMES.has(error.name)) {
    return 'pre_dispatch';
  }
  // A non-retryable APICallError with a concrete status code means the HTTP round trip
  // completed and the provider (or its gateway) explicitly rejected the request -- an
  // auth failure, a bad request, a content-policy rejection, and similar. This is
  // "provider-declared", not merely ambiguous. A *retryable* APICallError (rate limits,
  // 5xx, or a transport-level failure with no status code at all) cannot be
  // distinguished from a lost-response scenario, so it falls through to the ambiguous
  // default below.
  if (APICallError.isInstance(error) && error.isRetryable === false && typeof error.statusCode === 'number') {
    return 'provider_declared';
  }
  if (error instanceof Error && PROVIDER_DECLARED_ERROR_NAMES.has(error.name)) {
    return 'provider_declared';
  }
  return 'ambiguous';
}

/**
 * Maps a failure classification to the `report_ai_attempts.status` value it should be
 * persisted with. Only two values are used here (both already part of the schema's
 * `report_ai_attempts_status_check` constraint, added for this exact purpose):
 * `failed_before_provider` is the only status the durable generator's existing-attempt
 * lookup does NOT treat as blocking, so it is reserved strictly for `pre_dispatch`.
 * `provider_declared` reuses `provider_result_uncertain` -- the outcome is not
 * ambiguous in the sense of "we don't know what happened", but retrying it
 * automatically is exactly as unsafe as retrying a genuinely ambiguous failure, and the
 * schema has no separate enum value for "known-terminal, needs no reconciliation with
 * the provider, but still must not auto-retry". The distinction is preserved for
 * operators in the persisted `error_message` prefix instead.
 */
export function aiAttemptStatusForFailureClass(failureClass: AiProviderFailureClass): 'failed_before_provider' | 'provider_result_uncertain' {
  return failureClass === 'pre_dispatch' ? 'failed_before_provider' : 'provider_result_uncertain';
}

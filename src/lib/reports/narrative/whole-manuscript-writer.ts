import { generateText, Output } from 'ai';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { MAX_PROVIDER_ATTEMPTS_PER_STAGE, selectNarrativeModel, selectNarrativeModelForRequestedModel, type NarrativeModelSelection } from '../ai-model-policy';
import { NarrativeWriterUnavailableError, type WholeManuscriptWriter, type WholeManuscriptWriterInput, type WholeManuscriptWriterMetadata, type WholeManuscriptTextResult, type WholeManuscriptTailInput, type WholeManuscriptTailResult, type WholeManuscriptRepairInput, type WholeManuscriptRepairResult, type WholeManuscriptCoherenceInput, type WholeManuscriptCoherenceResult } from './manuscript';
import { appendBlueprintTail, buildBlueprintMarkdownSkeleton, classifyWholeManuscriptGeneration, deriveMissingBlueprintTail, parseBlueprintMarkdown, validateBlueprintTextManuscript, type MissingBlueprintTail, type ParsedBlueprintMarkdown, type TextFirstValidationReport } from './blueprint-text';
import { normaliseProhibitedAssessmentAssurance } from './assurance-boundary-normalisation';
import { deriveTailOutputTokenLimit } from './report-blueprint';
import { emptyNarrativeRecoveryBudget } from './recovery-policy';
import { mergeWholeManuscriptRecoveryBudgets, reconcileWholeManuscript, WholeManuscriptReconciliationError } from './whole-manuscript-reconciliation';
import { buildManuscriptStructuralDiagnostics } from './manuscript-diagnostics';
import {
  buildSemanticReviewPolicyDiagnostics,
  semanticReviewEnvelopeSchema,
  reviewIdForCandidateIndex,
  validateSemanticReviewEnvelope,
  type SemanticReviewDiagnostics,
  type SemanticReviewDecision,
  type SemanticReviewExecutionContract,
  type SemanticReviewerInput,
  type SemanticReviewFailureCode,
  type SemanticReviewResult
} from './semantic-reviewer';
import {
  getNarrativeAttemptAccounting,
  extractNarrativeTokenUsage,
  runNarrativeProviderAttempts,
  type NarrativeProviderAttemptContext,
  type NarrativeProviderFailure,
  type NarrativeProviderAttemptResult,
  type NarrativeProviderStageAccounting
} from './provider-attempt-policy';

export const WHOLE_MANUSCRIPT_PROMPT_VERSION = 'mk-fraud-readiness-v1.1-whole-manuscript-blueprint-text-v1';
export const WHOLE_MANUSCRIPT_TIMEOUT_MS = 240_000;

/**
 * Mini's output usage includes reasoning tokens as well as the visible structured response. The
 * observed 45-block compact envelope is about 739 visible tokens, but a 3,000-token ceiling can
 * still stop Mini while it is reasoning. Start with 4,500 tokens and give the same Mini call a
 * bounded 6,000-token ceiling on retry; 6,000 is the hard cap for this logical stage.
 */
export const SEMANTIC_REVIEW_INITIAL_MAX_OUTPUT_TOKENS = 4_500;
export const SEMANTIC_REVIEW_MAX_OUTPUT_TOKENS = 6_000;

export function semanticReviewMaxOutputTokensForAttempt(modelAttempt: number): number {
  return modelAttempt <= 1 ? SEMANTIC_REVIEW_INITIAL_MAX_OUTPUT_TOKENS : SEMANTIC_REVIEW_MAX_OUTPUT_TOKENS;
}

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function sha(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function textValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }

function requireProvider(model = selectNarrativeModel().requestedModel): { model: string; provider: string } {
  if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
  return { model, provider: providerFromModel(model) };
}

function generationPrompt(input: WholeManuscriptWriterInput): string {
  const skeleton = buildBlueprintMarkdownSkeleton(input.blueprint);
  return [
    'Write the complete MK Fraud Readiness v1.1 advisory manuscript as Markdown.',
    '',
    'The deterministic Blueprint owns every chapter, section, subsection, order, analytical role, required fact, management takeaway and exhibit. Write only narrative beneath the existing headings in the exact skeleton below.',
    'Do not remove, rename, add or reorder headings. Do not emit a title, preamble, tables, bullets, numbering, code fences, IDs or metadata outside the skeleton. Do not repeat the executive judgement as a new opening in later chapters. Use connected professional prose with natural transitions. Separate diagnosis, evidence, exposure, target state, response, implementation and conclusion by their assigned Blueprint roles.',
    'Use only the deterministic Fact Pack and the permitted claim references assigned to each Blueprint section. Do not invent facts, scores, dates, owners, controls, scenarios, decisions, costs or assurance. Do not claim that MK, the assessment or the report independently verified operating effectiveness. Customer control design may describe what management should independently review or verify.',
    'Machine identifiers in the Blueprint and Fact Pack are routing metadata only. Never copy them into customer-facing prose; translate the underlying meaning into natural language.',
    // The validator rejects customer assertions the assessment never established. The
    // writer was never told about them, so it produced one and the manuscript failed
    // after a paid call. Both sides now state the same boundary.
    'CUSTOMER FACT BOUNDARY. Do not compare this organisation with peers, similar-sized organisations, industry averages, benchmarks, medians or percentiles unless an explicit deterministic benchmark fact is supplied. Do not infer or state employee or staff counts. Do not say or imply that knowledge or control responsibility sits with "one or two people", "a single employee" or any other invented concentration of people. Do not invent organisational structures, committees, executive titles or functions; use only those present in the permitted deterministic facts. Where a fact is not in the permitted deterministic material, express the management implication without inventing it.',
    '',
    `PROHIBITED CLAIMS: ${(input.context.boundaries?.prohibitedClaims ?? []).join('; ') || '(none supplied)'}`,
    'WRITE ONLY THE NARRATIVE UNDER THESE EXISTING HEADINGS.',
    '',
    'MARKDOWN SKELETON',
    skeleton.markdown,
    '',
    'DETERMINISTIC REPORT BLUEPRINT',
    JSON.stringify(input.blueprint),
    '',
    'PERMITTED DETERMINISTIC FACTS',
    JSON.stringify(input.context.permittedDeterministicFacts),
    '',
    'BOUNDARIES AND STYLE',
    JSON.stringify({ boundaries: input.context.boundaries, style: input.context.style })
  ].join('\n');
}

/**
 * Build the semantic request without compacting the evidence. The provider receives every
 * candidate field, including the full paragraph, original surrounding prose, candidate span,
 * detector metadata, claim references and complete permitted fact objects. Only the response
 * schema is intentionally compact.
 */
export function buildSemanticReviewRequestPayload(input: SemanticReviewerInput): {
  blocks: Array<Record<string, unknown>>;
} {
  const blocks = input.candidates.map((candidate, index) => ({
    reviewId: reviewIdForCandidateIndex(index),
    candidateId: candidate.candidateId,
    ruleCode: candidate.ruleCode,
    path: candidate.path,
    candidateSpan: candidate.candidateSpan,
    paragraph: candidate.paragraph,
    surroundingProse: candidate.surroundingProse,
    blueprintPath: candidate.blueprintPath,
    chapterTitle: candidate.chapterTitle,
    sectionTitle: candidate.sectionTitle,
    ...(candidate.subsectionTitle !== undefined ? { subsectionTitle: candidate.subsectionTitle } : {}),
    permittedClaimRefs: candidate.permittedClaimRefs,
    permittedFacts: candidate.permittedFacts,
    requiredManagementTakeaway: candidate.requiredManagementTakeaway,
    assuranceBoundary: candidate.assuranceBoundary,
    ...(candidate.warningSignals !== undefined ? { warningSignals: candidate.warningSignals } : {})
  }));
  return { blocks };
}

function semanticReviewPrompt(input: SemanticReviewerInput): string {
  return [
    'Review every provider-authored customer-visible narrative block in one bounded MK Fraud Readiness semantic grounding pass.',
    '',
    'Each input item is a full paragraph/block, not merely a lexical hit. Use the short reviewId (for example B01) in every decision; the application maps it back to the exact candidateId and Blueprint path. Return the typed semantic-review object with one decision for every reviewId and an envelope-level repair field.',
    'ALLOW means every customer-specific proposition in the block is semantically grounded by its permitted facts and remains inside the assurance boundary. Inspect structure, actors/teams, mechanisms, workflow/routing, sites, populations, sampling, frequency, capacity, ownership, control state, causality, comparisons, knowledge concentration and assurance language, not only the warning signals. REPAIR means the management implication is valid but the target prose overstates the evidence. REJECT means the proposition cannot be made true without changing deterministic meaning. HOLD means unresolved ambiguity.',
    'Use exactly one reasonCode from this closed vocabulary: grounded, unsupported_actor, unsupported_structure, unsupported_mechanism, unsupported_workflow, unsupported_location, unsupported_population, unsupported_frequency, unsupported_capacity, unsupported_ownership, unsupported_control_state, unsupported_causality, unsupported_comparison, unsupported_assurance, unsupported_operating_detail, evidence_conflict, unresolved_ambiguity, repairable_overstatement. Do not emit prose reasons. Set repair to null for zero REPAIR decisions. For exactly one REPAIR, put one bounded replacement paragraph in repair and identify its reviewId. If more than one block is truthfully REPAIR, set repair to null; the deterministic coordinator fails closed with multiple_semantic_repairs_required and no replacement is applied. Do not change scores, maturity, facts, claim references, headings, IDs, evidence, owners, dates, timeframes or report structure. Use only the complete permittedFacts attached to each block.',
    '',
    JSON.stringify(buildSemanticReviewRequestPayload(input), null, 2)
  ].join('\n');
}

const SEMANTIC_FAILURE_CODES = new Set<SemanticReviewFailureCode>([
  'semantic_provider_timeout',
  'semantic_provider_http',
  'semantic_provider_sdk',
  'semantic_structured_output_invalid',
  'semantic_output_contract_too_large',
  'semantic_deterministic_validation_failed',
  'semantic_candidate_count_mismatch',
  'semantic_unknown_candidate',
  'multiple_semantic_repairs_required',
  'semantic_reject',
  'semantic_hold',
  'semantic_repair_validation_failed',
  'semantic_review_provider_call_budget_exceeded',
  'semantic_review_failed'
]);

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function safeSemanticFailureCode(value: unknown): SemanticReviewFailureCode | undefined {
  return typeof value === 'string' && SEMANTIC_FAILURE_CODES.has(value as SemanticReviewFailureCode)
    ? value as SemanticReviewFailureCode
    : undefined;
}

function classifySemanticProviderFailure(error: unknown, response: any): SemanticReviewFailureCode {
  const record = recordValue(error);
  const explicit = safeSemanticFailureCode(record?.semanticReviewFailureCode);
  if (explicit) return explicit;
  const status = [record?.statusCode, record?.status, recordValue(record?.response)?.status]
    .find((value) => typeof value === 'number' && Number.isFinite(value)) as number | undefined;
  const message = `${record?.name ?? ''} ${record?.code ?? ''} ${record?.message ?? ''}`.toLowerCase();
  if (/abort|timeout|timed out|etimedout|headers_timeout|connect_timeout/.test(message)) return 'semantic_provider_timeout';
  if (/provider_call_budget_exhausted/.test(message)) return 'semantic_review_provider_call_budget_exceeded';
  if ((status !== undefined && status >= 400) || /http.?status|status.?4\d\d|status.?5\d\d/.test(message)) return 'semantic_provider_http';
  if (/schema|structured|noobject|no object|invalid.*(output|object)|object.*(invalid|missing)|parse/.test(message) || !response) {
    return 'semantic_structured_output_invalid';
  }
  return 'semantic_provider_sdk';
}

function responseFromError(error: unknown): any {
  return recordValue(error)?.providerResponse;
}

function responseFinishReason(response: any, error: unknown): string | undefined {
  const record = recordValue(error);
  return textValue(response?.finishReason)
    ?? textValue(response?.response?.finishReason)
    ?? textValue(record?.finishReason)
    ?? textValue(recordValue(record?.response)?.finishReason);
}

function technicalFailure(input: {
  classification: NarrativeProviderFailure['classification'];
  code: string;
  retryable: boolean;
  fallbackEligible: boolean;
  fallbackReason?: NarrativeProviderFailure['fallbackReason'];
}): NarrativeProviderFailure {
  return input;
}

export interface WholeManuscriptConformanceFailure {
  /** A bounded family, never the rejected paragraph or a provider response body. */
  conformanceFailureCode: 'structural' | 'raw_internal_id' | 'unsupported_numeric_claim';
  conformancePath: string;
  structuralErrorCodes?: string[];
  conformancePatternFamily: string;
  conformancePatternHash: string;
}

export type WholeManuscriptConformanceResult =
  | {
    ok: true;
    markdown: string;
    parsed: ParsedBlueprintMarkdown;
    validation: TextFirstValidationReport;
    assuranceNormalisations: number;
  }
  | {
    ok: false;
    markdown: string;
    parsed: ParsedBlueprintMarkdown;
    validation: TextFirstValidationReport;
    assuranceNormalisations: number;
    failure: WholeManuscriptConformanceFailure;
  };

/**
 * The manuscript attempt is not accepted at SDK success. It must first bind to the exact
 * Blueprint, pass the existing closed-set numeric normalisation and clear every deterministic
 * hard-truth issue. The returned diagnostics are deliberately limited to rule families and
 * paths; customer prose never crosses the attempt ledger.
 */
export function validateWholeManuscriptConformance(input: {
  markdown: string;
  blueprint: WholeManuscriptWriterInput['blueprint'];
  factPack: WholeManuscriptWriterInput['factPack'];
}): WholeManuscriptConformanceResult {
  const parsed = parseBlueprintMarkdown(input.markdown, input.blueprint);
  const assuranceNormalisations = normaliseProhibitedAssessmentAssurance(parsed);
  const validation = validateBlueprintTextManuscript(parsed, input.blueprint, input.factPack);
  const firstStructuralError = parsed.errors[0];
  const firstHardIssue = validation.hardTruth.issues[0];
  if (!parsed.ok || firstStructuralError) {
    const path = firstStructuralError?.path ?? 'headings';
    const structuralErrorCodes = [...new Set(parsed.errors.map((error) => error.code))];
    return {
      ok: false,
      markdown: parsed.markdown,
      parsed,
      validation,
      assuranceNormalisations,
      failure: {
        conformanceFailureCode: 'structural',
        conformancePath: path,
        ...(structuralErrorCodes.length ? { structuralErrorCodes } : {}),
        conformancePatternFamily: structuralErrorCodes[0] ?? 'structural',
        conformancePatternHash: sha({ conformanceFailureCode: 'structural', path, structuralErrorCodes })
      }
    };
  }
  if (firstHardIssue) {
    const code = firstHardIssue.code === 'raw_internal_id' || firstHardIssue.code === 'unsupported_numeric_claim'
      ? firstHardIssue.code
      : 'structural';
    return {
      ok: false,
      markdown: parsed.markdown,
      parsed,
      validation,
      assuranceNormalisations,
      failure: {
        conformanceFailureCode: code,
        conformancePath: firstHardIssue.path,
        conformancePatternFamily: code,
        conformancePatternHash: sha({ conformanceFailureCode: code, path: firstHardIssue.path })
      }
    };
  }
  return { ok: true, markdown: parsed.markdown, parsed, validation, assuranceNormalisations };
}

export function createManuscriptConformanceError(response: unknown, failure: WholeManuscriptConformanceFailure): Error {
  const error = new Error('manuscript_conformance_failed');
  (error as { providerResponse?: unknown }).providerResponse = response;
  (error as { narrativeProviderFailure?: NarrativeProviderFailure }).narrativeProviderFailure = {
    classification: 'retryable_technical',
    code: 'manuscript_conformance_failed',
    retryable: true,
    fallbackEligible: false
  };
  (error as { narrativeConformanceFailure?: WholeManuscriptConformanceFailure }).narrativeConformanceFailure = failure;
  return error;
}

export function classifyNarrativeProviderFailure(error: unknown, context: NarrativeProviderAttemptContext): NarrativeProviderFailure {
  const record = recordValue(error);
  const response = responseFromError(error);
  const explicit = recordValue(record?.narrativeProviderFailure);
  if (explicit && (explicit.classification === 'retryable_technical' || explicit.classification === 'fallback_technical' || explicit.classification === 'non_retryable') && typeof explicit.code === 'string') {
    return technicalFailure({
      classification: explicit.classification,
      code: explicit.code,
      retryable: explicit.retryable === true,
      fallbackEligible: explicit.fallbackEligible === true,
      ...(typeof explicit.fallbackReason === 'string' ? { fallbackReason: explicit.fallbackReason as NarrativeProviderFailure['fallbackReason'] } : {})
    });
  }
  const semanticCode = safeSemanticFailureCode(record?.semanticReviewFailureCode);
  if (context.logicalStage === 'semantic_review' && semanticCode === 'semantic_output_contract_too_large') {
    // A length stop is technical for Mini, but it is not fallback-eligible: the same compact
    // task gets the remaining Mini attempts with the deterministic larger ceiling first. If all
    // four Mini attempts stop on length, the runner fails closed with the full ledger attached.
    return technicalFailure({ classification: 'retryable_technical', code: semanticCode, retryable: true, fallbackEligible: false });
  }
  if (semanticCode === 'semantic_deterministic_validation_failed' || semanticCode === 'semantic_candidate_count_mismatch' || semanticCode === 'semantic_unknown_candidate' || semanticCode === 'multiple_semantic_repairs_required' || semanticCode === 'semantic_reject' || semanticCode === 'semantic_hold' || semanticCode === 'semantic_repair_validation_failed') {
    return technicalFailure({ classification: 'non_retryable', code: semanticCode, retryable: false, fallbackEligible: false });
  }
  const finishReason = responseFinishReason(response, error)?.toLowerCase();
  if (finishReason === 'length' || finishReason === 'max_output_tokens') {
    if (context.logicalStage === 'semantic_review') {
      return technicalFailure({ classification: 'retryable_technical', code: 'semantic_output_contract_too_large', retryable: true, fallbackEligible: false });
    }
    return technicalFailure({ classification: 'retryable_technical', code: 'manuscript_output_contract_too_large', retryable: true, fallbackEligible: false });
  }
  const status = [record?.statusCode, record?.status, recordValue(record?.response)?.status, recordValue(response?.response)?.status]
    .find((value) => typeof value === 'number' && Number.isFinite(value)) as number | undefined;
  const message = `${record?.name ?? ''} ${record?.code ?? ''} ${record?.message ?? ''}`.toLowerCase();
  if (/provider_call_budget_exhausted|attempt_budget_exhausted/.test(message)) {
    return technicalFailure({ classification: 'non_retryable', code: 'narrative_provider_attempt_budget_exhausted', retryable: false, fallbackEligible: false });
  }
  if ((status === 401 || status === 403 || status === 404) || /model.?not.?found|unknown.?model|unsupported.?model|capability.?not/.test(message)) {
    return technicalFailure({ classification: 'fallback_technical', code: 'provider_model_unavailable', retryable: false, fallbackEligible: true, fallbackReason: 'model_unavailable' });
  }
  if (status === 429 || (status !== undefined && status >= 500) || /429|rate.?limit|overloaded|temporar|service.?unavailable/.test(message)) {
    return technicalFailure({ classification: 'retryable_technical', code: 'provider_transient_http', retryable: true, fallbackEligible: true, fallbackReason: 'provider_outage' });
  }
  if (/abort|timeout|timed out|etimedout|headers_timeout|connect_timeout/.test(message)) {
    return technicalFailure({ classification: 'retryable_technical', code: 'provider_timeout', retryable: true, fallbackEligible: true, fallbackReason: 'provider_outage' });
  }
  if (/econnreset|econnrefused|enotfound|eai_again|socket|network|fetch failed/.test(message)) {
    return technicalFailure({ classification: 'retryable_technical', code: 'provider_network_transient', retryable: true, fallbackEligible: true, fallbackReason: 'model_transport_failure' });
  }
  if (semanticCode === 'semantic_structured_output_invalid' || /schema|structured|noobject|no object|invalid.*(output|object)|object.*(invalid|missing)|parse/.test(message)) {
    return technicalFailure({ classification: 'retryable_technical', code: 'structured_output_transport_failure', retryable: true, fallbackEligible: true, fallbackReason: 'capability_incompatibility' });
  }
  return technicalFailure({ classification: 'non_retryable', code: context.logicalStage === 'semantic_review' ? 'semantic_provider_sdk' : 'manuscript_provider_sdk', retryable: false, fallbackEligible: false });
}

function optionalCostMicros(response: any): number | undefined {
  const raw = response?.providerMetadata?.gateway?.cost;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000_000) : undefined;
}

function semanticReviewExecutionContract(provider: string, prompt: string, maxOutputTokens: number): SemanticReviewExecutionContract {
  return {
    sdkFunction: 'generateText',
    responseFormat: 'semantic-review-object',
    structuredOutput: true,
    schemaName: 'mk_fraud_readiness_semantic_review',
    promptBytes: Buffer.byteLength(prompt, 'utf8'),
    estimatedInputTokens: Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4),
    maxOutputTokens,
    timeoutMs: WHOLE_MANUSCRIPT_TIMEOUT_MS,
    providerOptions: { gateway: { only: [provider] } }
  };
}

function buildSemanticReviewDiagnostics(input: {
  reviewerInput: SemanticReviewerInput;
  decisions?: SemanticReviewDecision[];
  provider: string;
  model: string;
  startedAtMs: number;
  response?: any;
  dispatchOccurred: boolean;
  responseSchemaValid: boolean;
  failureCode?: SemanticReviewFailureCode;
  executionContract: SemanticReviewExecutionContract;
  providerCalls: number;
  stageAccounting?: NarrativeProviderStageAccounting;
}): SemanticReviewDiagnostics {
  const response = input.response;
  const tokenUsage = extractNarrativeTokenUsage(response);
  const endedAtMs = Date.now();
  const gateway = recordValue(response?.providerMetadata?.gateway);
  const responseRecord = recordValue(response?.response);
  const responseBody = recordValue(responseRecord?.body);
  const responseChoices = Array.isArray(responseBody?.choices) ? responseBody.choices : undefined;
  const firstChoice = responseChoices?.[0] ? recordValue(responseChoices[0]) : undefined;
  const finishReason = textValue(response?.finishReason) ?? textValue(responseRecord?.finishReason);
  const providerFinishReason = textValue(response?.providerMetadata?.gateway?.finishReason)
    ?? textValue(response?.providerMetadata?.openai?.finishReason)
    ?? textValue(firstChoice?.finish_reason)
    ?? textValue(recordValue(responseRecord?.headers)?.['x-provider-finish-reason']);
  const semanticPolicyDecisions = input.decisions
    ? buildSemanticReviewPolicyDiagnostics(input.reviewerInput, input.decisions)
    : [];
  return {
    provider: input.provider,
    model: input.model,
    dispatchOccurred: input.dispatchOccurred,
    startedAt: new Date(input.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    elapsedMs: Math.max(0, endedAtMs - input.startedAtMs),
    generationId: textValue(gateway?.generationId),
    responseId: textValue(responseRecord?.id) ?? textValue(response?.id),
    finishReason,
    providerFinishReason,
    inputTokens: input.stageAccounting?.inputTokens ?? tokenUsage.inputTokens,
    outputTokens: input.stageAccounting?.outputTokens ?? tokenUsage.outputTokens,
    reasoningTokens: input.stageAccounting?.reasoningTokens ?? tokenUsage.reasoningTokens,
    visibleOutputTokens: input.stageAccounting?.visibleOutputTokens ?? tokenUsage.visibleOutputTokens,
    totalTokens: input.stageAccounting?.totalTokens ?? tokenUsage.totalTokens,
    providerCostMicros: input.stageAccounting?.costMicros ?? optionalCostMicros(response),
    candidateCount: input.reviewerInput.candidates.length,
    blockCount: input.reviewerInput.candidates.length,
    responseSchemaValid: input.responseSchemaValid,
    providerCalls: input.providerCalls,
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
    ...(semanticPolicyDecisions.length > 0 ? { semanticPolicyDecisions } : {}),
    executionContract: input.executionContract,
    ...(input.stageAccounting ? {
      attemptRecords: input.stageAccounting.attemptRecords,
      totalMiniAttempts: input.stageAccounting.totalMiniAttempts,
      totalFallbackAttempts: input.stageAccounting.totalFallbackAttempts,
      totalPhysicalProviderRequests: input.stageAccounting.totalPhysicalProviderRequests
    } : {})
  };
}

function tailPrompt(input: WholeManuscriptTailInput, tail: MissingBlueprintTail): string {
  const skeleton = buildBlueprintMarkdownSkeleton(input.blueprint);
  return [
    'Complete only the missing tail of the MK Fraud Readiness v1.1 advisory manuscript as Markdown.',
    '',
    'This is a bounded technical truncation recovery. The existing manuscript is preserved. If the preceding context ends mid-sentence, complete only that interrupted sentence under the current final heading; then emit each missing deterministic heading exactly once, followed by its narrative. Do not rewrite, repeat or summarise any complete existing paragraph.',
    'Do not add, rename or reorder headings. Do not emit a title, preamble, tables, bullets, numbering, code fences, IDs or metadata. Use only the deterministic Fact Pack and permitted claim references. Do not invent facts, scores, dates, owners, controls, scenarios, decisions, costs or assurance.',
    'Machine identifiers in the Blueprint and Fact Pack are routing metadata only. Never copy them into customer-facing prose; translate the underlying meaning into natural language.',
    // The validator rejects customer assertions the assessment never established. The
    // writer was never told about them, so it produced one and the manuscript failed
    // after a paid call. Both sides now state the same boundary.
    'CUSTOMER FACT BOUNDARY. Do not compare this organisation with peers, similar-sized organisations, industry averages, benchmarks, medians or percentiles unless an explicit deterministic benchmark fact is supplied. Do not infer or state employee or staff counts. Do not say or imply that knowledge or control responsibility sits with "one or two people", "a single employee" or any other invented concentration of people. Do not invent organisational structures, committees, executive titles or functions; use only those present in the permitted deterministic facts. Where a fact is not in the permitted deterministic material, express the management implication without inventing it.',
    '',
    `LAST COMPLETE HEADING: ${input.lastCompleteHeading}`,
    `MISSING HEADINGS IN REQUIRED ORDER: ${JSON.stringify(tail.missingHeadings)}`,
    `EXACT BLUEPRINT CONTINUATION BOUNDARY: ${JSON.stringify(tail.boundary)}`,
    'When the boundary mode is next_heading, begin with the exact next Blueprint heading. When the boundary mode is complete_interrupted_prose_then_headings, complete only the interrupted sentence first and then emit the exact next Blueprint heading. The application rejects any other boundary, overlap or ordering.',
    '',
    'REQUIRED BLUEPRINT HEADING SKELETON',
    skeleton.markdown,
    '',
    'PRECEDING MANUSCRIPT CONTEXT',
    input.precedingContext,
    '',
    'DETERMINISTIC REPORT BLUEPRINT',
    JSON.stringify(input.blueprint),
    '',
    'PERMITTED DETERMINISTIC FACTS',
    JSON.stringify(input.context.permittedDeterministicFacts),
    '',
    'BOUNDARIES AND STYLE',
    JSON.stringify({ boundaries: input.context.boundaries, style: input.context.style })
  ].join('\n');
}

function metadata(input: { context: WholeManuscriptWriterInput['context']; blueprint: WholeManuscriptWriterInput['blueprint']; factPack?: unknown }, provider: string, model: string, response: any, prompt: string, maxOutputTokens: number, recovery: WholeManuscriptWriterMetadata['recovery'], architecture: WholeManuscriptWriterMetadata['architecture'] = 'whole-manuscript'): WholeManuscriptWriterMetadata {
  const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
  const tokenUsage = extractNarrativeTokenUsage(response);
  const inputTokens = tokenUsage.inputTokens;
  const outputTokens = tokenUsage.outputTokens;
  const totalTokens = tokenUsage.totalTokens;
  const rawGatewayCost = response.providerMetadata?.gateway?.cost;
  const providerCostMicros = identity?.gatewayCostMicros;
  const finishReason = textValue(response.finishReason) ?? textValue(response.response?.finishReason);
  const providerFinishReason = textValue(response.providerMetadata?.gateway?.finishReason)
    ?? textValue(response.providerMetadata?.openai?.finishReason)
    ?? textValue(response.response?.body?.choices?.[0]?.finish_reason)
    ?? textValue(response.response?.headers?.['x-provider-finish-reason']);
  return {
    contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
    architecture,
    provider,
    model,
    promptVersion: WHOLE_MANUSCRIPT_PROMPT_VERSION,
    generationMode: 'ai',
    generatedAt: new Date().toISOString(),
    generationId: identity?.identity.generationId,
    responseId: typeof response.response?.id === 'string' ? response.response.id : undefined,
    inputFactPackSha256: sha(input.factPack ?? input.context.permittedDeterministicFacts),
    inputStoryPlanSha256: sha(input.blueprint),
    inputBlueprintSha256: sha(input.blueprint),
    inputTokens,
    outputTokens,
    reasoningTokens: tokenUsage.reasoningTokens,
    visibleOutputTokens: tokenUsage.visibleOutputTokens,
    totalTokens,
    providerCostMicros,
    providerCostRaw: typeof rawGatewayCost === 'string' || typeof rawGatewayCost === 'number' ? rawGatewayCost : undefined,
    finishReason,
    providerFinishReason,
    executionContract: {
      sdkFunction: 'generateText',
      responseFormat: 'markdown-text',
      structuredOutput: false,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      estimatedInputTokens: Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4),
      maxOutputTokens,
      timeoutMs: WHOLE_MANUSCRIPT_TIMEOUT_MS,
      providerOptions: { gateway: { only: [provider] } }
    },
    recovery
  };
}

export class V11WholeManuscriptWriter implements WholeManuscriptWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion = WHOLE_MANUSCRIPT_PROMPT_VERSION;

  /**
   * Optional ceiling on provider requests for one Essential composition.
   *
   * The default is two logical stages multiplied by the seven physical-attempt ceiling: four
   * total Mini requests followed, only for authorised technical/capability failures, by one
   * request on each ordered fallback model. Tail completion, regeneration and coherence remain
   * outside the acceptance path. Exceeding the ceiling fails closed.
   */
  private readonly providerCallBudget: number;
  private readonly allowTailRecovery: boolean;
  private providerCallsUsed = 0;
  private readonly stageAccountings = new Map<'manuscript' | 'semantic_review', NarrativeProviderStageAccounting>();

  readonly modelSelection: NarrativeModelSelection;

  constructor(model = selectNarrativeModel().requestedModel, options: { providerCallBudget?: number; allowTailRecovery?: boolean; modelSelection?: NarrativeModelSelection } = {}) {
    const modelSelection = options.modelSelection ?? selectNarrativeModelForRequestedModel(model);
    const resolved = requireProvider(modelSelection.requestedModel);
    this.modelSelection = modelSelection;
    this.provider = resolved.provider;
    this.model = resolved.model;
    this.providerCallBudget = options.providerCallBudget ?? MAX_PROVIDER_ATTEMPTS_PER_STAGE * 2;
    this.allowTailRecovery = options.allowTailRecovery ?? true;
  }

  /** Charged immediately before every provider request. */
  private chargeProviderCall(kind: string): void {
    if (this.providerCallsUsed >= this.providerCallBudget) {
      const error = new Error(`provider_call_budget_exhausted: ${kind} would exceed the ${this.providerCallBudget}-call ceiling for this generation.`);
      (error as { code?: string; narrativeProviderRequestDispatched?: boolean }).code = 'provider_call_budget_exhausted';
      (error as { narrativeProviderRequestDispatched?: boolean }).narrativeProviderRequestDispatched = false;
      throw error;
    }
    this.providerCallsUsed += 1;
  }

  private rememberStageAccounting(accounting: NarrativeProviderStageAccounting): void {
    this.stageAccountings.set(accounting.logicalStage, accounting);
  }

  private allAttemptRecords(): NarrativeProviderStageAccounting['attemptRecords'] {
    return [...this.stageAccountings.values()].flatMap((accounting) => accounting.attemptRecords);
  }

  private totalAttemptCostMicros(): number {
    return [...this.stageAccountings.values()].reduce((total, accounting) => total + accounting.costMicros, 0);
  }

  private async runStage<T>(logicalStage: 'manuscript' | 'semantic_review', execute: (context: NarrativeProviderAttemptContext) => Promise<{ value: T; response?: unknown }>): Promise<NarrativeProviderAttemptResult<T>> {
    try {
      const result = await runNarrativeProviderAttempts({
        logicalStage,
        modelSelection: this.modelSelection,
        execute: async (context) => {
          this.chargeProviderCall(`${logicalStage}:${context.attempt}`);
          return execute(context);
        },
        classifyFailure: classifyNarrativeProviderFailure
      });
      this.rememberStageAccounting(result.accounting);
      return result;
    } catch (error) {
      const accounting = getNarrativeAttemptAccounting(error);
      if (accounting) this.rememberStageAccounting(accounting);
      throw error;
    }
  }

  async writeManuscript(input: WholeManuscriptWriterInput): Promise<WholeManuscriptTextResult> {
    if (!input.context.singleCallFeasible && input.context.partitionPlan.length < 2) throw new Error('Whole-manuscript context is over the approved limit without a coherent partition plan.');
    const prompt = generationPrompt(input);
    const stage = await this.runStage('manuscript', async (attempt) => {
      const response = await generateText({
        model: attempt.model,
        system: 'You are the constrained MK Fraud Readiness v1.1 whole-manuscript advisory writer. The deterministic Blueprint decides the report. Return plain Markdown text only. The application will parse and bind every heading deterministically after generation.',
        prompt,
        maxOutputTokens: input.context.outputBudget.hardOutputTokenLimit,
        maxRetries: 0,
        providerOptions: { gateway: { only: [attempt.provider] } },
        abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
      });
      if (responseFinishReason(response, undefined) === 'length' || responseFinishReason(response, undefined) === 'max_output_tokens') {
        const error = new Error('provider_output_contract_too_large');
        (error as { providerResponse?: unknown }).providerResponse = response;
        throw error;
      }
      const markdown = String(response.text ?? '').trim();
      const conformance = validateWholeManuscriptConformance({ markdown, blueprint: input.blueprint, factPack: input.factPack });
      if (!conformance.ok) throw createManuscriptConformanceError(response, conformance.failure);
      return { value: { markdown: conformance.markdown, response }, response };
    });
    const response = stage.response as any;
    const markdown = stage.value.markdown;
    if (!markdown) throw new Error('Whole-manuscript text generation returned empty Markdown.');
    const initialResult: WholeManuscriptTextResult = {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript',
      markdown,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, stage.provider, stage.model, response, prompt, input.context.outputBudget.hardOutputTokenLimit, { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, technicalFallbackCount: stage.accounting.totalFallbackAttempts, totalCalls: stage.accounting.totalPhysicalProviderRequests, totalTokens: stage.accounting.totalTokens ?? 0, totalProviderCostMicros: stage.accounting.costMicros })
    };
    initialResult.writerMetadata.requestedModel = this.modelSelection.requestedModel;
    initialResult.writerMetadata.primaryModel = this.modelSelection.primaryModel;
    initialResult.writerMetadata.modelSelectionSource = this.modelSelection.selectionSource;
    initialResult.writerMetadata.configuredModelOverride = this.modelSelection.configuredOverride;
    initialResult.writerMetadata.modelOverrideRejected = this.modelSelection.overrideRejectedReason;
    initialResult.writerMetadata.providerAttemptRecords = this.allAttemptRecords();
    initialResult.writerMetadata.totalMiniAttempts = stage.accounting.totalMiniAttempts;
    initialResult.writerMetadata.totalFallbackAttempts = stage.accounting.totalFallbackAttempts;
    initialResult.writerMetadata.totalPhysicalProviderRequests = stage.accounting.totalPhysicalProviderRequests;
    initialResult.writerMetadata.totalGenerationCostMicros = this.totalAttemptCostMicros();
    initialResult.writerMetadata.manuscriptProviderCalls = stage.accounting.totalPhysicalProviderRequests;
    initialResult.writerMetadata.semanticReviewProviderCalls = 0;
    initialResult.writerMetadata.totalProviderCalls = stage.accounting.totalPhysicalProviderRequests;
    // The accepted response may be Mini attempt 2/3/4. Expose the logical manuscript stage
    // totals, not only the final response's usage, so every paid physical request remains visible
    // in both the attempt ledger and the manuscript-level accounting fields.
    initialResult.writerMetadata.inputTokens = stage.accounting.inputTokens ?? initialResult.writerMetadata.inputTokens;
    initialResult.writerMetadata.outputTokens = stage.accounting.outputTokens ?? initialResult.writerMetadata.outputTokens;
    initialResult.writerMetadata.reasoningTokens = stage.accounting.reasoningTokens ?? initialResult.writerMetadata.reasoningTokens;
    initialResult.writerMetadata.visibleOutputTokens = stage.accounting.visibleOutputTokens ?? initialResult.writerMetadata.visibleOutputTokens;
    initialResult.writerMetadata.totalTokens = stage.accounting.totalTokens ?? initialResult.writerMetadata.totalTokens;
    initialResult.writerMetadata.providerCostMicros = stage.accounting.costMicros;
    initialResult.writerMetadata.manuscriptInputTokens = initialResult.writerMetadata.inputTokens;
    initialResult.writerMetadata.manuscriptOutputTokens = initialResult.writerMetadata.outputTokens;
    initialResult.writerMetadata.manuscriptReasoningTokens = initialResult.writerMetadata.reasoningTokens;
    initialResult.writerMetadata.manuscriptVisibleOutputTokens = initialResult.writerMetadata.visibleOutputTokens;
    initialResult.writerMetadata.manuscriptTotalTokens = initialResult.writerMetadata.totalTokens;
    initialResult.writerMetadata.manuscriptProviderCostMicros = initialResult.writerMetadata.providerCostMicros;
    const initialParsed = parseBlueprintMarkdown(initialResult.markdown, input.blueprint);
    // The logical manuscript attempt has already passed the deterministic pre-semantic contract
    // inside runStage. Keep the defensive structural branch for legacy recovery callers, but a
    // provider response with a structural or hard-truth defect can no longer reach this point.
    if (initialParsed.ok) return initialResult;

    const missing = deriveMissingBlueprintTail(initialResult.markdown, input.blueprint);
    const initialOutcome = classifyWholeManuscriptGeneration({
      finishReason: initialResult.writerMetadata.finishReason,
      providerFinishReason: initialResult.writerMetadata.providerFinishReason,
      outputTokens: initialResult.writerMetadata.outputTokens,
      maxOutputTokens: initialResult.writerMetadata.executionContract?.maxOutputTokens,
      missingHeadingCount: missing.missingHeadings.length
    });
    if (initialOutcome !== 'TECHNICAL_TRUNCATION' || !missing.ok) {
      // This is the exact path a non-conforming but complete manuscript takes, and it is
      // where the evidence has to be captured: the caller never receives initialResult,
      // so anything not attached here is lost with the throw -- which is how a paid
      // generation failed leaving no record of which heading disagreed.
      const failure = new WholeManuscriptReconciliationError('initial_manuscript_not_recoverable', 'Initial whole-manuscript generation did not produce a valid complete manuscript or a proven technical-truncation prefix.', { outcome: initialOutcome, parsed: initialParsed.errors, missing: missing.errors });
      (failure as { writerDiagnostics?: unknown }).writerDiagnostics = {
        stage: 'initial_manuscript_not_recoverable',
        writerMetadata: initialResult.writerMetadata,
        classification: initialOutcome,
        missingTail: { ok: missing.ok, missingHeadingCount: missing.missingHeadings.length, lastCompleteHeading: missing.lastCompleteHeading, errors: missing.errors },
        providerCalls: this.providerCallsUsed,
        structural: buildManuscriptStructuralDiagnostics({ markdown: initialResult.markdown, blueprint: input.blueprint, parsed: initialParsed })
      };
      throw failure;
    }
    if (!this.allowTailRecovery) {
      const failure = new WholeManuscriptReconciliationError(
        'acceptance_recovery_disabled',
        'Acceptance mode does not dispatch tail completion, regeneration or coherence recovery after the manuscript request.',
        { outcome: initialOutcome, missing: missing.errors }
      );
      (failure as { writerDiagnostics?: unknown }).writerDiagnostics = {
        stage: 'acceptance_recovery_disabled',
        writerMetadata: initialResult.writerMetadata,
        classification: initialOutcome,
        missingTail: { ok: missing.ok, missingHeadingCount: missing.missingHeadings.length, lastCompleteHeading: missing.lastCompleteHeading, errors: missing.errors },
        providerCalls: this.providerCallsUsed,
        structural: buildManuscriptStructuralDiagnostics({ markdown: initialResult.markdown, blueprint: input.blueprint, parsed: initialParsed })
      };
      throw failure;
    }
    const tailResult = await this.completeTail({
      context: input.context,
      blueprint: input.blueprint,
      previousMarkdown: initialResult.markdown,
      missingHeadings: missing.missingHeadings,
      lastCompleteHeading: missing.lastCompleteHeading,
      precedingContext: missing.precedingContext,
      boundary: missing.boundary
    });
    const reconciled = reconcileWholeManuscript({
      initialMarkdown: initialResult.markdown,
      continuationMarkdown: tailResult.continuationMarkdown,
      blueprint: input.blueprint,
      factPack: input.factPack,
      initialOutputTokens: initialResult.writerMetadata.outputTokens,
      initialMaxOutputTokens: initialResult.writerMetadata.executionContract?.maxOutputTokens,
      initialFinishReason: initialResult.writerMetadata.finishReason,
      initialProviderFinishReason: initialResult.writerMetadata.providerFinishReason
    });
    const initialMeta = initialResult.writerMetadata;
    const tailMeta = tailResult.writerMetadata;
    return {
      ...initialResult,
      markdown: reconciled.markdown,
      writerMetadata: {
        ...initialMeta,
        generatedAt: tailMeta.generatedAt,
        generationId: tailMeta.generationId ?? initialMeta.generationId,
        responseId: tailMeta.responseId ?? initialMeta.responseId,
        inputTokens: sumOptional(initialMeta.inputTokens, tailMeta.inputTokens),
        outputTokens: sumOptional(initialMeta.outputTokens, tailMeta.outputTokens),
        totalTokens: sumOptional(initialMeta.totalTokens, tailMeta.totalTokens),
        providerCostMicros: sumOptional(initialMeta.providerCostMicros, tailMeta.providerCostMicros),
        providerCostRaw: sumRawCosts(initialMeta.providerCostRaw, tailMeta.providerCostRaw),
        finishReason: tailMeta.finishReason ?? initialMeta.finishReason,
        providerFinishReason: tailMeta.providerFinishReason ?? initialMeta.providerFinishReason,
        recovery: mergeWholeManuscriptRecoveryBudgets(initialMeta.recovery, tailMeta.recovery)
      }
    };
  }

  async completeTail(input: WholeManuscriptTailInput): Promise<WholeManuscriptTailResult> {
    const tail = deriveMissingBlueprintTail(input.previousMarkdown, input.blueprint);
    if (!tail.ok || !tail.missingHeadings.length) throw new Error(`Tail completion requires a deterministic missing suffix: ${tail.errors.join(' | ')}`);
    const prompt = tailPrompt(input, tail);
    const maxOutputTokens = deriveTailOutputTokenLimit(input.context.outputBudget, tail.missingHeadings.length);
    this.chargeProviderCall('tail');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 tail-completion writer. The deterministic Blueprint decides the report. Return only the missing Markdown tail; never rewrite existing content.',
      prompt,
      maxOutputTokens,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const markdown = String(response.text ?? '').trim();
    if (!markdown) throw new Error('Whole-manuscript tail completion returned empty Markdown.');
    const appended = appendBlueprintTail(input.previousMarkdown, markdown, input.blueprint);
    const totalTokens = numeric(response.usage?.totalTokens) ?? 0;
    return {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript-tail-completion',
      markdown: appended,
      continuationMarkdown: markdown,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt, maxOutputTokens, { ...emptyNarrativeRecoveryBudget(), truncationContinuationCount: 1, totalCalls: 1, totalTokens, totalProviderCostMicros: parseCostMicros(response) })
    };
  }

  async repairBlock(input: WholeManuscriptRepairInput): Promise<WholeManuscriptRepairResult> {
    const permittedFacts = input.permittedFacts.map((fact) => ({ id: fact.id, kind: fact.kind, value: fact.value }));
    const prompt = [
      'Repair one bounded customer-facing prose block in an MK Fraud Readiness v1.1 manuscript.',
      '',
      'This is a targeted semantic correction, not a report regeneration. Return only the replacement prose for the target block. Do not return a heading, bullets, labels, IDs, claim references, metadata, commentary or code fences.',
      'Preserve the deterministic meaning exactly. Do not change any score, maturity, finding, scenario, control, owner, timing, decision, roadmap, fact or Blueprint hierarchy.',
      'The assurance boundary remains strict: do not imply that MK, the assessment, the report or any external reviewer independently verified evidence or operating effectiveness. Customer-owned control design may describe what management should independently review or verify.',
      '',
      `REPAIR SCOPE: ${input.scope}`,
      `FAILING PATH: ${input.failingPath}`,
      `VALIDATION CODE: ${input.validationCode}`,
      `MATCHED PHRASE: ${input.matchedPhrase ?? '(not exposed)'}`,
      `TARGET BLOCK:\n${input.targetText}`,
      `IMMEDIATELY RELEVANT CONTEXT:\n${input.surroundingProse}`,
      `PERMITTED FACTS:\n${JSON.stringify(permittedFacts)}`,
      `PERMITTED CLAIM REFS: ${JSON.stringify(input.permittedClaimRefs)}`,
      `REQUIRED MANAGEMENT TAKEAWAY: ${input.requiredManagementTakeaway}`,
      `ASSURANCE BOUNDARY: ${input.assuranceBoundary}`
    ].join('\n');
    this.chargeProviderCall('repair');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 targeted semantic repair writer. Return only safe replacement prose for the bounded block.',
      prompt,
      maxOutputTokens: 900,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const repairedText = String(response.text ?? '').trim();
    if (!repairedText) throw new Error('Targeted semantic repair returned empty prose.');
    return {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript-targeted-repair',
      repairedText,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt, 900, { ...emptyNarrativeRecoveryBudget(), targetedRepairCount: 1, totalCalls: 1, totalTokens: numeric(response.usage?.totalTokens) ?? 0, totalProviderCostMicros: parseCostMicros(response) }, 'whole-manuscript-targeted-repair')
    };
  }

  /**
   * One small provider request adjudicates every semantic candidate and, when necessary, returns
   * one bounded replacement. It deliberately shares the writer's call budget so the production
   * path can account for manuscript + semantic review exactly.
   */
  async reviewSemanticCandidates(input: SemanticReviewerInput): Promise<SemanticReviewResult> {
    const prompt = semanticReviewPrompt(input);
    // The provider only returns compact identity/disposition/reason-code decisions plus one
    // bounded replacement envelope. The full grounding input remains in the prompt. Mini's
    // reasoning tokens share the output ceiling, so the first attempt starts at 4,500 and a
    // length retry deterministically increases to the fixed 6,000-token hard maximum.
    const initialMaxOutputTokens = semanticReviewMaxOutputTokensForAttempt(1);
    const startedAtMs = Date.now();
    try {
      const stage = await this.runStage('semantic_review', async (attempt) => {
        const maxOutputTokens = semanticReviewMaxOutputTokensForAttempt(attempt.modelAttempt);
        // The shared attempt ledger records the exact ceiling used for each physical request.
        attempt.maxOutputTokens = maxOutputTokens;
        const response = await generateText({
          model: attempt.model,
          system: 'You are the constrained MK Fraud Readiness semantic reviewer. Return only the typed semantic-review object required by the structured output schema.',
          prompt,
          output: Output.object({ schema: semanticReviewEnvelopeSchema, name: 'mk_fraud_readiness_semantic_review' }),
          maxOutputTokens,
          maxRetries: 0,
          providerOptions: { gateway: { only: [attempt.provider] } },
          abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
        });
        if (responseFinishReason(response, undefined) === 'length' || responseFinishReason(response, undefined) === 'max_output_tokens') {
          const error = new Error('semantic_output_contract_too_large');
          (error as { providerResponse?: unknown; semanticReviewFailureCode?: SemanticReviewFailureCode }).providerResponse = response;
          (error as { semanticReviewFailureCode?: SemanticReviewFailureCode }).semanticReviewFailureCode = 'semantic_output_contract_too_large';
          throw error;
        }
        let envelope;
        try {
          envelope = semanticReviewEnvelopeSchema.parse(response.output);
        } catch (error) {
          const failure = error instanceof Error ? error : new Error('semantic structured output was invalid');
          (failure as { providerResponse?: unknown; semanticReviewFailureCode?: SemanticReviewFailureCode }).providerResponse = response;
          (failure as { semanticReviewFailureCode?: SemanticReviewFailureCode }).semanticReviewFailureCode = 'semantic_structured_output_invalid';
          throw failure;
        }
        let checked: SemanticReviewResult;
        try {
          checked = validateSemanticReviewEnvelope(input, envelope);
        } catch (error) {
          const failure = error instanceof Error ? error : new Error('semantic envelope validation failed');
          (failure as { providerResponse?: unknown }).providerResponse = response;
          throw failure;
        }
        return { value: checked, response };
      });
      const response = stage.response as any;
      const maxOutputTokens = stage.accounting.attemptRecords.at(-1)?.maxOutputTokens ?? initialMaxOutputTokens;
      const executionContract = semanticReviewExecutionContract(stage.provider, prompt, maxOutputTokens);
      const diagnostics = buildSemanticReviewDiagnostics({
        reviewerInput: input,
        decisions: stage.value.decisions,
        provider: stage.provider,
        model: stage.model,
        startedAtMs,
        response,
        dispatchOccurred: stage.accounting.totalPhysicalProviderRequests > 0,
        responseSchemaValid: true,
        executionContract,
        providerCalls: stage.accounting.totalPhysicalProviderRequests,
        stageAccounting: stage.accounting
      });
      return {
        ...stage.value,
        accounting: {
          providerCalls: stage.accounting.totalPhysicalProviderRequests,
          inputTokens: stage.accounting.inputTokens,
          outputTokens: stage.accounting.outputTokens,
          reasoningTokens: stage.accounting.reasoningTokens,
          visibleOutputTokens: stage.accounting.visibleOutputTokens,
          totalTokens: stage.accounting.totalTokens,
          providerCostMicros: stage.accounting.costMicros,
          repairCount: stage.value.decisions.filter((decision) => decision.disposition === 'REPAIR').length,
          candidateCount: stage.value.decisions.length,
          allowCount: stage.value.decisions.filter((decision) => decision.disposition === 'ALLOW').length,
          rejectCount: stage.value.decisions.filter((decision) => decision.disposition === 'REJECT').length,
          holdCount: stage.value.decisions.filter((decision) => decision.disposition === 'HOLD').length,
          diagnostics,
          executionContract,
          attemptAccounting: stage.accounting
        }
      };
    } catch (error) {
      const attemptAccounting = getNarrativeAttemptAccounting(error);
      const lastAttempt = attemptAccounting?.attemptRecords.at(-1);
      const response = responseFromError(error);
      const failureCode = classifySemanticProviderFailure(error, response);
      const provider = lastAttempt?.provider ?? this.provider;
      const model = lastAttempt?.model ?? this.model;
      const maxOutputTokens = lastAttempt?.maxOutputTokens ?? initialMaxOutputTokens;
      const executionContract = semanticReviewExecutionContract(provider, prompt, maxOutputTokens);
      const diagnostics = buildSemanticReviewDiagnostics({
        reviewerInput: input,
        provider,
        model,
        startedAtMs,
        response,
        dispatchOccurred: Boolean(attemptAccounting?.totalPhysicalProviderRequests),
        responseSchemaValid: ['semantic_deterministic_validation_failed', 'semantic_candidate_count_mismatch', 'semantic_unknown_candidate'].includes(failureCode ?? ''),
        failureCode,
        executionContract,
        providerCalls: attemptAccounting?.totalPhysicalProviderRequests ?? 0,
        stageAccounting: attemptAccounting
      });
      (error as { semanticReviewerDiagnostics?: SemanticReviewDiagnostics }).semanticReviewerDiagnostics = diagnostics;
      throw error;
    }
  }

  async coherencePass(input: WholeManuscriptCoherenceInput): Promise<WholeManuscriptCoherenceResult> {
    const prompt = [
      'Perform one bounded editorial coherence pass over this complete MK Fraud Readiness v1.1 manuscript.',
      '',
      'Return the complete Markdown manuscript with every existing Blueprint heading in the exact same order. Preserve every heading and every deterministic fact. Smooth transitions, remove only genuine repetition and improve connected professional rhythm. Do not add analytical content, identifiers, tables, bullets, metadata or assurance claims.',
      'Do not claim that MK, the assessment, the report or any reviewer independently verified evidence or operating effectiveness.',
      ...(input.editorialBrief ? ['', 'OWNER-DIRECTED EDITORIAL BRIEF', input.editorialBrief] : []),
      '',
      'BLUEPRINT',
      JSON.stringify(input.blueprint),
      '',
      'CURRENT MANUSCRIPT',
      input.previousMarkdown
    ].join('\n');
    this.chargeProviderCall('coherence');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 coherence editor. Return only the complete Markdown manuscript.',
      prompt,
      maxOutputTokens: input.context.outputBudget.hardOutputTokenLimit,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const markdown = String(response.text ?? '').trim();
    if (!markdown) throw new Error('Whole-manuscript coherence pass returned empty Markdown.');
    return {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript-coherence',
      markdown,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt, input.context.outputBudget.hardOutputTokenLimit, { ...emptyNarrativeRecoveryBudget(), coherenceCount: 1, totalCalls: 1, totalTokens: numeric(response.usage?.totalTokens) ?? 0, totalProviderCostMicros: parseCostMicros(response) }, 'whole-manuscript-coherence')
    };
  }
}

function sumOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function sumRawCosts(a: string | number | undefined, b: string | number | undefined): string | number | undefined {
  if (a === undefined && b === undefined) return undefined;
  const left = typeof a === 'number' ? a : Number(a ?? 0);
  const right = typeof b === 'number' ? b : Number(b ?? 0);
  if (Number.isFinite(left) && Number.isFinite(right)) return left + right;
  return [a, b].filter((value) => value !== undefined).join(' + ');
}

function parseCostMicros(response: any): number {
  const raw = response.providerMetadata?.gateway?.cost;
  const numericCost = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(numericCost) ? Math.round(numericCost * 1_000_000) : 0;
}

export function createV11WholeManuscriptWriter(model = selectNarrativeModel().requestedModel, options: { providerCallBudget?: number; allowTailRecovery?: boolean; modelSelection?: NarrativeModelSelection } = {}): WholeManuscriptWriter {
  return new V11WholeManuscriptWriter(model, options);
}

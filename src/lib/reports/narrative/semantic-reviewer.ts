import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeProviderAttemptRecord, NarrativeProviderStageAccounting } from './provider-attempt-policy';
import { z } from 'zod';

export type SemanticReviewDisposition = 'ALLOW' | 'REPAIR' | 'REJECT' | 'HOLD';

export type SemanticReviewFailureCode =
  | 'semantic_provider_timeout'
  | 'semantic_provider_http'
  | 'semantic_provider_sdk'
  | 'semantic_structured_output_invalid'
  | 'semantic_output_contract_too_large'
  | 'semantic_deterministic_validation_failed'
  | 'semantic_candidate_count_mismatch'
  | 'semantic_unknown_candidate'
  | 'multiple_semantic_repairs_required'
  | 'semantic_reject'
  | 'semantic_hold'
  | 'semantic_repair_validation_failed'
  | 'semantic_review_provider_call_budget_exceeded'
  | 'semantic_review_failed';

export interface SemanticReviewWarning {
  code: string;
  matchedSpan?: string;
  message?: string;
}

export interface SemanticReviewCandidateInput {
  candidateId: string;
  ruleCode: string;
  path: string;
  candidateSpan: string;
  paragraph: string;
  surroundingProse: string;
  blueprintPath: string;
  chapterTitle: string;
  sectionTitle: string;
  subsectionTitle?: string;
  permittedClaimRefs: string[];
  permittedFacts: NarrativeFactPack['facts'];
  requiredManagementTakeaway: string;
  assuranceBoundary: string;
  /** Deterministic detector signals are context for review, never a gate to review. */
  warningSignals?: SemanticReviewWarning[];
}

export interface SemanticReviewerInput {
  candidates: SemanticReviewCandidateInput[];
}

export interface SemanticReviewDecision {
  candidateId: string;
  disposition: SemanticReviewDisposition;
  reasonCode: string;
  replacementProse?: string;
}

export interface SemanticReviewRepair {
  candidateId: string;
  replacementProse: string;
}

export interface SemanticReviewAccounting {
  providerCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  repairCount: number;
  candidateCount?: number;
  allowCount?: number;
  rejectCount?: number;
  holdCount?: number;
  diagnostics?: SemanticReviewDiagnostics;
  executionContract?: SemanticReviewExecutionContract;
  attemptAccounting?: NarrativeProviderStageAccounting;
}

export interface SemanticReviewExecutionContract {
  sdkFunction: 'generateText';
  responseFormat: 'semantic-review-object';
  structuredOutput: true;
  schemaName: 'mk_fraud_readiness_semantic_review';
  promptBytes: number;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  providerOptions: Record<string, unknown>;
}

export interface SemanticReviewDiagnostics {
  provider?: string;
  model?: string;
  dispatchOccurred: boolean;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  generationId?: string;
  responseId?: string;
  finishReason?: string;
  providerFinishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  candidateCount: number;
  blockCount: number;
  responseSchemaValid: boolean;
  providerCalls: number;
  failureCode?: SemanticReviewFailureCode;
  executionContract?: SemanticReviewExecutionContract;
  attemptRecords?: NarrativeProviderAttemptRecord[];
  totalMiniAttempts?: number;
  totalFallbackAttempts?: number;
  totalPhysicalProviderRequests?: number;
}

export interface SemanticReviewResult {
  decisions: SemanticReviewDecision[];
  repair?: SemanticReviewRepair | null;
  accounting?: SemanticReviewAccounting;
}

export interface EssentialSemanticReviewer {
  review(input: SemanticReviewerInput): Promise<SemanticReviewResult>;
}

const DISPOSITIONS: readonly SemanticReviewDisposition[] = ['ALLOW', 'REPAIR', 'REJECT', 'HOLD'];

const boundedReviewId = z.string().trim().regex(/^B\d{2,4}$/);
const boundedReasonCode = z.string().trim().regex(/^[a-z0-9][a-z0-9_]{0,47}$/);
const boundedReplacement = z.string().trim().min(1).max(2400);

const semanticDecisionBase = {
  reviewId: boundedReviewId,
  reasonCode: boundedReasonCode
};

const semanticRepairSchema = z.object({
  reviewId: boundedReviewId,
  replacementProse: boundedReplacement
}).strict();

/** Provider-facing compact object schema. Full candidate identity is mapped deterministically by the application. */
export const semanticReviewDecisionSchema = z.discriminatedUnion('disposition', [
  z.object({ ...semanticDecisionBase, disposition: z.literal('ALLOW') }).strict(),
  z.object({ ...semanticDecisionBase, disposition: z.literal('REPAIR') }).strict(),
  z.object({ ...semanticDecisionBase, disposition: z.literal('REJECT') }).strict(),
  z.object({ ...semanticDecisionBase, disposition: z.literal('HOLD') }).strict()
]);

export const semanticReviewEnvelopeSchema = z.object({
  decisions: z.array(semanticReviewDecisionSchema).min(1),
  repair: semanticRepairSchema.nullable()
}).strict();

export type SemanticReviewEnvelope = z.infer<typeof semanticReviewEnvelopeSchema>;

function invalid(message: string, failureCode: SemanticReviewFailureCode = 'semantic_structured_output_invalid'): Error {
  const error = new Error(`semantic_review_invalid_response: ${message}`);
  (error as { code?: string; semanticReviewFailureCode?: SemanticReviewFailureCode }).code = 'semantic_review_invalid_response';
  (error as { semanticReviewFailureCode?: SemanticReviewFailureCode }).semanticReviewFailureCode = failureCode;
  return error;
}

function cleanText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${field} must be non-empty text`);
  const cleaned = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (cleaned.length > maximum) throw invalid(`${field} exceeds the ${maximum}-character bound`);
  if (field === 'reasonCode' && !/^[a-z0-9][a-z0-9_]{0,47}$/.test(cleaned)) {
    throw invalid(`${field} must use the bounded lowercase reason-code vocabulary`);
  }
  return cleaned;
}

function validateReplacement(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid('REPAIR requires replacementProse', 'semantic_deterministic_validation_failed');
  const replacement = value.trim();
  if (/^#{1,6}\s/m.test(replacement)) throw invalid('replacementProse may not contain headings', 'semantic_deterministic_validation_failed');
  if (/^\s*(?:[-*+]\s|\d+[.)]\s|```)/m.test(replacement)) throw invalid('replacementProse may not contain lists or code fences', 'semantic_deterministic_validation_failed');
  if (/\r?\n\s*\r?\n/.test(replacement)) throw invalid('replacementProse may contain only one bounded prose block', 'semantic_deterministic_validation_failed');
  if (replacement.length > 2400) throw invalid('replacementProse exceeds the bounded target limit', 'semantic_deterministic_validation_failed');
  return replacement;
}

export function reviewIdForCandidateIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 999) throw new Error('Semantic review index is outside the bounded review-ID range.');
  return `B${String(index + 1).padStart(2, '0')}`;
}

export function reviewIdForCandidate(input: SemanticReviewerInput, candidateId: string): string {
  const index = input.candidates.findIndex((candidate) => candidate.candidateId === candidateId);
  if (index < 0) throw invalid(`unknown candidateId ${candidateId}`, 'semantic_unknown_candidate');
  return reviewIdForCandidateIndex(index);
}

/**
 * Validate the closed semantic-review envelope before it reaches the cascade. The reviewer must
 * truthfully decide every candidate in one response. Applied-repair budgeting is a coordinator
 * policy, not a provider-truth constraint: multiple REPAIR findings are valid output and fail
 * closed later as `multiple_semantic_repairs_required`.
 */
export function validateSemanticReviewResult(input: SemanticReviewerInput, result: SemanticReviewResult | SemanticReviewEnvelope): SemanticReviewResult {
  if (!result || !Array.isArray(result.decisions)) throw invalid('decisions must be an array', 'semantic_structured_output_invalid');
  const expected = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const expectedByReviewId = new Map(input.candidates.map((candidate, index) => [reviewIdForCandidateIndex(index), candidate]));
  if (result.decisions.length !== expected.size) throw invalid(`expected exactly ${expected.size} decisions`, 'semantic_candidate_count_mismatch');

  const seen = new Set<string>();
  const decisions = result.decisions.map((raw) => {
    if (!raw || typeof raw !== 'object') throw invalid('each decision must be an object', 'semantic_structured_output_invalid');
    const decision = raw as Partial<SemanticReviewDecision> & { reviewId?: unknown; reason?: unknown };
    const reviewId = decision.reviewId !== undefined
      ? cleanText(decision.reviewId, 'reviewId', 5)
      : undefined;
    const candidateId = reviewId
      ? (() => {
          const candidate = expectedByReviewId.get(reviewId);
          if (!candidate) throw invalid(`unknown reviewId ${reviewId}`, 'semantic_unknown_candidate');
          return candidate.candidateId;
        })()
      : cleanText(decision.candidateId, 'candidateId', 240);
    if (!expected.has(candidateId)) throw invalid(`unknown candidateId ${candidateId}`, 'semantic_unknown_candidate');
    if (seen.has(candidateId)) throw invalid(`duplicate decision for ${candidateId}`, 'semantic_deterministic_validation_failed');
    seen.add(candidateId);
    if (!DISPOSITIONS.includes(decision.disposition as SemanticReviewDisposition)) {
      throw invalid(`unsupported disposition for ${candidateId}`, 'semantic_structured_output_invalid');
    }
    const disposition = decision.disposition as SemanticReviewDisposition;
    const reasonCode = cleanText(decision.reasonCode, 'reasonCode', 48);
    // Legacy injected provider-free fixtures may still carry a replacement on the decision. The
    // live provider schema does not: it uses the single envelope-level repair object below.
    const legacyReplacementProse = disposition === 'REPAIR' && 'replacementProse' in decision
      ? validateReplacement(decision.replacementProse)
      : undefined;
    if (disposition !== 'REPAIR' && decision.replacementProse !== undefined && decision.replacementProse !== null) {
      throw invalid(`${disposition} may not include replacementProse`, 'semantic_deterministic_validation_failed');
    }
    return { candidateId, disposition, reasonCode, ...(legacyReplacementProse ? { replacementProse: legacyReplacementProse } : {}) };
  });

  const repairCount = decisions.filter((decision) => decision.disposition === 'REPAIR').length;
  const resultRecord = result as unknown as Record<string, unknown>;
  const rawRepair = 'repair' in resultRecord ? resultRecord.repair : undefined;
  let repair: SemanticReviewRepair | null = null;
  if (rawRepair !== undefined && rawRepair !== null) {
    if (!rawRepair || typeof rawRepair !== 'object') throw invalid('repair must be null or an object');
    const repairRecord = rawRepair as { reviewId?: unknown; replacementProse?: unknown };
    const repairReviewId = cleanText(repairRecord.reviewId, 'reviewId', 5);
    const repairCandidate = expectedByReviewId.get(repairReviewId);
    if (!repairCandidate) throw invalid(`unknown reviewId ${repairReviewId}`, 'semantic_unknown_candidate');
    if (repairCount !== 1) throw invalid('repair must be null unless exactly one REPAIR decision exists', 'semantic_deterministic_validation_failed');
    const decision = decisions.find((item) => item.candidateId === repairCandidate.candidateId);
    if (!decision || decision.disposition !== 'REPAIR') throw invalid('repair reviewId must identify the REPAIR decision', 'semantic_deterministic_validation_failed');
    repair = { candidateId: repairCandidate.candidateId, replacementProse: validateReplacement(repairRecord.replacementProse) };
  }
  if (repairCount === 1 && !repair) {
    const legacyRepair = decisions.find((decision) => decision.disposition === 'REPAIR' && decision.replacementProse);
    if (legacyRepair?.replacementProse) {
      repair = { candidateId: legacyRepair.candidateId, replacementProse: legacyRepair.replacementProse };
    } else {
      throw invalid('exactly one REPAIR decision requires one envelope-level repair', 'semantic_deterministic_validation_failed');
    }
  }
  if (repairCount === 0 && rawRepair !== undefined && rawRepair !== null) {
    throw invalid('ALLOW/REJECT/HOLD-only review must set repair to null', 'semantic_deterministic_validation_failed');
  }
  const cleanedDecisions = decisions.map((decision) => {
    if (decision.disposition === 'REPAIR' && repair && decision.candidateId === repair.candidateId) return { ...decision, replacementProse: repair.replacementProse };
    if (decision.disposition === 'REPAIR') return { candidateId: decision.candidateId, disposition: decision.disposition, reasonCode: decision.reasonCode };
    return decision;
  });
  let accounting: SemanticReviewAccounting | undefined;
  const accountingInput = resultRecord.accounting as SemanticReviewAccounting | undefined;
  if (accountingInput) {
    if (!Number.isInteger(accountingInput.providerCalls) || accountingInput.providerCalls < 0) {
      throw invalid('accounting.providerCalls must be a non-negative integer');
    }
    accounting = {
      ...accountingInput,
      repairCount,
      candidateCount: input.candidates.length,
      allowCount: cleanedDecisions.filter((decision) => decision.disposition === 'ALLOW').length,
      rejectCount: cleanedDecisions.filter((decision) => decision.disposition === 'REJECT').length,
      holdCount: cleanedDecisions.filter((decision) => decision.disposition === 'HOLD').length
    };
  }
  return { decisions: cleanedDecisions, repair, ...(accounting ? { accounting } : {}) };
}

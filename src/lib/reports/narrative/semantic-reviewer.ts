import type { NarrativeFactPack } from './fact-pack';

export type SemanticReviewDisposition = 'ALLOW' | 'REPAIR' | 'REJECT' | 'HOLD';

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
}

export interface SemanticReviewerInput {
  candidates: SemanticReviewCandidateInput[];
}

export interface SemanticReviewDecision {
  candidateId: string;
  disposition: SemanticReviewDisposition;
  reasonCode: string;
  reason: string;
  replacementProse?: string;
}

export interface SemanticReviewAccounting {
  providerCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  repairCount: number;
}

export interface SemanticReviewResult {
  decisions: SemanticReviewDecision[];
  accounting?: SemanticReviewAccounting;
}

export interface EssentialSemanticReviewer {
  review(input: SemanticReviewerInput): Promise<SemanticReviewResult>;
}

const DISPOSITIONS: readonly SemanticReviewDisposition[] = ['ALLOW', 'REPAIR', 'REJECT', 'HOLD'];

function invalid(message: string): Error {
  const error = new Error(`semantic_review_invalid_response: ${message}`);
  (error as { code?: string }).code = 'semantic_review_invalid_response';
  return error;
}

function cleanText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${field} must be non-empty text`);
  const cleaned = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (cleaned.length > maximum) throw invalid(`${field} exceeds the ${maximum}-character bound`);
  return cleaned;
}

function validateReplacement(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid('REPAIR requires replacementProse');
  const replacement = value.trim();
  if (/^#{1,6}\s/m.test(replacement)) throw invalid('replacementProse may not contain headings');
  if (/^\s*(?:[-*+]\s|\d+[.)]\s|```)/m.test(replacement)) throw invalid('replacementProse may not contain lists or code fences');
  if (/\r?\n\s*\r?\n/.test(replacement)) throw invalid('replacementProse may contain only one bounded prose block');
  if (replacement.length > 12000) throw invalid('replacementProse exceeds the bounded target limit');
  return replacement;
}

/**
 * Validate the closed semantic-review envelope before it reaches the cascade. The reviewer may
 * decide every candidate in one response, but it may repair at most one deterministic prose block.
 * It cannot omit a candidate, invent a candidate ID or attach replacement prose to another verdict.
 */
export function validateSemanticReviewResult(input: SemanticReviewerInput, result: SemanticReviewResult): SemanticReviewResult {
  if (!result || !Array.isArray(result.decisions)) throw invalid('decisions must be an array');
  const expected = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
  if (result.decisions.length !== expected.size) throw invalid(`expected exactly ${expected.size} decisions`);

  const seen = new Set<string>();
  const decisions = result.decisions.map((raw) => {
    if (!raw || typeof raw !== 'object') throw invalid('each decision must be an object');
    const decision = raw as Partial<SemanticReviewDecision>;
    const candidateId = cleanText(decision.candidateId, 'candidateId', 240);
    if (!expected.has(candidateId)) throw invalid(`unknown candidateId ${candidateId}`);
    if (seen.has(candidateId)) throw invalid(`duplicate decision for ${candidateId}`);
    seen.add(candidateId);
    if (!DISPOSITIONS.includes(decision.disposition as SemanticReviewDisposition)) {
      throw invalid(`unsupported disposition for ${candidateId}`);
    }
    const disposition = decision.disposition as SemanticReviewDisposition;
    const reasonCode = cleanText(decision.reasonCode, 'reasonCode', 120);
    const reason = cleanText(decision.reason, 'reason', 500);
    const replacementProse = disposition === 'REPAIR'
      ? validateReplacement(decision.replacementProse)
      : undefined;
    if (disposition !== 'REPAIR' && decision.replacementProse !== undefined && decision.replacementProse !== null) {
      throw invalid(`${disposition} may not include replacementProse`);
    }
    return { candidateId, disposition, reasonCode, reason, ...(replacementProse ? { replacementProse } : {}) };
  });

  const repairCount = decisions.filter((decision) => decision.disposition === 'REPAIR').length;
  if (repairCount > 1) throw invalid('at most one bounded semantic repair is permitted');
  let accounting: SemanticReviewAccounting | undefined;
  if (result.accounting) {
    if (!Number.isInteger(result.accounting.providerCalls) || result.accounting.providerCalls < 0) {
      throw invalid('accounting.providerCalls must be a non-negative integer');
    }
    accounting = { ...result.accounting, repairCount };
  }
  return { decisions, ...(accounting ? { accounting } : {}) };
}

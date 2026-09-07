/**
 * Shared semantic-safety orchestration for customer-facing narrative.
 *
 * Detection is deliberately separate from disposition. A lexical or deterministic
 * candidate is never itself a rejection. Hard truth is supplied by the authoritative
 * validator and cannot be downgraded by an AI adapter.
 */

export const SEMANTIC_SAFETY_CONTRACT_VERSION = 'mk-semantic-safety-cascade-v1';
export const SEMANTIC_ADJUDICATION_MIN_CONFIDENCE = 0.8;

export type SemanticDisposition = 'HARD_REJECT' | 'MUST_ALLOW' | 'MUST_REPAIR' | 'AMBIGUOUS';
export type SemanticAdjudicationLabel = 'ALLOW_CONTEXT' | 'REPAIRABLE' | 'CONFIRMED_VIOLATION' | 'AMBIGUOUS';
export type SemanticCallStage = 'generation' | 'adjudication' | 'repair';

export type SemanticCandidate = {
  targetId: string;
  candidateHash: string;
  text: string;
  neighborText?: string;
  fieldRole: string;
  issueCode: string;
  issueFamily: string;
  deterministicFeatures: Record<string, unknown>;
  evidenceRefs: string[];
  evidence: Record<string, unknown>;
  hardTruth?: boolean;
  explicitContextAllow?: boolean;
  deterministicRepairAvailable?: boolean;
  /** The candidate is locally repairable without an adjudication call. */
  directRepairEligible?: boolean;
  /** A confirmed violation may still use the bounded repair path for this candidate. */
  semanticRepairEligible?: boolean;
};

export type SemanticDecision = {
  targetId: string;
  disposition: SemanticDisposition;
  reasonCode: string;
  confidence?: number;
  evidenceRefs: string[];
};

export type SemanticAdjudicationResult = {
  targetId: string;
  label: SemanticAdjudicationLabel;
  confidence: number;
  reasonCode: string;
  evidenceRefs: string[];
};

export type SemanticRepairResult = {
  targetId: string;
  repairedText: string;
};

export type SemanticEvaluation<T> = {
  hardCandidates: SemanticCandidate[];
  candidates: SemanticCandidate[];
  valid?: boolean;
  validationIssues?: string[];
  value?: T;
};

export type SemanticCascadeOutcome = 'ACCEPT' | 'REJECT' | 'HOLD';

export type SemanticCascadeDiagnostics = {
  contractVersion: typeof SEMANTIC_SAFETY_CONTRACT_VERSION;
  outcome: SemanticCascadeOutcome;
  candidateCount: number;
  deterministicDispositionCounts: Record<SemanticDisposition, number>;
  generationCalls: number;
  adjudicationCalls: number;
  adjudicationCounts: Record<SemanticAdjudicationLabel, number>;
  repairCalls: number;
  repairTargetCount: number;
  totalProviderCalls: number;
  confidenceThreshold: number;
  decisions: Array<Pick<SemanticDecision, 'targetId' | 'disposition' | 'reasonCode' | 'confidence' | 'evidenceRefs'>>;
  finalResult: 'ACCEPT' | 'HARD_REJECT' | 'AMBIGUOUS' | 'REPAIR_FAILED' | 'VALIDATION_FAILED';
  reasonCode?: string;
  /** Which closed-vocabulary acceptance predicate the adjudication response failed, if any. */
  invalidAdjudicationPredicate?: AdjudicationInvalidPredicate;
  /** How an unusable adjudication was handled: conservative bounded repair, or fail closed. */
  invalidAdjudicationDisposition?: 'conservative_repair' | 'fail_closed';
};

export class SemanticCallLedger {
  private readonly counts: Record<SemanticCallStage, number> = {
    generation: 0,
    adjudication: 0,
    repair: 0
  };

  claim(stage: SemanticCallStage): void {
    if (this.counts[stage] >= 1) {
      throw new Error(`semantic_${stage}_call_budget_exhausted`);
    }
    if (this.totalProviderCalls >= 3) {
      throw new Error('semantic_total_provider_call_budget_exhausted');
    }
    this.counts[stage] += 1;
  }

  get generationCalls(): number { return this.counts.generation; }
  get adjudicationCalls(): number { return this.counts.adjudication; }
  get repairCalls(): number { return this.counts.repair; }
  get totalProviderCalls(): number { return this.counts.generation + this.counts.adjudication + this.counts.repair; }

  snapshot(): { generationCalls: number; adjudicationCalls: number; repairCalls: number; totalProviderCalls: number } {
    return {
      generationCalls: this.generationCalls,
      adjudicationCalls: this.adjudicationCalls,
      repairCalls: this.repairCalls,
      totalProviderCalls: this.totalProviderCalls
    };
  }
}

function countBy<T extends string>(values: T[], keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>;
}

const dispositions: readonly SemanticDisposition[] = ['HARD_REJECT', 'MUST_ALLOW', 'MUST_REPAIR', 'AMBIGUOUS'];
const labels: readonly SemanticAdjudicationLabel[] = ['ALLOW_CONTEXT', 'REPAIRABLE', 'CONFIRMED_VIOLATION', 'AMBIGUOUS'];
/**
 * The reason-code / evidence-reference shape the acceptance contract requires. Exported so the
 * provider's structured-output schema can constrain the same characters, instead of asking for
 * them in prompt wording and rejecting the answer afterwards.
 */
export const SAFE_DIAGNOSTIC_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;
const SAFE_DIAGNOSTIC_TOKEN = SAFE_DIAGNOSTIC_TOKEN_PATTERN;

export function determineSemanticDisposition(input: {
  candidate: SemanticCandidate;
  hardReject?: boolean;
  explicitAllow?: boolean;
  deterministicRepair?: boolean;
  directRepair?: boolean;
  reasonCode?: string;
  confidence?: number;
}): SemanticDecision {
  const candidate = input.candidate;
  const hardReject = input.hardReject ?? candidate.hardTruth ?? false;
  const explicitAllow = input.explicitAllow ?? candidate.explicitContextAllow ?? false;
  const deterministicRepair = input.deterministicRepair ?? candidate.deterministicRepairAvailable ?? false;
  const directRepair = input.directRepair ?? candidate.directRepairEligible ?? false;
  const disposition: SemanticDisposition = hardReject
    ? 'HARD_REJECT'
    : explicitAllow
      ? 'MUST_ALLOW'
      : deterministicRepair || directRepair
        ? 'MUST_REPAIR'
        : 'AMBIGUOUS';
  return {
    targetId: candidate.targetId,
    disposition,
    reasonCode: input.reasonCode ?? candidate.issueCode,
    confidence: input.confidence,
    evidenceRefs: [...candidate.evidenceRefs]
  };
}

/** Candidate detection is observational only and never returns a rejection. */
export function detectSemanticCandidates<T>(input: {
  value: T;
  detect: (value: T) => SemanticCandidate[];
}): SemanticCandidate[] {
  return input.detect(input.value).map((candidate) => ({
    ...candidate,
    evidenceRefs: [...candidate.evidenceRefs],
    deterministicFeatures: { ...candidate.deterministicFeatures },
    evidence: { ...candidate.evidence }
  }));
}

function uniqueCandidates(candidates: SemanticCandidate[]): SemanticCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.targetId || seen.has(candidate.targetId)) return false;
    seen.add(candidate.targetId);
    return true;
  });
}

/**
 * Closed vocabulary naming which acceptance predicate an adjudication response failed.
 *
 * These are fixed tokens, never provider or customer prose, so they are safe to log and to carry
 * in runtime diagnostics.
 */
export const ADJUDICATION_INVALID_PREDICATES = [
  'result_count_mismatch',
  'unknown_target',
  'duplicate_target',
  'label_not_recognised',
  'confidence_not_finite',
  'confidence_below_threshold',
  'reason_code_not_safe_token',
  'evidence_refs_not_array',
  'evidence_ref_not_safe_token',
  'provider_schema_violation'
] as const;

export type AdjudicationInvalidPredicate = (typeof ADJUDICATION_INVALID_PREDICATES)[number];

export type AdjudicationValidity =
  | { valid: true }
  | { valid: false; predicate: AdjudicationInvalidPredicate };

/**
 * An adjudication adapter throws this when the provider answered but the answer is unusable --
 * for example it violated the structured-output schema. It is deliberately distinct from a
 * transport or timeout failure, which means no adjudication happened at all and must stay a
 * provider failure.
 */
export class SemanticAdjudicationUnusableError extends Error {
  readonly predicate: AdjudicationInvalidPredicate;

  constructor(predicate: AdjudicationInvalidPredicate) {
    super(`semantic_adjudication_unusable:${predicate}`);
    this.name = 'SemanticAdjudicationUnusableError';
    this.predicate = predicate;
  }
}

export function classifyAdjudicationValidity(
  candidates: SemanticCandidate[],
  results: SemanticAdjudicationResult[]
): AdjudicationValidity {
  if (!Array.isArray(results) || results.length !== candidates.length) {
    return { valid: false, predicate: 'result_count_mismatch' };
  }
  const expected = new Set(candidates.map((candidate) => candidate.targetId));
  const seen = new Set<string>();
  for (const result of results) {
    if (!expected.has(result?.targetId)) return { valid: false, predicate: 'unknown_target' };
    if (seen.has(result.targetId)) return { valid: false, predicate: 'duplicate_target' };
    seen.add(result.targetId);
    if (!labels.includes(result.label)) return { valid: false, predicate: 'label_not_recognised' };
    if (!Number.isFinite(result.confidence)) return { valid: false, predicate: 'confidence_not_finite' };
    if (result.confidence < SEMANTIC_ADJUDICATION_MIN_CONFIDENCE) {
      return { valid: false, predicate: 'confidence_below_threshold' };
    }
    if (typeof result.reasonCode !== 'string' || !SAFE_DIAGNOSTIC_TOKEN.test(result.reasonCode)) {
      return { valid: false, predicate: 'reason_code_not_safe_token' };
    }
    if (!Array.isArray(result.evidenceRefs)) return { valid: false, predicate: 'evidence_refs_not_array' };
    if (result.evidenceRefs.some((ref) => typeof ref !== 'string' || !SAFE_DIAGNOSTIC_TOKEN.test(ref))) {
      return { valid: false, predicate: 'evidence_ref_not_safe_token' };
    }
  }
  return { valid: true };
}

function invalidRepairs(targets: SemanticCandidate[], repairs: SemanticRepairResult[]): boolean {
  if (repairs.length !== targets.length) return true;
  const expected = new Set(targets.map((target) => target.targetId));
  const seen = new Set<string>();
  return repairs.some((repair) => {
    if (!expected.has(repair.targetId) || seen.has(repair.targetId)) return true;
    seen.add(repair.targetId);
    return typeof repair.repairedText !== 'string' || !repair.repairedText.trim();
  });
}

function baseDiagnostics(ledger: SemanticCallLedger, candidates: SemanticCandidate[]): SemanticCascadeDiagnostics {
  return {
    contractVersion: SEMANTIC_SAFETY_CONTRACT_VERSION,
    outcome: 'HOLD',
    candidateCount: candidates.length,
    deterministicDispositionCounts: countBy([], dispositions),
    generationCalls: ledger.generationCalls,
    adjudicationCalls: ledger.adjudicationCalls,
    adjudicationCounts: countBy([], labels),
    repairCalls: ledger.repairCalls,
    repairTargetCount: 0,
    totalProviderCalls: ledger.totalProviderCalls,
    confidenceThreshold: SEMANTIC_ADJUDICATION_MIN_CONFIDENCE,
    decisions: [],
    finalResult: 'AMBIGUOUS'
  };
}

function reject<T>(diagnostics: SemanticCascadeDiagnostics, reasonCode: string, finalResult: SemanticCascadeDiagnostics['finalResult']): SemanticCascadeResult<T> {
  diagnostics.outcome = 'REJECT';
  diagnostics.reasonCode = reasonCode;
  diagnostics.finalResult = finalResult;
  return { outcome: 'REJECT', diagnostics };
}

export type SemanticCascadeResult<T> = {
  outcome: SemanticCascadeOutcome;
  value?: T;
  diagnostics: SemanticCascadeDiagnostics;
};

/**
 * Runs the fixed semantic sequence after the caller has claimed the generation call.
 * The function never calls a provider more than once for adjudication and once for repair.
 */
export async function runSemanticSafetyCascade<T>(input: {
  initialValue: T;
  ledger: SemanticCallLedger;
  evaluate: (value: T) => SemanticEvaluation<T>;
  applyDeterministicRepairs?: (value: T, decisions: SemanticDecision[]) => T;
  adjudicate?: (candidates: SemanticCandidate[]) => Promise<SemanticAdjudicationResult[]>;
  repair?: (targets: SemanticCandidate[]) => Promise<SemanticRepairResult[]>;
  applyRepairs: (value: T, replacements: SemanticRepairResult[]) => T;
}): Promise<SemanticCascadeResult<T>> {
  const initialEvaluation = input.evaluate(input.initialValue);
  const candidates = uniqueCandidates([...initialEvaluation.hardCandidates, ...initialEvaluation.candidates]);
  const diagnostics = baseDiagnostics(input.ledger, candidates);
  const hardIds = new Set(initialEvaluation.hardCandidates.map((candidate) => candidate.targetId));
  const initialDecisions = initialEvaluation.candidates.map((candidate) => determineSemanticDisposition({ candidate }));
  const allDecisions = [
    ...initialEvaluation.hardCandidates.map((candidate) => determineSemanticDisposition({ candidate, hardReject: true })),
    ...initialDecisions.filter((decision) => !hardIds.has(decision.targetId))
  ];
  diagnostics.deterministicDispositionCounts = countBy(allDecisions.map((decision) => decision.disposition), dispositions);
  diagnostics.decisions = allDecisions;

  if (initialEvaluation.hardCandidates.length > 0 || allDecisions.some((decision) => decision.disposition === 'HARD_REJECT')) {
    return reject(diagnostics, 'hard_truth_failure', 'HARD_REJECT');
  }

  let value = input.initialValue;
  const initialCandidateById = new Map(candidates.map((candidate) => [candidate.targetId, candidate]));
  const isDeterministicRepair = (decision: SemanticDecision, candidateById: Map<string, SemanticCandidate>) =>
    decision.disposition === 'MUST_REPAIR' && candidateById.get(decision.targetId)?.deterministicRepairAvailable === true;
  const isDirectRepair = (decision: SemanticDecision, candidateById: Map<string, SemanticCandidate>) => {
    const candidate = candidateById.get(decision.targetId);
    return decision.disposition === 'MUST_REPAIR'
      && candidate?.hardTruth !== true
      && candidate?.directRepairEligible === true;
  };
  const hasUnroutableRepair = allDecisions.some((decision) => decision.disposition === 'MUST_REPAIR'
    && !isDeterministicRepair(decision, initialCandidateById)
    && !isDirectRepair(decision, initialCandidateById));
  if (hasUnroutableRepair) return reject(diagnostics, 'deterministic_repair_unavailable', 'AMBIGUOUS');

  const deterministicRepairs = allDecisions.filter((decision) => isDeterministicRepair(decision, initialCandidateById));
  if (deterministicRepairs.length > 0) {
    if (!input.applyDeterministicRepairs) return reject(diagnostics, 'deterministic_repair_unavailable', 'AMBIGUOUS');
    try {
      value = input.applyDeterministicRepairs(value, deterministicRepairs);
    } catch {
      return reject(diagnostics, 'deterministic_repair_failed', 'REPAIR_FAILED');
    }
  }

  let evaluation = deterministicRepairs.length > 0 ? input.evaluate(value) : initialEvaluation;
  if (evaluation.hardCandidates.length > 0) return reject(diagnostics, 'hard_truth_failure_after_deterministic_repair', 'HARD_REJECT');
  if (evaluation.valid === false && evaluation.candidates.length === 0) return reject(diagnostics, 'deterministic_validation_failed', 'VALIDATION_FAILED');

  const postDeterministicDecisions = evaluation.candidates.map((candidate) => determineSemanticDisposition({ candidate }));
  if (postDeterministicDecisions.some((decision) => decision.disposition === 'HARD_REJECT')) {
    return reject(diagnostics, 'hard_truth_failure_after_deterministic_repair', 'HARD_REJECT');
  }
  const evaluationCandidateById = new Map(evaluation.candidates.map((candidate) => [candidate.targetId, candidate]));
  if (postDeterministicDecisions.some((decision) => decision.disposition === 'MUST_REPAIR'
    && !isDeterministicRepair(decision, evaluationCandidateById)
    && !isDirectRepair(decision, evaluationCandidateById))) {
    return reject(diagnostics, 'deterministic_repair_incomplete', 'REPAIR_FAILED');
  }
  let unresolved = postDeterministicDecisions
    .filter((decision) => decision.disposition === 'AMBIGUOUS')
    .map((decision) => evaluationCandidateById.get(decision.targetId)!)
    .filter(Boolean);
  const directRepairTargets = postDeterministicDecisions
    .filter((decision) => isDirectRepair(decision, evaluationCandidateById))
    .map((decision) => evaluationCandidateById.get(decision.targetId)!)
    .filter(Boolean);
  if (unresolved.length === 0 && directRepairTargets.length === 0) {
    diagnostics.outcome = 'ACCEPT';
    diagnostics.finalResult = evaluation.valid === false ? 'VALIDATION_FAILED' : 'ACCEPT';
    return { outcome: diagnostics.outcome, value, diagnostics };
  }

  try {
    let decisions: SemanticDecision[] = [];
    if (unresolved.length > 0) {
      if (!input.adjudicate) return reject(diagnostics, 'adjudication_adapter_unavailable', 'AMBIGUOUS');
      input.ledger.claim('adjudication');
      diagnostics.adjudicationCalls = input.ledger.adjudicationCalls;
      diagnostics.totalProviderCalls = input.ledger.totalProviderCalls;
      let adjudications: SemanticAdjudicationResult[] = [];
      let validity: AdjudicationValidity;
      try {
        adjudications = await input.adjudicate(unresolved);
        validity = classifyAdjudicationValidity(unresolved, adjudications);
      } catch (error) {
        // A provider that answered unusably is not the same condition as a provider that never
        // answered. Only the former joins the conservative route below; a transport or timeout
        // failure still propagates as a provider failure.
        if (!(error instanceof SemanticAdjudicationUnusableError)) throw error;
        validity = { valid: false, predicate: error.predicate };
      }

      if (!validity.valid) {
        // The adjudication is unusable. It is never read as permission: an unusable answer is
        // treated at least as severely as a CONFIRMED_VIOLATION, so a candidate the pathway has
        // already approved for bounded semantic repair takes the repair route, and anything else
        // fails closed. There is no second adjudication and no full regeneration.
        diagnostics.invalidAdjudicationPredicate = validity.predicate;
        const conservativelyRepairable = unresolved.every((candidate) => candidate.semanticRepairEligible === true
          && candidate.hardTruth !== true);
        if (!conservativelyRepairable) {
          diagnostics.invalidAdjudicationDisposition = 'fail_closed';
          return reject(diagnostics, 'invalid_adjudication', 'AMBIGUOUS');
        }
        diagnostics.invalidAdjudicationDisposition = 'conservative_repair';
        decisions = unresolved.map((candidate) => ({
          targetId: candidate.targetId,
          disposition: 'MUST_REPAIR' as const,
          reasonCode: `invalid_adjudication:${validity.predicate}`,
          evidenceRefs: [...candidate.evidenceRefs]
        } satisfies SemanticDecision));
        diagnostics.decisions = [...diagnostics.decisions, ...decisions];
      } else {
        diagnostics.adjudicationCounts = countBy(adjudications.map((result) => result.label), labels);
        const adjudicationById = new Map(adjudications.map((result) => [result.targetId, result]));
        decisions = unresolved.map((candidate) => {
          const result = adjudicationById.get(candidate.targetId)!;
          const disposition: SemanticDisposition = result.label === 'ALLOW_CONTEXT'
            ? 'MUST_ALLOW'
            : result.label === 'REPAIRABLE'
              ? 'MUST_REPAIR'
              : result.label === 'CONFIRMED_VIOLATION'
                ? candidate.semanticRepairEligible === true && candidate.hardTruth !== true ? 'MUST_REPAIR' : 'HARD_REJECT'
                : 'AMBIGUOUS';
          return {
            targetId: candidate.targetId,
            disposition,
            reasonCode: result.reasonCode,
            confidence: result.confidence,
            evidenceRefs: [...result.evidenceRefs]
          } satisfies SemanticDecision;
        });
        diagnostics.decisions = [...diagnostics.decisions, ...decisions];
        if (decisions.some((decision) => decision.disposition === 'HARD_REJECT')) return reject(diagnostics, 'ai_confirmed_violation', 'HARD_REJECT');
        if (decisions.some((decision) => decision.disposition === 'AMBIGUOUS')) return reject(diagnostics, 'ai_ambiguous_or_low_confidence', 'AMBIGUOUS');
      }
    }

    const allowedIds = new Set(decisions.filter((decision) => decision.disposition === 'MUST_ALLOW').map((decision) => decision.targetId));
    const repairTargetIds = new Set(directRepairTargets.map((candidate) => candidate.targetId));
    const repairTargets = [
      ...directRepairTargets,
      ...unresolved.filter((candidate) => decisions.some((decision) => decision.targetId === candidate.targetId && decision.disposition === 'MUST_REPAIR'))
        .filter((candidate) => !repairTargetIds.has(candidate.targetId))
    ];
    diagnostics.repairTargetCount = repairTargets.length;
    if (repairTargets.length === 0) {
      const finalEvaluation = input.evaluate(value);
      const unallowedCandidates = finalEvaluation.candidates.filter((candidate) => !allowedIds.has(candidate.targetId));
      if (finalEvaluation.hardCandidates.length > 0 || unallowedCandidates.length > 0) return reject(diagnostics, 'final_validation_failed', 'VALIDATION_FAILED');
      diagnostics.outcome = 'ACCEPT';
      diagnostics.finalResult = 'ACCEPT';
      return { outcome: 'ACCEPT', value, diagnostics };
    }
    if (!input.repair) return reject(diagnostics, 'repair_adapter_unavailable', 'REPAIR_FAILED');
    input.ledger.claim('repair');
    diagnostics.repairCalls = input.ledger.repairCalls;
    diagnostics.totalProviderCalls = input.ledger.totalProviderCalls;
    const repairs = await input.repair(repairTargets);
    if (invalidRepairs(repairTargets, repairs)) return reject(diagnostics, 'invalid_repair_targets', 'REPAIR_FAILED');
    value = input.applyRepairs(value, repairs);
    const finalEvaluation = input.evaluate(value);
    if (finalEvaluation.hardCandidates.length > 0) return reject(diagnostics, 'repair_introduced_hard_truth_failure', 'HARD_REJECT');
    const unallowedCandidates = finalEvaluation.candidates.filter((candidate) => !allowedIds.has(candidate.targetId));
    if (unallowedCandidates.length > 0 || finalEvaluation.valid === false && finalEvaluation.candidates.length === 0) return reject(diagnostics, 'repair_failed_final_validation', 'REPAIR_FAILED');
    diagnostics.outcome = 'ACCEPT';
    diagnostics.finalResult = 'ACCEPT';
    return { outcome: 'ACCEPT', value, diagnostics };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'semantic_provider_failure';
    return reject(diagnostics, reason.startsWith('semantic_') ? reason : 'semantic_provider_failure', 'AMBIGUOUS');
  }
}

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
const SAFE_DIAGNOSTIC_TOKEN = /^[A-Za-z0-9_.:-]{1,120}$/;

export function determineSemanticDisposition(input: {
  candidate: SemanticCandidate;
  hardReject?: boolean;
  explicitAllow?: boolean;
  deterministicRepair?: boolean;
  reasonCode?: string;
  confidence?: number;
}): SemanticDecision {
  const candidate = input.candidate;
  const hardReject = input.hardReject ?? candidate.hardTruth ?? false;
  const explicitAllow = input.explicitAllow ?? candidate.explicitContextAllow ?? false;
  const deterministicRepair = input.deterministicRepair ?? candidate.deterministicRepairAvailable ?? false;
  const disposition: SemanticDisposition = hardReject
    ? 'HARD_REJECT'
    : explicitAllow
      ? 'MUST_ALLOW'
      : deterministicRepair
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

function invalidAdjudication(candidates: SemanticCandidate[], results: SemanticAdjudicationResult[]): boolean {
  if (results.length !== candidates.length) return true;
  const expected = new Set(candidates.map((candidate) => candidate.targetId));
  const seen = new Set<string>();
  return results.some((result) => {
    if (!expected.has(result.targetId) || seen.has(result.targetId)) return true;
    seen.add(result.targetId);
    return !labels.includes(result.label)
      || !Number.isFinite(result.confidence)
      || result.confidence < SEMANTIC_ADJUDICATION_MIN_CONFIDENCE
      || typeof result.reasonCode !== 'string'
      || !SAFE_DIAGNOSTIC_TOKEN.test(result.reasonCode)
      || !Array.isArray(result.evidenceRefs)
      || result.evidenceRefs.some((ref) => typeof ref !== 'string' || !SAFE_DIAGNOSTIC_TOKEN.test(ref));
  });
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
  const deterministicRepairs = allDecisions.filter((decision) => decision.disposition === 'MUST_REPAIR');
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
  if (postDeterministicDecisions.some((decision) => decision.disposition === 'MUST_REPAIR')) {
    return reject(diagnostics, 'deterministic_repair_incomplete', 'REPAIR_FAILED');
  }
  let unresolved = evaluation.candidates
    .map((candidate) => determineSemanticDisposition({ candidate }))
    .filter((decision) => decision.disposition === 'AMBIGUOUS')
    .map((decision) => evaluation.candidates.find((candidate) => candidate.targetId === decision.targetId)!)
    .filter(Boolean);
  if (unresolved.length === 0) {
    diagnostics.outcome = 'ACCEPT';
    diagnostics.finalResult = evaluation.valid === false ? 'VALIDATION_FAILED' : 'ACCEPT';
    return { outcome: diagnostics.outcome, value, diagnostics };
  }
  if (!input.adjudicate) return reject(diagnostics, 'adjudication_adapter_unavailable', 'AMBIGUOUS');

  try {
    input.ledger.claim('adjudication');
    diagnostics.adjudicationCalls = input.ledger.adjudicationCalls;
    diagnostics.totalProviderCalls = input.ledger.totalProviderCalls;
    const adjudications = await input.adjudicate(unresolved);
    if (invalidAdjudication(unresolved, adjudications)) return reject(diagnostics, 'invalid_adjudication', 'AMBIGUOUS');
    diagnostics.adjudicationCounts = countBy(adjudications.map((result) => result.label), labels);
    const adjudicationById = new Map(adjudications.map((result) => [result.targetId, result]));
    const decisions = unresolved.map((candidate) => {
      const result = adjudicationById.get(candidate.targetId)!;
      const disposition: SemanticDisposition = result.label === 'ALLOW_CONTEXT'
        ? 'MUST_ALLOW'
        : result.label === 'REPAIRABLE'
          ? 'MUST_REPAIR'
          : result.label === 'CONFIRMED_VIOLATION'
            ? 'HARD_REJECT'
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

    const allowedIds = new Set(decisions.filter((decision) => decision.disposition === 'MUST_ALLOW').map((decision) => decision.targetId));
    const repairTargets = unresolved.filter((candidate) => decisions.some((decision) => decision.targetId === candidate.targetId && decision.disposition === 'MUST_REPAIR'));
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

export const NARRATIVE_RECOVERY_POLICY_VERSION = 'mk-reporting-bible-1.1-recovery-policy-v1';

export interface NarrativeRecoveryBudget {
  initialGenerationCount: number;
  targetedRepairCount: number;
  fullRegenerationCount: number;
  qualityEscalationCount: number;
  coherenceCount: number;
  technicalFallbackCount: number;
  totalCalls: number;
  totalTokens: number;
  totalProviderCostMicros: number;
}

export interface RecoveryDecision {
  action: 'TARGETED_REPAIR' | 'FULL_REGENERATION' | 'QUALITY_ESCALATION' | 'COHERENCE_PASS' | 'HUMAN_REVIEW_REQUIRED';
  scope: 'block' | 'block+adjacent' | 'subsection' | 'bounded section' | 'full manuscript' | 'one model rung' | 'whole manuscript' | 'none';
  attempt: number;
  reason: string;
}

export const MAX_TARGETED_REPAIRS = 4;
export const MAX_FULL_REGENERATIONS = 1;
export const MAX_QUALITY_ESCALATIONS = 1;
export const MAX_COHERENCE_PASSES = 1;

export function emptyNarrativeRecoveryBudget(): NarrativeRecoveryBudget {
  return { initialGenerationCount: 0, targetedRepairCount: 0, fullRegenerationCount: 0, qualityEscalationCount: 0, coherenceCount: 0, technicalFallbackCount: 0, totalCalls: 0, totalTokens: 0, totalProviderCostMicros: 0 };
}

export function recoveryDecision(input: { budget: NarrativeRecoveryBudget; issueSeverity: 'HARD_TRUTH_FAILURE' | 'REPAIRABLE_SEMANTIC_FAILURE' | 'QUALITY_FAILURE'; issueScope: 'block' | 'adjacent' | 'subsection' | 'section'; fullGenerationRejected: boolean }): RecoveryDecision {
  const { budget } = input;
  if (input.issueSeverity === 'HARD_TRUTH_FAILURE') return { action: 'HUMAN_REVIEW_REQUIRED', scope: 'none', attempt: 0, reason: 'Hard truth failures are never repaired automatically.' };
  if (input.issueSeverity === 'REPAIRABLE_SEMANTIC_FAILURE' && budget.targetedRepairCount < MAX_TARGETED_REPAIRS) {
    const scopes: RecoveryDecision['scope'][] = ['block', 'block+adjacent', 'subsection', 'bounded section'];
    const scope = scopes[Math.min(budget.targetedRepairCount, scopes.length - 1)]!;
    return { action: 'TARGETED_REPAIR', scope, attempt: budget.targetedRepairCount + 1, reason: 'Use the smallest progressive scope that can correct the bounded semantic defect.' };
  }
  if (input.fullGenerationRejected && budget.fullRegenerationCount < MAX_FULL_REGENERATIONS) return { action: 'FULL_REGENERATION', scope: 'full manuscript', attempt: budget.fullRegenerationCount + 1, reason: 'The first complete manuscript failed validation after bounded semantic recovery.' };
  if (input.issueSeverity === 'QUALITY_FAILURE' && budget.qualityEscalationCount < MAX_QUALITY_ESCALATIONS) return { action: 'QUALITY_ESCALATION', scope: 'one model rung', attempt: budget.qualityEscalationCount + 1, reason: 'Escalate quality once without changing deterministic truth or the Blueprint.' };
  if (budget.coherenceCount < MAX_COHERENCE_PASSES) return { action: 'COHERENCE_PASS', scope: 'whole manuscript', attempt: budget.coherenceCount + 1, reason: 'One bounded editorial coherence pass is permitted after content validation.' };
  return { action: 'HUMAN_REVIEW_REQUIRED', scope: 'none', attempt: 0, reason: 'The approved recovery budget is exhausted.' };
}

export function assertRecoveryBudget(budget: NarrativeRecoveryBudget): void {
  if (budget.initialGenerationCount > 1) throw new Error('Recovery budget permits one initial whole-manuscript generation.');
  if (budget.targetedRepairCount > MAX_TARGETED_REPAIRS) throw new Error('Targeted repair budget exceeded.');
  if (budget.fullRegenerationCount > MAX_FULL_REGENERATIONS) throw new Error('Full regeneration budget exceeded.');
  if (budget.qualityEscalationCount > MAX_QUALITY_ESCALATIONS) throw new Error('Quality escalation budget exceeded.');
  if (budget.coherenceCount > MAX_COHERENCE_PASSES) throw new Error('Coherence-pass budget exceeded.');
  const counted = budget.initialGenerationCount + budget.targetedRepairCount + budget.fullRegenerationCount + budget.qualityEscalationCount + budget.coherenceCount + budget.technicalFallbackCount;
  if (budget.totalCalls < counted) throw new Error('Recovery accounting totalCalls is below recorded phase calls.');
}

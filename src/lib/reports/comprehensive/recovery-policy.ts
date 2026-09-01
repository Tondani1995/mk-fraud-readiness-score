import {
  MAX_COHERENCE_PASSES,
  MAX_FULL_REGENERATIONS,
  MAX_QUALITY_ESCALATIONS,
  MAX_TARGETED_REPAIRS,
  MAX_TRUNCATION_CONTINUATIONS,
  assertRecoveryBudget,
  emptyNarrativeRecoveryBudget,
  recoveryDecision,
  type NarrativeRecoveryBudget
} from '../narrative/recovery-policy';
import type { WholeManuscriptProviderCallLedger } from '../narrative/manuscript';

export const COMPREHENSIVE_RECOVERY_POLICY_VERSION = 'mk-comprehensive-v12-whole-manuscript-recovery-v2' as const;

export const COMPREHENSIVE_PRIMARY_MODEL = 'openai/gpt-5.6-luna' as const;
export const COMPREHENSIVE_TECHNICAL_MODEL_CHAIN = Object.freeze([
  COMPREHENSIVE_PRIMARY_MODEL,
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-sol'
] as const);

export const COMPREHENSIVE_MAX_TARGETED_REPAIRS = MAX_TARGETED_REPAIRS;
export const COMPREHENSIVE_MAX_FULL_REGENERATIONS = MAX_FULL_REGENERATIONS;
export const COMPREHENSIVE_MAX_QUALITY_ESCALATIONS = MAX_QUALITY_ESCALATIONS;
export const COMPREHENSIVE_MAX_COHERENCE_PASSES = MAX_COHERENCE_PASSES;
export const COMPREHENSIVE_MAX_TRUNCATION_CONTINUATIONS = MAX_TRUNCATION_CONTINUATIONS;
export const COMPREHENSIVE_MAX_TOTAL_PROVIDER_CALLS = 10;

export interface ComprehensiveRecoverableIssue {
  kind: 'HARD_TRUTH' | 'SEMANTIC' | 'QUALITY';
  code: string;
}

export type ComprehensiveRecoverySeverity = 'HARD_TRUTH_FAILURE' | 'REPAIRABLE_SEMANTIC_FAILURE' | 'QUALITY_FAILURE' | 'TECHNICAL_TRUNCATION';

/**
 * Comprehensive uses the same recovery philosophy and shared ceilings as
 * Essential, applied to one complete Blueprint-bound manuscript.
 *
 * Hard truth is never automatically rewritten. A small set of validator codes
 * remain for compatibility with older adapters. The authoritative
 * whole-manuscript coordinator treats hard-truth validation as fail-closed;
 * only explicitly repairable semantic issues may enter this policy.
 */
const LOCAL_SEMANTIC_HARD_CODES = new Set([
  'EMPTY',
  'EM_DASH',
  'ASSURANCE_CLAIM',
  'PROVISIONAL_STATUS_OMITTED',
  'ENGINE_VOCABULARY',
  'SUSTAINMENT_EXPOSURE_AS_WEAKNESS'
]);

export function classifyComprehensiveRecoveryIssue(issue: ComprehensiveRecoverableIssue): ComprehensiveRecoverySeverity {
  if (issue.kind === 'QUALITY') return 'QUALITY_FAILURE';
  if (issue.kind === 'SEMANTIC') return 'REPAIRABLE_SEMANTIC_FAILURE';
  if (LOCAL_SEMANTIC_HARD_CODES.has(issue.code)) return 'REPAIRABLE_SEMANTIC_FAILURE';
  return 'HARD_TRUTH_FAILURE';
}

export function dominantComprehensiveRecoverySeverity(
  issues: readonly ComprehensiveRecoverableIssue[]
): ComprehensiveRecoverySeverity | null {
  if (!issues.length) return null;
  const severities = issues.map(classifyComprehensiveRecoveryIssue);
  if (severities.includes('HARD_TRUTH_FAILURE')) return 'HARD_TRUTH_FAILURE';
  if (severities.includes('REPAIRABLE_SEMANTIC_FAILURE')) return 'REPAIRABLE_SEMANTIC_FAILURE';
  if (severities.includes('QUALITY_FAILURE')) return 'QUALITY_FAILURE';
  return null;
}

export function comprehensiveRecoveryDecision(input: {
  budget: NarrativeRecoveryBudget;
  issues: readonly ComprehensiveRecoverableIssue[];
}) {
  const severity = dominantComprehensiveRecoverySeverity(input.issues);
  if (!severity) return null;
  return recoveryDecision({
    budget: input.budget,
    issueSeverity: severity,
    issueScope:
      input.budget.targetedRepairCount === 0 ? 'block'
        : input.budget.targetedRepairCount === 1 ? 'adjacent'
          : input.budget.targetedRepairCount === 2 ? 'subsection'
            : 'section',
    // Quality gets its own one-rung escalation before coherence. Semantic
    // rejection may receive one complete manuscript regeneration after the
    // targeted-repair budget has been used.
    fullGenerationRejected: severity === 'REPAIRABLE_SEMANTIC_FAILURE'
  });
}

export function emptyComprehensiveRecoveryBudget(): NarrativeRecoveryBudget {
  return emptyNarrativeRecoveryBudget();
}

export function assertComprehensiveRecoveryBudget(budget: NarrativeRecoveryBudget): void {
  assertRecoveryBudget(budget);
  if (budget.technicalFallbackCount > 1) throw new Error('Comprehensive technical-fallback budget exceeded.');
  if (budget.totalCalls > COMPREHENSIVE_MAX_TOTAL_PROVIDER_CALLS) throw new Error('Comprehensive total provider-call budget exceeded.');
}

export interface ComprehensiveProviderCallRecord {
  sequence: number;
  kind: string;
}

/** Shared dispatch accounting across the primary model and every fallback rung. */
export class ComprehensiveProviderCallLedger implements WholeManuscriptProviderCallLedger {
  readonly maxCalls = COMPREHENSIVE_MAX_TOTAL_PROVIDER_CALLS;
  private readonly records: ComprehensiveProviderCallRecord[] = [];

  claim(kind: string): void {
    if (this.records.length >= this.maxCalls) {
      const error = new Error(`comprehensive_provider_call_budget_exhausted: ${kind} would exceed the ${this.maxCalls}-call ceiling.`);
      (error as { code?: string }).code = 'comprehensive_provider_call_budget_exhausted';
      throw error;
    }
    this.records.push({ sequence: this.records.length + 1, kind });
  }

  snapshot(): ComprehensiveProviderCallRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  get totalCalls(): number {
    return this.records.length;
  }
}

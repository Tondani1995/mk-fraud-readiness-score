export type NarrativeValidationSeverity = 'HARD_TRUTH_FAILURE' | 'REPAIRABLE_SEMANTIC_FAILURE' | 'QUALITY_FAILURE' | 'TECHNICAL_TRUNCATION';

export interface ClassifiedNarrativeIssue {
  code: string;
  severity: NarrativeValidationSeverity;
  blocking: boolean;
  repairEligible: boolean;
  rationale: string;
}

export interface NarrativeRecoveryIssueInput {
  code: string;
  localSemanticEligible: boolean;
}

const HARD_TRUTH_CODES = new Set([
  'wrong_bible_version',
  'wrong_product_tier',
  'organisation_mismatch',
  'missing_section',
  'unexpected_section',
  'duplicate_section',
  'unknown_claim_ref',
  'missing_provenance',
  'unsupported_numeric_claim',
  'raw_question_id',
  'raw_internal_id',
  'raw_machine_identifier',
  'raw_enum',
  'assurance_claim',
  'invented_finding',
  'invented_scenario',
  'invented_owner',
  'invented_timing',
  'empty_required_chapter'
]);

const REPAIRABLE_CODES = new Set([
  'duplicate_statement',
  'malformed_transition',
  'customer_facing_internal_wording',
  'ambiguous_assurance_language',
  'local_semantic_contradiction',
  'repeated_management_takeaway'
]);

const QUALITY_CODES = new Set([
  'repetition',
  'mechanical_tone',
  'generic_heading',
  'weak_rhythm',
  'excess_disclaimer',
  'weak_executive_communication'
]);

const TECHNICAL_CODES = new Set(['technical_truncation']);

export function classifyNarrativeIssue(code: string): ClassifiedNarrativeIssue {
  if (TECHNICAL_CODES.has(code)) return { code, severity: 'TECHNICAL_TRUNCATION', blocking: true, repairEligible: false, rationale: 'The provider stopped at the technical output boundary before the deterministic Blueprint tail was complete; one bounded tail completion is permitted.' };
  if (HARD_TRUTH_CODES.has(code)) return { code, severity: 'HARD_TRUTH_FAILURE', blocking: true, repairEligible: false, rationale: 'The report would no longer be grounded in deterministic truth or the fixed report contract.' };
  if (REPAIRABLE_CODES.has(code)) return { code, severity: 'REPAIRABLE_SEMANTIC_FAILURE', blocking: true, repairEligible: true, rationale: 'A bounded local correction may resolve the semantic defect without changing deterministic meaning.' };
  if (QUALITY_CODES.has(code)) return { code, severity: 'QUALITY_FAILURE', blocking: false, repairEligible: false, rationale: 'The defect affects editorial quality and cannot redefine deterministic truth.' };
  return { code, severity: 'HARD_TRUTH_FAILURE', blocking: true, repairEligible: false, rationale: 'Unknown validation codes fail closed until explicitly classified.' };
}

/**
 * Release severity and recovery eligibility are deliberately separate. Assurance language
 * remains a blocking hard-truth validation result, but an otherwise grounded local wording
 * defect can be corrected in a bounded block without weakening the validator.
 */
export function classifyNarrativeRecoveryIssue(input: NarrativeRecoveryIssueInput): ClassifiedNarrativeIssue {
  const base = classifyNarrativeIssue(input.code);
  if (input.code === 'assurance_claim' && input.localSemanticEligible) {
    return {
      ...base,
      severity: 'REPAIRABLE_SEMANTIC_FAILURE',
      repairEligible: true,
      rationale: 'The assurance wording remains release-blocking until corrected, but the defect is local to otherwise grounded customer prose and may receive bounded semantic repair.'
    };
  }
  return base;
}

export function classifyNarrativeIssues(codes: string[]): ClassifiedNarrativeIssue[] {
  return codes.map(classifyNarrativeIssue);
}

export function canReleaseNarrative(codes: string[]): boolean {
  return classifyNarrativeIssues(codes).every((issue) => !issue.blocking);
}

export function repairEligibleCodes(codes: string[]): string[] {
  return classifyNarrativeIssues(codes).filter((issue) => issue.repairEligible).map((issue) => issue.code);
}

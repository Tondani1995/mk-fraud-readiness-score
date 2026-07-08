import type { MethodologyQuestion } from '@/lib/types/domain';

export type ExposureSelectionMap = Record<string, string | null | undefined>;

export type NAEligibilityResult = {
  allowed: boolean;
  reason: string;
  requiresSystemProfileRule: boolean;
};

function isNone(value: string | null | undefined): boolean {
  return value === 'none';
}

function missing(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => value === null || value === undefined || value === '');
}

export function evaluateNAEligibility(question: Pick<MethodologyQuestion, 'questionCode' | 'nAAllowed' | 'nARuleKey' | 'isHardGate'>, exposure: ExposureSelectionMap): NAEligibilityResult {
  if (!question.nAAllowed) {
    return { allowed: false, reason: 'This question must be answered for the assessment to be complete.', requiresSystemProfileRule: false };
  }

  const ruleKey = question.nARuleKey;
  if (!ruleKey) {
    return { allowed: false, reason: 'This question needs an answer unless MK has configured a specific applicability rule for it.', requiresSystemProfileRule: question.isHardGate };
  }

  const exp01 = exposure['EXP-01'];
  const exp02 = exposure['EXP-02'];
  const exp03 = exposure['EXP-03'];
  const exp04 = exposure['EXP-04'];

  switch (ruleKey) {
    case 'profile_rule_d2_q05':
    case 'profile_rule_d7_q05':
    case 'profile_rule_d7_q07': {
      if (missing(exp02)) return { allowed: false, reason: 'Complete the supplier and third-party exposure question before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(exp02),
        reason: isNone(exp02) ? 'Supplier and third-party exposure has been marked as none.' : 'Supplier or third-party exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d2_q08':
    case 'profile_rule_d8_q01':
    case 'profile_rule_d8_q08': {
      if (missing(exp03, exp04)) return { allowed: false, reason: 'Complete the digital channel and identity-data exposure questions before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      const allowed = isNone(exp03) && isNone(exp04);
      return {
        allowed,
        reason: allowed ? 'Digital channel and identity-data exposure have both been marked as none.' : 'Digital or identity-data exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d8_q02':
    case 'profile_rule_d8_q05': {
      if (missing(exp03)) return { allowed: false, reason: 'Complete the digital channel exposure question before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(exp03),
        reason: isNone(exp03) ? 'Digital channel exposure has been marked as none.' : 'Digital channel exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d3_q05':
    case 'profile_rule_d3_q07': {
      if (missing(exp01)) return { allowed: false, reason: 'Complete the high-risk process exposure question before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(exp01),
        reason: isNone(exp01) ? 'High-risk process exposure has been marked as none.' : 'High-risk process exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d6_q05': {
      if (missing(exp02, exp03)) return { allowed: false, reason: 'Complete the supplier, third-party and digital exposure questions before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      const allowed = isNone(exp02) && isNone(exp03);
      return {
        allowed,
        reason: allowed ? 'No meaningful supplier, third-party or digital external-stakeholder exposure has been indicated.' : 'External stakeholder exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    default:
      return { allowed: false, reason: 'This question cannot be marked Not Applicable with the current exposure profile.', requiresSystemProfileRule: question.isHardGate };
  }
}

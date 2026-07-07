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
    return { allowed: false, reason: `${question.questionCode} does not allow N/A.`, requiresSystemProfileRule: false };
  }

  const ruleKey = question.nARuleKey;
  if (!ruleKey) {
    return { allowed: false, reason: `${question.questionCode} has no approved N/A applicability rule.`, requiresSystemProfileRule: question.isHardGate };
  }

  const exp01 = exposure['EXP-01'];
  const exp02 = exposure['EXP-02'];
  const exp03 = exposure['EXP-03'];
  const exp04 = exposure['EXP-04'];

  switch (ruleKey) {
    case 'profile_rule_d2_q05':
    case 'profile_rule_d7_q05':
    case 'profile_rule_d7_q07': {
      if (missing(exp02)) return { allowed: false, reason: 'Complete EXP-02 third-party and supplier dependency before using N/A.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(exp02),
        reason: isNone(exp02) ? 'Supplier/third-party exposure is marked as none.' : 'Supplier/third-party exposure is present, so this question is applicable.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d2_q08':
    case 'profile_rule_d8_q01':
    case 'profile_rule_d8_q08': {
      if (missing(exp03, exp04)) return { allowed: false, reason: 'Complete EXP-03 digital channel reliance and EXP-04 identity/personal-data dependency before using N/A.', requiresSystemProfileRule: question.isHardGate };
      const allowed = isNone(exp03) && isNone(exp04);
      return {
        allowed,
        reason: allowed ? 'Digital and identity exposure are both marked as none.' : 'Digital or identity exposure is present, so this question is applicable.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d8_q02':
    case 'profile_rule_d8_q05': {
      if (missing(exp03)) return { allowed: false, reason: 'Complete EXP-03 digital channel reliance before using N/A.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(exp03),
        reason: isNone(exp03) ? 'Digital channel reliance is marked as none.' : 'Digital channel reliance is present, so this question is applicable.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d3_q05':
    case 'profile_rule_d3_q07': {
      if (missing(exp01)) return { allowed: false, reason: 'Complete EXP-01 high-risk process footprint before using N/A.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(exp01),
        reason: isNone(exp01) ? 'High-risk process footprint is marked as none.' : 'High-risk process exposure is present, so this question is applicable.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d6_q05': {
      if (missing(exp02, exp03)) return { allowed: false, reason: 'Complete EXP-02 and EXP-03 before using N/A for external stakeholder reporting.', requiresSystemProfileRule: question.isHardGate };
      const allowed = isNone(exp02) && isNone(exp03);
      return {
        allowed,
        reason: allowed ? 'No meaningful supplier/third-party or digital external-stakeholder exposure is indicated.' : 'External stakeholder exposure is present, so this question is applicable.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    default:
      return { allowed: false, reason: `${question.questionCode} uses an unrecognised N/A rule key: ${ruleKey}.`, requiresSystemProfileRule: question.isHardGate };
  }
}

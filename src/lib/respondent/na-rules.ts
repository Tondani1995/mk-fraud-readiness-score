export type ExposureSelectionMap = Record<string, string | null | undefined>;

export type NAEligibleQuestion = {
  nAAllowed: boolean;
  nARuleKey: string | null;
  isHardGate: boolean;
};

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

export function evaluateNAEligibility(question: NAEligibleQuestion, exposure: ExposureSelectionMap): NAEligibilityResult {
  if (!question.nAAllowed) {
    return { allowed: false, reason: 'This question must be answered for the assessment to be complete.', requiresSystemProfileRule: false };
  }

  const ruleKey = question.nARuleKey;
  if (!ruleKey) {
    return { allowed: false, reason: 'This question needs an answer unless MK has configured a specific applicability rule for it.', requiresSystemProfileRule: question.isHardGate };
  }

  const highRiskProcessExposure = exposure['highRiskProcessExposure'];
  const thirdPartyExposure = exposure['thirdPartyExposure'];
  const digitalChannelExposure = exposure['digitalChannelExposure'];
  const identityDataExposure = exposure['identityDataExposure'];

  switch (ruleKey) {
    case 'profile_rule_d2_q05':
    case 'profile_rule_d7_q05':
    case 'profile_rule_d7_q07': {
      if (missing(thirdPartyExposure)) return { allowed: false, reason: 'Complete the supplier and third-party exposure question before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(thirdPartyExposure),
        reason: isNone(thirdPartyExposure) ? 'Supplier and third-party exposure has been marked as none.' : 'Supplier or third-party exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d2_q08':
    case 'profile_rule_d8_q01':
    case 'profile_rule_d8_q08': {
      if (missing(digitalChannelExposure, identityDataExposure)) return { allowed: false, reason: 'Complete the digital channel and identity-data exposure questions before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      const allowed = isNone(digitalChannelExposure) && isNone(identityDataExposure);
      return {
        allowed,
        reason: allowed ? 'Digital channel and identity-data exposure have both been marked as none.' : 'Digital or identity-data exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d8_q02':
    case 'profile_rule_d8_q05': {
      if (missing(digitalChannelExposure)) return { allowed: false, reason: 'Complete the digital channel exposure question before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(digitalChannelExposure),
        reason: isNone(digitalChannelExposure) ? 'Digital channel exposure has been marked as none.' : 'Digital channel exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d3_q05':
    case 'profile_rule_d3_q07': {
      if (missing(highRiskProcessExposure)) return { allowed: false, reason: 'Complete the high-risk process exposure question before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      return {
        allowed: isNone(highRiskProcessExposure),
        reason: isNone(highRiskProcessExposure) ? 'High-risk process exposure has been marked as none.' : 'High-risk process exposure is present, so this question applies.',
        requiresSystemProfileRule: question.isHardGate
      };
    }

    case 'profile_rule_d6_q05': {
      if (missing(thirdPartyExposure, digitalChannelExposure)) return { allowed: false, reason: 'Complete the supplier, third-party and digital exposure questions before using Not Applicable here.', requiresSystemProfileRule: question.isHardGate };
      const allowed = isNone(thirdPartyExposure) && isNone(digitalChannelExposure);
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

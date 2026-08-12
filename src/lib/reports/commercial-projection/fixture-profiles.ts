import { comprehensiveFixtures } from '../comprehensive/fixtures';
import type { AdvisoryEvidenceModel } from '../evidence-model/types';
import type { ComprehensiveReviewerInput } from '../comprehensive/types';

export type CommercialFixtureProfile = {
  id: string;
  purpose: string;
  organisationName: string;
  score: number;
  maturity: string;
  model: AdvisoryEvidenceModel;
  reviewer: ComprehensiveReviewerInput;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fromSource(id: string, purpose: string, sourceKey: keyof typeof comprehensiveFixtures, score: number, maturity: string): CommercialFixtureProfile {
  const source = comprehensiveFixtures[sourceKey];
  return { id, purpose, organisationName: `Profile ${id}`, score, maturity, model: clone(source.analytical.evidenceModel), reviewer: clone(source.reviewer) };
}

function f3Profile(): CommercialFixtureProfile {
  const profile = fromSource('F3', 'Managed profile with supported evidence and no critical gaps.', 'fullVisibilityNonSystemicCase', 81, 'Managed');
  for (const finding of profile.model.materialFindings) {
    if (finding.gapClassification === 'critical') { finding.gapClassification = 'major'; finding.isCriticalControl = false; finding.isHardGate = false; }
  }
  for (const risk of profile.model.riskRegister) if (risk.priority === 'Critical') risk.priority = 'High';
  return profile;
}

export const commercialFixtureProfiles: Record<string, CommercialFixtureProfile> = {
  F1: fromSource('F1', 'Reactive profile with limited operating evidence.', 'weakOrganisationMeaningfulEvidence', 36, 'Reactive'),
  F2: fromSource('F2', 'Developing profile with meaningful reviewer evidence.', 'weakOrganisationMeaningfulEvidence', 55, 'Developing'),
  F3: f3Profile(),
  F4: fromSource('F4', 'Defined profile with material remediation actions.', 'mixedControlContradiction', 68, 'Defined'),
  F5: fromSource('F5', 'Sparse reactive profile with unresolved evidence.', 'strongSelfReportInsufficientEvidence', 44, 'Reactive'),
  F6: fromSource('F6', 'Developing profile with reviewer corrections applied.', 'fullVisibilityNonSystemicCase', 59, 'Developing')
};

export function getCommercialFixtureProfile(id: string): CommercialFixtureProfile {
  const profile = commercialFixtureProfiles[id];
  if (!profile) throw new Error(`Unknown commercial fixture ${id}`);
  return clone(profile);
}

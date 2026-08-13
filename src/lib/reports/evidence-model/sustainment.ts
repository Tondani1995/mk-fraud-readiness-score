import type { AssembledReportData } from '../types';
import type { MaterialFinding, NarrativeMode, SustainmentPriority } from './types';

const safeLower = (value: string): string => value.trim().replace(/[.;]+$/, '').replace(/^[A-Z]/, (letter) => letter.toLowerCase());

function focusFor(finding: MaterialFinding): string {
  const familyFocus: Record<string, string> = {
    FRAUD_GOVERNANCE: 'Preserve clear senior ownership, decision rights and escalation routes for fraud risk.',
    FRAUD_RISK_IDENTIFICATION: 'Keep the fraud-risk view current and connected to management review when the operating model changes.',
    CONTINUOUS_IMPROVEMENT: 'Keep control-effectiveness measures, review records and improvement actions in the normal management rhythm.',
    DETECTION_MONITORING: 'Preserve alert ownership, review discipline and timely escalation as detection coverage evolves.',
    PRIVILEGED_ACCESS: 'Preserve restricted, time-bounded access and recurring review of privileged activity.',
    ORDINARY_ACCESS: 'Preserve role-based access, recertification and timely exception closure.',
    IDENTITY_VERIFICATION: 'Preserve trusted identity checks and controlled approval of sensitive changes.',
    SUPPLIER_ONBOARDING: 'Preserve supplier due diligence and ownership checks before engagement.',
    SUPPLIER_PAYMENT_CHANGE: 'Preserve trusted-channel verification and approval for supplier payment changes.',
    THIRD_PARTY_OVERSIGHT: 'Preserve risk-tiered oversight and refresh of material third-party relationships.',
    INCIDENT_RESPONSE: 'Preserve clear intake, severity, containment and response ownership.',
    EVIDENCE_INTEGRITY: 'Preserve controlled retention, custody and traceability of fraud-related records.',
    WHISTLEBLOWING: 'Preserve accessible, protected reporting routes and independent case ownership.',
    FRAUD_AWARENESS: 'Preserve role-specific fraud awareness and timely reinforcement for higher-risk roles.'
  };
  return familyFocus[finding.primarySemanticFamily] ?? `Preserve the recorded control standard for ${safeLower(finding.questionPrompt || finding.title)}.`;
}

export function deriveNarrativeMode(data: AssembledReportData, findings: MaterialFinding[]): NarrativeMode {
  const nonAssurance = findings.filter((finding) => finding.materialityClass !== 'assurance_priority');
  const hasChangingCap = data.scoreRun.finalMaturity !== data.scoreRun.calculatedMaturity;
  const strongProfile = data.scoreRun.criticalGapCount === 0
    && data.scoreRun.majorGapCount === 0
    && !hasChangingCap
    && findings.every((finding) => finding.materialityClass === 'assurance_priority');
  if (strongProfile) return 'SUSTAINMENT';
  if (nonAssurance.length > 0 && findings.some((finding) => finding.materialityClass === 'assurance_priority')) return 'MIXED';
  return 'REMEDIATION';
}

export function buildSustainmentPriorities(findings: MaterialFinding[]): SustainmentPriority[] {
  return findings
    .filter((finding) => finding.materialityClass === 'assurance_priority')
    .sort((left, right) => right.materialityScore - left.materialityScore || left.questionCode.localeCompare(right.questionCode))
    .map((finding, index) => ({
      id: `SP-${String(index + 1).padStart(3, '0')}`,
      sourceFindingId: finding.id,
      questionCode: finding.questionCode,
      title: `Sustain ${finding.domainName.toLowerCase()} readiness`,
      domainCode: finding.domainCode,
      domainName: finding.domainName,
      primarySemanticFamily: finding.primarySemanticFamily,
      responseLabel: finding.responseLabel,
      responseOperationalMeaning: finding.responseOperationalMeaning,
      currentStrongStandard: finding.expectedControlStandard || finding.responseOperationalMeaning,
      managementFocus: focusFor(finding),
      accountableExecutive: finding.accountableOwner || 'Chief Executive / Managing Director',
      processOwner: finding.processOwner || 'Head of Risk',
      operatingFrequency: finding.operatingFrequency || 'At least annually and after material change',
      proofRetained: finding.evidenceToRequest.length > 0 ? finding.evidenceToRequest : ['Current ownership record', 'Scheduled management review record', 'Exception and action log'],
      deteriorationTrigger: finding.escalationThreshold || 'Material change in process, system, product, supplier, role ownership or fraud exposure.',
      effectivenessIndicator: finding.effectivenessMeasure || 'Review cadence remains current, exceptions are assigned and actions close within the agreed rhythm.',
      dependencies: finding.dependencies
    }));
}

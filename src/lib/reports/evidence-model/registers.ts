import { getDomainPlaybook } from './domain-playbooks';
import type { ControlImprovementEntry, EvidenceChecklistItem, Impact, Likelihood, MaterialFinding, RiskRegisterEntry } from './types';

function likelihoodFor(finding: MaterialFinding): Likelihood {
  if (finding.isHardGate) return 'High';
  if (finding.isCriticalControl) return 'Moderate';
  return 'Low';
}

function impactFor(finding: MaterialFinding): Impact {
  if (finding.isHardGate && finding.maturityCapStatus === 'capping') return 'Severe';
  if (finding.isCriticalControl) return 'High';
  return 'Moderate';
}

function priorityFor(likelihood: Likelihood, impact: Impact): RiskRegisterEntry['priority'] {
  if (impact === 'Severe' && likelihood !== 'Low') return 'Critical';
  if (impact === 'High' && likelihood === 'High') return 'Critical';
  if (impact === 'High' || likelihood === 'High') return 'High';
  if (impact === 'Moderate' || likelihood === 'Moderate') return 'Medium';
  return 'Low';
}

function targetDateFor(period: MaterialFinding['targetPeriod']): string {
  const days = period === '30 days' ? 30 : period === '60 days' ? 60 : 90;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildRiskRegister(findings: MaterialFinding[]): RiskRegisterEntry[] {
  return findings.map((finding, index) => {
    const likelihood = likelihoodFor(finding);
    const impact = impactFor(finding);
    const cause = finding.questionPrompt.replace(/\.$/, '').toLowerCase();
    return {
      id: `RR-${String(index + 1).padStart(2, '0')}`,
      title: finding.title,
      riskStatement: `Because ${cause} (assessed as "${finding.responseMeaning}"), ${finding.fraudMechanism.charAt(0).toLowerCase()}${finding.fraudMechanism.slice(1)}`,
      linkedFindingIds: [finding.id],
      affectedDomain: finding.domainName,
      likelihood,
      impact,
      priority: priorityFor(likelihood, impact),
      currentControlPosition: `${finding.responseMeaning} (self-assessed, not independently verified)`,
      requiredTreatment: finding.recommendedControl,
      accountableOwner: finding.accountableOwner,
      targetDate: targetDateFor(finding.targetPeriod),
      effectivenessMeasure: finding.effectivenessMeasure,
      assessmentConfidence: 'Self-assessment only, not independently verified',
      remainingLimitation: finding.selfAssessmentLimitation
    } satisfies RiskRegisterEntry;
  });
}

export function buildControlImprovementRegister(findings: MaterialFinding[], riskRegister: RiskRegisterEntry[]): ControlImprovementEntry[] {
  return findings.map((finding, index) => {
    const playbook = getDomainPlaybook(finding.domainCode);
    const risk = riskRegister.find((r) => r.linkedFindingIds.includes(finding.id));
    return {
      id: `CI-${String(index + 1).padStart(2, '0')}`,
      linkedFindingId: finding.id,
      linkedRiskId: risk?.id ?? '',
      currentState: `${finding.questionPrompt} -- ${finding.responseMeaning}`,
      targetState: playbook.expectedControlStandard,
      controlObjective: `Bring ${finding.domainName} up to the expected control standard for this specific control, closing the gap that produced a "${finding.gapClassification}" finding.`,
      controlDesign: playbook.recommendedControl,
      accountableOwner: playbook.accountableOwner,
      oversightOwner: playbook.oversightFunction,
      supportingFunctions: playbook.supportingFunctions,
      operatingFrequency: playbook.operatingFrequency,
      requiredEvidence: playbook.evidenceItems.map((item) => item.artefact),
      implementationDependency: finding.isHardGate ? 'Should be sequenced ahead of lower-priority improvements given its effect on the overall maturity reading.' : 'No blocking dependency identified from the assessment alone.',
      implementationDifficulty: playbook.implementationDifficulty,
      targetPeriod: finding.targetPeriod,
      effectivenessTest: playbook.effectivenessMeasure,
      escalationThreshold: playbook.escalationThreshold
    } satisfies ControlImprovementEntry;
  });
}

export function buildEvidenceChecklist(findings: MaterialFinding[], riskRegister: RiskRegisterEntry[]): EvidenceChecklistItem[] {
  const items: EvidenceChecklistItem[] = [];
  const seenArtefacts = new Set<string>();
  let seq = 0;
  for (const finding of findings) {
    const playbook = getDomainPlaybook(finding.domainCode);
    const risk = riskRegister.find((r) => r.linkedFindingIds.includes(finding.id));
    for (const evidenceItem of playbook.evidenceItems) {
      const dedupeKey = evidenceItem.artefact.trim().toLowerCase();
      if (seenArtefacts.has(dedupeKey)) continue;
      seenArtefacts.add(dedupeKey);
      items.push({
        id: `EV-${String(++seq).padStart(2, '0')}`,
        artefact: evidenceItem.artefact,
        linkedFindingId: finding.id,
        linkedRiskId: risk?.id ?? '',
        likelyOwner: playbook.accountableOwner,
        provesWhat: evidenceItem.provesWhat,
        expectedRecency: evidenceItem.expectedRecency,
        minimumAcceptableCharacteristics: evidenceItem.minimumCharacteristics,
        reviewStatus: 'Not yet requested'
      });
    }
  }
  return items;
}

import type { ControlImprovementEntry, EvidenceChecklistItem, Impact, Likelihood, MaterialFinding, RiskRegisterEntry } from './types';

function likelihoodFor(finding: MaterialFinding): Likelihood {
  if (finding.materialityClass === 'assurance_priority') return 'Low';
  if (finding.isHardGate) return 'High';
  if (finding.isCriticalControl) return 'Moderate';
  return 'Low';
}

function impactFor(finding: MaterialFinding): Impact {
  if (finding.materialityClass === 'assurance_priority') return 'Low';
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
    const risk = riskRegister.find((r) => r.linkedFindingIds.includes(finding.id));
    return {
      id: `CI-${String(index + 1).padStart(2, '0')}`,
      linkedFindingId: finding.id,
      linkedRiskId: risk?.id ?? '',
      currentState: `${finding.questionPrompt} -- ${finding.responseMeaning}`,
      targetState: finding.expectedControlStandard,
      controlObjective: finding.materialityClass === 'assurance_priority'
        ? `Validate that the self-reported control state for ${finding.questionCode} is supported by current operating evidence.`
        : `Close the recorded ${finding.gapClassification} control position for ${finding.questionCode}.`,
      controlDesign: finding.recommendedControl,
      accountableOwner: finding.processOwner || finding.accountableOwner,
      oversightOwner: finding.oversightFunction,
      supportingFunctions: finding.supportingFunctions,
      operatingFrequency: finding.operatingFrequency,
      requiredEvidence: finding.evidenceToRequest,
      implementationDependency: finding.dependencies.join('; ') || 'No blocking dependency identified from the assessment alone.',
      implementationDifficulty: finding.implementationDifficulty,
      targetPeriod: finding.targetPeriod,
      effectivenessTest: finding.effectivenessMeasure,
      escalationThreshold: finding.escalationThreshold
    } satisfies ControlImprovementEntry;
  });
}

export function buildEvidenceChecklist(findings: MaterialFinding[], riskRegister: RiskRegisterEntry[]): EvidenceChecklistItem[] {
  const items: EvidenceChecklistItem[] = [];
  const seenArtefacts = new Set<string>();
  let seq = 0;
  for (const finding of findings) {
    const risk = riskRegister.find((r) => r.linkedFindingIds.includes(finding.id));
    for (let index = 0; index < finding.evidenceToRequest.length; index += 1) {
      const artefact = finding.evidenceToRequest[index];
      const dedupeKey = artefact.trim().toLowerCase();
      if (seenArtefacts.has(dedupeKey)) continue;
      seenArtefacts.add(dedupeKey);
      items.push({
        id: `EV-${String(++seq).padStart(2, '0')}`,
        artefact,
        linkedFindingId: finding.id,
        linkedRiskId: risk?.id ?? '',
        likelyOwner: finding.processOwner || finding.accountableOwner,
        provesWhat: `Whether ${finding.questionCode} operates to the stated control standard.`,
        expectedRecency: finding.operatingFrequency,
        minimumAcceptableCharacteristics: finding.minimumEvidenceCharacteristics[index] ?? finding.minimumEvidenceCharacteristics.join('; '),
        reviewStatus: 'Not yet requested'
      });
    }
  }
  return items;
}

import { earliestPeriod, stableToken, stableUnique } from './deterministic';
import { riskPathwayForFinding } from './risk-pathways';
import type { ControlImprovementEntry, EvidenceChecklistItem, Impact, Likelihood, MaterialFinding, RiskRegisterEntry } from './types';

const PRIORITY_MATRIX: Record<Likelihood, Record<Impact, RiskRegisterEntry['priority']>> = {
  Low: { Low: 'Low', Moderate: 'Medium', High: 'High', Severe: 'High' },
  Moderate: { Low: 'Medium', Moderate: 'Medium', High: 'High', Severe: 'Critical' },
  High: { Low: 'Medium', Moderate: 'High', High: 'Critical', Severe: 'Critical' }
};

/** Qualitative self-assessment rules only; these labels are not statistical probabilities. */
export function deriveRiskRatings(findings: MaterialFinding[], consequence: Impact) {
  const isAssuranceOnly = findings.every((finding) => finding.materialityClass === 'assurance_priority');
  const hasHighPressure = findings.some((finding) =>
    (finding.isHardGate || finding.maturityCapStatus === 'capping') &&
    ((finding.responseValue ?? 5) <= 1 || finding.linkedExposureFactorCodes.length >= 2)
  );
  const hasMaterialPressure = findings.some((finding) =>
    finding.isCriticalControl || finding.linkedExposureFactorCodes.length > 0 ||
    finding.selectionReasons.includes('PRIORITY_SCENARIO_ENABLER') ||
    finding.selectionReasons.includes('CROSS_DOMAIN_DEPENDENCY')
  );
  const likelihood: Likelihood = isAssuranceOnly ? 'Low' : hasHighPressure ? 'High' : hasMaterialPressure ? 'Moderate' : 'Low';
  const likelihoodRationale = isAssuranceOnly
    ? 'The control is self-reported as operating; likelihood remains Low pending independent operating-evidence validation.'
    : hasHighPressure
      ? 'The self-assessment records a hard-gate or maturity-limiting weakness with a very low response or multiple linked exposure factors; this supports a High qualitative likelihood, not a statistical probability.'
      : hasMaterialPressure
        ? 'Critical-control, exposure, scenario or dependency evidence supports a Moderate qualitative likelihood, not a statistical probability.'
        : 'The available self-assessment evidence supports a Low qualitative likelihood, subject to evidence validation.';
  const impactRationale = `${consequence} impact reflects the plausible consequence pathway and the critical, hard-gate, exposure and cap evidence linked to the consolidated findings.`;
  return { likelihood, likelihoodRationale, impact: consequence, impactRationale, priority: PRIORITY_MATRIX[likelihood][consequence] };
}

export function buildRiskRegister(findings: MaterialFinding[]): RiskRegisterEntry[] {
  const groups = new Map<string, MaterialFinding[]>();
  for (const finding of [...findings].sort((a, b) => a.questionCode.localeCompare(b.questionCode))) {
    const pathway = riskPathwayForFinding(finding);
    groups.set(pathway.key, [...(groups.get(pathway.key) ?? []), finding]);
  }

  return [...groups.entries()].map(([pathwayKey, groupedFindings]) => {
    const ordered = [...groupedFindings].sort((a, b) => b.materialityScore - a.materialityScore || a.questionCode.localeCompare(b.questionCode));
    const lead = ordered[0];
    const pathway = riskPathwayForFinding(lead);
    const ratings = deriveRiskRatings(ordered, pathway.consequence);
    const impacts = stableUnique([
      pathway.financialImpact, pathway.operationalImpact,
      pathway.legalRegulatoryImpact ?? '', pathway.reputationalImpact ?? ''
    ]).join('; ');
    const evidenceRefs = stableUnique(ordered.flatMap((finding) => [`finding:${finding.id}`, `question:${finding.questionCode}`]));
    const affectedDomains = stableUnique(ordered.map((finding) => finding.domainCode));
    const accountableExecutive = lead.accountableOwner;
    const processOwner = lead.processOwner || lead.accountableOwner;
    const oversightFunction = lead.oversightFunction;
    const targetPeriod = earliestPeriod(ordered.map((finding) => finding.targetPeriod));
    return {
      id: `RISK-${pathwayKey}`,
      title: pathway.title,
      cause: pathway.cause,
      riskEvent: pathway.riskEvent,
      financialImpact: pathway.financialImpact,
      operationalImpact: pathway.operationalImpact,
      legalRegulatoryImpact: pathway.legalRegulatoryImpact,
      reputationalImpact: pathway.reputationalImpact,
      riskStatement: `Because ${pathway.cause}, there is a risk that ${pathway.riskEvent}, resulting in ${impacts}.`,
      linkedFindingIds: stableUnique(ordered.map((finding) => finding.id)),
      linkedQuestionCodes: stableUnique(ordered.map((finding) => finding.questionCode)),
      linkedScenarioIds: [],
      affectedDomains,
      affectedDomain: affectedDomains.join(', '),
      ...ratings,
      currentControlPosition: stableUnique(ordered.map((finding) => `${finding.questionCode}: ${finding.responseMeaning}`)).join('; '),
      requiredTreatment: stableUnique(ordered.map((finding) => finding.recommendedControl)).join(' '),
      accountableExecutive,
      processOwner,
      oversightFunction,
      targetPeriod,
      accountableOwner: accountableExecutive,
      targetDate: targetPeriod,
      effectivenessMeasure: stableUnique(ordered.map((finding) => finding.effectivenessMeasure)).join('; '),
      evidenceRefs,
      assessmentConfidence: 'Self-assessment only, not independently verified',
      remainingLimitation: 'No document, interview, transaction sample or system evidence has been independently verified.'
    } satisfies RiskRegisterEntry;
  }).sort((a, b) => {
    const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    return rank[b.priority] - rank[a.priority] || a.id.localeCompare(b.id);
  });
}

export function buildControlImprovementRegister(findings: MaterialFinding[], risks: RiskRegisterEntry[]): ControlImprovementEntry[] {
  return [...findings].sort((a, b) => a.questionCode.localeCompare(b.questionCode)).map((finding) => {
    const linkedRisks = risks.filter((risk) => risk.linkedFindingIds.includes(finding.id));
    const linkedRiskIds = stableUnique(linkedRisks.map((risk) => risk.id));
    return {
      id: `CI-${finding.questionCode}`,
      linkedFindingId: finding.id,
      linkedRiskId: linkedRiskIds[0] ?? '',
      linkedRiskIds,
      linkedQuestionCode: finding.questionCode,
      currentState: `${finding.responseMeaning}; self-assessed and not independently verified.`,
      targetState: finding.expectedControlStandard,
      controlObjective: finding.materialityClass === 'assurance_priority'
        ? `Validate that ${finding.questionCode} operates to its exact expected standard.`
        : `Close the material control weakness recorded for ${finding.questionCode}.`,
      controlDesign: finding.recommendedControl,
      accountableExecutive: finding.accountableOwner,
      processOwner: finding.processOwner || finding.accountableOwner,
      oversightFunction: finding.oversightFunction,
      accountableOwner: finding.processOwner || finding.accountableOwner,
      oversightOwner: finding.oversightFunction,
      supportingFunctions: stableUnique(finding.supportingFunctions),
      operatingFrequency: finding.operatingFrequency,
      completePopulationCoverage: `The complete in-scope population for ${finding.operatingFrequency.toLowerCase()} must be reconciled before sampling.`,
      evidenceRetained: stableUnique(finding.evidenceToRequest),
      requiredEvidence: stableUnique(finding.evidenceToRequest),
      minimumEvidenceCharacteristics: stableUnique(finding.minimumEvidenceCharacteristics),
      dependencies: stableUnique(finding.dependencies),
      implementationDependency: stableUnique(finding.dependencies).join('; ') || 'No blocking dependency identified from the assessment evidence.',
      implementationDifficulty: finding.implementationDifficulty,
      targetPeriod: finding.targetPeriod,
      effectivenessTest: finding.effectivenessMeasure,
      escalationThreshold: finding.escalationThreshold,
      evidenceRefs: stableUnique([`finding:${finding.id}`, `question:${finding.questionCode}`, ...linkedRiskIds.map((id) => `risk:${id}`)])
    } satisfies ControlImprovementEntry;
  });
}

export function buildEvidenceChecklist(findings: MaterialFinding[], risks: RiskRegisterEntry[]): EvidenceChecklistItem[] {
  const groups = new Map<string, { artefact: string; findings: MaterialFinding[] }>();
  for (const finding of [...findings].sort((a, b) => a.questionCode.localeCompare(b.questionCode))) {
    for (const artefact of stableUnique(finding.evidenceToRequest)) {
      const key = artefact.normalize('NFKC').trim().toLowerCase();
      const existing = groups.get(key) ?? { artefact, findings: [] };
      existing.findings.push(finding);
      groups.set(key, existing);
    }
  }

  return [...groups.values()].sort((a, b) => a.artefact.localeCompare(b.artefact)).map(({ artefact, findings: linked }) => {
    const linkedFindingIds = stableUnique(linked.map((finding) => finding.id));
    const linkedQuestionCodes = stableUnique(linked.map((finding) => finding.questionCode));
    const linkedRiskIds = stableUnique(risks.filter((risk) => risk.linkedFindingIds.some((id) => linkedFindingIds.includes(id))).map((risk) => risk.id));
    const evidenceRef = `evidence:EVID-${stableToken(artefact)}`;
    return {
      id: evidenceRef.slice('evidence:'.length),
      artefact,
      linkedFindingIds,
      linkedRiskIds,
      linkedQuestionCodes,
      linkedFindingId: linkedFindingIds[0] ?? '',
      linkedRiskId: linkedRiskIds[0] ?? '',
      likelyOwner: stableUnique(linked.map((finding) => finding.processOwner || finding.accountableOwner)).join(' / '),
      provesWhat: `Whether ${linkedQuestionCodes.join(', ')} operates to the exact expected control standard across the complete in-scope population.`,
      expectedRecency: stableUnique(linked.map((finding) => finding.operatingFrequency)).join('; '),
      requiredPopulation: 'Complete in-scope population for the stated operating period, reconciled to the source system or register.',
      samplingExpectation: 'Review the complete population where feasible; otherwise use a documented risk-based sample including exceptions, changes and overdue items.',
      minimumAcceptableCharacteristics: stableUnique(linked.flatMap((finding) => finding.minimumEvidenceCharacteristics)),
      reviewStatus: 'Not yet requested',
      evidenceRef
    } satisfies EvidenceChecklistItem;
  });
}

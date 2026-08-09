import { earliestPeriod, stableToken, stableUnique } from './deterministic';
import { riskPathwayForFinding } from './risk-pathways';
import type { ControlImprovementEntry, EvidenceChecklistItem, Impact, Likelihood, MaterialFinding, RiskRegisterEntry, VisibilityGap } from './types';

const PRIORITY_MATRIX: Record<Likelihood, Record<Impact, RiskRegisterEntry['priority']>> = {
  Low: { Low: 'Low', Moderate: 'Medium', High: 'High', Severe: 'High' },
  Moderate: { Low: 'Medium', Moderate: 'Medium', High: 'High', Severe: 'Critical' },
  High: { Low: 'Medium', Moderate: 'High', High: 'Critical', Severe: 'Critical' }
};

/** Qualitative self-assessment rules only; these labels are not statistical probabilities. */
/**
 * Impact fragments are authored as complete sentences and some carry a directness label
 * ("Direct -- ...", "Indirect -- ..."). Joining them raw with "; " after "resulting in" and then
 * appending a full stop produced the V7 artefact:
 *   "...resulting in Alert backlogs can conceal important anomalies.; Direct -- unreviewed
 *    exceptions can allow losses to compound.."
 * i.e. ".;", "..", a raw label, and a capitalised fragment mid-sentence.
 *
 * Each clause is normalised ONCE here -- label removed, trailing terminator removed, whitespace
 * collapsed -- and the terminator is applied once by the caller. Nothing is "cleaned up" after
 * concatenation, and no wording is invented: only the label prefix and duplicate punctuation go.
 */
export function consequenceClause(fragment: string | null | undefined): string {
  return (fragment ?? '')
    .replace(/^\s*(?:Direct|Indirect)\s*--\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.;,]+$/, '')
    .trim();
}

/**
 * exposureAssessed defaults to true so existing callers are unchanged. When exposure was NOT
 * assessed, no exposure evidence exists, so linkedExposureFactorCodes cannot legitimately influence
 * either the rating or the rationale: V7 was an adaptive assessment with no exposure score or band,
 * yet the register still spoke of "multiple linked exposure factors" and "critical, hard-gate,
 * exposure and cap evidence". Nothing is substituted in its place -- the reasoning simply falls back
 * to the control, hard-gate, cap, scenario and dependency evidence that IS supported.
 */
export function deriveRiskRatings(findings: MaterialFinding[], consequence: Impact, exposureAssessed = true) {
  const isAssuranceOnly = findings.every((finding) => finding.materialityClass === 'assurance_priority');
  const exposureCodesFor = (finding: MaterialFinding) =>
    exposureAssessed ? finding.linkedExposureFactorCodes : [];
  const linkedHighSevereExposureCodes = stableUnique(findings.flatMap(exposureCodesFor));
  const assuranceExposurePressure = isAssuranceOnly && linkedHighSevereExposureCodes.length > 0;
  const hasHighPressure = findings.some((finding) =>
    (finding.isHardGate || finding.maturityCapStatus === 'capping') &&
    ((finding.responseValue ?? 5) <= 1 || exposureCodesFor(finding).length >= 2)
  );
  const hasMaterialPressure = findings.some((finding) =>
    finding.isCriticalControl || exposureCodesFor(finding).length > 0 ||
    finding.selectionReasons.includes('PRIORITY_SCENARIO_ENABLER') ||
    finding.selectionReasons.includes('CROSS_DOMAIN_DEPENDENCY')
  );
  const likelihood: Likelihood = isAssuranceOnly
    ? assuranceExposurePressure ? 'Moderate' : 'Low'
    : hasHighPressure ? 'High' : hasMaterialPressure ? 'Moderate' : 'Low';
  const likelihoodRationale = isAssuranceOnly
    ? assuranceExposurePressure
      ? `The control is self-reported as operating and no control failure is asserted. Linked high/severe exposure (${linkedHighSevereExposureCodes.join(', ')}) increases the need for independent operating-evidence validation; this supports a Moderate qualitative likelihood, not a statistical probability.`
      : 'The control is self-reported as operating and no control failure is asserted. No linked high/severe exposure was identified; likelihood remains Low pending independent operating-evidence validation. This is a qualitative rating, not a statistical probability.'
    : hasHighPressure
      ? (exposureAssessed
        ? 'The self-assessment records a hard-gate or maturity-limiting weakness with a very low response or multiple linked exposure factors; this supports a High qualitative likelihood, not a statistical probability.'
        : 'The self-assessment records a hard-gate or maturity-limiting weakness with a very low response; this supports a High qualitative likelihood, not a statistical probability.')
      : hasMaterialPressure
        ? (exposureAssessed
          ? 'Critical-control, exposure, scenario or dependency evidence supports a Moderate qualitative likelihood, not a statistical probability.'
          : 'Critical-control, scenario or dependency evidence supports a Moderate qualitative likelihood, not a statistical probability.')
        : 'The available self-assessment evidence supports a Low qualitative likelihood, subject to evidence validation.';
  const impactRationale = exposureAssessed
    ? `${consequence} impact reflects the plausible consequence pathway and the critical, hard-gate, exposure and cap evidence linked to the consolidated findings.`
    : `${consequence} impact reflects the plausible consequence pathway and the critical, hard-gate and cap evidence linked to the consolidated findings.`;
  return { likelihood, likelihoodRationale, impact: consequence, impactRationale, priority: PRIORITY_MATRIX[likelihood][consequence] };
}

export function buildRiskRegister(findings: MaterialFinding[], exposureAssessed = true): RiskRegisterEntry[] {
  const groups = new Map<string, MaterialFinding[]>();
  for (const finding of [...findings].sort((a, b) => a.questionCode.localeCompare(b.questionCode))) {
    const pathway = riskPathwayForFinding(finding);
    groups.set(pathway.key, [...(groups.get(pathway.key) ?? []), finding]);
  }

  return [...groups.entries()].map(([pathwayKey, groupedFindings]) => {
    const ordered = [...groupedFindings].sort((a, b) => b.materialityScore - a.materialityScore || a.questionCode.localeCompare(b.questionCode));
    const lead = ordered[0];
    const pathway = riskPathwayForFinding(lead);
    // Blocker 1 (Checkpoint F controller review): a risk grouped entirely from assurance_priority
    // findings must never assert failure/absence as a present fact. Preserve the reported strong
    // state, make the cause the absence of independent validation, and make the risk event
    // conditional -- never reuse the raw failure-toned pathway text and append a disclaimer.
    const isAssurance = ordered.every((finding) => finding.materialityClass === 'assurance_priority');
    const title = isAssurance ? pathway.resilienceTitle : pathway.title;
    const cause = isAssurance ? pathway.resilienceCause : pathway.cause;
    const riskEvent = isAssurance ? pathway.resilienceRiskEvent : pathway.riskEvent;
    const ratings = deriveRiskRatings(ordered, pathway.consequence, exposureAssessed);
    // The financial/operational/legal/reputational impact fields are rendered directly as their own
    // labelled fields in the PDF (see report-template.ts riskCards), not only inside riskStatement --
    // so an assurance-only risk must condition these individually too, not just the cause/riskEvent/
    // riskStatement fields, or the raw failure-toned pathway impact text still leaks into the report.
    const conditionalImpact = (value: string) => isAssurance ? `If independent validation identifies a defect: ${value}` : value;
    const financialImpact = conditionalImpact(pathway.financialImpact);
    const operationalImpact = conditionalImpact(pathway.operationalImpact);
    const legalRegulatoryImpact = pathway.legalRegulatoryImpact ? conditionalImpact(pathway.legalRegulatoryImpact) : pathway.legalRegulatoryImpact;
    const reputationalImpact = pathway.reputationalImpact ? conditionalImpact(pathway.reputationalImpact) : pathway.reputationalImpact;
    const evidenceRefs = stableUnique(ordered.flatMap((finding) => [`finding:${finding.id}`, `question:${finding.questionCode}`]));
    const affectedDomains = stableUnique(ordered.map((finding) => finding.domainCode));
    const accountableExecutive = lead.accountableOwner;
    const processOwner = lead.processOwner || lead.accountableOwner;
    const oversightFunction = lead.oversightFunction;
    const targetPeriod = earliestPeriod(ordered.map((finding) => finding.targetPeriod));
    const redesignClause = stableUnique(ordered.map((finding) => finding.recommendedControl)).join(' ');
    return {
      id: `RISK-${pathwayKey}`,
      title,
      cause,
      riskEvent,
      financialImpact,
      operationalImpact,
      legalRegulatoryImpact,
      reputationalImpact,
      riskStatement: isAssurance
        ? `Because ${cause}, there is a risk that ${riskEvent}. This does not assert a control defect. The potential financial, operational, legal and reputational consequence is set out in the linked impact fields below, and applies only if independent validation identifies a defect.`
        : (() => {
          // Consequences are presented as their own sentence rather than inlined after "resulting
          // in", so a clause that legitimately begins with a capitalised term reads correctly and
          // no clause needs its first letter rewritten.
          const clauses = stableUnique([
            pathway.financialImpact,
            pathway.operationalImpact,
            pathway.legalRegulatoryImpact ?? '',
            pathway.reputationalImpact ?? ''
          ].map(consequenceClause).filter((clause) => clause.length > 0));
          const base = `Because ${cause}, there is a risk that ${riskEvent}`;
          return clauses.length > 0
            ? `${base}. Consequence pathway: ${clauses.join('; ')}.`
            : `${base}.`;
        })(),
      linkedFindingIds: stableUnique(ordered.map((finding) => finding.id)),
      linkedQuestionCodes: stableUnique(ordered.map((finding) => finding.questionCode)),
      linkedScenarioIds: [],
      affectedDomains,
      affectedDomain: affectedDomains.join(', '),
      ...ratings,
      currentControlPosition: stableUnique(ordered.map((finding) => `${finding.domainName}: ${consequenceClause(finding.responseMeaning)}`)).join('; '),
      requiredTreatment: isAssurance
        ? `Independently validate the reported control(s) across the complete population, required frequency and under pressure before relying on the self-assessment. If validation identifies a defect, apply: ${redesignClause}`
        : redesignClause,
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
        ? `Validate that "${finding.questionPrompt.replace(/\.$/, '')}" operates to its exact expected standard.`
        : `Close the material control weakness recorded for "${finding.questionPrompt.replace(/\.$/, '')}".`,
      controlDesign: finding.materialityClass === 'assurance_priority'
        ? `Independently validate that "${finding.questionPrompt.replace(/\.$/, '')}" operates to the expected standard (${finding.expectedControlStandard}) across the complete population, required frequency and under pressure. This does not assert a control defect; if validation identifies one, apply the recommended control design: ${finding.recommendedControl}`
        : finding.recommendedControl,
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

export function buildEvidenceChecklist(findings: MaterialFinding[], risks: RiskRegisterEntry[], visibilityGaps: VisibilityGap[] = []): EvidenceChecklistItem[] {
  const groups = new Map<string, { artefact: string; findings: MaterialFinding[] }>();
  for (const finding of [...findings].sort((a, b) => a.questionCode.localeCompare(b.questionCode))) {
    for (const artefact of stableUnique(finding.evidenceToRequest)) {
      const key = artefact.normalize('NFKC').trim().toLowerCase();
      const existing = groups.get(key) ?? { artefact, findings: [] };
      existing.findings.push(finding);
      groups.set(key, existing);
    }
  }

  const controlEvidence = [...groups.values()].sort((a, b) => a.artefact.localeCompare(b.artefact)).map(({ artefact, findings: linked }) => {
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
      provesWhat: (() => {
        const prompts = stableUnique(linked.map((finding) => finding.questionPrompt.replace(/\.$/, '')));
        const shown = prompts.slice(0, 2);
        const remainder = prompts.length - shown.length;
        const tail = remainder > 0 ? `, and ${remainder} further linked control${remainder === 1 ? '' : 's'},` : '';
        return `Whether ${shown.join('; ')}${tail} operate${prompts.length === 1 ? 's' : ''} to the exact expected control standard across the complete in-scope population.`;
      })(),
      expectedRecency: stableUnique(linked.map((finding) => finding.operatingFrequency)).join('; '),
      requiredPopulation: 'Complete in-scope population for the stated operating period, reconciled to the source system or register.',
      samplingExpectation: 'Review the complete population where feasible; otherwise use a documented risk-based sample including exceptions, changes and overdue items.',
      minimumAcceptableCharacteristics: stableUnique(linked.flatMap((finding) => finding.minimumEvidenceCharacteristics)),
      reviewStatus: 'Not yet requested',
      evidenceRef
    } satisfies EvidenceChecklistItem;
  });
  const visibilityEvidence = visibilityGaps.map((gap) => ({
    id: gap.evidenceRef.slice('evidence:'.length),
    artefact: `Evidence pack for ${gap.questionCode}: ${gap.prompt}`,
    linkedFindingIds: [],
    linkedRiskIds: [],
    linkedQuestionCodes: [gap.questionCode],
    linkedFindingId: '',
    linkedRiskId: '',
    likelyOwner: gap.likelyEvidenceOwner,
    provesWhat: gap.statement,
    expectedRecency: gap.targetTiming,
    requiredPopulation: 'Complete in-scope population for the control, including exceptions and changes.',
    samplingExpectation: 'Review the complete population where feasible; otherwise use a documented risk-based sample including exceptions.',
    minimumAcceptableCharacteristics: [gap.evidenceNeeded, gap.recommendedVerificationAction],
    reviewStatus: 'Not yet requested' as const,
    evidenceRef: gap.evidenceRef,
    visibilityGap: true
  } satisfies EvidenceChecklistItem));
  return [...controlEvidence, ...visibilityEvidence];
}

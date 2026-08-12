import type { AssembledReportData } from '../types';
import type { EvidenceChecklistItem, MaterialFinding } from '../evidence-model/types';
import type {
  ComprehensiveAnalyticalUniverse,
  ComprehensiveDeliveryModel,
  ComprehensiveFindingView,
  DecisionOptionDetail,
  DecisionOptionSet,
  ProofRequirement
} from './types';
import { buildDecisionOptionSets } from './decision-options';

const clean = (value: string | undefined | null, fallback: string): string => {
  const text = value?.trim();
  return text ? text : fallback;
};

function priorityForFinding(finding: MaterialFinding): ProofRequirement['priority'] {
  if (finding.isCriticalControl || finding.isHardGate || finding.gapClassification === 'critical') return 'HIGH';
  if (finding.gapClassification === 'major' || finding.linkedExposureFactorCodes.length > 0) return 'MEDIUM';
  return 'LOW';
}

function findingForEvidence(item: EvidenceChecklistItem, findings: MaterialFinding[]): MaterialFinding | null {
  return findings.find((finding) => item.linkedFindingIds.includes(finding.id)) ?? null;
}

/** Convert the analytical evidence checklist into proof requirements only. */
export function buildProofRequirements(analytical: ComprehensiveAnalyticalUniverse): ProofRequirement[] {
  const findings = analytical.evidenceModel.materialFindings;
  return analytical.evidenceModel.evidenceChecklist
    .map((item) => {
      const linkedFindings = findings.filter((finding) => item.linkedFindingIds.includes(finding.id));
      const finding = findingForEvidence(item, findings);
      const priority = linkedFindings.reduce<ProofRequirement['priority']>((current, candidate) => {
        const candidatePriority = priorityForFinding(candidate);
        return candidatePriority === 'HIGH' || (candidatePriority === 'MEDIUM' && current === 'LOW') ? candidatePriority : current;
      }, 'LOW');
      return {
        proofRef: item.evidenceRef,
        requirement: item.artefact,
        linkedDomain: linkedFindings.map((candidate) => candidate.domainName).join('; ') || 'Cross-domain',
        linkedFindingIds: item.linkedFindingIds,
        linkedRiskIds: item.linkedRiskIds,
        linkedControlIds: linkedFindings.map((candidate) => `CI-${candidate.questionCode}`),
        whyItMatters: finding?.whyItMatters ?? 'The requirement supports a repeatable control record and management decision.',
        acceptableExamples: [...new Set(linkedFindings.flatMap((candidate) => candidate.minimumEvidenceCharacteristics))].length > 0
          ? [...new Set(linkedFindings.flatMap((candidate) => candidate.minimumEvidenceCharacteristics))]
          : item.minimumAcceptableCharacteristics,
        priority,
        proofOwner: item.likelyOwner,
        expectedRecency: item.expectedRecency,
        requiredPopulation: item.requiredPopulation,
        privacyBoundary: 'Use the minimum necessary business record for the named population and period. Do not include personal data unless needed and approved under MK privacy procedures.'
      } satisfies ProofRequirement;
    })
    .sort((a, b) => ({ HIGH: 3, MEDIUM: 2, LOW: 1 }[b.priority] - { HIGH: 3, MEDIUM: 2, LOW: 1 }[a.priority] || a.proofRef.localeCompare(b.proofRef)));
}

function buildFindingView(finding: MaterialFinding): ComprehensiveFindingView {
  return {
    ...finding,
    interpretation: clean(finding.diagnosis, `The recorded response creates a ${finding.materialityClass.replaceAll('_', ' ')} condition.`),
    managementImplication: clean(finding.recommendedControl, 'Management should define the target control, accountable owner and effectiveness measure.')
  };
}

function buildNarrativeBriefs(model: Omit<ComprehensiveDeliveryModel, 'narrativeBriefs'>): ComprehensiveDeliveryModel['narrativeBriefs'] {
  const score = model.analytical.score;
  const basis = "This report provides strategic fraud-risk analysis and control design based on management's recorded Fraud Readiness assessment responses. It does not independently verify operating effectiveness.";
  return [
    { section: 'diagnosis', layer: 'diagnosis', requiredConclusion: 'The recorded assessment establishes the current readiness and exposure position.', deterministicFacts: [`Readiness score: ${score.overallScore ?? 'not scored'}.`, `Exposure score: ${score.exposureScore ?? 'not scored'}.`, `${model.findings.length} material findings and ${model.riskRegister.length} risks are in the analytical universe.`], mustInclude: [basis, 'Assessment responses, not reviewer records, are the source of the position.'], mustNotClaim: ['independent operating effectiveness', 'evidence validation', 'reviewer conclusion'], transitionToNext: 'Use the interpretation layer to explain concentration, interactions and fraud pathways.' },
    { section: 'interpretation', layer: 'interpretation', requiredConclusion: 'Material findings and scenarios explain where exposure concentrates and why it matters.', deterministicFacts: [`${model.scenarios.length} deterministic scenario pathways are available.`, `${model.contradictions.length} cross-domain interactions are available.`, `${model.proofRequirements.length} proof requirements define what management should retain during implementation.`], mustInclude: ['Conditional scenario language.', 'Links between findings, risks, scenarios and control weaknesses.'], mustNotClaim: ['confirmed fraud event', 'validated evidence', 'independent assurance'], transitionToNext: 'Translate the interpretation into target-state controls, decisions and ownership.' },
    { section: 'design', layer: 'design', requiredConclusion: 'The target state is a set of owned controls, decisions, measures and sequenced actions.', deterministicFacts: [`${model.controlImprovements.length} control blueprints are available.`, `${model.leadershipDecisions.length} leadership decisions are available.`, `${model.roadmapActions.length} roadmap actions are available.`], mustInclude: ['Control objective, owner, population, frequency, proof, escalation, SLA, effectiveness measure and failure response.', 'The four implementation horizons: first 30 days, days 31–90, months 4–6 and months 7–12.'], mustNotClaim: ['completed remediation', 'operating effectiveness already established', 'customer evidence review'], transitionToNext: 'Close with management decisions, scorecard measures and the next checkpoint.' }
  ];
}

export function buildComprehensiveDeliveryModel(analytical: ComprehensiveAnalyticalUniverse): ComprehensiveDeliveryModel {
  const findings = analytical.evidenceModel.materialFindings.map(buildFindingView);
  const proofRequirements = buildProofRequirements(analytical);
  const evidenceRequestPack = proofRequirements.map((item) => ({
    evidenceRef: item.proofRef,
    evidenceItem: item.requirement,
    linkedDomain: item.linkedDomain,
    linkedFindingIds: item.linkedFindingIds,
    linkedFinding: item.linkedFindingIds[0] ?? '',
    linkedControlIds: item.linkedControlIds,
    whatMKWantsToInspect: item.requirement,
    whyItMatters: item.whyItMatters,
    acceptableExamples: item.acceptableExamples,
    priority: item.priority,
    requestedStatus: 'NOT_APPLICABLE',
    backendStatus: 'not_applicable',
    validationStatus: 'NOT_APPLICABLE',
    reviewerNote: '',
    actualArtefactsExamined: [],
    whatEvidenceDemonstrated: null,
    whatEvidenceDidNotDemonstrate: null,
    reviewerConclusion: null,
    reviewerConfidence: null,
    privacyBoundary: item.privacyBoundary
  }));
  const base = {
    analytical,
    findings,
    materialFindings: analytical.evidenceModel.materialFindings,
    riskRegister: analytical.evidenceModel.riskRegister,
    controlImprovements: analytical.evidenceModel.controlImprovements,
    proofRequirements,
    evidenceRequestPack,
    evidenceChecklist: analytical.evidenceModel.evidenceChecklist,
    scenarios: analytical.evidenceModel.scenarios,
    contradictions: analytical.evidenceModel.contradictions,
    roadmapActions: analytical.evidenceModel.roadmapActions,
    leadershipDecisions: analytical.evidenceModel.leadershipDecisions,
    decisionOptionSets: [] as DecisionOptionSet[],
  };
  const model = { ...base, decisionOptionSets: buildDecisionOptionSets(base.leadershipDecisions) } as Omit<ComprehensiveDeliveryModel, 'narrativeBriefs'>;
  return { ...model, narrativeBriefs: buildNarrativeBriefs(model) };
}

export async function fromAssembledReportData(data: AssembledReportData): Promise<ComprehensiveDeliveryModel> {
  const { buildAdvisoryEvidenceModel } = await import('../evidence-model');
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  return buildComprehensiveDeliveryModel({
    assembled: data,
    evidenceModel,
    score: {
      overallScore: data.scoreRun.overallScore,
      calculatedMaturity: data.scoreRun.calculatedMaturity,
      finalMaturity: data.scoreRun.finalMaturity,
      exposureScore: data.scoreRun.exposureScore,
      exposureBand: data.scoreRun.exposureBand,
      coveragePct: data.scoreRun.coveragePct,
      nARatePct: data.scoreRun.nARatePct,
      criticalGapCount: data.scoreRun.criticalGapCount,
      majorGapCount: data.scoreRun.majorGapCount,
      capApplied: data.scoreRun.capApplied,
      capReason: data.scoreRun.capReason,
      methodologyVersionId: data.scoreRun.methodologyVersionId
    },
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    generatedAt: data.generatedAt
  });
}

/** Assert that the automated model contains no evidence-review or reviewer state. */
export function assertComprehensiveBlueprintContract(model: ComprehensiveDeliveryModel): void {
  if ('reviewerInput' in model || 'validationSummary' in model || 'evidenceReviews' in model) throw new Error('Comprehensive blueprint must not contain reviewer/evidence-review state.');
  if (!model.analytical.evidenceModel || model.findings.length === 0) throw new Error('Comprehensive blueprint requires the deterministic analytical universe.');
  if (model.narrativeBriefs.some((brief) => !brief.mustNotClaim.some((claim) => /validat|reviewer|operating effectiveness|assurance|evidence review/i.test(claim)))) {
    throw new Error('Comprehensive narrative brief must declare its assurance boundary.');
  }
}

export type { DecisionOptionDetail };

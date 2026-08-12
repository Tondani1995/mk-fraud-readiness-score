import type {
  AdvisoryEvidenceModel,
  ControlImprovementEntry,
  MaterialFinding,
  PlausibleScenario,
  RiskRegisterEntry,
  RoadmapAction,
  LeadershipDecision
} from '../evidence-model/types';
import type {
  ComprehensiveReviewerInput,
  EvidenceRequestPackItem,
  EvidenceValidationStatus,
  ReviewerEvidenceReview
} from '../comprehensive/types';
import { adaptBackendEvidenceStatus } from '../comprehensive/types';

export type ProjectionTier = 'Essential' | 'Comprehensive';

export type ResolvedEvidence = {
  item: EvidenceRequestPackItem;
  review: ReviewerEvidenceReview | null;
};

export type EvidenceReconciliation = {
  total: number;
  notReviewed: number;
  reviewed: number;
  supported: number;
  insufficient: number;
  notSupported: number;
  reviewedNoConclusion: number;
  unresolved: number;
};

export type ProjectionIntegrityIssue = {
  code: string;
  subject: string;
  detail: string;
};

export type CommercialProjection = {
  tier: ProjectionTier;
  organisationName: string;
  assessmentReference?: string;
  score: number | null;
  maturity: string | null;
  domains: Array<{ code: string; name: string; score: number | null; controlCount: number }>;
  findings: MaterialFinding[];
  evidence: ResolvedEvidence[];
  risks: RiskRegisterEntry[];
  scenarios: PlausibleScenario[];
  controls: ControlImprovementEntry[];
  actions: RoadmapAction[];
  decisions: LeadershipDecision[];
  reconciliation: EvidenceReconciliation;
  reviewer: ComprehensiveReviewerInput['reviewer'] | null;
  integrityIssues: ProjectionIntegrityIssue[];
};

function statusForReview(review: ReviewerEvidenceReview | null, item: EvidenceRequestPackItem): EvidenceValidationStatus {
  return review?.validationStatus ?? item.validationStatus ?? adaptBackendEvidenceStatus(item.backendStatus).presentationStatus;
}

function buildReconciliation(evidence: ResolvedEvidence[]): EvidenceReconciliation {
  let supported = 0;
  let insufficient = 0;
  let notSupported = 0;
  let reviewedNoConclusion = 0;
  let notReviewed = 0;
  for (const entry of evidence) {
    const status = statusForReview(entry.review, entry.item);
    if (status === 'VALIDATED_SUPPORTED') supported += 1;
    else if (status === 'NOT_VALIDATED_INSUFFICIENT') insufficient += 1;
    else if (status === 'NOT_SUPPORTED') notSupported += 1;
    else if (status === 'EVIDENCE_REVIEWED' || status === 'REVIEWER_JUDGEMENT') reviewedNoConclusion += 1;
    else notReviewed += 1;
  }
  const reviewed = supported + insufficient + notSupported + reviewedNoConclusion;
  return {
    total: evidence.length,
    notReviewed,
    reviewed,
    supported,
    insufficient,
    notSupported,
    reviewedNoConclusion,
    unresolved: notReviewed + insufficient + notSupported
  };
}

function validateReferences(
  findings: MaterialFinding[],
  evidence: ResolvedEvidence[],
  risks: RiskRegisterEntry[],
  scenarios: PlausibleScenario[],
  controls: ControlImprovementEntry[],
  actions: RoadmapAction[],
  decisions: LeadershipDecision[]
): ProjectionIntegrityIssue[] {
  const issues: ProjectionIntegrityIssue[] = [];
  const findingIds = new Set(findings.map((finding) => finding.id));
  const evidenceRefs = new Set(evidence.map(({ item }) => item.evidenceRef));
  const riskIds = new Set(risks.map((risk) => risk.id));
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const traceabilityRefs = new Set([
    ...findings.map((finding) => `finding:${finding.id}`),
    ...findings.map((finding) => `question:${finding.questionCode}`),
    ...risks.map((risk) => `risk:${risk.id}`),
    ...evidenceRefs
  ]);
  const check = (subject: string, code: string, values: string[], known: Set<string>) => {
    for (const value of values) if (!known.has(value)) issues.push({ code, subject, detail: `${value} is not present in the authoritative projection.` });
  };
  for (const finding of findings) check(finding.id, 'FINDING_EVIDENCE_REF_UNKNOWN', finding.evidenceToRequest.map((value) => `label:${value}`), new Set(findings.flatMap((item) => item.evidenceToRequest.map((label) => `label:${label}`))));
  for (const risk of risks) {
    check(risk.id, 'RISK_FINDING_REF_UNKNOWN', risk.linkedFindingIds, findingIds);
    check(risk.id, 'RISK_SCENARIO_REF_UNKNOWN', risk.linkedScenarioIds, scenarioIds);
  }
  for (const scenario of scenarios) {
    check(scenario.id, 'SCENARIO_FINDING_REF_UNKNOWN', scenario.linkedFindingIds, findingIds);
    check(scenario.id, 'SCENARIO_RISK_REF_UNKNOWN', scenario.linkedRiskIds, riskIds);
    check(scenario.id, 'SCENARIO_EVIDENCE_REF_UNKNOWN', scenario.evidenceRefs, evidenceRefs);
  }
  for (const control of controls) {
    check(control.id, 'CONTROL_FINDING_REF_UNKNOWN', [control.linkedFindingId], findingIds);
    check(control.id, 'CONTROL_RISK_REF_UNKNOWN', [control.linkedRiskId], riskIds);
    check(control.id, 'CONTROL_TRACEABILITY_REF_UNKNOWN', control.evidenceRefs, traceabilityRefs);
  }
  for (const action of actions) {
    check(action.id, 'ACTION_FINDING_REF_UNKNOWN', action.linkedFindingIds, findingIds);
    check(action.id, 'ACTION_RISK_REF_UNKNOWN', action.linkedRiskIds, riskIds);
    check(action.id, 'ACTION_TRACEABILITY_REF_UNKNOWN', action.evidenceRefs, traceabilityRefs);
  }
  for (const decision of decisions) {
    check(decision.id, 'DECISION_FINDING_REF_UNKNOWN', decision.linkedFindingIds, findingIds);
    check(decision.id, 'DECISION_RISK_REF_UNKNOWN', decision.linkedRiskIds, riskIds);
    check(decision.id, 'DECISION_TRACEABILITY_REF_UNKNOWN', decision.evidenceRefs, traceabilityRefs);
  }
  return issues;
}

export function buildCommercialProjection(args: {
  tier: ProjectionTier;
  organisationName: string;
  assessmentReference?: string;
  score: number | null;
  maturity: string | null;
  domainResults?: Array<{ domainCode: string; domainName: string; rawScore: number | null; applicableCount?: number }>;
  model: AdvisoryEvidenceModel;
  reviewer?: ComprehensiveReviewerInput | null;
}): CommercialProjection {
  const reviewByEvidence = new Map((args.reviewer?.evidenceReviews ?? []).map((review) => [review.evidenceRef, review]));
  const evidence = args.model.evidenceChecklist.map((item) => ({
    item: {
      evidenceRef: item.evidenceRef,
      evidenceItem: item.artefact,
      linkedDomain: item.linkedQuestionCodes[0]?.split('-')[0] ?? 'Unassigned',
      linkedFindingIds: item.linkedFindingIds,
      linkedFinding: item.linkedFindingId,
      linkedControlIds: [],
      whatMKWantsToInspect: item.provesWhat,
      whyItMatters: item.provesWhat,
      acceptableExamples: item.minimumAcceptableCharacteristics,
      priority: 'MEDIUM',
      requestedStatus: item.reviewStatus === 'Not yet requested' ? 'NOT_REQUESTED' : item.reviewStatus === 'Requested' ? 'REQUESTED' : 'RECEIVED',
      backendStatus: item.reviewStatus === 'Validated' ? 'supported' : item.reviewStatus === 'Insufficient' ? 'insufficient' : item.reviewStatus === 'Received' ? 'received' : 'not_requested',
      validationStatus: item.reviewStatus === 'Validated' ? 'VALIDATED_SUPPORTED' : item.reviewStatus === 'Insufficient' ? 'NOT_VALIDATED_INSUFFICIENT' : item.reviewStatus === 'Received' ? 'RECEIVED' : 'NOT_REQUESTED',
      reviewerNote: '',
      actualArtefactsExamined: [],
      whatEvidenceDemonstrated: null,
      whatEvidenceDidNotDemonstrate: null,
      reviewerConclusion: null,
      reviewerConfidence: null,
      privacyBoundary: 'Use only the named in-scope population and period.'
    } as EvidenceRequestPackItem,
    review: reviewByEvidence.get(item.evidenceRef) ?? null
  }));
  const reconciliation = buildReconciliation(evidence);
  const integrityIssues = validateReferences(args.model.materialFindings, evidence, args.model.riskRegister, args.model.scenarios, args.model.controlImprovements, args.model.roadmapActions, args.model.leadershipDecisions);
  return {
    tier: args.tier,
    organisationName: args.organisationName,
    assessmentReference: args.assessmentReference,
    score: args.score,
    maturity: args.maturity,
    domains: (args.domainResults ?? []).map((domain) => ({ code: domain.domainCode, name: domain.domainName, score: domain.rawScore, controlCount: domain.applicableCount ?? 0 })),
    findings: args.model.materialFindings,
    evidence,
    risks: args.model.riskRegister,
    scenarios: args.model.scenarios,
    controls: args.model.controlImprovements,
    actions: args.model.roadmapActions,
    decisions: args.model.leadershipDecisions,
    reconciliation,
    reviewer: args.reviewer?.reviewer ?? null,
    integrityIssues
  };
}

export function assertCommercialProjection(projection: CommercialProjection): void {
  if (projection.integrityIssues.length > 0) throw new Error(`commercial projection integrity failed: ${projection.integrityIssues.map((issue) => `${issue.code}:${issue.subject}`).join(', ')}`);
  const { reconciliation } = projection;
  if (reconciliation.notReviewed + reconciliation.reviewed !== reconciliation.total) throw new Error('evidence reconciliation total arithmetic failed');
  if (reconciliation.supported + reconciliation.insufficient + reconciliation.notSupported + reconciliation.reviewedNoConclusion !== reconciliation.reviewed) throw new Error('evidence reconciliation reviewed arithmetic failed');
  if (reconciliation.unresolved !== reconciliation.notReviewed + reconciliation.insufficient + reconciliation.notSupported) throw new Error('evidence reconciliation unresolved arithmetic failed');
}

export function reviewerStatus(projection: CommercialProjection, evidenceRef: string): EvidenceValidationStatus {
  const entry = projection.evidence.find((candidate) => candidate.item.evidenceRef === evidenceRef);
  if (!entry) throw new Error(`unknown evidence reference ${evidenceRef}`);
  return statusForReview(entry.review, entry.item);
}

import type { AssembledReportData } from '../types';
import type { EvidenceChecklistItem, MaterialFinding } from '../evidence-model/types';
import type {
  BackendEvidenceStatus,
  ComprehensiveAnalyticalUniverse,
  ComprehensiveDeliveryModel,
  ComprehensiveFindingView,
  ComprehensiveReviewerInput,
  EvidenceItemConclusion,
  EvidenceRequestPackItem,
  EvidenceValidationStatus,
  ReviewerEvidenceReview,
  ReviewerFindingReview,
  ValidationSummary
} from './types';
import { adaptBackendEvidenceStatus } from './types';
import { enrichDecisionReviews } from './decision-options';

const STATUS_ORDER: EvidenceValidationStatus[] = [
  'NOT_REQUESTED',
  'REQUESTED',
  'RECEIVED',
  'SELF_REPORTED',
  'EVIDENCE_REVIEWED',
  'VALIDATED_SUPPORTED',
  'NOT_SUPPORTED',
  'NOT_VALIDATED_INSUFFICIENT',
  'NOT_APPLICABLE',
  'REVIEWER_JUDGEMENT'
];

const clean = (value: string | undefined | null, fallback: string): string => {
  const text = value?.trim();
  return text ? text : fallback;
};

function priorityForFinding(finding: MaterialFinding): EvidenceRequestPackItem['priority'] {
  if (finding.isCriticalControl || finding.isHardGate || finding.gapClassification === 'critical') return 'HIGH';
  if (finding.gapClassification === 'major' || finding.linkedExposureFactorCodes.length > 0) return 'MEDIUM';
  return 'LOW';
}

const EVIDENCE_PRIORITY_RANK: Record<EvidenceRequestPackItem['priority'], number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

function findingForEvidence(item: EvidenceChecklistItem, findings: MaterialFinding[]): MaterialFinding | null {
  return findings.find((finding) => item.linkedFindingIds.includes(finding.id)) ?? null;
}

function reviewForEvidence(ref: string, reviews: ReviewerEvidenceReview[]): ReviewerEvidenceReview | null {
  return reviews.find((review) => review.evidenceRef === ref) ?? null;
}

function reviewForFinding(id: string, reviews: ReviewerFindingReview[]): ReviewerFindingReview | null {
  return reviews.find((review) => review.findingId === id) ?? null;
}

function backendStatusForReview(review: ReviewerEvidenceReview): BackendEvidenceStatus {
  if (review.backendStatus) return review.backendStatus;
  switch (review.validationStatus) {
    case 'VALIDATED_SUPPORTED': return 'supported';
    case 'NOT_SUPPORTED': return 'not_supported';
    case 'NOT_VALIDATED_INSUFFICIENT': return 'insufficient';
    case 'NOT_APPLICABLE': return 'not_applicable';
    case 'EVIDENCE_REVIEWED': return 'reviewed';
    default: return 'received';
  }
}

function presentationStatusForReview(review: ReviewerEvidenceReview): EvidenceValidationStatus {
  return review.backendStatus ? adaptBackendEvidenceStatus(review.backendStatus).presentationStatus : review.validationStatus;
}

function conclusionForEvidenceReview(review: ReviewerEvidenceReview): EvidenceItemConclusion | null {
  if (review.reviewerConclusion) return review.reviewerConclusion;
  switch (presentationStatusForReview(review)) {
    case 'VALIDATED_SUPPORTED': return 'SUPPORTED';
    case 'NOT_SUPPORTED': return 'NOT_SUPPORTED';
    case 'NOT_VALIDATED_INSUFFICIENT': return 'INSUFFICIENT';
    case 'NOT_APPLICABLE': return 'NOT_APPLICABLE';
    case 'EVIDENCE_REVIEWED': return 'REVIEWED';
    default: return null;
  }
}

function evidenceWasActuallyReviewed(review: ReviewerEvidenceReview): boolean {
  return review.evidenceExamined.length > 0 && ['EVIDENCE_REVIEWED', 'VALIDATED_SUPPORTED', 'NOT_SUPPORTED', 'NOT_VALIDATED_INSUFFICIENT', 'NOT_APPLICABLE'].includes(presentationStatusForReview(review));
}

function statusForFindingConclusion(conclusion: ReviewerFindingReview['reviewerConclusion']): EvidenceValidationStatus {
  switch (conclusion) {
    case 'SUPPORTED': return 'VALIDATED_SUPPORTED';
    case 'NOT_SUPPORTED': return 'NOT_SUPPORTED';
    case 'INSUFFICIENT': return 'NOT_VALIDATED_INSUFFICIENT';
    case 'NOT_APPLICABLE': return 'NOT_APPLICABLE';
    default: return 'EVIDENCE_REVIEWED';
  }
}

function assertFindingReviewCoherent(
  finding: MaterialFinding,
  review: ReviewerFindingReview,
  evidenceRefs: string[],
  evidenceReviews: ReviewerEvidenceReview[]
): void {
  if (review.evidenceRefs.length === 0) throw new Error(`Finding review ${finding.id} must name at least one evidence reference.`);
  const allowedRefs = new Set(evidenceRefs);
  const linkedReviews = review.evidenceRefs.map((ref) => {
    if (!allowedRefs.has(ref)) throw new Error(`Finding review ${finding.id} references evidence not linked to the finding: ${ref}`);
    const evidenceReview = reviewForEvidence(ref, evidenceReviews);
    if (!evidenceReview || !evidenceWasActuallyReviewed(evidenceReview)) throw new Error(`Finding review ${finding.id} references evidence that was not actually reviewed: ${ref}`);
    return evidenceReview;
  });
  if (review.reviewerConclusion === 'SUPPORTED') {
    const hasNegativeEvidence = linkedReviews.some((item) => ['NOT_SUPPORTED', 'NOT_VALIDATED_INSUFFICIENT', 'NOT_APPLICABLE'].includes(presentationStatusForReview(item)));
    const hasSupportingEvidence = linkedReviews.some((item) => presentationStatusForReview(item) === 'VALIDATED_SUPPORTED');
    const coherentResolution = Boolean(review.reviewerObservation?.trim() && review.adjustedInterpretation?.trim());
    if (!hasSupportingEvidence && !coherentResolution) throw new Error(`Finding review ${finding.id} claims support without a supported evidence conclusion or coherent reviewer resolution.`);
    if (hasNegativeEvidence && !coherentResolution) {
      throw new Error(`Finding review ${finding.id} must explain how negative or insufficient evidence was resolved before claiming support.`);
    }
  }
}

function statusForFinding(finding: MaterialFinding, evidenceRefs: string[], evidenceReviews: ReviewerEvidenceReview[], findingReviews: ReviewerFindingReview[]): EvidenceValidationStatus {
  const direct = reviewForFinding(finding.id, findingReviews);
  if (direct) {
    assertFindingReviewCoherent(finding, direct, evidenceRefs, evidenceReviews);
    return statusForFindingConclusion(direct.reviewerConclusion);
  }
  const linked = evidenceReviews.filter((review) => evidenceRefs.includes(review.evidenceRef) && evidenceWasActuallyReviewed(review));
  return linked.length > 0 ? 'EVIDENCE_REVIEWED' : 'SELF_REPORTED';
}

function buildPackItem(item: EvidenceChecklistItem, findings: MaterialFinding[], reviews: ReviewerEvidenceReview[]): EvidenceRequestPackItem {
  const finding = findingForEvidence(item, findings);
  const review = reviewForEvidence(item.evidenceRef, reviews);
  const linkedFindings = findings.filter((candidate) => item.linkedFindingIds.includes(candidate.id));
  const linkedDomain = [...new Set(linkedFindings.map((candidate) => candidate.domainName))].join('; ') || 'Cross-domain';
  const acceptableExamples = [...new Set(linkedFindings.flatMap((candidate) => candidate.minimumEvidenceCharacteristics))];
  const status = review ? presentationStatusForReview(review) : 'NOT_REQUESTED';
  return {
    evidenceRef: item.evidenceRef,
    evidenceItem: item.artefact,
    linkedDomain,
    linkedFindingIds: item.linkedFindingIds,
    linkedFinding: linkedFindings.map((candidate) => candidate.title).join('; ') || 'Linked analytical item not available',
    linkedControlIds: linkedFindings.map((candidate) => `CI-${candidate.questionCode}`),
    whatMKWantsToInspect: item.provesWhat,
    whyItMatters: finding?.whyItMatters ?? 'The item provides operating context for a recorded control or risk decision.',
    acceptableExamples: acceptableExamples.length > 0 ? acceptableExamples : ['A current control artefact and a traceable operating record.'],
    priority: linkedFindings.reduce<EvidenceRequestPackItem['priority']>((highest, candidate) => {
      const priority = priorityForFinding(candidate);
      return priority === 'HIGH' || (priority === 'MEDIUM' && highest === 'LOW') ? priority : highest;
    }, 'LOW'),
    requestedStatus: review ? 'IN_REVIEW' : 'NOT_REQUESTED',
    backendStatus: review ? backendStatusForReview(review) : 'not_requested',
    validationStatus: status,
    reviewerNote: clean(review?.reviewerObservation, status === 'SELF_REPORTED' ? 'No reviewer evidence note recorded.' : 'Reviewer status recorded; see reviewer observation and limitations.'),
    actualArtefactsExamined: review?.evidenceExamined ?? [],
    whatEvidenceDemonstrated: review?.reviewerObservation ?? null,
    whatEvidenceDidNotDemonstrate: review?.evidenceLimitation ?? null,
    reviewerConclusion: review ? conclusionForEvidenceReview(review) : null,
    reviewerConfidence: review?.reviewerConfidence ?? null,
    privacyBoundary: 'Send the minimum necessary business records. Do not include personal data unless it is needed to demonstrate the control and has been approved under MK privacy procedures.'
  };
}

export function buildEvidenceRequestPack(
  analytical: ComprehensiveAnalyticalUniverse,
  reviewerInput: ComprehensiveReviewerInput
): EvidenceRequestPackItem[] {
  return analytical.evidenceModel.evidenceChecklist
    .map((item) => buildPackItem(item, analytical.evidenceModel.materialFindings, reviewerInput.evidenceReviews))
    .sort((a, b) => EVIDENCE_PRIORITY_RANK[b.priority] - EVIDENCE_PRIORITY_RANK[a.priority] || a.evidenceRef.localeCompare(b.evidenceRef));
}

function buildValidationSummary(items: EvidenceRequestPackItem[]): ValidationSummary {
  const summary = {
    totalEvidenceItems: items.length,
    selfReported: 0,
    evidenceReviewed: 0,
    validatedSupported: 0,
    notValidatedInsufficient: 0,
    reviewerJudgement: 0,
    unresolved: 0
  } satisfies ValidationSummary;
  for (const item of items) {
    if (['SELF_REPORTED', 'NOT_REQUESTED', 'REQUESTED', 'RECEIVED'].includes(item.validationStatus)) summary.selfReported += 1;
    if (item.validationStatus === 'EVIDENCE_REVIEWED') summary.evidenceReviewed += 1;
    if (item.validationStatus === 'VALIDATED_SUPPORTED') summary.validatedSupported += 1;
    if (item.validationStatus === 'NOT_VALIDATED_INSUFFICIENT') summary.notValidatedInsufficient += 1;
    if (item.validationStatus === 'REVIEWER_JUDGEMENT') summary.reviewerJudgement += 1;
    if (['SELF_REPORTED', 'NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'NOT_VALIDATED_INSUFFICIENT', 'NOT_SUPPORTED'].includes(item.validationStatus)) summary.unresolved += 1;
  }
  return summary;
}

function buildFindingView(finding: MaterialFinding, input: ComprehensiveReviewerInput, evidenceChecklist: EvidenceChecklistItem[], evidenceReviews: ReviewerEvidenceReview[]): ComprehensiveFindingView {
  const review = reviewForFinding(finding.id, input.findingReviews);
  const evidenceRefs = evidenceChecklist.filter((item) => item.linkedFindingIds.includes(finding.id)).map((item) => item.evidenceRef);
  const status = statusForFinding(finding, evidenceRefs, evidenceReviews, input.findingReviews);
  if (review) assertFindingReviewCoherent(finding, review, evidenceRefs, evidenceReviews);
  return {
    ...finding,
    validationStatus: status,
    evidenceRefsReviewed: review?.evidenceRefs ?? evidenceRefs.filter((ref) => evidenceReviews.some((item) => item.evidenceRef === ref)),
    reviewerObservation: review?.reviewerObservation ?? null,
    evidenceLimitation: review?.evidenceLimitation ?? null,
    adjustedInterpretation: review?.adjustedInterpretation ?? null,
    agreedOwner: review?.agreedOwner ?? null,
    agreedDueDate: review?.agreedDueDate ?? null,
    managementResponse: review?.managementResponse ?? null
  };
}

function buildChanges(
  findings: ComprehensiveFindingView[],
  evidenceReviews: ReviewerEvidenceReview[],
  input: ComprehensiveReviewerInput
): ComprehensiveDeliveryModel['changesAfterEvidenceReview'] {
  const changes = findings
    .filter((finding) => finding.validationStatus !== 'SELF_REPORTED')
    .map((finding) => ({
      subject: finding.title,
      before: `Self-reported position: ${finding.responseMeaning}`,
      after: clean(finding.adjustedInterpretation, finding.validationStatus === 'VALIDATED_SUPPORTED' ? 'The recorded control position remains bounded to the named scope and period.' : 'The supplied information does not establish an unqualified conclusion for the recorded scope.'),
      status: finding.validationStatus,
      linkedRefs: finding.evidenceRefsReviewed.length > 0 ? finding.evidenceRefsReviewed : finding.evidenceToRequest.map((_, index) => `evidence:${finding.id}:${index + 1}`)
    }));
  const observationChanges = input.observations.map((observation) => ({
    subject: observation.subject,
    before: 'Self-reported position retained unless separately evidenced.',
    after: observation.observation,
    status: observation.validationStatus,
    linkedRefs: observation.linkedEvidenceRefs
  }));
  return [...changes, ...observationChanges].sort((a, b) => `${a.subject}|${STATUS_ORDER.indexOf(a.status)}`.localeCompare(`${b.subject}|${STATUS_ORDER.indexOf(b.status)}`));
}

export function buildComprehensiveDeliveryModel(
  analytical: ComprehensiveAnalyticalUniverse,
  reviewerInput: ComprehensiveReviewerInput
): ComprehensiveDeliveryModel {
  const evidenceRequestPack = buildEvidenceRequestPack(analytical, reviewerInput);
  const findings = analytical.evidenceModel.materialFindings.map((finding) => buildFindingView(finding, reviewerInput, analytical.evidenceModel.evidenceChecklist, reviewerInput.evidenceReviews));
  return {
    analytical,
    reviewerInput,
    evidenceRequestPack,
    validationSummary: buildValidationSummary(evidenceRequestPack),
    evidenceReviews: reviewerInput.evidenceReviews,
    riskReviews: reviewerInput.riskReviews ?? [],
    controlDesignReviews: reviewerInput.controlDesignReviews ?? [],
    decisionReviews: enrichDecisionReviews(analytical.evidenceModel.leadershipDecisions, reviewerInput.decisionReviews ?? []),
    findings,
    materialFindings: analytical.evidenceModel.materialFindings,
    riskRegister: analytical.evidenceModel.riskRegister,
    controlImprovements: analytical.evidenceModel.controlImprovements,
    evidenceChecklist: analytical.evidenceModel.evidenceChecklist,
    scenarios: analytical.evidenceModel.scenarios,
    contradictions: analytical.evidenceModel.contradictions,
    roadmapActions: analytical.evidenceModel.roadmapActions,
    leadershipDecisions: analytical.evidenceModel.leadershipDecisions,
    managementDecisions: reviewerInput.managementDecisions,
    changesAfterEvidenceReview: buildChanges(findings, reviewerInput.evidenceReviews, reviewerInput)
  };
}

export async function fromAssembledReportData(data: AssembledReportData, reviewerInput: ComprehensiveReviewerInput): Promise<ComprehensiveDeliveryModel> {
  // Keep the pure presentation/fixture path free of server/database imports. The production
  // adapter loads the existing analytical builder only when an assembled report is actually
  // supplied by the paid-order integration lane.
  const { buildAdvisoryEvidenceModel } = await import('../evidence-model');
  const model = buildAdvisoryEvidenceModel(data);
  return buildComprehensiveDeliveryModel({
    assembled: data,
    evidenceModel: model,
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
  }, reviewerInput);
}

/** A machine-checkable guard used by fixtures and integration tests. */
export function assertNoFalseValidation(model: ComprehensiveDeliveryModel): void {
  for (const item of model.evidenceRequestPack) {
    if (item.validationStatus === 'VALIDATED_SUPPORTED' && !model.evidenceReviews.some((review) => review.evidenceRef === item.evidenceRef && presentationStatusForReview(review) === 'VALIDATED_SUPPORTED')) {
      throw new Error(`False validation: ${item.evidenceRef} is marked validated without a reviewer evidence review.`);
    }
  }
  for (const finding of model.findings) {
    const review = reviewForFinding(finding.id, model.reviewerInput.findingReviews);
    const evidenceRefs = model.analytical.evidenceModel.evidenceChecklist.filter((item) => item.linkedFindingIds.includes(finding.id)).map((item) => item.evidenceRef);
    if (review) assertFindingReviewCoherent(finding, review, evidenceRefs, model.reviewerInput.evidenceReviews);
    if (finding.validationStatus === 'VALIDATED_SUPPORTED' && (!review || review.reviewerConclusion !== 'SUPPORTED' || finding.evidenceRefsReviewed.length === 0)) {
      throw new Error(`False validation: ${finding.id} lacks an explicit coherent reviewer-supported conclusion.`);
    }
  }
}

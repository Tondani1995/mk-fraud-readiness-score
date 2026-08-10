import type { AssembledReportData } from '../types';
import type { EvidenceChecklistItem, MaterialFinding } from '../evidence-model/types';
import type {
  ComprehensiveAnalyticalUniverse,
  ComprehensiveDeliveryModel,
  ComprehensiveFindingView,
  ComprehensiveReviewerInput,
  EvidenceRequestPackItem,
  EvidenceValidationStatus,
  ReviewerEvidenceReview,
  ReviewerFindingReview,
  ValidationSummary
} from './types';

const STATUS_ORDER: EvidenceValidationStatus[] = [
  'SELF_REPORTED',
  'EVIDENCE_REVIEWED',
  'VALIDATED_SUPPORTED',
  'NOT_VALIDATED_INSUFFICIENT',
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

function findingForEvidence(item: EvidenceChecklistItem, findings: MaterialFinding[]): MaterialFinding | null {
  return findings.find((finding) => item.linkedFindingIds.includes(finding.id)) ?? null;
}

function reviewForEvidence(ref: string, reviews: ReviewerEvidenceReview[]): ReviewerEvidenceReview | null {
  return reviews.find((review) => review.evidenceRef === ref) ?? null;
}

function reviewForFinding(id: string, reviews: ReviewerFindingReview[]): ReviewerFindingReview | null {
  return reviews.find((review) => review.findingId === id) ?? null;
}

function statusForFinding(finding: MaterialFinding, evidenceRefs: string[], evidenceReviews: ReviewerEvidenceReview[], findingReviews: ReviewerFindingReview[]): EvidenceValidationStatus {
  const direct = reviewForFinding(finding.id, findingReviews);
  if (direct) return direct.validationStatus;
  const linked = evidenceReviews.filter((review) => evidenceRefs.includes(review.evidenceRef));
  if (linked.some((review) => review.validationStatus === 'VALIDATED_SUPPORTED')) return 'VALIDATED_SUPPORTED';
  if (linked.some((review) => review.validationStatus === 'NOT_VALIDATED_INSUFFICIENT')) return 'NOT_VALIDATED_INSUFFICIENT';
  if (linked.some((review) => review.validationStatus === 'EVIDENCE_REVIEWED')) return 'EVIDENCE_REVIEWED';
  if (linked.some((review) => review.validationStatus === 'REVIEWER_JUDGEMENT')) return 'REVIEWER_JUDGEMENT';
  return 'SELF_REPORTED';
}

function buildPackItem(item: EvidenceChecklistItem, findings: MaterialFinding[], reviews: ReviewerEvidenceReview[]): EvidenceRequestPackItem {
  const finding = findingForEvidence(item, findings);
  const review = reviewForEvidence(item.evidenceRef, reviews);
  const linkedFindings = findings.filter((candidate) => item.linkedFindingIds.includes(candidate.id));
  const linkedDomain = [...new Set(linkedFindings.map((candidate) => candidate.domainName))].join('; ') || 'Cross-domain';
  const acceptableExamples = [...new Set(linkedFindings.flatMap((candidate) => candidate.minimumEvidenceCharacteristics))];
  const status = review?.validationStatus ?? 'SELF_REPORTED';
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
    requestedStatus: review ? 'RECEIVED' : 'NOT_REQUESTED',
    validationStatus: status,
    reviewerNote: clean(review?.reviewerObservation, status === 'SELF_REPORTED' ? 'No reviewer evidence note recorded.' : 'Reviewer status recorded; see reviewer observation and limitations.'),
    privacyBoundary: 'Send the minimum necessary business records. Do not include personal data unless it is needed to demonstrate the control and has been approved under MK privacy procedures.'
  };
}

export function buildEvidenceRequestPack(
  analytical: ComprehensiveAnalyticalUniverse,
  reviewerInput: ComprehensiveReviewerInput
): EvidenceRequestPackItem[] {
  return analytical.evidenceModel.evidenceChecklist
    .map((item) => buildPackItem(item, analytical.evidenceModel.materialFindings, reviewerInput.evidenceReviews))
    .sort((a, b) => `${a.priority}|${a.evidenceRef}`.localeCompare(`${b.priority}|${b.evidenceRef}`));
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
    if (item.validationStatus === 'SELF_REPORTED') summary.selfReported += 1;
    if (item.validationStatus === 'EVIDENCE_REVIEWED') summary.evidenceReviewed += 1;
    if (item.validationStatus === 'VALIDATED_SUPPORTED') summary.validatedSupported += 1;
    if (item.validationStatus === 'NOT_VALIDATED_INSUFFICIENT') summary.notValidatedInsufficient += 1;
    if (item.validationStatus === 'REVIEWER_JUDGEMENT') summary.reviewerJudgement += 1;
    if (item.validationStatus === 'SELF_REPORTED' || item.validationStatus === 'NOT_VALIDATED_INSUFFICIENT') summary.unresolved += 1;
  }
  return summary;
}

function buildFindingView(finding: MaterialFinding, input: ComprehensiveReviewerInput, evidenceChecklist: EvidenceChecklistItem[], evidenceReviews: ReviewerEvidenceReview[]): ComprehensiveFindingView {
  const review = reviewForFinding(finding.id, input.findingReviews);
  const evidenceRefs = evidenceChecklist.filter((item) => item.linkedFindingIds.includes(finding.id)).map((item) => item.evidenceRef);
  const status = statusForFinding(finding, evidenceRefs, evidenceReviews, input.findingReviews);
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
      after: clean(finding.adjustedInterpretation, finding.validationStatus === 'VALIDATED_SUPPORTED' ? 'Evidence supports the recorded control position for the reviewed scope.' : 'The evidence review did not support an unqualified conclusion for the recorded scope.'),
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
    if (item.validationStatus === 'VALIDATED_SUPPORTED' && !model.evidenceReviews.some((review) => review.evidenceRef === item.evidenceRef && review.validationStatus === 'VALIDATED_SUPPORTED')) {
      throw new Error(`False validation: ${item.evidenceRef} is marked validated without a reviewer evidence review.`);
    }
  }
  for (const finding of model.findings) {
    if (finding.validationStatus === 'VALIDATED_SUPPORTED' && finding.evidenceRefsReviewed.length === 0 && !model.reviewerInput.evidenceReviews.some((review) => review.validationStatus === 'VALIDATED_SUPPORTED')) {
      throw new Error(`False validation: ${finding.id} has no reviewed evidence reference.`);
    }
  }
}

/**
 * Advisory reviewer adapter.
 *
 * Relocated out of src/lib/reports/comprehensive/ when Comprehensive became an
 * automated analytical product. Reviewer input, evidence validation and sign-off
 * are Advisory work; this module is retained because that work is real, but it
 * must not sit in the Comprehensive fulfilment path.
 */
import {
  adaptBackendEvidenceStatus,
  type BackendEvidenceStatus,
  type ComprehensiveReviewerInput,
  type EvidenceItemConclusion,
  type FindingReviewerConclusion,
  type ManagementActionStatus
} from '../reports/comprehensive/types';
import {
  validateComprehensiveSubject,
  type ComprehensiveRecordType,
  type ComprehensiveSubjectAuthority
} from '../reports/comprehensive/subject-authority';

export type PersistedComprehensiveEvidenceRow = {
  id: string;
  evidenceRef?: string | null;
  originalFilename?: string | null;
  evidenceLabel?: string | null;
  analyticalEvidenceRefs: string[];
  validationStatus: BackendEvidenceStatus;
  reviewerObservation?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

export type PersistedComprehensiveReviewRecordRow = {
  id: string;
  engagementId: string;
  recordType: 'finding' | 'risk' | 'control_design' | 'decision' | 'management_action';
  subjectKey: string;
  reviewerAdminUserId: string;
  reviewerConclusion: string;
  reviewerObservation?: string | null;
  evidenceRefs: string[];
  decisionOptions: string[];
  managementAction: Record<string, unknown>;
  recordVersion: number;
  updatedAt: string;
};

export type PersistedComprehensiveEngagement = {
  id: string;
  reviewerAdminUserId: string | null;
  reviewerName: string | null;
  reviewerRole?: string | null;
  reviewerReviewDate?: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
  signOffStatement: string | null;
  signedOffArtifactVersion?: number | null;
};

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Comprehensive ${label} is missing.`);
  return value.trim();
}

function list(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`Comprehensive ${label} must be a non-empty-string array.`);
  }
  return value.map((item) => String(item).trim());
}

function conclusion(value: string, label: string): FindingReviewerConclusion {
  const normalized = value.trim().toUpperCase();
  if (!['SUPPORTED', 'NOT_SUPPORTED', 'INSUFFICIENT', 'NOT_APPLICABLE', 'REVIEWED'].includes(normalized)) {
    throw new Error(`Comprehensive ${label} has an invalid reviewer conclusion.`);
  }
  return normalized as FindingReviewerConclusion;
}

function actionStatus(value: unknown): ManagementActionStatus {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'OPEN';
  if (!['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'ACCEPTED'].includes(normalized)) return 'OPEN';
  return normalized as ManagementActionStatus;
}

function actionString(action: Record<string, unknown>, key: string): string | undefined {
  const value = action[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function actionStrings(action: Record<string, unknown>, key: string): string[] {
  const value = action[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()) : [];
}

/**
 * Production boundary: converts only persisted evidence metadata and persisted human-review rows
 * into the accepted ComprehensiveReviewerInput. It never invents a conclusion, changes a backend
 * evidence status, reads file bytes, or returns a Storage path/URL.
 */
export function buildComprehensiveReviewerInputFromPersisted(input: {
  engagement: PersistedComprehensiveEngagement;
  evidence: PersistedComprehensiveEvidenceRow[];
  records: PersistedComprehensiveReviewRecordRow[];
  subjectAuthority: ComprehensiveSubjectAuthority;
}): ComprehensiveReviewerInput {
  const reviewerId = nonEmpty(input.engagement.reviewerAdminUserId, 'reviewer assignment');
  const reviewerName = nonEmpty(input.engagement.reviewerName, 'reviewer name');
  const reviewDate = nonEmpty(input.engagement.signedOffAt || input.engagement.reviewerReviewDate, 'review date');
  const recordTypes = new Set(input.records.map((record) => record.recordType));
  for (const required of ['finding', 'risk', 'control_design', 'decision', 'management_action'] as const) {
    if (!recordTypes.has(required)) throw new Error(`Comprehensive human review is incomplete: ${required} record missing.`);
  }
  for (const record of input.records) {
    if (record.engagementId !== input.engagement.id) throw new Error(`Comprehensive review record ${record.id} is bound to another engagement.`);
    if (record.reviewerAdminUserId !== reviewerId) throw new Error(`Comprehensive review record ${record.id} is not authored by the named reviewer.`);
    nonEmpty(record.reviewerConclusion, `${record.recordType} conclusion`);
  }

  const evidenceRefs = new Set(input.subjectAuthority.allEvidenceRefs);
  const requireKnownEvidenceRefs = (refs: string[], label: string) => {
    for (const ref of refs) if (!evidenceRefs.has(ref)) throw new Error(`${label} references unknown evidence ${ref}.`);
    return refs;
  };

  const evidenceReviews = input.evidence.flatMap((row) => row.analyticalEvidenceRefs.map((evidenceRef) => {
    const adapted = adaptBackendEvidenceStatus(row.validationStatus);
    const reviewerConclusion: EvidenceItemConclusion | undefined = row.validationStatus === 'supported'
      ? 'SUPPORTED'
      : row.validationStatus === 'not_supported'
        ? 'NOT_SUPPORTED'
        : row.validationStatus === 'insufficient'
          ? 'INSUFFICIENT'
          : row.validationStatus === 'not_applicable'
            ? 'NOT_APPLICABLE'
            : row.validationStatus === 'reviewed' ? 'REVIEWED' : undefined;
    return {
      evidenceRef,
      evidenceExamined: row.originalFilename ? [row.originalFilename] : [],
      validationStatus: adapted.presentationStatus,
      backendStatus: adapted.backendStatus,
      reviewerConclusion,
      reviewerObservation: row.reviewerObservation?.trim() || undefined,
      reviewerConfidence: row.validationStatus === 'supported' ? 'HIGH' as const : 'MEDIUM' as const
    };
  }));

  const records = input.records;
  const findingRecords = records.filter((record) => record.recordType === 'finding');
  const riskRecords = records.filter((record) => record.recordType === 'risk');
  const controlRecords = records.filter((record) => record.recordType === 'control_design');
  const decisionRecords = records.filter((record) => record.recordType === 'decision');
  const managementRecords = records.filter((record) => record.recordType === 'management_action');

  for (const record of records) {
    validateComprehensiveSubject(
      input.subjectAuthority,
      record.recordType as ComprehensiveRecordType,
      record.subjectKey,
      record.evidenceRefs
    );
  }

  const findingReviews = findingRecords.map((record) => {
    const refs = requireKnownEvidenceRefs(record.evidenceRefs, `Finding ${record.subjectKey}`);
    const action = record.managementAction;
    return {
      findingId: record.subjectKey,
      evidenceRefs: refs,
      reviewerConclusion: conclusion(record.reviewerConclusion, `finding ${record.subjectKey}`),
      reviewerObservation: record.reviewerObservation?.trim() || undefined,
      adjustedInterpretation: actionString(action, 'adjustedInterpretation'),
      agreedOwner: actionString(action, 'owner'),
      agreedDueDate: actionString(action, 'dueDate'),
      managementResponse: actionString(action, 'managementResponse')
    };
  });

  const riskReviews = riskRecords.map((record) => ({
    riskId: record.subjectKey,
    evidenceRefs: requireKnownEvidenceRefs(record.evidenceRefs, `Risk ${record.subjectKey}`),
    reviewerInterpretation: nonEmpty(record.reviewerConclusion, `risk ${record.subjectKey} interpretation`),
    assuranceStatement: actionString(record.managementAction, 'assuranceStatement'),
    limitation: actionString(record.managementAction, 'limitation'),
    reviewerConfidence: 'MEDIUM' as const
  }));

  const controlDesignReviews = controlRecords.map((record) => ({
    controlId: record.subjectKey,
    evidenceRefsReviewed: requireKnownEvidenceRefs(record.evidenceRefs, `Control ${record.subjectKey}`),
    designAssessment: nonEmpty(record.reviewerConclusion, `control ${record.subjectKey} design assessment`),
    designGapLimitation: actionString(record.managementAction, 'designGapLimitation'),
    reviewerObservation: record.reviewerObservation?.trim() || undefined,
    recommendedAdjustment: actionString(record.managementAction, 'recommendedAdjustment')
  }));

  const decisionReviews = decisionRecords.map((record) => ({
    decisionId: record.subjectKey,
    viableOptions: list(record.decisionOptions, `decision ${record.subjectKey} options`),
    keyTradeOffs: actionStrings(record.managementAction, 'keyTradeOffs'),
    reviewerRecommendation: record.reviewerObservation?.trim() || undefined,
    managementBoardDecision: actionString(record.managementAction, 'boardDecision'),
    owner: actionString(record.managementAction, 'owner'),
    targetDate: actionString(record.managementAction, 'targetDate')
  }));

  const observations = records.map((record) => ({
    id: record.id,
    subject: `${record.recordType}:${record.subjectKey}`,
    observation: nonEmpty(record.reviewerObservation || record.reviewerConclusion, `observation ${record.subjectKey}`),
    validationStatus: 'EVIDENCE_REVIEWED' as const,
    linkedEvidenceRefs: requireKnownEvidenceRefs(record.evidenceRefs, `Observation ${record.subjectKey}`),
    linkedFindingIds: record.recordType === 'finding' ? [record.subjectKey] : actionStrings(record.managementAction, 'linkedFindingIds'),
    reviewerName,
    reviewDate: record.updatedAt
  }));

  const managementDecisions = managementRecords.map((record) => {
    const action = record.managementAction;
    return {
      id: record.subjectKey,
      decision: nonEmpty(record.reviewerConclusion, `management action ${record.subjectKey}`),
      rationale: nonEmpty(record.reviewerObservation || actionString(action, 'rationale'), `management action ${record.subjectKey} rationale`),
      linkedFindingIds: actionStrings(action, 'linkedFindingIds'),
      linkedRiskIds: actionStrings(action, 'linkedRiskIds'),
      owner: actionString(action, 'owner'),
      targetDate: actionString(action, 'targetDate'),
      status: actionStatus(action.status),
      boardDecision: actionString(action, 'boardDecision'),
      managementResponse: actionString(action, 'managementResponse')
    };
  });

  return {
    reviewer: {
      name: reviewerName,
      role: input.engagement.reviewerRole || 'reviewer',
      reviewDate
    },
    evidenceReviews,
    findingReviews,
    riskReviews,
    controlDesignReviews,
    decisionReviews,
    observations,
    managementDecisions,
    boardDecisions: decisionReviews.map((review) => review.managementBoardDecision).filter((value): value is string => Boolean(value)),
    signOff: {
      signed: Boolean(input.engagement.signedOffBy && input.engagement.signedOffAt && input.engagement.signOffStatement),
      signedAt: input.engagement.signedOffAt || undefined,
      note: input.engagement.signOffStatement || undefined
    }
  };
}

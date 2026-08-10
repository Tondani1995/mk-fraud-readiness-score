import type { AssembledReportData } from '../types';
import type {
  AdvisoryEvidenceModel,
  Contradiction,
  ControlImprovementEntry,
  EvidenceChecklistItem,
  LeadershipDecision,
  MaterialFinding,
  PlausibleScenario,
  RiskRegisterEntry,
  RoadmapAction
} from '../evidence-model/types';

/** The only states a Comprehensive deliverable may show for an evidence item. */
export type EvidenceValidationStatus =
  | 'NOT_REQUESTED'
  | 'REQUESTED'
  | 'RECEIVED'
  | 'SELF_REPORTED'
  | 'EVIDENCE_REVIEWED'
  | 'VALIDATED_SUPPORTED'
  | 'NOT_SUPPORTED'
  | 'NOT_VALIDATED_INSUFFICIENT'
  | 'NOT_APPLICABLE'
  | 'REVIEWER_JUDGEMENT';

export type BackendEvidenceStatus = 'not_requested' | 'requested' | 'received' | 'reviewed' | 'supported' | 'not_supported' | 'insufficient' | 'not_applicable';
export type EvidenceItemConclusion = 'REVIEWED' | 'SUPPORTED' | 'NOT_SUPPORTED' | 'INSUFFICIENT' | 'NOT_APPLICABLE';
export type FindingReviewerConclusion = 'SUPPORTED' | 'NOT_SUPPORTED' | 'INSUFFICIENT' | 'NOT_APPLICABLE' | 'REVIEWED';
export type EvidenceRequestStatus = 'NOT_REQUESTED' | 'REQUESTED' | 'RECEIVED' | 'IN_REVIEW' | 'CLOSED';
export type ManagementActionStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE' | 'ACCEPTED';

export interface EvidenceStatusAdapterResult {
  backendStatus: BackendEvidenceStatus;
  presentationStatus: EvidenceValidationStatus;
}

export const BACKEND_EVIDENCE_STATUS_MAP: Record<BackendEvidenceStatus, EvidenceValidationStatus> = {
  not_requested: 'NOT_REQUESTED',
  requested: 'REQUESTED',
  received: 'RECEIVED',
  reviewed: 'EVIDENCE_REVIEWED',
  supported: 'VALIDATED_SUPPORTED',
  not_supported: 'NOT_SUPPORTED',
  insufficient: 'NOT_VALIDATED_INSUFFICIENT',
  not_applicable: 'NOT_APPLICABLE'
};

export function adaptBackendEvidenceStatus(status: BackendEvidenceStatus): EvidenceStatusAdapterResult {
  return { backendStatus: status, presentationStatus: BACKEND_EVIDENCE_STATUS_MAP[status] };
}

export interface ReviewerIdentity {
  name: string;
  role: string;
  organisation?: string;
  reviewDate: string;
}

export interface ReviewerEvidenceReview {
  evidenceRef: string;
  evidenceExamined: string[];
  validationStatus: EvidenceValidationStatus;
  backendStatus?: BackendEvidenceStatus;
  reviewerConclusion?: EvidenceItemConclusion;
  reviewerObservation?: string;
  evidenceLimitation?: string;
  adjustedInterpretation?: string;
  reviewerConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ReviewerFindingReview {
  findingId: string;
  evidenceRefs: string[];
  reviewerConclusion: FindingReviewerConclusion;
  validationStatus?: EvidenceValidationStatus;
  reviewerObservation?: string;
  evidenceLimitation?: string;
  adjustedInterpretation?: string;
  agreedOwner?: string;
  agreedDueDate?: string;
  managementResponse?: string;
}

export interface ReviewerRiskReview {
  riskId: string;
  evidenceRefs: string[];
  reviewerInterpretation: string;
  assuranceStatement?: string;
  limitation?: string;
  reviewerConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ReviewerControlDesignReview {
  controlId: string;
  evidenceRefsReviewed: string[];
  designAssessment: string;
  designGapLimitation?: string;
  reviewerObservation?: string;
  recommendedAdjustment?: string;
}

export interface ReviewerDecisionReview {
  decisionId: string;
  viableOptions: string[];
  keyTradeOffs: string[];
  reviewerRecommendation?: string;
  managementBoardDecision?: string;
  owner?: string;
  targetDate?: string;
}

export interface ReviewerObservation {
  id: string;
  subject: string;
  observation: string;
  validationStatus: EvidenceValidationStatus;
  linkedEvidenceRefs: string[];
  linkedFindingIds: string[];
  reviewerName: string;
  reviewDate: string;
}

export interface ManagementDecision {
  id: string;
  decision: string;
  rationale: string;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  owner?: string;
  targetDate?: string;
  status: ManagementActionStatus;
  boardDecision?: string;
  managementResponse?: string;
}

export interface ComprehensiveReviewerInput {
  reviewer: ReviewerIdentity;
  evidenceReviews: ReviewerEvidenceReview[];
  findingReviews: ReviewerFindingReview[];
  riskReviews?: ReviewerRiskReview[];
  controlDesignReviews?: ReviewerControlDesignReview[];
  decisionReviews?: ReviewerDecisionReview[];
  observations: ReviewerObservation[];
  managementDecisions: ManagementDecision[];
  boardDecisions?: string[];
  signOff?: {
    signed: boolean;
    signedAt?: string;
    note?: string;
  };
}

/**
 * The analytical universe is deliberately passed in rather than recalculated by the
 * Comprehensive renderer. `fromAssembledReportData()` is the production adapter; fixture and
 * reconciliation code can supply an already-built deterministic universe directly.
 */
export interface ComprehensiveAnalyticalUniverse {
  assembled?: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
  score: {
    overallScore: number | null;
    calculatedMaturity: string | null;
    finalMaturity: string | null;
    exposureScore: number | null;
    exposureBand: string | null;
    coveragePct: number;
    nARatePct: number;
    criticalGapCount: number;
    majorGapCount: number;
    capApplied: boolean;
    capReason: string | null;
    methodologyVersionId: string;
  };
  organisationName: string;
  assessmentReference?: string;
  generatedAt?: string;
}

export interface EvidenceRequestPackItem {
  evidenceRef: string;
  evidenceItem: string;
  linkedDomain: string;
  linkedFindingIds: string[];
  linkedFinding: string;
  linkedControlIds: string[];
  whatMKWantsToInspect: string;
  whyItMatters: string;
  acceptableExamples: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  requestedStatus: EvidenceRequestStatus;
  backendStatus: BackendEvidenceStatus;
  validationStatus: EvidenceValidationStatus;
  reviewerNote: string;
  actualArtefactsExamined: string[];
  whatEvidenceDemonstrated: string | null;
  whatEvidenceDidNotDemonstrate: string | null;
  reviewerConclusion: EvidenceItemConclusion | null;
  reviewerConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  privacyBoundary: string;
}

export interface ValidationSummary {
  totalEvidenceItems: number;
  selfReported: number;
  evidenceReviewed: number;
  validatedSupported: number;
  notValidatedInsufficient: number;
  reviewerJudgement: number;
  unresolved: number;
}

export interface ComprehensiveFindingView extends MaterialFinding {
  validationStatus: EvidenceValidationStatus;
  evidenceRefsReviewed: string[];
  reviewerObservation: string | null;
  evidenceLimitation: string | null;
  adjustedInterpretation: string | null;
  agreedOwner: string | null;
  agreedDueDate: string | null;
  managementResponse: string | null;
}

export interface ComprehensiveDeliveryModel {
  analytical: ComprehensiveAnalyticalUniverse;
  reviewerInput: ComprehensiveReviewerInput;
  evidenceRequestPack: EvidenceRequestPackItem[];
  validationSummary: ValidationSummary;
  evidenceReviews: ReviewerEvidenceReview[];
  riskReviews: ReviewerRiskReview[];
  controlDesignReviews: ReviewerControlDesignReview[];
  decisionReviews: ReviewerDecisionReview[];
  findings: ComprehensiveFindingView[];
  materialFindings: MaterialFinding[];
  riskRegister: RiskRegisterEntry[];
  controlImprovements: ControlImprovementEntry[];
  evidenceChecklist: EvidenceChecklistItem[];
  scenarios: PlausibleScenario[];
  contradictions: Contradiction[];
  roadmapActions: RoadmapAction[];
  leadershipDecisions: LeadershipDecision[];
  managementDecisions: ManagementDecision[];
  changesAfterEvidenceReview: Array<{
    subject: string;
    before: string;
    after: string;
    status: EvidenceValidationStatus;
    linkedRefs: string[];
  }>;
}

export interface ComprehensiveReportSection {
  key: string;
  title: string;
  purpose: string;
}

export interface BoardReadoutPage {
  page: number;
  title: string;
  decisionQuestion: string;
  contentType: 'position' | 'validation' | 'findings' | 'scenarios' | 'controls' | 'priorities' | 'oversight' | 'limitations';
}

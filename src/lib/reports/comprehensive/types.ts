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
  | 'SELF_REPORTED'
  | 'EVIDENCE_REVIEWED'
  | 'VALIDATED_SUPPORTED'
  | 'NOT_VALIDATED_INSUFFICIENT'
  | 'REVIEWER_JUDGEMENT';

export type EvidenceRequestStatus = 'NOT_REQUESTED' | 'REQUESTED' | 'RECEIVED' | 'IN_REVIEW' | 'CLOSED';
export type ManagementActionStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE' | 'ACCEPTED';

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
  reviewerObservation?: string;
  evidenceLimitation?: string;
  adjustedInterpretation?: string;
  reviewerConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ReviewerFindingReview {
  findingId: string;
  evidenceRefs: string[];
  validationStatus: EvidenceValidationStatus;
  reviewerObservation?: string;
  evidenceLimitation?: string;
  adjustedInterpretation?: string;
  agreedOwner?: string;
  agreedDueDate?: string;
  managementResponse?: string;
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
    overallScore: number;
    calculatedMaturity: string;
    finalMaturity: string;
    exposureScore: number;
    exposureBand: string;
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
  validationStatus: EvidenceValidationStatus;
  reviewerNote: string;
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


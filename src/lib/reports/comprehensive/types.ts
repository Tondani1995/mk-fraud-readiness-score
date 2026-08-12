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

/**
 * The deterministic analytical universe is the only production input to the
 * automated Comprehensive product. Reviewer/advisory records deliberately do
 * not appear in this contract.
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

/** A deterministic proof requirement; it is not an upload or validation state. */
export interface ProofRequirement {
  proofRef: string;
  requirement: string;
  linkedDomain: string;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  linkedControlIds: string[];
  whyItMatters: string;
  acceptableExamples: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  proofOwner: string;
  expectedRecency: string;
  requiredPopulation: string;
  privacyBoundary: string;
}

/** Compatibility view used by the separately-scoped Essential/commercial projection. */
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
  requestedStatus: string;
  backendStatus: string;
  validationStatus: string;
  reviewerNote: string;
  actualArtefactsExamined: string[];
  whatEvidenceDemonstrated: string | null;
  whatEvidenceDidNotDemonstrate: string | null;
  reviewerConclusion: string | null;
  reviewerConfidence: string | null;
  privacyBoundary: string;
}

export interface EvidenceStatusAdapterResult { backendStatus: string; presentationStatus: string; }
export function adaptBackendEvidenceStatus(status: string): EvidenceStatusAdapterResult {
  const map: Record<string, string> = { not_requested: 'NOT_REQUESTED', requested: 'REQUESTED', received: 'RECEIVED', reviewed: 'EVIDENCE_REVIEWED', supported: 'VALIDATED_SUPPORTED', not_supported: 'NOT_SUPPORTED', insufficient: 'NOT_VALIDATED_INSUFFICIENT', not_applicable: 'NOT_APPLICABLE' };
  return { backendStatus: status, presentationStatus: map[status] ?? status };
}

export interface ComprehensiveFindingView extends MaterialFinding {
  interpretation: string;
  managementImplication: string;
}

export interface DecisionOptionDetail {
  option: string;
  cost: string;
  benefit: string;
  tradeOff: string;
  rejectionReason?: string;
}

/** Deterministic option library output; no reviewer recommendation is stored. */
export interface DecisionOptionSet {
  decisionId: string;
  viableOptions: string[];
  optionDetails: DecisionOptionDetail[];
  deterministicRecommendation: string;
  recommendationRationale: string;
  owner: string;
  targetPeriod: string;
  targetDate: string;
  consequenceOfDelay: string;
}

export interface ComprehensiveNarrativeBrief {
  section: string;
  layer: 'diagnosis' | 'interpretation' | 'design';
  requiredConclusion: string;
  deterministicFacts: string[];
  mustInclude: string[];
  mustNotClaim: string[];
  transitionToNext: string;
}

export interface ComprehensiveDeliveryModel {
  analytical: ComprehensiveAnalyticalUniverse;
  findings: ComprehensiveFindingView[];
  materialFindings: MaterialFinding[];
  riskRegister: RiskRegisterEntry[];
  controlImprovements: ControlImprovementEntry[];
  proofRequirements: ProofRequirement[];
  /** Compatibility projection for the Essential/commercial projection only; no review state. */
  evidenceRequestPack: EvidenceRequestPackItem[];
  evidenceChecklist: EvidenceChecklistItem[];
  scenarios: PlausibleScenario[];
  contradictions: Contradiction[];
  roadmapActions: RoadmapAction[];
  leadershipDecisions: LeadershipDecision[];
  decisionOptionSets: DecisionOptionSet[];
  narrativeBriefs: ComprehensiveNarrativeBrief[];
}

export interface ComprehensiveReportSection {
  key: string;
  title: string;
  purpose: string;
  layer: 'diagnosis' | 'interpretation' | 'design';
}

export interface BoardReadoutPage {
  page: number;
  title: string;
  decisionQuestion: string;
  contentType: 'diagnosis' | 'interpretation' | 'design' | 'scenarios' | 'priorities' | 'oversight';
}

/*
 * These legacy input shapes remain exported for separately-scoped Advisory
 * fixtures and review-workspace code. They are intentionally not referenced by
 * ComprehensiveDeliveryModel or any automated Comprehensive generator.
 */
export type EvidenceValidationStatus = string;
export type BackendEvidenceStatus = string;
export type EvidenceItemConclusion = string;
export type FindingReviewerConclusion = string;
export type EvidenceRequestStatus = string;
export type ManagementActionStatus = string;
export interface ReviewerIdentity { name: string; role: string; organisation?: string; reviewDate: string; }
export interface ReviewerEvidenceReview { evidenceRef: string; evidenceExamined: string[]; validationStatus: string; backendStatus?: string; reviewerConclusion?: string; reviewerObservation?: string; evidenceLimitation?: string; adjustedInterpretation?: string; reviewerConfidence?: string; }
export interface ReviewerFindingReview { findingId: string; evidenceRefs: string[]; reviewerConclusion: string; validationStatus?: string; reviewerObservation?: string; evidenceLimitation?: string; adjustedInterpretation?: string; agreedOwner?: string; agreedDueDate?: string; managementResponse?: string; }
export interface ReviewerRiskReview { riskId: string; evidenceRefs: string[]; reviewerInterpretation: string; assuranceStatement?: string; limitation?: string; reviewerConfidence?: string; }
export interface ReviewerControlDesignReview { controlId: string; evidenceRefsReviewed: string[]; designAssessment: string; designGapLimitation?: string; reviewerObservation?: string; recommendedAdjustment?: string; }
export interface ReviewerDecisionReview { decisionId: string; viableOptions: string[]; keyTradeOffs: string[]; optionDetails?: DecisionOptionDetail[]; reviewerRecommendation?: string; recommendationRationale?: string; managementBoardDecision?: string; owner?: string; targetDate?: string; }
export interface ReviewerObservation { id: string; subject: string; observation: string; validationStatus: string; linkedEvidenceRefs: string[]; linkedFindingIds: string[]; reviewerName: string; reviewDate: string; }
export interface ManagementDecision { id: string; decision: string; rationale: string; linkedFindingIds: string[]; linkedRiskIds: string[]; owner?: string; targetDate?: string; status: string; boardDecision?: string; managementResponse?: string; }
export interface ComprehensiveReviewerInput { reviewer: ReviewerIdentity; evidenceReviews: ReviewerEvidenceReview[]; findingReviews: ReviewerFindingReview[]; riskReviews?: ReviewerRiskReview[]; controlDesignReviews?: ReviewerControlDesignReview[]; decisionReviews?: ReviewerDecisionReview[]; observations: ReviewerObservation[]; managementDecisions: ManagementDecision[]; boardDecisions?: string[]; signOff?: { signed: boolean; signedAt?: string; note?: string; }; }

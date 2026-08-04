export type MaturityBand = 'Reactive' | 'Developing' | 'Structured' | 'Strategic';
export type ExposureBand = 'Low' | 'Moderate' | 'High' | 'Severe';
export type AdaptiveResultStatus = 'NORMAL' | 'PROVISIONAL' | 'INSUFFICIENT_VISIBILITY';
export type AdaptiveResultMetrics = {
  resultStatus: AdaptiveResultStatus;
  graphVersion: string;
  graphFingerprint: string;
  applicableCount: number;
  applicableWeight: number;
  excludedCount: number;
  excludedWeight: number;
  redirectedCount: number;
  redirectedWeight: number;
  invalidatedCount: number;
  invalidatedWeight: number;
  profileOnlyCount: number;
  unknownCount: number;
  unknownWeight: number;
  unansweredApplicableCount: number;
  unansweredApplicableWeight: number;
  assessmentCoveragePct: number;
  controlVisibilityPct: number;
  exposureAssessed: boolean;
  visibilityGaps: Array<{
    id: string;
    questionCode: string;
    domainCode: string;
    prompt: string;
    statement: string;
    whyVisibilityMatters: string;
    evidenceNeeded: string;
    likelyEvidenceOwner: string;
    recommendedVerificationAction: string;
    priority: 'High' | 'Medium';
    targetTiming: '30 days' | '60 days';
  }>;
  materialExclusionSharePct: number;
  unknownSharePct: number;
  scoreComparabilityStatement: string;
  limitationReasons: string[];
  excludedQuestionCodes: string[];
  redirectedQuestionCodes: string[];
  invalidatedQuestionCodes: string[];
  unknownQuestionCodes: string[];
  questionTraces: unknown[];
};

export interface ScoreRunRecord {
  id: string;
  assessmentId: string;
  /**
   * The methodology version this score run was actually calculated against, sourced directly
   * from score_runs.methodology_version_id. The report must use this value, not the currently
   * active methodology, not the first active methodology, not a date-based inference, and not a
   * hardcoded version -- a score run locked against an older methodology version must still be
   * reported against that same version.
   */
  methodologyVersionId: string;
  status: string;
  lockedAt: string | null;
  inputHash: string | null;
  overallScore: number | null;
  calculatedMaturity: MaturityBand | null;
  finalMaturity: MaturityBand | null;
  exposureScore: number | null;
  exposureBand: ExposureBand | null;
  coveragePct: number;
  nARatePct: number;
  criticalGapCount: number;
  majorGapCount: number;
  capApplied: boolean;
  capReason: string | null;
  adaptiveResultStatus?: AdaptiveResultStatus | null;
  adaptiveMetrics?: AdaptiveResultMetrics | null;
}

export interface DomainResultRecord {
  domainCode: string;
  domainName: string;
  weightPct: number;
  rawScore: number | null;
  weightedContribution: number | null;
  coveragePct: number | null;
  criticalGapCount: number;
}

export interface GapQuestionRecord {
  questionCode: string;
  domainCode: string;
  domainName: string;
  prompt: string;
  responseValue: number | null;
  isCritical: boolean;
  isHardGate: boolean;
  isCriticalGap: boolean;
  isMajorGap: boolean;
}

/** Complete persisted question-level evidence from score_question_traces. */
export interface QuestionTraceRecord extends GapQuestionRecord {
  normalisedScore: number | null;
  applicable: boolean;
  triggeredRules: unknown[];
}

export interface ExposureAnswerRecord {
  factorCode: string;
  name: string;
  selectedLabel: string;
  pointsAwarded: number;
  maxPoints: number;
}

export interface MaturityCapEventRecord {
  ruleCode: string;
  capTo: MaturityBand;
  reason: string;
  relatedQuestionCode: string | null;
  relatedQuestionPrompt: string | null;
  /**
   * Domain code for this cap event. Resolved from the event's own related_domain_id when present,
   * falling back to the related question's domain when the event only recorded a question-level
   * reference. Null only for rules that are inherently cross-domain (e.g. "three or more critical
   * controls scored <=2"), which have neither a single question nor a single domain to point to.
   */
  relatedDomainCode: string | null;
  relatedDomainName: string | null;
}

export interface ScoreBand {
  min: number;
  max: number;
}

export interface RecommendationRuleRecord {
  ruleCode: string;
  title: string;
  severity: string;
  /**
   * Parsed numeric score band this rule applies to (e.g. {min:-Infinity,max:39}), derived from the
   * rule's condition_json/title at read time. Null for rules that aren't score-band rules (e.g. the
   * maturity-cap rule, matched on severity instead).
   */
  scoreBand: ScoreBand | null;
  action30: string | null;
  action60: string | null;
  action90: string | null;
}

export interface AssembledReportData {
  orderId: string;
  orderReference: string;
  orderAssessmentId: string;
  assessmentId: string;
  organisationId: string;
  currentScoreRunId: string;
  orderVerifiedAt: string | null;
  orderVerifiedBy: string | null;
  paymentVerification: import('@/lib/payments/payment-verification').PaymentVerificationEvidence;
  organisationName: string;
  respondentName: string;
  customerEmail: string;
  assessmentReference: string;
  reportReference: string;
  generatedAt: string;
  packageName: string;
  productCode: string | null;
  orderStatus: string;
  amountCents: number | null;
  currency: string | null;
  productPriceCents: number | null;
  productCurrency: string | null;
  requiresPaymentVerification: boolean | null;
  deliveryMode: string | null;
  productActive: boolean | null;
  scoreRun: ScoreRunRecord;
  domainResults: DomainResultRecord[];
  exposureAnswers: ExposureAnswerRecord[];
  /** All persisted traces for the locked score run, not only critical/major gaps. */
  questionTraces: QuestionTraceRecord[];
  criticalMajorGaps: GapQuestionRecord[];
  /** Validated response_scale rows for scoreRun.methodologyVersionId, loaded once per report. */
  officialResponseLabels: import('./response-labels').OfficialResponseLabel[];
  maturityCapEvents: MaturityCapEventRecord[];
  recommendationRules: RecommendationRuleRecord[];
  expectedDomainResultCount: number;
  actualDomainResultCount: number;
  expectedQuestionTraceCount: number;
  actualQuestionTraceCount: number;
  adaptiveScope?: AdaptiveResultMetrics | null;
}

export interface ContentBlock {
  blockKey: string;
  blockType: 'executive_summary' | 'domain_narrative' | 'gap_commentary' | 'false_comfort' | 'leadership_attention' | 'next_step_pathway';
  domainCode: string | null;
  maturityBand: MaturityBand | null;
  severity: string | null;
  title: string | null;
  body: string | null;
  status: 'draft' | 'active' | 'retired';
}

export interface SelectedContent {
  executiveSummary: { title: string; body: string; usedFallback: boolean };
  falseComfort: { title: string; body: string; usedFallback: boolean };
  leadershipAttention: { body: string; usedFallback: boolean };
  domainNarratives: Record<string, { title: string; body: string; usedFallback: boolean }>;
  gapCommentary: Record<string, { body: string; usedFallback: boolean }>;
}

export interface RoadmapItem {
  ruleCode: string;
  domainCode: string | null;
  domainName: string;
  ownerRole: string;
  rationale: string;
  severity: string;
  action30: string | null;
  action60: string | null;
  action90: string | null;
  priorityScore: number;
  /** Checkpoint D: exact authoritative action IDs from which this compatibility row was derived. */
  authoritativeActionIds?: string[];
}

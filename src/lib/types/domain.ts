export type AdminRole =
  | 'platform_admin'
  | 'reviewer'
  | 'approver'
  | 'finance_admin'
  | 'read_only_admin';

export type UserStatus = 'active' | 'suspended' | 'invited' | 'revoked';

export type AssessmentStatus =
  | 'draft'
  | 'submitted'
  | 'scored'
  | 'snapshot_available'
  | 'report_requested'
  | 'under_review'
  | 'closed'
  | 'voided';

export type AssessmentTokenType = 'resume' | 'snapshot' | 'report_request';

export type MethodologyStatus = 'draft' | 'approved' | 'active' | 'retired';

export type ScoreRunType = 'initial' | 'admin_recalc' | 'correction_recalc' | 'test_fixture';

export type ScoreRunStatus = 'draft' | 'completed' | 'voided';

export type MaturityBand = 'Reactive' | 'Developing' | 'Structured' | 'Strategic';

export type ExposureBand = 'Low' | 'Moderate' | 'High' | 'Severe';

export type OrderStatus =
  | 'created'
  | 'awaiting_payment'
  | 'proof_uploaded'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'cancelled'
  | 'refunded';

export type PaymentProofStatus = 'uploaded' | 'accepted' | 'rejected' | 'superseded';

export type ReportType = 'free_snapshot' | 'essential_self_assessment' | 'mk_validated';

export type ReportStatus =
  | 'draft'
  | 'generated'
  | 'under_review'
  | 'approved'
  | 'released'
  | 'superseded'
  | 'voided';

export type ReportTemplateStatus = 'draft' | 'active' | 'retired';

export type ContentStatus = 'draft' | 'active' | 'retired';

export type AuditActorType = 'admin' | 'respondent_token' | 'system';


export type QuestionImportance = 'standard' | 'important' | 'critical';

export type ResponseScaleOption = {
  responseValue: number;
  label: string;
  operationalMeaning: string | null;
  normalisedScore: number;
};

export type MethodologyQuestion = {
  id: string;
  questionCode: string;
  domainCode: string;
  domainName: string;
  prompt: string;
  helpText: string | null;
  weight: number;
  isCritical: boolean;
  isHardGate: boolean;
  nAAllowed: boolean;
  nARuleKey: string | null;
  triggerKey: string | null;
  sortOrder: number;
};

export type MethodologyDomain = {
  id: string;
  domainCode: string;
  name: string;
  weightPct: number;
  domainType: string;
  isCore: boolean;
  sortOrder: number;
  questions: MethodologyQuestion[];
};

export type SavedAssessmentAnswer = {
  questionId: string;
  questionCode: string;
  responseValue: number | null;
  isNotApplicable: boolean;
  nAReason: string | null;
};

export type ExposureFactorOption = {
  value: string;
  label: string;
  points: number;
};

export type ExposureFactor = {
  id: string;
  factorCode: string;
  name: string;
  maxPoints: number;
  inputType: string;
  options: ExposureFactorOption[];
  sortOrder: number;
};

export type SavedExposureAnswer = {
  exposureFactorId: string;
  factorCode: string;
  selectedValue: string | null;
  selectedLabel: string | null;
  pointsAwarded: number;
};

export type AssessmentProgress = {
  totalQuestions: number;
  answeredQuestions: number;
  totalExposureFactors: number;
  answeredExposureFactors: number;
  overallPct: number;
  domainProgress: Array<{
    domainCode: string;
    name: string;
    answeredQuestions: number;
    totalQuestions: number;
    pct: number;
  }>;
};

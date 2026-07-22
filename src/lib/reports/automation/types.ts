import type { AssembledReportData, RoadmapItem, SelectedContent } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';

export const PREMIUM_REPORT_PROMPT_VERSION = 'mk-premium-report-v3-grounded-narrative';
export const PREMIUM_REPORT_SCHEMA_VERSION = 'mk-premium-ai-grounded-narrative-v3';

/** Maximum characters the AI may write for any single narrative body field. Mirrors the
 * deterministic-validator body length ceiling in automation/validation.ts (2500). */
export const PREMIUM_REPORT_AI_BODY_MAX_CHARS = 2000;

export type PremiumReportFulfilmentStatus =
  | 'queued'
  | 'assembling'
  | 'generating'
  | 'validating'
  | 'rendering'
  | 'storing'
  | 'ready_for_delivery'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PremiumReportGenerationMode = 'ai' | 'ai_repair' | 'deterministic_fallback';

export type PremiumReportTriggerSource =
  | 'payment_confirmation'
  | 'admin_generate'
  | 'admin_retry'
  | 'admin_regenerate';

export interface PremiumReportAutomationFlags {
  securityGateSatisfied: boolean;
  securityGateVersion: number | null;
  autoFulfilmentEnabled: boolean;
  aiNarrativeEnabled: boolean;
  autoEmailEnabled: boolean;
  manualDeliveryEnabled: boolean;
  testRecipientOverrideEnabled: boolean;
  testRecipientOverride: string | null;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

export type ReportEvidenceKind =
  | 'overall_score'
  | 'final_maturity'
  | 'calculated_maturity'
  | 'exposure_score'
  | 'exposure_band'
  | 'coverage'
  | 'gap_count'
  | 'domain'
  | 'gap'
  | 'question_response'
  | 'material_finding'
  | 'maturity_cap'
  | 'contradiction'
  | 'plausible_scenario'
  | 'risk'
  | 'control_improvement'
  | 'evidence_checklist'
  | 'leadership_decision'
  | 'roadmap_action'
  | 'assessment_limitation'
  | 'roadmap';

export interface ReportEvidenceItem {
  id: string;
  kind: ReportEvidenceKind;
  label: string;
  value: unknown;
  domainCode?: string;
  questionCode?: string;
  ruleCode?: string;
  evidenceRefs?: string[];
}

export interface PremiumReportEvidencePack {
  schemaVersion: string;
  assessmentReference: string;
  organisationName: string;
  packageName: string;
  scoreRunId: string;
  methodologyVersionId?: string;
  generatedAt?: string;
  selfAssessmentLimitation?: string;
  methodologyAuthority: 'deterministic';
  narrativeAuthority?: 'ai_optional_validated';
  advisoryModel?: AdvisoryEvidenceModel;
  items: ReportEvidenceItem[];
}

export interface NarrativeSection {
  title?: string;
  body: string;
  evidenceRefs: string[];
}

export interface PremiumReportNarrative {
  executiveDiagnosis: Required<Pick<NarrativeSection, 'title' | 'body' | 'evidenceRefs'>>;
  falseComfort: Required<Pick<NarrativeSection, 'title' | 'body' | 'evidenceRefs'>>;
  leadershipAttention: Pick<NarrativeSection, 'body' | 'evidenceRefs'>;
  domainNarratives: Array<{
    domainCode: string;
    title: string;
    body: string;
    evidenceRefs: string[];
  }>;
  gapCommentary: Array<{
    questionCode: string;
    body: string;
    evidenceRefs: string[];
  }>;
}

/**
 * The AI's grounded-narrative draft. Every body field is customer-facing prose the AI is
 * proposing; every evidenceRefs field is the closed set of deterministic evidence identifiers
 * that must support that body (enforced by validatePremiumReportAiEditorialPlan and, on the
 * fully assembled narrative, by validatePremiumReportNarrative). The AI never supplies titles,
 * scores, bands, counts or roadmap actions -- those remain deterministic and are attached by
 * aiPlanToNarrative() in content.ts. Prior to schema v3 this type carried evidence references
 * only and no narrative body ever reached the report; see docs/v1/phase14/ai-narrative-fix.md.
 */
export interface PremiumReportAiEditorialPlan {
  executiveEvidenceRefs: string[];
  executiveBody: string;
  falseComfortEvidenceRefs: string[];
  falseComfortBody: string;
  leadershipEvidenceRefs: string[];
  leadershipBody: string;
  domainEvidence: Array<{
    domainCode: string;
    evidenceRefs: string[];
    body: string;
  }>;
  gapEvidence: Array<{
    questionCode: string;
    evidenceRefs: string[];
    body: string;
  }>;
}

export interface NarrativeValidationIssue {
  code: string;
  path: string;
  message: string;
  blocking: true;
}

export interface NarrativeValidationResult {
  ok: boolean;
  issues: NarrativeValidationIssue[];
  checkedAt: string;
  schemaVersion: string;
}

export interface NarrativeGenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostMicros?: number;
}

export interface NarrativeGenerationResult {
  output: PremiumReportAiEditorialPlan;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: NarrativeGenerationUsage;
}

export interface NarrativeGenerationInput {
  evidence: PremiumReportEvidencePack;
  evidenceChecksum: string;
  deterministicContent: SelectedContent;
  roadmap: { agenda: RoadmapItem[] };
  advisoryModel?: AdvisoryEvidenceModel;
  promptVersion: string;
  schemaVersion: string;
  previousOutput?: PremiumReportAiEditorialPlan;
  validationIssues?: NarrativeValidationIssue[];
}

export interface PremiumReportNarrativeGenerator {
  readonly provider: string;
  readonly model: string;
  generate(input: NarrativeGenerationInput): Promise<NarrativeGenerationResult>;
  repair(input: NarrativeGenerationInput): Promise<NarrativeGenerationResult>;
}

export interface PreparedPremiumReportNarrative {
  narrative: PremiumReportNarrative;
  selectedContent: SelectedContent;
  mode: PremiumReportGenerationMode;
  evidence: PremiumReportEvidencePack;
  evidenceChecksum: string;
  validation: NarrativeValidationResult;
  initialValidation?: NarrativeValidationResult;
  repairValidation?: NarrativeValidationResult;
  generation?: NarrativeGenerationResult;
  repairGeneration?: NarrativeGenerationResult;
  fallbackReason?: string;
}

export interface BuildPremiumReportNarrativeInput {
  assembled: AssembledReportData;
  deterministicContent: SelectedContent;
  roadmap: { agenda: RoadmapItem[] };
  advisoryModel?: AdvisoryEvidenceModel;
  flags: PremiumReportAutomationFlags;
  generator?: PremiumReportNarrativeGenerator;
  generationIdentity?: string;
  fulfilmentId?: string | null;
  workerCapabilityId?: string | null;
  authorizeAiAction?: () => Promise<unknown>;
}

import type { AssembledReportData, RoadmapItem, SelectedContent } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';

// Bumped from v4. The provider-facing contract genuinely changed: per-section maxLength values
// replaced the single 2,000 default, maxItems appeared on both evidence arrays, and the prompt now
// carries explicit concision direction. schema_version is part of the attempt-reuse fingerprint in
// durable-ai-attempts.ts, so leaving it at v4 would let a persisted v4 attempt be matched against
// the tighter contract and reused with bodies that no longer conform.
// v6: the prompt now carries a deterministic no-exposure grounding instruction when the evidence
// pack contains no exposure score or band. That changes model behaviour materially, so the PROMPT
// version moves. The schema's structure and maxima are unchanged, so it deliberately stays v5 --
// they are versioned separately because they are separate contracts.
export const PREMIUM_REPORT_PROMPT_VERSION = 'mk-essential-report-v6-advisory-editor-grounding';
export const PREMIUM_REPORT_SCHEMA_VERSION = 'mk-essential-ai-advisory-editor-v5';
export const PREMIUM_REPORT_EVIDENCE_PROJECTION_VERSION = 'mk-essential-evidence-projection-v3-compact';

/** Absolute safety ceiling for any single narrative body field. Mirrors the deterministic-validator
 * body length ceiling in automation/validation.ts (2500). Retained as a backstop -- the
 * provider-facing contract is the tighter per-section table below, and nothing may exceed this. */
export const PREMIUM_REPORT_AI_BODY_MAX_CHARS = 2000;

/**
 * Authoritative per-section body maxima. THE single source of truth: the structured-output schema
 * and the deterministic narrative brief both import this, so a limit cannot drift between what the
 * provider is told and what the schema enforces.
 *
 * Why these numbers. V5 (attempt 50b0a33e) reached the provider, was accounted for, and still
 * failed: finishReason 'length', rawFinishReason 'max_output_tokens', settled
 * structured_output_truncated. The generic 2,000-char default across 19 bodies permitted roughly
 * 33,200 narrative characters before JSON keys, codes and 120 evidence refs (~2,348 chars). The
 * envelope, not the input, was the problem -- the V5 deterministic fallback needed only 4,681
 * characters of body across the same 19 sections.
 *
 * These are MAXIMA, not writing targets. A 10-domain / 6-gap report now ceilings at 12,600 body
 * characters, and the bounded worst case (10 domains, ESSENTIAL_CAPS.findings gaps) at 13,700 --
 * still ~2.7x the deterministic V5, so the prose can get materially stronger while fitting.
 */
export const PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS = {
  executive: 1200,
  falseComfort: 800,
  leadership: 800,
  domain: 650,
  gap: 550
} as const;

export type PremiumReportNarrativeSectionKind = keyof typeof PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS;

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
  modelSelectionSource?: string;
  configuredModelOverride?: string;
  modelOverrideRejected?: string;
  promptVersion: string;
  schemaVersion: string;
  /**
   * Set when the database explicitly declares a prompt/schema version that disagrees with the
   * compiled contract. The compiled code IS the contract -- a config row must never be able to
   * label v6/v5 executable prompt and schema code as something else. V6's two real AI attempts were
   * stamped v2 exactly that way, defeating the reason the version was bumped, because
   * prompt_version and schema_version participate in durable-attempt identity and reuse.
   */
  contractVersionMismatch: string | null;
}

export type ReportEvidenceKind =
  | 'score_scale'
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
  | 'visibility_gap'
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

export interface NarrativeSectionBrief {
  sectionId: string;
  purpose: string;
  requiredEvidenceRefs: string[];
  allowedEvidenceRefs: string[];
  requiredThemes: string[];
  prohibitedThemes: string[];
  maxCharacters: number;
}

export interface PremiumReportNarrativeBrief {
  version: 'mk-essential-narrative-brief-v1';
  executive: NarrativeSectionBrief;
  falseComfort: NarrativeSectionBrief;
  leadership: NarrativeSectionBrief;
  domains: Record<string, NarrativeSectionBrief>;
  gaps: Record<string, NarrativeSectionBrief>;
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

export interface AiGatewayExecutionProvenance {
  generationId: string;
  originalModelId?: string;
  canonicalSlug?: string;
  resolvedProvider?: string;
  finalProvider?: string;
  resolvedProviderApiModelId: string;
  sdkResponseModelId?: string;
  identitySource: 'gateway.routing';
}

export interface NarrativeGenerationResult {
  output: PremiumReportAiEditorialPlan;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: NarrativeGenerationUsage;
  gateway?: AiGatewayExecutionProvenance;
  responseId?: string;
  finishReason?: string;
  rawFinishReason?: string;
  rawOutputLength?: number;
  rawOutputSha256?: string;
}

export interface NarrativeRepairScope {
  failedSectionIds: string[];
}

export interface NarrativeGenerationInput {
  evidence: PremiumReportEvidencePack;
  evidenceChecksum: string;
  narrativeBrief: PremiumReportNarrativeBrief;
  promptVersion: string;
  schemaVersion: string;
  previousOutput?: PremiumReportAiEditorialPlan;
  validationIssues?: NarrativeValidationIssue[];
  repairScope?: NarrativeRepairScope;
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
  /** The effective plan after the scoped merge. The raw provider response remains in repairGeneration. */
  effectiveRepairOutput?: PremiumReportAiEditorialPlan;
  discardedCompliantRepairSectionIds?: string[];
  fallbackReason?: string;
  /** Safe pre-dispatch budget measurements; raw prompt content is never retained. */
  aiBudgetDiagnostics?: import('./phase-timing').PremiumReportAiBudgetDiagnostics | null;
}

export interface BuildPremiumReportNarrativeInput {
  assembled: AssembledReportData;
  deterministicContent: SelectedContent;
  /**
   * The single bounded Essential projection instance for this generation. Required on the Essential
   * paid path; absent only on legacy report paths that predate the bounded architecture.
   */
  essentialProjection?: import('../essential-projection').EssentialProjection;
  roadmap: { agenda: RoadmapItem[] };
  advisoryModel?: AdvisoryEvidenceModel;
  flags: PremiumReportAutomationFlags;
  generator?: PremiumReportNarrativeGenerator;
  generationIdentity?: string;
  fulfilmentId?: string | null;
  manualGenerationAttemptId?: string | null;
  workerCapabilityId?: string | null;
  authorizeAiAction?: () => Promise<unknown>;
  authorizeAiRoute?: () => Promise<{ allowed: boolean; reason?: string }>;
  attemptStore?: import('./durable-ai-attempts').DurableNarrativeAttemptStore;
}

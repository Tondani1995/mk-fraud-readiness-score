import type { ExposureAnswerRecord, GapQuestionRecord, MaturityCapEventRecord, QuestionTraceRecord, ScoreRunRecord } from '../types';
import type { OfficialResponseLabel } from '../response-labels';

export type ImplementationDifficulty = 'Low' | 'Moderate' | 'High';
export type TargetPeriod = '30 days' | '60 days' | '90 days';

export type MaterialFindingSelectionReason =
  | 'HARD_GATE_FAILURE'
  | 'CRITICAL_CONTROL_FAILURE'
  | 'MATURITY_CAP_EVENT'
  | 'CRITICAL_GAP'
  | 'MAJOR_GAP'
  | 'ABSENT_CONTROL'
  | 'PARTIAL_KEY_CONTROL_HIGH_EXPOSURE'
  | 'WEAKEST_DOMAIN'
  | 'EXPOSURE_CONTROL_MISMATCH'
  | 'MATERIAL_CONTRADICTION'
  | 'CROSS_DOMAIN_DEPENDENCY'
  | 'STRONG_AGGREGATE_MASKING_CRITICAL_WEAKNESS'
  | 'PRIORITY_SCENARIO_ENABLER';

export type MaterialFindingClass =
  | 'control_failure'
  | 'control_gap'
  | 'exposure_mismatch'
  | 'maturity_constraint'
  | 'assurance_priority'
  | 'cross_domain_dependency';

/**
 * A single material control finding, evidence-linked to one real assessment question/response.
 * Every field is sourced directly from AssembledReportData or from the exact question playbook
 * registry. Domain playbooks are never used for material findings. See material-findings.ts.
 */
export interface MaterialFinding {
  id: string;
  title: string;
  domainCode: string;
  domainName: string;
  questionCode: string;
  questionPrompt: string;
  methodologyVersionId: string;
  responseValue: number | null;
  responseLabel: string;
  responseOperationalMeaning: string;
  normalisedScore: number | null;
  responseMeaning: string;
  materialityClass: MaterialFindingClass;
  selectionReasons: MaterialFindingSelectionReason[];
  materialityScore: number;
  isCriticalControl: boolean;
  isHardGate: boolean;
  gapClassification: 'critical' | 'major' | 'none';
  maturityCapStatus: 'capping' | 'not_capping';
  /** Every distinct cap rule linked to this question, sorted lexically for stable output. */
  relatedCapRuleCodes: string[];
  /** First lexically sorted cap rule, retained for backward compatibility. */
  relatedCapRuleCode: string | null;
  linkedExposureFactorCodes: string[];
  linkedScenarioTypes: string[];
  diagnosis: string;
  whyItMatters: string;
  fraudMechanism: string;
  likelyFinancialImpact: string;
  likelyOperationalImpact: string;
  expectedControlStandard: string;
  evidenceToRequest: string[];
  recommendedControl: string;
  accountableOwner: string;
  processOwner: string;
  oversightFunction: string;
  supportingFunctions: string[];
  operatingFrequency: string;
  minimumEvidenceCharacteristics: string[];
  dependencies: string[];
  implementationDifficulty: ImplementationDifficulty;
  targetPeriod: TargetPeriod;
  effectivenessMeasure: string;
  escalationThreshold: string;
  playbookSource: string | null;
  fallbackStatus: 'exact_question_playbook' | 'missing_question_playbook';
  selfAssessmentLimitation: string;
}

export type ContradictionPattern =
  | 'strong_detection_weak_response'
  | 'strong_identification_weak_improvement'
  | 'strong_domain_failed_critical_control'
  | 'exposure_outpaces_control'
  | 'whistleblowing_present_but_weak'
  | 'access_control_gap_operational_and_digital';

export interface Contradiction {
  id: string;
  pattern: ContradictionPattern;
  title: string;
  drivingResponses: string;
  whyItMatters: string;
  falseComfortRisk: string;
  whatLeadershipShouldVerify: string;
  fraudPathwayEnabled: string;
  linkedFindingIds: string[];
  linkedRiskId: string | null;
  evidenceRefs: string[];
  materialityScore: number;
}

export type ScenarioBasis = 'control_gap' | 'assurance_validation';

export interface PlausibleScenario {
  id: string;
  scenarioType: string;
  scenarioBasis: ScenarioBasis;
  title: string;
  confirmedOperatingContext: string[];
  entryPoint: string;
  linkedControlWeaknesses: string[];
  fraudSequence: string;
  controlsExpected: string[];
  concealmentMechanism: string;
  whyControlsMayNotCatchIt: string;
  earlyWarningIndicators: string[];
  likelyImpact: string[];
  financialImpact: string;
  operationalImpact: string;
  immediateContainment: string;
  longerTermResponse: string;
  linkedFindingIds: string[];
  linkedQuestionCodes: string[];
  linkedRiskIds: string[];
  linkedRiskId: string;
  evidenceRefs: string[];
  disclaimer: string;
}

export type Likelihood = 'Low' | 'Moderate' | 'High';
export type Impact = 'Low' | 'Moderate' | 'High' | 'Severe';

export interface RiskRegisterEntry {
  id: string;
  title: string;
  cause: string;
  riskEvent: string;
  financialImpact: string;
  operationalImpact: string;
  legalRegulatoryImpact?: string;
  reputationalImpact?: string;
  riskStatement: string;
  linkedFindingIds: string[];
  linkedQuestionCodes: string[];
  linkedScenarioIds: string[];
  affectedDomains: string[];
  /** Legacy rendering alias derived from affectedDomains. */
  affectedDomain: string;
  likelihood: Likelihood;
  likelihoodRationale: string;
  impact: Impact;
  impactRationale: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  currentControlPosition: string;
  requiredTreatment: string;
  accountableExecutive: string;
  processOwner: string;
  oversightFunction: string;
  targetPeriod: TargetPeriod;
  /** Legacy rendering alias; contains the deterministic target period, never wall-clock output. */
  accountableOwner: string;
  targetDate: string;
  effectivenessMeasure: string;
  evidenceRefs: string[];
  assessmentConfidence: 'Self-assessment only, not independently verified';
  remainingLimitation: string;
}

export interface ControlImprovementEntry {
  id: string;
  linkedFindingId: string;
  linkedRiskId: string;
  linkedRiskIds: string[];
  linkedQuestionCode: string;
  currentState: string;
  targetState: string;
  controlObjective: string;
  controlDesign: string;
  accountableExecutive: string;
  processOwner: string;
  oversightFunction: string;
  /** Legacy aliases retained for the current renderer. */
  accountableOwner: string;
  oversightOwner: string;
  supportingFunctions: string[];
  operatingFrequency: string;
  completePopulationCoverage: string;
  evidenceRetained: string[];
  requiredEvidence: string[];
  minimumEvidenceCharacteristics: string[];
  dependencies: string[];
  implementationDependency: string;
  implementationDifficulty: ImplementationDifficulty;
  targetPeriod: TargetPeriod;
  effectivenessTest: string;
  escalationThreshold: string;
  evidenceRefs: string[];
}

export interface EvidenceChecklistItem {
  id: string;
  artefact: string;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  linkedQuestionCodes: string[];
  /** Legacy aliases derived from the canonical arrays. */
  linkedFindingId: string;
  linkedRiskId: string;
  likelyOwner: string;
  provesWhat: string;
  expectedRecency: string;
  requiredPopulation: string;
  samplingExpectation: string;
  minimumAcceptableCharacteristics: string[];
  reviewStatus: 'Not yet requested' | 'Requested' | 'Received' | 'Insufficient' | 'Validated';
  evidenceRef: string;
}

export type LeadershipDecisionCategory =
  | 'accountable_executive_mandate'
  | 'funding_resource_allocation'
  | 'control_design_standard'
  | 'risk_acceptance_or_remediation'
  | 'independent_validation'
  | 'sequencing_dependency'
  | 'external_specialist_support'
  | 'governance_reporting_cadence';

export interface LeadershipDecision {
  id: string;
  decisionCategory: LeadershipDecisionCategory;
  decisionRequired: string;
  evidenceDrivingIt: string;
  whyNow: string;
  recommendedDecision: string;
  accountableExecutive: string;
  implementationOwner: string;
  oversightFunction: string;
  targetPeriod: TargetPeriod;
  deadline: string;
  consequenceOfDelay: string;
  immediateNextDeliverable: string;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  evidenceRefs: string[];
}

export interface RoadmapAction {
  id: string;
  period: TargetPeriod;
  domainCode: string;
  domainName: string;
  deliverable: string;
  accountableExecutive: string;
  processOwner: string;
  oversightFunction: string;
  supportingFunctions: string[];
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  dependencyIds: string[];
  escalationThreshold: string;
  evidenceRefs: string[];
  /** Legacy aliases derived from the canonical fields. */
  accountableOwner: string;
  linkedFindingId: string;
  linkedRiskId: string;
  dependency: string;
  implementationDifficulty: ImplementationDifficulty;
  successMeasure: string;
  evidenceOfCompletion: string;
}

export interface FunctionalAgendaItem {
  id: string;
  function: string;
  question: string;
  linkedFindingId: string | null;
  linkedRiskId: string | null;
  evidenceRefs: string[];
}

export interface AdvisoryEvidenceModel {
  materialFindings: MaterialFinding[];
  contradictions: Contradiction[];
  scenarios: PlausibleScenario[];
  riskRegister: RiskRegisterEntry[];
  controlImprovements: ControlImprovementEntry[];
  evidenceChecklist: EvidenceChecklistItem[];
  leadershipDecisions: LeadershipDecision[];
  roadmapActions: RoadmapAction[];
  functionalAgenda: FunctionalAgendaItem[];
}

// --- Commercial quality gate (V7 Checkpoint B) -----------------------------------------------
//
// Replaces the old unstructured `violations: string[]` / `warnings: string[]` shape with stable,
// machine-readable issue objects. Every quality-gate consumer (checkQualityGates() below, and the
// rendered-content/rendered-roadmap checks in ../../commercial-quality.ts) must emit these.

export type CommercialQualitySeverity = 'violation' | 'warning';

/**
 * Stable, machine-readable commercial-quality issue codes. This is the minimum required set from
 * the Checkpoint B brief. Do not collapse unrelated defects onto one generic code -- each of these
 * corresponds to exactly one identifiable defect class.
 */
export type CommercialQualityIssueCode =
  | 'QG_FINDING_DOMAIN_MISSING'
  | 'QG_RECOMMENDED_CONTROL_MISSING'
  | 'QG_SOURCE_QUESTION_MISSING'
  | 'QG_RESPONSE_VALUE_MISSING'
  | 'QG_DUPLICATE_FINDING_ID'
  | 'QG_DUPLICATE_SOURCE_QUESTION'
  | 'QG_SCENARIO_MINIMUM_NOT_MET'
  | 'QG_SCENARIO_EVIDENCE_MISSING'
  | 'QG_SCENARIO_DISCLAIMER_MISSING'
  | 'QG_RISK_REGISTER_MISSING'
  | 'QG_CONTROL_REGISTER_MISSING'
  | 'QG_EVIDENCE_CHECKLIST_MISSING'
  | 'QG_ROADMAP_DELIVERABLE_MISSING'
  | 'QG_ROADMAP_GENERIC_LANGUAGE'
  | 'QG_ROADMAP_OWNER_MISSING'
  | 'QG_ROADMAP_MEASURE_MISSING'
  | 'QG_RENDERED_ROADMAP_DOMAIN_MISSING'
  | 'QG_RENDERED_ROADMAP_RATIONALE_MISSING'
  | 'QG_RENDERED_ROADMAP_ACTION_MISSING'
  | 'QG_RENDERED_ROADMAP_ACTION_TOO_SHORT'
  | 'QG_RENDERED_ROADMAP_GENERIC_LANGUAGE'
  | 'QG_RENDERED_CONTENT_MISSING'
  | 'QG_RENDERED_CONTENT_TITLE_MISSING'
  | 'QG_RENDERED_CONTENT_BODY_MISSING'
  | 'QG_PLACEHOLDER_TEXT_PRESENT'
  | 'QG_COMMERCIAL_VOLUME_WARNING'
  | 'QG_QUALITY_EVALUATION_FAILED'
  | 'QG_EXECUTIVE_DIAGNOSIS_CAP_COUNT_RISK'
  | 'QG_RENDERED_ROADMAP_OWNER_MISSING'
  | 'QG_MATERIAL_PLAYBOOK_MISSING'
  | 'QG_RISK_CAUSE_MISSING'
  | 'QG_RISK_EVENT_MISSING'
  | 'QG_RISK_IMPACT_MISSING'
  | 'QG_RISK_EVIDENCE_MISSING'
  | 'QG_DUPLICATE_RISK'
  | 'QG_CONTRADICTION_EVIDENCE_MISSING'
  | 'QG_DUPLICATE_CONTRADICTION'
  | 'QG_SCENARIO_BASIS_INVALID'
  | 'QG_DECISION_DUPLICATE'
  | 'QG_DECISION_LINKAGE_MISSING'
  | 'QG_EVIDENCE_CRITERIA_MISSING'
  | 'QG_ROADMAP_SOURCE_MISMATCH'
  | 'QG_ROADMAP_DEPENDENCY_INVALID'
  | 'QG_AI_EVIDENCE_REF_DUPLICATE'
  | 'QG_AI_EVIDENCE_REF_UNRESOLVED'
  | 'QG_AI_EVIDENCE_CONTAINS_PII'
  | 'QG_AI_NARRATIVE_BRIEF_INVALID';

/**
 * A single typed commercial-quality issue. `message` may include safe internal identifiers
 * (finding ID, question code, scenario ID, roadmap item ID, domain code, content block key) but
 * must never include customer email addresses, respondent names, raw assessment answers, report
 * prose, or generated HTML.
 */
export interface CommercialQualityIssue {
  code: CommercialQualityIssueCode;
  severity: CommercialQualitySeverity;
  message: string;
  entityId?: string;
  source?: string;
}

export interface QualityGateResult {
  passed: boolean;
  violations: CommercialQualityIssue[];
  warnings: CommercialQualityIssue[];
}

/** Inputs the evidence-model builder actually consumes, re-exported here for convenience. */
export interface EvidenceModelInput {
  organisationName: string;
  scoreRun: ScoreRunRecord;
  domainResults: { domainCode: string; domainName: string; rawScore: number | null; weightPct: number }[];
  criticalMajorGaps: GapQuestionRecord[];
  questionTraces: QuestionTraceRecord[];
  officialResponseLabels: OfficialResponseLabel[];
  maturityCapEvents: MaturityCapEventRecord[];
  exposureAnswers: ExposureAnswerRecord[];
}

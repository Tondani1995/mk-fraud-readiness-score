import type { AssembledReportData } from '../types';
import type { EssentialProjection } from '../essential-projection';
import type { AdvisoryEvidenceModel, ControlImprovementEntry, LeadershipDecision, MaterialFinding, NarrativeMode, PlausibleScenario, RiskRegisterEntry, RoadmapAction, SustainmentPriority } from '../evidence-model/types';
import type { ComprehensiveDeliveryModel } from '../comprehensive/types';
import type { FraudPathwayFamily, PrimarySemanticFamily } from '../evidence-model/semantic-mappings';
import { buildDecisionOptionSets } from '../comprehensive/decision-options';
import { REPORTING_BIBLE_VERSION } from '../reporting-bible';
import { buildNarrativeMaturationSteps, type NarrativeMaturationStep } from './maturation';
import { exposuresFromContext, hasExposure, type OperatingExposureId, type SupportedExposure } from './operating-exposures';
import {
  adaptiveGraphVersionForAssessment,
  deriveNarrativeOperatingContext,
  describeOperatingContextFact,
  type OperatingContextFact
} from './operating-context';
import {
  assertComprehensivePremiumProjection,
  buildComprehensivePremiumProjection,
  premiumFactEntries,
  type ComprehensivePremiumProjection,
  type EnterpriseIntegrationMap,
  type NarrativeAssuranceCoverageFact,
  type NarrativeAssurancePriorityFact,
  type NarrativeContextApplication,
  type NarrativeControlOutcomeLink,
  type NarrativeControlRelianceFact,
  type NarrativeExposurePathwayFact,
  type NarrativeResilienceTestFact,
  type NarrativeRoadmapDependencyLink
} from './premium-projection';

export const NARRATIVE_FACT_PACK_SCHEMA_VERSION = 'mk-reporting-bible-1.1-fact-pack-v1';

export type NarrativeProductTier = 'essential' | 'comprehensive';

export interface NarrativeFact {
  id: string;
  kind: string;
  value: unknown;
  sourceRefs: string[];
}

export interface NarrativeDomainFact {
  factRef: string;
  code: string;
  name: string;
  score: number | null;
  maturity: string | null;
  weightPct: number | null;
  coveragePct: number | null;
  criticalGapCount: number;
}

export interface NarrativeThemeFact {
  factRef: string;
  themeFamily: string;
  managementQuestion: string;
  title: string;
  findingRefs: string[];
  domainCodes: string[];
  semanticFamilies: PrimarySemanticFamily[];
  riskRefs: string[];
  scenarioRefs: string[];
  managementImplicationBasis: string;
  fraudRiskRelationship: string;
  whyTogether: string;
}

export interface NarrativeFindingFact {
  factRef: string;
  sourceId: string;
  title: string;
  domain: string;
  questionCode: string;
  primarySemanticFamily: PrimarySemanticFamily;
  secondarySemanticFamilies: PrimarySemanticFamily[];
  fraudPathwayFamilies: FraudPathwayFamily[];
  recordedPosition: string;
  deterministicCondition: string;
  interpretation: string;
  advisoryMeaningBasis: string;
  whyItMatters: string;
  materialityReason: string;
  assuranceBoundary: string;
  materiality: string;
  priorityScore: number;
  owner: string;
  processOwner: string;
  targetPeriod: string;
  approvedControlResponse: string;
  effectivenessMeasure: string;
  sourceRefs: string[];
}

export interface NarrativeRiskFact {
  factRef: string;
  sourceId: string;
  title: string;
  statement: string;
  cause: string;
  riskEvent: string;
  priority: string;
  likelihood: string;
  impact: string;
  qualitativeConsequence: string;
  linkedFindingRefs: string[];
  approvedTreatment: string;
  owner: string;
  targetPeriod: string;
}

export interface NarrativeScenarioFact {
  factRef: string;
  sourceId: string;
  /** Canonical scenario identity used by Comprehensive output. */
  canonicalScenarioId: string;
  scenarioFamily: FraudPathwayFamily;
  title: string;
  /**
   * The operating exposure that contextualised this scenario, or null when the assessment
   * established none and the neutral wording was kept. Traceability only -- never rendered.
   */
  contextualExposure?: OperatingExposureId | null;
  actorClass: string;
  opportunity: string;
  entryPoint: string;
  mechanism: string;
  currentControlWeakness: string;
  requiredControlResponse: string;
  concealment: string;
  consequence: string;
  warningIndicators: string[];
  immediateContainment: string;
  longTermResponse: string;
  /** Canonical domain identifiers; Fact Pack factRefs remain narrative-only. */
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  linkedFindingRefs: string[];
  linkedRiskRefs: string[];
}

export interface NarrativeControlFact {
  factRef: string;
  sourceId: string;
  primarySemanticFamily: PrimarySemanticFamily;
  objective: string;
  currentState: string;
  targetState: string;
  accountableExecutive: string;
  processOwner: string;
  population: string;
  frequency: string;
  proofRetained: string[];
  independentCheck: string;
  escalationTrigger: string;
  sla: string;
  effectivenessMeasure: string;
  failureResponse: string;
  dependencies: string[];
  linkedFindingRefs: string[];
  linkedSustainmentPriorityRefs: string[];
}

export interface NarrativeDecisionFact {
  factRef: string;
  sourceId: string;
  decisionFamily: string;
  decisionSemanticFamily: string;
  question: string;
  options: Array<{ option: string; cost: string; benefit: string; tradeOff: string }>;
  recommendedRoute: string;
  rationale: string;
  owner: string;
  targetDate: string;
  consequenceOfDelay: string;
  linkedFindingRefs: string[];
  linkedSustainmentPriorityRefs: string[];
}

export interface NarrativeRoadmapFact {
  factRef: string;
  sourceId: string;
  sourceFindingRef: string;
  primarySemanticFamily: PrimarySemanticFamily;
  phase: 'STABILISE' | 'ESTABLISH' | 'EMBED' | 'MATURE';
  phaseWindow: string;
  managementOutcome: string;
  priorityWork: string;
  accountableExecutive: string;
  processOwner: string;
  targetPeriod: string;
  dependencies: string[];
  proofOfCompletion: string;
  successMeasure: string;
  failureTrigger: string;
  sourceSustainmentPriorityRef?: string;
}

export interface NarrativeSustainmentPriorityFact {
  factRef: string;
  title: string;
  domain: string;
  semanticFamily: PrimarySemanticFamily;
  recordedPosition: string;
  currentStrongStandard: string;
  managementFocus: string;
  accountableExecutive: string;
  processOwner: string;
  operatingFrequency: string;
  proofRetained: string[];
  deteriorationTrigger: string;
  effectivenessIndicator: string;
  dependencies: string[];
  /** Comprehensive-only source identity retained for cross-artifact provenance. */
  sourceId?: string;
  sourceFindingId?: string;
  sourceQuestionCode?: string;
  sourceDomainCode?: string;
  sourceRefs?: string[];
}

/**
 * Question-level evidence retained for the Comprehensive writer. The score and maturity remain
 * unchanged; this additive view prevents a healthy profile from collapsing into only three
 * score-level priorities. Excluded or not-applicable traces remain represented with their recorded
 * state so the writer cannot silently turn absence into a positive assertion.
 */
export interface NarrativeQuestionSignal {
  factRef: string;
  questionCode: string;
  domainCode: string;
  domainName: string;
  prompt: string;
  responseValue: number | null;
  responseLabel: string;
  responseOperationalMeaning: string;
  normalisedScore: number | null;
  applicable: boolean;
  triggeredRules: string[];
  isCritical: boolean;
  isHardGate: boolean;
  isCriticalGap: boolean;
  isMajorGap: boolean;
  contextRefs: string[];
  sourceRefs: string[];
}

export interface NarrativeBounds {
  themeCount: number;
  findingCount: number;
  scenarioCount: number;
  controlCount: number;
  decisionCount: number;
  managementResponseCount: number;
  maturationCount?: number;
}

export interface NarrativeProofFact {
  factRef: string;
  sourceId: string;
  linkedFindingRefs: string[];
  requirement: string;
  owner: string;
  whyItMatters: string;
  expectedRecency: string;
  requiredPopulation: string;
  acceptableExamples: string[];
}

export interface NarrativeFactPack {
  schemaVersion: typeof NARRATIVE_FACT_PACK_SCHEMA_VERSION;
  bibleVersion: typeof REPORTING_BIBLE_VERSION;
  productTier: NarrativeProductTier;
  narrativeMode: NarrativeMode;
  organisation: {
    name: string;
    /** Backward-compatible string projection derived only from operatingContext. */
    sectorFacts: string[];
    /** Canonical operating facts with graph/question/option provenance. */
    operatingContext: OperatingContextFact[];
  };
  /** Present only on the Comprehensive projection; Essential retains its prior surface. */
  questionSignals?: NarrativeQuestionSignal[];
  assessment: {
    reference: string;
    generatedAt: string;
    score: number | null;
    maturity: string | null;
    calculatedMaturity: string | null;
    exposureScore: number | null;
    exposureBand: string | null;
    coveragePct: number;
    uncertaintyRatePct: number;
    criticalGapCount: number;
    majorGapCount: number;
    uncertaintyFacts: string[];
  };
  domains: NarrativeDomainFact[];
  relativeStrengths: Array<{ factRef: string; title: string; basis: string; domainCode: string }>;
  systemicThemeInputs: NarrativeThemeFact[];
  standaloneFindingReasons: Record<string, string>;
  findings: NarrativeFindingFact[];
  sustainmentPriorities: NarrativeSustainmentPriorityFact[];
  risks: NarrativeRiskFact[];
  scenarios: NarrativeScenarioFact[];
  controls: NarrativeControlFact[];
  decisions: NarrativeDecisionFact[];
  roadmap: NarrativeRoadmapFact[];
  proofOfProgress: NarrativeProofFact[];
  maturationSteps: NarrativeMaturationStep[];
  highReadinessSparseNarrativeReason?: string;
  prohibitedClaims: string[];
  narrativeBounds: NarrativeBounds;
  facts: NarrativeFact[];
  /** Present only for the Comprehensive Sustainment projection. */
  assuranceCoverage?: NarrativeAssuranceCoverageFact[];
  assurancePriorities?: NarrativeAssurancePriorityFact[];
  resilienceTests?: NarrativeResilienceTestFact[];
  enterpriseIntegrationMap?: EnterpriseIntegrationMap;
  contextApplications?: NarrativeContextApplication[];
  exposurePathways?: NarrativeExposurePathwayFact[];
  criticalReliances?: NarrativeControlRelianceFact[];
  controlOutcomeLinks?: NarrativeControlOutcomeLink[];
  roadmapDependencyLinks?: NarrativeRoadmapDependencyLink[];
}

const text = (value: unknown, fallback = ''): string => String(value ?? '').trim() || fallback;
const list = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
function cleanFactLanguage(value: unknown, fallback = ''): string {
  return text(value, fallback)
    .replace(/\s*\([^)]*normalised score[^)]*\)\.?/gi, '')
    .replace(/This is self-reported and requires the listed operating evidence before it can be treated as verified\.?/gi, '')
    .replace(/This recorded weakness affects a methodology hard gate and must be remediated before relying on the aggregate maturity result\.?/gi, '')
    .replace(/Because the self-reported control position has not yet been independently validated with operating evidence,\s*/gi, 'Because the recorded control position may not operate consistently across the full population, ')
    .replace(/This does not assert a control defect\.\s*/gi, '')
    .replace(/not yet independently validated/gi, 'not yet demonstrated')
    .replace(/independently validated/gi, 'independently reviewed')
    .replace(/independent(?:ly)? review(?:ed|ing)?/gi, 'review')
    .replace(/The potential financial, operational, legal and reputational consequence is set out in the linked impact fields below, and applies only if independent validation identifies a defect\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSustainmentLanguage(value: unknown, fallback = ''): string {
  return cleanFactLanguage(value, fallback)
    .replace(/lapsed or degraded control register/gi, 'control currency and deterioration register')
    .replace(/review overdue, or a key control found lapsed with no remediation owner/gi, 'review overdue, or a key control has deteriorated without a named owner')
    .replace(/with lapses remediated by due date/gi, 'with deterioration addressed by due date')
    .replace(/\bremediation owner\b/gi, 'named owner')
    .replace(/\bremediated\b/gi, 'addressed')
    .replace(/\blapsed\b/gi, 'no longer current')
    .replace(/\bdegraded\b/gi, 'deteriorated')
    .replace(/unacceptable residual risk/gi, 'material residual-risk change')
    .replace(/control failure/gi, 'control deterioration')
    .replace(/\s+/g, ' ')
    .trim();
}

function naturalSustainmentTitle(value: unknown, fallback = 'Fraud-control readiness'): string {
  return cleanSustainmentLanguage(value, fallback)
    .replace(/^sustain\s+/i, '')
    .replace(/^maintain\s+/i, '')
    .trim();
}

function buildQuestionSignals(
  data: AssembledReportData | undefined,
  operatingContext: OperatingContextFact[],
  domains: NarrativeDomainFact[]
): NarrativeQuestionSignal[] {
  if (!data?.questionTraces?.length) return [];
  const labels = new Map(data.officialResponseLabels.map((label) => [label.responseValue, label]));
  const domainRefs = new Map(domains.map((domain) => [domain.code, domain.factRef]));
  const contextRefsByQuestion = new Map<string, string[]>();
  for (const context of operatingContext) {
    const refs = contextRefsByQuestion.get(context.sourceQuestionId) ?? [];
    refs.push(`OPERATING-CONTEXT-${context.key}`);
    contextRefsByQuestion.set(context.sourceQuestionId, refs);
  }
  return data.questionTraces.map((trace) => {
    const response = trace.responseValue === null ? undefined : labels.get(trace.responseValue);
    const contextRefs = [...new Set(contextRefsByQuestion.get(trace.questionCode) ?? [])];
    const sourceRefs = [...new Set([
      trace.questionCode,
      domainRefs.get(trace.domainCode) ?? `DOMAIN-${trace.domainCode}`,
      ...contextRefs
    ])];
    return {
      factRef: `QUESTION-SIGNAL-${trace.questionCode}`,
      questionCode: trace.questionCode,
      domainCode: trace.domainCode,
      domainName: trace.domainName,
      prompt: cleanFactLanguage(trace.prompt, trace.questionCode),
      responseValue: trace.responseValue,
      responseLabel: response?.label ?? (trace.responseValue === null ? 'Not applicable' : 'Recorded response'),
      responseOperationalMeaning: cleanFactLanguage(response?.operationalMeaning, trace.responseValue === null ? 'The question was excluded by the recorded assessment path.' : 'The response is retained in the locked score trace.'),
      normalisedScore: trace.normalisedScore,
      applicable: trace.applicable,
      triggeredRules: trace.triggeredRules.map((rule) => text(rule)).filter(Boolean),
      isCritical: trace.isCritical,
      isHardGate: trace.isHardGate,
      isCriticalGap: trace.isCriticalGap,
      isMajorGap: trace.isMajorGap,
      contextRefs,
      sourceRefs
    };
  });
}

function phaseFor(action: RoadmapAction): NarrativeRoadmapFact['phase'] {
  return action.period === '30 days' ? 'STABILISE' : 'ESTABLISH';
}

function roadmapWindowFor(action: RoadmapAction): string {
  return action.period === '30 days' ? '0-30 days' : '31-90 days';
}

interface ScenarioFamilyLanguage {
  actorClass: string;
  opportunity: string;
  entryPoint: string;
  mechanism: string;
}

const SCENARIO_FAMILY_LANGUAGE: Record<string, ScenarioFamilyLanguage> = {
  governance_accountability_failure: { actorClass: 'An insider using unclear accountability or weak independent challenge', opportunity: 'Fraud-risk ownership and independent challenge are not yet defined clearly enough to ensure that a material concern is acted on.', entryPoint: 'A material fraud concern reaches a process where accountability, escalation or independent challenge is unclear.', mechanism: 'An insider uses the gap between management ownership and independent challenge to delay treatment or keep a material concern outside the decision record.' },
  risk_blind_spot: { actorClass: 'An internal or external actor exploiting an unmapped or outdated fraud pathway', opportunity: 'The assessment indicates that fraud-risk identification or review is not yet sufficiently current, structured or connected to accountable treatment.', entryPoint: 'A material process or emerging fraud method is not covered by a current, owned fraud-risk assessment.', mechanism: 'An actor uses an unmapped pathway or emerging method before management has assigned a preventive, detective or response control to it.' },
  transaction_anomaly: { actorClass: 'An internal or external actor using an unusual transaction pattern', opportunity: 'Monitoring and exception review are not yet sufficiently deliberate or repeatable to challenge unusual activity promptly.', entryPoint: 'A transaction, adjustment or operational activity falls outside the expected pattern without a timely review route.', mechanism: 'An actor splits, disguises or times activity so that it remains below or outside the available monitoring and exception thresholds.' },
  privileged_access_exploitation: { actorClass: 'An internal or external actor using privileged or excessive digital access', opportunity: 'Sensitive access is not yet restricted and reviewed consistently enough to prevent or quickly challenge misuse.', entryPoint: 'A privileged, administrative or emergency-access account remains usable without independent periodic review.', mechanism: 'An actor uses privileged access to alter a record, entitlement or transaction and relies on weak recertification or monitoring to avoid timely challenge.' },
  account_takeover: { actorClass: 'An external actor using compromised account credentials or session access', opportunity: 'Identity misuse and account-takeover indicators are not yet detected or investigated consistently enough.', entryPoint: 'A credential reset, device change or session anomaly occurs on an account with transaction authority.', mechanism: 'An actor takes control of a legitimate account and uses its approved identity and transaction authority before unusual activity is challenged.' },
  identity_misuse: { actorClass: 'An internal or external actor using an impersonated or insufficiently verified identity', opportunity: 'Identity verification at material risk points is not yet applied consistently enough to prevent misuse.', entryPoint: 'A customer, employee, supplier or counterparty is activated or materially changed without an independent verification step.', mechanism: 'An actor presents an impersonated or manipulated identity to gain access, payment, credit, benefit or authority under another party’s name.' },
  supplier_onboarding_fraud: { actorClass: 'An external actor using a fictitious, conflicted or compromised supplier relationship', opportunity: 'Supplier onboarding and ownership verification do not yet provide reliable protection at the point a vendor becomes payable.', entryPoint: 'A new or reactivated supplier progresses to payment before independent registration, ownership and banking verification.', mechanism: 'An actor creates or impersonates a supplier relationship and uses the gap between registration and payment approval to redirect value.' },
  supplier_payment_redirection: { actorClass: 'An external actor using a compromised supplier communication channel', opportunity: 'Supplier bank-detail changes are not yet consistently verified through a trusted independent channel before payment.', entryPoint: 'A supplier or bank-detail amendment is submitted shortly before a scheduled payment.', mechanism: 'An actor submits a credible-looking bank-detail change and diverts a genuine payment before the change is independently challenged.' },
  evidence_compromise: { actorClass: 'An internal or external actor seeking to delay or weaken investigation', opportunity: 'Records relating to suspected fraud are not yet consistently preserved, access-controlled and handled through a clear custody process.', entryPoint: 'A suspected matter generates records before a retention, legal-hold or custody decision is made.', mechanism: 'An actor delays, alters or fragments relevant records so that the scope, timing or responsibility for the suspected matter becomes harder to establish.' },
  incident_response_breakdown: { actorClass: 'An internal or external actor benefiting from delayed incident escalation', opportunity: 'Incident intake, severity decisions and response ownership are not yet sufficiently clear to contain a suspected matter quickly.', entryPoint: 'A suspected-fraud report enters intake without a timely severity decision or named incident owner.', mechanism: 'An actor benefits while a suspected matter moves between teams without a clear containment, investigation or escalation decision.' },
  suppressed_reporting: { actorClass: 'An insider benefiting from a reporting channel that lacks independent protection', opportunity: 'Reporting channels and escalation routes are not yet sufficiently independent to protect concerns from influence or closure by an implicated manager.', entryPoint: 'A concern is raised through a channel visible to, controlled by or dependent on the person implicated in the concern.', mechanism: 'An insider discourages, filters or delays a concern before it reaches an independent decision-maker who can protect the reporter and initiate review.' },
  access_abuse: { actorClass: 'An internal actor using access beyond approved role requirements', opportunity: 'Access rights and exception review are not yet sufficiently aligned to current role requirements.', entryPoint: 'A user entitlement is exercised outside the approved role matrix without independent review.', mechanism: 'An actor uses excess access to initiate, change or approve a value-bearing activity beyond the role’s intended authority.' },
  payroll_master_file_manipulation: { actorClass: 'An insider manipulating payroll data or payment preparation', opportunity: 'Payroll master-file changes and unusual records are not yet independently reviewed before payment.', entryPoint: 'A bank, pay-rate, joiner or leaver change, duplicate or unusual payroll record enters a payment run.', mechanism: 'An actor alters a payroll record or introduces a duplicate or ghost record and relies on weak pre-payment reconciliation to release value.' },
  cash_custody_shortage_or_overage: { actorClass: 'An insider using weak physical-cash custody or reconciliation', opportunity: 'Cash counts, banking and difference investigation are not yet consistently attributable and timely.', entryPoint: 'A cash count, banking or reconciliation difference arises at a cash point or site.', mechanism: 'An actor diverts or withholds cash and relies on ordinary variance, delayed banking or incomplete reconciliation to avoid challenge.' },
  stock_asset_shrinkage_or_adjustment: { actorClass: 'An insider using weak stock or physical-asset custody', opportunity: 'Physical-asset movement, counting, reconciliation and write-off review are not yet consistently controlled.', entryPoint: 'A stock movement, count difference, disposal or write-off occurs without complete custody evidence.', mechanism: 'An actor removes or redirects physical value and relies on incomplete movement records, delayed counts or unsupported adjustments to conceal the loss.' },
  // Written at the level every eligible member establishes: a third-party relationship, or a
  // decision that selects, retains or rewards one, escaping timely independent challenge. It
  // deliberately asserts no bid rigging, conflict of interest, onboarding failure or bank-detail
  // change, because no single eligible finding establishes those. Member-specific conditions
  // reach the customer only through member-derived fields.
  third_party_collusion: { actorClass: 'A third party acting for or with the organisation, alone or with an insider able to influence the relationship', opportunity: 'Third-party relationships, and the decisions that select, retain or reward them, are not yet subject to sufficiently independent and current review.', entryPoint: 'A third-party relationship, or a decision affecting one, proceeds without timely independent challenge.', mechanism: 'An actor uses influence over a third-party relationship, or authority delegated through it, to move value or obtain advantage while the arrangement continues to appear routine.' },
  external_fraud_monitoring_gap: { actorClass: 'An external actor using a customer, supplier, partner or provider-operated channel', opportunity: 'External-party threat coverage and provider reporting are not yet connected to timely organisational review.', entryPoint: 'A relevant external channel produces a fraud signal or provider exception.', mechanism: 'An actor uses a channel or service boundary where the organisation’s own monitoring and provider reporting are not joined or escalated promptly.' }
};

/**
 * Operating-model framing for a pathway, used only when the assessment establishes it.
 *
 * Each variant names the exposure it requires. Where no required exposure is supported,
 * the pathway keeps its neutral language, which is why every field here is optional and
 * additive: specificity is an improvement on the default, never a replacement for
 * evidence. The wording stays inside what the gateways actually capture -- cash, stock,
 * customer digital activity, refunds, sites, workforce, outsourcing -- and deliberately
 * avoids concepts the assessment never asks about.
 */
interface ScenarioContextVariant {
  requires: OperatingExposureId;
  entryPoint?: string;
  mechanism?: string;
  actorClass?: string;
}

/** Ordered most specific first: the first supported variant wins. */
const SCENARIO_CONTEXT_VARIANTS: Partial<Record<string, ScenarioContextVariant[]>> = {
  DETECTION_EVASION: [
    { requires: 'SIGNIFICANT_CASH_HANDLING',
      entryPoint: 'Cash takings, banking or reconciliation activity across the operation falls outside the expected pattern without a timely review route.',
      mechanism: 'An actor times or splits cash handling and banking activity so that shortfalls stay inside normal variance and outside the available reconciliation and exception review.' },
    { requires: 'REFUNDS_AND_ADJUSTMENTS',
      entryPoint: 'A refund, credit note or manual adjustment falls outside the expected pattern without a timely review route.',
      mechanism: 'An actor keeps refunds, credits or adjustments individually small and routine so they remain below or outside the available monitoring and exception thresholds.' },
    { requires: 'DISTRIBUTED_OPERATIONS',
      entryPoint: 'Activity at one site or operating location falls outside the expected pattern without a timely central review route.',
      mechanism: 'An actor relies on activity being reviewed locally rather than compared across sites, so an unusual pattern at one location is never challenged centrally.' }
  ],
  PRIVILEGED_ACCESS_MISUSE: [
    { requires: 'DIGITAL_CUSTOMER_ACTIVITY',
      entryPoint: 'A privileged or administrative account with authority over customer accounts, payments or order records remains usable without independent periodic review.',
      mechanism: 'An actor uses privileged access to alter a customer account, payment instruction or transaction record and relies on weak recertification to avoid timely challenge.' },
    { requires: 'DISTRIBUTED_OPERATIONS',
      entryPoint: 'A privileged or administrative account used across multiple operating locations remains usable without independent periodic review.',
      mechanism: 'An actor uses access granted for one location to alter records or entitlements affecting others, where no single owner reviews entitlements across the whole operation.' }
  ],
  SUPPLIER_PAYMENT_DIVERSION: [
    { requires: 'OUTSOURCED_SUPPLIER_MANAGEMENT',
      entryPoint: 'A supplier or bank-detail amendment is processed by the external provider shortly before a scheduled payment.',
      mechanism: 'An actor submits a credible-looking bank-detail change into an outsourced process the organisation does not itself verify, and value is released before the change is independently challenged.' },
    { requires: 'INTERNAL_SUPPLIER_MANAGEMENT',
      entryPoint: 'A supplier or bank-detail amendment is submitted internally shortly before a scheduled payment.',
      mechanism: 'An actor submits a credible-looking bank-detail change and relies on the same team both accepting and approving it to divert a genuine payment.' }
  ],
  INCIDENT_CONCEALMENT: [
    { requires: 'DISTRIBUTED_OPERATIONS',
      entryPoint: 'A suspected matter arises at one operating location and generates records there before a retention, legal-hold or custody decision is made centrally.',
      mechanism: 'An actor relies on records staying with the location where the matter arose, so the scope and timing become harder to establish once the matter is escalated.' }
  ],
  IDENTITY_IMPERSONATION: [
    { requires: 'DIGITAL_CUSTOMER_ACTIVITY',
      entryPoint: 'A customer account, payment instruction or profile is created or materially changed through a digital channel without an independent verification step.',
      mechanism: 'An actor uses an impersonated or insufficiently verified identity to obtain payment, credit or account authority through the organisation\'s digital channel.' },
    { requires: 'TEMPORARY_OR_SUBCONTRACTED_WORKFORCE',
      entryPoint: 'A worker, contractor or engaged party is onboarded or materially changed without an independent verification step.',
      mechanism: 'An actor relies on the engagement of a temporary, seasonal or subcontracted worker to establish an identity that carries access or payment entitlement without independent verification.' }
  ]
};

interface FraudPathwayRule {
  family: FraudPathwayFamily;
  title: string;
  whyTogether: string;
  anchorFamilies: PrimarySemanticFamily[];
  language: ScenarioFamilyLanguage;
}

interface ThemeRule {
  themeFamily: string;
  title: string;
  managementQuestion: string;
  anchorFamilies: PrimarySemanticFamily[];
  whyTogether: string;
}

const THEME_RULES: ThemeRule[] = [
  { themeFamily: 'FRAUD_GOVERNANCE_AND_RISK_DISCIPLINE', title: 'Fraud governance and risk-management discipline', managementQuestion: 'How will management keep fraud risk owned, current, reported and treated through a repeatable governance rhythm?', anchorFamilies: ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT'], whyTogether: 'These findings describe the ownership, risk-identification and review disciplines that keep fraud exposure visible and treatment current.' },
  { themeFamily: 'SUPPLIER_PAYMENT_INTEGRITY', title: 'Supplier and payment integrity', managementQuestion: 'How will management prevent supplier identity or payment-instruction compromise before value is released?', anchorFamilies: ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'THIRD_PARTY_OVERSIGHT'], whyTogether: 'These findings connect supplier identity, onboarding and payment-instruction controls to the point at which value can be redirected.' },
  { themeFamily: 'IDENTITY_ACCESS_GOVERNANCE', title: 'Identity and access governance', managementQuestion: 'How will management restrict, recertify and challenge access that can alter value-bearing records?', anchorFamilies: ['ORDINARY_ACCESS', 'PRIVILEGED_ACCESS'], whyTogether: 'These findings connect access entitlement, privilege and recertification to the ability to alter value-bearing records, entitlements or audit trails.' },
  { themeFamily: 'IDENTITY_VERIFICATION_SENSITIVE_CHANGE', title: 'Identity verification and sensitive change', managementQuestion: 'How will management verify identity and challenge sensitive changes before authority is misused?', anchorFamilies: ['IDENTITY_VERIFICATION'], whyTogether: 'These findings connect identity verification and sensitive-change evidence to the risk of misuse under a legitimate identity.' },
  { themeFamily: 'DETECTION_MONITORING', title: 'Monitoring, escalation and detection coverage', managementQuestion: 'How will management ensure unusual activity is monitored, assigned, investigated and escalated on time?', anchorFamilies: ['DETECTION_MONITORING'], whyTogether: 'These findings connect monitoring coverage, exception review and escalation authority to the risk that unusual activity remains below timely challenge.' },
  { themeFamily: 'OPERATIONAL_VALUE_CUSTODY', title: 'Payroll, cash and physical-asset integrity', managementQuestion: 'How will management keep operational value reconciled before payroll, cash or asset differences become loss?', anchorFamilies: ['PAYROLL_INTEGRITY', 'CASH_CUSTODY', 'STOCK_ASSET_CUSTODY'], whyTogether: 'These findings connect payroll changes, physical cash and stock or asset custody to independent review, reconciliation and timely exception action.' },
  { themeFamily: 'INCIDENT_RESPONSE_EVIDENCE_INTEGRITY', title: 'Incident response and evidence integrity', managementQuestion: 'How will management contain suspected fraud, preserve evidence and prevent repeat exposure?', anchorFamilies: ['INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING'], whyTogether: 'These findings connect reporting, incident response and evidence preservation to the organisation’s ability to contain a matter and prevent repeat exposure.' }
];

const FRAUD_PATHWAY_RULES: FraudPathwayRule[] = [
  {
    family: 'SUPPLIER_PAYMENT_DIVERSION',
    title: 'Supplier and payment integrity',
    whyTogether: 'These findings connect supplier identity, onboarding and payment-instruction controls to the point at which value can be redirected.',
    anchorFamilies: ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'THIRD_PARTY_OVERSIGHT'],
    language: SCENARIO_FAMILY_LANGUAGE.supplier_payment_redirection
  },
  {
    family: 'THIRD_PARTY_COLLUSION',
    title: 'Third-party relationship integrity',
    whyTogether: 'These findings connect third-party risk assessment, sourcing decisions, conflict disclosure, ongoing relationship review and oversight of delegated authority to the point at which a third-party arrangement can move value without timely challenge.',
    // Descriptive grouping only. Membership is decided solely by the explicit per-question
    // fraudPathwayFamilies mapping, never by these families.
    anchorFamilies: ['THIRD_PARTY_OVERSIGHT', 'FRAUD_RISK_IDENTIFICATION'],
    language: SCENARIO_FAMILY_LANGUAGE.third_party_collusion
  },
  {
    family: 'PRIVILEGED_ACCESS_MISUSE',
    title: 'Identity and access governance',
    whyTogether: 'These findings connect excessive or insufficiently reviewed access to the ability to alter value-bearing records, entitlements or audit trails.',
    anchorFamilies: ['PRIVILEGED_ACCESS', 'ORDINARY_ACCESS'],
    language: SCENARIO_FAMILY_LANGUAGE.privileged_access_exploitation
  },
  {
    family: 'DETECTION_EVASION',
    title: 'Monitoring, escalation and detection coverage',
    whyTogether: 'These findings connect monitoring coverage, exception review and escalation authority to the risk that unusual activity remains below timely challenge.',
    anchorFamilies: ['DETECTION_MONITORING'],
    language: SCENARIO_FAMILY_LANGUAGE.transaction_anomaly
  },
  {
    family: 'IDENTITY_IMPERSONATION',
    title: 'Identity verification and sensitive-change discipline',
    whyTogether: 'These findings connect identity verification, authentication evidence and profile-change monitoring to the risk of misuse under a legitimate identity.',
    anchorFamilies: ['IDENTITY_VERIFICATION'],
    language: SCENARIO_FAMILY_LANGUAGE.identity_misuse
  },
  {
    family: 'INCIDENT_CONCEALMENT',
    title: 'Incident response and evidence integrity',
    whyTogether: 'These findings connect reporting, evidence preservation and incident escalation to the organisation’s ability to contain a matter and prevent repeat exposure.',
    anchorFamilies: ['INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING'],
    language: SCENARIO_FAMILY_LANGUAGE.evidence_compromise
  },
  {
    family: 'PAYROLL_MANIPULATION',
    title: 'Payroll integrity',
    whyTogether: 'These findings connect payroll master-file change, pre-payment review and unusual-record controls to the point at which payroll value can be diverted.',
    anchorFamilies: ['PAYROLL_INTEGRITY'],
    language: SCENARIO_FAMILY_LANGUAGE.payroll_master_file_manipulation
  },
  {
    family: 'CASH_CUSTODY_MISUSE',
    title: 'Cash custody and reconciliation',
    whyTogether: 'These findings connect cash custody, counting, banking and reconciliation to the point at which shortages or diversion should be identified.',
    anchorFamilies: ['CASH_CUSTODY'],
    language: SCENARIO_FAMILY_LANGUAGE.cash_custody_shortage_or_overage
  },
  {
    family: 'STOCK_ASSET_MISUSE',
    title: 'Stock and physical-asset custody',
    whyTogether: 'These findings connect physical-asset custody, movement, counting, reconciliation and write-off review to the point at which shrinkage should be challenged.',
    anchorFamilies: ['STOCK_ASSET_CUSTODY'],
    language: SCENARIO_FAMILY_LANGUAGE.stock_asset_shrinkage_or_adjustment
  }
];

function pathwayMembers(rule: FraudPathwayRule, findings: MaterialFinding[]): MaterialFinding[] {
  return findings.filter((finding) => finding.fraudPathwayFamilies.includes(rule.family));
}

function pathwayPriority(rule: FraudPathwayRule, findings: MaterialFinding[]): number {
  return pathwayMembers(rule, findings).reduce((total, finding) => total + finding.materialityScore, 0);
}

function ruleForScenario(scenario: PlausibleScenario, findings: MaterialFinding[]): FraudPathwayRule | null {
  const linked = findings.filter((finding) => scenario.linkedFindingIds.includes(finding.id));
  return FRAUD_PATHWAY_RULES.find((rule) => linked.some((finding) => finding.fraudPathwayFamilies.includes(rule.family))) ?? null;
}

function assertScenario(scenario: NarrativeScenarioFact): void {
  if (!scenario.actorClass || /^(D\d+|Reactive|Developing|Structured|Strategic)$/i.test(scenario.actorClass)) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} has no valid actor class.`);
  if (!scenario.entryPoint || /D\d+-Q\d+|recorded control condition|assessment question/i.test(scenario.entryPoint)) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} has an invalid entry point.`);
  if (/actor exploits the recorded control condition|threat actor exploits the recorded control condition/i.test(`${scenario.mechanism} ${scenario.opportunity}`)) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} has generic mechanism language.`);
  if (/impact requires case-specific validation|requires case-specific validation|normalised score|aggregate maturity|methodology hard gate|requires evidence before verified/i.test(Object.values(scenario).flatMap((value) => Array.isArray(value) ? value : [value]).join(' '))) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} contains placeholder or methodology language.`);
  if (/governance|risk identification|risk assessment|controls decay quietly|control environment review/i.test(scenario.title) && !/supplier|payment|access|identity|account|transaction|monitor|evidence|incident|report|diversion|impersonat/i.test(scenario.title)) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} is not a concrete fraud pathway.`);
  for (const [key, value] of Object.entries(scenario)) {
    if (['factRef', 'sourceId', 'title', 'linkedFindingRefs', 'linkedRiskRefs', 'warningIndicators'].includes(key)) continue;
    if (typeof value === 'string' && !value.trim()) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} is missing ${key}.`);
  }
  if (scenario.warningIndicators.length === 0) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} has no warning indicators.`);
}

function makeFact(id: string, kind: string, value: unknown, sourceRefs: string[] = []): NarrativeFact {
  return { id, kind, value, sourceRefs: unique(sourceRefs) };
}

function buildDomains(data: AssembledReportData | undefined, findings: NarrativeFindingFact[]): NarrativeDomainFact[] {
  const sourceDomains = data?.domainResults ?? [];
  if (sourceDomains.length > 0) {
    return sourceDomains.map((domain) => ({
      factRef: `DOMAIN-${domain.domainCode}`,
      code: domain.domainCode,
      name: domain.domainName,
      score: domain.rawScore,
      maturity: null,
      weightPct: domain.weightPct,
      coveragePct: domain.coveragePct,
      criticalGapCount: domain.criticalGapCount
    }));
  }
  const byCode = new Map<string, NarrativeFindingFact[]>();
  findings.forEach((finding) => byCode.set(finding.questionCode.slice(0, 2), [...(byCode.get(finding.questionCode.slice(0, 2)) ?? []), finding]));
  return [...byCode.entries()].map(([code, entries]) => ({
    factRef: `DOMAIN-${code}`,
    code,
    name: entries[0].domain,
    score: null,
    maturity: null,
    weightPct: null,
    coveragePct: null,
    criticalGapCount: entries.filter((entry) => /critical/i.test(entry.materiality)).length
  }));
}

function buildFindingFacts(findings: MaterialFinding[]): NarrativeFindingFact[] {
  const materialityLabels: Record<string, string> = {
    control_failure: 'material control weakness',
    control_gap: 'material control gap',
    maturity_constraint: 'maturity-limiting condition',
    exposure_mismatch: 'exposure and control mismatch',
    cross_domain_dependency: 'cross-domain dependency',
    assurance_priority: 'assurance priority'
  };
  return findings.map((finding, index) => ({
    factRef: `FINDING-${String(index + 1).padStart(3, '0')}`,
    sourceId: finding.id,
    title: text(finding.title, finding.domainName),
    domain: finding.domainName,
    questionCode: finding.questionCode,
    primarySemanticFamily: finding.primarySemanticFamily,
    secondarySemanticFamilies: finding.secondarySemanticFamilies,
    fraudPathwayFamilies: finding.fraudPathwayFamilies,
    recordedPosition: cleanFactLanguage(finding.responseOperationalMeaning, finding.responseLabel),
    deterministicCondition: `${text(finding.responseLabel, 'Recorded response')}: ${cleanFactLanguage(finding.responseOperationalMeaning, finding.responseMeaning)}`,
    interpretation: cleanFactLanguage(finding.diagnosis, finding.fraudMechanism),
    advisoryMeaningBasis: `The assessed ${materialityLabels[finding.materialityClass] ?? 'priority condition'} concerns ${text(finding.questionPrompt, finding.title).replace(/\.$/, '')} and connects to the linked fraud pathway and control response.`,
    whyItMatters: `The condition matters because ${cleanFactLanguage(finding.fraudMechanism, finding.whyItMatters).replace(/^[A-Z]/, (letter) => letter.toLowerCase())}`,
    materialityReason: `${text(finding.materialityClass)} selected at deterministic priority ${finding.materialityScore}.`,
    assuranceBoundary: 'This is a interpretation of the assessment responses; it does not establish operating effectiveness.',
    materiality: text(finding.materialityClass),
    priorityScore: finding.materialityScore,
    owner: text(finding.accountableOwner),
    processOwner: text(finding.processOwner),
    targetPeriod: text(finding.targetPeriod),
    approvedControlResponse: text(finding.recommendedControl),
    effectivenessMeasure: text(finding.effectivenessMeasure),
    sourceRefs: [finding.id, finding.questionCode]
  }));
}

function buildRiskFacts(risks: RiskRegisterEntry[], findings: MaterialFinding[], findingRefs: Map<string, string>): NarrativeRiskFact[] {
  const boundedCauseFor = (risk: RiskRegisterEntry): string => {
    const linked = findings.filter((finding) => risk.linkedFindingIds.includes(finding.id));
    const families = new Set(linked.map((finding) => finding.primarySemanticFamily));
    if (families.has('SUPPLIER_ONBOARDING') || families.has('SUPPLIER_PAYMENT_CHANGE') || families.has('THIRD_PARTY_OVERSIGHT')) return 'Supplier onboarding, ownership, banking or payment-change verification is not yet consistently designed and evidenced.';
    if (families.has('PRIVILEGED_ACCESS') || families.has('ORDINARY_ACCESS')) return 'Privileged and sensitive access is not yet consistently restricted, logged and independently recertified.';
    if (families.has('IDENTITY_VERIFICATION')) return 'Identity verification and sensitive-change controls are not yet consistently designed and evidenced.';
    if (families.has('DETECTION_MONITORING')) return 'Monitoring coverage and exception review are not yet consistently designed and evidenced.';
    if (families.has('INCIDENT_RESPONSE') || families.has('EVIDENCE_INTEGRITY') || families.has('WHISTLEBLOWING')) return 'Incident escalation and evidence handling are not yet consistently designed and evidenced.';
    if (families.has('FRAUD_GOVERNANCE') || families.has('FRAUD_RISK_IDENTIFICATION') || families.has('CONTINUOUS_IMPROVEMENT')) return 'Fraud-risk ownership, review and treatment are not yet consistently designed and evidenced.';
    return 'The relevant control condition is not yet consistently designed or evidenced.';
  };
  const consequenceFor = (risk: RiskRegisterEntry): string => {
    const linked = findings.filter((finding) => risk.linkedFindingIds.includes(finding.id));
    const pathways = new Set(linked.flatMap((finding) => finding.fraudPathwayFamilies));
    if (pathways.has('SUPPLIER_PAYMENT_DIVERSION')) return 'Losses or payment errors may continue before management identifies and contains the activity.';
    if (pathways.has('PRIVILEGED_ACCESS_MISUSE')) return 'Unauthorised changes may be made or concealed before access misuse is identified and contained.';
    if (pathways.has('IDENTITY_IMPERSONATION')) return 'Unauthorised access, payment or sensitive change may occur before the identity or activity is challenged.';
    if (pathways.has('INCIDENT_CONCEALMENT')) return 'A suspected matter may be harder to contain, investigate and recover when records or escalation are incomplete.';
    if (pathways.has('DETECTION_EVASION')) return 'Losses or exceptions may continue before management identifies and contains the activity.';
    return 'The risk may remain unmanaged until management identifies the condition and completes the approved treatment.';
  };
  const cleanRisk = (value: string, fallback: string): string => cleanFactLanguage(value, fallback)
    .replace(/Impact requires case-specific validation\.?/gi, '')
    .replace(/Operating impact requires case-specific validation\.?/gi, '')
    .replace(/independent operating evidence has not yet validated/gi, 'the recorded control position has not yet demonstrated')
    .replace(/independently validate the reported control\(s\) across the complete population, required frequency and under pressure before relying on the self-assessment\.?/gi, 'complete the approved treatment and retain the named operating records across the complete population and required frequency')
    .replace(/independently validate/gi, 'review')
    .replace(/does not meet the exact expected standard/gi, 'is not yet consistently designed to the expected control standard')
    .replace(/Consequence pathway:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return risks.map((risk, index) => ({
    factRef: `RISK-${String(index + 1).padStart(3, '0')}`,
    sourceId: risk.id,
    title: cleanRisk(risk.title.replace(/control resilience validation/gi, 'control resilience risk'), 'Recorded risk condition'),
    statement: cleanRisk(risk.riskStatement, `${text(risk.cause)} ${text(risk.riskEvent)}`),
    cause: /assessed control design or operation|exact expected standard/i.test(risk.cause) ? boundedCauseFor(risk) : cleanRisk(risk.cause, boundedCauseFor(risk)),
    riskEvent: cleanRisk(risk.riskEvent, 'The associated fraud or control event may occur before timely challenge.'),
    priority: text(risk.priority),
    likelihood: text(risk.likelihood),
    impact: text(risk.impact),
    qualitativeConsequence: consequenceFor(risk),
    linkedFindingRefs: risk.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    approvedTreatment: cleanRisk(text(risk.requiredTreatment), 'Complete the approved treatment and retain the named operating records.'),
    owner: text(risk.accountableExecutive),
    targetPeriod: text(risk.targetPeriod)
  }));
}

function qualitativeConsequence(family: FraudPathwayFamily, findings: MaterialFinding[]): string {
  const financial = unique(findings.map((finding) => finding.likelyFinancialImpact).filter((value) => value && !/requires case-specific validation/i.test(value)));
  const operational = unique(findings.map((finding) => finding.likelyOperationalImpact).filter((value) => value && !/requires case-specific validation/i.test(value)));
  const base: Record<string, string> = {
    supplier_payment_diversion: 'A diverted payment or fictitious supplier relationship can create financial loss and delayed recovery.',
    privileged_access_misuse: 'Unauthorised changes to a value-bearing record, entitlement or audit trail can create loss and weaken investigation.',
    detection_evasion: 'Delayed detection allows suspicious activity or losses to continue and exceptions to accumulate.',
    identity_impersonation: 'Unauthorised access, payment, benefit or profile change can occur before the identity or transaction is challenged.',
    incident_concealment: 'Weak reporting, containment or evidence integrity can delay recovery and allow repeat exposure to remain unidentified.',
    payroll_manipulation: 'Unauthorised payroll changes or unusual records can divert value before payment release.',
    cash_custody_misuse: 'Unresolved cash differences can conceal shortage or diversion across sites or cash points.',
    stock_asset_misuse: 'Unreconciled movement, shrinkage or write-off can conceal loss of stock or physical assets.',
    third_party_collusion: 'Value or advantage can move through a third-party relationship before the arrangement is independently challenged.'
  };
  // likelyFinancialImpact and likelyOperationalImpact are DOMAIN-level strings, not
  // question-level. For THIRD_PARTY_COLLUSION the D7 domain impact names false suppliers,
  // invoices and bank changes, which no single eligible finding establishes on its own, so this
  // family states only the consequence its own pathway supports. Member-specific content
  // reaches the customer through the member-derived weakness, indicators and control response.
  if (family === 'THIRD_PARTY_COLLUSION') return base[family.toLowerCase()]!;
  return unique([base[family.toLowerCase()], ...financial.slice(0, 1), ...operational.slice(0, 1)]).join(' ');
}

/**
 * Member-aware warning indicators. Each entry restates only what that question's own
 * authoritative playbook escalation threshold and fraud mechanism already establish, so a
 * scenario built from one finding never carries another finding's failure mode.
 */
const THIRD_PARTY_COLLUSION_INDICATORS_BY_QUESTION: Record<string, string[]> = {
  'D2-Q05': ['A high-risk third-party relationship operates without a recorded fraud assessment', 'Delegated authority is granted outside an assessed risk tier'],
  'D7-Q02': ['Award criteria are set or changed after bid opening', 'An unjustified single-source award', 'Repeat awards to one supplier without competitive evidence'],
  'D7-Q03': ['An employee and supplier interest match is not investigated', 'A declared conflict has no recorded management action'],
  'D7-Q05': ['A high-risk third party is overdue for periodic review', 'An ownership change is detected without reassessment', 'Pricing drifts away from the agreed basis without challenge'],
  'D7-Q06': ['A procurement or vendor-master review is overdue', 'Exceptions concentrate with one individual without investigation'],
  'D7-Q07': ['An intermediary operates without contractual fraud obligations', 'Undisclosed sub-contracting by an intermediary', 'Delegated collections remain unreconciled']
};

/** Indicators contributed by the actual linked members only; empty for every other family. */
function memberAwareWarnings(family: FraudPathwayFamily, members: MaterialFinding[]): string[] {
  if (family !== 'THIRD_PARTY_COLLUSION') return [];
  return unique(members.flatMap((finding) => THIRD_PARTY_COLLUSION_INDICATORS_BY_QUESTION[finding.questionCode] ?? []));
}

function fallbackWarnings(family: FraudPathwayFamily): string[] {
  return ({
    supplier_payment_diversion: ['New or reactivated supplier before independent verification', 'Bank-detail change shortly before payment', 'Urgent payment request that bypasses the normal callback route'],
    privileged_access_misuse: ['Emergency or administrator access outside the role pattern', 'Unusual record or entitlement change', 'Access review exception remains overdue'],
    detection_evasion: ['Repeated low-value or threshold-adjacent activity', 'Alert or exception backlog grows without assigned owner', 'Monitoring rule is not updated after a material process change'],
    identity_impersonation: ['Credential reset, device change or profile amendment', 'Identity data differs across trusted records', 'Sensitive transaction follows a new or unusual session'],
    incident_concealment: ['Concern is reported through a channel controlled by the implicated process', 'Relevant records are unavailable or custody is unclear', 'Severity or containment decision remains overdue'],
    payroll_manipulation: ['Payroll master-file change is not independently reviewed before release', 'Unusual payroll record remains unresolved', 'Employee or bank-detail change is made outside the expected role pattern'],
    cash_custody_misuse: ['Cash difference remains unreconciled beyond the defined review window', 'Count or banking record is incomplete', 'Cash movement or custody transfer lacks attributable approval'],
    stock_asset_misuse: ['Stock or asset movement is not reconciled to the authorised record', 'Shrinkage or write-off exception remains unresolved', 'Physical count or custody transfer is overdue'],
    third_party_collusion: ['A third-party relationship or the decision affecting it proceeds without independent challenge']
  } as Record<string, string[]>)[family.toLowerCase()] ?? [];
}

function synthesizeScenario(rule: FraudPathwayRule, source: PlausibleScenario | undefined, members: MaterialFinding[], findingRefs: Map<string, string>, riskRefs: Map<string, string>, risks: RiskRegisterEntry[], index: number, exposures: readonly SupportedExposure[] = []): NarrativeScenarioFact {
  // First variant whose required exposure the assessment establishes; otherwise neutral.
  const contextVariant = (SCENARIO_CONTEXT_VARIANTS[rule.family] ?? []).find((variant) => hasExposure(exposures, variant.requires));
  const contextEvidence: OperatingExposureId | null = contextVariant?.requires ?? null;
  const linkedFindingIds = members.map((finding) => finding.id);
  const linkedRisks = risks.filter((risk) => risk.linkedFindingIds.some((id) => linkedFindingIds.includes(id)));
  const title: Record<string, string> = {
    supplier_payment_diversion: 'Supplier or payment instruction is diverted through a compromised or fictitious relationship',
    privileged_access_misuse: 'Privileged access is used to alter a value-bearing record, entitlement or audit trail',
    detection_evasion: 'Unusual activity avoids timely challenge because monitoring or escalation coverage is incomplete',
    identity_impersonation: 'A compromised or impersonated identity is used to change a sensitive profile, instruction or transaction',
    incident_concealment: 'Records or reporting are weakened after a suspected fraud matter, allowing exposure to repeat',
    payroll_manipulation: 'Payroll master-file manipulation reaches payment release',
    cash_custody_misuse: 'Cash custody difference remains unresolved',
    stock_asset_misuse: 'Stock or physical-asset movement is not reconciled',
    third_party_collusion: 'Third-party relationship manipulation or collusion escapes timely challenge'
  };
  const fallbackContainment: Record<string, string> = {
    supplier_payment_diversion: 'Pause the affected supplier or payment instruction, independently confirm the trusted beneficiary details and preserve the approval trail.',
    privileged_access_misuse: 'Suspend or restrict the affected entitlement, preserve access and audit logs, and route the change for accountable review.',
    detection_evasion: 'Assign and triage the affected alerts or exceptions, preserve the relevant activity record and escalate overdue items.',
    identity_impersonation: 'Pause the sensitive change or transaction, re-perform identity verification through a trusted route and preserve authentication records.',
    incident_concealment: 'Open an incident record, preserve relevant records under controlled custody and assign a named containment and investigation owner.',
    payroll_manipulation: 'Hold the affected payroll run or payment instruction, independently verify the master-file change, preserve the change trail and escalate the exception to Finance and People leadership.',
    cash_custody_misuse: 'Secure the cash point, perform an independent recount and banking reconciliation, preserve custody records and escalate the difference under the defined threshold.',
    stock_asset_misuse: 'Secure the affected stock or asset population, pause unsupported movement or disposal, perform an independent count and preserve the movement and write-off trail.',
    third_party_collusion: 'Pause further commitment, payment or delegated authority on the affected third-party relationship, independently confirm its current ownership, control and pricing basis, and preserve the selection and approval trail.'
  };
  const fallbackLongTerm: Record<string, string> = {
    supplier_payment_diversion: 'Implement independent supplier and bank-detail verification, dual approval and complete population monitoring.',
    privileged_access_misuse: 'Implement role-based access, privileged-session logging, periodic recertification and exception escalation.',
    detection_evasion: 'Define monitoring coverage, red flags, review ownership, closure evidence and threshold-change governance.',
    identity_impersonation: 'Implement risk-based identity verification, profile-change controls, authentication evidence and takeover investigation.',
    incident_concealment: 'Implement protected reporting, severity-based escalation, evidence preservation and repeat-exposure review.',
    payroll_manipulation: 'Implement complete payroll-population reconciliation, independent pre-payment change review, anomaly testing and tracked exception closure.',
    cash_custody_misuse: 'Implement defined cash custodians, attributable counts, sealed transfers, banking reconciliation and difference escalation.',
    stock_asset_misuse: 'Implement complete stock and asset registers, authorised movement, periodic counts, reconciliation and independent write-off review.',
    third_party_collusion: 'Implement risk-tiered third-party assessment, periodic re-review of high-risk relationships and independent oversight of the decisions that select, retain or reward a third party.'
  };
  const sourceWarnings = source?.earlyWarningIndicators.filter(Boolean) ?? [];
  const usableSourceResponse = (value: string | undefined, fallback: string): string => {
    const candidate = text(value);
    return candidate && !/case-specific validation|escalate .*threshold|apply the control's escalation threshold|independently validate/i.test(candidate) ? candidate : fallback;
  };
  // THIRD_PARTY_COLLUSION deliberately has no entry here. Its members establish different
  // third-party failure modes, so the current weakness is derived below from the linked
  // findings themselves rather than asserting every failure mode for every instance.
  const currentWeaknessByFamily: Record<string, string> = {
    supplier_payment_diversion: 'Supplier onboarding and supplier payment-instruction changes are not consistently verified before activation or payment.',
    privileged_access_misuse: 'Privileged access is not consistently restricted, logged and independently recertified.',
    identity_impersonation: 'Identity verification and sensitive-change monitoring are partially designed.',
    detection_evasion: 'Monitoring and exception review are at an initial or ad hoc stage.',
    incident_concealment: 'Evidence preservation, reporting and custody are at an initial or ad hoc stage.',
    payroll_manipulation: 'Payroll master-file change review and unusual-record challenge are at an initial or ad hoc stage.',
    cash_custody_misuse: 'Cash custody, counting and reconciliation are at an initial or ad hoc stage.',
    stock_asset_misuse: 'Stock and physical-asset custody, movement and reconciliation are at an initial or ad hoc stage.'
  };
  const currentWeakness = currentWeaknessByFamily[rule.family.toLowerCase()] ?? unique(members.map((finding) => `${text(finding.questionPrompt, finding.title).replace(/\.$/, '')} is recorded as ${text(finding.responseLabel, 'not consistently in place').toLowerCase()}.`)).join(' ');
  const canonicalScenarioId = source?.id ?? `SC-${rule.family.toUpperCase()}`;
  return {
    factRef: `SCENARIO-${String(index + 1).padStart(3, '0')}`,
    sourceId: source?.id ?? `SYNTH-${rule.family.toUpperCase()}`,
    canonicalScenarioId,
    scenarioFamily: rule.family,
    title: title[rule.family.toLowerCase()],
    actorClass: contextVariant?.actorClass ?? rule.language.actorClass,
    opportunity: rule.language.opportunity,
    entryPoint: contextVariant?.entryPoint ?? rule.language.entryPoint,
    mechanism: contextVariant?.mechanism ?? rule.language.mechanism,
    contextualExposure: contextEvidence,
    currentControlWeakness: currentWeakness,
    requiredControlResponse: unique(members.map((finding) => finding.recommendedControl)).join('; '),
    concealment: text(source?.concealmentMechanism, rule.family === 'INCIDENT_CONCEALMENT' ? 'A delayed report, incomplete record or unclear custody trail makes the matter harder to reconstruct and contain.' : 'An actor relies on ordinary-looking activity, weak exception review or incomplete audit records to avoid timely challenge.'),
    consequence: qualitativeConsequence(rule.family, members),
    warningIndicators: unique([...sourceWarnings, ...memberAwareWarnings(rule.family, members), ...fallbackWarnings(rule.family)]).slice(0, 5),
    immediateContainment: usableSourceResponse(source?.immediateContainment, fallbackContainment[rule.family.toLowerCase()]),
    longTermResponse: fallbackLongTerm[rule.family.toLowerCase()],
    linkedFindingIds,
    linkedRiskIds: linkedRisks.map((risk) => risk.id),
    linkedFindingRefs: linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    linkedRiskRefs: linkedRisks.map((risk) => riskRefs.get(risk.id) ?? '').filter(Boolean)
  };
}

function buildScenarioFacts(scenarios: PlausibleScenario[], findings: MaterialFinding[], risks: RiskRegisterEntry[], findingRefs: Map<string, string>, riskRefs: Map<string, string>, tier: NarrativeProductTier, exposures: readonly SupportedExposure[] = []): NarrativeScenarioFact[] {
  const candidates = FRAUD_PATHWAY_RULES.map((rule) => ({ rule, members: pathwayMembers(rule, findings) }))
    .filter((item) => item.members.length > 0)
    .filter((item) => risks.some((risk) => risk.linkedFindingIds.some((id) => item.members.some((finding) => finding.id === id))))
    .sort((left, right) => pathwayPriority(right.rule, findings) - pathwayPriority(left.rule, findings) || left.rule.family.localeCompare(right.rule.family));
  const limit = tier === 'essential' ? 3 : 4;
  const selected = candidates.slice(0, limit);
  const result = selected.map(({ rule, members }, index) => {
    const source = scenarios.find((scenario) => ruleForScenario(scenario, findings)?.family === rule.family && scenario.linkedFindingIds.some((id) => members.some((finding) => finding.id === id)));
    return synthesizeScenario(rule, source, members, findingRefs, riskRefs, risks, index, exposures);
  });
  result.forEach(assertScenario);
  return result;
}

function buildControlFacts(controls: ControlImprovementEntry[], findings: MaterialFinding[], findingRefs: Map<string, string>): NarrativeControlFact[] {
  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  return controls.map((control, index) => ({
    factRef: `CONTROL-${String(index + 1).padStart(3, '0')}`,
    sourceId: control.id,
    primarySemanticFamily: findingById.get(control.linkedFindingId)?.primarySemanticFamily ?? 'FRAUD_GOVERNANCE',
    objective: text(control.controlObjective),
    currentState: text(control.currentState),
    targetState: text(control.targetState),
    accountableExecutive: text(control.accountableExecutive),
    processOwner: text(control.processOwner),
    population: text(control.completePopulationCoverage),
    frequency: text(control.operatingFrequency),
    proofRetained: list(control.evidenceRetained),
    independentCheck: text(control.effectivenessTest),
    escalationTrigger: text(control.escalationThreshold),
    sla: text(control.implementationDependency),
    effectivenessMeasure: text(control.effectivenessTest),
    failureResponse: text(control.failureResponse, 'Escalate exceptions through the defined owner and oversight route.'),
    dependencies: list(control.dependencies),
    linkedFindingRefs: [findingRefs.get(control.linkedFindingId) ?? ''].filter(Boolean),
    linkedSustainmentPriorityRefs: []
  }));
}

function decisionSemanticFamily(decision: LeadershipDecision, findings: MaterialFinding[]): string {
  const linked = findings.filter((finding) => decision.linkedFindingIds.includes(finding.id));
  const priority: PrimarySemanticFamily[] = ['PAYROLL_INTEGRITY', 'CASH_CUSTODY', 'STOCK_ASSET_CUSTODY', 'PRIVILEGED_ACCESS', 'IDENTITY_VERIFICATION', 'DETECTION_MONITORING', 'EVIDENCE_INTEGRITY', 'INCIDENT_RESPONSE', 'SUPPLIER_PAYMENT_CHANGE', 'SUPPLIER_ONBOARDING', 'FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT'];
  const family = priority.find((candidate) => linked.some((finding) => finding.primarySemanticFamily === candidate));
  const mapping: Partial<Record<PrimarySemanticFamily, string>> = {
    FRAUD_GOVERNANCE: 'FRAUD_GOVERNANCE_MODEL',
    FRAUD_RISK_IDENTIFICATION: 'FRAUD_GOVERNANCE_MODEL',
    CONTINUOUS_IMPROVEMENT: 'CONTROL_EFFECTIVENESS_CADENCE',
    SUPPLIER_ONBOARDING: 'SUPPLIER_VERIFICATION_MODEL',
    SUPPLIER_PAYMENT_CHANGE: 'SUPPLIER_VERIFICATION_MODEL',
    THIRD_PARTY_OVERSIGHT: 'SUPPLIER_VERIFICATION_MODEL',
    PRIVILEGED_ACCESS: 'PRIVILEGED_ACCESS_OPERATING_STANDARD',
    IDENTITY_VERIFICATION: 'IDENTITY_VERIFICATION_MODEL',
    DETECTION_MONITORING: 'DETECTION_OPERATING_MODEL',
    INCIDENT_RESPONSE: 'INCIDENT_AND_EVIDENCE_MODEL',
    EVIDENCE_INTEGRITY: 'INCIDENT_AND_EVIDENCE_MODEL',
    WHISTLEBLOWING: 'INCIDENT_AND_EVIDENCE_MODEL',
    PAYROLL_INTEGRITY: 'PAYROLL_INTEGRITY_MODEL',
    CASH_CUSTODY: 'CASH_CUSTODY_MODEL',
    STOCK_ASSET_CUSTODY: 'STOCK_ASSET_CUSTODY_MODEL'
  };
  return (family ? mapping[family] : undefined) ?? 'CONTROL_EFFECTIVENESS_CADENCE';
}

function buildDecisionFacts(decisions: LeadershipDecision[], findings: MaterialFinding[], findingRefs: Map<string, string>, semanticFamilyOverrides = new Map<string, string>()): NarrativeDecisionFact[] {
  const options = buildDecisionOptionSets(decisions);
  return decisions.map((decision, index) => {
    const optionSet = options[index];
    return {
      factRef: `DECISION-${String(index + 1).padStart(3, '0')}`,
      sourceId: decision.id,
      decisionFamily: decision.decisionCategory,
      decisionSemanticFamily: semanticFamilyOverrides.get(decision.id) ?? decisionSemanticFamily(decision, findings),
      question: text(decision.decisionRequired),
      options: optionSet?.optionDetails.map((option) => ({ option: option.option, cost: option.cost, benefit: option.benefit, tradeOff: option.tradeOff })) ?? [],
      recommendedRoute: text(optionSet?.deterministicRecommendation, decision.recommendedDecision),
      rationale: text(optionSet?.recommendationRationale, decision.whyNow),
      owner: text(optionSet?.owner, decision.accountableExecutive),
      targetDate: text(optionSet?.targetDate, decision.deadline),
      consequenceOfDelay: text(decision.consequenceOfDelay),
      linkedFindingRefs: decision.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
      linkedSustainmentPriorityRefs: []
    };
  });
}

function buildThemeFacts(contradictions: AdvisoryEvidenceModel['contradictions'], findings: MaterialFinding[], risks: RiskRegisterEntry[], scenarios: NarrativeScenarioFact[], findingRefs: Map<string, string>, riskRefs: Map<string, string>): NarrativeThemeFact[] {
  const themes = THEME_RULES.map((rule) => ({ rule, members: findings.filter((finding) => rule.anchorFamilies.includes(finding.primarySemanticFamily) || finding.secondarySemanticFamilies.some((family) => rule.anchorFamilies.includes(family))) }))
    .filter((item) => item.members.length > 0)
    .sort((left, right) => right.members.reduce((sum, finding) => sum + finding.materialityScore, 0) - left.members.reduce((sum, finding) => sum + finding.materialityScore, 0) || left.rule.themeFamily.localeCompare(right.rule.themeFamily))
    .slice(0, 5)
    .map(({ rule, members }, index) => {
      const memberIds = new Set(members.map((member) => member.id));
      const linkedRisks = risks.filter((risk) => risk.linkedFindingIds.some((id) => memberIds.has(id)));
      const linkedScenarios = scenarios.filter((scenario) => scenario.linkedFindingRefs.some((ref) => members.some((member) => findingRefs.get(member.id) === ref)));
      const contradiction = contradictions.find((item) => item.linkedFindingIds.some((id) => memberIds.has(id)));
      return {
        factRef: `THEME-${String(index + 1).padStart(3, '0')}`,
        themeFamily: rule.themeFamily,
        managementQuestion: rule.managementQuestion,
        title: rule.title,
        findingRefs: members.map((member) => findingRefs.get(member.id) ?? '').filter(Boolean),
        domainCodes: [...new Set(members.map((member) => member.domainCode))].sort(),
        semanticFamilies: [...new Set(members.flatMap((member) => [member.primarySemanticFamily, ...member.secondarySemanticFamilies]))],
        riskRefs: linkedRisks.map((risk) => riskRefs.get(risk.id) ?? '').filter(Boolean),
        scenarioRefs: linkedScenarios.map((scenario) => scenario.factRef),
        managementImplicationBasis: text(contradiction?.whyItMatters, `The selected findings require one connected management response across ownership, control design, monitoring and escalation.`),
        fraudRiskRelationship: text(contradiction?.fraudPathwayEnabled, members.map((member) => member.fraudMechanism).filter(Boolean).slice(0, 2).join(' ')),
        whyTogether: rule.whyTogether
      };
    });
  return themes.filter((theme) => theme.findingRefs.length > 0 && theme.riskRefs.length > 0 && theme.fraudRiskRelationship);
}

function roadmapOutcomeFor(finding: MaterialFinding): string {
  const outcomes: Record<PrimarySemanticFamily, string> = {
    FRAUD_GOVERNANCE: 'Fraud-risk ownership, escalation and management reporting operate through a defined governance route.',
    FRAUD_RISK_IDENTIFICATION: 'Fraud risks are mapped, refreshed and assigned to treatment before changes or emerging methods create blind spots.',
    SUPPLIER_ONBOARDING: 'Supplier onboarding verifies identity, ownership, banking and conflicts before activation.',
    SUPPLIER_PAYMENT_CHANGE: 'Supplier payment and bank-detail changes are independently verified before release.',
    THIRD_PARTY_OVERSIGHT: 'Third-party relationships are risk-tiered, monitored and escalated through accountable oversight.',
    ORDINARY_ACCESS: 'Role-based access and segregation are aligned to current responsibilities and reviewed for exceptions.',
    PRIVILEGED_ACCESS: 'Privileged access is restricted, logged, recertified and removed when no longer justified.',
    IDENTITY_VERIFICATION: 'Identity and sensitive-profile changes are verified through a trusted route and retained for investigation.',
    DETECTION_MONITORING: 'Fraud monitoring and exception review operate with defined coverage, ownership, closure evidence and escalation.',
    INCIDENT_RESPONSE: 'Suspected-fraud intake, containment, investigation and escalation operate through a defined incident route.',
    EVIDENCE_INTEGRITY: 'Fraud evidence is identified, preserved and handled through controlled custody.',
    WHISTLEBLOWING: 'Reporting channels are trusted, protected and independently routed when concerns are raised.',
    FRAUD_AWARENESS: 'People in relevant roles recognise fraud indicators and act through the required reporting route.',
    CONTINUOUS_IMPROVEMENT: 'Fraud-risk and control learning is refreshed through a repeatable management review cycle.',
    PAYROLL_INTEGRITY: 'Payroll changes and unusual records are independently reviewed before payment release.',
    CASH_CUSTODY: 'Cash custody, counting and reconciliation operate with defined ownership and difference escalation.',
    STOCK_ASSET_CUSTODY: 'Stock and physical-asset custody, movement and reconciliation operate with independent write-off review.'
  };
  return outcomes[finding.primarySemanticFamily];
}

function roadmapWorkFor(finding: MaterialFinding): string {
  const work: Record<PrimarySemanticFamily, string> = {
    FRAUD_GOVERNANCE: 'Approve the fraud-risk mandate, reporting rhythm, escalation authority and decision record.',
    FRAUD_RISK_IDENTIFICATION: 'Refresh the structured fraud-risk assessment, map process pathways and assign treatment owners.',
    SUPPLIER_ONBOARDING: 'Implement independent legal-identity, ownership, banking and conflict checks before supplier activation.',
    SUPPLIER_PAYMENT_CHANGE: 'Quarantine bank-detail changes, callback to a trusted pre-existing contact and require segregated approval.',
    THIRD_PARTY_OVERSIGHT: 'Risk-tier the third-party population, monitor high-risk relationships and escalate unresolved due-diligence exceptions.',
    ORDINARY_ACCESS: 'Reconcile role-based access and segregation-of-duties exceptions against current responsibilities.',
    PRIVILEGED_ACCESS: 'Reconcile the privileged-account population, enforce named access and retain periodic recertification evidence.',
    IDENTITY_VERIFICATION: 'Apply risk-based identity verification and controlled review of sensitive profile or account changes.',
    DETECTION_MONITORING: 'Define monitoring coverage, red flags, review ownership, closure evidence and overdue escalation.',
    INCIDENT_RESPONSE: 'Establish severity-based intake, containment ownership, investigation decision rights and closure criteria.',
    EVIDENCE_INTEGRITY: 'Establish evidence preservation, integrity checks, access controls and custody-transfer records.',
    WHISTLEBLOWING: 'Protect reporting channels, define independent routing and track retaliation or closure exceptions.',
    FRAUD_AWARENESS: 'Map role-specific scenarios to learning, test understanding and escalate overdue completion.',
    CONTINUOUS_IMPROVEMENT: 'Schedule fraud-risk and control-environment review, record lessons and refresh treatment after change.',
    PAYROLL_INTEGRITY: 'Reconcile the payroll population, review master-file changes before payment and close every anomaly or exception.',
    CASH_CUSTODY: 'Assign cash custodians, reconcile counts and banking, and investigate or escalate every difference.',
    STOCK_ASSET_CUSTODY: 'Reconcile stock and physical assets across locations, authorise movements and independently review write-offs and shrinkage.'
  };
  return work[finding.primarySemanticFamily];
}

function buildRoadmapFacts(actions: RoadmapAction[], findings: MaterialFinding[], findingRefs: Map<string, string>, tier: NarrativeProductTier): NarrativeRoadmapFact[] {
  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  return actions
    .filter((action) => findingRefs.has(action.linkedFindingId) && findingById.has(action.linkedFindingId))
    .map((action, index) => ({
    factRef: `ROADMAP-${String(index + 1).padStart(3, '0')}`,
    sourceId: action.id,
    sourceFindingRef: findingRefs.get(action.linkedFindingId) ?? '',
    primarySemanticFamily: findings.find((finding) => finding.id === action.linkedFindingId)?.primarySemanticFamily ?? 'FRAUD_GOVERNANCE',
    phase: phaseFor(action),
    phaseWindow: roadmapWindowFor(action),
    managementOutcome: roadmapOutcomeFor(findings.find((finding) => finding.id === action.linkedFindingId) ?? findings[0]!),
    priorityWork: roadmapWorkFor(findings.find((finding) => finding.id === action.linkedFindingId) ?? findings[0]!),
    accountableExecutive: text(action.accountableExecutive),
    processOwner: text(action.processOwner, action.accountableOwner),
    targetPeriod: action.period,
    dependencies: list(action.dependency).filter((item) => item !== 'None'),
    proofOfCompletion: text(action.evidenceOfCompletion),
    successMeasure: text(action.successMeasure),
    failureTrigger: text(action.escalationThreshold, 'Escalate when the target-period success measure is not met or an exception remains overdue.')
  }));
}

function buildSustainmentPriorityFacts(priorities: SustainmentPriority[], includeSourceMetadata = false): NarrativeSustainmentPriorityFact[] {
  return priorities.map((priority, index) => ({
    factRef: `SUSTAINMENT-${String(index + 1).padStart(3, '0')}`,
    title: naturalSustainmentTitle(priority.title),
    domain: priority.domainName,
    semanticFamily: priority.primarySemanticFamily,
    recordedPosition: `${priority.responseLabel}: ${cleanSustainmentLanguage(priority.responseOperationalMeaning)}`,
    currentStrongStandard: cleanSustainmentLanguage(priority.currentStrongStandard, 'The control standard is in place.').replace(/[.;]+$/, ''),
    managementFocus: cleanSustainmentLanguage(priority.managementFocus),
    accountableExecutive: text(priority.accountableExecutive, 'Chief Executive / Managing Director'),
    processOwner: text(priority.processOwner, 'Head of Risk'),
    operatingFrequency: text(priority.operatingFrequency, 'At least annually and after material change'),
    proofRetained: priority.proofRetained.map((item) => cleanSustainmentLanguage(item)).filter(Boolean),
    deteriorationTrigger: cleanSustainmentLanguage(priority.deteriorationTrigger, 'Material process, system, product or ownership change.'),
    effectivenessIndicator: cleanSustainmentLanguage(priority.effectivenessIndicator, 'The review rhythm remains current and exceptions are assigned.'),
    dependencies: priority.dependencies.map((item) => cleanSustainmentLanguage(item)).filter(Boolean),
    ...(includeSourceMetadata ? {
      sourceId: text(priority.id),
      sourceFindingId: text(priority.sourceFindingId),
      sourceQuestionCode: text(priority.questionCode),
      sourceDomainCode: text(priority.domainCode),
      sourceRefs: unique([priority.id, priority.sourceFindingId, priority.questionCode, priority.domainCode])
    } : {})
  }));
}

function buildSustainmentControls(priorities: NarrativeSustainmentPriorityFact[]): NarrativeControlFact[] {
  const designByFamily: Partial<Record<PrimarySemanticFamily, {
    objective: string;
    currentState: string;
    targetState: string;
    managementReview: string;
    failureResponse: string;
  }>> = {
    FRAUD_GOVERNANCE: {
      objective: 'Maintain fraud leadership and governance readiness through visible decision rights, funded ownership and timely escalation.',
      currentState: 'The recorded standard places senior ownership, budget, unresolved exceptions and governing-body reporting within the fraud-risk programme.',
      targetState: 'Decision rights, funded owners, unresolved actions and escalation status are visible in each governance cycle.',
      managementReview: 'Management reviews the mandate, decision rights and overdue-action escalation through the normal governance route.',
      failureResponse: 'Escalate an unowned or overdue material action through the named owner and governing-body route, then record the management response.'
    },
    CONTINUOUS_IMPROVEMENT: {
      objective: 'Maintain control-effectiveness learning through scheduled review, evidence sampling, exception ownership and timely action closure.',
      currentState: 'The recorded standard combines scheduled risk reassessment, key-control review and consolidated reporting with owned actions.',
      targetState: 'Review scope, sampled evidence, deterioration signals and action closure feed the next management review.',
      managementReview: 'Management reviews the population, evidence sample, exception assignment and closure record through the normal risk route.',
      failureResponse: 'Route an overdue review or deteriorated key control to the named process owner, assign the response and record closure.'
    },
    FRAUD_RISK_IDENTIFICATION: {
      objective: 'Keep the fraud-risk view current through material-process coverage, treatment ownership and change-triggered refresh.',
      currentState: 'The recorded standard covers material processes, repeatable ratings, named owners and a tracked treatment plan.',
      targetState: 'Material processes carry current risk ratings, treatment owners and dates, with an interim refresh after material change.',
      managementReview: 'Management reviews process coverage, risk and treatment currency through the normal governance decision route.',
      failureResponse: 'Escalate an outdated assessment or unowned material change through the named risk owner and normal governance route.'
    }
  };
  return priorities.map((priority, index) => {
    const design = designByFamily[priority.semanticFamily] ?? designByFamily.CONTINUOUS_IMPROVEMENT!;
    return {
      factRef: `CONTROL-${String(index + 1).padStart(3, '0')}`,
      sourceId: priority.factRef,
      primarySemanticFamily: priority.semanticFamily,
      objective: design.objective,
      currentState: `${priority.recordedPosition} ${design.currentState}`,
      targetState: design.targetState,
      accountableExecutive: priority.accountableExecutive,
      processOwner: priority.processOwner,
      population: 'The complete in-scope population for the control standard.',
      frequency: priority.operatingFrequency,
      proofRetained: priority.proofRetained,
      independentCheck: design.managementReview,
      escalationTrigger: priority.deteriorationTrigger,
      sla: 'Review within the next scheduled management cycle and after a material change.',
      effectivenessMeasure: priority.effectivenessIndicator,
      failureResponse: design.failureResponse,
      dependencies: priority.dependencies,
      linkedFindingRefs: [],
      linkedSustainmentPriorityRefs: [priority.factRef]
    };
  });
}

function buildSustainmentDecisions(priorities: NarrativeSustainmentPriorityFact[]): NarrativeDecisionFact[] {
  const profiles: Record<string, {
    semanticFamily: string;
    question: string;
    options: Array<{ option: string; cost: string; benefit: string; tradeOff: string }>;
    recommendedRoute: string;
    rationale: string;
    consequenceOfDelay: string;
  }> = {
    FRAUD_GOVERNANCE: {
      semanticFamily: 'FRAUD_GOVERNANCE_MODEL',
      question: 'What governance commitment will keep fraud-risk ownership and escalation current as the organisation changes?',
      options: [
        { option: 'Reconfirm the executive mandate and decision rights each quarter.', cost: 'Leadership time to refresh the mandate and resolve boundary questions.', benefit: 'Keeps accountability, funding and escalation authority visible.', tradeOff: 'Requires prompt action when ownership or priorities change.' },
        { option: 'Add overdue-action escalation to the governing-body pack.', cost: 'A small reporting and data-owner burden each cycle.', benefit: 'Makes unowned and delayed actions visible before they become a wider governance concern.', tradeOff: 'Needs reliable action data and disciplined exception follow-through.' },
        { option: 'Use the annual governance review to test funding and succession cover.', cost: 'Dedicated agenda time and evidence from the accountable executive.', benefit: 'Checks that the standard can withstand role or resource change.', tradeOff: 'May surface decisions that require additional management capacity.' }
      ],
      recommendedRoute: 'Reconfirm the executive mandate and add overdue-action escalation to the quarterly governance pack.',
      rationale: 'The governance standard depends on visible decision rights, funded ownership and timely escalation. A short quarterly confirmation protects those conditions without adding a parallel committee.',
      consequenceOfDelay: 'A change in executive ownership or unresolved action load could weaken the route from fraud-risk activity to governing-body oversight.'
    },
    CONTINUOUS_IMPROVEMENT: {
      semanticFamily: 'CONTROL_EFFECTIVENESS_CADENCE',
      question: 'What review discipline will keep control-effectiveness learning current?',
      options: [
        { option: 'Protect the annual control-effectiveness review and record action closure.', cost: 'Review capacity, evidence collation and action-owner time.', benefit: 'Keeps the established learning cycle visible and connected to governance.', tradeOff: 'The cycle can lose value if actions are recorded without timely closure.' },
        { option: 'Require an event-triggered review after a material incident or restructuring.', cost: 'A defined trigger assessment and additional review capacity when needed.', benefit: 'Refreshes the control view when the operating environment changes materially.', tradeOff: 'Requires management to recognise and record trigger events consistently.' },
        { option: 'Report deteriorated key controls through the normal risk route.', cost: 'A recurring exception view and named data owner.', benefit: 'Connects control deterioration to an accountable response and due date.', tradeOff: 'Needs a consistent threshold for what is reported as deterioration.' }
      ],
      recommendedRoute: 'Protect the annual review, add event-triggered refresh and require named action closure for deterioration.',
      rationale: 'The improvement discipline is strongest when review records, exceptions and lessons feed a recurring management cycle. The decision should preserve that cycle while making material change a clear reason to refresh it.',
      consequenceOfDelay: 'Overdue review or unowned deterioration could allow control-learning signals to remain outside the ordinary management route.'
    },
    FRAUD_RISK_IDENTIFICATION: {
      semanticFamily: 'FRAUD_RISK_IDENTIFICATION_MODEL',
      question: 'How will management keep the fraud-risk view current when material processes or ownership change?',
      options: [
        { option: 'Keep the full fraud-risk assessment within the two-year cycle.', cost: 'Assessment planning, participant time and treatment-plan refresh.', benefit: 'Maintains a current view across material processes and residual risks.', tradeOff: 'A periodic cycle alone may not capture an important change between assessments.' },
        { option: 'Trigger an interim refresh after a material process, product or ownership change.', cost: 'A documented trigger review and focused assessment effort.', benefit: 'Keeps the risk view connected to the operating environment as it changes.', tradeOff: 'Requires a clear threshold and timely recognition of material change.' },
        { option: 'Require each material process to carry a current owner and treatment date.', cost: 'Ongoing ownership maintenance and review of treatment records.', benefit: 'Makes gaps in coverage and follow-through visible between full assessments.', tradeOff: 'The record must be kept current to remain useful for governance.' }
      ],
      recommendedRoute: 'Keep the two-year assessment current and require an interim refresh after material change, with owners and treatment dates visible.',
      rationale: 'The risk-identification standard remains useful when its age, process coverage and treatment ownership are visible. A defined interim trigger closes the gap between scheduled assessments and material operating change.',
      consequenceOfDelay: 'An outdated assessment or material residual-risk change without an owner could leave management relying on a risk view that no longer reflects the operating environment.'
    }
  };
  return priorities.slice(0, 5).map((priority, index) => {
    const profile = profiles[priority.semanticFamily] ?? {
      semanticFamily: `${priority.semanticFamily}_MODEL`,
      question: `What management commitment will keep ${priority.title.toLowerCase()} current?`,
      options: [
        { option: `Keep the ${priority.title.toLowerCase()} review current.`, cost: 'Protected management and review capacity.', benefit: 'Keeps the standard visible and owned.', tradeOff: 'Requires disciplined follow-through.' },
        { option: `Add a change-triggered review for ${priority.title.toLowerCase()}.`, cost: 'A defined trigger review when conditions change.', benefit: 'Makes material change visible in time to respond.', tradeOff: 'Requires a clear change threshold.' },
        { option: `Report exceptions affecting ${priority.title.toLowerCase()} through the normal governance route.`, cost: 'A recurring exception view.', benefit: 'Connects deterioration to an accountable response.', tradeOff: 'Needs reliable records and action closure.' }
      ],
      recommendedRoute: `Keep ${priority.title.toLowerCase()} current through scheduled review and change-triggered attention.`,
      rationale: `The ${priority.title.toLowerCase()} standard is strongest when ownership, review timing and change-triggered attention remain explicit.`,
      consequenceOfDelay: `A material change could weaken ${priority.title.toLowerCase()} without an early management signal.`
    };
    return {
      factRef: `DECISION-${String(index + 1).padStart(3, '0')}`,
      sourceId: priority.factRef,
      decisionFamily: 'governance_reporting_cadence',
      decisionSemanticFamily: profile.semanticFamily,
      question: profile.question,
      options: profile.options,
      recommendedRoute: profile.recommendedRoute,
      rationale: profile.rationale,
      owner: priority.accountableExecutive,
      targetDate: 'Within the next 90 days',
      consequenceOfDelay: profile.consequenceOfDelay,
      linkedFindingRefs: [],
      linkedSustainmentPriorityRefs: [priority.factRef]
    };
  });
}

function buildSustainmentRoadmap(priorities: NarrativeSustainmentPriorityFact[]): NarrativeRoadmapFact[] {
  const actions = [
    { period: '30 days', phase: 'STABILISE' as const, window: '0-30 days', outcome: 'Ownership and the review calendar remain current.', work: 'Confirm the accountable executive, process owner, oversight route and next review date.', proof: 'Retain the current ownership record and approved review calendar.', measure: 'Every sustainment priority has a named owner and scheduled review date.' },
    { period: '60 days', phase: 'ESTABLISH' as const, window: '31-90 days', outcome: 'The next control-effectiveness review cycle is completed.', work: 'Complete the scheduled review, record exceptions and assign any actions through the normal route.', proof: 'Retain the review record, exception log and action decisions.', measure: 'The scheduled review is completed and any exceptions have owners and dates.' },
    { period: '90 days', phase: 'ESTABLISH' as const, window: '31-90 days', outcome: 'Management information makes deterioration visible.', work: 'Add the selected effectiveness indicator to management information and trigger refresh after material change.', proof: 'Retain the management-information extract and change-trigger record.', measure: 'The indicator is reported on the agreed rhythm and change-triggered reviews are recorded.' }
  ];
  return actions.map((action, index) => {
    const priority = priorities[index % Math.max(priorities.length, 1)];
    return {
      factRef: `ROADMAP-${String(index + 1).padStart(3, '0')}`,
      sourceId: priority?.factRef ?? 'SUSTAINMENT-001',
      sourceFindingRef: '',
      primarySemanticFamily: priority?.semanticFamily ?? 'FRAUD_GOVERNANCE',
      phase: action.phase,
      phaseWindow: action.window,
      managementOutcome: action.outcome,
      priorityWork: action.work,
      accountableExecutive: priority?.accountableExecutive ?? 'Chief Executive / Managing Director',
      processOwner: priority?.processOwner ?? 'Head of Risk',
      targetPeriod: action.period,
      dependencies: priority?.dependencies ?? [],
      proofOfCompletion: action.proof,
      successMeasure: action.measure,
      failureTrigger: priority?.deteriorationTrigger ?? 'Escalate when ownership, review timing or the effectiveness indicator is no longer current.',
      sourceSustainmentPriorityRef: priority?.factRef
    };
  });
}

function buildSustainmentProofFacts(priorities: NarrativeSustainmentPriorityFact[]): NarrativeProofFact[] {
  return priorities.map((priority, index) => ({
    factRef: `PROOF-SUSTAINMENT-${String(index + 1).padStart(3, '0')}`,
    sourceId: priority.factRef,
    linkedFindingRefs: [],
    requirement: `Retain the current ownership, review and exception records for ${priority.title.toLowerCase()}.`,
    owner: priority.processOwner,
    whyItMatters: 'These records show that the strong standard remains owned and visible through the normal management cycle.',
    expectedRecency: 'Current for the latest scheduled review and refreshed after material change.',
    requiredPopulation: 'The complete in-scope population for that standard.',
    acceptableExamples: priority.proofRetained.length > 0 ? priority.proofRetained : ['Ownership record', 'Review calendar', 'Exception and action log']
  }));
}

function buildProofFacts(model: AdvisoryEvidenceModel, findingRefs: Map<string, string>, proofOverride?: NarrativeProofFact[]): NarrativeProofFact[] {
  const proofWhy = (requirement: string, why: string): string => cleanFactLanguage(why) || `This proof shows that ${requirement.toLowerCase()} is defined, owned and retained for the selected control response.`;
  if (proofOverride) return proofOverride.map((item) => ({
    ...item,
    linkedFindingRefs: item.linkedFindingRefs.map((ref) => findingRefs.get(ref) ?? ref).filter((ref) => ref.startsWith('FINDING-')),
    requirement: cleanFactLanguage(item.requirement),
    owner: cleanFactLanguage(item.owner),
    whyItMatters: proofWhy(item.requirement, item.whyItMatters),
    expectedRecency: cleanFactLanguage(item.expectedRecency),
    requiredPopulation: cleanFactLanguage(item.requiredPopulation),
    acceptableExamples: item.acceptableExamples.map((example) => cleanFactLanguage(example))
  }));
  return model.evidenceChecklist.map((item, index) => ({
    factRef: `PROOF-${String(index + 1).padStart(3, '0')}`,
    sourceId: item.id,
    linkedFindingRefs: item.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    requirement: cleanFactLanguage(item.artefact),
    owner: cleanFactLanguage(item.likelyOwner),
    whyItMatters: proofWhy(item.artefact, item.provesWhat),
    expectedRecency: cleanFactLanguage(item.expectedRecency),
    requiredPopulation: cleanFactLanguage(item.requiredPopulation),
    acceptableExamples: list(item.minimumAcceptableCharacteristics).map((example) => cleanFactLanguage(example))
  }));
}

function selectNarrativeFindings(findings: MaterialFinding[], limit: number): MaterialFinding[] {
  const selected: MaterialFinding[] = [];
  for (const rule of THEME_RULES) {
    const representative = findings
      .filter((finding) => rule.anchorFamilies.includes(finding.primarySemanticFamily) || finding.secondarySemanticFamilies.some((family) => rule.anchorFamilies.includes(family)))
      .sort((left, right) => right.materialityScore - left.materialityScore || left.id.localeCompare(right.id))[0];
    if (representative && !selected.some((finding) => finding.id === representative.id)) selected.push(representative);
  }
  for (const finding of [...findings].sort((left, right) => right.materialityScore - left.materialityScore || left.questionCode.localeCompare(right.questionCode))) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.id === finding.id)) selected.push(finding);
  }
  return selected.slice(0, limit);
}

function selectThemeCoveredControls(controls: ControlImprovementEntry[], findings: MaterialFinding[], limit: number): ControlImprovementEntry[] {
  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  const familiesForFinding = (finding: MaterialFinding | undefined): PrimarySemanticFamily[] => finding ? [finding.primarySemanticFamily, ...finding.secondarySemanticFamilies] : [];
  const selected: ControlImprovementEntry[] = [];
  for (const rule of THEME_RULES) {
    const candidate = controls
      .filter((control) => familiesForFinding(findingById.get(control.linkedFindingId)).some((family) => rule.anchorFamilies.includes(family)))
      .sort((left, right) => (findingById.get(right.linkedFindingId)?.materialityScore ?? 0) - (findingById.get(left.linkedFindingId)?.materialityScore ?? 0) || left.id.localeCompare(right.id))[0];
    if (candidate && !selected.some((control) => control.id === candidate.id)) selected.push(candidate);
    if (selected.length >= limit) break;
  }
  for (const control of [...controls].sort((left, right) => left.id.localeCompare(right.id))) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.id === control.id)) selected.push(control);
  }
  for (const finding of findings) {
    if (selected.length >= limit) break;
    const candidate = controls.find((control) => control.linkedFindingId === finding.id && !selected.some((item) => item.id === control.id));
    if (candidate) selected.push(candidate);
  }
  return selected.slice(0, limit);
}

function selectRoadmapActions(actions: RoadmapAction[], limit: number): RoadmapAction[] {
  const selected = new Set<RoadmapAction>();
  for (const period of ['30 days', '60 days', '90 days']) {
    const action = actions.find((candidate) => candidate.period === period);
    if (action) selected.add(action);
  }
  for (const action of actions) {
    if (selected.size >= limit) break;
    selected.add(action);
  }
  return actions.filter((action) => selected.has(action)).slice(0, limit);
}

function selectThemeSpecificDecisions(decisions: LeadershipDecision[], findings: MaterialFinding[], limit: number): { decisions: LeadershipDecision[]; semanticFamilyOverrides: Map<string, string> } {
  const selected: LeadershipDecision[] = [];
  const overrides = new Map<string, string>();
  const targetFamilies = ['FRAUD_GOVERNANCE_MODEL', 'PRIVILEGED_ACCESS_OPERATING_STANDARD', 'IDENTITY_VERIFICATION_MODEL', 'DETECTION_OPERATING_MODEL', 'INCIDENT_AND_EVIDENCE_MODEL', 'SUPPLIER_VERIFICATION_MODEL', 'CONTROL_EFFECTIVENESS_CADENCE'];
  const familyForTarget = new Map<string, PrimarySemanticFamily[]>([
    ['FRAUD_GOVERNANCE_MODEL', ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT']],
    ['PRIVILEGED_ACCESS_OPERATING_STANDARD', ['PRIVILEGED_ACCESS', 'ORDINARY_ACCESS']],
    ['IDENTITY_VERIFICATION_MODEL', ['IDENTITY_VERIFICATION']],
    ['DETECTION_OPERATING_MODEL', ['DETECTION_MONITORING']],
    ['INCIDENT_AND_EVIDENCE_MODEL', ['INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING']],
    ['SUPPLIER_VERIFICATION_MODEL', ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'THIRD_PARTY_OVERSIGHT']],
    ['CONTROL_EFFECTIVENESS_CADENCE', ['CONTINUOUS_IMPROVEMENT']]
  ]);
  const sorted = [...decisions].sort((left, right) => left.id.localeCompare(right.id));
  for (const target of targetFamilies) {
    if (selected.length >= limit) break;
    const allowed = new Set(familyForTarget.get(target) ?? []);
    const candidate = sorted.find((decision) => !selected.some((item) => item.id === decision.id) && decision.linkedFindingIds.some((id) => allowed.has(findings.find((finding) => finding.id === id)?.primarySemanticFamily ?? 'FRAUD_GOVERNANCE')));
    if (candidate) {
      selected.push(candidate);
      overrides.set(candidate.id, target);
    }
  }
  return { decisions: selected.slice(0, limit), semanticFamilyOverrides: overrides };
}

function buildPack(input: {
  tier: NarrativeProductTier;
  data?: AssembledReportData;
  organisationName: string;
  assessmentReference?: string;
  generatedAt?: string;
  score: NarrativeFactPack['assessment'];
  domainData?: AssembledReportData['domainResults'];
  evidenceModel: AdvisoryEvidenceModel;
  selectedFindings: MaterialFinding[];
  selectedRisks: RiskRegisterEntry[];
  selectedScenarios: PlausibleScenario[];
  selectedControls: ControlImprovementEntry[];
  selectedDecisions: LeadershipDecision[];
  selectedRoadmap: RoadmapAction[];
  narrativeMode: NarrativeMode;
  sustainmentPriorities?: SustainmentPriority[];
  proofOverride?: NarrativeProofFact[];
  decisionSemanticFamilyOverrides?: Map<string, string>;
}): NarrativeFactPack {
  const sustainment = input.narrativeMode === 'SUSTAINMENT';
  const sustainmentPriorityFacts = sustainment ? buildSustainmentPriorityFacts(input.sustainmentPriorities ?? [], input.tier === 'comprehensive') : [];
  const narrativeFindings = sustainment ? [] : input.selectedFindings;
  const narrativeRisks = sustainment ? [] : input.selectedRisks;
  const narrativeScenarios = sustainment ? [] : input.selectedScenarios;
  const findings = buildFindingFacts(narrativeFindings);
  const findingRefs = new Map(findings.map((finding) => [finding.sourceId, finding.factRef]));
  const risks = buildRiskFacts(narrativeRisks, narrativeFindings, findingRefs);
  const riskRefs = new Map(risks.map((risk) => [risk.sourceId, risk.factRef]));
  const operatingContext = input.data?.adaptiveGatewayAnswers && Object.keys(input.data.adaptiveGatewayAnswers).length > 0
    ? deriveNarrativeOperatingContext({
      graphVersion: input.data ? adaptiveGraphVersionForAssessment(input.data) : undefined,
      gatewayAnswers: input.data.adaptiveGatewayAnswers
    })
    : [];
  const operatingExposures = exposuresFromContext(operatingContext);
  const scenarios = buildScenarioFacts(narrativeScenarios, narrativeFindings, narrativeRisks, findingRefs, riskRefs, input.tier, operatingExposures);
  const controls = sustainment ? buildSustainmentControls(sustainmentPriorityFacts) : buildControlFacts(input.selectedControls, input.selectedFindings, findingRefs);
  const decisions = sustainment ? buildSustainmentDecisions(sustainmentPriorityFacts) : buildDecisionFacts(input.selectedDecisions, input.selectedFindings, findingRefs, input.decisionSemanticFamilyOverrides)
    .filter((decision, index, all) => all.findIndex((candidate) => JSON.stringify(candidate.options.map((option) => option.option)) === JSON.stringify(decision.options.map((option) => option.option))) === index);
  const domains = buildDomains(input.data, findings);
  const questionSignals = input.tier === 'comprehensive' ? buildQuestionSignals(input.data, operatingContext, domains) : [];
  const themes = buildThemeFacts(input.evidenceModel.contradictions, narrativeFindings, narrativeRisks, scenarios, findingRefs, riskRefs);
  const themedFindingRefs = new Set(themes.flatMap((theme) => theme.findingRefs));
  const standaloneFindingReasons = Object.fromEntries(findings.filter((finding) => !themedFindingRefs.has(finding.factRef)).map((finding) => [finding.factRef, 'Retained as a standalone priority because no other selected finding shares a supported systemic relationship; the linked risk and control response remain explicit.']));
  const roadmap = sustainment ? buildSustainmentRoadmap(sustainmentPriorityFacts) : buildRoadmapFacts(input.selectedRoadmap, input.selectedFindings, findingRefs, input.tier);
  const highReadinessSparseNarrativeReason = sustainment
    ? 'Sustainment mode applies because the selected priorities are assurance-only, critical and major gap counts are zero, and no scoring cap changes final maturity. The priorities are not customer-facing material findings.'
    : findings.length < 5 && ((input.score.score ?? 0) >= 60 || /structured|strategic|managed/i.test(input.score.maturity ?? ''))
      ? `Only ${findings.length} material findings met the deterministic selection threshold for this high-readiness profile; the narrative remains sparse to preserve the assessed result and does not invent additional weaknesses.`
    : undefined;
  const maturationSteps = input.tier === 'comprehensive' ? buildNarrativeMaturationSteps(controls, findings, sustainmentPriorityFacts) : [];
  // "Relative" is a claim about the profile, not about the score. Where every
  // domain is assessed identically nothing is relatively stronger than anything
  // else, so the capability is described as established rather than comparative.
  const assessedScores = domains.map((domain) => domain.score).filter((value): value is number => typeof value === 'number');
  const uniformProfile = assessedScores.length > 1 && Math.max(...assessedScores) === Math.min(...assessedScores);
  const relativeStrengths = domains.filter((domain) => domain.score !== null && domain.score >= 60).slice(0, 3).map((domain, index) => ({ factRef: `STRENGTH-${String(index + 1).padStart(3, '0')}`, title: uniformProfile ? `${domain.name} is an established capability in the assessed profile` : `${domain.name} is a relative strength in the assessed profile`, basis: `The assessed domain position is ${domain.score} out of 100.`, domainCode: domain.code }));
  const facts: NarrativeFact[] = [
    makeFact('SCORE-001', 'score', { overall: input.score.score, exposure: input.score.exposureScore, exposureBand: input.score.exposureBand }, ['score_run']),
    makeFact('MATURITY-001', 'maturity', { maturity: input.score.maturity, calculatedMaturity: input.score.calculatedMaturity }, ['score_run']),
    ...domains.map((domain) => makeFact(domain.factRef, 'domain', domain, [domain.code])),
    ...operatingContext.map((fact) => makeFact(`OPERATING-CONTEXT-${fact.key}`, 'operating_context', fact, [fact.sourceGatewayCode, fact.sourceQuestionId])),
    ...questionSignals.map((signal) => makeFact(signal.factRef, 'question_signal', signal, signal.sourceRefs)),
    ...relativeStrengths.map((strength) => makeFact(strength.factRef, 'relative_strength', strength, [strength.domainCode])),
    ...themes.map((theme) => makeFact(theme.factRef, 'systemic_theme', theme, [...theme.findingRefs, ...theme.riskRefs, ...theme.scenarioRefs])),
    ...findings.map((finding) => makeFact(finding.factRef, 'finding', finding, finding.sourceRefs)),
    ...risks.map((risk) => makeFact(risk.factRef, 'risk', risk, [risk.sourceId])),
    ...scenarios.map((scenario) => makeFact(scenario.factRef, 'scenario', scenario, [scenario.sourceId])),
    ...controls.map((control) => makeFact(control.factRef, 'control', control, [control.sourceId])),
    ...decisions.map((decision) => makeFact(decision.factRef, 'decision', decision, [decision.sourceId])),
    ...roadmap.map((item) => makeFact(item.factRef, 'roadmap', item, [item.sourceId])),
    ...maturationSteps.map((item) => makeFact(item.maturationRef, 'maturation', item, [item.linkedFindingRef, item.linkedControlRef])),
    ...(sustainment ? buildSustainmentProofFacts(sustainmentPriorityFacts) : buildProofFacts(input.evidenceModel, findingRefs, input.proofOverride)).map((item) => makeFact(item.factRef, 'proof_of_progress', item, [item.sourceId]))
  ];
  const basePack: NarrativeFactPack = {
    schemaVersion: NARRATIVE_FACT_PACK_SCHEMA_VERSION,
    bibleVersion: REPORTING_BIBLE_VERSION,
    productTier: input.tier,
    narrativeMode: input.narrativeMode,
    organisation: {
      name: input.organisationName,
      operatingContext,
      sectorFacts: operatingContext
        .filter((fact) => fact.customerNarrativeAllowed)
        .map(describeOperatingContextFact)
        .filter(Boolean)
    },
    ...(input.tier === 'comprehensive' ? { questionSignals } : {}),
    assessment: {
      ...input.score,
      reference: text(input.assessmentReference, 'Recorded assessment'),
      generatedAt: text(input.generatedAt, new Date(0).toISOString())
    },
    domains,
    relativeStrengths,
    systemicThemeInputs: themes,
    standaloneFindingReasons,
    findings,
    sustainmentPriorities: sustainmentPriorityFacts,
    risks,
    scenarios,
    controls,
    decisions,
    roadmap,
    proofOfProgress: sustainment ? buildSustainmentProofFacts(sustainmentPriorityFacts) : buildProofFacts(input.evidenceModel, findingRefs, input.proofOverride),
    maturationSteps,
    highReadinessSparseNarrativeReason,
    prohibitedClaims: [
      'independent operating effectiveness', 'evidence validation', 'confirmed fraud event',
      'invented incident, loss, customer, supplier, system or interview', 'unsupported Rand amount',
      'legal, regulatory, benchmark, certification or guarantee conclusion', 'management motive or competence allegation'
    ],
    narrativeBounds: {
      themeCount: themes.length,
      findingCount: findings.length,
      scenarioCount: scenarios.length,
      controlCount: controls.length,
      decisionCount: decisions.length,
      managementResponseCount: roadmap.length,
      maturationCount: maturationSteps.length
    },
    facts: [
      ...facts,
      ...sustainmentPriorityFacts.map((priority) => makeFact(priority.factRef, 'sustainment_priority', priority, priority.sourceRefs ?? []))
    ]
  };
  if (input.tier !== 'comprehensive' || !sustainment) return basePack;
  const premium: ComprehensivePremiumProjection = buildComprehensivePremiumProjection(basePack);
  return {
    ...basePack,
    ...premium,
    facts: [...basePack.facts, ...premiumFactEntries(premium)]
  };
}

function scoreFromData(data: AssembledReportData): NarrativeFactPack['assessment'] {
  return {
    reference: data.assessmentReference,
    generatedAt: data.generatedAt,
    score: data.scoreRun.overallScore,
    maturity: data.scoreRun.finalMaturity,
    calculatedMaturity: data.scoreRun.calculatedMaturity,
    exposureScore: data.scoreRun.exposureScore,
    exposureBand: data.scoreRun.exposureBand,
    coveragePct: data.scoreRun.coveragePct,
    uncertaintyRatePct: data.scoreRun.nARatePct,
    criticalGapCount: data.scoreRun.criticalGapCount,
    majorGapCount: data.scoreRun.majorGapCount,
    uncertaintyFacts: [data.scoreRun.capReason, data.adaptiveScope?.scoreComparabilityStatement, ...(data.scoreRun.adaptiveMetrics?.limitationReasons ?? [])].map((value) => text(value)).filter(Boolean)
  };
}

export function buildEssentialNarrativeFactPack(data: AssembledReportData, evidenceModel: AdvisoryEvidenceModel, projection: EssentialProjection): NarrativeFactPack {
  const selectedFindings = projection.findings;
  const selectedFindingIds = new Set(selectedFindings.map((finding) => finding.id));
  return buildPack({
    tier: 'essential', data, organisationName: data.organisationName, assessmentReference: data.assessmentReference, generatedAt: data.generatedAt,
    score: scoreFromData(data), domainData: data.domainResults, evidenceModel,
    narrativeMode: evidenceModel.narrativeMode ?? 'REMEDIATION',
    sustainmentPriorities: evidenceModel.sustainmentPriorities ?? [],
    selectedFindings,
    selectedRisks: evidenceModel.riskRegister,
    selectedScenarios: evidenceModel.scenarios,
    selectedControls: selectThemeCoveredControls(evidenceModel.controlImprovements.filter((control) => selectedFindingIds.has(control.linkedFindingId)), selectedFindings, 6),
    selectedDecisions: projection.leadershipDecisions, selectedRoadmap: selectRoadmapActions(projection.roadmapActions, 6),
    proofOverride: projection.evidenceToObtain.map((item, index) => ({ factRef: `PROOF-${String(index + 1).padStart(3, '0')}`, sourceId: item.id, linkedFindingRefs: item.linkedFindingIds, requirement: text(item.artefact), owner: text(item.likelyOwner), whyItMatters: text(item.provesWhat), expectedRecency: text(item.expectedRecency), requiredPopulation: text(item.requiredPopulation), acceptableExamples: list(item.minimumAcceptableCharacteristics) }))
  });
}

export function buildComprehensiveNarrativeFactPack(model: ComprehensiveDeliveryModel): NarrativeFactPack {
  const data = model.analytical.assembled;
  const score: NarrativeFactPack['assessment'] = {
    reference: text(model.analytical.assessmentReference, 'Recorded assessment'),
    generatedAt: text(model.analytical.generatedAt, new Date(0).toISOString()),
    score: model.analytical.score.overallScore,
    maturity: model.analytical.score.finalMaturity,
    calculatedMaturity: model.analytical.score.calculatedMaturity,
    exposureScore: model.analytical.score.exposureScore,
    exposureBand: model.analytical.score.exposureBand,
    coveragePct: model.analytical.score.coveragePct,
    uncertaintyRatePct: model.analytical.score.nARatePct,
    criticalGapCount: model.analytical.score.criticalGapCount,
    majorGapCount: model.analytical.score.majorGapCount,
    uncertaintyFacts: [model.analytical.score.capReason, data?.adaptiveScope?.scoreComparabilityStatement, ...(data?.scoreRun.adaptiveMetrics?.limitationReasons ?? [])].map((value) => text(value)).filter(Boolean)
  };
  const selectedFindings = selectNarrativeFindings(model.findings, 8);
  const selectedFindingIds = new Set(selectedFindings.map((finding) => finding.id));
  const selectedRisks = model.riskRegister.filter((risk) => risk.linkedFindingIds.some((id) => selectedFindingIds.has(id)));
  const selectedControls = selectThemeCoveredControls(model.controlImprovements.filter((control) => selectedFindingIds.has(control.linkedFindingId)), selectedFindings, 6);
  const decisionSelection = selectThemeSpecificDecisions(model.leadershipDecisions.filter((decision) => decision.linkedFindingIds.some((id) => selectedFindingIds.has(id))), selectedFindings, 5);
  const selectedDecisions = decisionSelection.decisions;
  const selectedRoadmap = selectRoadmapActions(model.roadmapActions.filter((action) => selectedFindingIds.has(action.linkedFindingId)), 12);
  return buildPack({
    tier: 'comprehensive', data, organisationName: model.analytical.organisationName, assessmentReference: model.analytical.assessmentReference, generatedAt: model.analytical.generatedAt,
    score, domainData: data?.domainResults, evidenceModel: model.analytical.evidenceModel,
    narrativeMode: model.analytical.evidenceModel.narrativeMode ?? 'REMEDIATION',
    sustainmentPriorities: model.analytical.evidenceModel.sustainmentPriorities ?? [],
    selectedFindings, selectedRisks, selectedScenarios: model.scenarios,
    selectedControls, selectedDecisions, selectedRoadmap, decisionSemanticFamilyOverrides: decisionSelection.semanticFamilyOverrides,
    proofOverride: model.proofRequirements.map((item, index) => ({ factRef: `PROOF-${String(index + 1).padStart(3, '0')}`, sourceId: item.proofRef, linkedFindingRefs: item.linkedFindingIds, requirement: item.requirement, owner: item.proofOwner, whyItMatters: item.whyItMatters, expectedRecency: item.expectedRecency, requiredPopulation: item.requiredPopulation, acceptableExamples: item.acceptableExamples }))
  });
}

export function assertNarrativeFactPack(pack: NarrativeFactPack): void {
  if (pack.bibleVersion !== '1.1') throw new Error(`Narrative Fact Pack requires Reporting Bible 1.1, received ${pack.bibleVersion}.`);
  if (pack.facts.length === 0) throw new Error('Narrative Fact Pack is empty.');
  const ids = pack.facts.map((fact) => fact.id);
  if (new Set(ids).size !== ids.length) throw new Error('Narrative Fact Pack contains duplicate stable fact IDs.');
  for (const fact of pack.facts) if (!fact.id || !fact.kind || fact.value === undefined) throw new Error(`Narrative Fact Pack fact ${fact.id || '<missing>'} is incomplete.`);
  const operatingContextFacts = pack.organisation.operatingContext;
  for (const fact of operatingContextFacts) {
    if (!fact.key || !fact.value || !fact.sourceGatewayCode || !fact.sourceQuestionId || !fact.sourcePrompt || !fact.sourceOptionId || !fact.sourceOptionLabel || !fact.graphVersion || !fact.provenance || !fact.customerNarrativeAllowed) {
      throw new Error(`Narrative operating-context fact ${fact.key || '<missing>'} is missing provenance.`);
    }
    if (fact.sourceOptionId !== fact.value) throw new Error(`Narrative operating-context fact ${fact.key} lost its recorded option identity.`);
    if (!pack.facts.some((candidate) => candidate.id === `OPERATING-CONTEXT-${fact.key}` && JSON.stringify(candidate.value) === JSON.stringify(fact))) {
      throw new Error(`Narrative operating-context fact ${fact.key} is not present in the canonical Fact Pack facts.`);
    }
  }
  const expectedSectorFacts = operatingContextFacts.filter((fact) => fact.customerNarrativeAllowed).map(describeOperatingContextFact).filter(Boolean);
  if (JSON.stringify(pack.organisation.sectorFacts) !== JSON.stringify(expectedSectorFacts)) throw new Error('Narrative sectorFacts projection is not derived from operatingContext.');
  if (pack.narrativeMode === 'SUSTAINMENT') {
    if (pack.sustainmentPriorities.length === 0) throw new Error('Sustainment Fact Pack requires at least one sustainment priority.');
    if (pack.findings.length !== 0 || pack.risks.length !== 0 || pack.scenarios.length !== 0 || pack.systemicThemeInputs.length !== 0) throw new Error('Sustainment Fact Pack must separate priorities from findings, risks, scenarios and themes.');
    if (pack.controls.length === 0 || pack.decisions.length === 0 || pack.roadmap.length === 0) throw new Error('Sustainment Fact Pack requires control, decision and roadmap objects.');
    if (pack.controls.some((control) => control.linkedFindingRefs.length > 0 || control.linkedSustainmentPriorityRefs.length === 0)) throw new Error('Sustainment controls must link only to sustainment priorities.');
    if (pack.decisions.some((decision) => decision.linkedFindingRefs.length > 0 || decision.linkedSustainmentPriorityRefs.length === 0)) throw new Error('Sustainment decisions must link only to sustainment priorities.');
    if (pack.roadmap.some((item) => item.sourceFindingRef || !item.sourceSustainmentPriorityRef)) throw new Error('Sustainment roadmap must link only to sustainment priorities.');
    const sustainmentText = JSON.stringify({ priorities: pack.sustainmentPriorities, controls: pack.controls, decisions: pack.decisions, roadmap: pack.roadmap, maturation: pack.maturationSteps });
    if (/material (?:control )?(?:weakness|gap)|priority weakness|control failure|remediation required|urgent remediation|foundational failure|close (?:the )?weakness|implement (?:the )?missing control|validate that|independently validate|before relying on self-assessment|self-reported claims remain unverified/i.test(sustainmentText)) throw new Error('Sustainment Fact Pack contains weakness or automated evidence-validation language.');
    if (pack.productTier === 'essential' && pack.maturationSteps.length !== 0) throw new Error('Essential Sustainment Fact Pack must not contain twelve-month maturation steps.');
    if (pack.productTier === 'comprehensive' && pack.maturationSteps.length !== pack.controls.length * 2) throw new Error('Comprehensive Sustainment Fact Pack must contain two maturation steps per sustainment control.');
    if (pack.productTier === 'comprehensive') {
      if (!pack.questionSignals?.length || new Set(pack.questionSignals.map((signal) => signal.factRef)).size !== pack.questionSignals.length) {
        throw new Error('Comprehensive Sustainment Fact Pack must retain unique question-level evidence signals.');
      }
      if (pack.questionSignals.some((signal) => !signal.questionCode || !signal.domainCode || !signal.responseLabel || !signal.responseOperationalMeaning || !signal.sourceRefs.includes(signal.questionCode) || !pack.facts.some((fact) => fact.id === signal.factRef && fact.kind === 'question_signal'))) {
        throw new Error('Comprehensive Sustainment question-level evidence signal is incomplete or not canonicalised.');
      }
      if (!pack.enterpriseIntegrationMap || !pack.assuranceCoverage || !pack.assurancePriorities || !pack.resilienceTests || !pack.contextApplications || !pack.controlOutcomeLinks || !pack.roadmapDependencyLinks || !pack.exposurePathways || !pack.criticalReliances) {
        throw new Error('Comprehensive Sustainment Fact Pack is missing a premium deterministic projection.');
      }
      assertComprehensivePremiumProjection(pack);
    }
    return;
  }
  if (pack.findings.some((finding) => !finding.primarySemanticFamily || !Array.isArray(finding.fraudPathwayFamilies))) throw new Error('Narrative Fact Pack finding is missing explicit semantic family membership.');
  const themeAnchors: Record<string, PrimarySemanticFamily[]> = {
    FRAUD_GOVERNANCE_AND_RISK_DISCIPLINE: ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT'],
    SUPPLIER_PAYMENT_INTEGRITY: ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'THIRD_PARTY_OVERSIGHT'],
    IDENTITY_ACCESS_GOVERNANCE: ['ORDINARY_ACCESS', 'PRIVILEGED_ACCESS'],
    IDENTITY_VERIFICATION_SENSITIVE_CHANGE: ['IDENTITY_VERIFICATION'],
    DETECTION_MONITORING: ['DETECTION_MONITORING'],
    INCIDENT_RESPONSE_EVIDENCE_INTEGRITY: ['INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING'],
    OPERATIONAL_VALUE_CUSTODY: ['PAYROLL_INTEGRITY', 'CASH_CUSTODY', 'STOCK_ASSET_CUSTODY']
  };
  if (pack.systemicThemeInputs.some((theme) => !(themeAnchors[theme.themeFamily] ?? []).some((family) => theme.semanticFamilies.includes(family)))) throw new Error('Narrative theme is not compatible with its explicit semantic-family anchor.');
  for (let index = 0; index < pack.systemicThemeInputs.length; index += 1) {
    for (const other of pack.systemicThemeInputs.slice(index + 1)) {
      const left = new Set(pack.systemicThemeInputs[index]!.findingRefs);
      const right = new Set(other.findingRefs);
      const intersection = [...left].filter((ref) => right.has(ref)).length;
      const union = new Set([...left, ...right]).size;
      if (union > 0 && intersection / union > 0.75) throw new Error('Narrative themes contain unjustifiably overlapping finding sets.');
    }
  }
  if (new Set(pack.systemicThemeInputs.map((theme) => theme.managementQuestion)).size !== pack.systemicThemeInputs.length) throw new Error('Narrative themes must answer distinct management questions.');
  if (pack.roadmap.some((item) => !item.sourceFindingRef || !pack.findings.some((finding) => finding.factRef === item.sourceFindingRef && finding.primarySemanticFamily === item.primarySemanticFamily))) throw new Error('Narrative roadmap source is incompatible with its semantic family.');
  if (pack.scenarios.some((scenario) => !pack.findings.filter((finding) => scenario.linkedFindingRefs.includes(finding.factRef)).some((finding) => finding.fraudPathwayFamilies.includes(scenario.scenarioFamily)))) throw new Error('Narrative scenario pathway is not supported by its linked finding family.');
  for (const scenario of pack.scenarios) assertScenario(scenario);
  const sparseHighReadiness = Boolean(pack.highReadinessSparseNarrativeReason);
  const themeRange = sparseHighReadiness ? [1, 5] : [3, 5];
  if (pack.findings.length >= 6 && (pack.systemicThemeInputs.length < themeRange[0] || pack.systemicThemeInputs.length > themeRange[1])) throw new Error(`${pack.productTier} Fact Pack requires 3-5 systemic themes when the finding set has sufficient variation.`);
  if (pack.findings.length < 6 && pack.systemicThemeInputs.length < themeRange[0]) throw new Error(`${pack.productTier} Fact Pack requires at least one legitimate systemic theme when material findings are sparse.`);
  if (pack.systemicThemeInputs.some((theme) => theme.findingRefs.length === 0 || theme.riskRefs.length === 0 || !theme.whyTogether)) throw new Error('Narrative theme is missing finding, risk or relationship basis.');
  const covered = new Set(pack.systemicThemeInputs.flatMap((theme) => theme.findingRefs));
  for (const finding of pack.findings) if (!covered.has(finding.factRef) && !pack.standaloneFindingReasons[finding.factRef]) throw new Error(`Priority finding ${finding.factRef} is orphaned from themes and has no standalone reason.`);
  const scenarioRange = pack.productTier === 'essential' ? (sparseHighReadiness ? [0, 3] : [2, 3]) : sparseHighReadiness ? [0, 4] : [2, 4];
  if (pack.scenarios.length < scenarioRange[0] || pack.scenarios.length > scenarioRange[1]) throw new Error(`${pack.productTier} Fact Pack requires ${scenarioRange[0]}-${scenarioRange[1]} real fraud pathway scenarios.`);
  if (pack.productTier === 'essential' && pack.maturationSteps.length !== 0) throw new Error('Essential Fact Pack must not contain twelve-month maturation steps.');
  if (pack.productTier === 'comprehensive' && pack.maturationSteps.some((step) => !step.linkedFindingRef || !step.linkedControlRef || !step.accountableExecutive || !step.processOwner || !step.dependency || !step.successMeasure || !step.proofOfProgress)) throw new Error('Comprehensive maturation step is missing a required management object.');
  const forbidden = /evidence validation|independent evidence review|self-reported claims remain unverified|approve a fixed governance cadence/i;
  if (pack.decisions.some((decision) => forbidden.test([decision.question, decision.recommendedRoute, decision.rationale, decision.consequenceOfDelay].join(' ')))) throw new Error('Fact Pack contains an evidence-validation decision or claim.');
  if (pack.roadmap.some((item) => /apply immediate escalation|deliver the exact control design|independently validate/i.test([item.managementOutcome, item.priorityWork, item.proofOfCompletion, item.failureTrigger].join(' ')))) throw new Error('Fact Pack contains legacy or assurance-validation roadmap language.');
  if (pack.roadmap.some((item) => !item.managementOutcome || !item.priorityWork || !item.accountableExecutive || !item.processOwner || !item.targetPeriod || !item.proofOfCompletion || !item.successMeasure || !item.failureTrigger)) throw new Error('Roadmap fact is missing a required management-object field.');
  if (pack.decisions.some((decision) => new Set(decision.options.map((option) => option.option)).size !== decision.options.length)) throw new Error('Decision options contain duplicates.');
}

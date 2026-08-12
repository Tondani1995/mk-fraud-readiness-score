import type { AssembledReportData } from '../types';
import type { EssentialProjection } from '../essential-projection';
import type { AdvisoryEvidenceModel, ControlImprovementEntry, LeadershipDecision, MaterialFinding, PlausibleScenario, RiskRegisterEntry, RoadmapAction } from '../evidence-model/types';
import type { ComprehensiveDeliveryModel } from '../comprehensive/types';
import { buildDecisionOptionSets } from '../comprehensive/decision-options';
import { REPORTING_BIBLE_VERSION } from '../reporting-bible';

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
  title: string;
  findingRefs: string[];
  domainCodes: string[];
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
  event: string;
  priority: string;
  likelihood: string;
  impact: string;
  linkedFindingRefs: string[];
  approvedTreatment: string;
  owner: string;
  targetPeriod: string;
}

export interface NarrativeScenarioFact {
  factRef: string;
  sourceId: string;
  scenarioFamily: 'supplier_payment_diversion' | 'privileged_access_misuse' | 'detection_evasion' | 'identity_impersonation' | 'incident_concealment';
  title: string;
  actorClass: string;
  opportunity: string;
  entryPoint: string;
  mechanism: string;
  controlWeakness: string;
  concealment: string;
  consequence: string;
  warningIndicators: string[];
  immediateContainment: string;
  longTermResponse: string;
  linkedFindingRefs: string[];
  linkedRiskRefs: string[];
}

export interface NarrativeControlFact {
  factRef: string;
  sourceId: string;
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
}

export interface NarrativeDecisionFact {
  factRef: string;
  sourceId: string;
  decisionFamily: string;
  question: string;
  options: Array<{ option: string; cost: string; benefit: string; tradeOff: string }>;
  recommendedRoute: string;
  rationale: string;
  owner: string;
  targetDate: string;
  consequenceOfDelay: string;
  linkedFindingRefs: string[];
}

export interface NarrativeRoadmapFact {
  factRef: string;
  sourceId: string;
  phase: 'STABILISE' | 'ESTABLISH' | 'EMBED' | 'MATURE';
  managementOutcome: string;
  priorityWork: string;
  accountableExecutive: string;
  processOwner: string;
  targetPeriod: string;
  dependencies: string[];
  proofOfCompletion: string;
  successMeasure: string;
  failureTrigger: string;
}

export interface NarrativeBounds {
  themeCount: number;
  findingCount: number;
  scenarioCount: number;
  controlCount: number;
  decisionCount: number;
  managementResponseCount: number;
}

export interface NarrativeProofFact {
  factRef: string;
  sourceId: string;
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
  organisation: { name: string; sectorFacts: string[] };
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
  risks: NarrativeRiskFact[];
  scenarios: NarrativeScenarioFact[];
  controls: NarrativeControlFact[];
  decisions: NarrativeDecisionFact[];
  roadmap: NarrativeRoadmapFact[];
  proofOfProgress: NarrativeProofFact[];
  prohibitedClaims: string[];
  narrativeBounds: NarrativeBounds;
  facts: NarrativeFact[];
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
    .replace(/The potential financial, operational, legal and reputational consequence is set out in the linked impact fields below, and applies only if independent validation identifies a defect\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function phaseFor(action: RoadmapAction, index: number, total: number, tier: NarrativeProductTier): NarrativeRoadmapFact['phase'] {
  if (tier === 'essential') {
    if (action.period === '30 days') return 'STABILISE';
    return 'ESTABLISH';
  }
  const ratio = index / Math.max(total - 1, 1);
  if (ratio < 0.2) return 'STABILISE';
  if (ratio < 0.5) return 'ESTABLISH';
  if (ratio < 0.8) return 'EMBED';
  return 'MATURE';
}

function roadmapWindowFor(action: RoadmapAction, index: number, total: number, tier: NarrativeProductTier): string {
  if (tier === 'essential') return action.period;
  const phase = phaseFor(action, index, total, tier);
  return phase === 'STABILISE' ? '0-30 days' : phase === 'ESTABLISH' ? '31-90 days' : phase === 'EMBED' ? 'months 4-6' : 'months 7-12';
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
  access_abuse: { actorClass: 'An internal actor using access beyond approved role requirements', opportunity: 'Access rights and exception review are not yet sufficiently aligned to current role requirements.', entryPoint: 'A user entitlement is exercised outside the approved role matrix without independent review.', mechanism: 'An actor uses excess access to initiate, change or approve a value-bearing activity beyond the role’s intended authority.' }
};

const SCENARIO_TYPE_ALIASES: Record<string, string> = {
  'privileged-access': 'privileged_access_exploitation',
  'privileged_access': 'privileged_access_exploitation',
  'detection-evasion': 'transaction_anomaly',
  detection_evasion: 'transaction_anomaly',
  culture: 'governance_accountability_failure'
};

type FraudPathwayFamily = NarrativeScenarioFact['scenarioFamily'];

interface FraudPathwayRule {
  family: FraudPathwayFamily;
  title: string;
  whyTogether: string;
  keywords: string[];
  scenarioTypes: string[];
  domainCodes: string[];
  language: ScenarioFamilyLanguage;
}

const FRAUD_PATHWAY_RULES: FraudPathwayRule[] = [
  {
    family: 'supplier_payment_diversion',
    title: 'Supplier and payment integrity',
    whyTogether: 'These findings connect supplier identity, onboarding and payment-instruction controls to the point at which value can be redirected.',
    keywords: ['supplier', 'vendor', 'payment', 'bank', 'invoice', 'third-party', 'third party', 'onboarding', 'ownership'],
    scenarioTypes: ['supplier_onboarding_fraud', 'supplier_payment_redirection'], domainCodes: ['D3', 'D7', 'D8'],
    language: SCENARIO_FAMILY_LANGUAGE.supplier_payment_redirection
  },
  {
    family: 'privileged_access_misuse',
    title: 'Identity and access governance',
    whyTogether: 'These findings connect excessive or insufficiently reviewed access to the ability to alter value-bearing records, entitlements or audit trails.',
    keywords: ['privileged', 'administrator', 'admin', 'access', 'entitlement', 'role', 'recertif', 'system', 'log'],
    scenarioTypes: ['privileged_access_exploitation', 'access_abuse'], domainCodes: ['D8', 'D3'],
    language: SCENARIO_FAMILY_LANGUAGE.privileged_access_exploitation
  },
  {
    family: 'detection_evasion',
    title: 'Monitoring, escalation and detection coverage',
    whyTogether: 'These findings connect monitoring coverage, exception review and escalation authority to the risk that unusual activity remains below timely challenge.',
    keywords: ['monitor', 'alert', 'exception', 'anomal', 'red flag', 'detect', 'threshold', 'review', 'escalat', 'activity'],
    scenarioTypes: ['transaction_anomaly', 'suppressed_reporting', 'incident_response_breakdown'], domainCodes: ['D4'],
    language: SCENARIO_FAMILY_LANGUAGE.transaction_anomaly
  },
  {
    family: 'identity_impersonation',
    title: 'Identity verification and sensitive-change discipline',
    whyTogether: 'These findings connect identity verification, authentication evidence and profile-change monitoring to the risk of misuse under a legitimate identity.',
    keywords: ['identity', 'impersonat', 'account takeover', 'credential', 'authentication', 'profile', 'verification', 'counterparty', 'customer', 'employee'],
    scenarioTypes: ['identity_misuse', 'account_takeover'], domainCodes: ['D8'],
    language: SCENARIO_FAMILY_LANGUAGE.identity_misuse
  },
  {
    family: 'incident_concealment',
    title: 'Incident response and evidence integrity',
    whyTogether: 'These findings connect reporting, evidence preservation and incident escalation to the organisation’s ability to contain a matter and prevent repeat exposure.',
    keywords: ['evidence', 'preserv', 'custody', 'incident', 'report', 'investigat', 'contain', 'disciplin', 'suspected'],
    scenarioTypes: ['evidence_compromise', 'incident_response_breakdown', 'suppressed_reporting'], domainCodes: ['D5', 'D10'],
    language: SCENARIO_FAMILY_LANGUAGE.evidence_compromise
  }
];

function searchableFinding(finding: MaterialFinding): string {
  return [finding.title, finding.questionPrompt, finding.diagnosis, finding.whyItMatters, finding.fraudMechanism, finding.recommendedControl, ...finding.linkedScenarioTypes].join(' ').toLowerCase();
}

function pathwayScore(rule: FraudPathwayRule, finding: MaterialFinding): number {
  const haystack = searchableFinding(finding);
  const keywordHits = rule.keywords.filter((keyword) => haystack.includes(keyword)).length;
  const typeHit = finding.linkedScenarioTypes.some((type) => rule.scenarioTypes.includes(SCENARIO_TYPE_ALIASES[type] ?? type.replaceAll('-', '_')));
  const domainHit = rule.domainCodes.includes(finding.domainCode) ? 2 : 0;
  return keywordHits + (typeHit ? 4 : 0) + domainHit;
}

function pathwayMembers(rule: FraudPathwayRule, findings: MaterialFinding[]): MaterialFinding[] {
  return findings.filter((finding) => pathwayScore(rule, finding) >= 3);
}

function ruleForScenario(scenario: PlausibleScenario, findings: MaterialFinding[]): FraudPathwayRule | null {
  const linked = findings.filter((finding) => scenario.linkedFindingIds.includes(finding.id));
  return FRAUD_PATHWAY_RULES
    .map((rule) => ({ rule, score: linked.reduce((total, finding) => total + pathwayScore(rule, finding), 0) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.rule.family.localeCompare(right.rule.family))[0]?.rule ?? null;
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
  return findings.map((finding, index) => ({
    factRef: `FINDING-${String(index + 1).padStart(3, '0')}`,
    sourceId: finding.id,
    title: text(finding.title, finding.domainName),
    domain: finding.domainName,
    questionCode: finding.questionCode,
    recordedPosition: cleanFactLanguage(finding.responseOperationalMeaning, finding.responseLabel),
    deterministicCondition: `${text(finding.responseLabel, 'Recorded response')}: ${cleanFactLanguage(finding.responseOperationalMeaning, finding.responseMeaning)}`,
    interpretation: cleanFactLanguage(finding.diagnosis, finding.fraudMechanism),
    advisoryMeaningBasis: `The recorded ${text(finding.materialityClass, 'priority')} concerns ${text(finding.questionPrompt, finding.title).replace(/\.$/, '')} and connects to the linked fraud pathway and control response.`,
    whyItMatters: `The condition matters because ${cleanFactLanguage(finding.fraudMechanism, finding.whyItMatters).replace(/^[A-Z]/, (letter) => letter.toLowerCase())}`,
    materialityReason: `${text(finding.materialityClass)} selected at deterministic priority ${finding.materialityScore}.`,
    assuranceBoundary: 'This is a deterministic interpretation of the recorded self-assessment; it does not establish operating effectiveness.',
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

function buildRiskFacts(risks: RiskRegisterEntry[], findingRefs: Map<string, string>): NarrativeRiskFact[] {
  return risks.map((risk, index) => ({
    factRef: `RISK-${String(index + 1).padStart(3, '0')}`,
    sourceId: risk.id,
    title: cleanFactLanguage(risk.title).replace(/control resilience validation/gi, 'control resilience risk'),
    statement: cleanFactLanguage(risk.riskStatement, `${text(risk.cause)} ${text(risk.riskEvent)}`),
    cause: cleanFactLanguage(risk.cause),
    event: cleanFactLanguage(risk.riskEvent),
    priority: text(risk.priority),
    likelihood: text(risk.likelihood),
    impact: text(risk.impact),
    linkedFindingRefs: risk.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    approvedTreatment: text(risk.requiredTreatment),
    owner: text(risk.accountableExecutive),
    targetPeriod: text(risk.targetPeriod)
  }));
}

function qualitativeConsequence(family: FraudPathwayFamily, findings: MaterialFinding[]): string {
  const financial = unique(findings.map((finding) => finding.likelyFinancialImpact).filter((value) => value && !/requires case-specific validation/i.test(value)));
  const operational = unique(findings.map((finding) => finding.likelyOperationalImpact).filter((value) => value && !/requires case-specific validation/i.test(value)));
  const base: Record<FraudPathwayFamily, string> = {
    supplier_payment_diversion: 'A diverted payment or fictitious supplier relationship can create financial loss and delayed recovery.',
    privileged_access_misuse: 'Unauthorised changes to a value-bearing record, entitlement or audit trail can create loss and weaken investigation.',
    detection_evasion: 'Delayed detection allows suspicious activity or losses to continue and exceptions to accumulate.',
    identity_impersonation: 'Unauthorised access, payment, benefit or profile change can occur before the identity or transaction is challenged.',
    incident_concealment: 'Weak reporting, containment or evidence integrity can delay recovery and allow repeat exposure to remain unidentified.'
  };
  return unique([base[family], ...financial.slice(0, 1), ...operational.slice(0, 1)]).join(' ');
}

function fallbackWarnings(family: FraudPathwayFamily): string[] {
  return {
    supplier_payment_diversion: ['New or reactivated supplier before independent verification', 'Bank-detail change shortly before payment', 'Urgent payment request that bypasses the normal callback route'],
    privileged_access_misuse: ['Emergency or administrator access outside the role pattern', 'Unusual record or entitlement change', 'Access review exception remains overdue'],
    detection_evasion: ['Repeated low-value or threshold-adjacent activity', 'Alert or exception backlog grows without assigned owner', 'Monitoring rule is not updated after a material process change'],
    identity_impersonation: ['Credential reset, device change or profile amendment', 'Identity data differs across trusted records', 'Sensitive transaction follows a new or unusual session'],
    incident_concealment: ['Concern is reported through a channel controlled by the implicated process', 'Relevant records are unavailable or custody is unclear', 'Severity or containment decision remains overdue']
  }[family];
}

function synthesizeScenario(rule: FraudPathwayRule, source: PlausibleScenario | undefined, members: MaterialFinding[], findingRefs: Map<string, string>, riskRefs: Map<string, string>, risks: RiskRegisterEntry[], index: number): NarrativeScenarioFact {
  const linkedFindingIds = members.map((finding) => finding.id);
  const linkedRisks = risks.filter((risk) => risk.linkedFindingIds.some((id) => linkedFindingIds.includes(id)));
  const title: Record<FraudPathwayFamily, string> = {
    supplier_payment_diversion: 'Supplier or payment instruction is diverted through a compromised or fictitious relationship',
    privileged_access_misuse: 'Privileged access is used to alter a value-bearing record, entitlement or audit trail',
    detection_evasion: 'Unusual activity avoids timely challenge because monitoring or escalation coverage is incomplete',
    identity_impersonation: 'A compromised or impersonated identity is used to change a sensitive profile, instruction or transaction',
    incident_concealment: 'Records or reporting are weakened after a suspected fraud matter, allowing exposure to repeat'
  };
  const fallbackContainment: Record<FraudPathwayFamily, string> = {
    supplier_payment_diversion: 'Pause the affected supplier or payment instruction, independently confirm the trusted beneficiary details and preserve the approval trail.',
    privileged_access_misuse: 'Suspend or restrict the affected entitlement, preserve access and audit logs, and route the change for accountable review.',
    detection_evasion: 'Assign and triage the affected alerts or exceptions, preserve the relevant activity record and escalate overdue items.',
    identity_impersonation: 'Pause the sensitive change or transaction, re-perform identity verification through a trusted route and preserve authentication records.',
    incident_concealment: 'Open an incident record, preserve relevant records under controlled custody and assign a named containment and investigation owner.'
  };
  const fallbackLongTerm: Record<FraudPathwayFamily, string> = {
    supplier_payment_diversion: 'Implement independent supplier and bank-detail verification, dual approval and complete population monitoring.',
    privileged_access_misuse: 'Implement role-based access, privileged-session logging, periodic recertification and exception escalation.',
    detection_evasion: 'Define monitoring coverage, red flags, review ownership, closure evidence and threshold-change governance.',
    identity_impersonation: 'Implement risk-based identity verification, profile-change controls, authentication evidence and takeover investigation.',
    incident_concealment: 'Implement protected reporting, severity-based escalation, evidence preservation and repeat-exposure review.'
  };
  const sourceWarnings = source?.earlyWarningIndicators.filter(Boolean) ?? [];
  return {
    factRef: `SCENARIO-${String(index + 1).padStart(3, '0')}`,
    sourceId: source?.id ?? `SYNTH-${rule.family.toUpperCase()}`,
    scenarioFamily: rule.family,
    title: title[rule.family],
    actorClass: rule.language.actorClass,
    opportunity: rule.language.opportunity,
    entryPoint: rule.language.entryPoint,
    mechanism: rule.language.mechanism,
    controlWeakness: unique(members.map((finding) => finding.recommendedControl)).join('; '),
    concealment: text(source?.concealmentMechanism, rule.family === 'incident_concealment' ? 'A delayed report, incomplete record or unclear custody trail makes the matter harder to reconstruct and contain.' : 'An actor relies on ordinary-looking activity, weak exception review or incomplete audit records to avoid timely challenge.'),
    consequence: qualitativeConsequence(rule.family, members),
    warningIndicators: unique([...sourceWarnings, ...fallbackWarnings(rule.family)]).slice(0, 5),
    immediateContainment: text(source?.immediateContainment, fallbackContainment[rule.family]),
    longTermResponse: text(source?.longerTermResponse, fallbackLongTerm[rule.family]),
    linkedFindingRefs: linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    linkedRiskRefs: linkedRisks.map((risk) => riskRefs.get(risk.id) ?? '').filter(Boolean)
  };
}

function buildScenarioFacts(scenarios: PlausibleScenario[], findings: MaterialFinding[], risks: RiskRegisterEntry[], findingRefs: Map<string, string>, riskRefs: Map<string, string>, tier: NarrativeProductTier): NarrativeScenarioFact[] {
  const candidates = FRAUD_PATHWAY_RULES.map((rule) => ({ rule, members: pathwayMembers(rule, findings) }))
    .filter((item) => item.members.length > 0)
    .sort((left, right) => {
      const leftScore = left.members.reduce((sum, finding) => sum + pathwayScore(left.rule, finding), 0);
      const rightScore = right.members.reduce((sum, finding) => sum + pathwayScore(right.rule, finding), 0);
      return rightScore - leftScore || left.rule.family.localeCompare(right.rule.family);
    });
  const limit = tier === 'essential' ? 3 : 4;
  const selected = candidates.slice(0, limit);
  const result = selected.map(({ rule, members }, index) => {
    const source = scenarios.find((scenario) => ruleForScenario(scenario, findings)?.family === rule.family && scenario.linkedFindingIds.some((id) => members.some((finding) => finding.id === id)));
    return synthesizeScenario(rule, source, members, findingRefs, riskRefs, risks, index);
  });
  result.forEach(assertScenario);
  return result;
}

function buildControlFacts(controls: ControlImprovementEntry[], findingRefs: Map<string, string>): NarrativeControlFact[] {
  return controls.map((control, index) => ({
    factRef: `CONTROL-${String(index + 1).padStart(3, '0')}`,
    sourceId: control.id,
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
    linkedFindingRefs: [findingRefs.get(control.linkedFindingId) ?? ''].filter(Boolean)
  }));
}

function buildDecisionFacts(decisions: LeadershipDecision[], findingRefs: Map<string, string>): NarrativeDecisionFact[] {
  const options = buildDecisionOptionSets(decisions);
  return decisions.map((decision, index) => {
    const optionSet = options[index];
    return {
      factRef: `DECISION-${String(index + 1).padStart(3, '0')}`,
      sourceId: decision.id,
      decisionFamily: decision.decisionCategory,
      question: text(decision.decisionRequired),
      options: optionSet?.optionDetails.map((option) => ({ option: option.option, cost: option.cost, benefit: option.benefit, tradeOff: option.tradeOff })) ?? [],
      recommendedRoute: text(optionSet?.deterministicRecommendation, decision.recommendedDecision),
      rationale: text(optionSet?.recommendationRationale, decision.whyNow),
      owner: text(optionSet?.owner, decision.accountableExecutive),
      targetDate: text(optionSet?.targetDate, decision.deadline),
      consequenceOfDelay: text(decision.consequenceOfDelay),
      linkedFindingRefs: decision.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean)
    };
  });
}

function buildThemeFacts(contradictions: AdvisoryEvidenceModel['contradictions'], findings: MaterialFinding[], risks: RiskRegisterEntry[], scenarios: NarrativeScenarioFact[], findingRefs: Map<string, string>, riskRefs: Map<string, string>): NarrativeThemeFact[] {
  const themes = FRAUD_PATHWAY_RULES.map((rule) => ({ rule, members: pathwayMembers(rule, findings) }))
    .filter((item) => item.members.length > 0)
    .sort((left, right) => left.rule.family.localeCompare(right.rule.family))
    .slice(0, 5)
    .map(({ rule, members }, index) => {
      const memberIds = new Set(members.map((member) => member.id));
      const linkedRisks = risks.filter((risk) => risk.linkedFindingIds.some((id) => memberIds.has(id)));
      const linkedScenarios = scenarios.filter((scenario) => scenario.linkedFindingRefs.some((ref) => members.some((member) => findingRefs.get(member.id) === ref)));
      const contradiction = contradictions.find((item) => item.linkedFindingIds.some((id) => memberIds.has(id)));
      return {
        factRef: `THEME-${String(index + 1).padStart(3, '0')}`,
        title: rule.title,
        findingRefs: members.map((member) => findingRefs.get(member.id) ?? '').filter(Boolean),
        domainCodes: [...new Set(members.map((member) => member.domainCode))].sort(),
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
  const haystack = searchableFinding(finding);
  if (/supplier|vendor|payment|bank|invoice|third-party|third party/.test(haystack)) return 'Supplier and payment integrity controls are owned, independently checked and monitored across the complete payable population.';
  if (/privileged|administrator|access|entitlement|role|recertif/.test(haystack)) return 'Access rights and privileged activity are restricted, recertified and escalated when exceptions remain open.';
  if (/monitor|alert|exception|anomal|red flag|detect/.test(haystack)) return 'Fraud monitoring and exception review operate with defined coverage, ownership, closure evidence and escalation.';
  if (/identity|impersonat|account takeover|credential|profile|verification/.test(haystack)) return 'Identity and sensitive-profile changes are verified through a trusted route and retained for investigation.';
  if (/evidence|preserv|custody|incident|report|investigat/.test(haystack)) return 'Suspected-fraud reporting, containment and evidence custody operate through a defined incident route.';
  return 'The priority fraud-risk condition has an accountable owner, defined treatment and a repeatable review cycle.';
}

function roadmapWorkFor(finding: MaterialFinding): string {
  const haystack = searchableFinding(finding);
  if (/supplier|vendor|payment|bank|invoice|third-party|third party/.test(haystack)) return 'Implement supplier onboarding, beneficiary verification and dual approval for payment-instruction changes.';
  if (/privileged|administrator|access|entitlement|role|recertif/.test(haystack)) return 'Reconcile the complete access population, remove excess privilege and retain periodic recertification evidence.';
  if (/monitor|alert|exception|anomal|red flag|detect/.test(haystack)) return 'Define monitoring coverage, red flags, review ownership, closure evidence and overdue escalation.';
  if (/identity|impersonat|account takeover|credential|profile|verification/.test(haystack)) return 'Apply risk-based identity verification, profile-change controls and retained authentication evidence.';
  if (/evidence|preserv|custody|incident|report|investigat/.test(haystack)) return 'Establish protected reporting, severity-based escalation and controlled evidence preservation.';
  return `Implement the approved control response for ${finding.title.replace(/\.$/, '')}.`;
}

function buildRoadmapFacts(actions: RoadmapAction[], findings: MaterialFinding[], tier: NarrativeProductTier): NarrativeRoadmapFact[] {
  return actions.map((action, index) => ({
    factRef: `ROADMAP-${String(index + 1).padStart(3, '0')}`,
    sourceId: action.id,
    phase: phaseFor(action, index, actions.length, tier),
    managementOutcome: roadmapOutcomeFor(findings.find((finding) => finding.id === action.linkedFindingId) ?? findings[0]!),
    priorityWork: roadmapWorkFor(findings.find((finding) => finding.id === action.linkedFindingId) ?? findings[0]!),
    accountableExecutive: text(action.accountableExecutive),
    processOwner: text(action.processOwner, action.accountableOwner),
    targetPeriod: roadmapWindowFor(action, index, actions.length, tier),
    dependencies: list(action.dependency).filter((item) => item !== 'None'),
    proofOfCompletion: text(action.evidenceOfCompletion),
    successMeasure: text(action.successMeasure),
    failureTrigger: text(action.escalationThreshold, 'Escalate when the target-period success measure is not met or an exception remains overdue.')
  }));
}

function buildProofFacts(model: AdvisoryEvidenceModel, proofOverride?: NarrativeProofFact[]): NarrativeProofFact[] {
  if (proofOverride) return proofOverride.map((item) => ({
    ...item,
    requirement: cleanFactLanguage(item.requirement),
    owner: cleanFactLanguage(item.owner),
    whyItMatters: cleanFactLanguage(item.whyItMatters),
    expectedRecency: cleanFactLanguage(item.expectedRecency),
    requiredPopulation: cleanFactLanguage(item.requiredPopulation),
    acceptableExamples: item.acceptableExamples.map((example) => cleanFactLanguage(example))
  }));
  return model.evidenceChecklist.map((item, index) => ({
    factRef: `PROOF-${String(index + 1).padStart(3, '0')}`,
    sourceId: item.id,
    requirement: cleanFactLanguage(item.artefact),
    owner: cleanFactLanguage(item.likelyOwner),
    whyItMatters: cleanFactLanguage(item.provesWhat),
    expectedRecency: cleanFactLanguage(item.expectedRecency),
    requiredPopulation: cleanFactLanguage(item.requiredPopulation),
    acceptableExamples: list(item.minimumAcceptableCharacteristics).map((example) => cleanFactLanguage(example))
  }));
}

function selectNarrativeFindings(findings: MaterialFinding[], limit: number): MaterialFinding[] {
  const selected: MaterialFinding[] = [];
  for (const rule of FRAUD_PATHWAY_RULES) {
    const representative = pathwayMembers(rule, findings).sort((left, right) => pathwayScore(rule, right) - pathwayScore(rule, left) || right.materialityScore - left.materialityScore || left.id.localeCompare(right.id))[0];
    if (representative && !selected.some((finding) => finding.id === representative.id)) selected.push(representative);
  }
  for (const finding of [...findings].sort((left, right) => right.materialityScore - left.materialityScore || left.questionCode.localeCompare(right.questionCode))) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.id === finding.id)) selected.push(finding);
  }
  return selected.slice(0, limit);
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
  proofOverride?: NarrativeProofFact[];
}): NarrativeFactPack {
  const findings = buildFindingFacts(input.selectedFindings);
  const findingRefs = new Map(findings.map((finding) => [finding.sourceId, finding.factRef]));
  const risks = buildRiskFacts(input.selectedRisks, findingRefs);
  const riskRefs = new Map(risks.map((risk) => [risk.sourceId, risk.factRef]));
  const scenarios = buildScenarioFacts(input.selectedScenarios, input.selectedFindings, input.selectedRisks, findingRefs, riskRefs, input.tier);
  const controls = buildControlFacts(input.selectedControls, findingRefs);
  const decisions = buildDecisionFacts(input.selectedDecisions, findingRefs);
  const domains = buildDomains(input.data, findings);
  const themes = buildThemeFacts(input.evidenceModel.contradictions, input.selectedFindings, input.selectedRisks, scenarios, findingRefs, riskRefs);
  const themedFindingRefs = new Set(themes.flatMap((theme) => theme.findingRefs));
  const standaloneFindingReasons = Object.fromEntries(findings.filter((finding) => !themedFindingRefs.has(finding.factRef)).map((finding) => [finding.factRef, 'Retained as a standalone priority because no other selected finding shares a supported systemic relationship; the linked risk and control response remain explicit.']));
  const roadmap = buildRoadmapFacts(input.selectedRoadmap, input.selectedFindings, input.tier);
  const relativeStrengths = domains.filter((domain) => domain.score !== null && domain.score >= 60).slice(0, 3).map((domain, index) => ({ factRef: `STRENGTH-${String(index + 1).padStart(3, '0')}`, title: `${domain.name} is a relative strength in the recorded profile`, basis: `The recorded domain position is ${domain.score} out of 100.`, domainCode: domain.code }));
  const facts: NarrativeFact[] = [
    makeFact('SCORE-001', 'score', { overall: input.score.score, exposure: input.score.exposureScore, exposureBand: input.score.exposureBand }, ['score_run']),
    makeFact('MATURITY-001', 'maturity', { maturity: input.score.maturity, calculatedMaturity: input.score.calculatedMaturity }, ['score_run']),
    ...domains.map((domain) => makeFact(domain.factRef, 'domain', domain, [domain.code])),
    ...relativeStrengths.map((strength) => makeFact(strength.factRef, 'relative_strength', strength, [strength.domainCode])),
    ...themes.map((theme) => makeFact(theme.factRef, 'systemic_theme', theme, [...theme.findingRefs, ...theme.riskRefs, ...theme.scenarioRefs])),
    ...findings.map((finding) => makeFact(finding.factRef, 'finding', finding, finding.sourceRefs)),
    ...risks.map((risk) => makeFact(risk.factRef, 'risk', risk, [risk.sourceId])),
    ...scenarios.map((scenario) => makeFact(scenario.factRef, 'scenario', scenario, [scenario.sourceId])),
    ...controls.map((control) => makeFact(control.factRef, 'control', control, [control.sourceId])),
    ...decisions.map((decision) => makeFact(decision.factRef, 'decision', decision, [decision.sourceId])),
    ...roadmap.map((item) => makeFact(item.factRef, 'roadmap', item, [item.sourceId])),
    ...buildProofFacts(input.evidenceModel, input.proofOverride).map((item) => makeFact(item.factRef, 'proof_of_progress', item, [item.sourceId]))
  ];
  return {
    schemaVersion: NARRATIVE_FACT_PACK_SCHEMA_VERSION,
    bibleVersion: REPORTING_BIBLE_VERSION,
    productTier: input.tier,
    organisation: { name: input.organisationName, sectorFacts: [] },
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
    risks,
    scenarios,
    controls,
    decisions,
    roadmap,
    proofOfProgress: buildProofFacts(input.evidenceModel, input.proofOverride),
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
      managementResponseCount: roadmap.length
    },
    facts
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
  const selected = new Set(projection.findings.map((finding) => finding.id));
  return buildPack({
    tier: 'essential', data, organisationName: data.organisationName, assessmentReference: data.assessmentReference, generatedAt: data.generatedAt,
    score: scoreFromData(data), domainData: data.domainResults, evidenceModel,
    selectedFindings: projection.findings,
    selectedRisks: projection.risks,
    selectedScenarios: projection.scenarios.filter((scenario) => scenario.linkedFindingIds.some((id) => selected.has(id))),
    selectedControls: projection.controlActionRecords.map((control) => evidenceModel.controlImprovements.find((item) => item.linkedFindingId === control.linkedFindingIds[0]) ?? null).filter((item): item is ControlImprovementEntry => Boolean(item)),
    selectedDecisions: projection.leadershipDecisions, selectedRoadmap: projection.roadmapActions.slice(0, 6),
    proofOverride: projection.evidenceToObtain.map((item, index) => ({ factRef: `PROOF-${String(index + 1).padStart(3, '0')}`, sourceId: item.id, requirement: text(item.artefact), owner: text(item.likelyOwner), whyItMatters: text(item.provesWhat), expectedRecency: text(item.expectedRecency), requiredPopulation: text(item.requiredPopulation), acceptableExamples: list(item.minimumAcceptableCharacteristics) }))
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
  const selectedControls = model.controlImprovements.filter((control) => selectedFindingIds.has(control.linkedFindingId)).slice(0, 5);
  const selectedDecisions = model.leadershipDecisions.filter((decision) => decision.linkedFindingIds.some((id) => selectedFindingIds.has(id))).slice(0, 5);
  const selectedRoadmap = model.roadmapActions.filter((action) => selectedFindingIds.has(action.linkedFindingId)).slice(0, 12);
  return buildPack({
    tier: 'comprehensive', data, organisationName: model.analytical.organisationName, assessmentReference: model.analytical.assessmentReference, generatedAt: model.analytical.generatedAt,
    score, domainData: data?.domainResults, evidenceModel: model.analytical.evidenceModel,
    selectedFindings, selectedRisks, selectedScenarios: model.scenarios,
    selectedControls, selectedDecisions, selectedRoadmap,
    proofOverride: model.proofRequirements.map((item, index) => ({ factRef: `PROOF-${String(index + 1).padStart(3, '0')}`, sourceId: item.proofRef, requirement: item.requirement, owner: item.proofOwner, whyItMatters: item.whyItMatters, expectedRecency: item.expectedRecency, requiredPopulation: item.requiredPopulation, acceptableExamples: item.acceptableExamples }))
  });
}

export function assertNarrativeFactPack(pack: NarrativeFactPack): void {
  if (pack.bibleVersion !== '1.1') throw new Error(`Narrative Fact Pack requires Reporting Bible 1.1, received ${pack.bibleVersion}.`);
  if (pack.facts.length === 0) throw new Error('Narrative Fact Pack is empty.');
  const ids = pack.facts.map((fact) => fact.id);
  if (new Set(ids).size !== ids.length) throw new Error('Narrative Fact Pack contains duplicate stable fact IDs.');
  for (const fact of pack.facts) if (!fact.id || !fact.kind || fact.value === undefined) throw new Error(`Narrative Fact Pack fact ${fact.id || '<missing>'} is incomplete.`);
  for (const scenario of pack.scenarios) assertScenario(scenario);
  const themeRange = pack.productTier === 'essential' ? [3, 5] : [3, 5];
  if (pack.findings.length >= 6 && (pack.systemicThemeInputs.length < themeRange[0] || pack.systemicThemeInputs.length > themeRange[1])) throw new Error(`${pack.productTier} Fact Pack requires 3-5 systemic themes when the finding set has sufficient variation.`);
  if (pack.systemicThemeInputs.some((theme) => theme.findingRefs.length === 0 || theme.riskRefs.length === 0 || !theme.whyTogether)) throw new Error('Narrative theme is missing finding, risk or relationship basis.');
  const covered = new Set(pack.systemicThemeInputs.flatMap((theme) => theme.findingRefs));
  for (const finding of pack.findings) if (!covered.has(finding.factRef) && !pack.standaloneFindingReasons[finding.factRef]) throw new Error(`Priority finding ${finding.factRef} is orphaned from themes and has no standalone reason.`);
  const scenarioRange = pack.productTier === 'essential' ? [2, 3] : [3, 4];
  if (pack.scenarios.length < scenarioRange[0] || pack.scenarios.length > scenarioRange[1]) throw new Error(`${pack.productTier} Fact Pack requires ${scenarioRange[0]}-${scenarioRange[1]} real fraud pathway scenarios.`);
  const forbidden = /evidence validation|independent evidence review|self-reported claims remain unverified|approve a fixed governance cadence/i;
  if (pack.decisions.some((decision) => forbidden.test([decision.question, decision.recommendedRoute, decision.rationale, decision.consequenceOfDelay].join(' ')))) throw new Error('Fact Pack contains an evidence-validation decision or claim.');
  if (pack.roadmap.some((item) => /apply immediate escalation|deliver the exact control design|independently validate/i.test([item.managementOutcome, item.priorityWork, item.proofOfCompletion, item.failureTrigger].join(' ')))) throw new Error('Fact Pack contains legacy or assurance-validation roadmap language.');
  if (pack.roadmap.some((item) => !item.managementOutcome || !item.priorityWork || !item.accountableExecutive || !item.processOwner || !item.targetPeriod || !item.proofOfCompletion || !item.successMeasure || !item.failureTrigger)) throw new Error('Roadmap fact is missing a required management-object field.');
  if (pack.decisions.some((decision) => new Set(decision.options.map((option) => option.option)).size !== decision.options.length)) throw new Error('Decision options contain duplicates.');
}

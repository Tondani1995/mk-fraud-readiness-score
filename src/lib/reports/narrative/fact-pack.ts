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
  managementImplicationBasis: string;
  fraudRiskRelationship: string;
}

export interface NarrativeFindingFact {
  factRef: string;
  sourceId: string;
  title: string;
  domain: string;
  questionCode: string;
  recordedPosition: string;
  interpretation: string;
  whyItMatters: string;
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
  period: string;
  outcome: string;
  priorityWork: string;
  owner: string;
  dependencies: string[];
  proofOfCompletion: string;
  successMeasure: string;
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
  findings: NarrativeFindingFact[];
  risks: NarrativeRiskFact[];
  scenarios: NarrativeScenarioFact[];
  controls: NarrativeControlFact[];
  decisions: NarrativeDecisionFact[];
  roadmap: NarrativeRoadmapFact[];
  proofOfProgress: NarrativeProofFact[];
  prohibitedClaims: string[];
  facts: NarrativeFact[];
}

const text = (value: unknown, fallback = ''): string => String(value ?? '').trim() || fallback;
const list = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

function phaseFor(action: RoadmapAction): NarrativeRoadmapFact['phase'] {
  if (action.period === '30 days') return 'STABILISE';
  if (action.period === '60 days' || action.period === '90 days') return 'ESTABLISH';
  return action.id.endsWith('12') || action.id.endsWith('11') ? 'MATURE' : 'EMBED';
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

function scenarioFamily(scenario: PlausibleScenario, findings: MaterialFinding[]): ScenarioFamilyLanguage | null {
  const rawTypes = [...new Set([
    ...scenario.linkedFindingIds.flatMap((id) => findings.find((finding) => finding.id === id)?.linkedScenarioTypes ?? []),
    ...scenario.scenarioType.split('_').filter(Boolean)
  ])].sort();
  const candidates = [scenario.scenarioType, ...rawTypes].map((type) => SCENARIO_TYPE_ALIASES[type] ?? type.replaceAll('-', '_'));
  return candidates.map((type) => SCENARIO_FAMILY_LANGUAGE[type]).find(Boolean) ?? null;
}

function assertScenario(scenario: NarrativeScenarioFact): void {
  if (!scenario.actorClass || /^(D\d+|Reactive|Developing|Structured|Strategic)$/i.test(scenario.actorClass)) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} has no valid actor class.`);
  if (!scenario.entryPoint || /D\d+-Q\d+|recorded control condition|assessment question/i.test(scenario.entryPoint)) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} has an invalid entry point.`);
  if (/actor exploits the recorded control condition|threat actor exploits the recorded control condition/i.test(`${scenario.mechanism} ${scenario.opportunity}`)) throw new Error(`Narrative Fact Pack scenario ${scenario.factRef} has generic mechanism language.`);
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
    recordedPosition: text(finding.responseMeaning, finding.responseOperationalMeaning),
    interpretation: text(finding.diagnosis),
    whyItMatters: text(finding.whyItMatters),
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
    title: text(risk.title),
    statement: text(risk.riskStatement),
    cause: text(risk.cause),
    event: text(risk.riskEvent),
    priority: text(risk.priority),
    likelihood: text(risk.likelihood),
    impact: text(risk.impact),
    linkedFindingRefs: risk.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    approvedTreatment: text(risk.requiredTreatment),
    owner: text(risk.accountableExecutive),
    targetPeriod: text(risk.targetPeriod)
  }));
}

function buildScenarioFacts(scenarios: PlausibleScenario[], findings: MaterialFinding[], findingRefs: Map<string, string>, riskRefs: Map<string, string>): NarrativeScenarioFact[] {
  const result = scenarios.map((scenario, index) => {
    const language = scenarioFamily(scenario, findings);
    if (!language) throw new Error(`Narrative Fact Pack scenario ${scenario.id} has no approved deterministic scenario family.`);
    return {
    factRef: `SCENARIO-${String(index + 1).padStart(3, '0')}`,
    sourceId: scenario.id,
    title: text(scenario.title),
    actorClass: language.actorClass,
    opportunity: language.opportunity,
    entryPoint: language.entryPoint,
    mechanism: language.mechanism,
    controlWeakness: text(scenario.linkedControlWeaknesses.join('; '), scenario.controlsExpected.join('; ')),
    concealment: text(scenario.concealmentMechanism),
    consequence: unique([scenario.financialImpact, scenario.operationalImpact, ...scenario.likelyImpact.map((value) => text(value))]).join('; '),
    warningIndicators: list(scenario.earlyWarningIndicators),
    immediateContainment: text(scenario.immediateContainment),
    longTermResponse: text(scenario.longerTermResponse),
    linkedFindingRefs: scenario.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    linkedRiskRefs: scenario.linkedRiskIds.map((id) => riskRefs.get(id) ?? '').filter(Boolean)
  }; });
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

function buildThemeFacts(contradictions: AdvisoryEvidenceModel['contradictions'], findings: MaterialFinding[], findingRefs: Map<string, string>): NarrativeThemeFact[] {
  const explicit = contradictions.map((item, index) => ({
    factRef: `THEME-${String(index + 1).padStart(3, '0')}`,
    title: text(item.title),
    findingRefs: item.linkedFindingIds.map((id) => findingRefs.get(id) ?? '').filter(Boolean),
    domainCodes: unique(item.drivingResponses.match(/D\d+/g) ?? []),
    managementImplicationBasis: text(item.whyItMatters),
    fraudRiskRelationship: text(item.fraudPathwayEnabled, item.falseComfortRisk)
  })).filter((theme) => theme.findingRefs.length > 0 && theme.managementImplicationBasis && theme.fraudRiskRelationship);
  if (explicit.length > 0) return explicit.slice(0, 5);
  const families = new Map<string, MaterialFinding[]>();
  findings.forEach((finding) => {
    const family = [...finding.linkedScenarioTypes].sort()[0];
    if (family) families.set(family, [...(families.get(family) ?? []), finding]);
  });
  return [...families.entries()]
    .filter(([, members]) => members.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 5)
    .map(([family, members], index) => ({
      factRef: `THEME-${String(index + 1).padStart(3, '0')}`,
      title: family.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      findingRefs: members.map((member) => findingRefs.get(member.id) ?? '').filter(Boolean),
      domainCodes: [...new Set(members.map((member) => member.domainCode))].sort(),
      managementImplicationBasis: `The selected findings share an approved ${family.replaceAll('_', ' ')} pathway and should be treated as a connected management pattern.`,
      fraudRiskRelationship: members.map((member) => member.fraudMechanism).filter(Boolean).slice(0, 2).join(' ')
    }))
    .filter((theme) => theme.findingRefs.length > 1 && theme.fraudRiskRelationship);
}

function buildRoadmapFacts(actions: RoadmapAction[]): NarrativeRoadmapFact[] {
  return actions.map((action, index) => ({
    factRef: `ROADMAP-${String(index + 1).padStart(3, '0')}`,
    sourceId: action.id,
    phase: phaseFor(action),
    period: action.period,
    outcome: text(action.deliverable),
    priorityWork: text(action.deliverable),
    owner: text(action.accountableExecutive),
    dependencies: list(action.dependencyIds),
    proofOfCompletion: text(action.evidenceOfCompletion),
    successMeasure: text(action.successMeasure)
  }));
}

function buildProofFacts(model: AdvisoryEvidenceModel, proofOverride?: NarrativeProofFact[]): NarrativeProofFact[] {
  if (proofOverride) return proofOverride;
  return model.evidenceChecklist.map((item, index) => ({
    factRef: `PROOF-${String(index + 1).padStart(3, '0')}`,
    sourceId: item.id,
    requirement: text(item.artefact),
    owner: text(item.likelyOwner),
    whyItMatters: text(item.provesWhat),
    expectedRecency: text(item.expectedRecency),
    requiredPopulation: text(item.requiredPopulation),
    acceptableExamples: list(item.minimumAcceptableCharacteristics)
  }));
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
  const scenarios = buildScenarioFacts(input.selectedScenarios, input.selectedFindings, findingRefs, riskRefs);
  const controls = buildControlFacts(input.selectedControls, findingRefs);
  const decisions = buildDecisionFacts(input.selectedDecisions, findingRefs);
  const domains = buildDomains(input.data, findings);
  const themes = buildThemeFacts(input.evidenceModel.contradictions, input.selectedFindings, findingRefs);
  const relativeStrengths = domains.filter((domain) => domain.score !== null && domain.score >= 60).slice(0, 3).map((domain, index) => ({ factRef: `STRENGTH-${String(index + 1).padStart(3, '0')}`, title: `${domain.name} is a relative strength in the recorded profile`, basis: `The recorded domain position is ${domain.score} out of 100.`, domainCode: domain.code }));
  const facts: NarrativeFact[] = [
    makeFact('SCORE-001', 'score', { overall: input.score.score, exposure: input.score.exposureScore, exposureBand: input.score.exposureBand }, ['score_run']),
    makeFact('MATURITY-001', 'maturity', { maturity: input.score.maturity, calculatedMaturity: input.score.calculatedMaturity }, ['score_run']),
    ...domains.map((domain) => makeFact(domain.factRef, 'domain', domain, [domain.code])),
    ...relativeStrengths.map((strength) => makeFact(strength.factRef, 'relative_strength', strength, [strength.domainCode])),
    ...themes.map((theme) => makeFact(theme.factRef, 'systemic_theme', theme, theme.findingRefs)),
    ...findings.map((finding) => makeFact(finding.factRef, 'finding', finding, finding.sourceRefs)),
    ...risks.map((risk) => makeFact(risk.factRef, 'risk', risk, [risk.sourceId])),
    ...scenarios.map((scenario) => makeFact(scenario.factRef, 'scenario', scenario, [scenario.sourceId])),
    ...controls.map((control) => makeFact(control.factRef, 'control', control, [control.sourceId])),
    ...decisions.map((decision) => makeFact(decision.factRef, 'decision', decision, [decision.sourceId])),
    ...buildRoadmapFacts(input.selectedRoadmap).map((item) => makeFact(item.factRef, 'roadmap', item, [item.sourceId])),
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
    findings,
    risks,
    scenarios,
    controls,
    decisions,
    roadmap: buildRoadmapFacts(input.selectedRoadmap),
    proofOfProgress: buildProofFacts(input.evidenceModel, input.proofOverride),
    prohibitedClaims: [
      'independent operating effectiveness', 'evidence validation', 'confirmed fraud event',
      'invented incident, loss, customer, supplier, system or interview', 'unsupported Rand amount',
      'legal, regulatory, benchmark, certification or guarantee conclusion', 'management motive or competence allegation'
    ],
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
    selectedScenarios: projection.scenarios.filter((scenario) => scenario.linkedFindingIds.every((id) => selected.has(id))),
    selectedControls: projection.controlActionRecords.map((control) => evidenceModel.controlImprovements.find((item) => item.linkedFindingId === control.linkedFindingIds[0]) ?? null).filter((item): item is ControlImprovementEntry => Boolean(item)),
    selectedDecisions: projection.leadershipDecisions, selectedRoadmap: projection.roadmapActions,
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
  return buildPack({
    tier: 'comprehensive', data, organisationName: model.analytical.organisationName, assessmentReference: model.analytical.assessmentReference, generatedAt: model.analytical.generatedAt,
    score, domainData: data?.domainResults, evidenceModel: model.analytical.evidenceModel,
    selectedFindings: model.findings, selectedRisks: model.riskRegister, selectedScenarios: model.scenarios,
    selectedControls: model.controlImprovements, selectedDecisions: model.leadershipDecisions, selectedRoadmap: model.roadmapActions,
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
  if (pack.productTier === 'comprehensive' && pack.systemicThemeInputs.some((theme) => theme.findingRefs.length === 0)) throw new Error('Comprehensive theme has no deterministic finding references.');
}

import type { NarrativeFactPack, NarrativeProductTier } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';

export const NARRATIVE_WRITER_BRIEF_SCHEMA_VERSION = 'mk-reporting-bible-1.1-writer-brief-v1';

export interface NarrativeWriterBrief {
  schemaVersion: typeof NARRATIVE_WRITER_BRIEF_SCHEMA_VERSION;
  bibleVersion: '1.1';
  productTier: NarrativeProductTier;
  organisation: { name: string; sectorFacts: string[] };
  assessment: {
    score: number | null;
    maturity: string | null;
    exposureBand: string | null;
    uncertaintyLanguage: string[];
  };
  domains: Array<{ factRef: string; name: string; score: number | null; maturity: string | null; coveragePct: number | null }>;
  relativeStrengths: Array<{ factRef: string; title: string; basis: string }>;
  themes: Array<{
    factRef: string;
    title: string;
    managementQuestion: string;
    findingRefs: string[];
    semanticFamilyLabels: string[];
    riskRefs: string[];
    scenarioRefs: string[];
    managementImplicationBasis: string;
    fraudRiskRelationship: string;
    whyTogether: string;
  }>;
  findings: Array<{
    factRef: string;
    title: string;
    domain: string;
    semanticFamilyLabel: string;
    fraudPathwayLabels: string[];
    recordedPosition: string;
    deterministicCondition: string;
    interpretation: string;
    advisoryMeaningBasis: string;
    whyItMatters: string;
    materialityLabel: string;
    assuranceBoundary: string;
    owner: string;
    processOwner: string;
    targetPeriod: string;
    approvedControlResponse: string;
    effectivenessMeasure: string;
  }>;
  risks: Array<{
    factRef: string;
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
  }>;
  scenarios: Array<{
    factRef: string;
    scenarioFamilyLabel: string;
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
  }>;
  controls: Array<{
    factRef: string;
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
  }>;
  decisions: Array<{
    factRef: string;
    decisionFamilyLabel: string;
    question: string;
    options: Array<{ option: string; cost: string; benefit: string; tradeOff: string }>;
    recommendedRoute: string;
    rationale: string;
    owner: string;
    targetDate: string;
    consequenceOfDelay: string;
    linkedFindingRefs: string[];
  }>;
  roadmap: Array<{
    factRef: string;
    sourceFindingRef: string;
    semanticFamilyLabel: string;
    phase: string;
    managementOutcome: string;
    priorityWork: string;
    accountableExecutive: string;
    processOwner: string;
    targetPeriod: string;
    dependencies: string[];
    proofOfCompletion: string;
    successMeasure: string;
    failureTrigger: string;
  }>;
  proofOfProgress: Array<{
    factRef: string;
    requirement: string;
    owner: string;
    whyItMatters: string;
    expectedRecency: string;
    requiredPopulation: string;
    acceptableExamples: string[];
  }>;
  narrativeBounds: NarrativeFactPack['narrativeBounds'];
  standaloneFindingReasons: Record<string, string>;
  prohibitedClaims: string[];
  storyPlan: {
    executiveStoryObjective: string;
    movements: Array<{ order: number; title: string; objective: string; transitionPurpose: string; requiredManagementTakeaway: string }>;
    themeOrder: string[];
    findingOrder: string[];
    scenarioOrder: string[];
    riskOrder: string[];
    controlOrder: string[];
    decisionOrder: string[];
    roadmapOrder: string[];
    narrativeBounds: NarrativeFactPack['narrativeBounds'];
    requiredConclusion: string;
  };
}

const familyLabels: Record<string, string> = {
  FRAUD_GOVERNANCE: 'Fraud governance',
  FRAUD_RISK_IDENTIFICATION: 'Fraud-risk identification',
  SUPPLIER_ONBOARDING: 'Supplier onboarding',
  SUPPLIER_PAYMENT_CHANGE: 'Supplier payment changes',
  THIRD_PARTY_OVERSIGHT: 'Third-party oversight',
  ORDINARY_ACCESS: 'Role-based access',
  PRIVILEGED_ACCESS: 'Privileged access',
  IDENTITY_VERIFICATION: 'Identity verification',
  DETECTION_MONITORING: 'Detection monitoring',
  INCIDENT_RESPONSE: 'Incident response',
  EVIDENCE_INTEGRITY: 'Evidence integrity',
  WHISTLEBLOWING: 'Protected reporting',
  FRAUD_AWARENESS: 'Fraud awareness',
  CONTINUOUS_IMPROVEMENT: 'Continuous improvement'
};

const pathwayLabels: Record<string, string> = {
  SUPPLIER_PAYMENT_DIVERSION: 'Supplier and payment diversion',
  PRIVILEGED_ACCESS_MISUSE: 'Privileged access misuse',
  IDENTITY_IMPERSONATION: 'Identity impersonation',
  DETECTION_EVASION: 'Detection evasion',
  INCIDENT_CONCEALMENT: 'Incident containment and evidence integrity'
};

const decisionLabels: Record<string, string> = {
  accountable_executive_mandate: 'Accountable executive ownership',
  risk_acceptance_or_remediation: 'Risk treatment',
  control_design_standard: 'Target control standard',
  funding_resource_allocation: 'Resource allocation',
  sequencing_dependency: 'Delivery sequencing',
  external_specialist_support: 'Specialist support',
  governance_reporting_cadence: 'Management review cadence',
  independent_validation: 'Independent review route'
};

const materialityLabels: Record<string, string> = {
  control_failure: 'Material control weakness',
  control_gap: 'Material control gap',
  maturity_constraint: 'Maturity-limiting condition',
  exposure_mismatch: 'Exposure and control mismatch',
  cross_domain_dependency: 'Cross-domain dependency',
  assurance_priority: 'Recorded assurance priority'
};

function label(map: Record<string, string>, value: string, fallback = 'Recorded priority'): string {
  return map[value] ?? fallback;
}

function cleanWriterText(value: string): string {
  return value
    .replace(/\b(?:G\d+-)?D\d+-Q\d+\b/g, '')
    .replace(/\b(?:FINDING|RISK|CI|EVID|ACT|SC|DEC)-[A-Z0-9-]+\b/g, '')
    .replace(/Evidence pack for\s*:/gi, 'Evidence pack:')
    .replace(/Obtain and independently verify the control evidence before relying on the result\.?/gi, 'Retain the named control records before relying on the recorded position.')
    .replace(/independently verify/gi, 'review')
    .replace(/independently verified/gi, 'independently reviewed')
    .replace(/during evidence review/gi, 'before delivery')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeUncertaintyLanguage(pack: NarrativeFactPack): string[] {
  return pack.assessment.uncertaintyFacts.length > 0
    ? ['The recorded assessment includes control conditions that limit the maturity position shown by the assessment.']
    : [];
}

export function buildNarrativeWriterBrief(pack: NarrativeFactPack, plan: NarrativeStoryPlan): NarrativeWriterBrief {
  return {
    schemaVersion: NARRATIVE_WRITER_BRIEF_SCHEMA_VERSION,
    bibleVersion: '1.1',
    productTier: pack.productTier,
    organisation: pack.organisation,
    assessment: {
      score: pack.assessment.score,
      maturity: pack.assessment.maturity,
      exposureBand: pack.assessment.exposureBand,
      uncertaintyLanguage: safeUncertaintyLanguage(pack)
    },
    domains: pack.domains.map((domain) => ({ factRef: domain.factRef, name: domain.name, score: domain.score, maturity: domain.maturity, coveragePct: domain.coveragePct })),
    relativeStrengths: pack.relativeStrengths.map(({ factRef, title, basis }) => ({ factRef, title, basis })),
    themes: pack.systemicThemeInputs.map((theme) => ({
      factRef: theme.factRef,
      title: theme.title,
      managementQuestion: theme.managementQuestion,
      findingRefs: theme.findingRefs,
      semanticFamilyLabels: theme.semanticFamilies.map((family) => label(familyLabels, family)),
      riskRefs: theme.riskRefs,
      scenarioRefs: theme.scenarioRefs,
      managementImplicationBasis: theme.managementImplicationBasis,
      fraudRiskRelationship: theme.fraudRiskRelationship,
      whyTogether: theme.whyTogether
    })),
    findings: pack.findings.map((finding) => ({
      factRef: finding.factRef,
      title: finding.title,
      domain: finding.domain,
      semanticFamilyLabel: label(familyLabels, finding.primarySemanticFamily),
      fraudPathwayLabels: finding.fraudPathwayFamilies.map((family) => label(pathwayLabels, family)),
      recordedPosition: finding.recordedPosition,
      deterministicCondition: finding.deterministicCondition,
      interpretation: finding.interpretation,
      advisoryMeaningBasis: finding.advisoryMeaningBasis,
      whyItMatters: finding.whyItMatters,
      materialityLabel: label(materialityLabels, finding.materiality),
      assuranceBoundary: 'This is an interpretation of the recorded position for advisory planning; it is not a statement that every control operates consistently.',
      owner: finding.owner,
      processOwner: finding.processOwner,
      targetPeriod: finding.targetPeriod,
      approvedControlResponse: finding.approvedControlResponse,
      effectivenessMeasure: finding.effectivenessMeasure
    })),
    risks: pack.risks.map(({ factRef, title, statement, cause, event, priority, likelihood, impact, linkedFindingRefs, approvedTreatment, owner, targetPeriod }) => ({ factRef, title, statement, cause, event, priority, likelihood, impact, linkedFindingRefs, approvedTreatment, owner, targetPeriod })),
    scenarios: pack.scenarios.map(({ factRef, scenarioFamily, title, actorClass, opportunity, entryPoint, mechanism, controlWeakness, concealment, consequence, warningIndicators, immediateContainment, longTermResponse, linkedFindingRefs, linkedRiskRefs }) => ({ factRef, scenarioFamilyLabel: label(pathwayLabels, scenarioFamily), title, actorClass, opportunity, entryPoint, mechanism, controlWeakness, concealment, consequence, warningIndicators, immediateContainment, longTermResponse, linkedFindingRefs, linkedRiskRefs })),
    controls: pack.controls.map(({ factRef, objective, currentState, targetState, accountableExecutive, processOwner, population, frequency, proofRetained, independentCheck, escalationTrigger, sla, effectivenessMeasure, failureResponse, dependencies, linkedFindingRefs }) => ({ factRef, objective, currentState, targetState, accountableExecutive, processOwner, population, frequency, proofRetained, independentCheck, escalationTrigger, sla, effectivenessMeasure, failureResponse, dependencies, linkedFindingRefs })),
    decisions: pack.decisions.map(({ factRef, decisionFamily, question, options, recommendedRoute, rationale, owner, targetDate, consequenceOfDelay, linkedFindingRefs }) => ({ factRef, decisionFamilyLabel: label(decisionLabels, decisionFamily), question, options, recommendedRoute, rationale, owner, targetDate, consequenceOfDelay, linkedFindingRefs })),
    roadmap: pack.roadmap.map(({ factRef, sourceFindingRef, primarySemanticFamily, phase, managementOutcome, priorityWork, accountableExecutive, processOwner, targetPeriod, dependencies, proofOfCompletion, successMeasure, failureTrigger }) => ({ factRef, sourceFindingRef, semanticFamilyLabel: label(familyLabels, primarySemanticFamily), phase, managementOutcome, priorityWork, accountableExecutive, processOwner, targetPeriod, dependencies, proofOfCompletion, successMeasure, failureTrigger })),
    proofOfProgress: pack.proofOfProgress.map(({ factRef, requirement, owner, whyItMatters, expectedRecency, requiredPopulation, acceptableExamples }) => ({ factRef, requirement: cleanWriterText(requirement), owner: cleanWriterText(owner), whyItMatters: cleanWriterText(whyItMatters), expectedRecency: cleanWriterText(expectedRecency), requiredPopulation: cleanWriterText(requiredPopulation), acceptableExamples: acceptableExamples.map(cleanWriterText) })),
    narrativeBounds: pack.narrativeBounds,
    standaloneFindingReasons: pack.standaloneFindingReasons,
    prohibitedClaims: [
      'Do not present operating effectiveness as independently established.',
      'Do not present evidence review as completed.',
      'Do not describe a plausible pathway as a confirmed event.',
      'Do not invent incidents, losses, customers, suppliers, systems, interviews or monetary amounts.'
    ],
    storyPlan: {
      executiveStoryObjective: plan.executiveStoryObjective,
      movements: plan.movements.map(({ order, title, objective, transitionPurpose, requiredManagementTakeaway }) => ({ order, title, objective, transitionPurpose, requiredManagementTakeaway })),
      themeOrder: plan.themeOrder,
      findingOrder: plan.findingOrder,
      scenarioOrder: plan.scenarioOrder,
      riskOrder: plan.riskOrder,
      controlOrder: plan.controlOrder,
      decisionOrder: plan.decisionOrder,
      roadmapOrder: plan.roadmapOrder,
      narrativeBounds: plan.narrativeBounds,
      requiredConclusion: plan.requiredConclusion
    }
  };
}

export function assertNarrativeWriterBrief(brief: NarrativeWriterBrief): void {
  const payload = JSON.stringify(brief);
  if (/D\d+-Q\d+|MF-D\d+-Q\d+|RISK-[A-Z][A-Z0-9-]+|"sourceId"|"questionCode"|"priorityScore"|control_failure|maturity_constraint|hard.?gate|cap.?event|evidence validation|independent evidence review/.test(payload)) {
    throw new Error('Narrative Writer Brief contains internal provenance, scoring enums or methodology language.');
  }
  if (brief.findings.some((finding) => !finding.factRef || !finding.semanticFamilyLabel || !finding.materialityLabel)) throw new Error('Narrative Writer Brief contains an incomplete finding.');
  if (brief.scenarios.some((scenario) => !scenario.scenarioFamilyLabel || scenario.linkedFindingRefs.length === 0)) throw new Error('Narrative Writer Brief contains an incomplete scenario.');
}

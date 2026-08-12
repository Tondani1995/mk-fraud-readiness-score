import type { NarrativeFactPack, NarrativeProductTier } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';

export const NARRATIVE_WRITER_BRIEF_SCHEMA_VERSION = 'mk-reporting-bible-1.1-writer-brief-v1';

export interface NarrativeWriterBrief {
  schemaVersion: typeof NARRATIVE_WRITER_BRIEF_SCHEMA_VERSION;
  bibleVersion: '1.1';
  productTier: NarrativeProductTier;
  organisation: { name: string; sectorFacts: string[] };
  assessmentBasis: string;
  assuranceBoundary: string;
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
    owner: string;
    processOwner: string;
    targetPeriod: string;
    approvedControlResponse: string;
    effectivenessMeasure: string;
  }>;
  risks: Array<{
    factRef: string;
    title: string;
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
  }>;
  scenarios: Array<{
    factRef: string;
    scenarioFamilyLabel: string;
    title: string;
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
    linkedFindingRefs: string[];
    linkedRiskRefs: string[];
  }>;
  controls: Array<{
    factRef: string;
    semanticFamilyLabel: string;
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
  FRAUD_GOVERNANCE_MODEL: 'Fraud governance model',
  PRIVILEGED_ACCESS_OPERATING_STANDARD: 'Privileged-access operating standard',
  IDENTITY_VERIFICATION_MODEL: 'Identity verification model',
  DETECTION_OPERATING_MODEL: 'Detection operating model',
  INCIDENT_AND_EVIDENCE_MODEL: 'Incident and evidence model',
  SUPPLIER_VERIFICATION_MODEL: 'Supplier verification model',
  CONTROL_EFFECTIVENESS_CADENCE: 'Control-effectiveness cadence',
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
    .replace(/self-assessed and not independently verified.?/gi, '')
    .replace(/self-reported claims remain unverified.?/gi, '')
    .replace(/Impact requires case-specific validation.?/gi, '')
    .replace(/Operating impact requires case-specific validation.?/gi, '')
    .replace(/does not meet the exact expected standard/gi, 'is not yet consistently designed and evidenced')
    .replace(/Consequence pathway:s*/gi, '')
    .replace(/operates to the exact expected control standard across the complete in-scope population/gi, 'is defined, owned and evidenced across the complete in-scope population')
    .replace(/during evidence review/gi, 'before delivery')
    .replace(/\s+/g, ' ')
    .trim();
}

function ordered<T extends { factRef: string }>(items: T[], refs: string[]): T[] {
  const byRef = new Map(items.map((item) => [item.factRef, item]));
  return refs.map((ref) => byRef.get(ref)).filter((item): item is T => Boolean(item));
}

function cleanControlState(value: string): string {
  const cleaned = cleanWriterText(value).replace(/;s*$/g, '').trim();
  return cleaned || 'Recorded control position is described in the linked finding.';
}

function selectedProof(pack: NarrativeFactPack, selectedFindingRefs: Set<string>, selectedScenarioRefs: Set<string>, selectedControlRefs: Set<string>, selectedRoadmapRefs: Set<string>): NarrativeFactPack['proofOfProgress'] {
  const linked = pack.proofOfProgress.filter((item) => item.linkedFindingRefs.some((ref) => selectedFindingRefs.has(ref)));
  const fallback = pack.proofOfProgress.filter((item) => item.linkedFindingRefs.length === 0);
  return [...linked, ...fallback].slice(0, 12);
}

function safeUncertaintyLanguage(pack: NarrativeFactPack): string[] {
  return pack.assessment.uncertaintyFacts.length > 0
    ? ['The recorded assessment includes control conditions that limit the maturity position shown by the assessment.']
    : [];
}

export function buildNarrativeWriterBrief(pack: NarrativeFactPack, plan: NarrativeStoryPlan): NarrativeWriterBrief {
  const themes = ordered(pack.systemicThemeInputs, plan.themeOrder);
  const findings = ordered(pack.findings, plan.findingOrder);
  const risks = ordered(pack.risks, plan.riskOrder);
  const scenarios = ordered(pack.scenarios, plan.scenarioOrder);
  const controls = ordered(pack.controls, plan.controlOrder);
  const decisions = ordered(pack.decisions, plan.decisionOrder);
  const roadmap = ordered(pack.roadmap, plan.roadmapOrder);
  const selectedFindingRefs = new Set(findings.map((item) => item.factRef));
  const selectedScenarioRefs = new Set(scenarios.map((item) => item.factRef));
  const selectedControlRefs = new Set(controls.map((item) => item.factRef));
  const selectedRoadmapRefs = new Set(roadmap.map((item) => item.factRef));
  const proofOfProgress = selectedProof(pack, selectedFindingRefs, selectedScenarioRefs, selectedControlRefs, selectedRoadmapRefs);
  return {
    schemaVersion: NARRATIVE_WRITER_BRIEF_SCHEMA_VERSION,
    bibleVersion: '1.1',
    productTier: pack.productTier,
    organisation: { name: pack.organisation.name, sectorFacts: pack.organisation.sectorFacts.filter(Boolean) },
    assessmentBasis: 'The assessment is based on management’s recorded self-assessment and deterministic scoring inputs.',
    assuranceBoundary: 'The assessment does not independently verify operating effectiveness, evidence or every in-scope control.',
    assessment: {
      score: pack.assessment.score,
      maturity: pack.assessment.maturity,
      exposureBand: pack.assessment.exposureBand,
      uncertaintyLanguage: safeUncertaintyLanguage(pack)
    },
    domains: pack.domains.map((domain) => ({ factRef: domain.factRef, name: domain.name, score: domain.score, maturity: domain.maturity, coveragePct: domain.coveragePct })),
    relativeStrengths: pack.relativeStrengths.map(({ factRef, title, basis }) => ({ factRef, title, basis })),
    themes: themes.map((theme) => ({
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
    findings: findings.map((finding) => ({
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
      owner: finding.owner,
      processOwner: finding.processOwner,
      targetPeriod: finding.targetPeriod,
      approvedControlResponse: finding.approvedControlResponse,
      effectivenessMeasure: finding.effectivenessMeasure
    })),
    risks: risks.map(({ factRef, title, cause, riskEvent, priority, likelihood, impact, qualitativeConsequence, linkedFindingRefs, approvedTreatment, owner, targetPeriod }) => ({ factRef, title: cleanWriterText(title), cause: cleanWriterText(cause), riskEvent: cleanWriterText(riskEvent), priority, likelihood, impact, qualitativeConsequence: cleanWriterText(qualitativeConsequence), linkedFindingRefs, approvedTreatment: cleanWriterText(approvedTreatment), owner: cleanWriterText(owner), targetPeriod })),
    scenarios: scenarios.map(({ factRef, scenarioFamily, title, actorClass, opportunity, entryPoint, mechanism, currentControlWeakness, requiredControlResponse, concealment, consequence, warningIndicators, immediateContainment, longTermResponse, linkedFindingRefs, linkedRiskRefs }) => ({ factRef, scenarioFamilyLabel: label(pathwayLabels, scenarioFamily), title: cleanWriterText(title), actorClass: cleanWriterText(actorClass), opportunity: cleanWriterText(opportunity), entryPoint: cleanWriterText(entryPoint), mechanism: cleanWriterText(mechanism), currentControlWeakness: cleanWriterText(currentControlWeakness), requiredControlResponse: cleanWriterText(requiredControlResponse), concealment: cleanWriterText(concealment), consequence: cleanWriterText(consequence), warningIndicators: warningIndicators.map(cleanWriterText), immediateContainment: cleanWriterText(immediateContainment), longTermResponse: cleanWriterText(longTermResponse), linkedFindingRefs, linkedRiskRefs })),
    controls: controls.map(({ factRef, primarySemanticFamily, objective, currentState, targetState, accountableExecutive, processOwner, population, frequency, proofRetained, independentCheck, escalationTrigger, sla, effectivenessMeasure, failureResponse, dependencies, linkedFindingRefs }) => ({ factRef, semanticFamilyLabel: label(familyLabels, primarySemanticFamily), objective: cleanWriterText(objective), currentState: cleanControlState(currentState), targetState: cleanWriterText(targetState), accountableExecutive: cleanWriterText(accountableExecutive), processOwner: cleanWriterText(processOwner), population: cleanWriterText(population), frequency: cleanWriterText(frequency), proofRetained: proofRetained.map(cleanWriterText), independentCheck: cleanWriterText(independentCheck), escalationTrigger: cleanWriterText(escalationTrigger), sla: cleanWriterText(sla), effectivenessMeasure: cleanWriterText(effectivenessMeasure), failureResponse: cleanWriterText(failureResponse), dependencies: dependencies.map(cleanWriterText), linkedFindingRefs })),
    decisions: decisions.map(({ factRef, decisionSemanticFamily, question, options, recommendedRoute, rationale, owner, targetDate, consequenceOfDelay, linkedFindingRefs }) => ({ factRef, decisionFamilyLabel: label(decisionLabels, decisionSemanticFamily), question: cleanWriterText(question), options: options.map((option) => ({ option: cleanWriterText(option.option), cost: cleanWriterText(option.cost), benefit: cleanWriterText(option.benefit), tradeOff: cleanWriterText(option.tradeOff) })), recommendedRoute: cleanWriterText(recommendedRoute), rationale: cleanWriterText(rationale), owner: cleanWriterText(owner), targetDate: cleanWriterText(targetDate), consequenceOfDelay: cleanWriterText(consequenceOfDelay), linkedFindingRefs })),
    roadmap: roadmap.map(({ factRef, sourceFindingRef, primarySemanticFamily, phase, managementOutcome, priorityWork, accountableExecutive, processOwner, targetPeriod, dependencies, proofOfCompletion, successMeasure, failureTrigger }) => ({ factRef, sourceFindingRef, semanticFamilyLabel: label(familyLabels, primarySemanticFamily), phase, managementOutcome: cleanWriterText(managementOutcome), priorityWork: cleanWriterText(priorityWork), accountableExecutive: cleanWriterText(accountableExecutive), processOwner: cleanWriterText(processOwner), targetPeriod, dependencies: dependencies.map(cleanWriterText), proofOfCompletion: cleanWriterText(proofOfCompletion), successMeasure: cleanWriterText(successMeasure), failureTrigger: cleanWriterText(failureTrigger) })),
    proofOfProgress: proofOfProgress.map(({ factRef, requirement, owner, whyItMatters, expectedRecency, requiredPopulation, acceptableExamples }) => ({ factRef, requirement: cleanWriterText(requirement), owner: cleanWriterText(owner), whyItMatters: cleanWriterText(whyItMatters), expectedRecency: cleanWriterText(expectedRecency), requiredPopulation: cleanWriterText(requiredPopulation), acceptableExamples: acceptableExamples.map(cleanWriterText) })),
    narrativeBounds: { themeCount: themes.length, findingCount: findings.length, scenarioCount: scenarios.length, controlCount: controls.length, decisionCount: decisions.length, managementResponseCount: roadmap.length },
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
      themeOrder: themes.map((item) => item.factRef),
      findingOrder: findings.map((item) => item.factRef),
      scenarioOrder: scenarios.map((item) => item.factRef),
      riskOrder: risks.map((item) => item.factRef),
      controlOrder: controls.map((item) => item.factRef),
      decisionOrder: decisions.map((item) => item.factRef),
      roadmapOrder: roadmap.map((item) => item.factRef),
      narrativeBounds: { themeCount: themes.length, findingCount: findings.length, scenarioCount: scenarios.length, controlCount: controls.length, decisionCount: decisions.length, managementResponseCount: roadmap.length },
      requiredConclusion: plan.requiredConclusion
    }
  };
}

export function assertNarrativeWriterBrief(brief: NarrativeWriterBrief): void {
  const payload = JSON.stringify(brief);
  if (/D\d+-Q\d+|MF-D\d+-Q\d+|RISK-[A-Z][A-Z0-9-]+|"sourceId"|"questionCode"|"priorityScore"|control_failure|maturity_constraint|hard.?gate|cap.?event|evidence validation|independent evidence review|Impact requires case-specific validation|Operating impact requires case-specific validation|does not meet the exact expected standard|Consequence pathway:|self-reported claims remain unverified/.test(payload)) {
    throw new Error('Narrative Writer Brief contains internal provenance, scoring enums or methodology language.');
  }
  if (brief.findings.some((finding) => !finding.factRef || !finding.semanticFamilyLabel || !finding.materialityLabel)) throw new Error('Narrative Writer Brief contains an incomplete finding.');
  if (!brief.assessmentBasis || !brief.assuranceBoundary) throw new Error('Narrative Writer Brief is missing its global assessment basis or assurance boundary.');
  if (brief.scenarios.some((scenario) => !scenario.scenarioFamilyLabel || scenario.linkedFindingRefs.length === 0 || !scenario.currentControlWeakness || !scenario.requiredControlResponse)) throw new Error('Narrative Writer Brief contains an incomplete scenario.');
  if (brief.risks.some((risk) => !risk.title || !risk.cause || !risk.riskEvent || !risk.qualitativeConsequence || !risk.owner || !risk.targetPeriod)) throw new Error('Narrative Writer Brief contains an incomplete risk.');
  if (brief.proofOfProgress.some((proof) => !proof.requirement || !proof.owner || !proof.whyItMatters || !proof.expectedRecency || !proof.requiredPopulation || proof.acceptableExamples.length === 0 || /to be confirmed|Evidence mapped to ,|placeholder|TBD/i.test(JSON.stringify(proof)))) throw new Error('Narrative Writer Brief contains low-quality proof guidance.');
  if ((payload.match(/not independently verified/gi) ?? []).length > 1) throw new Error('Narrative Writer Brief repeats the assurance boundary inside its payload.');
}

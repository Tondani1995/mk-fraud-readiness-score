import type { NarrativeFact, NarrativeFactPack, NarrativeControlFact, NarrativeDecisionFact, NarrativeRoadmapFact, NarrativeSustainmentPriorityFact } from './fact-pack';
import type { NarrativeMaturationStep } from './maturation';
import type { OperatingContextFact } from './operating-context';
import { exposuresFromContext, type OperatingExposureId } from './operating-exposures';

/**
 * Deterministic Comprehensive-only projections.
 *
 * These objects are deliberately a view over existing Fact Pack and
 * sustainment-priority fields. They do not score, infer a weakness, create a
 * fraud scenario or ask a provider to draw a relationship. The writer may
 * explain these objects, but may not create or rewire them.
 */

export const ENTERPRISE_INTEGRATION_MAP_VERSION = 'mk-comprehensive-enterprise-integration-map-v1' as const;
export const LOOP_METHODOLOGY_MAP_VERSION = 'mk-fraud-readiness-loop-map-v1' as const;
export const LOOP_METHODOLOGY_MAP_FINGERPRINT = 'LOOP-GOVERN-DIRECT:D1,D2|LOOP-PREVENT-DETECT:D3,D4,D7,D8|LOOP-RESPOND-SURFACE:D5,D6|LOOP-LEARN-ADAPT:D9,D10' as const;

export type IntegrationRelationshipType =
  | 'AUTHORITY_ENABLES'
  | 'RISK_VIEW_DIRECTS'
  | 'CONTROL_SIGNAL_FEEDS'
  | 'EVENT_TRIGGERS_REVIEW'
  | 'EVIDENCE_CLOSES_LOOP'
  | 'LEARNING_UPDATES'
  | 'OVERLAY_CHANGES_PRIORITY';

export type PremiumSupportStatus = 'SUPPORTED' | 'CONDITIONAL' | 'NOT_ESTABLISHED';

export interface NarrativeAssuranceCoverageFact {
  factRef: string;
  provenance: 'DERIVED_ANALYSIS';
  domainRef: string;
  domainName: string;
  score: number | null;
  maturity: string;
  posture: 'DEEP_DIVE_PRIORITY' | 'CONFIRM' | 'MAINTAIN';
  capabilityToPreserve: string;
  managementProof: string;
  deteriorationSignal: string;
  reviewRhythm: string;
  traceability: string[];
  coverageNote: string;
  sourceRefs: string[];
}

export interface NarrativeAssurancePriorityFact {
  factRef: string;
  provenance: 'DERIVED_ANALYSIS';
  priorityId: string;
  priorityClass: 'ASSURANCE_PRIORITY' | 'RESILIENCE_DEPENDENCY' | 'DETERIORATION_WATCHPOINT';
  capability: string;
  domainRef: string;
  domain: string;
  semanticFamily: string;
  recordedPosition: string;
  currentStandard: string;
  whyItMatters: string;
  evidenceManagementShouldHold: string[];
  coverageExpectation: string;
  suggestedSamplingApproach: string;
  reviewFrequency: string;
  accountableExecutive: string;
  oversightFunction: string;
  dependencies: string[];
  deteriorationTrigger: string;
  earlyWarningSignal: string;
  effectivenessIndicator: string;
  sourceRefs: string[];
}

export interface NarrativeResilienceResponse {
  linkedDecisionRefs: string[];
  linkedControlRefs: string[];
  linkedRoadmapRefs: string[];
  governanceRoute: string;
}

export interface NarrativeResilienceTestFact {
  factRef: string;
  provenance: 'DERIVED_ANALYSIS';
  testId: string;
  capability: string;
  domainRef: string;
  domain: string;
  readinessDependency: string[];
  changeCondition: string;
  managementTest: string;
  evidence: string[];
  effectivenessIndicator: string;
  reviewRhythm: string;
  response: NarrativeResilienceResponse;
  linkedAssurancePriorityRef: string;
  linkedPriorityRef: string;
  linkedDecisionRefs: string[];
  linkedControlRefs: string[];
  linkedRoadmapRefs: string[];
  doesNotAssertFinding: true;
  supportStatus: 'CONDITIONAL';
  sourceRefs: string[];
}

export interface EnterpriseIntegrationDomainNode {
  domainRef: string;
  domainName: string;
  score: number | null;
  maturity: string | null;
  posture: 'DEEP_DIVE_PRIORITY' | 'CONFIRM' | 'MAINTAIN';
  primaryLoopRef: string;
  sourceRefs: string[];
}

export interface EnterpriseIntegrationLoopNode {
  loopRef: string;
  label: string;
  methodologyRole: string;
  memberDomainRefs: string[];
  sourceRefs: string[];
}

export interface EnterpriseIntegrationOverlayNode {
  overlayRef: string;
  label: string;
  activationCondition: string;
  contextRefs: string[];
  supportedDomainRefs: string[];
  sourceRefs: string[];
  status: 'ACTIVE_SUPPORTED' | 'CONTEXT_ONLY' | 'NOT_ESTABLISHED';
}

export interface EnterpriseIntegrationDependency {
  dependencyRef: string;
  contributingDomainRefs: string[];
  loopRef: string;
  overlayRefs: string[];
  deterministicBasis: {
    domainRefs: string[];
    semanticFamilyRefs: string[];
    contextRefs: string[];
    assurancePriorityRefs: string[];
    controlRefs: string[];
    decisionRefs: string[];
    evidenceRefs: string[];
    roadmapRefs: string[];
    maturationRefs: string[];
  };
  relationshipType: IntegrationRelationshipType;
  protectedManagementOutcome: string;
  evidenceOrIndicator: string;
  deteriorationTrigger: string;
  linkedDecisionRefs: string[];
  linkedControlRefs: string[];
  linkedAssurancePriorityRefs: string[];
  provenanceRefs: string[];
  supportStatus: PremiumSupportStatus;
}

export interface EnterpriseIntegrationMap {
  factRef: string;
  mapRef: string;
  mapVersion: typeof ENTERPRISE_INTEGRATION_MAP_VERSION;
  methodologyMapVersion: typeof LOOP_METHODOLOGY_MAP_VERSION;
  methodologyMapFingerprint: typeof LOOP_METHODOLOGY_MAP_FINGERPRINT;
  narrativeMode: NarrativeFactPack['narrativeMode'];
  organisationRef: string;
  assessmentRef: string;
  domainNodes: EnterpriseIntegrationDomainNode[];
  loopNodes: EnterpriseIntegrationLoopNode[];
  overlayNodes: EnterpriseIntegrationOverlayNode[];
  dependencies: EnterpriseIntegrationDependency[];
  generationRules: string[];
  sourceRefs: string[];
}

export interface NarrativeContextApplication {
  factRef: string;
  applicationRef: string;
  label: string;
  contextRefs: string[];
  contextKeys: string[];
  dependencyRefs: string[];
  contextBasis: string;
  analyticalConsequence: string;
  managementImplication: string;
  linkedPriorityRefs: string[];
  linkedControlRefs: string[];
  linkedDecisionRefs: string[];
  linkedRoadmapRefs: string[];
  linkedResilienceTestRefs: string[];
  provenanceRefs: string[];
  supportStatus: 'SUPPORTED';
}

/**
 * A supported operating-context pathway is narrower than a fraud scenario. It records how a
 * material change in the described operating model would alter management attention, without
 * alleging that the pathway currently exists as a finding or risk.
 */
export interface NarrativeExposurePathwayFact {
  factRef: string;
  pathwayRef: string;
  label: string;
  contextRefs: string[];
  contextKeys: string[];
  supportedExposureIds: OperatingExposureId[];
  questionSignalRefs: string[];
  domainRefs: string[];
  dependencyRefs: string[];
  linkedPriorityRefs: string[];
  linkedControlRefs: string[];
  linkedDecisionRefs: string[];
  linkedRoadmapRefs: string[];
  linkedResilienceTestRefs: string[];
  changeCondition: string;
  analyticalConsequence: string;
  managementImplication: string;
  conditionalBoundary: string;
  provenanceRefs: string[];
  supportStatus: 'SUPPORTED';
}

/**
 * A concentration view makes shared control reliance visible. It is derived from existing
 * dependency, pathway and control-outcome references; it does not create a new control or risk.
 */
export interface NarrativeControlRelianceFact {
  factRef: string;
  relianceRef: string;
  controlRef: string;
  relianceLevel: 'MULTI-ROUTE' | 'SINGLE-ROUTE';
  dependencyRefs: string[];
  exposurePathwayRefs: string[];
  protectedOutcomes: string[];
  managementSignal: string;
  relianceBasis: string;
  provenanceRefs: string[];
  supportStatus: 'SUPPORTED';
}

export interface NarrativeControlOutcomeLink {
  factRef: string;
  linkRef: string;
  controlRef: string;
  priorityRef: string;
  decisionRef: string;
  managementQuestion: string;
  evidenceOrIndicator: string;
  evidenceRefs: string[];
  protectedOutcome: string;
  deteriorationTrigger: string;
  responseRefs: string[];
  roadmapRefs: string[];
  resilienceTestRefs: string[];
  provenanceRefs: string[];
  supportStatus: 'SUPPORTED';
}

export interface NarrativeRoadmapDependencyLink {
  factRef: string;
  linkRef: string;
  roadmapRef: string;
  priorityRef: string;
  controlRef: string;
  decisionRefs: string[];
  maturationRefs: string[];
  dependencyRefs: string[];
  protectedOutcome: string;
  stageGate: string;
  nextStageUse: string;
  provenanceRefs: string[];
  supportStatus: 'SUPPORTED';
}

export interface ComprehensivePremiumProjection {
  assuranceCoverage: NarrativeAssuranceCoverageFact[];
  assurancePriorities: NarrativeAssurancePriorityFact[];
  resilienceTests: NarrativeResilienceTestFact[];
  enterpriseIntegrationMap: EnterpriseIntegrationMap;
  contextApplications: NarrativeContextApplication[];
  exposurePathways: NarrativeExposurePathwayFact[];
  criticalReliances: NarrativeControlRelianceFact[];
  controlOutcomeLinks: NarrativeControlOutcomeLink[];
  roadmapDependencyLinks: NarrativeRoadmapDependencyLink[];
}

interface PriorityLinks {
  priority: NarrativeSustainmentPriorityFact;
  assurance: NarrativeAssurancePriorityFact;
  control: NarrativeControlFact;
  decision: NarrativeDecisionFact;
  roadmap: NarrativeRoadmapFact;
  maturation: NarrativeMaturationStep[];
  proofRefs: string[];
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const contextFactRef = (fact: OperatingContextFact): string => `OPERATING-CONTEXT-${fact.key}`;

const LOOP_DEFINITIONS = [
  { loopRef: 'LOOP-GOVERN-DIRECT', label: 'GOVERN & DIRECT', methodologyRole: 'Set authority, current risk direction and escalation.', domainCodes: ['D1', 'D2'] },
  { loopRef: 'LOOP-PREVENT-DETECT', label: 'PREVENT & DETECT', methodologyRole: 'Prevent misuse and surface unusual activity for challenge.', domainCodes: ['D3', 'D4', 'D7', 'D8'] },
  { loopRef: 'LOOP-RESPOND-SURFACE', label: 'RESPOND & SURFACE', methodologyRole: 'Surface concerns, contain activity and protect response routes.', domainCodes: ['D5', 'D6'] },
  { loopRef: 'LOOP-LEARN-ADAPT', label: 'LEARN & ADAPT', methodologyRole: 'Refresh the risk view and improve the control environment from review signals.', domainCodes: ['D9', 'D10'] }
] as const;

const OVERLAY_DEFINITIONS = [
  {
    overlayRef: 'OVERLAY-THIRD-PARTY-SUPPLY-CHAIN',
    label: 'Third-party and supply-chain context',
    activationCondition: 'Affirmed external-supplier, procurement or intermediary exposure.',
    contextKeys: ['EXTERNAL_SUPPLIERS_PRESENT', 'SUPPLIER_MANAGEMENT_MODEL', 'PROCUREMENT_MODEL', 'INTERMEDIARY_EXPOSURE'] as const,
    domainCodes: ['D2', 'D7'],
    supportedFamilies: ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'THIRD_PARTY_OVERSIGHT'] as const
  },
  {
    overlayRef: 'OVERLAY-DIGITAL-IDENTITY',
    label: 'Digital and identity context',
    activationCondition: 'Affirmed digital-channel, payment, identity-data or remote-access exposure.',
    contextKeys: ['OPERATING_ENVIRONMENT', 'CUSTOMER_DIGITAL_CHANNELS', 'CUSTOMER_DIGITAL_PAYMENTS', 'PERSONAL_OR_IDENTITY_DATA', 'REMOTE_SYSTEM_OR_DATA_ACCESS'] as const,
    domainCodes: ['D2', 'D8'],
    supportedFamilies: ['IDENTITY_VERIFICATION', 'PRIVILEGED_ACCESS', 'ORDINARY_ACCESS', 'DETECTION_MONITORING'] as const
  },
  {
    overlayRef: 'OVERLAY-PHYSICAL-VALUE-ADJUSTMENT',
    label: 'Physical value and adjustment context',
    activationCondition: 'Affirmed physical-value, manual-adjustment, distributed-operation or higher-risk payment exposure.',
    contextKeys: ['PHYSICAL_CASH_EXPOSURE', 'STOCK_OR_PHYSICAL_ASSETS', 'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS', 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS', 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE', 'HIGHER_RISK_PAYMENT_APPROVAL_MODEL'] as const,
    domainCodes: ['D2', 'D3', 'D7'],
    supportedFamilies: ['CASH_CUSTODY', 'STOCK_ASSET_CUSTODY', 'PAYROLL_INTEGRITY'] as const
  }
] as const;

const contextMap = (pack: NarrativeFactPack): Map<string, OperatingContextFact> => new Map(pack.organisation.operatingContext.map((fact) => [fact.key, fact]));

function affirmedContextFacts(pack: NarrativeFactPack, keys: readonly string[]): OperatingContextFact[] {
  const byKey = contextMap(pack);
  return keys
    .map((key) => byKey.get(key))
    .filter((fact): fact is OperatingContextFact => Boolean(fact))
    .filter((fact) => fact.certainty === 'AFFIRMED' && fact.customerNarrativeAllowed);
}

function domainFor(pack: NarrativeFactPack, code: string): NarrativeFactPack['domains'][number] | undefined {
  return pack.domains.find((domain) => domain.code === code);
}

function loopForDomain(domainCode: string): (typeof LOOP_DEFINITIONS)[number] {
  return LOOP_DEFINITIONS.find((loop) => (loop.domainCodes as readonly string[]).includes(domainCode)) ?? LOOP_DEFINITIONS[0];
}

function buildAssurancePriorities(pack: NarrativeFactPack): NarrativeAssurancePriorityFact[] {
  return pack.sustainmentPriorities.map((priority, index) => {
    const domain = domainFor(pack, priority.sourceDomainCode ?? '') ?? pack.domains.find((candidate) => candidate.name === priority.domain);
    const dependencies = [...priority.dependencies];
    return {
      factRef: `ASSURANCE-PRIORITY-${String(index + 1).padStart(3, '0')}`,
      provenance: 'DERIVED_ANALYSIS',
      priorityId: `AP-${String(index + 1).padStart(2, '0')}`,
      priorityClass: dependencies.length ? 'RESILIENCE_DEPENDENCY' : priority.deteriorationTrigger ? 'DETERIORATION_WATCHPOINT' : 'ASSURANCE_PRIORITY',
      capability: priority.title,
      domainRef: domain?.factRef ?? '',
      domain: priority.domain,
      semanticFamily: priority.semanticFamily,
      recordedPosition: priority.recordedPosition,
      currentStandard: priority.currentStrongStandard,
      whyItMatters: priority.managementFocus,
      evidenceManagementShouldHold: [...priority.proofRetained],
      coverageExpectation: priority.operatingFrequency ? `Complete population across the ${priority.operatingFrequency.toLowerCase()} cycle.` : '',
      suggestedSamplingApproach: priority.proofRetained.length ? 'Management can sample the defined proof across the review period.' : '',
      reviewFrequency: priority.operatingFrequency,
      accountableExecutive: priority.accountableExecutive,
      oversightFunction: priority.processOwner,
      dependencies,
      deteriorationTrigger: priority.deteriorationTrigger,
      earlyWarningSignal: priority.effectivenessIndicator,
      effectivenessIndicator: priority.effectivenessIndicator,
      sourceRefs: unique([
        priority.factRef,
        priority.sourceId ?? '',
        priority.sourceFindingId ?? '',
        priority.sourceQuestionCode ?? '',
        priority.sourceDomainCode ?? '',
        domain?.factRef ?? ''
      ])
    };
  });
}

function buildAssuranceCoverage(pack: NarrativeFactPack, assurancePriorities: NarrativeAssurancePriorityFact[]): NarrativeAssuranceCoverageFact[] {
  return pack.domains.map((domain) => {
    const priority = assurancePriorities.find((candidate) => candidate.domainRef === domain.factRef);
    const posture = priority ? 'DEEP_DIVE_PRIORITY' : 'MAINTAIN';
    return {
      factRef: `ASSURANCE-COVERAGE-${domain.code}`,
      provenance: 'DERIVED_ANALYSIS',
      domainRef: domain.factRef,
      domainName: domain.name,
      score: domain.score,
      maturity: domain.maturity ?? pack.assessment.maturity ?? 'Not assigned',
      posture,
      capabilityToPreserve: priority?.capability ?? '',
      managementProof: priority?.evidenceManagementShouldHold.join('; ') ?? '',
      deteriorationSignal: priority?.deteriorationTrigger ?? '',
      reviewRhythm: priority?.reviewFrequency ?? '',
      traceability: unique([domain.factRef, priority?.factRef ?? '']),
      coverageNote: priority ? '' : 'Maintain through normal management review; no separate sustainment priority is recorded for this domain.',
      sourceRefs: unique([domain.factRef, priority?.factRef ?? ''])
    };
  });
}

function familyForPriority(priority: NarrativeSustainmentPriorityFact): string {
  return priority.semanticFamily;
}

function linksFor(pack: NarrativeFactPack, assurancePriorities: NarrativeAssurancePriorityFact[]): PriorityLinks[] {
  const controlsByPriority = new Map(pack.controls.flatMap((control) => control.linkedSustainmentPriorityRefs.map((priorityRef) => [priorityRef, control] as const)));
  const decisionsByPriority = new Map(pack.decisions.flatMap((decision) => decision.linkedSustainmentPriorityRefs.map((priorityRef) => [priorityRef, decision] as const)));
  const roadmapByPriority = new Map(pack.roadmap.flatMap((roadmap) => roadmap.sourceSustainmentPriorityRef ? [[roadmap.sourceSustainmentPriorityRef, roadmap] as const] : []));
  const maturationByControl = new Map<string, NarrativeMaturationStep[]>();
  for (const step of pack.maturationSteps) maturationByControl.set(step.linkedControlRef, [...(maturationByControl.get(step.linkedControlRef) ?? []), step]);
  const proofByPriority = new Map(pack.proofOfProgress.map((proof) => [proof.sourceId, proof]));
  return pack.sustainmentPriorities.flatMap((priority) => {
    const assurance = assurancePriorities.find((candidate) => candidate.sourceRefs.includes(priority.factRef));
    const control = controlsByPriority.get(priority.factRef);
    const decision = decisionsByPriority.get(priority.factRef);
    const roadmap = roadmapByPriority.get(priority.factRef);
    if (!assurance || !control || !decision || !roadmap) return [];
    return [{
      priority,
      assurance,
      control,
      decision,
      roadmap,
      maturation: maturationByControl.get(control.factRef) ?? [],
      proofRefs: proofByPriority.has(priority.factRef) ? [proofByPriority.get(priority.factRef)!.factRef] : []
    }];
  });
}

function resilienceSpec(family: string): { testId: string; managementTest: string; governanceRoute: string } {
  const specs: Record<string, { testId: string; managementTest: string; governanceRoute: string }> = {
    FRAUD_GOVERNANCE: {
      testId: 'RT-001',
      managementTest: 'Re-check the mandate, decision rights, overdue escalation and governing-body reporting.',
      governanceRoute: 'Route the result through the executive owner and the normal governing-body reporting cycle.'
    },
    CONTINUOUS_IMPROVEMENT: {
      testId: 'RT-002',
      managementTest: 'Re-check the review population, exception assignment, action closure and governance reporting.',
      governanceRoute: 'Route the result through the named process owner, control-effectiveness review and normal risk reporting.'
    },
    FRAUD_RISK_IDENTIFICATION: {
      testId: 'RT-003',
      managementTest: 'Re-check material-process coverage, risk and treatment currency, and the interim refresh trigger.',
      governanceRoute: 'Route the result through the named risk owner and the normal governance decision route.'
    }
  };
  return specs[family] ?? {
    testId: 'RT-00',
    managementTest: 'Re-check the recorded dependency, evidence and management response route.',
    governanceRoute: 'Route the result through the named owner and normal management review.'
  };
}

function buildResilienceTests(pack: NarrativeFactPack, links: PriorityLinks[]): NarrativeResilienceTestFact[] {
  return links.map(({ priority, assurance, control, decision, roadmap, proofRefs }) => {
    const spec = resilienceSpec(familyForPriority(priority));
    return {
      factRef: `RESILIENCE-TEST-${spec.testId.slice(-2)}`,
      provenance: 'DERIVED_ANALYSIS',
      testId: spec.testId,
      capability: priority.title,
      domainRef: assurance.domainRef,
      domain: priority.domain,
      readinessDependency: [...priority.dependencies],
      changeCondition: priority.deteriorationTrigger,
      managementTest: spec.managementTest,
      evidence: [...priority.proofRetained],
      effectivenessIndicator: priority.effectivenessIndicator,
      reviewRhythm: priority.operatingFrequency,
      response: {
        linkedDecisionRefs: [decision.factRef],
        linkedControlRefs: [control.factRef],
        linkedRoadmapRefs: [roadmap.factRef],
        governanceRoute: spec.governanceRoute
      },
      linkedAssurancePriorityRef: assurance.factRef,
      linkedPriorityRef: priority.factRef,
      linkedDecisionRefs: [decision.factRef],
      linkedControlRefs: [control.factRef],
      linkedRoadmapRefs: [roadmap.factRef],
      doesNotAssertFinding: true,
      supportStatus: 'CONDITIONAL',
      sourceRefs: unique([priority.factRef, assurance.factRef, control.factRef, decision.factRef, roadmap.factRef, ...proofRefs])
    };
  });
}

function contextRefs(pack: NarrativeFactPack, keys: readonly string[]): OperatingContextFact[] {
  return affirmedContextFacts(pack, keys);
}

function buildContextApplications(
  pack: NarrativeFactPack,
  integration: EnterpriseIntegrationMap,
  links: PriorityLinks[],
  resilienceTests: NarrativeResilienceTestFact[]
): NarrativeContextApplication[] {
  const byFamily = new Map(links.map((link) => [link.priority.semanticFamily, link]));
  const resilienceByControl = new Map(resilienceTests.flatMap((test) => test.linkedControlRefs.map((controlRef) => [controlRef, test] as const)));
  const edgeByRef = new Map(integration.dependencies.map((edge) => [edge.dependencyRef, edge]));
  const specs = [
    {
      label: 'Digital and identity relevance',
      keys: OVERLAY_DEFINITIONS[1].contextKeys,
      dependencyRefs: ['EIM-DEP-002'],
      linkedFamilies: ['FRAUD_RISK_IDENTIFICATION'],
      analyticalConsequence: 'Digital channels, payments, identity data and remote access make risk-view currency and ownership important when the operating model changes.',
      managementImplication: 'Management should use the current risk-view and change-triggered review routes when digital or identity processes change.'
    },
    {
      label: 'Third-party and supply-chain relevance',
      keys: OVERLAY_DEFINITIONS[0].contextKeys,
      dependencyRefs: ['EIM-DEP-002'],
      linkedFamilies: ['FRAUD_RISK_IDENTIFICATION'],
      analyticalConsequence: 'Supplier, procurement and intermediary reliance makes ownership, escalation and material-process coverage part of the current risk view.',
      managementImplication: 'Management should keep third-party change and overdue actions visible through the existing governance and risk-review routes.'
    },
    {
      label: 'Physical value and adjustment relevance',
      keys: OVERLAY_DEFINITIONS[2].contextKeys,
      dependencyRefs: ['EIM-DEP-003'],
      linkedFamilies: ['FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT'],
      analyticalConsequence: 'Physical value, manual adjustments and distributed or temporary operations increase the importance of current process coverage, review evidence and named action ownership.',
      managementImplication: 'Management should revisit process coverage and control-learning signals after material changes to physical-value or adjustment activity.'
    }
  ] as const;
  return specs.flatMap((spec, index) => {
    const facts = contextRefs(pack, spec.keys);
    const selected = spec.linkedFamilies.map((family) => byFamily.get(family)).filter((link): link is PriorityLinks => Boolean(link));
    const edges = spec.dependencyRefs.map((ref) => edgeByRef.get(ref)).filter((edge): edge is EnterpriseIntegrationDependency => Boolean(edge));
    if (!facts.length || !selected.length || edges.length !== spec.dependencyRefs.length || edges.some((edge) => edge.supportStatus !== 'SUPPORTED')) return [];
    const priorityRefs = unique(selected.map((link) => link.priority.factRef));
    const controlRefs = unique(selected.map((link) => link.control.factRef));
    const decisionRefs = unique(selected.map((link) => link.decision.factRef));
    const roadmapRefs = unique(selected.map((link) => link.roadmap.factRef));
    const resilienceRefs = unique(controlRefs.map((controlRef) => resilienceByControl.get(controlRef)?.factRef ?? ''));
    const dependencyRefs = edges.map((edge) => edge.dependencyRef);
    return [{
      factRef: `CONTEXT-APPLICATION-${String(index + 1).padStart(3, '0')}`,
      applicationRef: `CTX-APP-${String(index + 1).padStart(3, '0')}`,
      label: spec.label,
      contextRefs: facts.map(contextFactRef),
      contextKeys: facts.map((fact) => fact.key),
      dependencyRefs,
      contextBasis: facts.map((fact) => fact.key.replaceAll('_', ' ').toLowerCase()).join(', '),
      analyticalConsequence: spec.analyticalConsequence,
      managementImplication: spec.managementImplication,
      linkedPriorityRefs: priorityRefs,
      linkedControlRefs: controlRefs,
      linkedDecisionRefs: decisionRefs,
      linkedRoadmapRefs: roadmapRefs,
      linkedResilienceTestRefs: resilienceRefs,
      provenanceRefs: unique([
        ...facts.map(contextFactRef),
        ...edges.flatMap((edge) => edge.provenanceRefs),
        ...priorityRefs,
        ...controlRefs,
        ...decisionRefs,
        ...roadmapRefs,
        ...resilienceRefs
      ]),
      supportStatus: 'SUPPORTED'
    }];
  });
}

function integrationDependencyFactRef(dependencyRef: string): string {
  return `INTEGRATION-DEPENDENCY-${dependencyRef.slice(-3)}`;
}

function buildExposurePathways(
  pack: NarrativeFactPack,
  integration: EnterpriseIntegrationMap,
  applications: NarrativeContextApplication[]
): NarrativeExposurePathwayFact[] {
  const supportedExposureIds = new Set(exposuresFromContext(pack.organisation.operatingContext).map((exposure) => exposure.id));
  const questionSignals = pack.questionSignals ?? [];
  const specs = [
    {
      applicationRef: 'CTX-APP-001',
      pathwayRef: 'EXP-PATH-001',
      label: 'Digital and identity change pathway',
      exposureIds: ['DIGITAL_CUSTOMER_ACTIVITY', 'PERSONAL_DATA_HELD', 'THIRD_PARTY_DIGITAL_DEPENDENCE'] as OperatingExposureId[],
      domainCodes: ['D2'],
      changeCondition: 'A material change affects digital channels, digital payments, identity information or remote system access.',
      analyticalConsequence: 'The recorded digital and identity context makes risk-view currency the relevant management connection; the supported dependency is the route from current risk direction to owned treatment.',
      managementImplication: 'When digital or identity processes change, refresh the fraud-risk view before ownership or treatment decisions fall behind the operating model.'
    },
    {
      applicationRef: 'CTX-APP-002',
      pathwayRef: 'EXP-PATH-002',
      label: 'Third-party and supply-chain change pathway',
      exposureIds: ['INTERNAL_SUPPLIER_MANAGEMENT'] as OperatingExposureId[],
      domainCodes: ['D2'],
      changeCondition: 'A material change affects supplier, procurement or intermediary reliance.',
      analyticalConsequence: 'The recorded third-party context changes the coverage question for the supported risk-view dependency; the relevant test is whether material processes and treatment owners remain current.',
      managementImplication: 'When supplier, procurement or intermediary reliance changes, test material-process coverage and treatment ownership through the current risk review.'
    },
    {
      applicationRef: 'CTX-APP-003',
      pathwayRef: 'EXP-PATH-003',
      label: 'Physical value and adjustment change pathway',
      exposureIds: ['CASH_HANDLING', 'PHYSICAL_STOCK_OR_ASSETS', 'REFUNDS_AND_ADJUSTMENTS', 'DISTRIBUTED_OPERATIONS', 'TEMPORARY_OR_SUBCONTRACTED_WORKFORCE'] as OperatingExposureId[],
      domainCodes: ['D2', 'D10'],
      changeCondition: 'A material change affects physical cash, physical assets, manual adjustments, distributed operations or temporary and subcontracted work.',
      analyticalConsequence: 'The recorded physical-value context makes the supported learning dependency material: review information must refresh process coverage and action ownership when the activity changes.',
      managementImplication: 'When physical-value or adjustment activity changes across sites or workers, use control-learning signals to refresh coverage and action ownership.'
    }
  ] as const;
  const edgeByRef = new Map(integration.dependencies.map((edge) => [edge.dependencyRef, edge]));
  return specs.flatMap((spec, index) => {
    const application = applications.find((item) => item.applicationRef === spec.applicationRef);
    if (!application) return [];
    const edges = application.dependencyRefs.map((ref) => edgeByRef.get(ref)).filter((edge): edge is EnterpriseIntegrationDependency => Boolean(edge && edge.supportStatus === 'SUPPORTED'));
    if (edges.length !== application.dependencyRefs.length) return [];
    const domainRefs = unique(edges.flatMap((edge) => edge.contributingDomainRefs));
    const questionSignalRefs = questionSignals
      .filter((signal) => (spec.domainCodes as readonly string[]).includes(signal.domainCode))
      .map((signal) => signal.factRef);
    const pathwayExposureIds = spec.exposureIds.filter((id) => supportedExposureIds.has(id));
    const dependencyRefs = edges.map((edge) => edge.dependencyRef);
    const provenanceRefs = unique([
      application.factRef,
      ...application.provenanceRefs,
      ...questionSignalRefs,
      ...domainRefs,
      ...edges.flatMap((edge) => [integrationDependencyFactRef(edge.dependencyRef), ...edge.provenanceRefs])
    ]);
    return [{
      factRef: `EXPOSURE-PATHWAY-${String(index + 1).padStart(3, '0')}`,
      pathwayRef: spec.pathwayRef,
      label: spec.label,
      contextRefs: [...application.contextRefs],
      contextKeys: [...application.contextKeys],
      supportedExposureIds: pathwayExposureIds,
      questionSignalRefs,
      domainRefs,
      dependencyRefs,
      linkedPriorityRefs: [...application.linkedPriorityRefs],
      linkedControlRefs: [...application.linkedControlRefs],
      linkedDecisionRefs: [...application.linkedDecisionRefs],
      linkedRoadmapRefs: [...application.linkedRoadmapRefs],
      linkedResilienceTestRefs: [...application.linkedResilienceTestRefs],
      changeCondition: spec.changeCondition,
      analyticalConsequence: spec.analyticalConsequence,
      managementImplication: spec.managementImplication,
      conditionalBoundary: 'This is a forward-looking change test, not a current finding or risk.',
      provenanceRefs,
      supportStatus: 'SUPPORTED' as const
    }];
  });
}

function buildCriticalReliances(
  pack: NarrativeFactPack,
  integration: EnterpriseIntegrationMap,
  pathways: NarrativeExposurePathwayFact[],
  controlOutcomeLinks: NarrativeControlOutcomeLink[]
): NarrativeControlRelianceFact[] {
  return pack.controls.map((control, index) => {
    const dependencies = integration.dependencies.filter((edge) => edge.supportStatus === 'SUPPORTED' && edge.linkedControlRefs.includes(control.factRef));
    const linkedPathways = pathways.filter((pathway) => pathway.linkedControlRefs.includes(control.factRef));
    const outcomes = controlOutcomeLinks.filter((link) => link.controlRef === control.factRef).map((link) => link.protectedOutcome);
    const dependencyRefs = dependencies.map((edge) => edge.dependencyRef);
    const exposurePathwayRefs = linkedPathways.map((pathway) => pathway.factRef);
    const relianceLevel = dependencyRefs.length + exposurePathwayRefs.length > 1 ? 'MULTI-ROUTE' as const : 'SINGLE-ROUTE' as const;
    const routeCount = dependencyRefs.length + exposurePathwayRefs.length;
    return {
      factRef: `CONTROL-RELIANCE-${String(index + 1).padStart(3, '0')}`,
      relianceRef: `CR-${String(index + 1).padStart(2, '0')}`,
      controlRef: control.factRef,
      relianceLevel,
      dependencyRefs,
      exposurePathwayRefs,
      protectedOutcomes: unique(outcomes),
      managementSignal: control.effectivenessMeasure,
      relianceBasis: `This control is referenced by ${routeCount} supported management route${routeCount === 1 ? '' : 's'} across the integration view and operating-context pathways.`,
      provenanceRefs: unique([
        control.factRef,
        ...dependencyRefs.map(integrationDependencyFactRef),
        ...exposurePathwayRefs,
        ...controlOutcomeLinks.filter((link) => link.controlRef === control.factRef).map((link) => link.factRef)
      ]),
      supportStatus: 'SUPPORTED' as const
    };
  });
}

function buildIntegrationMap(
  pack: NarrativeFactPack,
  assuranceCoverage: NarrativeAssuranceCoverageFact[],
  links: PriorityLinks[]
): EnterpriseIntegrationMap {
  const coverageByDomain = new Map(assuranceCoverage.map((row) => [row.domainRef, row]));
  const priorityByFamily = new Map(links.map((link) => [link.priority.semanticFamily, link]));
  const domainNodes: EnterpriseIntegrationDomainNode[] = pack.domains.map((domain) => {
    const loop = loopForDomain(domain.code);
    const coverage = coverageByDomain.get(domain.factRef);
    return {
      domainRef: domain.factRef,
      domainName: domain.name,
      score: domain.score,
      maturity: domain.maturity,
      posture: coverage?.posture ?? 'MAINTAIN',
      primaryLoopRef: loop.loopRef,
      sourceRefs: unique([domain.factRef, coverage?.factRef ?? ''])
    };
  });
  const loopNodes: EnterpriseIntegrationLoopNode[] = LOOP_DEFINITIONS.map((loop) => ({
    loopRef: loop.loopRef,
    label: loop.label,
    methodologyRole: loop.methodologyRole,
    memberDomainRefs: loop.domainCodes.map((code) => domainFor(pack, code)?.factRef ?? '').filter(Boolean),
    sourceRefs: loop.domainCodes.map((code) => domainFor(pack, code)?.factRef ?? '').filter(Boolean)
  }));
  const overlayNodes: EnterpriseIntegrationOverlayNode[] = OVERLAY_DEFINITIONS.map((overlay) => {
    const facts = contextRefs(pack, overlay.contextKeys);
    const supportedLinks = links.filter((link) => overlay.supportedFamilies.some((family) => family === link.priority.semanticFamily));
    const status = !facts.length
      ? 'NOT_ESTABLISHED' as const
      : supportedLinks.length
        ? 'ACTIVE_SUPPORTED' as const
        : 'CONTEXT_ONLY' as const;
    return {
      overlayRef: overlay.overlayRef,
      label: overlay.label,
      activationCondition: overlay.activationCondition,
      contextRefs: facts.map(contextFactRef),
      supportedDomainRefs: status === 'ACTIVE_SUPPORTED' ? overlay.domainCodes.map((code) => domainFor(pack, code)?.factRef ?? '').filter(Boolean) : [],
      sourceRefs: unique([
        ...facts.map(contextFactRef),
        ...supportedLinks.flatMap((link) => [link.priority.factRef, link.control.factRef, link.decision.factRef])
      ]),
      status
    };
  });
  const overlayByRef = new Map(overlayNodes.map((overlay) => [overlay.overlayRef, overlay]));
  const edgeSpec = [
    {
      dependencyRef: 'EIM-DEP-001',
      domainCodes: ['D1'],
      loopRef: 'LOOP-GOVERN-DIRECT',
      overlayRefs: [],
      families: ['FRAUD_GOVERNANCE'],
      relationshipType: 'AUTHORITY_ENABLES' as const,
      outcome: 'Fraud-risk decisions retain named authority and a visible route to escalation as the organisation changes.',
      trigger: 'A material control action has no owner or is more than 30 days overdue.'
    },
    {
      dependencyRef: 'EIM-DEP-002',
      domainCodes: ['D2'],
      loopRef: 'LOOP-GOVERN-DIRECT',
      overlayRefs: [],
      families: ['FRAUD_RISK_IDENTIFICATION'],
      relationshipType: 'RISK_VIEW_DIRECTS' as const,
      outcome: 'Current fraud-risk direction gives management a visible basis for ownership, treatment and escalation.',
      trigger: 'A material change leaves risk treatment without a funded owner and due date, or the assessment is no longer current.'
    },
    {
      dependencyRef: 'EIM-DEP-003',
      domainCodes: ['D2', 'D10'],
      loopRef: 'LOOP-LEARN-ADAPT',
      overlayRefs: [],
      families: ['FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT'],
      relationshipType: 'LEARNING_UPDATES' as const,
      outcome: 'Review evidence and control-learning signals keep the fraud-risk view current and turn deterioration into owned management action.',
      trigger: 'A review is overdue, a key control has deteriorated without a named owner, or the risk view is no longer current after material change.'
    },
    {
      dependencyRef: 'EIM-DEP-004',
      domainCodes: ['D1', 'D10'],
      loopRef: 'LOOP-GOVERN-DIRECT',
      overlayRefs: [],
      families: ['FRAUD_GOVERNANCE', 'CONTINUOUS_IMPROVEMENT'],
      relationshipType: 'CONTROL_SIGNAL_FEEDS' as const,
      outcome: 'Control-effectiveness signals reach governance before deterioration becomes an unmanaged ownership or escalation issue.',
      trigger: 'A control-effectiveness indicator deteriorates, an action becomes overdue, or review information no longer reaches the normal governance route.'
    }
  ] as const;
  const dependencies = edgeSpec.map((spec) => {
    const selected = spec.families.map((family) => priorityByFamily.get(family)).filter((link): link is PriorityLinks => Boolean(link));
    const domainRefs = spec.domainCodes.map((code) => domainFor(pack, code)?.factRef ?? '').filter(Boolean);
    const assuranceRefs = selected.map((link) => link.assurance.factRef);
    const controlRefs = selected.map((link) => link.control.factRef);
    const decisionRefs = selected.map((link) => link.decision.factRef);
    const roadmapRefs = selected.map((link) => link.roadmap.factRef);
    const maturationRefs = selected.flatMap((link) => link.maturation.map((step) => step.maturationRef));
    const evidenceRefs = selected.flatMap((link) => link.proofRefs);
    const activeOverlayRefs = spec.overlayRefs.filter((ref) => overlayByRef.get(ref)?.status === 'ACTIVE_SUPPORTED');
    const contextRefs = activeOverlayRefs.flatMap((ref) => overlayByRef.get(ref)?.contextRefs ?? []);
    const sourceRefs = unique([...domainRefs, ...assuranceRefs, ...controlRefs, ...decisionRefs, ...roadmapRefs, ...maturationRefs, ...evidenceRefs, ...contextRefs]);
    const first = selected[0];
    return {
      dependencyRef: spec.dependencyRef,
      contributingDomainRefs: domainRefs,
      loopRef: spec.loopRef,
      overlayRefs: activeOverlayRefs,
      deterministicBasis: {
        domainRefs,
        semanticFamilyRefs: [...spec.families],
        contextRefs,
        assurancePriorityRefs: assuranceRefs,
        controlRefs,
        decisionRefs,
        evidenceRefs,
        roadmapRefs,
        maturationRefs
      },
      relationshipType: spec.relationshipType,
      protectedManagementOutcome: spec.outcome,
      evidenceOrIndicator: first ? `${first.control.effectivenessMeasure} Proof: ${first.control.proofRetained.join('; ')}.` : '',
      deteriorationTrigger: spec.trigger,
      linkedDecisionRefs: decisionRefs,
      linkedControlRefs: controlRefs,
      linkedAssurancePriorityRefs: assuranceRefs,
      provenanceRefs: sourceRefs,
      supportStatus: selected.length === spec.families.length && domainRefs.length === spec.domainCodes.length ? 'SUPPORTED' as const : 'NOT_ESTABLISHED' as const
    };
  });
  return {
    factRef: 'ENTERPRISE-INTEGRATION-MAP-001',
    mapRef: `EIM-${pack.assessment.reference}`,
    mapVersion: ENTERPRISE_INTEGRATION_MAP_VERSION,
    methodologyMapVersion: LOOP_METHODOLOGY_MAP_VERSION,
    methodologyMapFingerprint: LOOP_METHODOLOGY_MAP_FINGERPRINT,
    narrativeMode: pack.narrativeMode,
    organisationRef: pack.organisation.name,
    assessmentRef: pack.assessment.reference,
    domainNodes,
    loopNodes,
    overlayNodes,
    dependencies,
    generationRules: [
      'Include one node for every scored domain, including domains without a supported dependency edge.',
      'Show only relationships supported by the recorded priority, control, decision, evidence, roadmap and context references.',
      'Use the operating context only where it changes the interpretation of a dependency or management priority.',
      'The writer may explain a supplied relationship but may not create, relabel, rewire or strengthen it.'
    ],
    sourceRefs: unique([...domainNodes.flatMap((node) => node.sourceRefs), ...dependencies.flatMap((edge) => edge.provenanceRefs)])
  };
}

function buildControlOutcomeLinks(links: PriorityLinks[], resilienceTests: NarrativeResilienceTestFact[]): NarrativeControlOutcomeLink[] {
  const resilienceByControl = new Map(resilienceTests.flatMap((test) => test.linkedControlRefs.map((controlRef) => [controlRef, test] as const)));
  const specs: Record<string, { managementQuestion: string; protectedOutcome: string }> = {
    FRAUD_GOVERNANCE: {
      managementQuestion: 'Is authority and escalation still visible as the organisation changes?',
      protectedOutcome: 'Governance decisions reach the appropriate oversight route before ownership or action load becomes unclear.'
    },
    CONTINUOUS_IMPROVEMENT: {
      managementQuestion: 'Is control-effectiveness learning reaching management while the control environment remains current?',
      protectedOutcome: 'Review evidence produces timely, owned learning rather than remaining a disconnected record.'
    },
    FRAUD_RISK_IDENTIFICATION: {
      managementQuestion: 'Does the fraud-risk view still reflect the current operating model?',
      protectedOutcome: 'Management decisions use a current risk view with visible treatment ownership.'
    }
  };
  return links.map(({ priority, control, decision, roadmap, proofRefs }) => {
    const spec = specs[priority.semanticFamily] ?? { managementQuestion: 'What management signal should remain current?', protectedOutcome: 'The recorded management standard remains visible and owned.' };
    const resilience = resilienceByControl.get(control.factRef);
    return {
      factRef: `CONTROL-OUTCOME-${control.factRef.slice(-3)}`,
      linkRef: `COL-${control.factRef.slice(-3)}`,
      controlRef: control.factRef,
      priorityRef: priority.factRef,
      decisionRef: decision.factRef,
      managementQuestion: spec.managementQuestion,
      evidenceOrIndicator: `${control.effectivenessMeasure} Proof: ${control.proofRetained.join('; ')}.`,
      evidenceRefs: proofRefs,
      protectedOutcome: spec.protectedOutcome,
      deteriorationTrigger: control.escalationTrigger,
      responseRefs: [roadmap.factRef, resilience?.factRef ?? ''].filter(Boolean),
      roadmapRefs: [roadmap.factRef],
      resilienceTestRefs: resilience ? [resilience.factRef] : [],
      provenanceRefs: unique([priority.factRef, control.factRef, decision.factRef, roadmap.factRef, resilience?.factRef ?? '', ...proofRefs]),
      supportStatus: 'SUPPORTED'
    };
  });
}

function buildRoadmapDependencyLinks(links: PriorityLinks[]): NarrativeRoadmapDependencyLink[] {
  return links.map(({ priority, control, decision, roadmap, maturation }) => {
    const embed = maturation.filter((step) => step.phase === 'EMBED');
    const mature = maturation.filter((step) => step.phase === 'MATURE');
    const nextStage = embed[0];
    return {
      factRef: `ROADMAP-DEPENDENCY-${roadmap.factRef.slice(-3)}`,
      linkRef: `RDL-${roadmap.factRef.slice(-3)}`,
      roadmapRef: roadmap.factRef,
      priorityRef: priority.factRef,
      controlRef: control.factRef,
      decisionRefs: [decision.factRef],
      maturationRefs: maturation.map((step) => step.maturationRef),
      dependencyRefs: unique([...roadmap.dependencies, ...maturation.map((step) => step.dependency)]),
      protectedOutcome: control.targetState,
      stageGate: nextStage?.dependency ?? 'The first operating-cycle record is available before the next maturation stage becomes useful.',
      nextStageUse: mature[0]?.dependency ?? 'The embedded cycle remains repeatable and its effectiveness information is available for management review.',
      provenanceRefs: unique([roadmap.factRef, priority.factRef, control.factRef, decision.factRef, ...maturation.map((step) => step.maturationRef)]),
      supportStatus: 'SUPPORTED'
    };
  });
}

export function buildComprehensivePremiumProjection(pack: NarrativeFactPack): ComprehensivePremiumProjection {
  if (pack.productTier !== 'comprehensive' || pack.narrativeMode !== 'SUSTAINMENT') {
    throw new Error('Comprehensive premium projection is only available for a Comprehensive Sustainment Fact Pack.');
  }
  const assurancePriorities = buildAssurancePriorities(pack);
  const assuranceCoverage = buildAssuranceCoverage(pack, assurancePriorities);
  const links = linksFor(pack, assurancePriorities);
  const enterpriseIntegrationMap = buildIntegrationMap(pack, assuranceCoverage, links);
  const resilienceTests = buildResilienceTests(pack, links);
  const contextApplications = buildContextApplications(pack, enterpriseIntegrationMap, links, resilienceTests);
  const exposurePathways = buildExposurePathways(pack, enterpriseIntegrationMap, contextApplications);
  const controlOutcomeLinks = buildControlOutcomeLinks(links, resilienceTests);
  const criticalReliances = buildCriticalReliances(pack, enterpriseIntegrationMap, exposurePathways, controlOutcomeLinks);
  const roadmapDependencyLinks = buildRoadmapDependencyLinks(links);
  return { assuranceCoverage, assurancePriorities, resilienceTests, enterpriseIntegrationMap, contextApplications, exposurePathways, criticalReliances, controlOutcomeLinks, roadmapDependencyLinks };
}

function fact(value: unknown, kind: string, id: string, sourceRefs: string[]): NarrativeFact {
  return { id, kind, value, sourceRefs: unique(sourceRefs) };
}

export function premiumFactEntries(projection: ComprehensivePremiumProjection): NarrativeFact[] {
  const map = projection.enterpriseIntegrationMap;
  const entries: NarrativeFact[] = [
    ...projection.assuranceCoverage.map((item) => fact(item, 'assurance_coverage', item.factRef, item.sourceRefs)),
    ...projection.assurancePriorities.map((item) => fact(item, 'assurance_priority', item.factRef, item.sourceRefs)),
    ...projection.resilienceTests.map((item) => fact(item, 'resilience_test', item.factRef, item.sourceRefs)),
    fact(map, 'enterprise_integration_map', map.factRef, map.sourceRefs),
    ...map.dependencies.map((item) => fact(item, 'integration_dependency', `INTEGRATION-DEPENDENCY-${item.dependencyRef.slice(-3)}`, item.provenanceRefs)),
    ...projection.contextApplications.map((item) => fact(item, 'context_application', item.factRef, item.provenanceRefs)),
    ...projection.exposurePathways.map((item) => fact(item, 'exposure_pathway', item.factRef, item.provenanceRefs)),
    ...projection.criticalReliances.map((item) => fact(item, 'critical_reliance', item.factRef, item.provenanceRefs)),
    ...projection.controlOutcomeLinks.map((item) => fact(item, 'control_outcome_link', item.factRef, item.provenanceRefs)),
    ...projection.roadmapDependencyLinks.map((item) => fact(item, 'roadmap_dependency_link', item.factRef, item.provenanceRefs))
  ];
  return entries;
}

function premiumFactRefs(pack: NarrativeFactPack): Set<string> {
  return new Set(pack.facts.filter((fact) => ['assurance_coverage', 'assurance_priority', 'resilience_test', 'enterprise_integration_map', 'integration_dependency', 'context_application', 'exposure_pathway', 'critical_reliance', 'control_outcome_link', 'roadmap_dependency_link'].includes(fact.kind)).map((fact) => fact.id));
}

export function premiumProjectionValidationIssues(pack: NarrativeFactPack): string[] {
  if (pack.productTier !== 'comprehensive' || pack.narrativeMode !== 'SUSTAINMENT') return [];
  const issues: string[] = [];
  const map = pack.enterpriseIntegrationMap;
  if (!map) return ['Comprehensive Sustainment Fact Pack is missing the Enterprise Fraud Readiness Integration Map.'];
  const sourceRefs = new Set(pack.facts.flatMap((entry) => [entry.id, ...entry.sourceRefs]));
  const allControlRefs = new Set(pack.controls.map((control) => control.factRef));
  const allDecisionRefs = new Set(pack.decisions.map((decision) => decision.factRef));
  const allRoadmapRefs = new Set(pack.roadmap.map((roadmap) => roadmap.factRef));
  const allPriorityRefs = new Set(pack.sustainmentPriorities.map((priority) => priority.factRef));
  const allDomainRefs = new Set(pack.domains.map((domain) => domain.factRef));
  const allContextRefs = new Set(pack.organisation.operatingContext.map(contextFactRef));
  const allQuestionSignalRefs = new Set((pack.questionSignals ?? []).map((signal) => signal.factRef));
  const allExposurePathwayRefs = new Set((pack.exposurePathways ?? []).map((pathway) => pathway.factRef));
  const knownPremiumRefs = premiumFactRefs(pack);
  if (map.domainNodes.length !== pack.domains.length || new Set(map.domainNodes.map((node) => node.domainRef)).size !== pack.domains.length) issues.push('Enterprise Integration Map must contain exactly one node for every scored domain.');
  if (!map.dependencies.length) issues.push('Enterprise Integration Map must contain at least one supported relationship.');
  for (const node of map.domainNodes) {
    if (!allDomainRefs.has(node.domainRef) || !node.primaryLoopRef || !node.sourceRefs.length) issues.push(`Integration domain node ${node.domainRef} is not fully sourced.`);
  }
  for (const edge of map.dependencies) {
    if (edge.supportStatus === 'NOT_ESTABLISHED') {
      if (edge.linkedControlRefs.length || edge.linkedDecisionRefs.length || edge.linkedAssurancePriorityRefs.length) issues.push(`Unestablished integration relationship ${edge.dependencyRef} exposes customer links.`);
      continue;
    }
    if (!edge.provenanceRefs.length || edge.supportStatus !== 'SUPPORTED') issues.push(`Integration relationship ${edge.dependencyRef} is not supported with provenance.`);
    if (edge.contributingDomainRefs.some((ref) => !allDomainRefs.has(ref))) issues.push(`Integration relationship ${edge.dependencyRef} points to a missing domain.`);
    if (edge.linkedControlRefs.some((ref) => !allControlRefs.has(ref)) || edge.linkedDecisionRefs.some((ref) => !allDecisionRefs.has(ref))) issues.push(`Integration relationship ${edge.dependencyRef} points to a missing control or decision.`);
    if (edge.linkedAssurancePriorityRefs.some((ref) => !knownPremiumRefs.has(ref))) issues.push(`Integration relationship ${edge.dependencyRef} points to a missing assurance priority fact.`);
    if (edge.deterministicBasis.contextRefs.some((ref) => !allContextRefs.has(ref))) issues.push(`Integration relationship ${edge.dependencyRef} points to a missing context fact.`);
    if (!edge.protectedManagementOutcome || !edge.evidenceOrIndicator || !edge.deteriorationTrigger) issues.push(`Integration relationship ${edge.dependencyRef} is missing outcome, indicator or trigger.`);
  }
  for (const test of pack.resilienceTests ?? []) {
    if (!test.changeCondition || !test.readinessDependency.length || !test.managementTest || !test.evidence.length || !test.sourceRefs.length || !test.doesNotAssertFinding || !test.linkedPriorityRef) issues.push(`Resilience test ${test.testId} is missing deterministic basis or boundary.`);
    if (test.linkedControlRefs.some((ref) => !allControlRefs.has(ref)) || test.linkedDecisionRefs.some((ref) => !allDecisionRefs.has(ref)) || test.linkedRoadmapRefs.some((ref) => !allRoadmapRefs.has(ref))) issues.push(`Resilience test ${test.testId} points to a missing response object.`);
  }
  for (const application of pack.contextApplications ?? []) {
    if (!application.contextRefs.length || application.contextRefs.some((ref) => !allContextRefs.has(ref)) || !application.dependencyRefs.length || !application.analyticalConsequence || !application.managementImplication || !application.provenanceRefs.length) issues.push(`Context application ${application.applicationRef} is not a context → consequence → implication chain.`);
    if (application.contextRefs.length >= pack.organisation.operatingContext.length) issues.push(`Context application ${application.applicationRef} is a context dump rather than a selective implication.`);
  }
  for (const pathway of pack.exposurePathways ?? []) {
    if (!pathway.contextRefs.length || pathway.contextRefs.some((ref) => !allContextRefs.has(ref)) || !pathway.questionSignalRefs.length || pathway.questionSignalRefs.some((ref) => !allQuestionSignalRefs.has(ref)) || !pathway.domainRefs.length || pathway.domainRefs.some((ref) => !allDomainRefs.has(ref)) || !pathway.dependencyRefs.length || !pathway.linkedControlRefs.length || !pathway.linkedDecisionRefs.length || !pathway.linkedRoadmapRefs.length || !pathway.changeCondition || !pathway.analyticalConsequence || !pathway.managementImplication || !pathway.conditionalBoundary || !pathway.provenanceRefs.length) {
      issues.push(`Exposure pathway ${pathway.pathwayRef} is missing a supported context → evidence → consequence → management chain.`);
    }
    if (pathway.linkedControlRefs.some((ref) => !allControlRefs.has(ref)) || pathway.linkedDecisionRefs.some((ref) => !allDecisionRefs.has(ref)) || pathway.linkedRoadmapRefs.some((ref) => !allRoadmapRefs.has(ref))) issues.push(`Exposure pathway ${pathway.pathwayRef} points to a missing management object.`);
    if (pathway.provenanceRefs.some((ref) => !sourceRefs.has(ref))) issues.push(`Exposure pathway ${pathway.pathwayRef} contains unknown provenance.`);
  }
  for (const reliance of pack.criticalReliances ?? []) {
    if (!allControlRefs.has(reliance.controlRef) || !reliance.dependencyRefs.length || !reliance.managementSignal || !reliance.relianceBasis || !reliance.provenanceRefs.length) issues.push(`Control reliance ${reliance.relianceRef} is incomplete.`);
    if (reliance.exposurePathwayRefs.some((ref) => !allExposurePathwayRefs.has(ref))) issues.push(`Control reliance ${reliance.relianceRef} points to a missing exposure pathway.`);
    if (reliance.provenanceRefs.some((ref) => !sourceRefs.has(ref))) issues.push(`Control reliance ${reliance.relianceRef} contains unknown provenance.`);
  }
  for (const link of pack.controlOutcomeLinks ?? []) {
    if (!allControlRefs.has(link.controlRef) || !allDecisionRefs.has(link.decisionRef) || !allPriorityRefs.has(link.priorityRef) || !link.provenanceRefs.length || !link.protectedOutcome || !link.managementQuestion) issues.push(`Control outcome link ${link.linkRef} is incomplete.`);
  }
  for (const link of pack.roadmapDependencyLinks ?? []) {
    if (!allRoadmapRefs.has(link.roadmapRef) || !allControlRefs.has(link.controlRef) || !allPriorityRefs.has(link.priorityRef) || !link.maturationRefs.length || !link.stageGate || !link.nextStageUse || !link.provenanceRefs.length) issues.push(`Roadmap dependency link ${link.linkRef} is incomplete.`);
  }
  const premiumObjects = [
    ...(pack.assurancePriorities ?? []),
    ...(pack.assuranceCoverage ?? []),
    ...(pack.resilienceTests ?? []),
    ...(pack.contextApplications ?? []),
    ...(pack.exposurePathways ?? []),
    ...(pack.criticalReliances ?? []),
    ...(pack.controlOutcomeLinks ?? []),
    ...(pack.roadmapDependencyLinks ?? [])
  ];
  const sourceIssues = premiumObjects.flatMap((item) => {
    const refs = 'sourceRefs' in item ? item.sourceRefs : item.provenanceRefs;
    return refs.filter((ref) => !sourceRefs.has(ref));
  });
  if (sourceIssues.length) issues.push(`Premium objects contain unknown source references: ${unique(sourceIssues).join(', ')}`);
  return unique(issues);
}

export function assertComprehensivePremiumProjection(pack: NarrativeFactPack): void {
  const issues = premiumProjectionValidationIssues(pack);
  if (issues.length) throw new Error(`Comprehensive premium projection validation failed: ${issues.join(' | ')}`);
  if (pack.findings.length || pack.risks.length || pack.scenarios.length || pack.systemicThemeInputs.length) throw new Error('Comprehensive Sustainment premium projection may not manufacture findings, risks, scenarios or weakness themes.');
}

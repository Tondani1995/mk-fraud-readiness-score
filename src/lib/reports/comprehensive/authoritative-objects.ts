import type {
  NarrativeControlFact,
  NarrativeDecisionFact,
  NarrativeFactPack,
  NarrativeRoadmapFact
} from '../narrative/fact-pack';
import type { NarrativeMaturationStep } from '../narrative/maturation';
import type { ReportBlueprint } from '../narrative/report-blueprint';
import type {
  EnterpriseIntegrationMap,
  NarrativeAssuranceCoverageFact,
  NarrativeAssurancePriorityFact,
  NarrativeContextApplication,
  NarrativeControlOutcomeLink,
  NarrativeControlRelianceFact,
  NarrativeExposurePathwayFact,
  NarrativeResilienceTestFact,
  NarrativeRoadmapDependencyLink
} from '../narrative/premium-projection';

/**
 * Shared deterministic management objects consumed by both the customer PDF
 * presentation model and the companion workbook. The Fact Pack remains the
 * source of truth; this seam prevents either renderer from rebuilding a
 * second set of controls, decisions or implementation records.
 */
export interface AuthoritativeComprehensiveObjects {
  controls: readonly NarrativeControlFact[];
  decisions: readonly NarrativeDecisionFact[];
  roadmap: readonly NarrativeRoadmapFact[];
  maturationSteps: readonly NarrativeMaturationStep[];
  assuranceCoverage?: readonly NarrativeAssuranceCoverageFact[];
  assurancePriorities?: readonly NarrativeAssurancePriorityFact[];
  resilienceTests?: readonly NarrativeResilienceTestFact[];
  enterpriseIntegrationMap?: EnterpriseIntegrationMap;
  contextApplications?: readonly NarrativeContextApplication[];
  exposurePathways?: readonly NarrativeExposurePathwayFact[];
  criticalReliances?: readonly NarrativeControlRelianceFact[];
  controlOutcomeLinks?: readonly NarrativeControlOutcomeLink[];
  roadmapDependencyLinks?: readonly NarrativeRoadmapDependencyLink[];
  transformationSequence: ReportBlueprint['transformationSequence'];
}

function cloneControl(control: NarrativeControlFact): NarrativeControlFact {
  return {
    ...control,
    proofRetained: [...control.proofRetained],
    dependencies: [...control.dependencies],
    linkedFindingRefs: [...control.linkedFindingRefs],
    linkedSustainmentPriorityRefs: [...control.linkedSustainmentPriorityRefs]
  };
}

function cloneDecision(decision: NarrativeDecisionFact): NarrativeDecisionFact {
  return {
    ...decision,
    options: decision.options.map((option) => ({ ...option })),
    linkedFindingRefs: [...decision.linkedFindingRefs],
    linkedSustainmentPriorityRefs: [...decision.linkedSustainmentPriorityRefs]
  };
}

function cloneRoadmap(item: NarrativeRoadmapFact): NarrativeRoadmapFact {
  return { ...item, dependencies: [...item.dependencies] };
}

function cloneMaturation(item: NarrativeMaturationStep): NarrativeMaturationStep {
  return { ...item };
}

function cloneIntegrationMap(map: EnterpriseIntegrationMap): EnterpriseIntegrationMap {
  return {
    ...map,
    domainNodes: map.domainNodes.map((node) => ({ ...node, sourceRefs: [...node.sourceRefs] })),
    loopNodes: map.loopNodes.map((node) => ({ ...node, memberDomainRefs: [...node.memberDomainRefs], sourceRefs: [...node.sourceRefs] })),
    overlayNodes: map.overlayNodes.map((node) => ({ ...node, contextRefs: [...node.contextRefs], supportedDomainRefs: [...node.supportedDomainRefs], sourceRefs: [...node.sourceRefs] })),
    dependencies: map.dependencies.map((dependency) => ({
      ...dependency,
      contributingDomainRefs: [...dependency.contributingDomainRefs],
      overlayRefs: [...dependency.overlayRefs],
      deterministicBasis: {
        domainRefs: [...dependency.deterministicBasis.domainRefs],
        semanticFamilyRefs: [...dependency.deterministicBasis.semanticFamilyRefs],
        contextRefs: [...dependency.deterministicBasis.contextRefs],
        assurancePriorityRefs: [...dependency.deterministicBasis.assurancePriorityRefs],
        controlRefs: [...dependency.deterministicBasis.controlRefs],
        decisionRefs: [...dependency.deterministicBasis.decisionRefs],
        evidenceRefs: [...dependency.deterministicBasis.evidenceRefs],
        roadmapRefs: [...dependency.deterministicBasis.roadmapRefs],
        maturationRefs: [...dependency.deterministicBasis.maturationRefs]
      },
      linkedDecisionRefs: [...dependency.linkedDecisionRefs],
      linkedControlRefs: [...dependency.linkedControlRefs],
      linkedAssurancePriorityRefs: [...dependency.linkedAssurancePriorityRefs],
      provenanceRefs: [...dependency.provenanceRefs]
    })),
    generationRules: [...map.generationRules],
    sourceRefs: [...map.sourceRefs]
  };
}

export function buildAuthoritativeComprehensiveObjects(
  factPack: NarrativeFactPack,
  blueprint?: Pick<ReportBlueprint, 'transformationSequence'>
): AuthoritativeComprehensiveObjects {
  const decisions = factPack.decisions.map(cloneDecision);
  const decisionRefs = decisions.map((decision) => decision.factRef);
  const sourceDecisionIds = decisions.map((decision) => decision.sourceId);
  if (new Set(decisionRefs).size !== decisionRefs.length || new Set(sourceDecisionIds).size !== sourceDecisionIds.length) {
    throw new Error('Authoritative Comprehensive decisions must have unique fact and source IDs.');
  }

  const controls = factPack.controls.map(cloneControl);
  const controlRefs = controls.map((control) => control.factRef);
  if (new Set(controlRefs).size !== controlRefs.length) {
    throw new Error('Authoritative Comprehensive controls must have unique fact references.');
  }

  const premium = factPack.enterpriseIntegrationMap ? {
    assuranceCoverage: factPack.assuranceCoverage?.map((item) => ({ ...item, traceability: [...item.traceability], sourceRefs: [...item.sourceRefs] })),
    assurancePriorities: factPack.assurancePriorities?.map((item) => ({ ...item, evidenceManagementShouldHold: [...item.evidenceManagementShouldHold], dependencies: [...item.dependencies], sourceRefs: [...item.sourceRefs] })),
    resilienceTests: factPack.resilienceTests?.map((item) => ({
      ...item,
      readinessDependency: [...item.readinessDependency],
      evidence: [...item.evidence],
      response: {
        ...item.response,
        linkedDecisionRefs: [...item.response.linkedDecisionRefs],
        linkedControlRefs: [...item.response.linkedControlRefs],
        linkedRoadmapRefs: [...item.response.linkedRoadmapRefs]
      },
      linkedDecisionRefs: [...item.linkedDecisionRefs],
      linkedControlRefs: [...item.linkedControlRefs],
      linkedRoadmapRefs: [...item.linkedRoadmapRefs],
      sourceRefs: [...item.sourceRefs]
    })),
    enterpriseIntegrationMap: cloneIntegrationMap(factPack.enterpriseIntegrationMap),
    contextApplications: factPack.contextApplications?.map((item) => ({
      ...item,
      contextRefs: [...item.contextRefs],
      contextKeys: [...item.contextKeys],
      dependencyRefs: [...item.dependencyRefs],
      linkedPriorityRefs: [...item.linkedPriorityRefs],
      linkedControlRefs: [...item.linkedControlRefs],
      linkedDecisionRefs: [...item.linkedDecisionRefs],
      linkedRoadmapRefs: [...item.linkedRoadmapRefs],
      linkedResilienceTestRefs: [...item.linkedResilienceTestRefs],
      provenanceRefs: [...item.provenanceRefs]
    })),
    exposurePathways: factPack.exposurePathways?.map((item) => ({
      ...item,
      contextRefs: [...item.contextRefs],
      contextKeys: [...item.contextKeys],
      supportedExposureIds: [...item.supportedExposureIds],
      questionSignalRefs: [...item.questionSignalRefs],
      domainRefs: [...item.domainRefs],
      dependencyRefs: [...item.dependencyRefs],
      linkedPriorityRefs: [...item.linkedPriorityRefs],
      linkedControlRefs: [...item.linkedControlRefs],
      linkedDecisionRefs: [...item.linkedDecisionRefs],
      linkedRoadmapRefs: [...item.linkedRoadmapRefs],
      linkedResilienceTestRefs: [...item.linkedResilienceTestRefs],
      provenanceRefs: [...item.provenanceRefs]
    })),
    criticalReliances: factPack.criticalReliances?.map((item) => ({
      ...item,
      dependencyRefs: [...item.dependencyRefs],
      exposurePathwayRefs: [...item.exposurePathwayRefs],
      protectedOutcomes: [...item.protectedOutcomes],
      provenanceRefs: [...item.provenanceRefs]
    })),
    controlOutcomeLinks: factPack.controlOutcomeLinks?.map((item) => ({
      ...item,
      evidenceRefs: [...item.evidenceRefs],
      responseRefs: [...item.responseRefs],
      roadmapRefs: [...item.roadmapRefs],
      resilienceTestRefs: [...item.resilienceTestRefs],
      provenanceRefs: [...item.provenanceRefs]
    })),
    roadmapDependencyLinks: factPack.roadmapDependencyLinks?.map((item) => ({
      ...item,
      decisionRefs: [...item.decisionRefs],
      maturationRefs: [...item.maturationRefs],
      dependencyRefs: [...item.dependencyRefs],
      provenanceRefs: [...item.provenanceRefs]
    }))
  } : {};

  return {
    controls,
    decisions,
    roadmap: factPack.roadmap.map(cloneRoadmap),
    maturationSteps: factPack.maturationSteps.map(cloneMaturation),
    ...premium,
    transformationSequence: blueprint?.transformationSequence.map((stage) => ({ ...stage, sourceRefs: [...stage.sourceRefs] })) ?? []
  };
}

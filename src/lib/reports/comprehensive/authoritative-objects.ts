import type {
  NarrativeControlFact,
  NarrativeDecisionFact,
  NarrativeFactPack,
  NarrativeRoadmapFact
} from '../narrative/fact-pack';
import type { NarrativeMaturationStep } from '../narrative/maturation';
import type { ReportBlueprint } from '../narrative/report-blueprint';

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

  return {
    controls,
    decisions,
    roadmap: factPack.roadmap.map(cloneRoadmap),
    maturationSteps: factPack.maturationSteps.map(cloneMaturation),
    transformationSequence: blueprint?.transformationSequence.map((stage) => ({ ...stage, sourceRefs: [...stage.sourceRefs] })) ?? []
  };
}

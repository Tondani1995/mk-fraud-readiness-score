import type { AssembledReportData, RoadmapItem } from './types';
import { buildAdvisoryEvidenceModel } from './evidence-model';
import type { RoadmapAction } from './evidence-model';
import { orderRoadmapActions } from './evidence-model/roadmap-dependencies';

/**
 * The sole V7 legacy compatibility adapter. Every rendered row is derived from one authoritative
 * AdvisoryEvidenceModel.roadmapActions entry; no domain rescoring or second ranking occurs here.
 */
export function adaptAdvisoryRoadmapToLegacyAgenda(actions: RoadmapAction[]): { agenda: RoadmapItem[] } {
  // Validate the dependency graph before deriving anything customer-facing. The authoritative
  // builder already supplies topological order; this call is deliberately used as a fail-closed
  // validator so adapter identity/order remain unchanged for every valid source.
  orderRoadmapActions(actions);
  return {
    agenda: actions.map((action, index) => ({
      ruleCode: action.id,
      domainCode: action.domainCode,
      domainName: action.domainName,
      ownerRole: action.processOwner,
      rationale: action.dependencyIds.length > 0
        ? 'Sequenced after prerequisite action(s) ' + action.dependencyIds.join(', ') + '.'
        : 'Sequenced from the authoritative roadmap using hard-gate, maturity-cap, target-period and dependency urgency.',
      severity: action.period === '30 days' ? 'Immediate priority' : action.period === '60 days' ? 'Near-term priority' : '90-day priority',
      action30: action.period === '30 days' ? action.deliverable : null,
      action60: action.period === '60 days' ? action.deliverable : null,
      action90: action.period === '90 days' ? action.deliverable : null,
      priorityScore: actions.length - index,
      authoritativeActionIds: [action.id]
    }))
  };
}

/**
 * Backward-compatible entrypoint for callers not yet holding the advisory model. It builds that
 * model and immediately adapts its authoritative roadmap; it never selects or ranks a second one.
 */
export function selectRoadmap(data: AssembledReportData): { agenda: RoadmapItem[] } {
  return adaptAdvisoryRoadmapToLegacyAgenda(buildAdvisoryEvidenceModel(data).roadmapActions);
}

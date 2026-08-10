import type { ControlImprovementEntry, PlausibleScenario, RiskRegisterEntry, RoadmapAction } from '../evidence-model/types';
import type { ComprehensiveDeliveryModel, ComprehensiveFindingView, EvidenceRequestPackItem } from './types';

export const COMPREHENSIVE_L2_LIMITS = {
  findings: 20,
  risks: 12,
  scenarios: 8,
  controlActions: 20,
  roadmapActions: 24,
  evidenceItems: 8
} as const;

export interface ComprehensiveProjection {
  findings: ComprehensiveFindingView[];
  risks: RiskRegisterEntry[];
  scenarios: PlausibleScenario[];
  controlActions: ControlImprovementEntry[];
  roadmapActions: RoadmapAction[];
  evidenceItems: EvidenceRequestPackItem[];
  sourceCounts: {
    findings: number;
    risks: number;
    scenarios: number;
    controlActions: number;
    roadmapActions: number;
    evidenceItems: number;
  };
}

export const RISK_PRIORITY_RANK: Record<RiskRegisterEntry['priority'], number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4
};

export function riskPriorityRank(priority: RiskRegisterEntry['priority']): number {
  return RISK_PRIORITY_RANK[priority];
}

function findingSignal(ids: string[], findings: ComprehensiveFindingView[]): number {
  return Math.max(0, ...findings.filter((finding) => ids.includes(finding.id)).map((finding) => finding.materialityScore));
}

export function sortComprehensiveRisks(risks: RiskRegisterEntry[], findings: ComprehensiveFindingView[]): RiskRegisterEntry[] {
  return [...risks].sort((a, b) =>
    riskPriorityRank(b.priority) - riskPriorityRank(a.priority)
      || findingSignal(b.linkedFindingIds, findings) - findingSignal(a.linkedFindingIds, findings)
      || a.id.localeCompare(b.id)
  );
}

function sortFindings(findings: ComprehensiveFindingView[]): ComprehensiveFindingView[] {
  return [...findings].sort((a, b) => b.materialityScore - a.materialityScore || a.id.localeCompare(b.id));
}

function sortScenarios(scenarios: PlausibleScenario[], findings: ComprehensiveFindingView[]): PlausibleScenario[] {
  return [...scenarios].sort((a, b) => findingSignal(b.linkedFindingIds, findings) - findingSignal(a.linkedFindingIds, findings) || a.id.localeCompare(b.id));
}

function sortControls(controls: ControlImprovementEntry[], findings: ComprehensiveFindingView[]): ControlImprovementEntry[] {
  return [...controls].sort((a, b) => findingSignal([b.linkedFindingId], findings) - findingSignal([a.linkedFindingId], findings) || a.id.localeCompare(b.id));
}

function sortRoadmap(actions: RoadmapAction[], risks: RiskRegisterEntry[], findings: ComprehensiveFindingView[]): RoadmapAction[] {
  const riskById = new Map(risks.map((risk) => [risk.id, risk]));
  const periodRank: Record<RoadmapAction['period'], number> = { '30 days': 3, '60 days': 2, '90 days': 1 };
  return [...actions].sort((a, b) => {
    const aRisk = Math.max(0, ...a.linkedRiskIds.map((id) => riskPriorityRank(riskById.get(id)?.priority ?? 'Low')));
    const bRisk = Math.max(0, ...b.linkedRiskIds.map((id) => riskPriorityRank(riskById.get(id)?.priority ?? 'Low')));
    return periodRank[b.period] - periodRank[a.period]
      || bRisk - aRisk
      || findingSignal([b.linkedFindingId], findings) - findingSignal([a.linkedFindingId], findings)
      || a.id.localeCompare(b.id);
  });
}

function selectDependencyClosedRoadmap(actions: RoadmapAction[], limit: number): RoadmapAction[] {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const selected = new Map<string, RoadmapAction>();

  const closureFor = (action: RoadmapAction, visiting = new Set<string>()): RoadmapAction[] => {
    if (visiting.has(action.id)) throw new Error(`Comprehensive roadmap dependency cycle detected at ${action.id}`);
    const nextVisiting = new Set(visiting).add(action.id);
    const dependencies = action.dependencyIds.map((id) => {
      const dependency = byId.get(id);
      if (!dependency) throw new Error(`Comprehensive roadmap dependency ${id} is missing for ${action.id}`);
      return dependency;
    });
    return [...dependencies.flatMap((dependency) => closureFor(dependency, nextVisiting)), action];
  };

  for (const action of actions) {
    const closure = closureFor(action).filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index);
    const additions = closure.filter((candidate) => !selected.has(candidate.id));
    if (selected.size + additions.length <= limit) {
      for (const candidate of closure) selected.set(candidate.id, candidate);
    }
  }

  return actions.filter((action) => selected.has(action.id));
}

export function buildComprehensiveProjection(model: ComprehensiveDeliveryModel): ComprehensiveProjection {
  const findings = sortFindings(model.findings);
  const risks = sortComprehensiveRisks(model.riskRegister, findings);
  const scenarios = sortScenarios(model.scenarios, findings);
  const controlActions = sortControls(model.controlImprovements, findings);
  const roadmapCandidates = sortRoadmap(model.roadmapActions, risks, findings);
  const roadmapActions = selectDependencyClosedRoadmap(roadmapCandidates, COMPREHENSIVE_L2_LIMITS.roadmapActions);
  const evidenceItems = [...model.evidenceRequestPack]
    .sort((a, b) => ({ HIGH: 3, MEDIUM: 2, LOW: 1 }[b.priority] - { HIGH: 3, MEDIUM: 2, LOW: 1 }[a.priority]) || a.evidenceRef.localeCompare(b.evidenceRef))
    .slice(0, COMPREHENSIVE_L2_LIMITS.evidenceItems);
  return {
    findings: findings.slice(0, COMPREHENSIVE_L2_LIMITS.findings),
    risks: risks.slice(0, COMPREHENSIVE_L2_LIMITS.risks),
    scenarios: scenarios.slice(0, COMPREHENSIVE_L2_LIMITS.scenarios),
    controlActions: controlActions.slice(0, COMPREHENSIVE_L2_LIMITS.controlActions),
    roadmapActions,
    evidenceItems,
    sourceCounts: {
      findings: model.findings.length,
      risks: model.riskRegister.length,
      scenarios: model.scenarios.length,
      controlActions: model.controlImprovements.length,
      roadmapActions: model.roadmapActions.length,
      evidenceItems: model.evidenceRequestPack.length
    }
  };
}

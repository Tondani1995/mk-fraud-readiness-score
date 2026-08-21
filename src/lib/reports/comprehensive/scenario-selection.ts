import type { MaterialFinding, PlausibleScenario, RiskRegisterEntry } from '../evidence-model/types';

export type ScenarioSelectionStatus = 'SELECTED' | 'CONSOLIDATED' | 'OMITTED_BELOW_MATERIALITY_CUTOFF';

export interface ScenarioSelectionAuditRow {
  sourceScenarioId: string;
  sourceTitle: string;
  materialityScore: number;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  status: ScenarioSelectionStatus;
  selectedScenarioIds: string[];
  selectionReason: string;
}

export interface ScenarioSelectionAudit {
  version: 'mk-comprehensive-scenario-selection-v1';
  selectionRule: string;
  sourceUniverseCount: number;
  customerFacingCount: number;
  selectedScenarioIds: string[];
  consolidatedSourceCount: number;
  omittedSourceCount: number;
  highestMaterialityRelevantSelected: boolean;
  noMaterialScenarioSilentlyLost: boolean;
  rows: ScenarioSelectionAuditRow[];
}

function priorityRank(priority: RiskRegisterEntry['priority']): number {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[priority];
}

function sourceLinks(scenario: PlausibleScenario): { findingIds: string[]; riskIds: string[] } {
  return {
    findingIds: [...new Set([...(scenario.linkedFindingIds ?? [])])],
    riskIds: [...new Set([...(scenario.linkedRiskIds ?? []), scenario.linkedRiskId].filter(Boolean))] as string[]
  };
}

function scenarioScore(scenario: { linkedFindingIds?: string[]; linkedRiskIds?: string[] }, findings: readonly MaterialFinding[], risks: readonly RiskRegisterEntry[]): number {
  const linkedFindings = findings.filter((finding) => (scenario.linkedFindingIds ?? []).includes(finding.id));
  const linkedRisks = risks.filter((risk) => (scenario.linkedRiskIds ?? []).includes(risk.id));
  const strongestFinding = linkedFindings.reduce((score, finding) => Math.max(score, finding.materialityScore), 0);
  const strongestRisk = linkedRisks.reduce((score, risk) => Math.max(score, priorityRank(risk.priority)), 0);
  // Finding materiality is the primary ranking signal; risk priority breaks ties.
  return strongestFinding * 10 + strongestRisk;
}

function overlap(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

/**
 * Documents the boundary between the complete deterministic scenario universe
 * and the compact customer-facing portfolio. Selection is not a silent slice:
 * direct selection, deliberate consolidation and below-cutoff omission are all
 * recorded against canonical finding/risk links.
 */
export function buildScenarioSelectionAudit(input: {
  sourceUniverse: readonly PlausibleScenario[];
  selectedFacts: ReadonlyArray<{
    canonicalScenarioId?: string;
    sourceId?: string;
    scenarioId?: string;
    linkedFindingIds?: string[];
    linkedRiskIds?: string[];
  }>;
  renderedScenarioIds: readonly string[];
  findings: readonly MaterialFinding[];
  risks: readonly RiskRegisterEntry[];
}): ScenarioSelectionAudit {
  const selectedFacts = [...input.selectedFacts];
  const selectedScenarioIds = [...new Set(input.renderedScenarioIds)];
  const selectedRows = selectedFacts.map((fact) => ({
    id: String(fact.canonicalScenarioId ?? fact.sourceId ?? fact.scenarioId ?? ''),
    renderedId: String(fact.scenarioId ?? fact.canonicalScenarioId ?? fact.sourceId ?? ''),
    findingIds: [...new Set(fact.linkedFindingIds ?? [])],
    riskIds: [...new Set(fact.linkedRiskIds ?? [])],
    score: scenarioScore(fact, input.findings, input.risks)
  }));
  const selectedScores = selectedRows.map((row) => row.score).filter((value) => Number.isFinite(value));
  const selectedFloor = selectedScores.length ? Math.min(...selectedScores) : 0;

  const rows = input.sourceUniverse.map((source) => {
    const links = sourceLinks(source);
    const direct = selectedRows.filter((row) => row.id === source.id);
    const related = selectedRows.filter((row) =>
      overlap(links.findingIds, row.findingIds) || overlap(links.riskIds, row.riskIds)
    );
    if (direct.length) {
      return {
        sourceScenarioId: source.id,
        sourceTitle: source.title,
        materialityScore: scenarioScore(source, input.findings, input.risks),
        linkedFindingIds: links.findingIds,
        linkedRiskIds: links.riskIds,
        status: 'SELECTED' as const,
        selectedScenarioIds: direct.map((row) => row.renderedId),
        selectionReason: 'Selected directly by the deterministic pathway-family projection and retained as a customer-facing scenario.'
      };
    }
    if (related.length) {
      return {
        sourceScenarioId: source.id,
        sourceTitle: source.title,
        materialityScore: scenarioScore(source, input.findings, input.risks),
        linkedFindingIds: links.findingIds,
        linkedRiskIds: links.riskIds,
        status: 'CONSOLIDATED' as const,
        selectedScenarioIds: [...new Set(related.map((row) => row.renderedId))],
        selectionReason: 'Consolidated into the selected scenario(s) because the source object shares canonical finding or risk links; it was not silently discarded.'
      };
    }
    const score = scenarioScore(source, input.findings, input.risks);
    return {
      sourceScenarioId: source.id,
      sourceTitle: source.title,
      materialityScore: score,
      linkedFindingIds: links.findingIds,
      linkedRiskIds: links.riskIds,
      status: 'OMITTED_BELOW_MATERIALITY_CUTOFF' as const,
      selectedScenarioIds: [],
      selectionReason: `Not selected because its deterministic materiality score (${score}) is at or below the selected portfolio floor (${selectedFloor}) after pathway consolidation.`
    };
  });
  const omitted = rows.filter((row) => row.status === 'OMITTED_BELOW_MATERIALITY_CUTOFF');
  const highestMaterialityRelevantSelected = omitted.every((row) => row.materialityScore <= selectedFloor);
  const noMaterialScenarioSilentlyLost = rows.every((row) => row.status !== 'OMITTED_BELOW_MATERIALITY_CUTOFF' || row.selectionReason.length > 0)
    && highestMaterialityRelevantSelected;
  return {
    version: 'mk-comprehensive-scenario-selection-v1',
    selectionRule: 'Rank relevant source scenarios by highest linked-finding materiality, break ties by linked-risk priority, consolidate overlapping canonical finding/risk pathways, and render the highest-materiality compact portfolio. Every source object receives a selected, consolidated or below-cutoff disposition.',
    sourceUniverseCount: input.sourceUniverse.length,
    customerFacingCount: selectedScenarioIds.length,
    selectedScenarioIds,
    consolidatedSourceCount: rows.filter((row) => row.status === 'CONSOLIDATED').length,
    omittedSourceCount: omitted.length,
    highestMaterialityRelevantSelected,
    noMaterialScenarioSilentlyLost,
    rows
  };
}

export function assertScenarioSelectionAudit(audit: ScenarioSelectionAudit): void {
  if (!audit.noMaterialScenarioSilentlyLost || !audit.highestMaterialityRelevantSelected) {
    throw new Error('Comprehensive scenario selection audit failed: a relevant source scenario was omitted above the deterministic materiality cutoff.');
  }
}

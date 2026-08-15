import type { AdvisoryEvidenceModel } from '../evidence-model/types';
import type { ComprehensiveProvenance } from './product-contract';

/**
 * Comprehensive deterministic assembly.
 *
 * Six management registers, assembled from the analytical universe the evidence
 * model already produces. This module performs no analysis: it groups, links and
 * labels provenance. Every relationship comes from an explicit identifier on the
 * source object — never from a label, a title or an array position, which is the
 * defect that cost Essential two passes.
 *
 * The one thing it does add is the distinction the product depends on: what the
 * assessment indicates versus what MK recommends. A control design is standing
 * methodology selected by a response; it is not an observation about the
 * organisation, and it is labelled so the report can never present it as one.
 */

export const COMPREHENSIVE_ASSEMBLY_VERSION = 'mk-comprehensive-assembly-v1' as const;

/** Every row states where it came from, so a later layer cannot blur the boundary. */
export interface AssembledRow {
  provenance: ComprehensiveProvenance;
  sourceRefs: string[];
}

export interface FindingRow extends AssembledRow {
  findingId: string;
  domainCode: string;
  domainName: string;
  questionCode: string;
  /** What the customer answered. Self-reported, always attributed as such. */
  assessedPosition: string;
  assessedDiagnosis: string;
  materialityClass: string;
  materialityScore: number;
  isCriticalControl: boolean;
  isHardGate: boolean;
  primarySemanticFamily: string;
  fraudMechanism: string;
  whyItMatters: string;
  linkedRiskIds: string[];
  linkedControlIds: string[];
}

export interface RiskRow extends AssembledRow {
  riskId: string;
  riskStatement: string;
  cause: string;
  riskEvent: string;
  affectedDomain: string;
  priority: string;
  likelihood: string;
  impact: string;
  currentControlPosition: string;
  requiredTreatment: string;
  ownerRole: string;
  effectivenessMeasure: string;
  linkedFindingIds: string[];
  linkedScenarioIds: string[];
}

export interface ControlBlueprintRow extends AssembledRow {
  controlId: string;
  linkedFindingId: string;
  linkedRiskIds: string[];
  questionCode: string;
  /** Assessment-derived. What the responses indicate today. */
  currentState: string;
  /** MK methodology. What good practice looks like. Never phrased as an observation. */
  controlObjective: string;
  targetState: string;
  controlDesign: string;
  accountableExecutiveRole: string;
  processOwnerRole: string;
  oversightFunction: string;
  operatingFrequency: string;
  populationCoverage: string;
  dependencies: string[];
  implementationDifficulty: string;
  targetPeriod: string;
  effectivenessTest: string;
  escalationThreshold: string;
  failureResponse: string;
}

export interface EvidenceRequirementRow extends AssembledRow {
  evidenceId: string;
  artefact: string;
  provesWhat: string;
  minimumAcceptableCharacteristics: string[];
  ownerRole: string;
  expectedRecency: string;
  requiredPopulation: string;
}

/** Evidence grouped by the control it proves, not a flat list of a hundred rows. */
export interface EvidenceRequirementGroup {
  controlId: string;
  controlObjective: string;
  ownerRole: string;
  targetPeriod: string;
  items: EvidenceRequirementRow[];
}

export interface GovernanceRoleRow extends AssembledRow {
  role: string;
  controlsOwned: string[];
  decisionsRequired: string[];
  evidenceExpected: string[];
  reviewCadences: string[];
  escalationResponsibilities: string[];
}

export interface DecisionRow extends AssembledRow {
  decisionId: string;
  category: string;
  decisionRequired: string;
  whyNow: string;
  recommendedDirection: string;
  ownerRole: string;
  targetPeriod: string;
  consequenceOfDelay: string;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
}

export interface ProgrammeActionRow extends AssembledRow {
  actionId: string;
  action: string;
  deliverable: string;
  ownerRole: string;
  completionCriterion: string;
  dependencies: string[];
  targetPeriod: string;
  effectivenessMeasure: string;
  escalationThreshold: string;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  /** Source rows merged into this action because they specify the same work. */
  mergedFrom: string[];
}

export interface ProgrammeHorizon {
  horizon: string;
  actions: ProgrammeActionRow[];
}

export interface ComprehensiveAssembly {
  version: typeof COMPREHENSIVE_ASSEMBLY_VERSION;
  narrativeMode: string;
  findingRegister: FindingRow[];
  riskRegister: RiskRow[];
  controlBlueprints: ControlBlueprintRow[];
  evidenceRequirements: EvidenceRequirementGroup[];
  governance: { roles: GovernanceRoleRow[]; decisions: DecisionRow[] };
  programme: { horizons: ProgrammeHorizon[] };
  counts: {
    findings: number;
    risks: number;
    controls: number;
    evidenceGroups: number;
    evidenceItems: number;
    governanceRoles: number;
    decisions: number;
    programmeActions: number;
    measures: number;
  };
}

const text = (value: unknown, fallback = ''): string => {
  const out = String(value ?? '').trim();
  return out || fallback;
};
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []);
const unique = <T,>(values: T[]): T[] => [...new Set(values)];

/**
 * Horizons are taken from the target periods the playbooks actually carry. No
 * horizon is invented to make the programme look longer than the data supports.
 */
const HORIZON_ORDER = ['30 days', '60 days', '90 days', '3-6 months', '6-12 months'];
function horizonRank(period: string): number {
  const index = HORIZON_ORDER.indexOf(period);
  return index === -1 ? HORIZON_ORDER.length : index;
}

export function assembleComprehensive(evidence: AdvisoryEvidenceModel): ComprehensiveAssembly {
  const findings = evidence.materialFindings ?? [];
  const risks = evidence.riskRegister ?? [];
  const controls = evidence.controlImprovements ?? [];
  const checklist = evidence.evidenceChecklist ?? [];
  const decisions = evidence.leadershipDecisions ?? [];
  const actions = evidence.roadmapActions ?? [];
  const scenarios = evidence.scenarios ?? [];

  // ---- 1. Finding register -------------------------------------------------
  // Every material finding, not Essential's selected few. The assessed position
  // and the diagnosis are what the responses say; the recommended control is
  // deliberately not carried here, because that is the blueprint's job.
  const risksByFinding = new Map<string, string[]>();
  for (const risk of risks) {
    for (const findingId of list((risk as any).linkedFindingIds)) {
      risksByFinding.set(findingId, [...(risksByFinding.get(findingId) ?? []), text((risk as any).id)]);
    }
  }
  const controlsByFinding = new Map<string, string[]>();
  for (const control of controls) {
    const findingId = text((control as any).linkedFindingId);
    if (findingId) controlsByFinding.set(findingId, [...(controlsByFinding.get(findingId) ?? []), text((control as any).id)]);
  }

  const findingRegister: FindingRow[] = findings.map((finding: any) => ({
    provenance: 'DERIVED_ANALYSIS',
    sourceRefs: [text(finding.questionCode)].filter(Boolean),
    findingId: text(finding.id),
    domainCode: text(finding.domainCode),
    domainName: text(finding.domainName),
    questionCode: text(finding.questionCode),
    assessedPosition: text(finding.responseLabel),
    assessedDiagnosis: text(finding.diagnosis),
    materialityClass: text(finding.materialityClass),
    materialityScore: Number(finding.materialityScore ?? 0),
    isCriticalControl: Boolean(finding.isCriticalControl),
    isHardGate: Boolean(finding.isHardGate),
    primarySemanticFamily: text(finding.primarySemanticFamily),
    fraudMechanism: text(finding.fraudMechanism),
    whyItMatters: text(finding.whyItMatters),
    linkedRiskIds: unique(risksByFinding.get(text(finding.id)) ?? []),
    linkedControlIds: unique(controlsByFinding.get(text(finding.id)) ?? [])
  }));

  // ---- 2. Risk register ----------------------------------------------------
  // Priority and likelihood come from the existing methodology. No monetary
  // exposure, no probability and no incident frequency is introduced.
  const riskRegister: RiskRow[] = risks.map((risk: any) => ({
    provenance: 'DERIVED_ANALYSIS',
    sourceRefs: unique([...list(risk.linkedQuestionCodes), ...list(risk.linkedFindingIds)]),
    riskId: text(risk.id),
    riskStatement: text(risk.riskStatement),
    cause: text(risk.cause),
    riskEvent: text(risk.riskEvent),
    affectedDomain: text(risk.affectedDomain ?? list(risk.affectedDomains)[0]),
    priority: text(risk.priority),
    likelihood: text(risk.likelihood),
    impact: text(risk.impact),
    currentControlPosition: text(risk.currentControlPosition),
    requiredTreatment: text(risk.requiredTreatment),
    ownerRole: text(risk.accountableExecutive ?? risk.accountableOwner),
    effectivenessMeasure: text(risk.effectivenessMeasure),
    linkedFindingIds: list(risk.linkedFindingIds),
    linkedScenarioIds: list(risk.linkedScenarioIds)
  }));

  // ---- 3. Control blueprint register ---------------------------------------
  // The current state is assessment-derived; everything else is standing
  // methodology. They are separate fields so a later layer cannot present the
  // recommendation as an observation.
  const controlBlueprints: ControlBlueprintRow[] = controls.map((control: any) => ({
    provenance: 'CONTROL_LIBRARY',
    sourceRefs: [text(control.linkedQuestionCode), text(control.linkedFindingId)].filter(Boolean),
    controlId: text(control.id),
    linkedFindingId: text(control.linkedFindingId),
    linkedRiskIds: unique([...list(control.linkedRiskIds), text(control.linkedRiskId)].filter(Boolean)),
    questionCode: text(control.linkedQuestionCode),
    currentState: text(control.currentState),
    controlObjective: text(control.controlObjective),
    targetState: text(control.targetState),
    controlDesign: text(control.controlDesign),
    accountableExecutiveRole: text(control.accountableExecutive ?? control.accountableOwner),
    processOwnerRole: text(control.processOwner),
    oversightFunction: text(control.oversightFunction ?? control.oversightOwner),
    operatingFrequency: text(control.operatingFrequency),
    populationCoverage: text(control.completePopulationCoverage),
    dependencies: unique([...list(control.dependencies), text(control.implementationDependency)].filter(Boolean)),
    implementationDifficulty: text(control.implementationDifficulty),
    targetPeriod: text(control.targetPeriod),
    effectivenessTest: text(control.effectivenessTest),
    escalationThreshold: text(control.escalationThreshold),
    failureResponse: text(control.failureResponse)
  }));

  // ---- 4. Evidence requirements, grouped by the control they prove ----------
  const controlById = new Map(controlBlueprints.map((control) => [control.controlId, control]));
  const controlsByFindingId = new Map<string, ControlBlueprintRow[]>();
  for (const control of controlBlueprints) {
    if (!control.linkedFindingId) continue;
    controlsByFindingId.set(control.linkedFindingId, [...(controlsByFindingId.get(control.linkedFindingId) ?? []), control]);
  }
  const grouped = new Map<string, EvidenceRequirementRow[]>();
  const UNATTACHED = '__unattached__';
  for (const item of checklist as any[]) {
    const row: EvidenceRequirementRow = {
      provenance: 'CONTROL_LIBRARY',
      sourceRefs: unique([...list(item.linkedQuestionCodes), ...list(item.linkedFindingIds)]),
      evidenceId: text(item.id ?? item.evidenceRef),
      artefact: text(item.artefact),
      provesWhat: text(item.provesWhat),
      minimumAcceptableCharacteristics: list(item.minimumAcceptableCharacteristics),
      ownerRole: text(item.likelyOwner),
      expectedRecency: text(item.expectedRecency),
      requiredPopulation: text(item.requiredPopulation)
    };
    // Attach through the explicit finding link, never by wording.
    const findingIds = unique([...list(item.linkedFindingIds), text(item.linkedFindingId)].filter(Boolean));
    const target = findingIds.flatMap((findingId) => controlsByFindingId.get(findingId) ?? [])[0];
    const key = target ? target.controlId : UNATTACHED;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const evidenceRequirements: EvidenceRequirementGroup[] = [...grouped.entries()]
    .filter(([key]) => key !== UNATTACHED)
    .map(([controlId, items]) => {
      const control = controlById.get(controlId);
      return {
        controlId,
        controlObjective: control?.controlObjective ?? '',
        ownerRole: control?.processOwnerRole ?? '',
        targetPeriod: control?.targetPeriod ?? '',
        items
      };
    });

  // ---- 5. Governance, aggregated by role -----------------------------------
  // One row per accountable role, not one row per control. A CFO wants to see
  // what they own, not to reconstruct it from thirty rows.
  const roleIndex = new Map<string, GovernanceRoleRow>();
  /**
   * Composite labels are one role expressed as alternatives — "CEO / Managing
   * Director" is a single accountability, not two. They are matched
   * order-insensitively so "COO / CFO" and "CFO / COO" are the same row, and
   * otherwise left intact: splitting them would invent roles the library does
   * not express.
   */
  const roleKey = (name: string): string =>
    name.split(/\s*(?:\/|\band\b|\bwith\b)\s*/i).map((part) => part.trim().toLowerCase()).filter(Boolean).sort().join(' / ');
  const role = (name: string): GovernanceRoleRow => {
    const key = roleKey(name);
    if (!roleIndex.has(key)) {
      roleIndex.set(key, { provenance: 'CONTROL_LIBRARY', sourceRefs: [], role: name.trim(), controlsOwned: [], decisionsRequired: [], evidenceExpected: [], reviewCadences: [], escalationResponsibilities: [] });
    }
    return roleIndex.get(key)!;
  };
  for (const control of controlBlueprints) {
    for (const name of [control.accountableExecutiveRole, control.processOwnerRole, control.oversightFunction].filter(Boolean)) {
      const entry = role(name);
      entry.controlsOwned.push(control.controlId);
      if (control.operatingFrequency) entry.reviewCadences.push(control.operatingFrequency);
      if (control.escalationThreshold) entry.escalationResponsibilities.push(control.escalationThreshold);
      entry.sourceRefs.push(control.controlId);
    }
  }
  for (const group of evidenceRequirements) {
    for (const item of group.items) {
      if (item.ownerRole) role(item.ownerRole).evidenceExpected.push(item.evidenceId);
    }
  }

  const decisionRows: DecisionRow[] = (decisions as any[]).map((decision) => ({
    provenance: 'DERIVED_ANALYSIS',
    sourceRefs: unique([...list(decision.linkedFindingIds), ...list(decision.linkedRiskIds)]),
    decisionId: text(decision.id),
    category: text(decision.decisionCategory),
    decisionRequired: text(decision.decisionRequired),
    whyNow: text(decision.whyNow),
    recommendedDirection: text(decision.recommendedDecision),
    ownerRole: text(decision.accountableExecutive),
    targetPeriod: text(decision.targetPeriod),
    consequenceOfDelay: text(decision.consequenceOfDelay),
    linkedFindingIds: list(decision.linkedFindingIds),
    linkedRiskIds: list(decision.linkedRiskIds)
  }));
  for (const decision of decisionRows) {
    if (decision.ownerRole) role(decision.ownerRole).decisionsRequired.push(decision.decisionId);
  }

  // Lead with the roles carrying the most accountability.
  const roles = [...roleIndex.values()].sort((a, b) => b.controlsOwned.length - a.controlsOwned.length).map((entry) => ({
    ...entry,
    controlsOwned: unique(entry.controlsOwned),
    decisionsRequired: unique(entry.decisionsRequired),
    evidenceExpected: unique(entry.evidenceExpected),
    reviewCadences: unique(entry.reviewCadences),
    escalationResponsibilities: unique(entry.escalationResponsibilities),
    sourceRefs: unique(entry.sourceRefs)
  }));

  // ---- 6. Implementation programme -----------------------------------------
  // Several findings routinely point at the same control improvement. Telling
  // management to do that work three times is the defect Essential hit; actions
  // specifying identical work are merged, keeping every source reference.
  const byWork = new Map<string, ProgrammeActionRow>();
  for (const action of actions as any[]) {
    const deliverable = text(action.deliverable);
    const period = text(action.period ?? action.targetPeriod);
    const key = `${period}::${deliverable.toLowerCase()}`;
    const existing = byWork.get(key);
    const row: ProgrammeActionRow = {
      provenance: 'CONTROL_LIBRARY',
      sourceRefs: unique([...list(action.linkedFindingIds), ...list(action.linkedRiskIds)]),
      actionId: text(action.id),
      action: deliverable,
      deliverable,
      ownerRole: text(action.accountableExecutive ?? action.accountableOwner),
      completionCriterion: text(action.evidenceOfCompletion),
      dependencies: unique([...list(action.dependencyIds), text(action.dependency)].filter(Boolean)),
      targetPeriod: period,
      effectivenessMeasure: text(action.successMeasure),
      escalationThreshold: text(action.escalationThreshold),
      linkedFindingIds: list(action.linkedFindingIds),
      linkedRiskIds: list(action.linkedRiskIds),
      mergedFrom: [text(action.id)]
    };
    if (!existing) { byWork.set(key, row); continue; }
    byWork.set(key, {
      ...existing,
      sourceRefs: unique([...existing.sourceRefs, ...row.sourceRefs]),
      linkedFindingIds: unique([...existing.linkedFindingIds, ...row.linkedFindingIds]),
      linkedRiskIds: unique([...existing.linkedRiskIds, ...row.linkedRiskIds]),
      dependencies: unique([...existing.dependencies, ...row.dependencies]),
      mergedFrom: unique([...existing.mergedFrom, ...row.mergedFrom])
    });
  }
  const horizonMap = new Map<string, ProgrammeActionRow[]>();
  for (const action of byWork.values()) {
    const horizon = action.targetPeriod || 'unscheduled';
    horizonMap.set(horizon, [...(horizonMap.get(horizon) ?? []), action]);
  }
  const horizons: ProgrammeHorizon[] = [...horizonMap.entries()]
    .sort((a, b) => horizonRank(a[0]) - horizonRank(b[0]))
    .map(([horizon, rows]) => ({ horizon, actions: rows }));

  const programmeActions = horizons.flatMap((horizon) => horizon.actions);
  const measures = unique([
    ...programmeActions.map((action) => action.effectivenessMeasure),
    ...controlBlueprints.map((control) => control.effectivenessTest),
    ...riskRegister.map((risk) => risk.effectivenessMeasure)
  ].filter(Boolean));

  return {
    version: COMPREHENSIVE_ASSEMBLY_VERSION,
    narrativeMode: text(evidence.narrativeMode, 'REMEDIATION'),
    findingRegister,
    riskRegister,
    controlBlueprints,
    evidenceRequirements,
    governance: { roles, decisions: decisionRows },
    programme: { horizons },
    counts: {
      findings: findingRegister.length,
      risks: riskRegister.length,
      controls: controlBlueprints.length,
      evidenceGroups: evidenceRequirements.length,
      evidenceItems: evidenceRequirements.reduce((sum, group) => sum + group.items.length, 0),
      governanceRoles: roles.length,
      decisions: decisionRows.length,
      programmeActions: programmeActions.length,
      measures: measures.length
    }
  };
}

/** Scenarios must have an owning risk, so no pathway is orphaned from the register. */
export function unownedScenarioIds(evidence: AdvisoryEvidenceModel): string[] {
  const riskIds = new Set((evidence.riskRegister ?? []).map((risk: any) => String(risk.id)));
  return (evidence.scenarios ?? [])
    .filter((scenario: any) => {
      const linked = [...list(scenario.linkedRiskIds), text(scenario.linkedRiskId)].filter(Boolean);
      return !linked.some((id) => riskIds.has(id));
    })
    .map((scenario: any) => String(scenario.id));
}

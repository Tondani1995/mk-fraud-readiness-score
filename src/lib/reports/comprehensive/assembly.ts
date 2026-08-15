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

/**
 * What a programme object actually is.
 *
 * The report described all 83 P06 objects as "implementation actions" when only
 * 31 were initial control establishment; the rest were operating-cycle and
 * effectiveness work. The type is assigned where the object is created, from the
 * generation path and the report mode, never inferred later from prose and never
 * from the organisation.
 */
export type ProgrammeWorkType = 'IMPLEMENT' | 'CONFIRM' | 'EMBED_AND_EVIDENCE' | 'ASSURE_AND_REVIEW';

export const PROGRAMME_WORK_TYPE_LABEL: Readonly<Record<ProgrammeWorkType, string>> = {
  IMPLEMENT: 'Implement',
  CONFIRM: 'Confirm',
  EMBED_AND_EVIDENCE: 'Embed & evidence',
  ASSURE_AND_REVIEW: 'Assure & review'
};

export interface ProgrammeActionRow extends AssembledRow {
  workType: ProgrammeWorkType;
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

export interface ScenarioPortfolioRow {
  provenance: 'DERIVED_ANALYSIS';
  scenarioId: string;
  title: string;
  family: string;
  /** Who could act, and the opening the assessment leaves them. */
  actorClass: string;
  opportunity: string;
  entryPoint: string;
  mechanism: string;
  concealment: string;
  consequence: string;
  /** What management would see before loss is confirmed. */
  warningIndicators: string[];
  /** The control break the pathway needs, and the response that closes it. */
  controlWeakness: string;
  interruptionPoint: string;
  immediateContainment: string;
  longTermResponse: string;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  linkedControlIds: string[];
}

export interface ResilienceTestRow {
  provenance: 'DERIVED_ANALYSIS';
  testId: string;
  /** The operating capability management reports. Never described as weak. */
  capability: string;
  domain: string;
  /** What the capability rests on. Authoritative: sustainmentPriorities.dependencies. */
  dependencyToTest: string[];
  /** Authoritative: sustainmentPriorities.deteriorationTrigger. */
  deteriorationCondition: string;
  /** Authoritative: sustainmentPriorities.proofRetained. */
  evidenceToInspect: string;
  /** Authoritative: sustainmentPriorities.effectivenessIndicator. */
  effectivenessSignal: string;
  /** Authoritative: sustainmentPriorities.operatingFrequency. */
  reviewRhythm: string;
  linkedAssurancePriorityId: string;
}

export type AssurancePriorityClass =
  | 'ASSURANCE_PRIORITY'
  | 'RESILIENCE_DEPENDENCY'
  | 'DETERIORATION_WATCHPOINT';

export interface AssurancePriorityRow {
  provenance: 'DERIVED_ANALYSIS';
  priorityId: string;
  /** Never "finding" and never "weakness": these capabilities are operating. */
  priorityClass: AssurancePriorityClass;
  capability: string;
  domain: string;
  semanticFamily: string;
  recordedPosition: string;
  currentStandard: string;
  whyItMatters: string;
  /** The management verification plan. MK performs none of this. */
  evidenceManagementShouldHold: string;
  coverageExpectation: string;
  suggestedSamplingApproach: string;
  reviewFrequency: string;
  accountableExecutive: string;
  oversightFunction: string;
  /** Resilience: what the capability rests on, and what erodes it. */
  dependencies: string[];
  deteriorationTrigger: string;
  earlyWarningSignal: string;
  effectivenessIndicator: string;
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
  /**
   * Essential's fraud pathways, carried forward.
   *
   * Comprehensive summarised exposure families and dropped the pathway detail —
   * sequence, warning indicators, interruption point — so a customer paying
   * R35,000 received less scenario insight than one paying R7,500. The objects
   * are the same deterministic scenarios Essential renders; nothing is invented.
   */
  scenarioPortfolio: ScenarioPortfolioRow[];
  /**
   * What a strong organisation should confirm.
   *
   * A Structured assessment produces few findings, because there is little
   * wrong. Value at that end of the scale is not more weaknesses but knowing
   * which operating capabilities the position rests on, what evidence should
   * exist for each, what they depend on, and what would signal deterioration.
   * Every field here is deterministic; none is a finding.
   */
  assurancePriorities: AssurancePriorityRow[];
  /**
   * The high-readiness resilience view.
   *
   * Built from sustainmentPriorities, not from the evidence-model scenarios:
   * those carry scenarioBasis "assurance_validation" and a fraud sequence that
   * opens "Test whether the self-reported controls would prevent...", so they are
   * verification procedures by construction and cannot honestly be presented as
   * fraud stress scenarios. Every field below traces to an authoritative
   * sustainment-priority field, and no exogenous event is invented.
   */
  resilienceTests: ResilienceTestRow[];
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
    scenarios: number;
    assurancePriorities: number;
    resilienceTests: number;
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

export function assembleComprehensive(
  evidence: AdvisoryEvidenceModel,
  /**
   * The authoritative scenario presentation, produced once by the Fact Pack and
   * shared with Essential.
   *
   * The evidence-model scenario objects carry no early-warning field at all, so
   * Comprehensive could not render honest warning indicators from them — an
   * earlier pass filled that column with expected-control text. The Fact Pack
   * owns the presentation projection (including its warning-indicator fallback),
   * so both tiers now read the same source and cannot diverge in meaning.
   *
   * Omitted, no scenario portfolio is produced. There is deliberately no
   * fallback to the evidence-model objects: a wrong scenario is worse than none.
   */
  source: { scenarioFacts?: readonly any[] } = {}
) {
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
      // Mode decides what the first horizons are doing. A sustainment programme
      // is not remediating: the capability is already reported as operating, so
      // the initial work confirms it rather than building it.
      workType: text(evidence.narrativeMode, 'REMEDIATION') === 'SUSTAINMENT' ? 'CONFIRM' : 'IMPLEMENT',
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

  /**
   * The programme beyond 90 days.
   *
   * Essential owns the first 90 days, and the deterministic roadmap stops there:
   * no source action carries a 3-6 or 6-12 month target period. Comprehensive
   * promises a twelve-month programme, so the choice is to build one from real
   * data or to stop claiming it.
   *
   * The data exists. Every control blueprint states the cadence at which it is
   * expected to operate ("Quarterly governance reporting; monthly overdue-action
   * review", "Annual mandate review"), the test that shows it is effective, the
   * threshold that should escalate, and what it depends on. A control with a
   * cadence longer than a month cannot have completed a meaningful cycle inside
   * 90 days, so its first full evidence cycle and its first effectiveness review
   * genuinely fall into the later horizons.
   *
   * These stages mature controls already selected. They introduce no finding, no
   * new control and no invented date, and every activity is management's to
   * perform — the report never claims MK performs any of it.
   */
  const CONTINUING = /quarter|annual|month|ongoing|continuous|every two years|biennial|per cycle|each cycle/i;
  const laterHorizonActions = (horizon: string, kind: 'EMBED' | 'MATURE'): ProgrammeActionRow[] =>
    controlBlueprints
      .filter((control) => CONTINUING.test(control.operatingFrequency))
      .map((control) => ({
        provenance: 'CONTROL_LIBRARY' as ComprehensiveProvenance,
        sourceRefs: [control.controlId, control.questionCode].filter(Boolean),
        workType: kind === 'EMBED' ? 'EMBED_AND_EVIDENCE' as const : 'ASSURE_AND_REVIEW' as const,
        actionId: `${control.controlId}-${kind}`,
        // The control objective is itself an imperative sentence ("Close the
        // material control weakness recorded for X"), so it cannot be spliced
        // into a longer clause. Reference the control instead.
        action: kind === 'EMBED'
          ? `Accumulate a complete evidence cycle for ${control.controlId} and have management sample it.`
          : `Review whether ${control.controlId} is still operating effectively, and refresh it for any change in the operating model.`,
        deliverable: kind === 'EMBED'
          // operatingFrequency is a sentence, not a noun, so it is quoted rather
          // than inflected into "one full <frequency> cycle".
          ? `Retained evidence covering one full operating cycle (${control.operatingFrequency}), with a management sample and any exceptions recorded.`
          // A fixed sentence here made every 6-12 month action identical work,
          // which the assembly duplicate check correctly rejected. Anchor the
          // deliverable on the control and its own effectiveness test.
          : `A management or assurance review of ${control.controlId} covering effectiveness, exception trend and dependency, evidenced against: ${control.effectivenessTest || control.controlObjective}`,
        ownerRole: control.accountableExecutiveRole,
        completionCriterion: kind === 'EMBED'
          ? `The retained evidence covers the required population for the full cycle and exceptions are resolved or escalated.`
          : control.effectivenessTest || 'Management can demonstrate the control operated as designed across the review period.',
        dependencies: kind === 'EMBED' ? [control.controlId] : [`${control.controlId}-EMBED`, ...control.dependencies],
        targetPeriod: horizon,
        effectivenessMeasure: control.effectivenessTest,
        escalationThreshold: control.escalationThreshold,
        linkedFindingIds: [control.linkedFindingId].filter(Boolean),
        linkedRiskIds: control.linkedRiskIds,
        mergedFrom: []
      }));

  const embed = laterHorizonActions('3-6 months', 'EMBED');
  const mature = laterHorizonActions('6-12 months', 'MATURE');
  if (embed.length) horizons.push({ horizon: '3-6 months', actions: embed });
  if (mature.length) horizons.push({ horizon: '6-12 months', actions: mature });
  horizons.sort((a, b) => horizonRank(a.horizon) - horizonRank(b.horizon));

  const programmeActions = horizons.flatMap((horizon) => horizon.actions);
  const measures = unique([
    ...programmeActions.map((action) => action.effectivenessMeasure),
    ...controlBlueprints.map((control) => control.effectivenessTest),
    ...riskRegister.map((risk) => risk.effectivenessMeasure)
  ].filter(Boolean));

  // ---- Scenario portfolio ---------------------------------------------------
  // Essential's pathways, carried through with their control links resolved so a
  // reader can move from the pathway to the blueprint that interrupts it.
  const controlsByRisk = new Map<string, string[]>();
  for (const control of controlBlueprints) {
    for (const riskId of control.linkedRiskIds ?? []) {
      controlsByRisk.set(riskId, [...(controlsByRisk.get(riskId) ?? []), control.controlId]);
    }
  }
  const humanFamily = (value: string): string => String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\b(d\d+)\s*(q\d+)\b/gi, '')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

  const scenarioPortfolio: ScenarioPortfolioRow[] = (source.scenarioFacts ?? []).map((scenario: any) => {
    const linkedRiskIds = unique(list(scenario.linkedRiskRefs).filter(Boolean));
    const linkedFindingIds = unique(list(scenario.linkedFindingRefs).filter(Boolean));
    return {
      provenance: 'DERIVED_ANALYSIS' as const,
      scenarioId: text(scenario.factRef),
      title: text(scenario.title),
      // The raw family code (control_d10_q01) is an engineering label and never
      // reaches customer prose; only the humanised form does.
      family: humanFamily(scenario.scenarioFamily),
      actorClass: text(scenario.actorClass),
      opportunity: text(scenario.opportunity),
      entryPoint: text(scenario.entryPoint),
      mechanism: text(scenario.mechanism),
      concealment: text(scenario.concealment),
      consequence: text(scenario.consequence),
      warningIndicators: list(scenario.warningIndicators),
      controlWeakness: text(scenario.currentControlWeakness),
      interruptionPoint: text(scenario.requiredControlResponse),
      immediateContainment: text(scenario.immediateContainment),
      longTermResponse: text(scenario.longTermResponse),
      linkedFindingIds,
      linkedRiskIds,
      linkedControlIds: unique(linkedRiskIds.flatMap((riskId) => controlsByRisk.get(riskId) ?? []))
    };
  });

  // ---- Assurance priorities -------------------------------------------------
  // Only produced where the deterministic model records operating capability.
  // These are not findings and must never be labelled weaknesses.
  const assurancePriorities: AssurancePriorityRow[] = (evidence.sustainmentPriorities ?? []).map((priority: any, index: number) => {
    const dependencies = list(priority.dependencies);
    return {
      provenance: 'DERIVED_ANALYSIS' as const,
      priorityId: `AP-${String(index + 1).padStart(2, '0')}`,
      // A capability with dependencies can be undermined indirectly; one with a
      // recorded deterioration trigger is watched. Both are stronger claims than
      // a bare assurance priority, so they take the more specific label.
      priorityClass: dependencies.length
        ? 'RESILIENCE_DEPENDENCY' as const
        : (text(priority.deteriorationTrigger) ? 'DETERIORATION_WATCHPOINT' as const : 'ASSURANCE_PRIORITY' as const),
      capability: text(priority.title),
      domain: text(priority.domain),
      semanticFamily: text(priority.semanticFamily),
      recordedPosition: text(priority.recordedPosition),
      currentStandard: text(priority.currentStrongStandard),
      whyItMatters: text(priority.managementFocus),
      evidenceManagementShouldHold: text(priority.proofRetained),
      coverageExpectation: text(priority.operatingFrequency) ? `Complete population across the ${text(priority.operatingFrequency).toLowerCase()} cycle.` : '',
      suggestedSamplingApproach: text(priority.proofRetained)
        ? 'Management or an independent function selects a sample across the review period and confirms the retained proof supports the recorded position.'
        : '',
      reviewFrequency: text(priority.operatingFrequency),
      accountableExecutive: text(priority.accountableExecutive),
      oversightFunction: text(priority.processOwner),
      dependencies,
      deteriorationTrigger: text(priority.deteriorationTrigger),
      earlyWarningSignal: text(priority.effectivenessIndicator),
      effectivenessIndicator: text(priority.effectivenessIndicator)
    };
  });

  // Resilience tests. One per assurance priority, each grounded field-for-field.
  // No system migration, staff turnover or volume spike is invented: the model
  // supports dependency failure and a recorded deterioration trigger, so that is
  // exactly what is tested.
  const resilienceTests: ResilienceTestRow[] = assurancePriorities
    .filter((priority) => priority.dependencies.length || priority.deteriorationTrigger)
    .map((priority, index) => ({
      provenance: 'DERIVED_ANALYSIS' as const,
      testId: `RT-${String(index + 1).padStart(2, '0')}`,
      capability: priority.capability,
      domain: priority.domain,
      dependencyToTest: priority.dependencies,
      deteriorationCondition: priority.deteriorationTrigger,
      evidenceToInspect: priority.evidenceManagementShouldHold,
      effectivenessSignal: priority.effectivenessIndicator,
      reviewRhythm: priority.reviewFrequency,
      linkedAssurancePriorityId: priority.priorityId
    }));

  return {
    version: COMPREHENSIVE_ASSEMBLY_VERSION,
    narrativeMode: text(evidence.narrativeMode, 'REMEDIATION'),
    findingRegister,
    riskRegister,
    controlBlueprints,
    evidenceRequirements,
    governance: { roles, decisions: decisionRows },
    programme: { horizons },
    scenarioPortfolio,
    assurancePriorities,
    resilienceTests,
    counts: {
      findings: findingRegister.length,
      risks: riskRegister.length,
      controls: controlBlueprints.length,
      evidenceGroups: evidenceRequirements.length,
      evidenceItems: evidenceRequirements.reduce((sum, group) => sum + group.items.length, 0),
      governanceRoles: roles.length,
      decisions: decisionRows.length,
      scenarios: scenarioPortfolio.length,
      assurancePriorities: assurancePriorities.length,
      resilienceTests: resilienceTests.length,
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

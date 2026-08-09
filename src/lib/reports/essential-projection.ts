import type { AssembledReportData } from './types';
import type {
  AdvisoryEvidenceModel,
  ControlImprovementEntry,
  MaterialFinding,
  RiskRegisterEntry,
  RoadmapAction
} from './evidence-model';

/**
 * Bounded Essential output projection (Bounded Product Output Contract V1).
 *
 * Three layers exist:
 *   L1  FULL ANALYTICAL UNIVERSE      -- buildAdvisoryEvidenceModel(). Never reduced.
 *   L2  PRIORITISED CUSTOMER NARRATIVE -- this module. Hard-capped, decision-oriented.
 *   L3  SUPPORTING REGISTER            -- supporting-register.ts. Everything L2 omits.
 *
 * This module is a pure *projection* over L1. It never mutates, filters or shortens the
 * evidence model itself, so:
 *   - the canonical evidence pack and its checksum are unchanged;
 *   - the existing offline AI-budget fixture's exact L1 kind counts still hold;
 *   - auditability is unchanged (every projected record keeps full provenance).
 *
 * The defect this closes: buildMaterialFindings() adds ABSENT_CONTROL unconditionally for any
 * response of 0, so its only skip condition (selectionReasons.length === 0) is unreachable. At an
 * all-zero assessment every applicable control becomes a "material finding" and the previous
 * `.slice(0, 5)` picked an arbitrary five from sixty near-identical records. Report length --
 * and prompt size -- therefore scaled with customer weakness rather than with the product.
 */

/** Methodology domain weights. Used to rank *between* domains, not to re-score the assessment. */
const DOMAIN_WEIGHT_PCT: Record<string, number> = {
  D1: 12, D2: 12, D3: 14, D4: 14, D5: 10, D6: 6, D7: 10, D8: 12, D9: 5, D10: 5
};

export const ESSENTIAL_CAPS = {
  findings: 8,
  findingsSystemic: 6,
  findingsFloor: 3,
  risks: 6,
  controlActionRecords: 8,
  controlActionRecordsSystemic: 6,
  evidenceToObtain: 15,
  /** Soft target; roadmapTotalCeiling absorbs dependency closure (§5.5). */
  roadmapTotal: 12,
  roadmapTotalCeiling: 15,
  leadershipDecisions: 6,
  /** Matches the evidence model's own weakAssessment ? 5 : 3 — no behavioural change. */
  scenarios: 3,
  scenariosSystemic: 5,
  contradictions: 2,
  appendixControlActionRecords: 40
} as const;

/** Systemic weakness thresholds. Both must hold -- see contract §4.1. */
export const SYSTEMIC_FAILED_SHARE_THRESHOLD = 0.6;
export const SYSTEMIC_DOMAIN_SHARE_THRESHOLD = 0.6;

export interface SystemicCondition {
  systemic: boolean;
  failedShare: number;
  domainsFailing: number;
  domainsScored: number;
  applicableCount: number;
}

/**
 * Derived at render time from persisted data only. There is deliberately no stored override and
 * no assessment/order/report identifier anywhere in this decision.
 */
export function detectSystemicCondition(data: AssembledReportData): SystemicCondition {
  const applicable = data.questionTraces.filter(
    (trace) => trace.applicable && trace.responseValue !== null
  );
  const scored = data.domainResults.filter((domain) => domain.rawScore !== null);
  if (applicable.length === 0 || scored.length === 0) {
    return {
      systemic: false,
      failedShare: 0,
      domainsFailing: 0,
      domainsScored: scored.length,
      applicableCount: applicable.length
    };
  }
  const failed = applicable.filter((trace) => (trace.responseValue as number) <= 2);
  const failedShare = failed.length / applicable.length;
  const domainsFailing = scored.filter((domain) => (domain.rawScore as number) < 40).length;
  const domainShare = domainsFailing / scored.length;
  return {
    systemic:
      failedShare >= SYSTEMIC_FAILED_SHARE_THRESHOLD
      && domainShare >= SYSTEMIC_DOMAIN_SHARE_THRESHOLD,
    failedShare,
    domainsFailing,
    domainsScored: scored.length,
    applicableCount: applicable.length
  };
}

/**
 * Main-report selection score. Retains the evidence model's own rankScore component weights (so
 * behaviour on today's non-systemic assessments is materially unchanged) and adds the one signal
 * it was missing: the methodology weight of the domain the control belongs to.
 */
export function essentialSelectionScore(finding: MaterialFinding): number {
  const has = (reason: string) => finding.selectionReasons.includes(reason as never);
  const domainWeight = DOMAIN_WEIGHT_PCT[finding.domainCode] ?? 5;
  return (has('HARD_GATE_FAILURE') ? 1000 : 0)
    + (has('CRITICAL_CONTROL_FAILURE') ? 500 : 0)
    + (has('MATURITY_CAP_EVENT') ? 450 : 0)
    + (has('CRITICAL_GAP') ? 350 : 0)
    + (has('MAJOR_GAP') ? 250 : 0)
    + (has('ABSENT_CONTROL') ? 200 : 0)
    + (has('PARTIAL_KEY_CONTROL_HIGH_EXPOSURE') ? 150 : 0)
    + (has('PRIORITY_SCENARIO_ENABLER') ? 120 : 0)
    + (has('MATERIAL_CONTRADICTION') ? 100 : 0)
    + (has('CROSS_DOMAIN_DEPENDENCY') ? 70 : 0)
    + domainWeight * 5
    + (5 - (finding.responseValue ?? 5)) * 20;
}

/** Total order -- (domainCode, questionCode) is unique per finding, so this never ties. */
export function compareEssentialFindings(left: MaterialFinding, right: MaterialFinding): number {
  return essentialSelectionScore(right) - essentialSelectionScore(left)
    || Number(right.isHardGate) - Number(left.isHardGate)
    || (DOMAIN_WEIGHT_PCT[right.domainCode] ?? 0) - (DOMAIN_WEIGHT_PCT[left.domainCode] ?? 0)
    || left.domainCode.localeCompare(right.domainCode)
    || left.questionCode.localeCompare(right.questionCode);
}

/**
 * Two-pass selection: breadth before depth.
 *
 * A single global sort concentrates the whole main report in one or two domains, which is exactly
 * what makes a weak assessment unusable. Pass 1 takes the best finding from each domain in domain
 * rank order; pass 2 fills any remaining slots globally.
 */
export function selectEssentialFindings(
  model: AdvisoryEvidenceModel,
  systemic: boolean,
  cap = systemic ? ESSENTIAL_CAPS.findingsSystemic : ESSENTIAL_CAPS.findings
): MaterialFinding[] {
  const universe = [...model.materialFindings].sort(compareEssentialFindings);
  if (universe.length === 0) return [];

  const byDomain = new Map<string, MaterialFinding[]>();
  for (const finding of universe) {
    byDomain.set(finding.domainCode, [...(byDomain.get(finding.domainCode) ?? []), finding]);
  }
  const domainOrder = [...byDomain.entries()]
    .sort(([, left], [, right]) => compareEssentialFindings(left[0], right[0]))
    .map(([domainCode]) => domainCode);

  const selected: MaterialFinding[] = [];
  const taken = new Set<string>();
  for (const domainCode of domainOrder) {
    if (selected.length >= cap) break;
    const finding = byDomain.get(domainCode)![0];
    selected.push(finding);
    taken.add(finding.id);
  }
  for (const finding of universe) {
    if (selected.length >= cap) break;
    if (taken.has(finding.id)) continue;
    selected.push(finding);
    taken.add(finding.id);
  }
  const floor = Math.min(ESSENTIAL_CAPS.findingsFloor, universe.length);
  for (const finding of universe) {
    if (selected.length >= floor) break;
    if (taken.has(finding.id)) continue;
    selected.push(finding);
    taken.add(finding.id);
  }
  return selected.sort(compareEssentialFindings);
}

/**
 * A Control Action Record is one object where the model previously produced three: a material
 * finding, its 1:1 control improvement (CI-<code>) and its 1:1 roadmap action (RA-<code>).
 *
 * Aggregation of several weak controls into one record is permitted only when every condition in
 * the contract holds, and is prohibited outright for hard gates, cap-linked controls and mixed
 * assurance/failure sets -- those must stay individually visible. contributingQuestionCodes always
 * carries every question that fed the record, so provenance is never reduced by aggregation.
 */
export interface ControlActionRecord {
  id: string;
  primaryQuestionCode: string;
  contributingQuestionCodes: string[];
  domainCode: string;
  domainName: string;
  title: string;
  currentState: string;
  expectedStandard: string;
  controlObjective: string;
  controlDesign: string;
  accountableOwner: string;
  processOwner: string;
  oversightFunction: string;
  targetPeriod: string;
  escalationThreshold: string;
  materialityClass: string;
  materialityScore: number;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  linkedRoadmapActionIds: string[];
  dependencyIds: string[];
  evidenceRefs: string[];
  aggregated: boolean;
}

function aggregationBlocked(members: MaterialFinding[]): boolean {
  if (members.length < 2) return false;
  const hardGates = members.filter((finding) => finding.isHardGate).length;
  if (hardGates > 0 && hardGates !== members.length) return true;
  if (members.some((finding) => finding.maturityCapStatus === 'capping')) return true;
  const assurance = members.filter(
    (finding) => finding.materialityClass === 'assurance_priority'
  ).length;
  if (assurance > 0 && assurance !== members.length) return true;
  if (new Set(members.map((finding) => finding.domainCode)).size > 1) return true;
  if (members.some((finding) => (finding.responseValue ?? 5) > 2)) return true;
  return false;
}

/**
 * The aggregation key is (domainCode, riskPathway, accountableOwner, targetPeriod). The risk
 * pathway is read from the authoritative risk register rather than recomputed, so a CAR can never
 * group two findings the risk model itself keeps apart.
 */
export function buildControlActionRecords(
  model: AdvisoryEvidenceModel
): ControlActionRecord[] {
  const controlByFindingId = new Map<string, ControlImprovementEntry>(
    model.controlImprovements.map((control) => [control.linkedFindingId, control])
  );
  const roadmapByFindingId = new Map<string, RoadmapAction>();
  for (const action of model.roadmapActions) {
    for (const findingId of action.linkedFindingIds) {
      if (!roadmapByFindingId.has(findingId)) roadmapByFindingId.set(findingId, action);
    }
  }
  const riskByFindingId = new Map<string, RiskRegisterEntry>();
  for (const risk of model.riskRegister) {
    for (const findingId of risk.linkedFindingIds) {
      if (!riskByFindingId.has(findingId)) riskByFindingId.set(findingId, risk);
    }
  }

  const groups = new Map<string, MaterialFinding[]>();
  for (const finding of [...model.materialFindings].sort(compareEssentialFindings)) {
    const risk = riskByFindingId.get(finding.id);
    const key = [
      finding.domainCode,
      risk?.id ?? `no-risk:${finding.questionCode}`,
      finding.accountableOwner,
      finding.targetPeriod
    ].join('|');
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }

  const records: ControlActionRecord[] = [];
  for (const members of groups.values()) {
    const ordered = [...members].sort(compareEssentialFindings);
    const emit = aggregationBlocked(ordered)
      ? ordered.map((finding) => [finding])
      : [ordered];
    for (const group of emit) {
      const lead = group[0];
      const control = controlByFindingId.get(lead.id);
      const roadmap = group
        .map((finding) => roadmapByFindingId.get(finding.id))
        .filter((action): action is RoadmapAction => Boolean(action));
      records.push({
        id: `CAR-${lead.questionCode}`,
        primaryQuestionCode: lead.questionCode,
        contributingQuestionCodes: group.map((finding) => finding.questionCode).sort(),
        domainCode: lead.domainCode,
        domainName: lead.domainName,
        title: lead.title,
        currentState: control?.currentState ?? lead.responseMeaning,
        expectedStandard: lead.expectedControlStandard,
        controlObjective: control?.controlObjective
          ?? `Close the material control weakness recorded for "${lead.questionPrompt.replace(/\.$/, '')}".`,
        controlDesign: control?.controlDesign ?? lead.recommendedControl,
        accountableOwner: lead.accountableOwner,
        processOwner: lead.processOwner,
        oversightFunction: lead.oversightFunction,
        targetPeriod: lead.targetPeriod,
        escalationThreshold: lead.escalationThreshold,
        materialityClass: lead.materialityClass,
        materialityScore: lead.materialityScore,
        linkedFindingIds: group.map((finding) => finding.id).sort(),
        linkedRiskIds: [
          ...new Set(group.map((finding) => riskByFindingId.get(finding.id)?.id).filter(Boolean))
        ].sort() as string[],
        linkedRoadmapActionIds: [...new Set(roadmap.map((action) => action.id))].sort(),
        dependencyIds: [...new Set(roadmap.flatMap((action) => action.dependencyIds))].sort(),
        evidenceRefs: [...new Set(group.flatMap((finding) => finding.evidenceToRequest))].sort(),
        aggregated: group.length > 1
      });
    }
  }
  return records.sort(
    (left, right) =>
      right.materialityScore - left.materialityScore
      || left.domainCode.localeCompare(right.domainCode)
      || left.primaryQuestionCode.localeCompare(right.primaryQuestionCode)
  );
}

/**
 * Dependency-closed roadmap selection.
 *
 * orderRoadmapActions() fails closed with RoadmapDependencyError when a retained action depends on
 * a dropped one, so any cap applied without closing over dependencyIds breaks generation outright.
 * Closure is cheap in practice (measured: 8 selected -> 9 retained on the all-zero fixture).
 */
export function selectDependencyClosedRoadmap(
  model: AdvisoryEvidenceModel,
  selectedFindingIds: Set<string>,
  target = ESSENTIAL_CAPS.roadmapTotal,
  ceiling = ESSENTIAL_CAPS.roadmapTotalCeiling
): RoadmapAction[] {
  const byId = new Map(model.roadmapActions.map((action) => [action.id, action]));
  const ranked = model.roadmapActions.filter((action) =>
    action.linkedFindingIds.some((findingId) => selectedFindingIds.has(findingId))
  );
  const want = new Set(ranked.slice(0, target).map((action) => action.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...want]) {
      for (const dependencyId of byId.get(id)?.dependencyIds ?? []) {
        if (byId.has(dependencyId) && !want.has(dependencyId)) {
          want.add(dependencyId);
          changed = true;
        }
      }
    }
  }
  // Preserve the model's own ordering so orderRoadmapActions() still sees a valid graph.
  const retained = model.roadmapActions.filter((action) => want.has(action.id));
  if (retained.length <= ceiling) return retained;
  // Over ceiling only if dependency closure demanded it; drop leaf actions (nothing depends on
  // them) from the lowest-ranked end until the ceiling holds, never breaking a dependency.
  const result = [...retained];
  while (result.length > ceiling) {
    const dependedOn = new Set(result.flatMap((action) => action.dependencyIds));
    const removableIndex = [...result]
      .map((action, index) => ({ action, index }))
      .reverse()
      .find(({ action }) => !dependedOn.has(action.id))?.index;
    if (removableIndex === undefined) break;
    result.splice(removableIndex, 1);
  }
  return result;
}

export interface EssentialProjection {
  systemic: SystemicCondition;
  findings: MaterialFinding[];
  risks: RiskRegisterEntry[];
  controlActionRecords: ControlActionRecord[];
  appendixControlActionRecords: ControlActionRecord[];
  roadmapActions: RoadmapAction[];
  evidenceToObtain: AdvisoryEvidenceModel['evidenceChecklist'];
  scenarios: AdvisoryEvidenceModel['scenarios'];
  contradictions: AdvisoryEvidenceModel['contradictions'];
  leadershipDecisions: AdvisoryEvidenceModel['leadershipDecisions'];
  /** Counts of the complete L1 universe -- rendered verbatim in the supporting-reference statement. */
  universe: {
    materialFindings: number;
    riskRegister: number;
    controlImprovements: number;
    evidenceChecklist: number;
    roadmapActions: number;
    functionalAgenda: number;
    controlActionRecords: number;
  };
  omitted: {
    materialFindings: number;
    riskRegister: number;
    controlActionRecords: number;
    evidenceChecklist: number;
    roadmapActions: number;
    functionalAgenda: number;
  };
}

export function buildEssentialProjection(
  data: AssembledReportData,
  model: AdvisoryEvidenceModel
): EssentialProjection {
  const systemic = detectSystemicCondition(data);
  const findings = selectEssentialFindings(model, systemic.systemic);
  const selectedFindingIds = new Set(findings.map((finding) => finding.id));

  const riskRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const risks = [...model.riskRegister]
    .filter((risk) => risk.linkedFindingIds.some((id) => selectedFindingIds.has(id)))
    .sort(
      (left, right) =>
        (riskRank[right.priority] ?? 0) - (riskRank[left.priority] ?? 0)
        || left.id.localeCompare(right.id)
    )
    .slice(0, ESSENTIAL_CAPS.risks);

  const allRecords = buildControlActionRecords(model);
  const carCap = systemic.systemic
    ? ESSENTIAL_CAPS.controlActionRecordsSystemic
    : ESSENTIAL_CAPS.controlActionRecords;
  const controlActionRecords = allRecords
    .filter((record) => record.linkedFindingIds.some((id) => selectedFindingIds.has(id)))
    .slice(0, carCap);
  const shownRecordIds = new Set(controlActionRecords.map((record) => record.id));

  const roadmapActions = selectDependencyClosedRoadmap(model, selectedFindingIds);

  // E1 is "further control actions BEYOND the priority set", so it must exclude both what the
  // control-actions section already shows AND what the roadmap already selected. The relationship
  // is authoritative on the record itself (linkedRoadmapActionIds, populated above from roadmap
  // action ids) -- an earlier attempt compared CAR ids and question codes against RA/MF ids, which
  // are different namespaces, so it matched nothing and removed nothing.
  //
  // Computed here, after roadmap selection and BEFORE the cap, so the 40-record allowance is spent
  // on genuinely further actions rather than being silently reduced by a post-cap filter.
  const selectedRoadmapActionIds = new Set(roadmapActions.map((action) => action.id));
  const appendixControlActionRecords = allRecords
    .filter((record) => !shownRecordIds.has(record.id))
    .filter((record) => !record.linkedRoadmapActionIds.some((id) => selectedRoadmapActionIds.has(id)))
    .slice(0, ESSENTIAL_CAPS.appendixControlActionRecords);

  // Accepted ordering rule: selected-finding priority first, then artefact rank. findingRank is
  // the position of the highest-priority selected finding the artefact supports.
  const findingRank = new Map(findings.map((finding, index) => [finding.id, index]));
  const evidenceToObtain = model.evidenceChecklist
    .filter((item) => item.linkedFindingIds.some((id) => selectedFindingIds.has(id)))
    .map((item) => ({
      item,
      rank: Math.min(
        ...item.linkedFindingIds
          .filter((id) => findingRank.has(id))
          .map((id) => findingRank.get(id) as number)
      )
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank
        || left.item.artefact.localeCompare(right.item.artefact)
        || left.item.id.localeCompare(right.item.id)
    )
    .slice(0, ESSENTIAL_CAPS.evidenceToObtain)
    .map(({ item }) => item);

  // Every cap is enforced here, in the projection. Nothing downstream may rely on its own slice.
  const scenarios = model.scenarios.slice(
    0,
    systemic.systemic ? ESSENTIAL_CAPS.scenariosSystemic : ESSENTIAL_CAPS.scenarios
  );
  const contradictions = model.contradictions.slice(0, ESSENTIAL_CAPS.contradictions);
  const leadershipDecisions = model.leadershipDecisions.slice(
    0,
    ESSENTIAL_CAPS.leadershipDecisions
  );

  return {
    systemic,
    findings,
    risks,
    controlActionRecords,
    appendixControlActionRecords,
    roadmapActions,
    evidenceToObtain,
    scenarios,
    contradictions,
    leadershipDecisions,
    universe: {
      materialFindings: model.materialFindings.length,
      riskRegister: model.riskRegister.length,
      controlImprovements: model.controlImprovements.length,
      evidenceChecklist: model.evidenceChecklist.length,
      roadmapActions: model.roadmapActions.length,
      functionalAgenda: model.functionalAgenda.length,
      controlActionRecords: allRecords.length
    },
    omitted: {
      materialFindings: model.materialFindings.length - findings.length,
      riskRegister: model.riskRegister.length - risks.length,
      controlActionRecords:
        allRecords.length - controlActionRecords.length - appendixControlActionRecords.length,
      evidenceChecklist: model.evidenceChecklist.length - evidenceToObtain.length,
      roadmapActions: model.roadmapActions.length - roadmapActions.length,
      functionalAgenda: model.functionalAgenda.length
    }
  };
}

/**
 * Paid-Essential production invariant.
 *
 * A paid Essential report must be produced from exactly one bounded projection instance, threaded
 * through the evidence pack, narrative brief, generation, repair, deterministic fallback, content
 * selection, renderer, commercial-quality validator and supporting-register generation. There is
 * deliberately no Essential fallback to unbounded behaviour: if the projection is absent the
 * generation fails here, before any provider dispatch and before any customer release.
 *
 * Legacy/non-Essential report types are unaffected.
 */
export class EssentialProjectionRequiredError extends Error {
  readonly code = 'essential_projection_required';

  constructor(stage: string) {
    super(`The bounded Essential projection is required before ${stage} and was not supplied.`);
    this.name = 'EssentialProjectionRequiredError';
  }
}

export const ESSENTIAL_PROJECTION_REPORT_TYPES = new Set(['essential_self_assessment']);

export function assertEssentialProjectionPresent(
  reportType: string | null | undefined,
  projection: EssentialProjection | undefined,
  stage: string
): asserts projection is EssentialProjection {
  if (!ESSENTIAL_PROJECTION_REPORT_TYPES.has(String(reportType ?? ''))) {
    if (projection) return;
    return;
  }
  if (!projection) throw new EssentialProjectionRequiredError(stage);
}

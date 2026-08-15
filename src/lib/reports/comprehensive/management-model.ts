import type {
  ScenarioPortfolioRow,
  AssurancePriorityRow,
  ResilienceTestRow, ComprehensiveAssembly, ControlBlueprintRow, DecisionRow, EvidenceRequirementGroup, FindingRow, ProgrammeActionRow, RiskRow } from './assembly';
import type { ComprehensiveProvenance } from './product-contract';

/**
 * Comprehensive management model.
 *
 * One product with two depths. The management synthesis selects and aggregates
 * so an executive can read it; the registers keep every deterministic object so
 * the depth that justifies the price is still there. Nothing is discarded — the
 * synthesis is a view over the registers, and every summary row carries the
 * identifiers of the register rows beneath it.
 *
 * Two problems are solved here and nothing else:
 *
 *   1. 3–60 findings and 12–243 evidence items become a readable core.
 *   2. 55–72 composite role labels become a governance model an executive can use.
 *
 * No prose, no pages, no rendering.
 */

export const COMPREHENSIVE_MANAGEMENT_MODEL_VERSION = 'mk-comprehensive-management-model-v1' as const;

// ---------------------------------------------------------------------------
// Control programmes
// ---------------------------------------------------------------------------

/**
 * Programmes are derived from the semantic families the analytical model
 * already assigns, not from a consulting framework. Fourteen families across
 * the portfolio collapse into six programmes that each correspond to one
 * coherent piece of work with one accountable owner.
 *
 * A family with no mapping keeps its own programme rather than being forced
 * into a neighbour, so a new family cannot be silently mis-filed.
 */
const PROGRAMME_BY_FAMILY: Readonly<Record<string, { programmeId: string; title: string; managementQuestion: string }>> = {
  SUPPLIER_ONBOARDING: { programmeId: 'PROG-SUPPLIER-PAYMENT', title: 'Supplier and payment integrity', managementQuestion: 'Can value be redirected before anyone independently challenges it?' },
  SUPPLIER_PAYMENT_CHANGE: { programmeId: 'PROG-SUPPLIER-PAYMENT', title: 'Supplier and payment integrity', managementQuestion: 'Can value be redirected before anyone independently challenges it?' },
  THIRD_PARTY_OVERSIGHT: { programmeId: 'PROG-SUPPLIER-PAYMENT', title: 'Supplier and payment integrity', managementQuestion: 'Can value be redirected before anyone independently challenges it?' },
  IDENTITY_VERIFICATION: { programmeId: 'PROG-IDENTITY-ACCESS', title: 'Identity and access challenge', managementQuestion: 'Is authority verified at the points where it can be misused?' },
  PRIVILEGED_ACCESS: { programmeId: 'PROG-IDENTITY-ACCESS', title: 'Identity and access challenge', managementQuestion: 'Is authority verified at the points where it can be misused?' },
  ORDINARY_ACCESS: { programmeId: 'PROG-IDENTITY-ACCESS', title: 'Identity and access challenge', managementQuestion: 'Is authority verified at the points where it can be misused?' },
  DETECTION_MONITORING: { programmeId: 'PROG-DETECTION', title: 'Detection and exception review', managementQuestion: 'Would unusual activity be seen and challenged in time?' },
  INCIDENT_RESPONSE: { programmeId: 'PROG-INCIDENT-EVIDENCE', title: 'Incident response and evidence integrity', managementQuestion: 'When something is suspected, can we contain it and keep the evidence?' },
  EVIDENCE_INTEGRITY: { programmeId: 'PROG-INCIDENT-EVIDENCE', title: 'Incident response and evidence integrity', managementQuestion: 'When something is suspected, can we contain it and keep the evidence?' },
  WHISTLEBLOWING: { programmeId: 'PROG-INCIDENT-EVIDENCE', title: 'Incident response and evidence integrity', managementQuestion: 'When something is suspected, can we contain it and keep the evidence?' },
  FRAUD_GOVERNANCE: { programmeId: 'PROG-GOVERNANCE', title: 'Fraud governance and risk identification', managementQuestion: 'Does anyone own fraud risk, and do we know where it sits?' },
  FRAUD_RISK_IDENTIFICATION: { programmeId: 'PROG-GOVERNANCE', title: 'Fraud governance and risk identification', managementQuestion: 'Does anyone own fraud risk, and do we know where it sits?' },
  FRAUD_AWARENESS: { programmeId: 'PROG-CULTURE-IMPROVEMENT', title: 'Culture and continuous improvement', managementQuestion: 'Do people recognise fraud, and does the control environment learn?' },
  FRAUD_CULTURE: { programmeId: 'PROG-CULTURE-IMPROVEMENT', title: 'Culture and continuous improvement', managementQuestion: 'Do people recognise fraud, and does the control environment learn?' },
  CONTINUOUS_IMPROVEMENT: { programmeId: 'PROG-CULTURE-IMPROVEMENT', title: 'Culture and continuous improvement', managementQuestion: 'Do people recognise fraud, and does the control environment learn?' }
};

function programmeFor(family: string) {
  const key = String(family ?? '').toUpperCase();
  return PROGRAMME_BY_FAMILY[key] ?? { programmeId: `PROG-${key || 'UNCLASSIFIED'}`, title: key ? key.replace(/_/g, ' ').toLowerCase() : 'Unclassified', managementQuestion: 'What does this capability require?' };
}

// ---------------------------------------------------------------------------
// Canonical roles
// ---------------------------------------------------------------------------

export type CanonicalRoleType = 'EXECUTIVE_ACCOUNTABILITY' | 'PROCESS_OWNERSHIP' | 'OVERSIGHT';

/**
 * The role atoms the 68 playbooks actually use, grouped by function.
 *
 * The library expresses 95 distinct role strings across three fields, almost
 * all of them composites: "CEO / Managing Director" is one accountability
 * expressed as alternatives, not two positions, and "Head of Risk with process
 * owners" is one accountability with a collaborator. Matching is on the leading
 * atom, so the composite resolves to a single canonical role and the original
 * label is kept for provenance.
 *
 * Nothing here invents a position. Every canonical role is a name the library
 * already uses.
 */
const ROLE_CANON: ReadonlyArray<{ id: string; display: string; type: CanonicalRoleType; match: RegExp }> = [
  // Executive accountability
  { id: 'ROLE-CEO', display: 'Chief Executive / Managing Director', type: 'EXECUTIVE_ACCOUNTABILITY', match: /^(chief executive|ceo|managing director)/i },
  { id: 'ROLE-CFO', display: 'Chief Financial Officer', type: 'EXECUTIVE_ACCOUNTABILITY', match: /^(cfo|chief financial)/i },
  { id: 'ROLE-COO', display: 'Chief Operating Officer', type: 'EXECUTIVE_ACCOUNTABILITY', match: /^(coo|chief operating)/i },
  { id: 'ROLE-CPO', display: 'Chief People Officer', type: 'EXECUTIVE_ACCOUNTABILITY', match: /^chief people/i },
  { id: 'ROLE-CTO', display: 'Chief Technology Officer', type: 'EXECUTIVE_ACCOUNTABILITY', match: /^chief technology/i },
  { id: 'ROLE-GC', display: 'General Counsel', type: 'EXECUTIVE_ACCOUNTABILITY', match: /^general counsel/i },
  { id: 'ROLE-AUDIT-CHAIR', display: 'Audit Committee Chair', type: 'EXECUTIVE_ACCOUNTABILITY', match: /^(audit committee chair|chair of audit committee)/i },
  // Oversight
  { id: 'ROLE-BOARD', display: 'Board', type: 'OVERSIGHT', match: /^board/i },
  { id: 'ROLE-AUDIT-COMMITTEE', display: 'Audit Committee', type: 'OVERSIGHT', match: /^audit committee/i },
  { id: 'ROLE-RISK-COMMITTEE', display: 'Risk Committee', type: 'OVERSIGHT', match: /^risk committee/i },
  { id: 'ROLE-INTERNAL-AUDIT', display: 'Internal Audit', type: 'OVERSIGHT', match: /^internal audit/i },
  { id: 'ROLE-LEGAL', display: 'Legal', type: 'OVERSIGHT', match: /^legal/i },
  { id: 'ROLE-COMPLIANCE', display: 'Compliance', type: 'OVERSIGHT', match: /^compliance/i },
  // Process ownership
  { id: 'ROLE-RISK-FUNCTION', display: 'Risk function', type: 'PROCESS_OWNERSHIP', match: /^(head of risk|risk\b|named fraud-risk executive|fraud risk analyst|fraud analytics|fraud monitoring)/i },
  { id: 'ROLE-FINANCE-OPS', display: 'Finance and payment operations', type: 'PROCESS_OWNERSHIP', match: /^(finance control|finance and|accounts payable)/i },
  { id: 'ROLE-PROCUREMENT', display: 'Procurement and vendor management', type: 'PROCESS_OWNERSHIP', match: /^(procurement|relationship owner|vendor)/i },
  { id: 'ROLE-TECH-SECURITY', display: 'Technology and information security', type: 'PROCESS_OWNERSHIP', match: /^(information security|security (monitoring|operations|awareness)|identity and access|business system owners|digital)/i },
  { id: 'ROLE-PEOPLE', display: 'People, learning and ethics', type: 'PROCESS_OWNERSHIP', match: /^(human resources|learning and development|ethics|executive team with internal communications)/i },
  { id: 'ROLE-INVESTIGATION', display: 'Investigation and incident response', type: 'PROCESS_OWNERSHIP', match: /^(investigation lead|fraud incident-response)/i },
  { id: 'ROLE-CHANGE', display: 'Change and project governance', type: 'PROCESS_OWNERSHIP', match: /^change and project/i },
  { id: 'ROLE-PROCESS-OWNERS', display: 'Named business process owners', type: 'PROCESS_OWNERSHIP', match: /^(named process owners|process owners|business control owners)/i }
];

/** Separators the library uses for alternatives and for collaboration. */
const ALTERNATIVE = /\s*\/\s*|\s+\bor\b\s+/i;
const COLLABORATIVE = /\s+\b(?:and|with)\b\s+/i;

export interface CanonicalRole {
  canonicalRoleId: string;
  displayRole: string;
  roleType: CanonicalRoleType;
  sourceRoleLabels: string[];
  controls: string[];
  decisions: string[];
  evidenceResponsibilities: string[];
  reviewResponsibilities: string[];
  escalationResponsibilities: string[];
  provenance: ComprehensiveProvenance;
}

/**
 * Resolve one library label to a canonical role.
 *
 * The leading atom decides. "CFO / COO" and "COO / CFO" therefore resolve
 * differently, which is correct: the library states the primary accountability
 * first, and inverting it would change who is accountable.
 */
function canonicalRoleFor(label: string, fallbackType: CanonicalRoleType): { id: string; display: string; type: CanonicalRoleType } {
  const full = String(label ?? '').trim();
  // Match the whole label first. Splitting on "and" up front turned "Identity
  // and Access Management" into a role called "Identity", because the separator
  // that joins collaborators also occurs inside role names.
  const whole = ROLE_CANON.find((entry) => entry.match.test(full));
  if (whole) return { id: whole.id, display: whole.display, type: whole.type };
  const primary = full.split(ALTERNATIVE)[0]!.split(COLLABORATIVE)[0]!.trim();
  const match = ROLE_CANON.find((entry) => entry.match.test(primary));
  if (match) return { id: match.id, display: match.display, type: match.type };
  // Unmapped labels keep their own identity rather than being forced into a
  // neighbouring role, so a library addition is visible instead of mis-filed.
  const slug = primary.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'UNSPECIFIED';
  return { id: `ROLE-${slug}`, display: primary || 'Unspecified', type: fallbackType };
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface ManagementTheme {
  themeId: string;
  title: string;
  managementQuestion: string;
  /** Register rows this theme summarises. The core never states anything the registers do not hold. */
  findingIds: string[];
  riskIds: string[];
  controlIds: string[];
  criticalFindingCount: number;
  hardGateFindingCount: number;
  domains: string[];
  provenance: ComprehensiveProvenance;
}

export interface ControlProgramme {
  programmeId: string;
  title: string;
  managementQuestion: string;
  controlIds: string[];
  accountableRoleId: string;
  evidenceGroupCount: number;
  evidenceItemCount: number;
  /** The core answer to "how will management know this is working". Detail lives in the register. */
  measureCount: number;
  targetPeriods: string[];
  provenance: ComprehensiveProvenance;
}

export interface ImplementationPhase {
  phase: string;
  actionIds: string[];
  programmeIds: string[];
  actions: ProgrammeActionRow[];
}

export interface MeasurementRow {
  measure: string;
  programmeId: string;
  sourceControlIds: string[];
  provenance: ComprehensiveProvenance;
}

export interface ComprehensiveManagementModel {
  version: typeof COMPREHENSIVE_MANAGEMENT_MODEL_VERSION;
  narrativeMode: string;
  /** CORE — what management reads. */
  core: {
    managementThemes: ManagementTheme[];
    exposureThemes: ManagementTheme[];
    controlProgrammes: ControlProgramme[];
    governanceRoles: CanonicalRole[];
    decisionAgenda: DecisionRow[];
    implementationPhases: ImplementationPhase[];
  };
  /** REGISTERS — the traceable depth behind the core. */
  registers: {
    findings: FindingRow[];
    risks: RiskRow[];
    controls: ControlBlueprintRow[];
    evidence: EvidenceRequirementGroup[];
    actions: ProgrammeActionRow[];
    /**
     * Essential's fraud pathways, carried into Comprehensive so the higher tier
     * never gives the customer less scenario insight than the lower one.
     */
    scenarios: ScenarioPortfolioRow[];
    /**
     * Capabilities worth confirming rather than fixing. Empty wherever the
     * assessment records no operating capability, which is the honest result
     * for a low-readiness profile.
     */
    assurancePriorities: AssurancePriorityRow[];
    /**
     * High-readiness resilience tests, grounded in sustainment-priority fields.
     * Empty outside sustainment, where the model records no operating capability.
     */
    resilienceTests: ResilienceTestRow[];
    /**
     * One measure per control, so this scales with the register rather than the
     * core. The core answers "how will we know" at programme level; this is the
     * detail behind it.
     */
    measures: MeasurementRow[];
  };
  counts: Record<string, number>;
}

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

export function buildComprehensiveManagementModel(assembly: ComprehensiveAssembly): ComprehensiveManagementModel {
  const findingById = new Map(assembly.findingRegister.map((finding) => [finding.findingId, finding]));

  // ---- Management themes: findings grouped by control programme -------------
  const themeIndex = new Map<string, ManagementTheme>();
  for (const finding of assembly.findingRegister) {
    const programme = programmeFor(finding.primarySemanticFamily);
    const existing = themeIndex.get(programme.programmeId) ?? {
      themeId: programme.programmeId, title: programme.title, managementQuestion: programme.managementQuestion,
      findingIds: [], riskIds: [], controlIds: [], criticalFindingCount: 0, hardGateFindingCount: 0, domains: [],
      provenance: 'DERIVED_ANALYSIS' as ComprehensiveProvenance
    };
    existing.findingIds.push(finding.findingId);
    existing.riskIds.push(...finding.linkedRiskIds);
    existing.controlIds.push(...finding.linkedControlIds);
    existing.domains.push(finding.domainName);
    if (finding.isCriticalControl) existing.criticalFindingCount += 1;
    if (finding.isHardGate) existing.hardGateFindingCount += 1;
    themeIndex.set(programme.programmeId, existing);
  }
  const managementThemes = [...themeIndex.values()]
    .map((theme) => ({ ...theme, riskIds: unique(theme.riskIds), controlIds: unique(theme.controlIds), domains: unique(theme.domains) }))
    // Weight by the assessment's own severity signals, not by row count alone.
    .sort((a, b) => (b.hardGateFindingCount - a.hardGateFindingCount) || (b.criticalFindingCount - a.criticalFindingCount) || (b.findingIds.length - a.findingIds.length));

  // ---- Exposure themes: risks grouped through their originating findings ----
  const exposureIndex = new Map<string, ManagementTheme>();
  for (const risk of assembly.riskRegister) {
    const family = risk.linkedFindingIds.map((id) => findingById.get(id)?.primarySemanticFamily).find(Boolean) ?? '';
    const programme = programmeFor(family);
    const existing = exposureIndex.get(programme.programmeId) ?? {
      themeId: `EXP-${programme.programmeId}`, title: programme.title, managementQuestion: programme.managementQuestion,
      findingIds: [], riskIds: [], controlIds: [], criticalFindingCount: 0, hardGateFindingCount: 0, domains: [],
      provenance: 'DERIVED_ANALYSIS' as ComprehensiveProvenance
    };
    existing.riskIds.push(risk.riskId);
    existing.findingIds.push(...risk.linkedFindingIds);
    if (risk.affectedDomain) existing.domains.push(risk.affectedDomain);
    exposureIndex.set(programme.programmeId, existing);
  }
  const exposureThemes = [...exposureIndex.values()]
    .map((theme) => ({ ...theme, findingIds: unique(theme.findingIds), domains: unique(theme.domains) }))
    .sort((a, b) => b.riskIds.length - a.riskIds.length);

  // ---- Control programmes ---------------------------------------------------
  const evidenceByControl = new Map(assembly.evidenceRequirements.map((group) => [group.controlId, group]));
  const programmeIndex = new Map<string, ControlProgramme & { roleVotes: string[] }>();
  for (const control of assembly.controlBlueprints) {
    const family = findingById.get(control.linkedFindingId)?.primarySemanticFamily ?? '';
    const programme = programmeFor(family);
    const existing = programmeIndex.get(programme.programmeId) ?? {
      programmeId: programme.programmeId, title: programme.title, managementQuestion: programme.managementQuestion,
      controlIds: [], accountableRoleId: '', evidenceGroupCount: 0, evidenceItemCount: 0, measureCount: 0, targetPeriods: [],
      provenance: 'CONTROL_LIBRARY' as ComprehensiveProvenance, roleVotes: []
    };
    existing.controlIds.push(control.controlId);
    existing.roleVotes.push(canonicalRoleFor(control.accountableExecutiveRole, 'EXECUTIVE_ACCOUNTABILITY').id);
    if (control.targetPeriod) existing.targetPeriods.push(control.targetPeriod);
    const group = evidenceByControl.get(control.controlId);
    if (group) { existing.evidenceGroupCount += 1; existing.evidenceItemCount += group.items.length; }
    programmeIndex.set(programme.programmeId, existing);
  }
  const controlProgrammes: ControlProgramme[] = [...programmeIndex.values()].map((entry) => {
    // The programme's accountable role is the one the library assigns most often
    // across its controls — a deterministic majority, not a judgement.
    const counts = new Map<string, number>();
    for (const vote of entry.roleVotes) counts.set(vote, (counts.get(vote) ?? 0) + 1);
    const accountableRoleId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const { roleVotes, ...programme } = entry;
    return { ...programme, accountableRoleId, targetPeriods: unique(programme.targetPeriods) };
  }).sort((a, b) => b.controlIds.length - a.controlIds.length);

  // ---- Governance: canonical roles -----------------------------------------
  const roleIndex = new Map<string, CanonicalRole>();
  const roleFor = (label: string, type: CanonicalRoleType): CanonicalRole => {
    const canonical = canonicalRoleFor(label, type);
    const existing = roleIndex.get(canonical.id) ?? {
      canonicalRoleId: canonical.id, displayRole: canonical.display, roleType: canonical.type,
      sourceRoleLabels: [], controls: [], decisions: [], evidenceResponsibilities: [],
      reviewResponsibilities: [], escalationResponsibilities: [], provenance: 'CONTROL_LIBRARY' as ComprehensiveProvenance
    };
    if (label && !existing.sourceRoleLabels.includes(label)) existing.sourceRoleLabels.push(label);
    roleIndex.set(canonical.id, existing);
    return existing;
  };
  for (const control of assembly.controlBlueprints) {
    if (control.accountableExecutiveRole) roleFor(control.accountableExecutiveRole, 'EXECUTIVE_ACCOUNTABILITY').controls.push(control.controlId);
    if (control.processOwnerRole) {
      const entry = roleFor(control.processOwnerRole, 'PROCESS_OWNERSHIP');
      entry.controls.push(control.controlId);
      if (control.operatingFrequency) entry.reviewResponsibilities.push(control.operatingFrequency);
    }
    if (control.oversightFunction) {
      const entry = roleFor(control.oversightFunction, 'OVERSIGHT');
      if (control.escalationThreshold) entry.escalationResponsibilities.push(control.escalationThreshold);
    }
  }
  for (const group of assembly.evidenceRequirements) {
    for (const item of group.items) {
      if (item.ownerRole) roleFor(item.ownerRole, 'PROCESS_OWNERSHIP').evidenceResponsibilities.push(item.evidenceId);
    }
  }
  for (const decision of assembly.governance.decisions) {
    if (decision.ownerRole) roleFor(decision.ownerRole, 'EXECUTIVE_ACCOUNTABILITY').decisions.push(decision.decisionId);
  }
  /**
   * The decision agenda must name its owners in the same vocabulary as the
   * governance table. Passing the assembly rows through unchanged put "CEO /
   * Managing Director" on one page and "Chief Executive / Managing Director" on
   * another for the same office — the split-vocabulary problem role
   * normalisation exists to remove, reintroduced at the last step.
   */
  const decisionAgenda = assembly.governance.decisions.map((decision) => (decision.ownerRole
    ? { ...decision, ownerRole: canonicalRoleFor(decision.ownerRole, 'EXECUTIVE_ACCOUNTABILITY').display }
    : decision));
  const ROLE_TYPE_ORDER: CanonicalRoleType[] = ['EXECUTIVE_ACCOUNTABILITY', 'PROCESS_OWNERSHIP', 'OVERSIGHT'];
  const governanceRoles = [...roleIndex.values()]
    .map((role) => ({
      ...role,
      controls: unique(role.controls), decisions: unique(role.decisions),
      evidenceResponsibilities: unique(role.evidenceResponsibilities),
      reviewResponsibilities: unique(role.reviewResponsibilities),
      escalationResponsibilities: unique(role.escalationResponsibilities)
    }))
    .sort((a, b) => (ROLE_TYPE_ORDER.indexOf(a.roleType) - ROLE_TYPE_ORDER.indexOf(b.roleType)) || (b.controls.length - a.controls.length));

  // ---- Implementation phases ------------------------------------------------
  const controlProgrammeOf = new Map<string, string>();
  for (const programme of controlProgrammes) {
    for (const controlId of programme.controlIds) controlProgrammeOf.set(controlId, programme.programmeId);
  }
  const implementationPhases: ImplementationPhase[] = assembly.programme.horizons.map((horizon) => {
    const programmeIds = unique(horizon.actions.flatMap((action) =>
      action.linkedFindingIds.map((findingId) => programmeFor(findingById.get(findingId)?.primarySemanticFamily ?? '').programmeId)));
    return { phase: horizon.horizon, actionIds: horizon.actions.map((action) => action.actionId), programmeIds, actions: horizon.actions };
  });

  // ---- Measurement framework ------------------------------------------------
  const measureIndex = new Map<string, MeasurementRow>();
  for (const control of assembly.controlBlueprints) {
    const measure = control.effectivenessTest;
    if (!measure) continue;
    const programmeId = controlProgrammeOf.get(control.controlId) ?? '';
    const key = `${programmeId}::${measure.toLowerCase()}`;
    const existing = measureIndex.get(key);
    if (existing) { existing.sourceControlIds = unique([...existing.sourceControlIds, control.controlId]); continue; }
    measureIndex.set(key, { measure, programmeId, sourceControlIds: [control.controlId], provenance: 'CONTROL_LIBRARY' });
  }
  const measurementFramework = [...measureIndex.values()];

  // Programme-level measure counts: the core answer, with the per-control detail
  // kept in the register.
  const measuresByProgramme = new Map<string, number>();
  for (const measure of measurementFramework) {
    measuresByProgramme.set(measure.programmeId, (measuresByProgramme.get(measure.programmeId) ?? 0) + 1);
  }
  const withMeasureCounts = controlProgrammes.map((programme) => ({ ...programme, measureCount: measuresByProgramme.get(programme.programmeId) ?? 0 }));

  const registers = {
    findings: assembly.findingRegister,
    risks: assembly.riskRegister,
    controls: assembly.controlBlueprints,
    evidence: assembly.evidenceRequirements,
    actions: assembly.programme.horizons.flatMap((horizon) => horizon.actions)
  };

  return {
    version: COMPREHENSIVE_MANAGEMENT_MODEL_VERSION,
    narrativeMode: assembly.narrativeMode,
    core: { managementThemes, exposureThemes, controlProgrammes: withMeasureCounts, governanceRoles, decisionAgenda, implementationPhases },
    registers: { ...registers, measures: measurementFramework, scenarios: assembly.scenarioPortfolio, assurancePriorities: assembly.assurancePriorities, resilienceTests: assembly.resilienceTests },
    counts: {
      managementThemes: managementThemes.length,
      exposureThemes: exposureThemes.length,
      controlProgrammes: controlProgrammes.length,
      governanceRoles: governanceRoles.length,
      decisions: assembly.governance.decisions.length,
      implementationPhases: implementationPhases.length,
      registerMeasures: measurementFramework.length,
      registerScenarios: assembly.scenarioPortfolio.length,
      registerAssurancePriorities: assembly.assurancePriorities.length,
      registerResilienceTests: assembly.resilienceTests.length,
      registerFindings: registers.findings.length,
      registerRisks: registers.risks.length,
      registerControls: registers.controls.length,
      registerEvidenceGroups: registers.evidence.length,
      registerEvidenceItems: registers.evidence.reduce((sum, group) => sum + group.items.length, 0),
      registerActions: registers.actions.length
    }
  };
}

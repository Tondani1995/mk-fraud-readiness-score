/**
 * Content family taxonomy for the Essential report.
 *
 * Exposure identity is the deterministic cluster identifier carried on
 * blueprint.findingClusters. It is never inferred from a customer-facing label
 * and never taken from array position.
 *
 * Two earlier defects came from inferring it. Pairing exposures to scenarios by
 * index explained the identity exposure with evidence-custody content. Matching
 * on label keywords then produced duplicate families on seven of eleven real
 * assessments, and no family at all on three, because a label such as "weak
 * challenge at identity, transaction and sensitive-change points" matches
 * hints for several families at once.
 *
 * The upstream engine already resolves this. Each cluster carries a stable
 * clusterId and the semanticFamilies it groups, so the presentation layer reads
 * that identity rather than reconstructing it.
 */

export const CONTENT_FAMILY_VERSION = 'mk-essential-content-families-v2';

/** Stable exposure identity: the deterministic cluster identifier. */
export type ExposureFamily = string;

/** One deterministic exposure cluster as the blueprint defines it. */
export interface ExposureCluster {
  clusterId: string;
  title: string;
  whyTogether?: string;
  semanticFamilies: string[];
  findingRefs?: string[];
  sourceRefs?: string[];
}

/**
 * Reads clusters from the blueprint. A cluster without an identifier or without
 * families cannot own content, so it is dropped here and reported by validation
 * rather than being guessed at.
 */
export function exposureClusters(blueprint: any): ExposureCluster[] {
  const clusters = Array.isArray(blueprint?.findingClusters) ? blueprint.findingClusters : [];
  return clusters
    .filter((cluster: any) => typeof cluster?.clusterId === 'string' && Array.isArray(cluster?.semanticFamilies) && cluster.semanticFamilies.length > 0)
    .map((cluster: any) => ({
      clusterId: String(cluster.clusterId),
      title: String(cluster.title ?? ''),
      whyTogether: cluster.whyTogether ? String(cluster.whyTogether) : undefined,
      semanticFamilies: cluster.semanticFamilies.map((family: string) => String(family).toUpperCase()),
      findingRefs: Array.isArray(cluster.findingRefs) ? cluster.findingRefs : [],
      sourceRefs: Array.isArray(cluster.sourceRefs) ? cluster.sourceRefs : []
    }));
}

/** Clusters the blueprint offered but which cannot own content. */
export function unresolvedClusters(blueprint: any): string[] {
  const clusters = Array.isArray(blueprint?.findingClusters) ? blueprint.findingClusters : [];
  return clusters
    .filter((cluster: any) => !cluster?.clusterId || !Array.isArray(cluster?.semanticFamilies) || cluster.semanticFamilies.length === 0)
    .map((cluster: any) => String(cluster?.title ?? cluster?.clusterId ?? 'unnamed cluster'));
}

/**
 * Scenario family -> the semantic family it exercises. The cluster owning that
 * semantic family owns the scenario, so a scenario reaches its exposure through
 * shared analytical content rather than through position.
 */
const SCENARIO_TO_SEMANTIC: Record<string, string[]> = {
  SUPPLIER_PAYMENT_DIVERSION: ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE'],
  PAYMENT_DIVERSION: ['SUPPLIER_PAYMENT_CHANGE', 'SUPPLIER_ONBOARDING'],
  DETECTION_EVASION: ['DETECTION_MONITORING'],
  IDENTITY_COMPROMISE: ['IDENTITY_VERIFICATION'],
  IDENTITY_IMPERSONATION: ['IDENTITY_VERIFICATION'],
  // The Fact Pack emits PRIVILEGED_ACCESS and INCIDENT_RESPONSE as primary
  // families; without them here a cluster realising only those families could
  // not own its scenario, and the pathway was silently dropped from the report.
  PRIVILEGED_ACCESS_MISUSE: ['PRIVILEGED_ACCESS', 'ACCESS_CONTROL', 'IDENTITY_VERIFICATION'],
  INCIDENT_CONCEALMENT: ['EVIDENCE_INTEGRITY', 'INCIDENT_RESPONSE'],
  EVIDENCE_DEGRADATION: ['EVIDENCE_INTEGRITY'],
  PAYROLL_MANIPULATION: ['PAYROLL_INTEGRITY'],
  CASH_CUSTODY_MISUSE: ['CASH_CUSTODY'],
  STOCK_ASSET_MISUSE: ['STOCK_ASSET_CUSTODY']
};

/**
 * A scenario whose family maps to no cluster present in this assessment.
 *
 * The scenario taxonomy is broader than any one organisation's exposure
 * clusters, so an unowned scenario is an ordinary outcome rather than a defect:
 * the assessment simply did not raise that exposure as material. It is omitted
 * from the report and recorded, never attached to the nearest-looking cluster.
 */
export interface UnownedScenario {
  scenarioId: string;
  scenarioFamily: string;
  candidateSemanticFamilies: string[];
  availableClusterIds: string[];
}

export function unownedScenarios(clusters: ExposureCluster[], scenarios: any[]): UnownedScenario[] {
  return (Array.isArray(scenarios) ? scenarios : [])
    .filter((scenario) => !clusterForScenario(clusters, scenario?.scenarioFamily))
    .map((scenario) => ({
      scenarioId: String(scenario?.factRef ?? ''),
      scenarioFamily: String(scenario?.scenarioFamily ?? ''),
      candidateSemanticFamilies: semanticFamiliesForScenario(scenario?.scenarioFamily),
      availableClusterIds: clusters.map((cluster) => cluster.clusterId)
    }));
}

export function semanticFamiliesForScenario(scenarioFamily: string | undefined | null): string[] {
  return SCENARIO_TO_SEMANTIC[String(scenarioFamily ?? '').toUpperCase()] ?? [];
}

/** The cluster that owns a semantic family, if any. */
export function clusterForSemanticFamily(clusters: ExposureCluster[], semanticFamily: string | undefined | null): ExposureCluster | undefined {
  const family = String(semanticFamily ?? '').toUpperCase();
  if (!family) return undefined;
  return clusters.find((cluster) => cluster.semanticFamilies.includes(family));
}

/** The cluster that owns a scenario, resolved through its semantic families. */
export function clusterForScenario(clusters: ExposureCluster[], scenarioFamily: string | undefined | null): ExposureCluster | undefined {
  for (const family of semanticFamiliesForScenario(scenarioFamily)) {
    const cluster = clusterForSemanticFamily(clusters, family);
    if (cluster) return cluster;
  }
  return undefined;
}

/** Cross-cutting families belong to no single exposure and may support any. */
export const CROSS_CUTTING_FAMILIES = ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'FRAUD_CULTURE'] as const;

export function isCrossCutting(semanticFamily: string | undefined | null): boolean {
  return (CROSS_CUTTING_FAMILIES as readonly string[]).includes(String(semanticFamily ?? '').toUpperCase());
}

/**
 * Deliberate short labels per semantic family.
 *
 * The analytical model stores full control specifications. Those are correct and
 * must be retained, but they are not presentation text: clipping one to fit a
 * diagram node produced an ellipsis mid-clause, which exposed the defect rather
 * than solving it. Each family therefore carries an authored short form.
 */
export interface FamilyPresentation {
  shortLabel: string;
  /** The operating state management is aiming at, not the artefact proving it. */
  targetState: string;
  /** Where a pathway is interrupted. */
  interruptionPoint: string;
  scenarioEntry: string;
  scenarioControlBreak: string;
  scenarioExposure: string;
}

const FAMILY_PRESENTATION: Record<string, FamilyPresentation> = {
  FRAUD_GOVERNANCE: {
    shortLabel: 'Fraud-risk ownership and escalation',
    targetState: 'Every material fraud risk and key control has a named owner, decision authority, escalation route and reporting rhythm.',
    interruptionPoint: 'Named ownership and a defined escalation route.',
    scenarioEntry: 'A fraud concern arises with no clear owner',
    scenarioControlBreak: 'No defined decision or escalation authority',
    scenarioExposure: 'The matter stalls before anyone can act'
  },
  FRAUD_RISK_IDENTIFICATION: {
    shortLabel: 'Fraud risk mapping and treatment ownership',
    targetState: 'Fraud risks are mapped to processes, refreshed on change and assigned to named treatment owners.',
    interruptionPoint: 'A current fraud-risk map with assigned treatment owners.',
    scenarioEntry: 'A process changes without fraud-risk review',
    scenarioControlBreak: 'No refresh of the fraud-risk map',
    scenarioExposure: 'New exposure enters unassessed'
  },
  SUPPLIER_ONBOARDING: {
    shortLabel: 'Independent supplier verification before activation',
    targetState: 'New suppliers and bank-detail changes are independently challenged before activation or payment.',
    interruptionPoint: 'Independent verification before a supplier or bank change takes effect.',
    scenarioEntry: 'Bank-detail or supplier change submitted',
    scenarioControlBreak: 'Independent verification absent or bypassed',
    scenarioExposure: 'Legitimate payment redirected before challenge'
  },
  IDENTITY_VERIFICATION: {
    shortLabel: 'Verification at identity and sensitive-change points',
    targetState: 'Identity and sensitive profile or account changes are verified proportionately to their risk before they take effect.',
    interruptionPoint: 'Risk-based verification at the point of change.',
    scenarioEntry: 'A sensitive profile or account change is requested',
    scenarioControlBreak: 'Change accepted without proportionate verification',
    scenarioExposure: 'Control is bypassed at the point of change'
  },
  DETECTION_MONITORING: {
    shortLabel: 'Repeatable monitoring and named exception review',
    targetState: 'Material processes are monitored on a defined cycle and exceptions are reviewed by a named owner within an agreed period.',
    interruptionPoint: 'A defined monitoring cycle with named exception review.',
    scenarioEntry: 'Unusual transaction or activity occurs',
    scenarioControlBreak: 'No repeatable monitoring or timely exception review',
    scenarioExposure: 'Activity remains below timely challenge'
  },
  EVIDENCE_INTEGRITY: {
    shortLabel: 'Controlled incident and evidence handling',
    targetState: 'Suspected matters follow a defined intake, preservation and custody route from the moment they are raised.',
    interruptionPoint: 'A defined intake and preservation route at first report.',
    scenarioEntry: 'A suspected fraud matter arises',
    scenarioControlBreak: 'Preservation and custody route is informal',
    scenarioExposure: 'Evidence fragmented, delayed or weakened'
  },
  INCIDENT_RESPONSE: {
    shortLabel: 'Defined intake and containment for suspected fraud',
    targetState: 'Suspected fraud follows a severity-based intake route with named containment ownership, investigation decision rights and closure criteria.',
    interruptionPoint: 'A severity-based intake route with named containment ownership.',
    scenarioEntry: 'A suspected fraud matter is reported',
    scenarioControlBreak: 'No severity-based intake or containment ownership',
    scenarioExposure: 'The matter escalates while ownership is decided'
  },
  PRIVILEGED_ACCESS: {
    shortLabel: 'Restricted and recertified privileged access',
    targetState: 'Privileged accounts are named, restricted to justified need, logged, recertified on a defined cycle and removed when the justification ends.',
    interruptionPoint: 'Named privileged accounts with periodic recertification.',
    scenarioEntry: 'A privileged account is used outside its justified purpose',
    scenarioControlBreak: 'Privileged use is not logged or recertified',
    scenarioExposure: 'Elevated rights persist beyond the need for them'
  },
  ORDINARY_ACCESS: {
    shortLabel: 'Role-based access and segregation of duties',
    targetState: 'Access follows current role responsibilities, with segregation-of-duties conflicts identified, justified or removed on a defined cycle.',
    interruptionPoint: 'A current reconciliation of access against role responsibilities.',
    scenarioEntry: 'A role changes without an access review',
    scenarioControlBreak: 'Access and segregation are not reconciled to current duties',
    scenarioExposure: 'One person can both initiate and approve'
  },
  FRAUD_AWARENESS: {
    shortLabel: 'Role-specific fraud awareness and reporting',
    targetState: 'People in exposed roles recognise the fraud indicators relevant to their work and use a known reporting route when they see one.',
    interruptionPoint: 'Role-specific awareness with a known reporting route.',
    scenarioEntry: 'An employee receives an unusual request',
    scenarioControlBreak: 'The indicator is not recognised or the reporting route is unclear',
    scenarioExposure: 'The warning is never raised'
  },
  CONTINUOUS_IMPROVEMENT: {
    shortLabel: 'Learning and control refresh after events',
    targetState: 'Findings from incidents and reviews are captured and drive a scheduled refresh of fraud risks and controls.',
    interruptionPoint: 'A scheduled review that converts findings into control change.',
    scenarioEntry: 'A matter closes without structured review',
    scenarioControlBreak: 'No route from lesson to control change',
    scenarioExposure: 'The same exposure recurs'
  },
  PAYROLL_INTEGRITY: {
    shortLabel: 'Payroll master-file and pre-payment review',
    targetState: 'Payroll changes and unusual records are reconciled and independently reviewed before each payment run.',
    interruptionPoint: 'Independent pre-payment review of payroll changes and exceptions.',
    scenarioEntry: 'A payroll master-file change or unusual record enters a payment run',
    scenarioControlBreak: 'No independent pre-payment reconciliation or exception decision',
    scenarioExposure: 'Unauthorised payroll value is released'
  },
  CASH_CUSTODY: {
    shortLabel: 'Cash custody, counting and reconciliation',
    targetState: 'Cash is assigned to defined custodians, counted, banked and reconciled, with differences investigated promptly.',
    interruptionPoint: 'An attributable count and reconciliation before cash differences accumulate.',
    scenarioEntry: 'A cash count, banking or reconciliation difference arises',
    scenarioControlBreak: 'Custody or difference review is informal or delayed',
    scenarioExposure: 'Shortage or diversion remains within normal variance'
  },
  STOCK_ASSET_CUSTODY: {
    shortLabel: 'Stock and physical-asset custody',
    targetState: 'Stock and physical assets have defined custodians, authorised movements, periodic counts and independent reconciliation.',
    interruptionPoint: 'A complete movement, count and write-off reconciliation.',
    scenarioEntry: 'A stock movement, count difference or disposal occurs',
    scenarioControlBreak: 'Custody, movement or write-off evidence is incomplete',
    scenarioExposure: 'Physical value is diverted or written off without challenge'
  }
};

export function familyPresentation(semanticFamily: string | undefined | null): FamilyPresentation | undefined {
  return FAMILY_PRESENTATION[String(semanticFamily ?? '').toUpperCase()];
}

/**
 * Diagnostic pattern families.
 *
 * Each pattern names the domains that genuinely evidence it, so a row is
 * supported by several related signals rather than whichever score happened to
 * match a keyword. A pattern with fewer than two present signals is dropped
 * rather than padded.
 */
export interface DiagnosticPatternDefinition {
  patternId: string;
  displayTitle: string;
  /** Matched against domain names. */
  domainMatchers: RegExp[];
  whyItMatters: string;
  /**
   * The same pattern, stated for an organisation whose contributing domains are
   * already operating.
   *
   * `whyItMatters` asserts an absence ("not yet managed through a repeatable
   * cycle"). In a sustainment report that contradicts the report's own exhibit,
   * which says the capability is working and names what would signal drift. The
   * assessed state decides which of the two is true; neither is a default.
   */
  whyItMattersWhenOperating: string;
  semanticFamilies: string[];
}

export const DIAGNOSTIC_PATTERNS: DiagnosticPatternDefinition[] = [
  {
    patternId: 'GOVERNANCE_AND_RISK_DISCIPLINE',
    displayTitle: 'Fraud governance and risk discipline',
    domainMatchers: [/leadership|governance/i, /risk identification/i, /continuous improvement|monitoring/i],
    whyItMatters: 'Fraud risk is not yet managed through a repeatable cycle of ownership, assessment and review.',
    whyItMattersWhenOperating: 'The reported cycle of ownership, assessment and review holds only while it stays current, evidenced and connected to management decisions.',
    semanticFamilies: ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION']
  },
  {
    patternId: 'SUPPLIER_AND_PAYMENT_INTEGRITY',
    displayTitle: 'Supplier and payment integrity',
    domainMatchers: [/third[- ]party|supply chain/i, /operational fraud controls/i],
    whyItMatters: 'Operational controls do not extend consistently to supplier onboarding and payment-change challenge, leaving direct value-diversion exposure.',
    whyItMattersWhenOperating: 'Supplier onboarding and payment-change challenge are reported as operating; the management question is whether that discipline holds across the full population and through supplier or process change.',
    semanticFamilies: ['SUPPLIER_ONBOARDING']
  },
  {
    patternId: 'MONITORING_AND_DETECTION',
    displayTitle: 'Monitoring and detection coverage',
    domainMatchers: [/detection/i, /continuous improvement|monitoring/i, /digital|identity/i],
    whyItMatters: 'Unusual activity may not be challenged early enough, allowing exposure to remain below management attention.',
    whyItMattersWhenOperating: 'Monitoring is reported as operating; the management question is whether coverage, alert ownership and escalation keep pace as volumes and fraud methods change.',
    semanticFamilies: ['DETECTION_MONITORING', 'IDENTITY_VERIFICATION']
  },
  {
    patternId: 'INCIDENT_RESPONSE_AND_EVIDENCE',
    displayTitle: 'Incident response and evidence integrity',
    domainMatchers: [/incident response/i, /culture|awareness/i, /whistleblow|reporting culture/i],
    whyItMatters: 'A suspected matter may be reported, but weak preservation and response discipline can undermine containment, investigation and learning.',
    whyItMattersWhenOperating: 'Reporting, preservation and response are reported as operating; the management question is whether they would hold under a live incident and produce defensible evidence.',
    semanticFamilies: ['EVIDENCE_INTEGRITY', 'CONTINUOUS_IMPROVEMENT']
  }
];

/**
 * Roadmap staging.
 *
 * targetPeriod alone put a single governance action in the 30-day stage while the
 * report itself identified several immediate stabilisation needs. Stabilisation
 * is about establishing control over the problem -- ownership, escalation,
 * evidence handling and treatment ownership -- so those families stage early
 * regardless of their nominal period, provided their dependencies are met.
 */
export const STABILISATION_FAMILIES = ['FRAUD_GOVERNANCE', 'EVIDENCE_INTEGRITY', 'INCIDENT_RESPONSE', 'FRAUD_RISK_IDENTIFICATION'] as const;

export function isStabilisationFamily(semanticFamily: string | undefined | null): boolean {
  return (STABILISATION_FAMILIES as readonly string[]).includes(String(semanticFamily ?? '').toUpperCase());
}

/**
 * Scenario node text, keyed on the scenario's OWN family.
 *
 * Previously the nodes were resolved through a control whose family mapped to
 * the same exposure. Two semantic families -- identity verification and
 * detection monitoring -- share the identity/transaction exposure, so a
 * detection-evasion scenario was given identity-change nodes while its
 * explanatory sentence described transaction structuring. The flow and the
 * narrative described different fraud mechanics, which reads plausibly and is
 * wrong.
 */
export interface ScenarioPresentation {
  entry: string;
  controlBreak: string;
  exposure: string;
  interruption: string;
  /** Vocabulary the narrative must share, so contamination is detectable. */
  mechanicTerms: RegExp;
}

const SCENARIO_PRESENTATION: Record<string, ScenarioPresentation> = {
  SUPPLIER_PAYMENT_DIVERSION: {
    entry: 'Bank-detail or supplier change submitted',
    controlBreak: 'Independent verification absent or bypassed',
    exposure: 'Legitimate payment redirected before challenge',
    interruption: 'Hold the change, call back on a trusted number, require a second approval.',
    mechanicTerms: /supplier|payment|bank|vendor|invoice|divert/i
  },
  PAYMENT_DIVERSION: {
    entry: 'Payment instruction amended',
    controlBreak: 'No independent confirmation before release',
    exposure: 'Funds released to an unverified destination',
    interruption: 'Confirm the instruction independently before release.',
    mechanicTerms: /payment|bank|divert|instruction/i
  },
  IDENTITY_COMPROMISE: {
    entry: 'Sensitive profile or account change requested',
    controlBreak: 'Change accepted without proportionate verification',
    exposure: 'Control bypassed at the point of change',
    interruption: 'Verify the requester through a trusted route before the change takes effect.',
    mechanicTerms: /identity|profile|account|credential|access|change/i
  },
  DETECTION_EVASION: {
    entry: 'Activity structured to stay below review thresholds',
    controlBreak: 'No repeatable monitoring or timely exception review',
    exposure: 'Suspicious activity accumulates unchallenged',
    interruption: 'Define exception populations, named reviewers and overdue escalation.',
    mechanicTerms: /monitor|threshold|exception|split|disguise|timing|detect|unusual|accumulat/i
  },
  INCIDENT_CONCEALMENT: {
    entry: 'A suspected fraud matter arises',
    controlBreak: 'Preservation and custody route is informal',
    exposure: 'Evidence fragmented, delayed or weakened',
    interruption: 'Route the matter to a defined intake and preserve records on first report.',
    mechanicTerms: /record|evidence|custody|preserv|conceal|investigat|delet|alter/i
  },
  EVIDENCE_DEGRADATION: {
    entry: 'Records relating to a suspected matter are handled informally',
    controlBreak: 'No controlled custody or access trail',
    exposure: 'Investigation and recovery are undermined',
    interruption: 'Apply controlled custody from the first report.',
    mechanicTerms: /record|evidence|custody|access|preserv/i
  }
};

export function scenarioPresentation(scenarioFamily: string | undefined | null): ScenarioPresentation | undefined {
  return SCENARIO_PRESENTATION[String(scenarioFamily ?? '').toUpperCase()];
}

/** Scenario presentation resolved from the scenario's own family. */
export function scenarioPresentationForExposure(scenarioFamily: string | undefined | null): ScenarioPresentation | undefined {
  return scenarioPresentation(scenarioFamily);
}

/** Consequence framing per semantic family, where the model supplies none. */
export const SEMANTIC_CONSEQUENCE: Record<string, string> = {
  SUPPLIER_ONBOARDING: 'Direct cash loss on a genuine obligation, recoverable only if challenged before release.',
  SUPPLIER_PAYMENT_CHANGE: 'Direct cash loss on a genuine obligation, recoverable only if challenged before release.',
  IDENTITY_VERIFICATION: 'An unauthorised change persists undetected, widening the period of exposure.',
  DETECTION_MONITORING: 'Unusual activity accumulates below review, widening the period of exposure.',
  EVIDENCE_INTEGRITY: 'Containment, recovery and disciplinary options narrow as evidence degrades.',
  CONTINUOUS_IMPROVEMENT: 'The same exposure recurs because findings do not reach the control set.',
  FRAUD_RISK_IDENTIFICATION: 'New exposure enters the business unassessed.',
  PAYROLL_INTEGRITY: 'Unauthorised payroll value is released before a sensitive change or unusual record is challenged.',
  CASH_CUSTODY: 'Physical cash loss or diversion remains unrecovered when custody differences are not resolved promptly.',
  STOCK_ASSET_CUSTODY: 'Stock or physical-asset value is lost or diverted when movement, count and write-off differences are not challenged.'
};

/**
 * Target-state composition.
 *
 * A family template alone produces advice any low-maturity organisation could
 * receive. What makes it this organisation's answer is which process points are
 * pulled in and which existing strength is leveraged -- both selected from the
 * assessed weakness pattern rather than written in advance.
 *
 * So the vocabulary here is authored, but the selection is entirely data-driven:
 * a monitoring recommendation names supplier-master changes only where the
 * supplier family is actually weak, and cites operational controls as leverage
 * only where they are actually materially stronger.
 */
export interface TargetStateTemplate {
  /** Opening clause naming what extends or applies. */
  lead: string;
  /** Word joining the lead to the process points, if any. */
  connector: string;
  /**
   * Whether an existing strength can be named as the thing being extended from.
   * Only meaningful where the lead expresses reach; "verification applies at
   * beyond X" is not a sentence.
   */
  allowsLeverage: boolean;
  /** The operating discipline this family requires. */
  mechanism: string;
  /** Concrete points this family governs, drawn on when the family is weak. */
  processPoints: string[];
  /** The lead is already a complete clause and takes no process list. */
  selfContained?: boolean;
}

const TARGET_STATE_TEMPLATES: Record<string, TargetStateTemplate> = {
  FRAUD_GOVERNANCE: {
    lead: 'Every material fraud risk and key control has a named owner, decision authority and escalation route',
    connector: '',
    allowsLeverage: false,
    selfContained: true,
    mechanism: 'a defined reporting rhythm and a recorded decision trail',
    processPoints: []
  },
  FRAUD_RISK_IDENTIFICATION: {
    lead: 'Fraud risks are mapped and refreshed across',
    connector: '',
    allowsLeverage: false,
    mechanism: 'named treatment owners and review on material change',
    processPoints: ['core operating processes', 'new or changed process pathways']
  },
  SUPPLIER_ONBOARDING: {
    lead: 'Independent challenge applies before activation or payment across',
    connector: '',
    allowsLeverage: false,
    mechanism: 'a trusted-channel callback, second approval and a retained verification record',
    processPoints: ['supplier-master changes', 'bank-detail amendments', 'new supplier activation']
  },
  IDENTITY_VERIFICATION: {
    lead: 'Risk-based verification applies at',
    connector: '',
    allowsLeverage: false,
    mechanism: 'proportionate checks completed before the change takes effect',
    processPoints: ['sensitive identity and account changes', 'privileged access and profile amendments']
  },
  DETECTION_MONITORING: {
    lead: 'Monitoring extends',
    connector: 'into',
    allowsLeverage: true,
    mechanism: 'defined exception populations, named reviewers and overdue escalation',
    processPoints: ['supplier-master changes', 'bank-detail amendments', 'sensitive identity and account changes']
  },
  EVIDENCE_INTEGRITY: {
    lead: 'A defined intake, preservation and custody route applies from first report across',
    connector: '',
    allowsLeverage: false,
    mechanism: 'controlled access and a retained custody trail',
    processPoints: ['suspected fraud matters', 'records supporting an investigation']
  },
  CONTINUOUS_IMPROVEMENT: {
    lead: 'Findings from incidents and reviews drive a scheduled refresh of',
    connector: '',
    allowsLeverage: false,
    mechanism: 'assigned actions and a re-tested control position',
    processPoints: ['fraud risks, their treatments and the controls they rely on']
  },
  PAYROLL_INTEGRITY: {
    lead: 'Payroll integrity applies across',
    connector: 'through',
    allowsLeverage: false,
    mechanism: 'pre-payment reconciliation, independent change review and exception closure',
    processPoints: ['payroll master-file changes', 'joiner, mover and leaver reconciliation', 'unusual payroll records']
  },
  CASH_CUSTODY: {
    lead: 'Cash custody is controlled across',
    connector: 'through',
    allowsLeverage: false,
    mechanism: 'defined custodians, attributable counts, banking reconciliation and shortage escalation',
    processPoints: ['cash points and shifts', 'sealed transfers and banking', 'shortage and overage investigation']
  },
  STOCK_ASSET_CUSTODY: {
    lead: 'Stock and physical-asset custody is controlled across',
    connector: 'through',
    allowsLeverage: false,
    mechanism: 'authorised movement, periodic counts, reconciliation and independent write-off review',
    processPoints: ['all operating locations', 'stock and asset movements', 'counts, disposals and shrinkage exceptions']
  }
};

/**
 * How specific a target state should be.
 *
 * Specificity is proportional to the priority. A process control names the
 * points it governs. Monitoring genuinely extends across processes, so naming
 * them is the advice. A governance or learning priority is broader than any
 * process list, and enumerating every weak process family there reads as
 * machine assembly rather than judgement.
 */
export type SpecificityScope = 'PROCESS_SPECIFIC' | 'CROSS_PROCESS' | 'ORGANISATION_WIDE';

const SPECIFICITY_SCOPE: Record<string, SpecificityScope> = {
  SUPPLIER_ONBOARDING: 'PROCESS_SPECIFIC',
  IDENTITY_VERIFICATION: 'PROCESS_SPECIFIC',
  EVIDENCE_INTEGRITY: 'PROCESS_SPECIFIC',
  DETECTION_MONITORING: 'CROSS_PROCESS',
  FRAUD_GOVERNANCE: 'ORGANISATION_WIDE',
  FRAUD_RISK_IDENTIFICATION: 'ORGANISATION_WIDE',
  CONTINUOUS_IMPROVEMENT: 'ORGANISATION_WIDE',
  PAYROLL_INTEGRITY: 'PROCESS_SPECIFIC',
  CASH_CUSTODY: 'PROCESS_SPECIFIC',
  STOCK_ASSET_CUSTODY: 'PROCESS_SPECIFIC'
};

export function specificityScope(semanticFamily: string | undefined | null): SpecificityScope {
  return SPECIFICITY_SCOPE[String(semanticFamily ?? '').toUpperCase()] ?? 'PROCESS_SPECIFIC';
}

export function targetStateTemplate(semanticFamily: string | undefined | null): TargetStateTemplate | undefined {
  return TARGET_STATE_TEMPLATES[String(semanticFamily ?? '').toUpperCase()];
}

/**
 * Capabilities that cannot be extended from operationally. Reporting culture may
 * score highest, but "extend monitoring beyond reporting culture" is not advice;
 * the leverage must be a control capability of the same kind.
 */
export const NON_LEVERAGEABLE_DOMAINS = /culture|awareness|whistleblow|reporting/i;

export interface TargetStateIngredients {
  priorityFamily: string;
  exposureFamily?: ExposureFamily;
  /** Assessed capabilities driving this priority, weakest first. */
  weakSignals: Array<{ title: string; score: number }>;
  /** An existing strength the organisation can build on, where one is material. */
  leverage?: { title: string; score: number };
  processPoints: string[];
  accountableRole: string;
  completionEvidence: string;
}

/**
 * Composes the operating state for one management priority.
 *
 * Process points come from the families that are actually weak in this
 * organisation, so the sentence names where this organisation must act. The
 * leverage clause appears only where a genuinely stronger capability exists to
 * extend from.
 */
export function composeTargetState(ingredients: TargetStateIngredients): string {
  const template = targetStateTemplate(ingredients.priorityFamily);
  if (!template) return '';
  if (template.selfContained) {
    return `${template.lead}, with ${template.mechanism}.`;
  }
  const points = ingredients.processPoints.length ? ingredients.processPoints : template.processPoints;
  // A point may itself contain "and" ("sensitive identity and account changes").
  // Joining those with a final "and" produces a doubled conjunction, so a list
  // containing one switches to semicolons.
  const hasInternalConjunction = points.some((point) => / and /.test(point));
  const listed = points.length > 1
    ? hasInternalConjunction
      ? points.join('; ')
      : `${points.slice(0, -1).join(', ')} and ${points[points.length - 1]}`
    : points[0] ?? '';
  const leverageClause = template.allowsLeverage && ingredients.leverage
    ? ` beyond ${ingredients.leverage.title.toLowerCase()}`
    : '';
  const connector = template.connector ? ` ${template.connector}` : '';
  return `${template.lead}${leverageClause}${connector} ${listed}, with ${template.mechanism}.`
    .replace(/\s{2,}/g, ' ')
    .replace(/ ,/g, ',');
}

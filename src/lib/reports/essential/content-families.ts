/**
 * Content family taxonomy for the Essential report.
 *
 * Every analytical object -- finding, control, scenario, roadmap action -- carries
 * a semantic family in the Fact Pack. This module maps those families onto the
 * three exposure families the report presents, so an exhibit row draws only on
 * content that genuinely belongs to it.
 *
 * The defect this exists to prevent: exposures and scenarios were paired by array
 * index. Rivonia's scenarios are ordered supplier / incident / detection while its
 * exposures are ordered supplier / identity-transaction / containment, so the
 * identity exposure was explained with evidence-custody content and the
 * containment exposure with monitoring content. Both read plausibly and both were
 * wrong.
 */

export const CONTENT_FAMILY_VERSION = 'mk-essential-content-families-v1';

export type ExposureFamily =
  | 'SUPPLIER_PAYMENT_VALUE_DIVERSION'
  | 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE'
  | 'INCIDENT_CONTAINMENT_LEARNING';

/** Cross-cutting families belong to no single exposure and may support any. */
export const CROSS_CUTTING_FAMILIES = ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'FRAUD_CULTURE'] as const;

/**
 * Semantic family -> owning exposure family.
 * A family absent here is cross-cutting and never claims primary ownership.
 */
const SEMANTIC_TO_EXPOSURE: Record<string, ExposureFamily> = {
  SUPPLIER_ONBOARDING: 'SUPPLIER_PAYMENT_VALUE_DIVERSION',
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT_VALUE_DIVERSION',
  PAYMENT_INTEGRITY: 'SUPPLIER_PAYMENT_VALUE_DIVERSION',
  THIRD_PARTY: 'SUPPLIER_PAYMENT_VALUE_DIVERSION',
  IDENTITY_VERIFICATION: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  DETECTION_MONITORING: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  TRANSACTION_MONITORING: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  SENSITIVE_CHANGE: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  ACCESS_CONTROL: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  EVIDENCE_INTEGRITY: 'INCIDENT_CONTAINMENT_LEARNING',
  INCIDENT_RESPONSE: 'INCIDENT_CONTAINMENT_LEARNING',
  INVESTIGATION: 'INCIDENT_CONTAINMENT_LEARNING',
  CONTINUOUS_IMPROVEMENT: 'INCIDENT_CONTAINMENT_LEARNING'
};

/** Scenario family -> owning exposure family. Never positional. */
const SCENARIO_TO_EXPOSURE: Record<string, ExposureFamily> = {
  SUPPLIER_PAYMENT_DIVERSION: 'SUPPLIER_PAYMENT_VALUE_DIVERSION',
  PAYMENT_DIVERSION: 'SUPPLIER_PAYMENT_VALUE_DIVERSION',
  DETECTION_EVASION: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  IDENTITY_COMPROMISE: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  INCIDENT_CONCEALMENT: 'INCIDENT_CONTAINMENT_LEARNING',
  EVIDENCE_DEGRADATION: 'INCIDENT_CONTAINMENT_LEARNING'
};

/** Keywords used to place an exposure cluster label onto a family. */
const EXPOSURE_LABEL_HINTS: Array<{ family: ExposureFamily; hints: RegExp }> = [
  { family: 'SUPPLIER_PAYMENT_VALUE_DIVERSION', hints: /supplier|payment|vendor|value diversion|third[- ]party|bank/i },
  { family: 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE', hints: /identity|transaction|sensitive[- ]change|challenge|monitoring|detection|unusual/i },
  { family: 'INCIDENT_CONTAINMENT_LEARNING', hints: /containment|learning|incident|evidence|after suspected|investigat/i }
];

export function exposureFamilyForLabel(label: string): ExposureFamily | undefined {
  return EXPOSURE_LABEL_HINTS.find((entry) => entry.hints.test(label))?.family;
}

export function exposureFamilyForSemantic(semanticFamily: string | undefined | null): ExposureFamily | undefined {
  if (!semanticFamily) return undefined;
  return SEMANTIC_TO_EXPOSURE[String(semanticFamily).toUpperCase()];
}

export function exposureFamilyForScenario(scenarioFamily: string | undefined | null): ExposureFamily | undefined {
  if (!scenarioFamily) return undefined;
  return SCENARIO_TO_EXPOSURE[String(scenarioFamily).toUpperCase()];
}

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
  CONTINUOUS_IMPROVEMENT: {
    shortLabel: 'Learning and control refresh after events',
    targetState: 'Findings from incidents and reviews are captured and drive a scheduled refresh of fraud risks and controls.',
    interruptionPoint: 'A scheduled review that converts findings into control change.',
    scenarioEntry: 'A matter closes without structured review',
    scenarioControlBreak: 'No route from lesson to control change',
    scenarioExposure: 'The same exposure recurs'
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
  semanticFamilies: string[];
}

export const DIAGNOSTIC_PATTERNS: DiagnosticPatternDefinition[] = [
  {
    patternId: 'GOVERNANCE_AND_RISK_DISCIPLINE',
    displayTitle: 'Fraud governance and risk discipline',
    domainMatchers: [/leadership|governance/i, /risk identification/i, /continuous improvement|monitoring/i],
    whyItMatters: 'Fraud risk is not yet managed through a repeatable cycle of ownership, assessment and review.',
    semanticFamilies: ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION']
  },
  {
    patternId: 'SUPPLIER_AND_PAYMENT_INTEGRITY',
    displayTitle: 'Supplier and payment integrity',
    domainMatchers: [/third[- ]party|supply chain/i, /operational fraud controls/i],
    whyItMatters: 'Operational controls do not extend consistently to supplier onboarding and payment-change challenge, leaving direct value-diversion exposure.',
    semanticFamilies: ['SUPPLIER_ONBOARDING']
  },
  {
    patternId: 'MONITORING_AND_DETECTION',
    displayTitle: 'Monitoring and detection coverage',
    domainMatchers: [/detection/i, /continuous improvement|monitoring/i, /digital|identity/i],
    whyItMatters: 'Unusual activity may not be challenged early enough, allowing exposure to remain below management attention.',
    semanticFamilies: ['DETECTION_MONITORING', 'IDENTITY_VERIFICATION']
  },
  {
    patternId: 'INCIDENT_RESPONSE_AND_EVIDENCE',
    displayTitle: 'Incident response and evidence integrity',
    domainMatchers: [/incident response/i, /culture|awareness/i, /whistleblow|reporting culture/i],
    whyItMatters: 'A suspected matter may be reported, but weak preservation and response discipline can undermine containment, investigation and learning.',
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

/**
 * Consequence framing per exposure family, used where the analytical model does
 * not supply a short consequence of its own.
 */
export const EXPOSURE_CONSEQUENCE: Record<ExposureFamily, string> = {
  SUPPLIER_PAYMENT_VALUE_DIVERSION: 'Direct cash loss on a genuine obligation, recoverable only if challenged before release.',
  IDENTITY_TRANSACTION_SENSITIVE_CHANGE: 'Unauthorised change or activity persists undetected, widening the period of exposure.',
  INCIDENT_CONTAINMENT_LEARNING: 'Containment, recovery and disciplinary options narrow as evidence degrades.'
};

/**
 * Resolve scenario presentation from an exposure family. Used by validation,
 * where only the resolved family is available on the model.
 */
export function scenarioPresentationForExposure(family: ExposureFamily | undefined): ScenarioPresentation | undefined {
  if (!family) return undefined;
  const scenarioFamily = Object.keys(SCENARIO_TO_EXPOSURE).find((key) => SCENARIO_TO_EXPOSURE[key] === family);
  return scenarioFamily ? SCENARIO_PRESENTATION[scenarioFamily] : undefined;
}

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
}

const TARGET_STATE_TEMPLATES: Record<string, TargetStateTemplate> = {
  FRAUD_GOVERNANCE: {
    lead: 'Named ownership, decision authority and escalation cover',
    connector: 'across',
    allowsLeverage: false,
    mechanism: 'a defined reporting rhythm and a recorded decision route',
    processPoints: ['material fraud risks', 'key controls and their owners']
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
    lead: 'Findings from incidents and reviews drive scheduled refresh across',
    connector: '',
    allowsLeverage: false,
    mechanism: 'assigned actions and a re-tested control position',
    processPoints: ['fraud risks and their treatments', 'controls affected by a closed matter']
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
  CONTINUOUS_IMPROVEMENT: 'ORGANISATION_WIDE'
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

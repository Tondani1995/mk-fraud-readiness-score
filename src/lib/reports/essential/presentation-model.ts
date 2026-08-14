/**
 * Essential report presentation model.
 *
 * Sits between approved analytical content and the renderer. The renderer should
 * not have to infer professional report structure from Markdown, and the model
 * should not have to know how a page looks.
 *
 * Everything here is deterministic. Values, ordering, rankings and labels come
 * from the Fact Pack and Report Thesis. Bounded AI commentary is attached to
 * exhibits as interpretation only -- it never decides a number, a rank or which
 * exhibit appears.
 *
 * Adaptive by construction: contrasts, exposures, scenarios, priorities and
 * metrics are all 0..N. A page with nothing material to show is omitted rather
 * than padded, and a high-readiness organisation renders sustainment framing
 * instead of manufactured weakness.
 */

import {
  DIAGNOSTIC_PATTERNS,
  exposureFamilyForLabel,
  exposureFamilyForScenario,
  exposureFamilyForSemantic,
  familyPresentation,
  isStabilisationFamily,
  scenarioPresentation,
  composeTargetState,
  targetStateTemplate,
  NON_LEVERAGEABLE_DOMAINS,
  specificityScope,
  EXPOSURE_CONSEQUENCE,
  type ExposureFamily
} from './content-families';

export const ESSENTIAL_PRESENTATION_MODEL_VERSION = 'mk-essential-presentation-v2';

export type NarrativeMode = 'REMEDIATION' | 'SUSTAINMENT';

export interface ExhibitBase {
  exhibitId: string;
  /** Internal provenance. Never rendered to the customer. */
  sourceRefs: string[];
  title: string;
  /** Bounded AI interpretation, if the slot was filled. */
  interpretation?: string;
}

export interface DomainBand {
  label: string;
  min: number;
  max: number;
}

export const MATURITY_BANDS: DomainBand[] = [
  { label: 'Initial', min: 0, max: 20 },
  { label: 'Reactive', min: 20, max: 45 },
  { label: 'Developing', min: 45, max: 65 },
  { label: 'Defined', min: 65, max: 85 },
  { label: 'Managed', min: 85, max: 100 }
];

export function bandFor(score: number): string {
  return MATURITY_BANDS.find((band) => score >= band.min && score < band.max)?.label ?? 'Managed';
}

export interface ReadinessScoreExhibit extends ExhibitBase {
  score: number;
  outOf: 100;
  maturity: string;
  domainsAssessed: number;
  /** compactTitle is for narrow tiles; title remains the full domain name. */
  strongest: { title: string; compactTitle: string; score: number };
  weakest: { title: string; compactTitle: string; score: number };
}

export interface DomainProfileExhibit extends ExhibitBase {
  /** Ordered weakest first: the eye should land on the problem, not the alphabet. */
  rows: Array<{ title: string; score: number; band: string; weightPct: number; emphasis: 'weak' | 'strong' | 'neutral' }>;
  overallScore: number;
}

export interface MaterialContrastExhibit extends ExhibitBase {
  contrasts: Array<{
    contrastId: string;
    strongerTitle: string;
    strongerScore: number;
    weakerTitle: string;
    weakerScore: number;
    gap: number;
    interpretation: string;
  }>;
}

export interface DiagnosisMatrixExhibit extends ExhibitBase {
  rows: Array<{ pattern: string; signals: Array<{ title: string; score: number }>; whyItMatters: string }>;
}

export interface PriorityExposureExhibit extends ExhibitBase {
  rows: Array<{
    rank: number;
    /** The family this row owns. Content from another family may not appear here. */
    family?: ExposureFamily;
    exposure: string;
    whyItMatters: string;
    /** The assessed signals that place this exposure where it is. */
    assessmentBasis: Array<{ title: string; score: number }>;
    potentialConsequence: string;
    drivers: Array<{ title: string; score: number }>;
    interruptionPoint: string;
    /**
     * Ordinal position, not a risk band. The driving signals can sit fractions
     * of a point apart, so band language would overclaim a distinction the
     * assessment does not support.
     */
    priority: string;
    /** Why this priority, expressed from the signals rather than asserted. */
    priorityBasis: string;
  }>;
}

export interface ScenarioPathwayExhibit extends ExhibitBase {
  scenarios: Array<{
    scenarioId: string;
    /** Owning exposure family, resolved by scenario family and never by position. */
    family?: ExposureFamily;
    title: string;
    entryPoint: string;
    entryPointShort: string;
    controlBreakShort: string;
    exposureShort: string;
    controlBreak: string;
    howItUnfolds: string;
    warningIndicators: string[];
    immediateInterruption: string;
  }>;
  /** Stated once for the whole exhibit, never per scenario. */
  assuranceNote: string;
}

export interface ManagementPriorityExhibit extends ExhibitBase {
  /** betterLooksLike is a target operating state; the proving artefact stays in the workbook. */
  rows: Array<{
    rank: number;
    outcome: string;
    whyNow: string;
    accountableRole: string;
    /** Organisation-specific operating state, composed from this assessment. */
    betterLooksLike: string;
    /** The ingredients the state was composed from, retained for the register. */
    targetStateBasis?: { weakSignals: Array<{ title: string; score: number }>; leverage?: { title: string; score: number }; processPoints: string[] };
    evidenceArtefact?: string;
  }>;
}

export interface RoadmapExhibit extends ExhibitBase {
  stages: Array<{
    stage: string;
    window: string;
    primaryOutcome: string;
    actions: Array<{ action: string; owner: string; deliverable: string; completionTest: string; dependsOn: string[] }>;
  }>;
}

export interface ManagementMetricExhibit extends ExhibitBase {
  rows: Array<{ measure: string; current: string; expectation: string }>;
  /** Baselines are the assessed condition, not a uniform placeholder. */
  baselineSource: 'assessed-condition';
}

export interface EssentialPage {
  page: number;
  /** The single management question this page answers. */
  question: string;
  heading: string;
  kind: 'cover' | 'overview' | 'diagnosis' | 'exposure' | 'scenarios' | 'priorities' | 'roadmap' | 'dashboard';
  exhibitIds: string[];
  commentary?: string;
}

export interface EssentialReportPresentationModel {
  version: typeof ESSENTIAL_PRESENTATION_MODEL_VERSION;
  reportIdentity: {
    organisationName: string;
    assessmentReference: string;
    assessmentDate: string;
    tier: 'Essential';
    productLabel: string;
    confidentiality: string;
  };
  narrativeMode: NarrativeMode;
  cover: { centralJudgement: string; score: number; maturity: string };
  readinessScore: ReadinessScoreExhibit;
  domainProfile: DomainProfileExhibit;
  materialContrasts?: MaterialContrastExhibit;
  diagnosis: DiagnosisMatrixExhibit;
  exposures?: PriorityExposureExhibit;
  scenarios?: ScenarioPathwayExhibit;
  priorities: ManagementPriorityExhibit;
  roadmap: RoadmapExhibit;
  dashboard: ManagementMetricExhibit;
  conclusion: string;
  reportBasis: string;
  pages: EssentialPage[];
}

/** Trim engine phrasing that should never reach a customer exhibit label. */
function customerText(value: string | undefined | null): string {
  if (!value) return '';
  return String(value)
    .replace(/\brecorded as\b/gi, 'assessed as')
    .replace(/\bis recorded\b/gi, 'is assessed')
    .replace(/\brecorded\b/gi, 'assessed')
    .replace(/\bself-assessed and not independently verified\b/gi, 'assessed from management responses')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * A domain name short enough for a narrow tile without losing what it names.
 * Trims the connective and the generic tail rather than truncating, so the
 * label still reads as the domain rather than as a clipped string.
 */
export function compactDomainLabel(name: string): string {
  const compact = String(name ?? '')
    .replace(/\s+and\s+/gi, ' & ')
    .replace(/\s+Fraud Risk$/i, '')
    .replace(/\s+Capability$/i, '')
    .trim();
  return compact || String(name ?? '');
}

function sentence(value: string): string {
  const text = customerText(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function firstSentence(value: string): string {
  const text = customerText(value);
  const match = /^(.*?[.!?])(\s|$)/.exec(text);
  return (match?.[1] ?? text).trim();
}

/**
 * Hard budget for text inside a diagram node. These fields carry full control
 * specifications in the analytical model; a flow node is a label, and pasting a
 * specification into one overflows the page. Clause boundaries are cut first,
 * then a word boundary, so the label still reads as a phrase.
 */
function nodeLabel(value: string, maxChars = 120): string {
  const text = firstSentence(String(value ?? '').split(/;\s+/)[0] ?? '');
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > 40 ? cut.slice(0, boundary) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

export interface PresentationInputs {
  factPack: any;
  thesis: any;
  /** Approved bounded commentary keyed by the exhibit it interprets. */
  commentary?: Record<string, string>;
}



export function buildEssentialPresentationModel(input: PresentationInputs): EssentialReportPresentationModel {
  const { factPack, thesis } = input;
  const commentary = input.commentary ?? {};
  const mode: NarrativeMode = factPack.narrativeMode === 'SUSTAINMENT' ? 'SUSTAINMENT' : 'REMEDIATION';
  const sustainment = mode === 'SUSTAINMENT';

  const domains: any[] = Array.isArray(factPack.domains) ? factPack.domains : [];
  const score: number = thesis.overallPosition?.score ?? factPack.assessment?.score ?? 0;
  const maturity: string = thesis.overallPosition?.maturity ?? factPack.assessment?.maturity ?? '';

  const sortedDomains = [...domains].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const strongestDomain = sortedDomains[sortedDomains.length - 1];
  const weakestDomain = sortedDomains[0];

  // ---- Readiness score ----
  const readinessScore: ReadinessScoreExhibit = {
    exhibitId: 'EX-READINESS-SCORE',
    sourceRefs: ['SCORE-001', 'MATURITY-001'],
    title: 'Overall fraud readiness',
    score,
    outOf: 100,
    maturity,
    domainsAssessed: domains.length,
    strongest: { title: customerText(strongestDomain?.name), compactTitle: compactDomainLabel(customerText(strongestDomain?.name)), score: strongestDomain?.score ?? 0 },
    weakest: { title: customerText(weakestDomain?.name), compactTitle: compactDomainLabel(customerText(weakestDomain?.name)), score: weakestDomain?.score ?? 0 }
  };

  // ---- Domain profile, weakest first ----
  const weakThreshold = sustainment ? -1 : 30;
  const strongThreshold = sustainment ? 60 : 50;
  const domainProfile: DomainProfileExhibit = {
    exhibitId: 'EX-DOMAIN-PROFILE',
    sourceRefs: domains.map((d) => d.factRef).filter(Boolean),
    title: 'Domain readiness profile',
    overallScore: score,
    rows: sortedDomains.map((d) => ({
      title: customerText(d.name),
      score: d.score ?? 0,
      band: bandFor(d.score ?? 0),
      weightPct: d.weightPct ?? 0,
      emphasis: (d.score ?? 0) <= weakThreshold ? 'weak' : (d.score ?? 0) >= strongThreshold ? 'strong' : 'neutral'
    }))
  };

  // ---- Material contrasts: only genuinely material gaps, capped at two ----
  const MATERIAL_GAP = 20;
  const rawContrasts: any[] = Array.isArray(thesis.materialContrasts) ? thesis.materialContrasts : [];
  const contrastCandidates = rawContrasts
    .map((c) => ({
      contrastId: c.contrastId,
      strongerTitle: customerText(c.stronger?.title),
      strongerScore: c.stronger?.score ?? 0,
      weakerTitle: customerText(c.weaker?.title),
      weakerScore: c.weaker?.score ?? 0,
      gap: Number(((c.stronger?.score ?? 0) - (c.weaker?.score ?? 0)).toFixed(2)),
      interpretation: sentence(commentary[`CONTRAST-${c.contrastId}`] ?? c.interpretation ?? '')
    }))
    .filter((c) => c.gap >= MATERIAL_GAP && c.strongerTitle && c.weakerTitle)
    .sort((a, b) => b.gap - a.gap);

  // Two contrasts should make two different points. Reusing the same stronger
  // capability against a second weakness restates the first observation, so
  // each selected contrast must introduce both a new stronger and a new weaker
  // capability.
  const selectedContrasts: typeof contrastCandidates = [];
  const usedCapabilities = new Set<string>();
  for (const candidate of contrastCandidates) {
    if (selectedContrasts.length >= 2) break;
    if (usedCapabilities.has(candidate.strongerTitle) || usedCapabilities.has(candidate.weakerTitle)) continue;
    usedCapabilities.add(candidate.strongerTitle);
    usedCapabilities.add(candidate.weakerTitle);
    selectedContrasts.push(candidate);
  }
  const contrastRows = selectedContrasts;

  const materialContrasts: MaterialContrastExhibit | undefined = contrastRows.length
    ? { exhibitId: 'EX-MATERIAL-CONTRASTS', sourceRefs: rawContrasts.flatMap((c) => [...(c.stronger?.claimRefs ?? []), ...(c.weaker?.claimRefs ?? [])]), title: 'Material capability relationships', contrasts: contrastRows }
    : undefined;

  // ---- Diagnosis: pattern families, each evidenced by several related signals ----
  const findings: any[] = Array.isArray(factPack.findings) ? factPack.findings : [];
  const diagnosisRows = DIAGNOSTIC_PATTERNS.map((pattern) => {
    const signals = sortedDomains
      .filter((d) => pattern.domainMatchers.some((matcher) => matcher.test(String(d.name ?? ''))))
      .map((d) => ({ title: customerText(d.name), score: d.score ?? 0 }));
    const supportingFindings = findings
      .filter((f) => pattern.domainMatchers.some((matcher) => matcher.test(String(f.domain ?? ''))))
      .map((f) => f.factRef).filter(Boolean);
    return {
      patternId: pattern.patternId,
      pattern: pattern.displayTitle,
      signals,
      supportingFindings,
      whyItMatters: sentence(commentary[`DIAGNOSIS-${pattern.patternId}`] ?? pattern.whyItMatters)
    };
  })
    // A pattern needs more than one present signal to be a pattern. Padding a row
    // with an unrelated score to reach a count is what made the first version thin.
    .filter((row) => row.signals.length >= 2 && row.whyItMatters)
    .map(({ patternId, supportingFindings, ...row }) => row);

  const diagnosis: DiagnosisMatrixExhibit = {
    exhibitId: 'EX-DIAGNOSIS-MATRIX',
    sourceRefs: domains.map((d) => d.factRef).filter(Boolean),
    title: sustainment ? 'What is sustaining the position' : 'What is driving the position',
    rows: diagnosisRows,
    interpretation: commentary['DIAGNOSIS-SYNTHESIS']
  };

  // ---- Priority exposures, owned by family ----
  const clusters: string[] = Array.isArray(thesis.priorityExposureClusters) ? thesis.priorityExposureClusters : [];
  const scenarios: any[] = Array.isArray(factPack.scenarios) ? factPack.scenarios : [];
  const controls: any[] = Array.isArray(factPack.controls) ? factPack.controls : [];

  // Priority is derived from the assessed signals that drive each family, not
  // asserted by row order. The weakest supporting domain sets the ranking, so a
  // reader can see why one exposure outranks another.
  const familySignals = (family: ExposureFamily | undefined) => sortedDomains
    .filter((d) => family && exposureFamilyForLabel(String(d.name ?? '')) === family)
    .map((d) => ({ title: customerText(d.name), score: d.score ?? 0 }));

  const exposureDraft = clusters.map((cluster) => {
    const family = exposureFamilyForLabel(cluster);
    const linkedScenario = scenarios.find((s) => exposureFamilyForScenario(s.scenarioFamily) === family);
    const linkedControls = controls.filter((c) => exposureFamilyForSemantic(c.primarySemanticFamily) === family);
    const presentation = familyPresentation(linkedControls[0]?.primarySemanticFamily);
    const signals = familySignals(family);
    const basis = signals.length ? signals : sortedDomains.slice(0, 2).map((d) => ({ title: customerText(d.name), score: d.score ?? 0 }));
    const weakestSignal = Math.min(...basis.map((b) => b.score));
    return {
      family,
      exposure: customerText(cluster),
      whyItMatters: sentence(commentary[`EXPOSURE-${family}`] ?? firstSentence(linkedScenario?.opportunity ?? '')),
      assessmentBasis: basis,
      potentialConsequence: firstSentence(linkedScenario?.consequence ?? '') || (family ? EXPOSURE_CONSEQUENCE[family] : ''),
      drivers: basis,
      interruptionPoint: presentation?.interruptionPoint ?? '',
      weakestSignal
    };
  }).filter((row) => row.exposure && row.whyItMatters && row.interruptionPoint);

  const rankedExposures = [...exposureDraft].sort((a, b) => a.weakestSignal - b.weakestSignal);
  const exposureRows = rankedExposures.map((row, index) => {
    const lowest = row.assessmentBasis.reduce((worst, entry) => (entry.score < worst.score ? entry : worst), row.assessmentBasis[0]!);
    return {
      rank: index + 1,
      family: row.family,
      exposure: row.exposure,
      whyItMatters: row.whyItMatters,
      assessmentBasis: row.assessmentBasis,
      potentialConsequence: row.potentialConsequence,
      drivers: row.drivers,
      interruptionPoint: row.interruptionPoint,
      priority: `Priority ${index + 1}`,
      priorityBasis: `${lowest.title} scores ${lowest.score}, the weakest capability supporting this exposure.`
    };
  });

  const exposures: PriorityExposureExhibit | undefined = exposureRows.length
    ? { exhibitId: 'EX-PRIORITY-EXPOSURE', sourceRefs: scenarios.map((s) => s.factRef).filter(Boolean), title: sustainment ? 'Residual exposure and watchpoints' : 'Priority fraud exposure', rows: exposureRows }
    : undefined;

  // ---- Scenario pathways: short authored nodes, never clipped specifications ----
  const scenarioExhibit: ScenarioPathwayExhibit | undefined = scenarios.length
    ? {
        exhibitId: 'EX-SCENARIO-PATHWAYS',
        sourceRefs: scenarios.map((s) => s.factRef).filter(Boolean),
        title: 'How exposure could materialise',
        assuranceNote: 'These are plausible fraud pathways derived from the assessment. They are not allegations that these events have occurred.',
        scenarios: scenarios.map((s, index) => {
          const family = exposureFamilyForScenario(s.scenarioFamily);
          // Keyed on the scenario's own family. Resolving through a control that
          // merely shares the exposure gave a detection-evasion scenario
          // identity-change nodes while its narrative described structuring.
          const presentation = scenarioPresentation(s.scenarioFamily);
          return {
            scenarioId: s.factRef ?? `SCENARIO-${index + 1}`,
            family,
            title: customerText(s.title),
            entryPointShort: presentation?.entry ?? '',
            controlBreakShort: presentation?.controlBreak ?? '',
            exposureShort: presentation?.exposure ?? '',
            entryPoint: presentation?.entry ?? '',
            controlBreak: presentation?.controlBreak ?? '',
            howItUnfolds: sentence(commentary[`SCENARIO-${s.factRef}`] ?? s.mechanism ?? ''),
            warningIndicators: (Array.isArray(s.warningIndicators) ? s.warningIndicators : [])
              .map((w: string) => customerText(w)).filter(Boolean).slice(0, 3),
            immediateInterruption: presentation?.interruption ?? ''
          };
        }).filter((s) => s.entryPointShort && s.controlBreakShort && s.exposureShort)
      }
    : undefined;

  // ---- Management priorities, from the roadmap's distinct outcomes ----
  const roadmapItems: any[] = Array.isArray(factPack.roadmap) ? factPack.roadmap : [];
  /** The assessed maturity condition for a control family, e.g. "Initial / ad hoc". */
  function assessedCondition(semanticFamily: string): string {
    const control = controls.find((c) => String(c.primarySemanticFamily ?? '') === semanticFamily);
    const state = String(control?.currentState ?? '').split(/\s+[—-]\s+/)[0]?.trim();
    return state ? customerText(state) : 'Not assessed';
  }

  /**
   * Families that are materially weak in this organisation. Their process points
   * are what a recommendation should name, because that is where this
   * organisation is exposed.
   */
  const WEAK_BAND = 35;
  const weakFamilies = controls
    .map((c) => String(c.primarySemanticFamily ?? ''))
    .filter((family) => {
      const exposure = exposureFamilyForSemantic(family);
      const signals = sortedDomains.filter((d) => exposure && exposureFamilyForLabel(String(d.name ?? '')) === exposure);
      return signals.length > 0 && Math.min(...signals.map((d) => d.score ?? 0)) < WEAK_BAND;
    });

  /** The strongest capability that is materially ahead of the weak pattern. */
  const LEVERAGE_GAP = 15;
  function leverageFor(weakSignals: Array<{ title: string; score: number }>): { title: string; score: number } | undefined {
    if (!weakSignals.length) return undefined;
    const weakest = Math.min(...weakSignals.map((s) => s.score));
    return [...sortedDomains].reverse()
      .map((d) => ({ title: customerText(d.name), score: d.score ?? 0 }))
      .find((d) => d.score - weakest >= LEVERAGE_GAP
        && !weakSignals.some((s) => s.title === d.title)
        && !NON_LEVERAGEABLE_DOMAINS.test(d.title));
  }

  const seenOutcome = new Set<string>();
  const priorityRows = roadmapItems
    .filter((item) => {
      const key = customerText(item.managementOutcome);
      if (!key || seenOutcome.has(key)) return false;
      seenOutcome.add(key);
      return true;
    })
    .slice(0, 5)
    .map((item, index) => {
      const presentation = familyPresentation(item.primarySemanticFamily);
      return {
        rank: index + 1,
        outcome: presentation?.shortLabel ?? customerText(item.managementOutcome),
        whyNow: sentence(commentary[`PRIORITY-${item.primarySemanticFamily}`] ?? firstSentence(item.managementOutcome ?? '')),
        accountableRole: customerText(item.accountableExecutive ?? item.processOwner ?? ''),
        // The operating state management is aiming at. The artefact that proves
        // it -- a RACI, a callback record, a coverage report -- is evidence, and
        // belongs in the supporting register rather than the executive report.
        semanticFamily: String(item.primarySemanticFamily ?? ''),
        betterLooksLike: organisationTargetState(String(item.primarySemanticFamily ?? '')),
        targetStateBasis: targetStateBasisFor(String(item.primarySemanticFamily ?? '')),
        evidenceArtefact: customerText(item.proofOfCompletion ?? '')
      };
    })
    .filter((row) => row.outcome && row.betterLooksLike);

  /**
   * Selects the ingredients for one priority: the signals driving it, an existing
   * strength worth extending from, and the process points that are actually weak
   * here. A family template supplies the discipline; this supplies the specifics.
   */
  function targetStateBasisFor(semanticFamily: string) {
    const exposure = exposureFamilyForSemantic(semanticFamily);
    const weakSignals = sortedDomains
      .filter((d) => exposure && exposureFamilyForLabel(String(d.name ?? '')) === exposure)
      .map((d) => ({ title: customerText(d.name), score: d.score ?? 0 }));
    // Only a cross-process priority enumerates the weak process families. A
    // governance or learning priority is broader than any process list and keeps
    // its own framing.
    const scope = specificityScope(semanticFamily);
    const pointFamilies = scope === 'CROSS_PROCESS' ? unique(weakFamilies) : [semanticFamily];
    // Take one point from each weak family first so a cross-cutting priority
    // names the breadth of the problem rather than three points from one area.
    const perFamily = pointFamilies.map((family) => targetStateTemplate(family)?.processPoints ?? []);
    const breadth = perFamily.map((points) => points[0]).filter((point): point is string => Boolean(point));
    const remainder = perFamily.flatMap((points) => points.slice(1));
    const processPoints = unique([...breadth, ...remainder]).slice(0, 3);
    return { weakSignals, leverage: leverageFor(weakSignals), processPoints };
  }

  function organisationTargetState(semanticFamily: string): string {
    const basis = targetStateBasisFor(semanticFamily);
    const composed = composeTargetState({
      priorityFamily: semanticFamily,
      exposureFamily: exposureFamilyForSemantic(semanticFamily),
      weakSignals: basis.weakSignals,
      leverage: basis.leverage,
      processPoints: basis.processPoints,
      accountableRole: '',
      completionEvidence: ''
    });
    return composed || familyPresentation(semanticFamily)?.targetState || '';
  }

  const priorities: ManagementPriorityExhibit = {
    exhibitId: 'EX-MANAGEMENT-PRIORITIES',
    sourceRefs: roadmapItems.map((r) => r.factRef).filter(Boolean),
    title: sustainment ? 'Sustainment priorities' : 'What management should change',
    rows: priorityRows
  };

  // Stage by targetPeriod, which carries the real 30/60/90 split. The `phase`
  // field only distinguishes STABILISE from ESTABLISH, so matching on it put
  // the same actions in both the 60-day and 90-day stages.
  const STAGES = [
    { stage: '30 days — Stabilise', window: '0–30 days', match: /^30\b/ },
    { stage: '60 days — Establish', window: '31–60 days', match: /^60\b/ },
    { stage: '90 days — Operate and review', window: '61–90 days', match: /^90\b/ }
  ];
  const claimedRefs = new Set<string>();
  const roadmap: RoadmapExhibit = {
    exhibitId: 'EX-ROADMAP',
    sourceRefs: roadmapItems.map((r) => r.factRef).filter(Boolean),
    title: 'The first 90 days',
    interpretation: commentary['ROADMAP-LOGIC'],
    stages: STAGES.map(({ stage, window, match }, stageIndex) => {
      // Each action belongs to exactly one stage; a stage never repeats work
      // already sequenced earlier.
      const items = roadmapItems.filter((item) => {
        if (claimedRefs.has(item.factRef)) return false;
        // Stabilisation is about establishing control over the problem, so
        // ownership, escalation, evidence handling and treatment ownership stage
        // in the first window even where their nominal period is later. Nothing
        // is invented; existing actions are reclassified by what they achieve.
        if (stageIndex === 0 && isStabilisationFamily(item.primarySemanticFamily)) return true;
        if (stageIndex > 0 && isStabilisationFamily(item.primarySemanticFamily)) return false;
        return match.test(String(item.targetPeriod ?? '').trim());
      });
      for (const item of items) claimedRefs.add(item.factRef);
      const staged = [...items];
      // Where the assessment shows material incident and evidence weakness but
      // no first-window action covers it, derive an interim route from the
      // existing control rather than leaving the organisation without one until
      // the fuller design lands. Conditional: it appears only where that gap is
      // real, and nothing is invented -- the control already exists.
      if (stageIndex === 0) {
        const gapFamily = 'EVIDENCE_INTEGRITY';
        const alreadyStaged = staged.some((item) => String(item.primarySemanticFamily ?? '').toUpperCase() === gapFamily);
        const exposureIsMaterial = exposureRows.some((row) => row.family === 'INCIDENT_CONTAINMENT_LEARNING');
        const control = controls.find((c) => String(c.primarySemanticFamily ?? '').toUpperCase() === gapFamily);
        if (!alreadyStaged && exposureIsMaterial && control) {
          const presentation = familyPresentation(gapFamily);
          staged.push({
            factRef: control.factRef,
            primarySemanticFamily: gapFamily,
            managementOutcome: presentation?.shortLabel ?? 'Controlled incident and evidence handling',
            priorityWork: 'Stand up an interim intake and preservation route for suspected matters, ahead of the fuller design.',
            accountableExecutive: 'CEO / Managing Director',
            proofOfCompletion: 'A named intake point and a preservation instruction issued to managers.',
            dependencies: [],
            interim: true
          });
        }
      }
      return {
        stage,
        window,
        primaryOutcome: customerText(staged[0]?.managementOutcome ?? ''),
        actions: staged.slice(0, 5).map((item) => ({
          action: familyPresentation(item.primarySemanticFamily)?.shortLabel ?? nodeLabel(item.priorityWork ?? item.managementOutcome ?? '', 150),
          owner: customerText(item.accountableExecutive ?? item.processOwner ?? ''),
          // What is handed over, and the test that closes it. Themes alone do
          // not make an implementation plan.
          deliverable: nodeLabel(item.priorityWork ?? item.managementOutcome ?? '', 150),
          completionTest: nodeLabel(String(item.proofOfCompletion ?? '').split(/;\s*/)[0] ?? '', 130),
          dependsOn: (Array.isArray(item.dependencies) ? item.dependencies : []).map((d: string) => customerText(d)).filter(Boolean)
        }))
      };
    }).filter((stage) => stage.actions.length > 0)
  };

  // ---- Management dashboard ----
  const dashboard: ManagementMetricExhibit = {
    exhibitId: 'EX-MANAGEMENT-METRICS',
    sourceRefs: roadmapItems.map((r) => r.factRef).filter(Boolean),
    title: 'What to check at the 90-day point',
    baselineSource: 'assessed-condition',
    rows: priorityRows.slice(0, 4).map((row) => ({
      measure: row.outcome,
      // The assessed condition for the owning control family. A single repeated
      // phrase told management nothing and hid four different baselines.
      current: assessedCondition(row.semanticFamily),
      expectation: row.betterLooksLike
    }))
  };

  /**
   * The cover states what the assessment concluded, not what management should
   * do about it. Composed from the strongest and weakest assessed capabilities
   * so it is specific to this organisation and never a generic instruction.
   */
  function coverJudgement(): string {
    const strong = readinessScore.strongest.title;
    const weak = readinessScore.weakest.title;
    const second = sortedDomains[1];
    const org = customerText(factPack.organisation?.name ?? thesis.organisationName ?? 'The organisation');
    if (sustainment) {
      return sentence(`${org} shows a broadly strong fraud readiness position, with ${strong.toLowerCase()} the most developed capability and ${weak.toLowerCase()} the area most exposed to drift`);
    }
    const weakPair = second && second.name && customerText(second.name) !== weak
      ? `${weak.toLowerCase()} and ${customerText(second.name).toLowerCase()}`
      : weak.toLowerCase();
    return sentence(`${org} has useful foundations in ${strong.toLowerCase()}, but weak ${weakPair} leave fraud readiness largely ${String(maturity).toLowerCase()}`);
  }

  /**
   * The conclusion closes the management argument. Replaying "in the first 30
   * days... by 60 days..." is the roadmap's job, and the approved commentary
   * opened that way, so roadmap replay is stripped and the thesis restored.
   */
  function managementConclusion(): string {
    // Composed from the thesis rather than harvested commentary. The approved
    // narrative opened on implementation -- who approves what in the first phase
    // -- which is the roadmap's job. The conclusion closes the argument the cover
    // opened, and says nothing about sequencing.
    const org = customerText(factPack.organisation?.name ?? thesis.organisationName ?? 'The organisation');
    const foundations = sortedDomains.slice(-2).reverse()
      .map((d) => customerText(d.name).toLowerCase())
      .filter(Boolean);
    const foundationClause = foundations.length > 1
      ? `${foundations[0]} and ${foundations[1]}`
      : foundations[0] ?? 'existing controls';
    // Single-word capability names. Phrases carrying their own conjunction made
    // the closing list unreadable. Ownership leads because governance is
    // cross-cutting and is what connects the rest.
    const CAPABILITY_NAME: Record<string, string> = {
      SUPPLIER_PAYMENT_VALUE_DIVERSION: 'challenge',
      IDENTITY_TRANSACTION_SENSITIVE_CHANGE: 'monitoring',
      INCIDENT_CONTAINMENT_LEARNING: 'incident response'
    };
    const capabilities = unique(['ownership', ...exposureRows
      .map((row) => (row.family ? CAPABILITY_NAME[row.family] : undefined))
      .filter((name): name is string => Boolean(name))]);
    const cycle = capabilities.length > 1
      ? `${capabilities.slice(0, -1).join(', ')} and ${capabilities[capabilities.length - 1]}`
      : capabilities[0] ?? 'prevention, detection and response';
    if (sustainment) {
      return sentence(`${org} is operating from a strong position, supported by ${foundationClause}. The management question is no longer whether capability exists but whether it holds as the business changes. The next checkpoint should test whether ${cycle} still operate as one system`);
    }
    return sentence(`${org} is not starting from zero. Its ${foundationClause} provide a useful foundation. The weakness is that these capabilities are not yet connected into a repeatable fraud-risk cycle, so ownership, challenge, detection and response do not yet reinforce one another. The next 90-day checkpoint should test whether ${cycle} now operate as one system rather than as separate activities`);
  }

  // ---- Pages ----
  const pages: EssentialPage[] = [];
  let pageNumber = 1;
  const addPage = (page: Omit<EssentialPage, 'page'>) => { pages.push({ ...page, page: pageNumber }); pageNumber += 1; };

  addPage({ question: 'What is the overall judgement?', heading: 'Cover', kind: 'cover', exhibitIds: [] });
  addPage({
    question: 'What does the assessment show?',
    heading: 'Fraud readiness at a glance',
    kind: 'overview',
    exhibitIds: [readinessScore.exhibitId, domainProfile.exhibitId, ...(materialContrasts ? [materialContrasts.exhibitId] : [])],
    commentary: commentary['EXECUTIVE-JUDGEMENT']
  });
  addPage({ question: 'Why does the position look like this?', heading: diagnosis.title, kind: 'diagnosis', exhibitIds: [diagnosis.exhibitId], commentary: commentary['DIAGNOSIS-SYNTHESIS'] });
  if (exposures) addPage({ question: 'Where does fraud exposure matter most?', heading: exposures.title, kind: 'exposure', exhibitIds: [exposures.exhibitId] });
  if (scenarioExhibit) addPage({ question: 'How could that exposure materialise?', heading: scenarioExhibit.title, kind: 'scenarios', exhibitIds: [scenarioExhibit.exhibitId] });
  addPage({ question: 'What does management need to change?', heading: priorities.title, kind: 'priorities', exhibitIds: [priorities.exhibitId] });
  if (roadmap.stages.length) addPage({ question: 'What should happen in the first 90 days?', heading: roadmap.title, kind: 'roadmap', exhibitIds: [roadmap.exhibitId], commentary: commentary['ROADMAP-LOGIC'] });
  addPage({ question: 'How will management know whether readiness is improving?', heading: dashboard.title, kind: 'dashboard', exhibitIds: [dashboard.exhibitId], commentary: commentary['CONCLUSION'] });

  return {
    version: ESSENTIAL_PRESENTATION_MODEL_VERSION,
    reportIdentity: {
      organisationName: factPack.organisation?.name ?? thesis.organisationName ?? '',
      assessmentReference: factPack.assessment?.reference ?? thesis.assessmentReference ?? '',
      assessmentDate: String(factPack.assessment?.generatedAt ?? '').slice(0, 10),
      tier: 'Essential',
      productLabel: 'Essential Fraud Readiness Report',
      confidentiality: 'Confidential'
    },
    narrativeMode: mode,
    cover: { centralJudgement: coverJudgement(), score, maturity },
    readinessScore,
    domainProfile,
    materialContrasts,
    diagnosis,
    exposures,
    scenarios: scenarioExhibit,
    priorities,
    roadmap,
    dashboard,
    conclusion: managementConclusion(),
    reportBasis: "This report is based on management's responses to the MK Fraud Readiness assessment and MK's analytical methodology. It provides fraud-risk analysis and control-design guidance. MK has not independently tested whether controls operate in practice.",
    pages
  };
}

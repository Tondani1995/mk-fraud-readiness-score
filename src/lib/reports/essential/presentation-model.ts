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

export const ESSENTIAL_PRESENTATION_MODEL_VERSION = 'mk-essential-presentation-v1';

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
  strongest: { title: string; score: number };
  weakest: { title: string; score: number };
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
    exposure: string;
    whyItMatters: string;
    drivers: Array<{ title: string; score: number }>;
    interruptionPoint: string;
    priority: 'Highest' | 'High' | 'Moderate';
  }>;
}

export interface ScenarioPathwayExhibit extends ExhibitBase {
  scenarios: Array<{
    scenarioId: string;
    family: string;
    title: string;
    entryPoint: string;
    controlBreak: string;
    howItUnfolds: string;
    warningIndicators: string[];
    immediateInterruption: string;
  }>;
  /** Stated once for the whole exhibit, never per scenario. */
  assuranceNote: string;
}

export interface ManagementPriorityExhibit extends ExhibitBase {
  rows: Array<{ rank: number; outcome: string; whyNow: string; accountableRole: string; betterLooksLike: string }>;
}

export interface RoadmapExhibit extends ExhibitBase {
  stages: Array<{
    stage: string;
    window: string;
    primaryOutcome: string;
    actions: Array<{ action: string; owner: string; dependsOn: string[] }>;
  }>;
}

export interface ManagementMetricExhibit extends ExhibitBase {
  rows: Array<{ measure: string; current: string; expectation: string }>;
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

const PRIORITY_LABELS: Array<PriorityExposureExhibit['rows'][number]['priority']> = ['Highest', 'High', 'Moderate'];

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
    strongest: { title: customerText(strongestDomain?.name), score: strongestDomain?.score ?? 0 },
    weakest: { title: customerText(weakestDomain?.name), score: weakestDomain?.score ?? 0 }
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

  // ---- Diagnosis: systemic themes with their supporting signals ----
  const themes: string[] = Array.isArray(thesis.systemicDiagnosis) ? thesis.systemicDiagnosis : [];
  const domainByKeyword = (theme: string) => {
    const words = theme.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4);
    return sortedDomains
      .filter((d) => words.some((w) => String(d.name ?? '').toLowerCase().includes(w)))
      .slice(0, 3)
      .map((d) => ({ title: customerText(d.name), score: d.score ?? 0 }));
  };
  const diagnosisRows = themes
    .map((theme) => {
      const signals = domainByKeyword(theme);
      return {
        pattern: customerText(theme),
        signals: signals.length ? signals : [{ title: customerText(weakestDomain?.name), score: weakestDomain?.score ?? 0 }],
        whyItMatters: sentence(commentary[`DIAGNOSIS-${theme}`] ?? '')
      };
    })
    .filter((row) => row.pattern)
    .slice(0, 4);

  const diagnosis: DiagnosisMatrixExhibit = {
    exhibitId: 'EX-DIAGNOSIS-MATRIX',
    sourceRefs: domains.map((d) => d.factRef).filter(Boolean),
    title: sustainment ? 'What is sustaining the position' : 'What is driving the position',
    rows: diagnosisRows,
    interpretation: commentary['DIAGNOSIS-SYNTHESIS']
  };

  // ---- Priority exposures ----
  const clusters: string[] = Array.isArray(thesis.priorityExposureClusters) ? thesis.priorityExposureClusters : [];
  const scenarios: any[] = Array.isArray(factPack.scenarios) ? factPack.scenarios : [];
  const exposureRows = clusters.map((cluster, index) => {
    const linked = scenarios[index];
    return {
      rank: index + 1,
      exposure: customerText(cluster),
      whyItMatters: sentence(commentary[`EXPOSURE-${index + 1}`] ?? firstSentence(linked?.opportunity ?? '')),
      drivers: sortedDomains.slice(0, 3).map((d) => ({ title: customerText(d.name), score: d.score ?? 0 })),
      interruptionPoint: nodeLabel(linked?.requiredControlResponse ?? linked?.currentControlWeakness ?? '', 150),
      priority: PRIORITY_LABELS[Math.min(index, PRIORITY_LABELS.length - 1)]!
    };
  });
  const exposures: PriorityExposureExhibit | undefined = exposureRows.length
    ? { exhibitId: 'EX-PRIORITY-EXPOSURE', sourceRefs: scenarios.map((s) => s.factRef).filter(Boolean), title: sustainment ? 'Residual exposure and watchpoints' : 'Priority fraud exposure', rows: exposureRows }
    : undefined;

  // ---- Scenario pathways ----
  const scenarioExhibit: ScenarioPathwayExhibit | undefined = scenarios.length
    ? {
        exhibitId: 'EX-SCENARIO-PATHWAYS',
        sourceRefs: scenarios.map((s) => s.factRef).filter(Boolean),
        title: 'How exposure could materialise',
        assuranceNote: 'These are plausible fraud pathways derived from the assessment. They are not allegations that these events have occurred.',
        scenarios: scenarios.map((s, index) => ({
          scenarioId: s.factRef ?? `SCENARIO-${index + 1}`,
          family: s.scenarioFamily ?? '',
          title: customerText(s.title),
          entryPoint: nodeLabel(s.entryPoint ?? ''),
          controlBreak: nodeLabel(s.currentControlWeakness ?? ''),
          howItUnfolds: sentence(commentary[`SCENARIO-${s.factRef}`] ?? s.mechanism ?? ''),
          warningIndicators: (Array.isArray(s.warningIndicators) ? s.warningIndicators : [])
            .map((w: string) => customerText(w)).filter(Boolean).slice(0, 3),
          immediateInterruption: nodeLabel(s.requiredControlResponse ?? '')
        }))
      }
    : undefined;

  // ---- Management priorities, from the roadmap's distinct outcomes ----
  const roadmapItems: any[] = Array.isArray(factPack.roadmap) ? factPack.roadmap : [];
  const seenOutcome = new Set<string>();
  const priorityRows = roadmapItems
    .filter((item) => {
      const key = customerText(item.managementOutcome);
      if (!key || seenOutcome.has(key)) return false;
      seenOutcome.add(key);
      return true;
    })
    .slice(0, 5)
    .map((item, index) => ({
      rank: index + 1,
      outcome: customerText(item.managementOutcome),
      whyNow: sentence(commentary[`PRIORITY-${index + 1}`] ?? firstSentence(item.priorityWork ?? '')),
      accountableRole: customerText(item.accountableExecutive ?? item.processOwner ?? ''),
      betterLooksLike: nodeLabel(item.proofOfCompletion ?? '', 130)
    }));

  const priorities: ManagementPriorityExhibit = {
    exhibitId: 'EX-MANAGEMENT-PRIORITIES',
    sourceRefs: roadmapItems.map((r) => r.factRef).filter(Boolean),
    title: sustainment ? 'Sustainment priorities' : 'What management should change',
    rows: priorityRows
  };

  // ---- Roadmap ----
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
    stages: STAGES.map(({ stage, window, match }) => {
      // Each action belongs to exactly one stage; a stage never repeats work
      // already sequenced earlier.
      const items = roadmapItems.filter((item) => {
        if (claimedRefs.has(item.factRef)) return false;
        return match.test(String(item.targetPeriod ?? '').trim());
      });
      for (const item of items) claimedRefs.add(item.factRef);
      return {
        stage,
        window,
        primaryOutcome: customerText(items[0]?.managementOutcome ?? ''),
        actions: items.slice(0, 5).map((item) => ({
          action: nodeLabel(item.priorityWork ?? item.managementOutcome ?? '', 150),
          owner: customerText(item.accountableExecutive ?? item.processOwner ?? ''),
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
    rows: priorityRows.slice(0, 4).map((row) => ({
      measure: row.outcome,
      current: sustainment ? 'Operating' : 'Not consistently established',
      expectation: row.betterLooksLike || 'Defined, owned and evidenced in operation.'
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
    conclusion: sentence(commentary['CONCLUSION'] ?? ''),
    reportBasis: "This report is based on management's responses to the MK Fraud Readiness assessment and MK's analytical methodology. It provides fraud-risk analysis and control-design guidance. MK has not independently tested whether controls operate in practice.",
    pages
  };
}

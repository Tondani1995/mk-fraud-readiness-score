import type { NarrativeFactPack, NarrativeProductTier } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';
import { positionAssertion } from '../essential/evidence-support';
import { familyPresentation } from '../essential/content-families';

export const REPORT_BLUEPRINT_SCHEMA_VERSION = 'mk-reporting-bible-1.1-report-blueprint-v3';
export const WHOLE_MANUSCRIPT_CONTEXT_SCHEMA_VERSION = 'mk-reporting-bible-1.1-whole-manuscript-context-v3';

/** Owner-approved active model contract: GPT-5 mini supports 400k context and 128k output. */
export const WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS = 400_000;
export const WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS = 128_000;
export const WHOLE_MANUSCRIPT_EXPECTED_OUTPUT_RESERVE_TOKENS = 8_000;
export const WHOLE_MANUSCRIPT_OPERATING_MARGIN_TOKENS = 100_000;
export const WHOLE_MANUSCRIPT_APPROVED_INPUT_TOKENS = WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS - WHOLE_MANUSCRIPT_EXPECTED_OUTPUT_RESERVE_TOKENS - WHOLE_MANUSCRIPT_OPERATING_MARGIN_TOKENS;
export const WHOLE_MANUSCRIPT_ACTIVE_MODEL = 'openai/gpt-5-mini';

export const NARRATIVE_ROLES = [
  'JUDGEMENT',
  'DIAGNOSIS',
  'EVIDENCE',
  'EXPOSURE',
  'EXPOSURE_ILLUSTRATION',
  'TARGET_STATE',
  'RESPONSE',
  'DECISION',
  'IMPLEMENTATION',
  'MATURATION',
  'SUSTAINMENT',
  'CONCLUSION'
] as const;
export type NarrativeRole = typeof NARRATIVE_ROLES[number];
export const REMEDIATION_STAGES = ['STABILISE', 'ESTABLISH', 'EMBED', 'MATURE'] as const;
export const SUSTAINMENT_STAGES = ['PRESERVE', 'EMBED', 'MEASURE', 'OPTIMISE'] as const;
export type TransformationStage = typeof REMEDIATION_STAGES[number] | typeof SUSTAINMENT_STAGES[number];

export interface BlueprintTransformationStage {
  stage: TransformationStage;
  narrativeRole: NarrativeRole;
  supported: boolean;
  sourceRefs: string[];
  purpose: string;
}

export type ReportBlueprintTier = NarrativeProductTier | 'snapshot';
export type BlueprintExhibitType =
  | 'score_display'
  | 'domain_profile'
  | 'theme_map'
  | 'finding_summary'
  | 'scenario_pathway'
  | 'control_response'
  | 'decision_options'
  | 'roadmap_30_60_90'
  | 'maturation_path'
  | 'sustainment_scorecard';

export interface ReportBlueprintSubsection {
  subsectionId: string;
  order: number;
  title: string;
  purpose: string;
  requiredManagementTakeaway: string;
  requiredFacts: string[];
  claimRefs: string[];
  narrativeRole: NarrativeRole;
}

export interface ReportBlueprintSection {
  sectionId: string;
  order: number;
  title: string;
  purpose: string;
  requiredManagementTakeaway: string;
  requiredFacts: string[];
  claimRefs: string[];
  optionalSubsections: ReportBlueprintSubsection[];
  narrativeRole: NarrativeRole;
}

export interface ReportBlueprintExhibit {
  exhibitId: string;
  type: BlueprintExhibitType;
  placement: { chapterId: string; sectionId: string };
  purpose: string;
  sourceRefs: string[];
  captionPurpose: string;
  narrativeLeadIn: string;
  demonstrates: string;
  interpretation: string;
  aiInterpretationAllowed: boolean;
}

export interface FindingCluster {
  clusterId: string;
  title: string;
  whyTogether: string;
  semanticFamilies: string[];
  findingRefs: string[];
  sourceRefs: string[];
}

export interface BlueprintChapter {
  chapterId: string;
  order: number;
  title: string;
  purpose: string;
  requiredManagementTakeaway: string;
  requiredFacts: string[];
  claimRefs: string[];
  linkedFindingIds: string[];
  linkedScenarioIds: string[];
  linkedControlIds: string[];
  linkedDecisionIds: string[];
  linkedRoadmapIds: string[];
  narrativeRole: NarrativeRole;
  exhibits: ReportBlueprintExhibit[];
  sections: ReportBlueprintSection[];
}

export interface BlueprintContentAssignment {
  contentType: 'theme' | 'finding' | 'scenario' | 'control' | 'decision' | 'roadmap' | 'sustainment_priority' | 'maturation_step';
  contentRef: string;
  chapterId: string;
  sectionId: string;
  assignmentType: 'primary_home';
  narrativeRole: NarrativeRole;
}

export interface BlueprintNarrativeCrossReference {
  contentType: BlueprintContentAssignment['contentType'];
  contentRef: string;
  fromChapterId: string;
  fromSectionId: string;
  narrativeRole: NarrativeRole;
  referencePurpose: string;
}

export interface BlueprintNarrativeUsageLedgerEntry {
  contentType: BlueprintContentAssignment['contentType'] | 'fact';
  contentRef: string;
  narrativeRole: NarrativeRole;
  chapterId: string;
  sectionId: string;
  usage: 'primary_home' | 'cross_reference';
  managementTakeaway: string;
}

export interface BlueprintNarrativeRoleUsage {
  factUsage: Record<string, NarrativeRole[]>;
  findingUsage: Record<string, NarrativeRole[]>;
  scenarioUsage: Record<string, NarrativeRole[]>;
  controlUsage: Record<string, NarrativeRole[]>;
  ledger: BlueprintNarrativeUsageLedgerEntry[];
}

export interface ReportBlueprint {
  schemaVersion: typeof REPORT_BLUEPRINT_SCHEMA_VERSION;
  bibleVersion: '1.1';
  reportTitle: string;
  reportTier: ReportBlueprintTier;
  narrativeMode: NarrativeFactPack['narrativeMode'] | 'SNAPSHOT';
  organisation: { name: string; sectorFacts: string[] };
  assessmentPosition: {
    reference: string;
    score: number | null;
    maturity: string | null;
    exposureScore: number | null;
    exposureBand: string | null;
    summary: string;
    assuranceBoundary: string;
  };
  executiveStory: string;
  chapters: BlueprintChapter[];
  findingClusters: FindingCluster[];
  contentAssignments: BlueprintContentAssignment[];
  narrativeCrossReferences: BlueprintNarrativeCrossReference[];
  narrativeRoleUsage: BlueprintNarrativeRoleUsage;
  transformationSequence: BlueprintTransformationStage[];
  deterministicRules: string[];
  prohibitedClaims: string[];
}

export interface ContextTokenRange {
  minimum: number;
  maximum: number;
  basis: string;
}

export interface WholeManuscriptPartition {
  partitionId: string;
  chapterIds: string[];
  purpose: string;
  preservesSequence: boolean;
  requiredContext: 'complete-blueprint-and-prior-narrative-state';
}

export interface WholeManuscriptWriterContext {
  schemaVersion: typeof WHOLE_MANUSCRIPT_CONTEXT_SCHEMA_VERSION;
  architecture: 'whole-manuscript';
  reportBlueprint: ReportBlueprint;
  permittedDeterministicFacts: NarrativeFactPack['facts'];
  boundaries: {
    assurance: string;
    customerLanguage: string[];
    prohibitedClaims: string[];
    sourceOfTruth: string;
  };
  style: {
    voice: string;
    continuity: string[];
  };
  projectedInputTokens: ContextTokenRange;
  projectedOutputTokens: ContextTokenRange;
  outputBudget: WholeManuscriptOutputBudget;
  approvedInputTokenLimit: number;
  singleCallFeasible: boolean;
  partitionPlan: WholeManuscriptPartition[];
  partitioningRule: string;
}

export interface WholeManuscriptOutputBudget {
  reportTier: ReportBlueprint['reportTier'];
  expectedWordRange: { minimum: number; maximum: number };
  expectedOutputTokens: number;
  headingCount: number;
  averageExpectedTokensPerHeading: number;
  narrativeVarianceTokens: number;
  headingAndTransitionReserveTokens: number;
  conclusionReserveTokens: number;
  safetyMarginTokens: number;
  hardOutputTokenLimit: number;
  basis: string;
}

const OUTPUT_BUDGET_NARRATIVE_VARIANCE = 0.2;
const OUTPUT_BUDGET_HEADING_VARIANCE = 0.2;
const OUTPUT_BUDGET_CONCLUSION_HEADING_UNITS = 2;
const OUTPUT_BUDGET_TAIL_HEADING_UNITS = 3;
const OUTPUT_BUDGET_MIN_TAIL_TOKENS = 512;

function manuscriptHeadingCount(blueprint: ReportBlueprint): number {
  return blueprint.chapters.reduce((total, chapter) => total + 1 + chapter.sections.reduce((sectionTotal, section) => sectionTotal + 1 + section.optionalSubsections.length, 0), 0);
}

function expectedManuscriptWordRange(reportTier: ReportBlueprint['reportTier']): { minimum: number; maximum: number } {
  if (reportTier === 'snapshot') return { minimum: 700, maximum: 1400 };
  if (reportTier === 'essential') return { minimum: 2200, maximum: 4200 };
  return { minimum: 4200, maximum: 7600 };
}

export function deriveWholeManuscriptOutputBudget(blueprint: ReportBlueprint): WholeManuscriptOutputBudget {
  const expectedWordRange = expectedManuscriptWordRange(blueprint.reportTier);
  const expectedOutputTokens = expectedWordRange.maximum;
  const headingCount = manuscriptHeadingCount(blueprint);
  if (headingCount < 1) throw new Error('Whole-manuscript output budgeting requires at least one Blueprint heading.');
  const averageExpectedTokensPerHeading = Math.ceil(expectedOutputTokens / headingCount);
  const narrativeVarianceTokens = Math.ceil(expectedOutputTokens * OUTPUT_BUDGET_NARRATIVE_VARIANCE);
  const headingAndTransitionReserveTokens = Math.ceil(expectedOutputTokens * OUTPUT_BUDGET_HEADING_VARIANCE);
  const conclusionReserveTokens = averageExpectedTokensPerHeading * OUTPUT_BUDGET_CONCLUSION_HEADING_UNITS;
  const safetyMarginTokens = narrativeVarianceTokens + headingAndTransitionReserveTokens + conclusionReserveTokens;
  return {
    reportTier: blueprint.reportTier,
    expectedWordRange,
    expectedOutputTokens,
    headingCount,
    averageExpectedTokensPerHeading,
    narrativeVarianceTokens,
    headingAndTransitionReserveTokens,
    conclusionReserveTokens,
    safetyMarginTokens,
    hardOutputTokenLimit: Math.min(WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS, expectedOutputTokens + safetyMarginTokens),
    basis: 'Expected tier envelope is kept separate from the technical limit. Technical headroom is derived from 20% narrative variance, 20% heading/transition variance and two average heading units for the conclusion; the active model maximum remains the hard ceiling.'
  };
}

export function deriveTailOutputTokenLimit(outputBudget: WholeManuscriptOutputBudget, missingHeadingCount: number): number {
  if (!Number.isInteger(missingHeadingCount) || missingHeadingCount < 1) throw new Error('Tail output budgeting requires at least one missing heading.');
  return Math.min(outputBudget.hardOutputTokenLimit, Math.max(OUTPUT_BUDGET_MIN_TAIL_TOKENS, outputBudget.averageExpectedTokensPerHeading * OUTPUT_BUDGET_TAIL_HEADING_UNITS * missingHeadingCount));
}

export interface BlueprintValidationResult {
  ok: boolean;
  duplicateContentRefs: string[];
  missingContentRefs: string[];
  duplicateExecutiveMovements: string[];
  duplicateRoadmapMovements: string[];
  duplicateNarrativeRoles: string[];
  missingMaterialFacts: string[];
  issues: string[];
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const ordered = <T>(values: T[]): T[] => values.filter(Boolean);
const factIds = (pack: NarrativeFactPack, kind?: string): string[] => pack.facts.filter((fact) => !kind || fact.kind === kind).map((fact) => fact.id);
const refs = <T extends { factRef: string }>(values: T[]): string[] => values.map((value) => value.factRef);
const sourceIds = <T extends { sourceId?: string; factRef?: string }>(values: T[]): string[] => values.map((value) => value.sourceId ?? value.factRef ?? '').filter(Boolean);

function narrativeRoleFor(identity: string, title: string): NarrativeRole {
  const value = `${identity} ${title}`.toUpperCase();
  if (/EXECUTIVE|POSITION|JUDGEMENT|TAKEAWAY/.test(value)) return 'JUDGEMENT';
  if (/CONCLUSION/.test(value)) return 'CONCLUSION';
  if (/PRIORITY-FRAUD-EXPOSURES|MATERIAL-FRAUD-RISK-THEMES|FINDING-SUMMARY/.test(value)) return 'EVIDENCE';
  if (/SCENARIO|PATHWAY|EXPOSURE/.test(value)) return /PATHWAY|SCENARIO/.test(value) ? 'EXPOSURE_ILLUSTRATION' : 'EXPOSURE';
  if (/CONTROL|TARGET|RESPONSE/.test(value)) return /RESPONSE/.test(value) ? 'RESPONSE' : 'TARGET_STATE';
  if (/DECISION|OPTIONS|TRADE-OFF/.test(value)) return 'DECISION';
  if (/ROADMAP|90-DAY|IMPLEMENTATION/.test(value)) return 'IMPLEMENTATION';
  if (/MATURATION|OPTIMISATION|OPTIMIZATION/.test(value)) return 'MATURATION';
  if (/DETERIORATION|WATCHPOINT/.test(value)) return 'EXPOSURE';
  if (/ANALYTICAL-BASIS/.test(value)) return 'DIAGNOSIS';
  if (/SUPPORTING-STANDARD/.test(value)) return 'EVIDENCE';
  if (/SUSTAIN-BLUEPRINT/.test(value)) return 'RESPONSE';
  if (/SUSTAIN|RESILIENCE/.test(value)) return 'SUSTAINMENT';
  if (/FINDING|EVIDENCE|MATERIAL/.test(value)) return 'EVIDENCE';
  if (/DIAGNOS|THEME|PATTERN|SHAPING|HOLDS-READINESS|ANALYTICAL/.test(value)) return 'DIAGNOSIS';
  return 'EVIDENCE';
}

const FAMILY_TITLES: Record<string, string> = {
  FRAUD_GOVERNANCE: 'Fraud-risk ownership and oversight',
  FRAUD_RISK_IDENTIFICATION: 'Fraud-risk identification and treatment',
  SUPPLIER_ONBOARDING: 'Supplier onboarding and identity checks',
  SUPPLIER_PAYMENT_CHANGE: 'Payment-instruction change controls',
  THIRD_PARTY_OVERSIGHT: 'Third-party oversight and challenge',
  ORDINARY_ACCESS: 'Role-based access and segregation',
  PRIVILEGED_ACCESS: 'Privileged access and recertification',
  IDENTITY_VERIFICATION: 'Identity verification for sensitive change',
  DETECTION_MONITORING: 'Monitoring, exception review and escalation',
  INCIDENT_RESPONSE: 'Incident response and containment',
  EVIDENCE_INTEGRITY: 'Evidence preservation and custody',
  WHISTLEBLOWING: 'Protected reporting and escalation',
  FRAUD_AWARENESS: 'Fraud awareness and reporting practice',
  CONTINUOUS_IMPROVEMENT: 'Control learning and continuous improvement'
};

function customerTitleForFamily(family: string, role: NarrativeRole, mode: NarrativeFactPack['narrativeMode']): string {
  const base = FAMILY_TITLES[family] ?? 'Connected fraud-control discipline';
  if (mode === 'SUSTAINMENT' || role === 'SUSTAINMENT') return `${base} to preserve`;
  if (role === 'RESPONSE' || role === 'TARGET_STATE') return `Strengthen ${base.toLowerCase()}`;
  if (role === 'EXPOSURE' || role === 'EXPOSURE_ILLUSTRATION') return `${base} exposure pathway`;
  return base;
}

function customerDecisionTitle(decision: NarrativeFactPack['decisions'][number]): string {
  const value = `${decision.decisionSemanticFamily} ${decision.question}`.toUpperCase();
  if (/FUND|RESOURCE|CAPACITY/.test(value)) return 'What capacity will implementation require?';
  if (/SEQUENCE|PRIORIT/.test(value)) return 'What should management address first?';
  if (/OWNER|MANDATE|GOVERN/.test(value)) return 'Who will own the fraud-control mandate?';
  if (/ACCESS|PRIVILEGED/.test(value)) return 'Who will govern access and exception decisions?';
  if (/DETECT|MONITOR|ESCALAT/.test(value)) return 'How will management govern detection and escalation?';
  return 'What management choice will keep the response moving?';
}

function tierLabel(tier: ReportBlueprintTier): string {
  return tier === 'snapshot' ? 'Free snapshot' : tier[0].toUpperCase() + tier.slice(1);
}

function scoreSummary(pack: NarrativeFactPack): string {
  const score = pack.assessment.score === null ? 'not scored' : `${pack.assessment.score}/100`;
  const maturity = pack.assessment.maturity ?? 'not assigned';
  const exposure = pack.assessment.exposureBand ? ` Exposure is assessed as ${pack.assessment.exposureBand}.` : '';
  return `The assessment places the organisation at ${score} with ${maturity} maturity.${exposure}`;
}

function commonAssuranceBoundary(): string {
  // Wording the model is expected to echo, so it carries no engine vocabulary.
  return "The assessment is based on management's own responses and the MK scoring method. It is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.";
}

function section(
  sectionId: string,
  title: string,
  purpose: string,
  takeaway: string,
  requiredFacts: string[],
  claimRefs: string[],
  optionalSubsections: ReportBlueprintSubsection[] = [],
  narrativeRole?: NarrativeRole
): ReportBlueprintSection {
  const facts = unique(requiredFacts);
  const claims = unique(claimRefs);
  return {
    sectionId,
    order: 1,
    title,
    purpose,
    requiredManagementTakeaway: takeaway,
    requiredFacts: facts,
    claimRefs: claims,
    optionalSubsections: optionalSubsections.map((item, index) => ({ ...item, order: index + 1, narrativeRole: item.narrativeRole ?? narrativeRoleFor(item.subsectionId, item.title) })),
    narrativeRole: narrativeRole ?? narrativeRoleFor(sectionId, title)
  };
}

function subsection(
  subsectionId: string,
  order: number,
  title: string,
  purpose: string,
  takeaway: string,
  requiredFacts: string[],
  claimRefs: string[],
  narrativeRole?: NarrativeRole
): ReportBlueprintSubsection {
  return { subsectionId, order, title, purpose, requiredManagementTakeaway: takeaway, requiredFacts: unique(requiredFacts), claimRefs: unique(claimRefs), narrativeRole: narrativeRole ?? narrativeRoleFor(subsectionId, title) };
}

function chapter(
  chapterId: string,
  order: number,
  title: string,
  purpose: string,
  takeaway: string,
  input: Partial<Omit<BlueprintChapter, 'chapterId' | 'order' | 'title' | 'purpose' | 'requiredManagementTakeaway'>> & { section?: ReportBlueprintSection; sections?: ReportBlueprintSection[] }
): BlueprintChapter {
  const linkedFindingIds = unique(input.linkedFindingIds ?? []);
  const linkedScenarioIds = unique(input.linkedScenarioIds ?? []);
  const linkedControlIds = unique(input.linkedControlIds ?? []);
  const linkedDecisionIds = unique(input.linkedDecisionIds ?? []);
  const linkedRoadmapIds = unique(input.linkedRoadmapIds ?? []);
  return {
    chapterId,
    order,
    title,
    purpose,
    requiredManagementTakeaway: takeaway,
    requiredFacts: unique(input.requiredFacts ?? []),
    claimRefs: unique(input.claimRefs ?? []),
    linkedFindingIds,
    linkedScenarioIds,
    linkedControlIds,
    linkedDecisionIds,
    linkedRoadmapIds,
    narrativeRole: input.narrativeRole ?? narrativeRoleFor(chapterId, title),
    exhibits: input.exhibits ?? [],
    sections: (input.sections ?? (input.section ? [input.section] : [])).map((item, index) => ({ ...item, order: index + 1 }))
  };
}

function exhibit(
  exhibitId: string,
  type: BlueprintExhibitType,
  chapterId: string,
  sectionId: string,
  purpose: string,
  sourceRefs: string[],
  captionPurpose: string,
  narrativeLeadIn = 'The preceding narrative establishes the management question this exhibit addresses.',
  demonstrates = purpose,
  interpretation = captionPurpose,
  aiInterpretationAllowed = true
): ReportBlueprintExhibit {
  const leadInByType: Record<BlueprintExhibitType, string> = {
    score_display: 'Where does the organisation stand on fraud readiness?',
    domain_profile: 'Which standards and domain patterns explain the position?',
    theme_map: 'What connected themes explain the result beneath the score?',
    finding_summary: 'Which material observations deserve management attention?',
    scenario_pathway: 'How could the supported exposure pathway materialise if the linked conditions combine?',
    control_response: 'What target control response would interrupt the linked exposure?',
    decision_options: 'What management choice is required, and what trade-offs accompany it?',
    roadmap_30_60_90: 'What should management make true in the first operating cycle?',
    maturation_path: 'How does the target environment progress through its implementation horizons?',
    sustainment_scorecard: 'What should remain true to preserve this readiness position?'
  };
  return { exhibitId, type, placement: { chapterId, sectionId }, purpose, sourceRefs: unique(sourceRefs), captionPurpose, narrativeLeadIn: narrativeLeadIn === 'The preceding narrative establishes the management question this exhibit addresses.' ? leadInByType[type] : narrativeLeadIn, demonstrates, interpretation, aiInterpretationAllowed };
}

function clusterFindings(pack: NarrativeFactPack): FindingCluster[] {
  if (pack.narrativeMode === 'SUSTAINMENT') return [];
  const findingsByRef = new Map(pack.findings.map((finding) => [finding.factRef, finding]));
  const assigned = new Set<string>();
  const clusters: FindingCluster[] = [];
  for (const theme of pack.systemicThemeInputs) {
    const findingRefs = theme.findingRefs.filter((ref) => findingsByRef.has(ref));
    if (!findingRefs.length) continue;
    findingRefs.forEach((ref) => assigned.add(ref));
    clusters.push({
      clusterId: `CLUSTER-${theme.themeFamily}`,
      title: theme.title,
      whyTogether: theme.whyTogether,
      semanticFamilies: [...theme.semanticFamilies],
      findingRefs,
      sourceRefs: unique([theme.factRef, ...findingRefs])
    });
  }
  const remaining = pack.findings.filter((finding) => !assigned.has(finding.factRef));
  if (remaining.length) {
    clusters.push({
      clusterId: 'CLUSTER-ADDITIONAL-MATERIAL-PATTERN',
      title: 'Additional material control pattern',
      whyTogether: 'These material observations are retained as a distinct group because the available evidence does not support combining them with another theme.',
      semanticFamilies: unique(remaining.flatMap((finding) => [finding.primarySemanticFamily, ...finding.secondarySemanticFamilies])),
      findingRefs: remaining.map((finding) => finding.factRef),
      sourceRefs: remaining.map((finding) => finding.factRef)
    });
  }
  return clusters;
}

/**
 * Exposure clusters grouped by management pattern.
 *
 * Clustering one-to-one with systemic themes produced a chapter of mini finding
 * reports rather than a small number of management exposures. Findings are
 * therefore grouped by the exposure pattern their semantic families belong to,
 * which is what a reader can act on.
 *
 * Cross-cutting families -- governance, risk identification, culture -- are
 * deliberately excluded from exposure ownership. They enable every exposure
 * rather than forming one of their own, so they belong in the diagnosis.
 */
const EXPOSURE_PATTERNS: Array<{ clusterId: string; title: string; whyTogether: string; families: string[] }> = [
  {
    clusterId: 'CLUSTER-VALUE-DIVERSION-SUPPLIER-PAYMENT',
    title: 'Value diversion through supplier and payment processes',
    whyTogether: 'Supplier onboarding and payment-instruction weaknesses could combine to redirect value before an independent challenge occurs.',
    families: ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'PAYMENT_INTEGRITY', 'THIRD_PARTY']
  },
  {
    clusterId: 'CLUSTER-IDENTITY-TRANSACTION-SENSITIVE-CHANGE',
    title: 'Weak challenge at identity, transaction and sensitive-change points',
    whyTogether: 'Identity verification, transaction monitoring and exception escalation determine whether unusual activity receives timely challenge.',
    families: ['IDENTITY_VERIFICATION', 'DETECTION_MONITORING', 'TRANSACTION_MONITORING', 'SENSITIVE_CHANGE', 'ACCESS_CONTROL']
  },
  {
    clusterId: 'CLUSTER-CONTAINMENT-LEARNING',
    title: 'Limited containment and learning after suspected fraud',
    whyTogether: 'Evidence preservation, incident response and continuous improvement determine whether a suspected matter is contained and converted into management learning.',
    families: ['EVIDENCE_INTEGRITY', 'INCIDENT_RESPONSE', 'INVESTIGATION', 'CONTINUOUS_IMPROVEMENT']
  }
];

function domainRefs(pack: NarrativeFactPack, codes: string[]): string[] {
  return codes.map((code) => pack.domains.find((domain) => domain.code === code)?.factRef).filter((value): value is string => Boolean(value));
}

/** Domains that materially drive this assessment, weakest first, for executive exhibits. */
function materialDomainRefs(pack: NarrativeFactPack, limit = 6): string[] {
  return [...pack.domains]
    .filter((domain) => typeof domain.score === 'number')
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, limit)
    .map((domain) => domain.factRef);
}

/**
 * The claim basis for the closing management argument. The conclusion is about
 * connecting what already works to what does not, so it may cite the domains
 * the roadmap actions address and the two ends of the contrast it argues from.
 */
function conclusionDomainRefs(pack: NarrativeFactPack): string[] {
  const findingsByRef = new Map(pack.findings.map((finding) => [finding.factRef, finding]));
  const domainByName = new Map(pack.domains.map((domain) => [domain.name, domain.factRef]));
  const addressed = pack.roadmap
    .map((item) => findingsByRef.get(item.sourceFindingRef ?? '')?.domain)
    .map((name) => (name ? domainByName.get(name) : undefined))
    .filter((value): value is string => Boolean(value));
  const ranked = [...pack.domains].filter((domain) => typeof domain.score === 'number').sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const ends = ranked.length ? [ranked[0].factRef, ranked[ranked.length - 1].factRef] : [];
  return unique([...addressed, ...ends]);
}

/**
 * The management consequence of one exposure cluster's own content.
 *
 * Every cluster used to receive the same required takeaway, so three or four
 * writers with different findings were told to reach the same conclusion and
 * two of them wrote the same sentence. The consequence is now derived from the
 * cluster's own owning family: what interrupting *this* pattern turns on.
 */
function clusterTakeaway(cluster: FindingCluster): string {
  const owning = cluster.semanticFamilies.find((family) => familyPresentation(family)) ?? cluster.semanticFamilies[0];
  const presentation = owning ? familyPresentation(owning) : undefined;
  const interruption = presentation?.interruptionPoint?.replace(/\.$/, '');
  // Keep the shared frame minimal: the derived interruption point must dominate,
  // or three clusters end up with three paraphrases of one sentence.
  return interruption
    ? `${interruption}. Without that, this pattern continues unchallenged.`
    : `${cluster.title} requires one accountable owner rather than separate fixes.`;
}

/**
 * Lowercase a sentence-cased fragment so it can follow a clause.
 *
 * Only a capital followed by a lowercase letter is decapitalised, so acronyms
 * and figures ("100% of material fraud actions") survive intact.
 */
function asClause(value: string): string {
  const text = String(value ?? '').trim().replace(/\.$/, '');
  const firstWord = text.split(/\s+/)[0] ?? '';
  // An acronym or a figure keeps its case; an ordinary word, including a
  // one-letter article, does not.
  const isAcronym = firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  if (!/^[A-Za-z]/.test(text) || isAcronym) return text;
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/**
 * The management consequence of preserving one supporting standard.
 *
 * `strength.title` is already a complete sentence, so appending to it produced
 * ungrammatical prose. The distinguishing content is what that capability
 * actually has in place, which the matching sustainment priority carries.
 */
function standardTakeaway(pack: NarrativeFactPack, strength: { title: string; domainCode?: string }): string {
  const domainName = pack.domains.find((domain) => domain.code === strength.domainCode)?.name;
  const priority = (pack.sustainmentPriorities ?? []).find((item: any) => item.domain === domainName);
  const standard = String(priority?.currentStrongStandard ?? '').trim().replace(/\.$/, '');
  if (standard) return `${standard}. That is what preserving this capability protects.`;
  return `${domainName ?? strength.title} holds only while its owner, rhythm and evidence stay current.`;
}

/**
 * The management consequence of one conditional pathway.
 *
 * Answers where management has the best interruption opportunity in this
 * particular pathway, rather than repeating the same statement about pathways
 * in general for every scenario.
 */
function scenarioTakeaway(scenario: { immediateContainment?: string; requiredControlResponse?: string; entryPoint?: string; warningIndicators?: string[] }): string {
  const containment = String(scenario.immediateContainment ?? '').trim().replace(/\.$/, '');
  const response = String(scenario.requiredControlResponse ?? '').trim().replace(/\.$/, '');
  if (containment) return `The interruption point for this pathway: ${containment}.`;
  if (response) return `The interruption point for this pathway: ${response}.`;
  return 'This pathway is a conditional management test, not an allegation that an event occurred.';
}

/**
 * The opening takeaway, conditioned on what the assessment actually shows.
 *
 * The previous wording asserted "not a zero-base condition" for every
 * organisation, including one scoring 0.00 on all ten domains.
 */
function positionTakeaway(pack: NarrativeFactPack): string {
  return positionAssertion(pack.domains).takeaway;
}

/**
 * The single response section that owns a management decision.
 *
 * Decisions link to findings across several control families, so filtering by
 * "shares any finding" authorised nearly every decision to nearly every
 * response section. Ownership is the family sharing the most findings with the
 * decision; ties and unlinked decisions resolve deterministically by position so
 * every decision has exactly one home.
 */
function decisionOwnerFamily(pack: NarrativeFactPack, families: string[], decision: { factRef: string; linkedFindingRefs: string[] }): string | undefined {
  if (!families.length) return undefined;
  let best: { family: string; score: number } | undefined;
  families.forEach((family) => {
    const controls = pack.controls.filter((control) => control.primarySemanticFamily === family);
    const score = decision.linkedFindingRefs.filter((ref) => controls.some((control) => control.linkedFindingRefs.includes(ref))).length;
    if (score > (best?.score ?? 0)) best = { family, score };
  });
  if (best) return best.family;
  const index = pack.decisions.findIndex((entry) => entry.factRef === decision.factRef);
  return families[Math.max(0, index) % families.length];
}

/** Is a cross-cutting capability materially weaker than the assessment overall? */
function crossCuttingIsEnablingWeakness(pack: NarrativeFactPack): boolean {
  const overall = pack.assessment.score;
  if (typeof overall !== 'number') return false;
  const crossCutting = pack.findings
    .filter((finding) => CROSS_CUTTING_SEMANTIC_FAMILIES.includes(finding.primarySemanticFamily))
    .map((finding) => pack.domains.find((domain) => domain.name === finding.domain)?.score)
    .filter((score): score is number => typeof score === 'number');
  return crossCutting.length > 0 && Math.min(...crossCutting) <= overall;
}

const CROSS_CUTTING_SEMANTIC_FAMILIES = ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'FRAUD_CULTURE'];

function patternExposureClusters(pack: NarrativeFactPack): FindingCluster[] {
  if (pack.narrativeMode === 'SUSTAINMENT') return [];
  const familiesOf = (finding: any) => [finding.primarySemanticFamily, ...(finding.secondarySemanticFamilies ?? [])];
  const clusters: FindingCluster[] = [];
  const assigned = new Set<string>();
  for (const pattern of EXPOSURE_PATTERNS) {
    const findings = pack.findings.filter((finding) => !assigned.has(finding.factRef)
      && familiesOf(finding).some((family) => pattern.families.includes(family)));
    if (!findings.length) continue;
    findings.forEach((finding) => assigned.add(finding.factRef));
    clusters.push({
      clusterId: pattern.clusterId,
      title: pattern.title,
      whyTogether: pattern.whyTogether,
      semanticFamilies: unique(findings.flatMap(familiesOf)),
      findingRefs: findings.map((finding) => finding.factRef),
      sourceRefs: findings.map((finding) => finding.factRef)
    });
  }
  // Anything left that is not cross-cutting still deserves an exposure home.
  const remaining = pack.findings.filter((finding) => !assigned.has(finding.factRef)
    && !CROSS_CUTTING_SEMANTIC_FAMILIES.includes(finding.primarySemanticFamily));
  if (remaining.length) {
    clusters.push({
      clusterId: 'CLUSTER-ADDITIONAL-MATERIAL-PATTERN',
      title: 'Additional material control pattern',
      whyTogether: 'These material observations are retained as a distinct group because the available evidence does not support combining them with another pattern.',
      semanticFamilies: unique(remaining.flatMap(familiesOf)),
      findingRefs: remaining.map((finding) => finding.factRef),
      sourceRefs: remaining.map((finding) => finding.factRef)
    });
  }
  return clusters.length ? clusters : clusterFindings(pack);
}

function assignmentsFor(pack: NarrativeFactPack, chapters: BlueprintChapter[]): BlueprintContentAssignment[] {
  const all: BlueprintContentAssignment[] = [];
  const add = (contentType: BlueprintContentAssignment['contentType'], contentRefs: string[], chapterId: string, sectionId: string) => contentRefs.forEach((contentRef) => {
    const target = chapters.find((item) => item.chapterId === chapterId);
    const semanticSection = target?.sections.find((item) => item.requiredFacts.includes(contentRef) || item.claimRefs.includes(contentRef));
    const resolvedSection = semanticSection ?? target?.sections.find((item) => item.sectionId === sectionId);
    all.push({ contentType, contentRef, chapterId, sectionId: resolvedSection?.sectionId ?? sectionId, assignmentType: 'primary_home', narrativeRole: resolvedSection?.narrativeRole ?? chapters.find((item) => item.chapterId === chapterId)?.narrativeRole ?? 'EVIDENCE' });
  });
  const byId = (id: string) => chapters.find((item) => item.chapterId === id)?.sections[0]?.sectionId ?? '';
  const sustainment = pack.narrativeMode === 'SUSTAINMENT';
  const comprehensive = pack.productTier === 'comprehensive';
  const themeChapter = sustainment ? 'READINESS-SUPPORTING-STANDARDS' : comprehensive ? 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS' : 'WHAT-HOLDS-READINESS-BACK';
  const findingChapter = comprehensive ? 'MATERIAL-FRAUD-RISK-THEMES' : 'PRIORITY-FRAUD-EXPOSURES';
  const scenarioChapter = comprehensive ? 'HOW-EXPOSURE-COULD-MATERIALISE' : 'EXPOSURE-COULD-MATERIALISE';
  add('theme', refs(pack.systemicThemeInputs), themeChapter, byId(themeChapter));
  // A cross-cutting finding enables every exposure rather than being one, so it
  // is routed to the diagnosis chapter instead of competing as an exposure.
  const crossCuttingFindings = pack.findings.filter((finding) => CROSS_CUTTING_SEMANTIC_FAMILIES.includes(finding.primarySemanticFamily));
  const crossCuttingRefs = new Set(crossCuttingFindings.map((finding) => finding.factRef));
  const exposureFindingRefs = refs(pack.findings).filter((ref) => !crossCuttingRefs.has(ref));
  add('finding', exposureFindingRefs.length ? exposureFindingRefs : refs(pack.findings), findingChapter, byId(findingChapter));
  if (exposureFindingRefs.length && crossCuttingRefs.size) add('finding', [...crossCuttingRefs], themeChapter, byId(themeChapter));
  add('scenario', refs(pack.scenarios), scenarioChapter, byId(scenarioChapter));
  const controlChapter = sustainment ? (comprehensive ? 'TARGET-RESILIENT-CONTROL-ENVIRONMENT' : 'SUSTAINMENT-BLUEPRINT') : 'TARGET-CONTROL-ENVIRONMENT';
  add('control', refs(pack.controls), controlChapter, byId(controlChapter));
  const decisionChapter = sustainment ? (comprehensive ? 'LEADERSHIP-DECISIONS-TO-PRESERVE' : 'SUSTAINMENT-BLUEPRINT') : comprehensive ? 'MANAGEMENT-DECISIONS-REQUIRED' : 'TARGET-CONTROL-ENVIRONMENT';
  const roadmapChapter = sustainment ? (comprehensive ? 'SUSTAINMENT-OPTIMISATION' : 'SUSTAINMENT-BLUEPRINT') : comprehensive ? 'IMPLEMENTATION-BLUEPRINT' : 'FIRST-90-DAYS-CONCLUSION';
  add('decision', refs(pack.decisions), decisionChapter, byId(decisionChapter));
  add('roadmap', refs(pack.roadmap), roadmapChapter, byId(roadmapChapter));
  add('sustainment_priority', refs(pack.sustainmentPriorities), sustainment ? 'SUSTAINMENT-PRIORITIES' : 'TARGET-CONTROL-ENVIRONMENT', byId(sustainment ? 'SUSTAINMENT-PRIORITIES' : 'TARGET-CONTROL-ENVIRONMENT'));
  const maturationChapter = sustainment ? 'SUSTAINMENT-OPTIMISATION' : 'TWELVE-MONTH-MATURATION';
  add('maturation_step', pack.maturationSteps.map((step) => step.maturationRef), maturationChapter, byId(maturationChapter));
  return all.filter((item) => item.chapterId && item.sectionId);
}

function crossReferencesFor(pack: NarrativeFactPack, chapters: BlueprintChapter[]): BlueprintNarrativeCrossReference[] {
  if (pack.narrativeMode === 'SUSTAINMENT') return [];
  const findingChapterId = pack.productTier === 'comprehensive' ? 'MATERIAL-FRAUD-RISK-THEMES' : 'PRIORITY-FRAUD-EXPOSURES';
  const home = new Map(pack.findings.map((finding) => [finding.factRef, chapters.find((chapter) => chapter.chapterId === findingChapterId)?.sections.find((section) => section.requiredFacts.includes(finding.factRef))?.sectionId ?? '']));
  const scenarioChapterId = pack.productTier === 'comprehensive' ? 'HOW-EXPOSURE-COULD-MATERIALISE' : 'EXPOSURE-COULD-MATERIALISE';
  const scenarioSection = chapters.find((chapter) => chapter.chapterId === scenarioChapterId)?.sections[0]?.sectionId ?? '';
  const fromChapter = chapters.find((chapter) => chapter.sections.some((section) => section.sectionId === scenarioSection));
  const fromRole = fromChapter?.sections.find((item) => item.sectionId === scenarioSection)?.narrativeRole ?? 'EXPOSURE_ILLUSTRATION';
  return [...home.entries()].filter(([, sectionId]) => Boolean(sectionId) && Boolean(scenarioSection)).slice(0, 8).map(([contentRef]) => ({ contentType: 'finding', contentRef, fromChapterId: fromChapter?.chapterId ?? '', fromSectionId: scenarioSection, narrativeRole: fromRole, referencePurpose: 'Refer back to the earlier finding only to explain how the conditional pathway connects to management response; do not recreate the finding narrative.' }));
}

function narrativeRoleUsage(pack: NarrativeFactPack, chapters: BlueprintChapter[], assignments: BlueprintContentAssignment[], crossReferences: BlueprintNarrativeCrossReference[]): BlueprintNarrativeRoleUsage {
  const ledger: BlueprintNarrativeUsageLedgerEntry[] = [];
  for (const assignment of assignments) {
    const section = chapters.find((chapter) => chapter.chapterId === assignment.chapterId)?.sections.find((item) => item.sectionId === assignment.sectionId);
    ledger.push({ contentType: assignment.contentType, contentRef: assignment.contentRef, narrativeRole: assignment.narrativeRole, chapterId: assignment.chapterId, sectionId: assignment.sectionId, usage: 'primary_home', managementTakeaway: section?.requiredManagementTakeaway ?? '' });
  }
  for (const reference of crossReferences) {
    const section = chapters.find((chapter) => chapter.chapterId === reference.fromChapterId)?.sections.find((item) => item.sectionId === reference.fromSectionId);
    ledger.push({ contentType: reference.contentType, contentRef: reference.contentRef, narrativeRole: reference.narrativeRole, chapterId: reference.fromChapterId, sectionId: reference.fromSectionId, usage: 'cross_reference', managementTakeaway: section?.requiredManagementTakeaway ?? '' });
  }
  for (const fact of pack.facts) {
    const surface = chapters.flatMap((chapter) => chapter.sections.map((section) => ({ chapter, section }))).find(({ section }) => section.requiredFacts.includes(fact.id) || section.claimRefs.includes(fact.id));
    if (surface) ledger.push({ contentType: 'fact', contentRef: fact.id, narrativeRole: surface.section.narrativeRole, chapterId: surface.chapter.chapterId, sectionId: surface.section.sectionId, usage: 'primary_home', managementTakeaway: surface.section.requiredManagementTakeaway });
  }
  const grouped = (contentType: BlueprintContentAssignment['contentType'] | 'fact') => Object.fromEntries([...new Set(ledger.filter((item) => item.contentType === contentType).map((item) => item.contentRef))].sort().map((ref) => [ref, [...new Set(ledger.filter((item) => item.contentType === contentType && item.contentRef === ref).map((item) => item.narrativeRole))]]));
  return { factUsage: grouped('fact'), findingUsage: grouped('finding'), scenarioUsage: grouped('scenario'), controlUsage: grouped('control'), ledger };
}

function pruneAdaptiveStructure(chapters: BlueprintChapter[]): BlueprintChapter[] {
  return chapters
    .map((chapter) => ({ ...chapter, exhibits: chapter.exhibits.filter((item) => item.sourceRefs.length > 0), sections: chapter.sections.filter((item) => item.requiredFacts.length > 0 || item.optionalSubsections.some((subsection) => subsection.requiredFacts.length > 0)) }))
    .filter((chapter) => chapter.sections.length > 0)
    .map((chapter, index) => ({ ...chapter, order: index + 1, sections: chapter.sections.map((item, sectionIndex) => ({ ...item, order: sectionIndex + 1 })) }));
}

function transformationSequence(pack: NarrativeFactPack): BlueprintTransformationStage[] {
  if (pack.narrativeMode === 'SUSTAINMENT') {
    const refsFor = (stage: string) => pack.roadmap.filter((item) => item.phase === stage || item.phaseWindow.toUpperCase().includes(stage)).map((item) => item.factRef);
    return SUSTAINMENT_STAGES.map((stage, index) => ({ stage, narrativeRole: index === 3 ? 'MATURATION' : index === 0 ? 'SUSTAINMENT' : index === 1 ? 'IMPLEMENTATION' : 'EVIDENCE', supported: stage === 'PRESERVE' || refsFor(stage).length > 0 || pack.maturationSteps.some((item) => item.phase === stage), sourceRefs: unique([...refsFor(stage), ...pack.maturationSteps.filter((item) => item.phase === stage).map((item) => item.maturationRef)]), purpose: `${stage[0]}${stage.slice(1).toLowerCase()} the assessed readiness standard through a deliberate sustainment rhythm.` }));
  }
  const refsFor = (stage: string) => [...pack.roadmap.filter((item) => item.phase === stage).map((item) => item.factRef), ...pack.maturationSteps.filter((item) => item.phase === stage).map((item) => item.maturationRef)];
  return REMEDIATION_STAGES.map((stage, index) => ({ stage, narrativeRole: index === 3 ? 'MATURATION' : index === 2 ? 'IMPLEMENTATION' : 'RESPONSE', supported: refsFor(stage).length > 0 || stage === 'STABILISE', sourceRefs: refsFor(stage), purpose: `${stage[0]}${stage.slice(1).toLowerCase()} the recorded response through owned actions, proof and progression.` }));
}

interface SectionSpec {
  suffix: string;
  title: string;
  purpose: string;
  takeaway: string;
  requiredFacts: string[];
  claimRefs?: string[];
  subsections?: ReportBlueprintSubsection[];
  narrativeRole?: NarrativeRole;
}

function reframeSections(chapter: BlueprintChapter, specs: SectionSpec[]): BlueprintChapter {
  const usableSpecs = specs.filter((spec) => spec.requiredFacts.length > 0 || (spec.subsections ?? []).some((item) => item.requiredFacts.length > 0));
  return {
    ...chapter,
    sections: usableSpecs.map((spec, index) => section(
      `${chapter.chapterId}-${spec.suffix}`,
      spec.title,
      spec.purpose,
      spec.takeaway,
      spec.requiredFacts,
      spec.claimRefs ?? spec.requiredFacts,
      spec.subsections ?? [],
      spec.narrativeRole
    )).map((item, index) => ({ ...item, order: index + 1 }))
  };
}

function essentialRemediationHierarchy(pack: NarrativeFactPack, chapters: BlueprintChapter[]): BlueprintChapter[] {
  const byTheme = pack.systemicThemeInputs;
  const byCluster = patternExposureClusters(pack);
  const byScenario = pack.scenarios;
  const byControlFamily = [...new Set(pack.controls.map((control) => control.primarySemanticFamily))];
  const roadmapPeriods = ['30 days', '60 days', '90 days'];
  return chapters.map((chapter) => {
    if (chapter.chapterId === 'EXECUTIVE-ASSESSMENT') {
      // Exhibits carry the domains that materially drive this assessment rather
      // than all ten, so the executive page leads with judgement instead of a
      // recital.
      // Content ownership, not just content.
      //
      // These three sections are three independent provider calls. Authorising
      // all of them to use the same domain evidence asked three writers to
      // interpret the same facts, and two of them converged on the same
      // sentence. Each section now owns one kind of evidence: POSITION owns the
      // domain scorecard, DRIVERS owns the thematic pattern, and TAKEAWAY owns
      // the implication, which it draws from the thesis and the preceding
      // takeaway rather than by reciting evidence a sibling already holds.
      const relevantDomains = materialDomainRefs(pack);
      const executive = reframeSections(chapter, [
        { suffix: 'POSITION', title: 'Overall readiness position', purpose: positionAssertion(pack.domains).purpose, takeaway: positionTakeaway(pack), requiredFacts: [...factIds(pack, 'score'), ...factIds(pack, 'maturity'), ...relevantDomains] },
        { suffix: 'DRIVERS', title: 'What is shaping the readiness position', purpose: 'Explain the connected pattern beneath the score using the assessed themes. Do not restate the domain scorecard, which the opening section owns.', takeaway: 'The report explains the relationships beneath the score rather than reciting every domain.', requiredFacts: byTheme.map((item) => item.factRef) },
        { suffix: 'TAKEAWAY', title: 'What this means for management', purpose: 'State the immediate management implication. Draw it from the position and pattern already established; do not re-present either.', takeaway: chapter.requiredManagementTakeaway, requiredFacts: factIds(pack, 'score') }
      ]);
      return { ...executive, exhibits: executive.exhibits.map((item) => ({ ...item, sourceRefs: relevantDomains })) };
    }
    if (chapter.chapterId === 'WHAT-HOLDS-READINESS-BACK') {
      // One synthesis, not one section per theme. Theme-per-section produced a
      // chapter of repeated mini finding reports rather than a diagnosis.
      const relevantDomains = materialDomainRefs(pack);
      const crossCuttingRefs = pack.findings
        .filter((finding) => CROSS_CUTTING_SEMANTIC_FAMILIES.includes(finding.primarySemanticFamily))
        .map((finding) => finding.factRef);
      const supporting = unique([...byTheme.map((item) => item.factRef), ...crossCuttingRefs, ...relevantDomains]);
      return reframeSections({ ...chapter, narrativeRole: 'DIAGNOSIS', linkedFindingIds: crossCuttingRefs }, [{
        suffix: 'SYSTEMIC-PATTERN',
        title: 'The systemic pattern',
        purpose: 'Synthesise the underlying themes into management-level interpretations of why the position looks as it does, drawing on the material capability relationships rather than restating each theme in turn. These are cautious advisory interpretations of assessed relationships, not independently verified operating facts.',
        takeaway: chapter.requiredManagementTakeaway,
        requiredFacts: supporting,
        claimRefs: supporting,
        narrativeRole: 'DIAGNOSIS'
      }]);
    }
    if (chapter.chapterId === 'PRIORITY-FRAUD-EXPOSURES') {
      // Where a cross-cutting capability is at or below the overall position, it
      // enables every exposure rather than being one, and the takeaway says so.
      const enabling = crossCuttingIsEnablingWeakness(pack);
      const takeaway = enabling
        ? 'This is one connected exposure pattern needing a single owned response, and the cross-cutting governance and risk-identification weakness sits underneath every cluster.'
        : 'This is one connected exposure pattern needing a single owned response, not three separate fixes.';
      return reframeSections({ ...chapter, narrativeRole: 'EXPOSURE', linkedFindingIds: byCluster.flatMap((cluster) => cluster.findingRefs) }, byCluster.map((cluster, index) => ({
        suffix: `CLUSTER-${String(index + 1).padStart(2, '0')}`,
        title: cluster.title,
        purpose: cluster.whyTogether,
        takeaway: clusterTakeaway(cluster),
        requiredFacts: cluster.findingRefs,
        claimRefs: cluster.findingRefs,
        narrativeRole: 'EXPOSURE'
      })));
    }
    if (chapter.chapterId === 'EXPOSURE-COULD-MATERIALISE') {
      return reframeSections({ ...chapter, narrativeRole: 'EXPOSURE_ILLUSTRATION' }, [{ suffix: 'PATHWAYS', title: 'Conditional exposure pathways', purpose: 'Introduce the approved pathways as conditional management tests in natural narrative form rather than as cards.', takeaway: 'These pathways are conditional management tests, not allegations.', requiredFacts: byScenario.map((item) => item.factRef), subsections: byScenario.map((scenario, index) => subsection(`PATHWAY-${String(index + 1).padStart(2, '0')}`, index + 1, scenario.title, 'Describe how the pathway could begin, where the current environment could fail, the warning indicators, immediate containment and longer-term response.', scenarioTakeaway(scenario), [scenario.factRef], [scenario.factRef], 'EXPOSURE_ILLUSTRATION')) }]);
    }
    if (chapter.chapterId === 'TARGET-CONTROL-ENVIRONMENT') return reframeSections(chapter, byControlFamily.map((family, index) => {
      const controls = pack.controls.filter((control) => control.primarySemanticFamily === family);
      const decisions = pack.decisions.filter((decision) => decisionOwnerFamily(pack, byControlFamily, decision) === family);
      return { suffix: `RESPONSE-${String(index + 1).padStart(2, '0')}`, title: customerTitleForFamily(family, 'RESPONSE', pack.narrativeMode), purpose: 'Group target control responses around a coherent fraud-risk problem rather than individual register rows.', takeaway: (() => { const presentation = familyPresentation(family); const target = presentation?.targetState?.replace(/\.$/, ''); return target ? `${target}. That is the completion test for this response.` : `${customerTitleForFamily(family, 'RESPONSE', pack.narrativeMode)} needs a defined objective and evidence of effectiveness.`; })(), requiredFacts: [...controls.map((item) => item.factRef), ...decisions.map((item) => item.factRef)], narrativeRole: 'RESPONSE', subsections: controls.length > 1 ? controls.slice(0, 3).map((control, subIndex) => subsection(`CONTROL-${String(index + 1).padStart(2, '0')}-${String(subIndex + 1).padStart(2, '0')}`, subIndex + 1, 'Target control response', 'Explain how the grouped control response interrupts the relevant exposure.', 'The control design is connected to the exposure and its owner.', [control.factRef], [control.factRef], 'RESPONSE')) : [] };
    }));
    if (chapter.chapterId === 'FIRST-90-DAYS-CONCLUSION') {
      // Stage intent, not bare periods. "By 30 days" told management when but not
      // what the window is for.
      const STAGE_INTENT: Record<string, { label: string; purpose: string; takeaway: string }> = {
        '30 days': { label: 'Stabilise', purpose: 'Stabilise accountability, escalation and reporting, and put proportionate incident and evidence-preservation basics in place.', takeaway: 'An organisation should not wait for a fraud event to decide who protects evidence or how a suspected matter is escalated.' },
        '60 days': { label: 'Establish', purpose: 'Establish the priority preventive controls and the ownership and process changes that support them.', takeaway: 'Priority preventive controls should be defined, owned and evidenced before value or authority can be redirected.' },
        '90 days': { label: 'Operate and review', purpose: 'Operate monitoring, exception review and control learning, with consolidated progress reported to governance.', takeaway: 'The first operating cycle should make coverage, review, learning and escalation visible to management.' }
      };
      return reframeSections(chapter, [
        ...roadmapPeriods.map((period) => {
          const intent = STAGE_INTENT[period];
          return {
            suffix: period.replace(/\s+/g, '-').toUpperCase(),
            title: intent ? `By ${period} — ${intent.label}` : `By ${period}`,
            purpose: intent?.purpose ?? `Sequence the actions targeted for ${period}.`,
            takeaway: intent?.takeaway ?? 'The action has an accountable owner, dependency and proof of completion.',
            requiredFacts: pack.roadmap.filter((item) => item.targetPeriod === period).map((item) => item.factRef),
            narrativeRole: 'IMPLEMENTATION' as NarrativeRole
          };
        }),
        { suffix: 'CONCLUSION', title: 'Management conclusion', purpose: 'Return to the central judgement rather than restating the sequence.', takeaway: chapter.requiredManagementTakeaway, requiredFacts: [...pack.roadmap.map((item) => item.factRef), ...conclusionDomainRefs(pack)], narrativeRole: 'CONCLUSION' as NarrativeRole }
      ]);
    }
    return chapter;
  });
}

function sustainmentEssentialHierarchy(pack: NarrativeFactPack, chapters: BlueprintChapter[]): BlueprintChapter[] {
  return chapters.map((chapter) => {
    if (chapter.chapterId === 'EXECUTIVE-ASSESSMENT') return reframeSections(chapter, [
      { suffix: 'POSITION', title: 'Overall readiness position', purpose: 'State the strong assessed position and its boundary.', takeaway: 'The assessed position is strong and should be preserved.', requiredFacts: [...factIds(pack, 'score'), ...factIds(pack, 'maturity')] },
      { suffix: 'TAKEAWAY', title: 'What management should protect', purpose: 'Set the sustainment question before the supporting standards.', takeaway: chapter.requiredManagementTakeaway, requiredFacts: factIds(pack, 'relative_strength') }
    ]);
    if (chapter.chapterId === 'READINESS-SUPPORTING-STANDARDS') return reframeSections(chapter, pack.relativeStrengths.map((strength, index) => ({ suffix: `STANDARD-${String(index + 1).padStart(2, '0')}`, title: strength.title, purpose: strength.basis, takeaway: standardTakeaway(pack, strength), requiredFacts: [strength.factRef, domainFactRef(pack, strength.domainCode)].filter(Boolean) as string[] })));
    if (chapter.chapterId === 'SUSTAINMENT-PRIORITIES') return reframeSections(chapter, pack.sustainmentPriorities.map((priority, index) => ({ suffix: `PRIORITY-${String(index + 1).padStart(2, '0')}`, title: priority.title, purpose: priority.managementFocus, takeaway: `This is still operating when ${asClause(String(priority.effectivenessIndicator ?? priority.managementFocus ?? priority.title))}.`, requiredFacts: [priority.factRef] })));
    if (chapter.chapterId === 'DETERIORATION-WATCHPOINTS') return reframeSections(chapter, [...new Set(pack.controls.map((control) => control.primarySemanticFamily))].map((family, index) => ({ suffix: `WATCH-${String(index + 1).padStart(2, '0')}`, title: `${customerTitleForFamily(family, 'SUSTAINMENT', pack.narrativeMode)} watchpoint`, purpose: 'Describe supported deterioration triggers without manufacturing a weakness.', takeaway: (() => { const presentation = familyPresentation(family); const interruption = presentation?.interruptionPoint?.replace(/\.$/, ''); return interruption ? `${interruption} is the evidence to watch; its absence is the first sign of drift.` : `${customerTitleForFamily(family, 'SUSTAINMENT', pack.narrativeMode)} depends on a rhythm that would show deterioration early.`; })(), requiredFacts: pack.controls.filter((control) => control.primarySemanticFamily === family).map((control) => control.factRef), narrativeRole: 'EXPOSURE' })));
    if (chapter.chapterId === 'SUSTAINMENT-BLUEPRINT') return reframeSections(chapter, [
      { suffix: 'OWNERSHIP', title: 'Ownership and review rhythm', purpose: 'Set the first sustainment actions that keep accountability current.', takeaway: 'Ownership and cadence remain visible.', requiredFacts: pack.controls.map((item) => item.factRef), narrativeRole: 'SUSTAINMENT' },
      // The roadmap belongs to the closing section. Holding it here as well made
      // both sections argue the same actions.
      { suffix: 'INFORMATION', title: 'Management information and proof', purpose: 'Set the records and indicators that show the strong standard remains current.', takeaway: 'Management information should reveal early deterioration.', requiredFacts: pack.decisions.map((item) => item.factRef), narrativeRole: 'EVIDENCE' },
      { suffix: 'NINETY-DAY', title: 'First 90 days', purpose: 'Close the initial sustainment sequence.', takeaway: chapter.requiredManagementTakeaway, requiredFacts: pack.roadmap.map((item) => item.factRef), narrativeRole: 'IMPLEMENTATION' }
    ]);
    return chapter;
  });
}

/**
 * The fact reference for a domain code.
 *
 * relativeStrengths carries a bare code such as "D1", while the Fact Pack keys
 * domain facts as "DOMAIN-D1". Using the bare code as a claim reference made
 * every sustainment slot plan fail assertNarrativeSlotPlan before a single
 * provider call, because no fact carried that id.
 */
function domainFactRef(pack: NarrativeFactPack, domainCode: string | undefined | null): string | undefined {
  if (!domainCode) return undefined;
  const domain = pack.domains.find((entry) => entry.code === domainCode || entry.factRef === domainCode);
  return domain?.factRef;
}

function comprehensiveHierarchy(pack: NarrativeFactPack, chapters: BlueprintChapter[]): BlueprintChapter[] {
  return chapters.map((chapter) => {
    if (chapter.chapterId === 'EXECUTIVE-ASSESSMENT') return reframeSections(chapter, [
      { suffix: 'POSITION', title: 'Overall readiness position', purpose: 'State the assessed result and its boundary.', takeaway: 'The result is the starting point for the connected management story.', requiredFacts: [...factIds(pack, 'score'), ...factIds(pack, 'maturity')] },
      { suffix: 'PATTERN', title: 'The pattern beneath the score', purpose: 'Preview the cross-cutting themes.', takeaway: 'The report explains concentration rather than repeating the score.', requiredFacts: refs(pack.systemicThemeInputs) },
      { suffix: 'TAKEAWAY', title: 'Executive management takeaway', purpose: 'State what leadership should care about before detail begins.', takeaway: chapter.requiredManagementTakeaway, requiredFacts: refs(pack.systemicThemeInputs) }
    ]);
    if (chapter.chapterId === 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS') return reframeSections(chapter, pack.systemicThemeInputs.map((theme, index) => ({ suffix: `THEME-${String(index + 1).padStart(2, '0')}`, title: theme.title, purpose: theme.whyTogether, takeaway: theme.managementQuestion, requiredFacts: [theme.factRef, ...theme.findingRefs] })));
    if (chapter.chapterId === 'MATERIAL-FRAUD-RISK-THEMES') return reframeSections(chapter, clusterFindings(pack).map((cluster, index) => ({ suffix: `CLUSTER-${String(index + 1).padStart(2, '0')}`, title: cluster.title, purpose: cluster.whyTogether, takeaway: 'The cluster requires connected treatment across owners, controls and oversight.', requiredFacts: cluster.findingRefs, subsections: cluster.findingRefs.length > 1 ? cluster.findingRefs.map((ref, subIndex) => subsection(`FINDING-${String(index + 1).padStart(2, '0')}-${String(subIndex + 1).padStart(2, '0')}`, subIndex + 1, 'Material finding', 'Interpret this finding in the context of the wider theme.', 'The finding is not treated as an isolated score.', [ref], [ref])) : [] })));
    if (chapter.chapterId === 'HOW-EXPOSURE-COULD-MATERIALISE') return reframeSections(chapter, pack.scenarios.map((scenario, index) => ({ suffix: `PATHWAY-${String(index + 1).padStart(2, '0')}`, title: scenario.title, purpose: 'Explain the conditional pathway and the controls that should interrupt it.', takeaway: 'The scenario is a conditional management test, not an allegation.', requiredFacts: [scenario.factRef], subsections: [subsection(`PATHWAY-${String(index + 1).padStart(2, '0')}-MECHANISM`, 1, 'Mechanism and management response', 'Connect the mechanism, warning indicators, containment and long-term response.', 'The pathway informs target control design.', [scenario.factRef], [scenario.factRef])]})));
    if (chapter.chapterId === 'TARGET-CONTROL-ENVIRONMENT') return reframeSections(chapter, [...new Set(pack.controls.map((control) => control.primarySemanticFamily))].map((family, index) => ({ suffix: `FAMILY-${String(index + 1).padStart(2, '0')}`, title: customerTitleForFamily(family, 'TARGET_STATE', pack.narrativeMode), purpose: 'Present the target control environment by coherent control family.', takeaway: 'The target design connects objective, ownership, proof, challenge and effectiveness.', requiredFacts: pack.controls.filter((control) => control.primarySemanticFamily === family).map((control) => control.factRef), narrativeRole: 'TARGET_STATE', subsections: pack.controls.filter((control) => control.primarySemanticFamily === family).slice(0, 3).map((control, subIndex) => subsection(`CONTROL-${String(index + 1).padStart(2, '0')}-${String(subIndex + 1).padStart(2, '0')}`, subIndex + 1, 'Control blueprint', 'Explain how the target control responds to the connected exposure.', 'The control is designed for an owner, population, frequency and proof.', [control.factRef], [control.factRef], 'TARGET_STATE')) })));
    if (chapter.chapterId === 'MANAGEMENT-DECISIONS-REQUIRED') return reframeSections(chapter, pack.decisions.map((decision, index) => ({ suffix: `DECISION-${String(index + 1).padStart(2, '0')}`, title: customerDecisionTitle(decision), purpose: decision.question, takeaway: 'Leadership should choose a route with owner, date and consequence of delay visible.', requiredFacts: [decision.factRef], narrativeRole: 'DECISION', subsections: [subsection(`DECISION-${String(index + 1).padStart(2, '0')}-OPTIONS`, 1, 'Options and trade-offs', 'Show the viable routes, benefits and trade-offs before the recommendation.', 'The decision remains a genuine management choice.', [decision.factRef], [decision.factRef], 'DECISION')]})));
    if (chapter.chapterId === 'IMPLEMENTATION-BLUEPRINT') return reframeSections(chapter, [...new Set(pack.roadmap.map((item) => item.phase))].map((phase, index) => ({ suffix: phase, title: phase[0] + phase.slice(1).toLowerCase(), purpose: 'Sequence the implementation actions, owners, dependencies and proof for this horizon.', takeaway: 'The implementation route makes progress and accountability visible.', requiredFacts: pack.roadmap.filter((item) => item.phase === phase).map((item) => item.factRef), narrativeRole: 'IMPLEMENTATION' })));
    if (chapter.chapterId === 'TWELVE-MONTH-MATURATION') return reframeSections(chapter, [...new Set(pack.maturationSteps.map((step) => step.phase))].map((phase, index) => ({ suffix: phase, title: phase === 'EMBED' ? 'Embed the operating rhythm' : 'Mature and measure the environment', purpose: 'Show how the deterministic maturation step moves the target environment forward.', takeaway: 'Progress is measured through owned outcomes and proof of progress.', requiredFacts: pack.maturationSteps.filter((step) => step.phase === phase).map((item) => item.maturationRef), narrativeRole: 'MATURATION' })));
    return chapter;
  });
}

function remediationEssential(pack: NarrativeFactPack): BlueprintChapter[] {
  const scoreFacts = [...factIds(pack, 'score'), ...factIds(pack, 'maturity'), ...factIds(pack, 'domain'), ...factIds(pack, 'relative_strength')];
  const themes = refs(pack.systemicThemeInputs);
  const findings = refs(pack.findings);
  const scenarios = refs(pack.scenarios);
  const controls = refs(pack.controls);
  const decisions = refs(pack.decisions);
  const roadmap = refs(pack.roadmap);
  return [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'Give one opening assessment of the assessed position, what it means and the assurance boundary.', 'The assessed position, where it concentrates and what it means for the executive must be clear from this chapter alone.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-OPENING', 'Executive assessment', 'State the conclusion once, before interpretation.', 'The assessed result points to a focused management response rather than a recital of domain scores.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SCORE-001', 'score_display', 'EXECUTIVE-ASSESSMENT', 'EXECUTIVE-ASSESSMENT-OPENING', 'Show the recorded score, maturity and exposure position.', scoreFacts, 'Orient the reader to the assessed position.')]}),
    chapter('WHAT-HOLDS-READINESS-BACK', 2, 'What is holding readiness back', 'Connect deterministic themes into a small number of management patterns.', 'Leadership should focus on the connected patterns that create the greatest fraud-risk consequence.', { requiredFacts: themes, claimRefs: themes, section: section('WHAT-HOLDS-READINESS-BACK-SECTION', 'What is holding readiness back', 'Explain the relationships beneath the score, without repeating the executive assessment.', 'The material story is created by linked conditions, not isolated question scores.', themes, themes), exhibits: [exhibit('EXH-THEME-MAP', 'theme_map', 'WHAT-HOLDS-READINESS-BACK', 'WHAT-HOLDS-READINESS-BACK-SECTION', 'Display deterministic finding clusters and their management questions.', themes, 'Explain why the linked themes belong together.')]}),
    chapter('PRIORITY-FRAUD-EXPOSURES', 3, 'Priority fraud exposures', 'Explain the selected material findings and their practical meaning.', 'Each priority exposure needs an owned treatment, not only a description.', { requiredFacts: findings, claimRefs: findings, linkedFindingIds: findings, section: section('PRIORITY-FRAUD-EXPOSURES-SECTION', 'Priority fraud exposures', 'Interpret clustered findings as advisory observations.', 'The priority set identifies where preventive, detective or response discipline needs attention.', findings, findings), exhibits: [exhibit('EXH-FINDING-SUMMARY', 'finding_summary', 'PRIORITY-FRAUD-EXPOSURES', 'PRIORITY-FRAUD-EXPOSURES-SECTION', 'Summarise the selected findings and their linked meaning.', findings, 'Keep the table subordinate to the connected explanation.')] }),
    chapter('EXPOSURE-COULD-MATERIALISE', 4, 'How the exposure could materialise', 'Narrate deterministic conditional scenarios without alleging an event.', 'Scenarios are conditional pathways that help management test prevention, detection and containment.', { requiredFacts: scenarios, claimRefs: scenarios, linkedScenarioIds: scenarios, section: section('EXPOSURE-COULD-MATERIALISE-SECTION', 'How the exposure could materialise', 'Translate linked findings into supported conditional pathways.', 'The pathways are plausible conditions for management testing, not allegations of fraud.', scenarios, scenarios), exhibits: [exhibit('EXH-SCENARIO-PATHWAYS', 'scenario_pathway', 'EXPOSURE-COULD-MATERIALISE', 'EXPOSURE-COULD-MATERIALISE-SECTION', 'Show actor, opportunity, entry point, mechanism, warning and response links.', scenarios, 'Help management see where the control response must interrupt the pathway.')] }),
    chapter('TARGET-CONTROL-ENVIRONMENT', 5, 'What management should change', 'Describe the target control responses, ownership and decisions needed for the priority set.', 'Controls become useful when objective, ownership, proof, challenge and effectiveness are explicit.', { requiredFacts: [...controls, ...decisions], claimRefs: [...controls, ...decisions], linkedControlIds: controls, linkedDecisionIds: decisions, section: section('TARGET-CONTROL-ENVIRONMENT-SECTION', 'What management should change', 'Connect target controls to the exposure they address and the management choice required.', 'Each priority response needs a route, a named owner, proof of completion and an effectiveness measure.', [...controls, ...decisions], [...controls, ...decisions]), exhibits: [exhibit('EXH-CONTROL-RESPONSE', 'control_response', 'TARGET-CONTROL-ENVIRONMENT', 'TARGET-CONTROL-ENVIRONMENT-SECTION', 'Summarise target-state controls without dumping the register.', controls, 'Make ownership and operating expectations visible.')] }),
    chapter('FIRST-90-DAYS-CONCLUSION', 6, 'First 90 days and management conclusion', 'Sequence the first response and close with one useful management conclusion.', 'Within 90 days the organisation should have accountable ownership, priority controls and a repeatable first operating cycle.', { requiredFacts: roadmap, claimRefs: roadmap, linkedRoadmapIds: roadmap, section: section('FIRST-90-DAYS-CONCLUSION-SECTION', 'First 90 days and management conclusion', 'Present one 30/60/90 route and a clear close; do not create a duplicate roadmap chapter.', 'The first operating cycle should make ownership, evidence of completion and management review visible.', roadmap, roadmap), exhibits: [exhibit('EXH-ROADMAP-30-60-90', 'roadmap_30_60_90', 'FIRST-90-DAYS-CONCLUSION', 'FIRST-90-DAYS-CONCLUSION-SECTION', 'Show the deterministic 30/60/90 sequence.', roadmap, 'Translate the response into a manageable first operating cycle.')] })
  ];
}

function sustainmentEssential(pack: NarrativeFactPack): BlueprintChapter[] {
  const scoreFacts = [...factIds(pack, 'score'), ...factIds(pack, 'maturity'), ...factIds(pack, 'domain'), ...factIds(pack, 'relative_strength')];
  const priorities = refs(pack.sustainmentPriorities);
  const controls = refs(pack.controls);
  const decisions = refs(pack.decisions);
  const roadmap = refs(pack.roadmap);
  return [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'State the strong assessed position and what management must preserve.', 'The assessed position is strong; the management question is how to preserve it and detect deterioration early.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-OPENING', 'Executive assessment', 'State the assessed position and assurance boundary once.', 'No material weaknesses are promoted from this recorded sustainment profile.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SUSTAINMENT-SCORE', 'score_display', 'EXECUTIVE-ASSESSMENT', 'EXECUTIVE-ASSESSMENT-OPENING', 'Show the assessed readiness position.', scoreFacts, 'Orient the reader to the strong assessed position.')] }),
    chapter('READINESS-SUPPORTING-STANDARDS', 2, 'What is supporting the result', 'Explain the recorded standards and strengths that support resilience.', 'Current strengths remain valuable when ownership, review and proof are retained.', { requiredFacts: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], claimRefs: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], section: section('READINESS-SUPPORTING-STANDARDS-SECTION', 'What is supporting the result', 'Connect recorded standards to a management sustainment rhythm.', 'The result is supported by standards that require continued ownership and review.', [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')]), exhibits: [exhibit('EXH-SUPPORTING-STANDARDS', 'domain_profile', 'READINESS-SUPPORTING-STANDARDS', 'READINESS-SUPPORTING-STANDARDS-SECTION', 'Show the deterministic strengths and domain pattern.', [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], 'Make resilience drivers visible without inventing weaknesses.')] }),
    chapter('SUSTAINMENT-PRIORITIES', 3, 'Priorities to sustain readiness', 'Set the small number of resilience priorities that protect the assessed standard.', 'Sustainment priorities preserve readiness through ownership, review and early detection.', { requiredFacts: priorities, claimRefs: priorities, section: section('SUSTAINMENT-PRIORITIES-SECTION', 'Priorities to sustain readiness', 'Explain the healthy priorities as operating disciplines.', 'The practices holding the strong assessed standard in place must be named so they can be protected.', priorities, priorities), exhibits: [exhibit('EXH-SUSTAINMENT-SCORECARD', 'sustainment_scorecard', 'SUSTAINMENT-PRIORITIES', 'SUSTAINMENT-PRIORITIES-SECTION', 'Summarise current strong standards, owners, proof and indicators.', priorities, 'Keep sustainment practical and measurable.')] }),
    chapter('DETERIORATION-WATCHPOINTS', 4, 'Where deterioration could emerge', 'Identify only supported change or drift watchpoints.', 'Change-triggered deterioration is caught through the normal review route, not through a new process.', { requiredFacts: [...controls, ...roadmap], claimRefs: [...controls, ...roadmap], linkedControlIds: controls, linkedRoadmapIds: roadmap, section: section('DETERIORATION-WATCHPOINTS-SECTION', 'Where deterioration could emerge', 'Describe supported triggers for early management attention.', 'Early deterioration should be visible through management information and change-triggered review.', [...controls, ...roadmap], [...controls, ...roadmap]) }),
    chapter('SUSTAINMENT-BLUEPRINT', 5, 'What management should protect and strengthen', 'Set the first 90-day sustainment actions, owners, records and indicators.', 'Within 90 days, ownership, review cadence and deterioration information should be current.', { requiredFacts: [...controls, ...decisions, ...roadmap], claimRefs: [...controls, ...decisions, ...roadmap], linkedControlIds: controls, linkedDecisionIds: decisions, linkedRoadmapIds: roadmap, section: section('SUSTAINMENT-BLUEPRINT-SECTION', 'What management should protect and strengthen', 'Sequence the sustainment route without converting strengths into weakness language.', 'A strong control environment stays strong when operating discipline and deterioration signals are explicit.', [...controls, ...decisions, ...roadmap], [...controls, ...decisions, ...roadmap]), exhibits: [exhibit('EXH-SUSTAINMENT-90-DAY', 'roadmap_30_60_90', 'SUSTAINMENT-BLUEPRINT', 'SUSTAINMENT-BLUEPRINT-SECTION', 'Show the deterministic first 90-day sustainment route.', roadmap, 'Make continuity and early drift detection actionable.')] }),
    chapter('MANAGEMENT-CONCLUSION', 6, 'Management conclusion', 'Close with the value of preserving readiness and detecting early drift.', 'The strong standard holds only while it is refreshed after material change.', { requiredFacts: [...priorities, ...roadmap], claimRefs: [...priorities, ...roadmap], linkedRoadmapIds: roadmap, section: section('MANAGEMENT-CONCLUSION-SECTION', 'Management conclusion', 'End with one durable sustainment commitment.', 'The value is sustained readiness and early detection of drift, not a price-based assurance claim.', [...priorities, ...roadmap], [...priorities, ...roadmap]) })
  ];
}

function comprehensiveChapters(pack: NarrativeFactPack): BlueprintChapter[] {
  const sustainment = pack.narrativeMode === 'SUSTAINMENT';
  const scoreFacts = [...factIds(pack, 'score'), ...factIds(pack, 'maturity'), ...factIds(pack, 'domain'), ...factIds(pack, 'relative_strength')];
  const themes = refs(pack.systemicThemeInputs);
  const findings = refs(pack.findings);
  const scenarios = refs(pack.scenarios);
  const controls = refs(pack.controls);
  const decisions = refs(pack.decisions);
  const roadmap = refs(pack.roadmap);
  const maturation = pack.maturationSteps.map((step) => step.maturationRef);
  if (sustainment) {
    return [
      chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'State the strong recorded environment and the assurance boundary.', 'No material weaknesses were identified from the assessment responses; the management task is to preserve the strong profile.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-SECTION', 'Executive assessment', 'State the result once.', 'The assessed result is strong and should be read as a sustainment position, not as independent assurance.', scoreFacts, scoreFacts) }),
      chapter('ANALYTICAL-BASIS', 2, 'Analytical basis', 'Explain the deterministic score shape and recorded standards supporting readiness.', 'The conclusion follows from the assessment responses and the MK scoring method, not independent assurance.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('ANALYTICAL-BASIS-SECTION', 'Analytical basis', 'Explain the basis once without repeating the executive assessment.', 'The analytical basis is transparent and bounded.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SUSTAINMENT-PROFILE', 'domain_profile', 'ANALYTICAL-BASIS', 'ANALYTICAL-BASIS-SECTION', 'Show deterministic readiness strengths and domain pattern.', scoreFacts, 'Make the recorded basis legible.')] }),
      chapter('READINESS-SUPPORTING-STANDARDS', 3, 'Strengths supporting readiness', 'Connect recorded standards to the resilience disciplines that protect them.', 'Current strengths remain valuable when ownership, review and proof are retained.', { requiredFacts: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], claimRefs: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], section: section('READINESS-SUPPORTING-STANDARDS-SECTION', 'Strengths supporting readiness', 'Explain the connected standards behind the strong result.', 'Strength is durable when its operating rhythm remains visible.', [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')]) }),
      chapter('SUSTAINMENT-PRIORITIES', 4, 'Sustainment and resilience priorities', 'Set management priorities for continuity, review and early detection of drift.', 'Priorities preserve readiness through continuity, review and early detection.', { requiredFacts: refs(pack.sustainmentPriorities), claimRefs: refs(pack.sustainmentPriorities), section: section('SUSTAINMENT-PRIORITIES-SECTION', 'Sustainment and resilience priorities', 'Translate strong standards into named management disciplines.', 'Sustainment is an operating rhythm, not a deficiency list.', refs(pack.sustainmentPriorities), refs(pack.sustainmentPriorities)), exhibits: [exhibit('EXH-RESILIENCE-SCORECARD', 'sustainment_scorecard', 'SUSTAINMENT-PRIORITIES', 'SUSTAINMENT-PRIORITIES-SECTION', 'Summarise the resilience priorities.', refs(pack.sustainmentPriorities), 'Show the disciplines that protect readiness.')] }),
      chapter('DETERIORATION-WATCHPOINTS', 5, 'Emerging or deterioration watchpoints', 'Describe only supported conditions that could erode the assessed position after change.', 'Early deterioration should be visible through management information and change-triggered review.', { requiredFacts: [...refs(pack.controls), ...refs(pack.roadmap)], claimRefs: [...refs(pack.controls), ...refs(pack.roadmap)], linkedControlIds: refs(pack.controls), linkedRoadmapIds: refs(pack.roadmap), section: section('DETERIORATION-WATCHPOINTS-SECTION', 'Emerging or deterioration watchpoints', 'Describe supported change-triggered attention points.', 'Watchpoints make the strong position maintainable.', [...refs(pack.controls), ...refs(pack.roadmap)], [...refs(pack.controls), ...refs(pack.roadmap)]) }),
      chapter('TARGET-RESILIENT-CONTROL-ENVIRONMENT', 6, 'Target resilient control environment', 'Describe the strong standard, ownership, proof, trigger and effectiveness indicator.', 'A strong control environment stays strong when operating discipline and deterioration signals are explicit.', { requiredFacts: refs(pack.controls), claimRefs: refs(pack.controls), linkedControlIds: refs(pack.controls), section: section('TARGET-RESILIENT-CONTROL-ENVIRONMENT-SECTION', 'Target resilient control environment', 'Set the resilient control design that preserves current maturity.', 'The target state protects what is already working and makes deterioration visible.', refs(pack.controls), refs(pack.controls)), exhibits: [exhibit('EXH-RESILIENT-CONTROL', 'control_response', 'TARGET-RESILIENT-CONTROL-ENVIRONMENT', 'TARGET-RESILIENT-CONTROL-ENVIRONMENT-SECTION', 'Show owners, proof and effectiveness indicators.', refs(pack.controls), 'Keep the target environment operational.')] }),
      chapter('LEADERSHIP-DECISIONS-TO-PRESERVE', 7, 'Leadership decisions to preserve maturity', 'Set governance, monitoring, ownership and change-trigger decisions with clear trade-offs.', 'Leadership should protect cadence, ownership continuity and management information.', { requiredFacts: refs(pack.decisions), claimRefs: refs(pack.decisions), linkedDecisionIds: refs(pack.decisions), section: section('LEADERSHIP-DECISIONS-TO-PRESERVE-SECTION', 'Leadership decisions to preserve maturity', 'Explain the decisions required to preserve the strong standard.', 'The decisions keep ownership and review routes current.', refs(pack.decisions), refs(pack.decisions)), exhibits: [exhibit('EXH-PRESERVE-DECISIONS', 'decision_options', 'LEADERSHIP-DECISIONS-TO-PRESERVE', 'LEADERSHIP-DECISIONS-TO-PRESERVE-SECTION', 'Show deterministic options and trade-offs.', refs(pack.decisions), 'Make the preservation choices explicit.')] }),
      chapter('SUSTAINMENT-OPTIMISATION', 8, 'Twelve-month sustainment and optimisation blueprint', 'Show progression from PRESERVE through EMBED, MEASURE and OPTIMISE.', 'Progress should preserve the current standard, embed the rhythm, measure drift and optimise after change.', { requiredFacts: [...refs(pack.roadmap), ...maturation], claimRefs: [...refs(pack.roadmap), ...maturation], linkedRoadmapIds: refs(pack.roadmap), section: section('SUSTAINMENT-OPTIMISATION-SECTION', 'Twelve-month sustainment and optimisation blueprint', 'Sequence the four sustainment horizons.', 'The twelve-month route protects resilience while creating room for deliberate optimisation.', [...refs(pack.roadmap), ...maturation], [...refs(pack.roadmap), ...maturation]), exhibits: [exhibit('EXH-MATURATION-PATH', 'maturation_path', 'SUSTAINMENT-OPTIMISATION', 'SUSTAINMENT-OPTIMISATION-SECTION', 'Show the deterministic PRESERVE → EMBED → MEASURE → OPTIMISE route.', [...refs(pack.roadmap), ...maturation], 'Make the future-state sustainment rhythm visible.')] }),
      chapter('MANAGEMENT-CONCLUSION', 9, 'Management conclusion', 'Close with the route for preserving readiness and detecting early deterioration.', 'The value is sustained readiness and early detection of drift, not a price-based assurance claim.', { requiredFacts: [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)], claimRefs: [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)], linkedRoadmapIds: refs(pack.roadmap), section: section('MANAGEMENT-CONCLUSION-SECTION', 'Management conclusion', 'End with one durable management commitment.', 'Readiness holds only where it is revisited after material change.', [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)], [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)]) })
    ];
  }
  return [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'State what the deterministic assessment says and what leadership should care about.', 'The current position, the pattern beneath it and the leadership priorities must be clear from this chapter alone.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-SECTION', 'Executive assessment', 'State the conclusion and boundary once.', 'The score is the starting point for a connected management story.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SCORE-POSITION', 'score_display', 'EXECUTIVE-ASSESSMENT', 'EXECUTIVE-ASSESSMENT-SECTION', 'Show the recorded score, maturity and exposure position.', scoreFacts, 'Orient the reader to the assessed position.')] }),
    chapter('SYSTEMIC-FRAUD-READINESS-DIAGNOSIS', 2, 'Systemic fraud-readiness diagnosis', 'Explain the cross-cutting patterns supplied by the deterministic layer.', 'The material story is created by linked conditions, not isolated question scores.', { requiredFacts: themes, claimRefs: themes, section: section('SYSTEMIC-FRAUD-READINESS-DIAGNOSIS-SECTION', 'Systemic fraud-readiness diagnosis', 'Connect the themes and management questions.', 'The themes explain concentration and interaction.', themes, themes), exhibits: [exhibit('EXH-SYSTEMIC-THEME-MAP', 'theme_map', 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS', 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS-SECTION', 'Display deterministic themes and finding clusters.', themes, 'Show why the themes belong together.')] }),
    chapter('MATERIAL-FRAUD-RISK-THEMES', 3, 'Material fraud-risk themes and findings', 'Interpret material findings in their broader control-system context.', 'The findings require connected treatment across owners, controls and oversight.', { requiredFacts: findings, claimRefs: findings, linkedFindingIds: findings, section: section('MATERIAL-FRAUD-RISK-THEMES-SECTION', 'Material fraud-risk themes and findings', 'Explain the selected findings as advisory observations.', 'The priority set identifies the conditions that deserve management attention.', findings, findings), exhibits: [exhibit('EXH-MATERIAL-FINDINGS', 'finding_summary', 'MATERIAL-FRAUD-RISK-THEMES', 'MATERIAL-FRAUD-RISK-THEMES-SECTION', 'Summarise findings and their deterministic links.', findings, 'Keep register detail subordinate to meaning.')] }),
    chapter('HOW-EXPOSURE-COULD-MATERIALISE', 4, 'How exposure could materialise', 'Narrate approved conditional fraud pathways.', 'Scenario logic should inform prevention, monitoring, containment and response design.', { requiredFacts: scenarios, claimRefs: scenarios, linkedScenarioIds: scenarios, section: section('HOW-EXPOSURE-COULD-MATERIALISE-SECTION', 'How exposure could materialise', 'Explain actor, opportunity, mechanism, warning and consequence.', 'The pathways are conditional management tests, not allegations.', scenarios, scenarios), exhibits: [exhibit('EXH-CONSIDERED-PATHWAYS', 'scenario_pathway', 'HOW-EXPOSURE-COULD-MATERIALISE', 'HOW-EXPOSURE-COULD-MATERIALISE-SECTION', 'Show the deterministic pathways.', scenarios, 'Connect exposure to the target response.')] }),
    chapter('TARGET-CONTROL-ENVIRONMENT', 5, 'Target control environment', 'Explain target-state control blueprints and connected operating design.', 'Controls become useful when objective, ownership, proof, challenge and effectiveness are explicit.', { requiredFacts: controls, claimRefs: controls, linkedControlIds: controls, section: section('TARGET-CONTROL-ENVIRONMENT-SECTION', 'Target control environment', 'Describe target controls without reproducing the full register.', 'The control design should interrupt the linked exposure pathway.', controls, controls), exhibits: [exhibit('EXH-TARGET-CONTROLS', 'control_response', 'TARGET-CONTROL-ENVIRONMENT', 'TARGET-CONTROL-ENVIRONMENT-SECTION', 'Show target control objectives, owners and operating measures.', controls, 'Make the target environment usable.')] }),
    chapter('MANAGEMENT-DECISIONS-REQUIRED', 6, 'Management decisions required', 'Explain the genuine executive choices, options and trade-offs.', 'Leadership must choose a route, owner and target date with the consequence of delay visible.', { requiredFacts: decisions, claimRefs: decisions, linkedDecisionIds: decisions, section: section('MANAGEMENT-DECISIONS-REQUIRED-SECTION', 'Management decisions required', 'Present deterministic options and the decision question.', 'The decision record should be human-readable and tied to the exposure.', decisions, decisions), exhibits: [exhibit('EXH-DECISION-OPTIONS', 'decision_options', 'MANAGEMENT-DECISIONS-REQUIRED', 'MANAGEMENT-DECISIONS-REQUIRED-SECTION', 'Show viable options, benefits and trade-offs.', decisions, 'Support a real management choice.')] }),
    chapter('IMPLEMENTATION-BLUEPRINT', 7, 'Implementation blueprint', 'Sequence the first response and the owners, dependencies and measures.', 'The implementation route must move from ownership and foundations to repeatability and oversight.', { requiredFacts: roadmap, claimRefs: roadmap, linkedRoadmapIds: roadmap, section: section('IMPLEMENTATION-BLUEPRINT-SECTION', 'Implementation blueprint', 'Show the deterministic implementation route.', 'The first operating cycle should make completion and accountability visible.', roadmap, roadmap), exhibits: [exhibit('EXH-IMPLEMENTATION-ROADMAP', 'roadmap_30_60_90', 'IMPLEMENTATION-BLUEPRINT', 'IMPLEMENTATION-BLUEPRINT-SECTION', 'Show 30/60/90 and later phases.', roadmap, 'Translate the response into sequence.')] }),
    chapter('TWELVE-MONTH-MATURATION', 8, 'Twelve-month maturation and optimisation path', 'Show progression through the deterministic maturation steps.', 'Progress should become repeatable, measured and subject to deliberate oversight.', { requiredFacts: maturation, claimRefs: maturation, linkedRoadmapIds: roadmap, section: section('TWELVE-MONTH-MATURATION-SECTION', 'Twelve-month maturation and optimisation path', 'Describe the four implementation horizons without claiming completed remediation.', 'The future state is a managed operating rhythm, not a promise of already-established effectiveness.', maturation, maturation), exhibits: [exhibit('EXH-MATURATION', 'maturation_path', 'TWELVE-MONTH-MATURATION', 'TWELVE-MONTH-MATURATION-SECTION', 'Show the deterministic maturation sequence.', maturation, 'Make 12-month progress measurable.')] }),
    chapter('MANAGEMENT-CONCLUSION', 9, 'Management conclusion', 'Close with the transition required and the next management checkpoint.', 'Success is a control environment management understands, owns, monitors and improves deliberately.', { requiredFacts: [...roadmap, ...maturation], claimRefs: [...roadmap, ...maturation], linkedRoadmapIds: roadmap, section: section('MANAGEMENT-CONCLUSION-SECTION', 'Management conclusion', 'End with a useful management close.', 'The conclusion should identify the next deliberate checkpoint and the route to further support.', [...roadmap, ...maturation], [...roadmap, ...maturation]) })
  ];
}

export function buildReportBlueprint(pack: NarrativeFactPack, plan: NarrativeStoryPlan): ReportBlueprint {
  const baseChapters = pack.productTier === 'essential'
    ? (pack.narrativeMode === 'SUSTAINMENT' ? sustainmentEssential(pack) : remediationEssential(pack))
    : comprehensiveChapters(pack);
  const chapters = pruneAdaptiveStructure((pack.productTier === 'essential'
    ? (pack.narrativeMode === 'SUSTAINMENT' ? sustainmentEssentialHierarchy(pack, baseChapters) : essentialRemediationHierarchy(pack, baseChapters))
    : comprehensiveHierarchy(pack, baseChapters)));
  const findingClusters = patternExposureClusters(pack);
  const contentAssignments = assignmentsFor(pack, chapters);
  const narrativeCrossReferences = crossReferencesFor(pack, chapters);
  const blueprint: ReportBlueprint = {
    schemaVersion: REPORT_BLUEPRINT_SCHEMA_VERSION,
    bibleVersion: '1.1',
    reportTitle: `${pack.organisation.name} — ${tierLabel(pack.productTier)} Fraud Readiness Report`,
    reportTier: pack.productTier,
    narrativeMode: pack.narrativeMode,
    organisation: pack.organisation,
    assessmentPosition: {
      reference: pack.assessment.reference,
      score: pack.assessment.score,
      maturity: pack.assessment.maturity,
      exposureScore: pack.assessment.exposureScore,
      exposureBand: pack.assessment.exposureBand,
      summary: scoreSummary(pack),
      assuranceBoundary: commonAssuranceBoundary()
    },
    executiveStory: pack.narrativeMode === 'SUSTAINMENT'
      ? `Explain the strong assessed position, the standards supporting it, the supported deterioration watchpoints and the sustainment route. ${commonAssuranceBoundary()}`
      : `Lead with the management judgement the assessed position supports rather than a zero-base reading. Explain the systemic pattern, then the practical exposure clusters, conditional pathways, connected management response and sequenced 90-day operating rhythm.${crossCuttingIsEnablingWeakness(pack) ? ' Cross-cutting governance and risk identification are the enabling weakness underneath the exposure clusters.' : ''} ${commonAssuranceBoundary()}`,
    chapters,
    findingClusters,
    contentAssignments,
    narrativeCrossReferences,
    narrativeRoleUsage: narrativeRoleUsage(pack, chapters, contentAssignments, narrativeCrossReferences),
    transformationSequence: transformationSequence(pack),
    deterministicRules: [
      'Chapter titles, order, section identity and management meaning are deterministic and may not be changed by the writer.',
      'The Fact Pack and semantic graph are the only source of material claims, numbers, findings, scenarios, controls, decisions and roadmap actions.',
      'Exhibits are built from deterministic source references; AI may provide bounded interpretation or captions only where permitted.',
      'The writer must produce one complete manuscript voice with no duplicate executive diagnosis, conclusion, roadmap or stitched next-section language.',
      pack.narrativeMode === 'SUSTAINMENT' ? 'Sustainment mode contains no customer-facing findings, risks or automated fraud scenarios.' : 'Remediation and mixed modes retain supported findings and conditional scenarios only.',
      'Each deterministic object has one primary home; later narrative sections may refer back to its implication through explicit cross-reference metadata without duplicating the analytical object.',
      ...(pack.narrativeMode === 'SUSTAINMENT' ? [] : [
        'The diagnosis chapter synthesises the systemic pattern; it is not one repeated mini-finding report per theme.',
        'The exposure chapter contains management clusters grouped by exposure pattern. A cross-cutting capability that enables every exposure is diagnosed, not listed as a further cluster.',
        'Score relationships are used cautiously as advisory interpretation of assessed positions, never as verified operating facts.',
        'The remediation roadmap reads as Stabilise, then Establish, then Operate and review, and the first window carries proportionate incident and evidence-preservation discipline where the assessment supports it.',
        'The executive storyline leads with judgement, uses the strongest assessed capability as a positive foundation, places the assurance boundary once after the judgement, and keeps register mechanics subordinate to management interpretation.'
      ])
    ],
    prohibitedClaims: unique([...pack.prohibitedClaims, 'independent operating effectiveness', 'confirmed fraud event', 'completed remediation'])
  };
  // The plan remains part of the upstream deterministic contract. This assertion catches a
  // future caller that accidentally builds a Blueprint for a different narrative mode/tier.
  if (plan.productTier !== pack.productTier || plan.narrativeMode !== pack.narrativeMode) throw new Error('Report Blueprint requires a matching deterministic Story Plan.');
  return blueprint;
}

export function buildSnapshotReportBlueprint(input: { organisation: { name: string; sectorFacts?: string[] }; assessmentReference: string; score?: number | null; maturity?: string | null; permittedFactRefs?: string[] }): ReportBlueprint {
  const score = input.score ?? null;
  const maturity = input.maturity ?? null;
  const facts = unique(input.permittedFactRefs ?? []);
  const chapters = [
    chapter('SNAPSHOT-POSITION', 1, 'Where the organisation stands', 'State the recorded snapshot position.', 'The reader should understand the assessed position and its boundary.', { narrativeRole: 'JUDGEMENT', requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-POSITION-SECTION', 'Where the organisation stands', 'Give a concise orientation.', 'The snapshot is a limited strategic view.', facts, facts, [], 'JUDGEMENT') }),
    chapter('SNAPSHOT-SHAPE', 2, 'What shapes the result', 'Explain the small number of deterministic drivers available in the snapshot.', 'The result should be read through its supported pattern.', { narrativeRole: 'DIAGNOSIS', requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-SHAPE-SECTION', 'What shapes the result', 'Connect the available drivers.', 'The available facts explain the result at snapshot depth.', facts, facts, [], 'DIAGNOSIS') }),
    chapter('SNAPSHOT-ATTENTION', 3, 'What deserves attention', 'Identify supported areas for management attention without commercial-tier leakage.', 'The reader should know the practical area to explore next.', { narrativeRole: 'EXPOSURE', requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-ATTENTION-SECTION', 'What deserves attention', 'Keep attention focused and bounded.', 'Attention is directional, not a full premium diagnosis.', facts, facts, [], 'EXPOSURE') }),
    chapter('SNAPSHOT-MEANING', 4, 'Practical meaning', 'Translate the snapshot into a concise management implication.', 'The snapshot should be useful without pretending to be a full report.', { narrativeRole: 'RESPONSE', requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-MEANING-SECTION', 'Practical meaning', 'Provide one practical implication.', 'The implication remains within the free snapshot boundary.', facts, facts, [], 'RESPONSE') }),
    chapter('SNAPSHOT-DEEPER-INTERPRETATION', 5, 'Why deeper interpretation is useful', 'Explain why a deeper interpretation may help without exposing premium labels, pricing or fulfilment language.', 'The reader should understand the value of deeper interpretation without commercial leakage.', { narrativeRole: 'CONCLUSION', requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-DEEPER-INTERPRETATION-SECTION', 'Why deeper interpretation is useful', 'Close with a clean next step.', 'Further interpretation can connect patterns to management action while this snapshot remains bounded.', facts, facts, [], 'CONCLUSION') })
  ];
  return {
    schemaVersion: REPORT_BLUEPRINT_SCHEMA_VERSION,
    bibleVersion: '1.1',
    reportTitle: `${input.organisation.name} — Fraud Readiness Snapshot`,
    reportTier: 'snapshot',
    narrativeMode: 'SNAPSHOT',
    organisation: { name: input.organisation.name, sectorFacts: input.organisation.sectorFacts ?? [] },
    assessmentPosition: { reference: input.assessmentReference, score, maturity, exposureScore: null, exposureBand: null, summary: score === null ? 'The snapshot position has no published score.' : `The assessed snapshot position is ${score}/100${maturity ? ` with ${maturity} maturity.` : '.'}`, assuranceBoundary: commonAssuranceBoundary() },
    executiveStory: 'Provide a concise, bounded snapshot of the assessed position and why deeper interpretation may be useful.',
    chapters,
    findingClusters: [],
    contentAssignments: [],
    narrativeCrossReferences: [],
    narrativeRoleUsage: { factUsage: {}, findingUsage: {}, scenarioUsage: {}, controlUsage: {}, ledger: [] },
    transformationSequence: [],
    deterministicRules: ['Snapshot remains compact and free of premium-tier, pricing and fulfilment language.', 'Technical fallback remains Mini → Luna → Terra → Sol when a live writer is separately authorised.'],
    prohibitedClaims: ['Essential', 'Comprehensive', 'R7,500', 'R35,000', 'paid report', 'order', 'payment']
  };
}

function expectedAssignments(pack: NarrativeFactPack): string[] {
  return [
    ...refs(pack.systemicThemeInputs), ...refs(pack.findings), ...refs(pack.scenarios), ...refs(pack.controls),
    ...refs(pack.decisions), ...refs(pack.roadmap), ...refs(pack.sustainmentPriorities), ...pack.maturationSteps.map((step) => step.maturationRef)
  ];
}

export function validateReportBlueprint(blueprint: ReportBlueprint, pack?: NarrativeFactPack): BlueprintValidationResult {
  const issues: string[] = [];
  const duplicateContentRefs: string[] = [];
  const assignments = blueprint.contentAssignments;
  const byRef = new Map<string, BlueprintContentAssignment[]>();
  for (const assignment of assignments) byRef.set(assignment.contentRef, [...(byRef.get(assignment.contentRef) ?? []), assignment]);
  for (const [ref, rows] of byRef) if (rows.length > 1) duplicateContentRefs.push(ref);
  const missingContentRefs = pack ? expectedAssignments(pack).filter((ref) => !byRef.has(ref)) : [];
  const duplicateNarrativeRoles: string[] = [];
  for (let index = 1; index < blueprint.chapters.length; index += 1) {
    if (blueprint.chapters[index - 1]!.narrativeRole === blueprint.chapters[index]!.narrativeRole) duplicateNarrativeRoles.push(`${blueprint.chapters[index - 1]!.chapterId} → ${blueprint.chapters[index]!.chapterId}`);
  }
  const materialRefs = pack ? [...refs(pack.findings), ...refs(pack.systemicThemeInputs), ...refs(pack.scenarios), ...refs(pack.controls), ...refs(pack.decisions), ...refs(pack.roadmap), ...refs(pack.sustainmentPriorities), ...pack.maturationSteps.map((step) => step.maturationRef)] : [];
  const factSurface = new Set(blueprint.chapters.flatMap((chapter) => [chapter.requiredFacts, chapter.claimRefs, ...chapter.sections.flatMap((section) => [section.requiredFacts, section.claimRefs, ...section.optionalSubsections.flatMap((subsection) => [subsection.requiredFacts, subsection.claimRefs])])]).flat());
  const missingMaterialFacts = materialRefs.filter((ref) => !factSurface.has(ref));
  if (duplicateContentRefs.length) issues.push(`Content assigned more than once: ${duplicateContentRefs.join(', ')}`);
  if (missingContentRefs.length) issues.push(`Content has no primary assignment: ${missingContentRefs.join(', ')}`);
  if (duplicateNarrativeRoles.length > 0) issues.push(`Adjacent chapters repeat the same narrative role: ${duplicateNarrativeRoles.join(', ')}`);
  if (missingMaterialFacts.length) issues.push(`Material content is absent from the narrative surface: ${missingMaterialFacts.join(', ')}`);
  const executive = blueprint.chapters.filter((chapter) => /executive assessment|executive diagnosis/i.test(chapter.title)).map((chapter) => chapter.chapterId);
  const roadmap = blueprint.chapters.filter((chapter) => chapter.narrativeRole === 'IMPLEMENTATION' || chapter.narrativeRole === 'MATURATION').map((chapter) => chapter.chapterId);
  const duplicateExecutiveMovements = executive.length > 1 ? executive : [];
  const duplicateRoadmapMovements = roadmap.length > 1 ? roadmap : [];
  if (duplicateExecutiveMovements.length) issues.push('Blueprint contains duplicate executive movements.');
  if (duplicateRoadmapMovements.length > 1 && blueprint.reportTier === 'essential') issues.push('Essential Blueprint contains duplicate roadmap movements.');
  if (blueprint.chapters.filter((chapter) => chapter.narrativeRole === 'IMPLEMENTATION').length > 1 || blueprint.chapters.filter((chapter) => chapter.narrativeRole === 'MATURATION').length > 1) issues.push('Blueprint contains duplicate implementation or maturation movements.');
  const chapterIds = blueprint.chapters.map((chapter) => chapter.chapterId);
  if (new Set(chapterIds).size !== chapterIds.length) issues.push('Chapter IDs must be unique.');
  if (blueprint.chapters.some((chapter, index) => chapter.order !== index + 1)) issues.push('Chapter ordering is not contiguous.');
  if (blueprint.chapters.some((chapter) => chapter.sections.length === 0 || chapter.sections.some((section) => !section.title || !section.purpose || !section.requiredManagementTakeaway || !NARRATIVE_ROLES.includes(section.narrativeRole) || section.optionalSubsections.some((subsection) => !subsection.title || !subsection.purpose || !subsection.requiredManagementTakeaway || !NARRATIVE_ROLES.includes(subsection.narrativeRole))))) issues.push('Every chapter requires a meaningful deterministic section and subsection contract.');
  if (blueprint.chapters.some((chapter) => !NARRATIVE_ROLES.includes(chapter.narrativeRole))) issues.push('Every chapter requires an explicit narrative role.');
  if (blueprint.contentAssignments.some((assignment) => !NARRATIVE_ROLES.includes(assignment.narrativeRole))) issues.push('Every content assignment requires an explicit narrative role.');
  if (blueprint.reportTier === 'comprehensive' && blueprint.narrativeMode !== 'SUSTAINMENT' && blueprint.transformationSequence.filter((stage) => stage.supported).map((stage) => stage.stage).join(' → ') !== 'STABILISE → ESTABLISH → EMBED → MATURE') issues.push('Comprehensive remediation Blueprint must expose the full STABILISE → ESTABLISH → EMBED → MATURE progression.');
  if (blueprint.narrativeMode === 'SUSTAINMENT' && blueprint.transformationSequence.map((stage) => stage.stage).join(' → ') !== 'PRESERVE → EMBED → MEASURE → OPTIMISE') issues.push('Sustainment Blueprint must expose the PRESERVE → EMBED → MEASURE → OPTIMISE progression.');
  if (blueprint.narrativeMode === 'SUSTAINMENT' && (blueprint.findingClusters.length > 0 || blueprint.chapters.some((chapter) => chapter.linkedFindingIds.length || chapter.linkedScenarioIds.length))) issues.push('Sustainment Blueprint may not contain finding or scenario content.');
  if (blueprint.reportTier === 'snapshot') {
    const customerSurface = [
      blueprint.reportTitle,
      blueprint.executiveStory,
      blueprint.assessmentPosition.summary,
      blueprint.assessmentPosition.assuranceBoundary,
      ...blueprint.chapters.flatMap((chapter) => [chapter.title, chapter.purpose, chapter.requiredManagementTakeaway, ...chapter.sections.flatMap((section) => [section.title, section.purpose, section.requiredManagementTakeaway])])
    ].join(' ');
    if (/essential|comprehensive|R\s*7,500|R\s*35,000|paid report|order|payment/i.test(customerSurface)) issues.push('Snapshot Blueprint contains paid-product leakage.');
  }
  return { ok: issues.length === 0, duplicateContentRefs, missingContentRefs, duplicateExecutiveMovements, duplicateRoadmapMovements, duplicateNarrativeRoles, missingMaterialFacts, issues };
}

export function assertReportBlueprint(blueprint: ReportBlueprint, pack?: NarrativeFactPack): void {
  const result = validateReportBlueprint(blueprint, pack);
  if (!result.ok) throw new Error(`Report Blueprint validation failed: ${result.issues.join(' | ')}`);
}

export function estimateTokenRange(value: unknown): ContextTokenRange {
  const chars = JSON.stringify(value).length;
  return { minimum: Math.ceil(chars / 4.2), maximum: Math.ceil(chars / 3.2), basis: `JSON character count ${chars}; deterministic planning estimate only, no provider call.` };
}

function partitionFor(blueprint: ReportBlueprint): WholeManuscriptPartition[] {
  const chapters = blueprint.chapters;
  if (chapters.length <= 1) return [{ partitionId: 'PART-01', chapterIds: chapters.map((chapter) => chapter.chapterId), purpose: 'Complete report', preservesSequence: true, requiredContext: 'complete-blueprint-and-prior-narrative-state' }];
  const midpoint = Math.ceil(chapters.length / 2);
  return [
    { partitionId: 'PART-01', chapterIds: chapters.slice(0, midpoint).map((chapter) => chapter.chapterId), purpose: 'Executive assessment through interpretation', preservesSequence: true, requiredContext: 'complete-blueprint-and-prior-narrative-state' },
    { partitionId: 'PART-02', chapterIds: chapters.slice(midpoint).map((chapter) => chapter.chapterId), purpose: 'Exposure, management response and conclusion', preservesSequence: true, requiredContext: 'complete-blueprint-and-prior-narrative-state' }
  ];
}

export function buildWholeManuscriptContext(pack: NarrativeFactPack, blueprint: ReportBlueprint): WholeManuscriptWriterContext {
  assertReportBlueprint(blueprint, pack);
  const payload = { blueprint, permittedDeterministicFacts: pack.facts, boundaries: { assurance: commonAssuranceBoundary(), prohibitedClaims: blueprint.prohibitedClaims, sourceOfTruth: 'Deterministic Fact Pack and Report Blueprint only.' } };
  const projectedInputTokens = estimateTokenRange(payload);
  const outputBudget = deriveWholeManuscriptOutputBudget(blueprint);
  const outputWords = outputBudget.expectedWordRange;
  const projectedOutputTokens: ContextTokenRange = { minimum: outputWords.minimum, maximum: outputWords.maximum, basis: 'Approved manuscript word envelope used as a conservative output-token planning range.' };
  const approvedInputTokenLimit = WHOLE_MANUSCRIPT_APPROVED_INPUT_TOKENS;
  const singleCallFeasible = projectedInputTokens.maximum <= approvedInputTokenLimit && outputBudget.hardOutputTokenLimit <= WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS;
  return {
    schemaVersion: WHOLE_MANUSCRIPT_CONTEXT_SCHEMA_VERSION,
    architecture: 'whole-manuscript',
    reportBlueprint: blueprint,
    permittedDeterministicFacts: pack.facts,
    boundaries: { assurance: commonAssuranceBoundary(), customerLanguage: ['advisory', 'specific', 'conditional where scenario-based', 'plain-language management communication'], prohibitedClaims: blueprint.prohibitedClaims, sourceOfTruth: 'Deterministic Fact Pack and Report Blueprint only.' },
    style: { voice: 'Senior MK advisory voice: clear, commercially useful, specific, calm and connected.', continuity: ['one authorial voice', 'no repeated executive diagnosis', 'no duplicate conclusion', 'no next-section stitching', 'no register dump as narrative'] },
    projectedInputTokens,
    projectedOutputTokens,
    outputBudget,
    approvedInputTokenLimit,
    singleCallFeasible,
    partitionPlan: singleCallFeasible ? [] : partitionFor(blueprint),
    partitioningRule: `One complete-manuscript call is default. Partition only when projected input (${projectedInputTokens.maximum}) exceeds the safe input ceiling (${approvedInputTokenLimit} = ${WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS} context − ${WHOLE_MANUSCRIPT_EXPECTED_OUTPUT_RESERVE_TOKENS} expected output reserve − ${WHOLE_MANUSCRIPT_OPERATING_MARGIN_TOKENS} operating margin), or the bounded output exceeds the active model maximum (${WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS}).`
  };
}

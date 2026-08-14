import type {
  BlueprintContentAssignment,
  BlueprintChapter,
  NarrativeRole,
  ReportBlueprint,
  ReportBlueprintSection,
  ReportBlueprintSubsection
} from './report-blueprint';
import type { NarrativeFact, NarrativeFactPack } from './fact-pack';

export const BOUNDED_SECTION_ENGINE_SCHEMA_VERSION = 'mk-reporting-bible-1.1-bounded-section-engine-v1';
export const BOUNDED_SECTION_PROMPT_VERSION = 'mk-reporting-bible-1.1-bounded-section-prompt-v1';
export const BOUNDED_SECTION_ENGINE_ARCHITECTURE = 'bounded-section-v1' as const;
import { analyseMechanicalLanguage, analyseSlotMechanicalLanguage, type MechanicalLanguageReport } from './mechanical-language';

export const MAX_SECTION_REPAIR_CALLS = 2;
export const MAX_TECHNICAL_FORMAT_RETRIES_PER_SLOT = 1;
// Two passes, not one. A mechanical-language pass rewrites prose, which can
// disturb a different global check (the 30/60/90 sequence was lost this way),
// so the compiler needs one further bounded opportunity to settle. Still
// strictly bounded, and every pass repairs only the slots that own the defect.
export const MAX_GLOBAL_REPAIR_PASSES = 2;

export interface ReportThesisContrast {
  contrastId: string;
  stronger: { title: string; score: number; claimRefs: string[] };
  weaker: { title: string; score: number; claimRefs: string[] };
  interpretation: string;
}

export interface ReportThesis {
  schemaVersion: typeof BOUNDED_SECTION_ENGINE_SCHEMA_VERSION;
  organisationName: string;
  assessmentReference: string;
  tier: NarrativeFactPack['productTier'];
  overallPosition: {
    score: number | null;
    maturity: string | null;
    exposureBand: string | null;
  };
  centralJudgement: string;
  strongestFoundations: Array<{ title: string; score: number; claimRefs: string[] }>;
  weakestCapabilities: Array<{ title: string; score: number; claimRefs: string[] }>;
  materialContrasts: ReportThesisContrast[];
  systemicDiagnosis: string[];
  priorityExposureClusters: string[];
  managementPriority: string;
  transformationLogic: string[];
  assuranceBoundary: string;
}

export interface NarrativeRequiredInsight {
  requirementId: string;
  instruction: string;
  supportingClaimRefs: string[];
}

export interface NarrativeAuthorisedFact {
  id: string;
  kind: string;
  value: unknown;
  sourceRefs: string[];
}

export interface NarrativeSlot {
  slotId: string;
  chapterId: string;
  sectionIds: string[];
  subsectionIds: string[];
  narrativeRole: NarrativeRole;
  title: string;
  order: number;
  purpose: string;
  readerQuestion: string;
  requiredManagementTakeaway: string;
  primaryContentRefs: string[];
  permittedCrossReferenceRefs: string[];
  permittedClaimRefs: string[];
  requiredInsights: NarrativeRequiredInsight[];
  forbiddenTopics: string[];
  contentOwnedElsewhere: string[];
  precedingContext: string;
  followingPurpose: string;
  wordBudget: { targetWords: number; minimumWords: number; maximumWords: number };
  characterBudget: { targetCharacters: number; maximumCharacters: number };
  authorisedFacts: NarrativeAuthorisedFact[];
  outputContract: string;
}

export interface NarrativeSlotPlan {
  schemaVersion: typeof BOUNDED_SECTION_ENGINE_SCHEMA_VERSION;
  architecture: typeof BOUNDED_SECTION_ENGINE_ARCHITECTURE;
  reportThesis: ReportThesis;
  slots: NarrativeSlot[];
  reportWordEnvelope: { minimumWords: number; maximumWords: number };
}

export interface NarrativeSectionContract {
  contractVersion: typeof BOUNDED_SECTION_ENGINE_SCHEMA_VERSION;
  slotId: string;
  tier: NarrativeFactPack['productTier'];
  organisationName: string;
  assessmentReference: string;
  reportThesis: ReportThesis;
  narrativeRole: NarrativeRole;
  title: string;
  purpose: string;
  readerQuestion: string;
  requiredManagementTakeaway: string;
  requiredInsights: NarrativeRequiredInsight[];
  primaryContentRefs: string[];
  permittedCrossReferenceRefs: string[];
  permittedClaimRefs: string[];
  contentOwnedElsewhere: string[];
  forbiddenTopics: string[];
  prohibitedClaims: string[];
  style: {
    audience: string;
    tone: string;
    expectedDepth: string;
    continuityInstruction: string;
    antiMechanicalRules: string[];
  };
  fit: {
    targetWords: number;
    minimumWords: number;
    maximumWords: number;
    targetCharacters: number;
    maximumCharacters: number;
  };
  context: {
    previousApprovedTakeaway: string;
    nextSlotPurpose: string;
  };
  authorisedFacts: NarrativeAuthorisedFact[];
  outputContract: string;
}

export interface NarrativeSlotResult {
  contractVersion: typeof BOUNDED_SECTION_ENGINE_SCHEMA_VERSION;
  slotId: string;
  narrative: string;
  managementImplication: string;
  usedClaimRefs: string[];
  requirementCoverage: Array<{ requirementId: string; supportingExcerpt: string }>;
}

export interface BoundedProviderMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  generationMode: 'ai' | 'test-injected';
  generatedAt: string;
  generationId?: string;
  responseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  providerCostRaw?: string | number;
  finishReason?: string;
  callType: 'INITIAL' | 'REPAIR' | 'QUALITY_ESCALATION' | 'TECHNICAL_FORMAT_RETRY';
  repairNumber: number;
}

export interface BoundedProviderCall {
  result: NarrativeSlotResult;
  metadata: BoundedProviderMetadata;
  prompt?: string;
}

export type BoundedTechnicalFailureKind = 'TECHNICAL_PROVIDER_FAILURE' | 'TECHNICAL_OUTPUT_PARSE_FAILURE';

export interface BoundedTechnicalFailureDiagnostics {
  errorName: string;
  errorMessage?: string;
  cause?: string;
  responseMetadata?: unknown;
  finishReason?: string;
  usage?: unknown;
  rawText?: string;
  schemaIssuePaths?: string[];
  schemaIssueCodes?: string[];
}

export class BoundedTechnicalFailure extends Error {
  readonly kind: BoundedTechnicalFailureKind;
  readonly diagnostics: BoundedTechnicalFailureDiagnostics;

  constructor(input: { kind: BoundedTechnicalFailureKind; diagnostics: BoundedTechnicalFailureDiagnostics }) {
    super(input.kind);
    this.name = input.kind;
    this.kind = input.kind;
    this.diagnostics = input.diagnostics;
  }
}

export interface BoundedTechnicalFailureRecord extends BoundedTechnicalFailureDiagnostics {
  kind: BoundedTechnicalFailureKind;
  slotId: string;
  provider: string;
  model: string;
  callType: BoundedProviderMetadata['callType'];
  repairNumber: number;
}

export interface BoundedSectionProvider {
  readonly model: string;
  readonly provider: string;
  generate(contract: NarrativeSectionContract): Promise<BoundedProviderCall>;
  repair(contract: NarrativeSectionContract, rejected: { result: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport }, repairNumber: number): Promise<BoundedProviderCall>;
  qualityEscalate?(contract: NarrativeSectionContract, rejected: { result: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport }): Promise<BoundedProviderCall>;
  // Serialization-only recovery. Corrects the JSON envelope of an otherwise
  // usable answer. It may never reconsider the analytical content, and it is
  // budgeted separately from semantic repair and quality escalation.
  formatRetry?(contract: NarrativeSectionContract, rejected: { rawText: string; schemaIssuePaths?: string[]; schemaIssueCodes?: string[] }, originCallType: BoundedProviderMetadata['callType']): Promise<BoundedProviderCall>;
}

export type NarrativeSlotIssueCode =
  | 'STRUCTURE_FAILURE'
  | 'PROVENANCE_VIOLATION'
  | 'HARD_TRUTH_FAILURE'
  | 'ASSURANCE_LANGUAGE'
  | 'CONTENT_OWNERSHIP_VIOLATION'
  | 'MISSING_REQUIRED_INSIGHT'
  | 'DUPLICATE_REQUIRED_INSIGHT'
  | 'FIT_OVERFLOW'
  | 'FIT_UNDERFLOW'
  | 'MECHANICAL_LANGUAGE'
  | 'MECHANICAL_LANGUAGE_SATURATION'
  | 'STYLE_FAILURE';

export interface NarrativeSlotValidationIssue {
  code: NarrativeSlotIssueCode;
  message: string;
  path?: string;
}

export interface NarrativeSlotValidationReport {
  ok: boolean;
  slotId: string;
  wordCount: number;
  characterCount: number;
  issues: NarrativeSlotValidationIssue[];
  usedClaimRefs: string[];
  requirementIds: string[];
}

export interface ApprovedNarrativeSlot {
  contract: NarrativeSectionContract;
  result: NarrativeSlotResult;
  validation: NarrativeSlotValidationReport;
  metadata: BoundedProviderMetadata;
  calls: BoundedProviderCall[];
}

export interface BoundedGenerationAccounting {
  reportGenerationId: string;
  architecture: typeof BOUNDED_SECTION_ENGINE_ARCHITECTURE;
  modelBySlot: Record<string, string>;
  calls: BoundedProviderMetadata[];
  initialCalls: number;
  repairCalls: number;
  qualityEscalations: number;
  technicalProviderFailureCount: number;
  technicalOutputParseFailureCount: number;
  technicalFormatRetries: number;
  technicalFormatRetriesRecovered: number;
  technicalFailures: BoundedTechnicalFailureRecord[];
  failedSlots: string[];
  totalTokens: number;
  totalProviderCostMicros: number;
}

export class BoundedGenerationFailure extends Error {
  readonly slotId: string;
  readonly accounting: BoundedGenerationAccounting;
  readonly technicalFailure?: BoundedTechnicalFailureRecord;

  constructor(input: { slotId: string; accounting: BoundedGenerationAccounting; message: string; technicalFailure?: BoundedTechnicalFailureRecord }) {
    super(input.message);
    this.name = 'BoundedGenerationFailure';
    this.slotId = input.slotId;
    this.accounting = input.accounting;
    this.technicalFailure = input.technicalFailure;
  }
}

export interface BoundedCompiledManuscript {
  markdown: string;
  approvedSlots: ApprovedNarrativeSlot[];
  validation: BoundedManuscriptValidationReport;
  accounting: BoundedGenerationAccounting;
}

export interface BoundedManuscriptValidationReport {
  ok: boolean;
  totalWordCount: number;
  totalCharacterCount: number;
  expectedSlotIds: string[];
  compiledSlotIds: string[];
  missingPrimaryContentRefs: string[];
  duplicatePrimaryContentRefs: string[];
  issues: string[];
}

interface SlotUnit {
  chapter: BlueprintChapter;
  sections: ReportBlueprintSection[];
  subsection?: ReportBlueprintSubsection;
  narrativeRole: NarrativeRole;
  title: string;
  groupingKey: string;
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const words = (value: string): number => value.trim() ? value.trim().split(/\s+/).length : 0;
const characters = (value: string): number => value.trim().length;
const text = (value: unknown): string => String(value ?? '').trim();

function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'SLOT';
}

function numericTokens(value: unknown): string[] {
  return JSON.stringify(value).match(/\b\d+(?:\.\d+)?\b/g) ?? [];
}

function factRefForDomain(pack: NarrativeFactPack, code: string): string | undefined {
  return pack.domains.find((domain) => domain.code === code)?.factRef;
}

function domainScore(pack: NarrativeFactPack, matcher: RegExp): { title: string; score: number; claimRefs: string[] } | undefined {
  const domain = pack.domains.find((item) => matcher.test(`${item.name} ${item.code}`) && finite(item.score));
  if (!domain || domain.score === null) return undefined;
  return { title: domain.name, score: domain.score, claimRefs: [domain.factRef] };
}

function buildContrasts(pack: NarrativeFactPack): ReportThesisContrast[] {
  const contrasts: ReportThesisContrast[] = [];
  const reporting = domainScore(pack, /whistleblowing|reporting culture/i);
  const detection = domainScore(pack, /fraud detection capability/i);
  const thirdParty = domainScore(pack, /third-party|supply chain/i);
  const identification = domainScore(pack, /fraud risk identification/i);
  const improvement = domainScore(pack, /continuous improvement|fraud risk monitoring/i);
  const operational = domainScore(pack, /operational fraud controls/i);
  const add = (id: string, stronger: typeof reporting, weaker: typeof reporting, interpretation: string) => {
    if (!stronger || !weaker || stronger.score <= weaker.score) return;
    contrasts.push({ contrastId: id, stronger, weaker, interpretation });
  };
  add('REPORTING-VS-DETECTION', reporting, detection, 'The pattern suggests that receiving concerns is currently stronger than systematic detection.');
  add('REPORTING-VS-IDENTIFICATION', reporting, identification, 'The pattern suggests that reporting strength is not yet matched by equally mature fraud-risk identification.');
  add('REPORTING-VS-CONTINUOUS-IMPROVEMENT', reporting, improvement, 'The pattern suggests that concerns are not yet consistently converted into repeatable learning.');
  add('OPERATIONAL-VS-IDENTIFICATION', operational, identification, 'The pattern suggests pockets of operational control are not yet connected by equally mature risk identification.');
  add('OPERATIONAL-VS-DETECTION', operational, detection, 'The pattern suggests operational controls are not yet connected by an equally mature detection system.');
  add('OPERATIONAL-VS-THIRD-PARTY', operational, thirdParty, 'The pattern suggests operational control does not yet extend consistently into third-party and supply-chain exposure.');
  return contrasts;
}

function buildThesisCentralJudgement(pack: NarrativeFactPack, contrasts: ReportThesisContrast[]): string {
  const score = pack.assessment.score === null ? 'not scored' : `${pack.assessment.score} / 100`;
  const maturity = pack.assessment.maturity ?? 'not assigned';
  const lead = contrasts[0]
    ? `${contrasts[0].stronger.title} scores ${contrasts[0].stronger.score}, against ${contrasts[0].weaker.title} at ${contrasts[0].weaker.score}.`
    : 'The domain pattern should be read through the strongest and weakest supported capabilities rather than through isolated question scores.';
  return `The assessment places the organisation at ${score} with ${maturity} maturity. ${lead} The management task is to connect the supported foundations to prevention, detection, containment and learning through owned action. This interprets the relationships in the assessment; it is not an independently verified operating fact.`;
}

export function buildReportThesis(pack: NarrativeFactPack, blueprint: ReportBlueprint): ReportThesis {
  const ranked = pack.domains.filter((domain) => finite(domain.score)).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const strongestFoundations = ranked.slice(0, 3).map((domain) => ({ title: domain.name, score: domain.score as number, claimRefs: [domain.factRef] }));
  const weakestCapabilities = ranked.slice(-3).reverse().map((domain) => ({ title: domain.name, score: domain.score as number, claimRefs: [domain.factRef] }));
  const materialContrasts = buildContrasts(pack);
  const diagnosis = pack.systemicThemeInputs.map((theme) => theme.title);
  const clusters = blueprint.findingClusters.map((cluster) => cluster.title);
  const managementPriority = blueprint.chapters.find((chapter) => chapter.narrativeRole === 'JUDGEMENT')?.requiredManagementTakeaway
    ?? blueprint.executiveStory;
  return {
    schemaVersion: BOUNDED_SECTION_ENGINE_SCHEMA_VERSION,
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    tier: pack.productTier,
    overallPosition: { score: pack.assessment.score, maturity: pack.assessment.maturity, exposureBand: pack.assessment.exposureBand },
    centralJudgement: buildThesisCentralJudgement(pack, materialContrasts),
    strongestFoundations,
    weakestCapabilities,
    materialContrasts,
    systemicDiagnosis: diagnosis,
    priorityExposureClusters: clusters,
    managementPriority,
    transformationLogic: blueprint.transformationSequence.filter((stage) => stage.supported).map((stage) => `${stage.stage}: ${stage.purpose}`),
    assuranceBoundary: blueprint.assessmentPosition.assuranceBoundary
  };
}

function chapterSections(blueprint: ReportBlueprint): SlotUnit[] {
  const units: SlotUnit[] = [];
  for (const chapter of [...blueprint.chapters].sort((a, b) => a.order - b.order)) {
    for (const section of [...chapter.sections].sort((a, b) => a.order - b.order)) {
      const subsections = section.optionalSubsections;
      if (section.narrativeRole === 'EXPOSURE_ILLUSTRATION' && subsections.length > 0) {
        for (const subsection of [...subsections].sort((a, b) => a.order - b.order)) {
          units.push({ chapter, sections: [section], subsection, narrativeRole: subsection.narrativeRole, title: subsection.title, groupingKey: `${chapter.chapterId}:SCENARIO:${subsection.subsectionId}` });
        }
        continue;
      }
      units.push({ chapter, sections: [section], narrativeRole: section.narrativeRole, title: section.title, groupingKey: `${chapter.chapterId}:${section.narrativeRole}` });
    }
  }
  return units;
}

function groupUnits(units: SlotUnit[]): SlotUnit[] {
  const grouped: SlotUnit[] = [];
  const groupedByKey = new Map<string, SlotUnit>();
  for (const unit of units) {
    const shouldGroup = unit.narrativeRole === 'JUDGEMENT'
      || unit.narrativeRole === 'DIAGNOSIS'
      || unit.narrativeRole === 'RESPONSE'
      || unit.narrativeRole === 'IMPLEMENTATION';
    if (!shouldGroup || unit.subsection) {
      grouped.push(unit);
      continue;
    }
    const key = unit.groupingKey;
    const existing = groupedByKey.get(key);
    if (existing) {
      existing.sections.push(...unit.sections);
      existing.title = existing.title === existing.chapter.title ? existing.title : existing.chapter.title;
    } else {
      const copy = { ...unit, sections: [...unit.sections], title: unit.narrativeRole === 'JUDGEMENT' || unit.narrativeRole === 'DIAGNOSIS' || unit.narrativeRole === 'RESPONSE' || unit.narrativeRole === 'IMPLEMENTATION' ? unit.chapter.title : unit.title };
      groupedByKey.set(key, copy);
      grouped.push(copy);
    }
  }
  return grouped;
}

function assignmentsForUnit(blueprint: ReportBlueprint, unit: SlotUnit): BlueprintContentAssignment[] {
  const sectionIds = new Set(unit.sections.map((section) => section.sectionId));
  const subsectionRefs = unit.subsection ? new Set([...unit.subsection.claimRefs, ...unit.subsection.requiredFacts]) : null;
  return blueprint.contentAssignments.filter((assignment) => sectionIds.has(assignment.sectionId) && (!subsectionRefs || subsectionRefs.has(assignment.contentRef)));
}

function crossRefsForUnit(blueprint: ReportBlueprint, unit: SlotUnit): string[] {
  const sectionIds = new Set(unit.sections.map((section) => section.sectionId));
  return blueprint.narrativeCrossReferences.filter((item) => sectionIds.has(item.fromSectionId)).map((item) => item.contentRef);
}

function insight(id: string, instruction: string, refs: string[]): NarrativeRequiredInsight {
  return { requirementId: id, instruction, supportingClaimRefs: unique(refs) };
}

function roleInsights(unit: SlotUnit, slotId: string, pack: NarrativeFactPack, blueprint: ReportBlueprint, primaryRefs: string[], permittedRefs: string[]): NarrativeRequiredInsight[] {
  const facts = unique(unit.sections.flatMap((section) => [...section.requiredFacts, ...section.claimRefs, ...section.optionalSubsections.flatMap((subsection) => [...subsection.requiredFacts, ...subsection.claimRefs])]).filter((ref) => permittedRefs.includes(ref)));
  const scoreRefs = pack.facts.filter((fact) => fact.kind === 'score' || fact.kind === 'maturity').map((fact) => fact.id).filter((ref) => permittedRefs.includes(ref));
  const refs = unique([...primaryRefs, ...facts]);
  const base = `${slotId}-INSIGHT`;
  switch (unit.narrativeRole) {
    case 'JUDGEMENT': return [
      insight(`${base}-POSITION`, 'State the score and maturity and explain why the position matters to management.', scoreRefs.length ? scoreRefs : refs),
      insight(`${base}-INTERPRETATION`, 'Interpret one material relationship in the deterministic pattern rather than listing domain scores.', refs),
      insight(`${base}-IMPLICATION`, 'State the immediate management implication before the report moves into detail.', refs)
    ];
    case 'DIAGNOSIS': return [
      insight(`${base}-SYSTEMIC`, 'Connect the underlying themes into a systemic management pattern.', refs),
      insight(`${base}-STRENGTH`, 'Use a supported strength where it helps explain the diagnosis.', refs),
      insight(`${base}-BOUNDARY`, 'Distinguish interpretation of assessment relationships from independent operating verification.', refs)
    ];
    case 'EXPOSURE': return [
      insight(`${base}-VALUE`, 'Explain the value, capability or management outcome at risk.', refs),
      insight(`${base}-WEAKNESS`, 'Explain the relevant deterministic control or capability weakness without inventing an event.', refs),
      insight(`${base}-PRIORITY`, 'Explain the management consequence and why this cluster is a priority.', refs)
    ];
    case 'EXPOSURE_ILLUSTRATION': return [
      insight(`${base}-ENTRY`, 'Describe the conditional entry point and control break.', refs),
      insight(`${base}-CONSEQUENCE`, 'Describe the potential consequence and warning indicators conditionally.', refs),
      insight(`${base}-RESPONSE`, 'Include immediate containment and longer-term response without alleging that the event occurred.', refs)
    ];
    case 'RESPONSE': return [
      insight(`${base}-OBJECTIVE`, 'State the management objective and broad target state.', refs),
      insight(`${base}-OWNER`, 'Name the accountable executive from the authorised deterministic material.', refs),
      insight(`${base}-DEPENDENCY`, 'Name the critical dependency or proof discipline without dumping the register.', refs)
    ];
    case 'IMPLEMENTATION': return [
      insight(`${base}-SEQUENCE`, 'Sequence the approved implementation route for 30 days, 60 days and 90 days.', refs),
      insight(`${base}-STABILISE`, 'Include basic incident intake and evidence-preservation discipline in the first 30 days where the Blueprint requires it.', refs),
      insight(`${base}-REVIEW`, 'Explain how management will operate and review the first cycle.', refs)
    ];
    case 'CONCLUSION': return [
      insight(`${base}-JUDGEMENT`, 'Return to the central management judgement after considering the report.', refs),
      insight(`${base}-CHECKPOINT`, 'State the next management checkpoint without recapping every recommendation.', refs)
    ];
    case 'DECISION': return [
      insight(`${base}-CHOICE`, 'State the management question and the available decision route.', refs),
      insight(`${base}-TRADEOFF`, 'Explain the relevant benefits, trade-offs and consequence of delay.', refs)
    ];
    case 'EVIDENCE': return [
      insight(`${base}-MEANING`, 'Explain what the deterministic evidence or finding pattern means for management.', refs),
      insight(`${base}-BOUNDARY`, 'Keep supporting evidence distinct from independent assurance.', refs)
    ];
    default: return [insight(`${base}-MEANING`, 'Explain the deterministic management meaning of this bounded slot.', refs)];
  }
}

function budgetFor(role: NarrativeRole, tier: NarrativeFactPack['productTier']): NarrativeSlot['wordBudget'] {
  const base: Record<NarrativeRole, [number, number, number]> = {
    JUDGEMENT: [340, 300, 430],
    DIAGNOSIS: [390, 340, 500],
    EVIDENCE: [220, 170, 280],
    EXPOSURE: [210, 170, 260],
    EXPOSURE_ILLUSTRATION: [210, 170, 260],
    TARGET_STATE: [260, 200, 340],
    RESPONSE: [360, 280, 520],
    DECISION: [240, 180, 320],
    IMPLEMENTATION: [390, 320, 500],
    MATURATION: [260, 200, 340],
    SUSTAINMENT: [240, 180, 320],
    CONCLUSION: [220, 180, 280]
  };
  const [target, minimum, maximum] = base[role];
  const scale = tier === 'comprehensive' ? 1.12 : 1;
  return { targetWords: Math.round(target * scale), minimumWords: Math.round(minimum * scale), maximumWords: Math.round(maximum * scale) };
}

function readerQuestion(role: NarrativeRole): string {
  const values: Record<NarrativeRole, string> = {
    JUDGEMENT: "What is management's central fraud-readiness position and why does it matter?",
    DIAGNOSIS: 'Why does the organisation have this readiness position?',
    EVIDENCE: 'What does the deterministic evidence pattern mean for management?',
    EXPOSURE: 'Where could the diagnosed weakness translate into material practical exposure?',
    EXPOSURE_ILLUSTRATION: 'How could this exposure plausibly materialise?',
    TARGET_STATE: 'What target state would interrupt the supported exposure?',
    RESPONSE: 'What materially needs to change?',
    DECISION: 'What management choice is required?',
    IMPLEMENTATION: 'What happens first and in what sequence?',
    MATURATION: 'How should the target state mature over time?',
    SUSTAINMENT: 'What must remain true to preserve readiness?',
    CONCLUSION: 'What is the central management judgement after considering the whole report?'
  };
  return values[role];
}

function sectionPurpose(unit: SlotUnit): string {
  return unit.sections.map((section) => section.purpose).concat(unit.subsection ? [unit.subsection.purpose] : []).filter(Boolean).join(' ');
}

function sectionTakeaway(unit: SlotUnit): string {
  return unit.sections.map((section) => section.requiredManagementTakeaway).concat(unit.subsection ? [unit.subsection.requiredManagementTakeaway] : []).filter(Boolean).join(' ');
}

function buildSlot(unit: SlotUnit, order: number, pack: NarrativeFactPack, blueprint: ReportBlueprint, thesis: ReportThesis, allAssignments: BlueprintContentAssignment[]): NarrativeSlot {
  const rawSlotId = `SLOT-${String(order).padStart(2, '0')}-${slug(unit.title)}`;
  const assignments = assignmentsForUnit(blueprint, unit);
  const primaryContentRefs = unique(assignments.map((assignment) => assignment.contentRef));
  const sectionRefs = unique(unit.sections.flatMap((section) => [...section.requiredFacts, ...section.claimRefs, ...section.optionalSubsections.flatMap((subsection) => [...subsection.requiredFacts, ...subsection.claimRefs])]).concat(unit.subsection ? [...unit.subsection.requiredFacts, ...unit.subsection.claimRefs] : []));
  const materialAssignmentRefs = new Set(allAssignments.map((assignment) => assignment.contentRef));
  const permittedCrossReferenceRefs = unique([
    ...crossRefsForUnit(blueprint, unit),
    ...sectionRefs.filter((ref) => materialAssignmentRefs.has(ref) && !primaryContentRefs.includes(ref))
  ].filter((ref) => !primaryContentRefs.includes(ref)));
  const permittedClaimRefs = unique([...sectionRefs, ...primaryContentRefs, ...permittedCrossReferenceRefs]);
  const ownedElsewhere = unique(allAssignments.map((assignment) => assignment.contentRef).filter((ref) => !primaryContentRefs.includes(ref)));
  const budget = budgetFor(unit.narrativeRole, pack.productTier);
  const requiredInsights = roleInsights(unit, rawSlotId, pack, blueprint, primaryContentRefs, permittedClaimRefs);
  const authorisedFacts = pack.facts.filter((fact) => permittedClaimRefs.includes(fact.id)).map((fact) => ({ id: fact.id, kind: fact.kind, value: fact.value, sourceRefs: fact.sourceRefs }));
  return {
    slotId: rawSlotId,
    chapterId: unit.chapter.chapterId,
    sectionIds: unique(unit.sections.map((section) => section.sectionId)),
    subsectionIds: unit.subsection ? [unit.subsection.subsectionId] : [],
    narrativeRole: unit.narrativeRole,
    title: unit.title,
    order,
    purpose: sectionPurpose(unit),
    readerQuestion: readerQuestion(unit.narrativeRole),
    requiredManagementTakeaway: sectionTakeaway(unit),
    primaryContentRefs,
    permittedCrossReferenceRefs,
    permittedClaimRefs,
    requiredInsights,
    forbiddenTopics: ownedElsewhere.length ? [`Do not re-explain material owned by another slot: ${ownedElsewhere.join(', ')}.`] : [],
    contentOwnedElsewhere: ownedElsewhere,
    precedingContext: '',
    followingPurpose: '',
    wordBudget: budget,
    characterBudget: { targetCharacters: Math.round(budget.targetWords * 6.5), maximumCharacters: Math.round(budget.maximumWords * 7.2) },
    authorisedFacts,
    outputContract: 'Return NarrativeSlotResult JSON only. The application owns headings, order, provenance authority and compilation.'
  };
}

export function buildNarrativeSlotPlan(pack: NarrativeFactPack, blueprint: ReportBlueprint, thesis = buildReportThesis(pack, blueprint)): NarrativeSlotPlan {
  const units = groupUnits(chapterSections(blueprint));
  const allAssignments = blueprint.contentAssignments;
  const slots = units.map((unit, index) => buildSlot(unit, index + 1, pack, blueprint, thesis, allAssignments));
  for (let index = 0; index < slots.length; index += 1) {
    slots[index]!.precedingContext = index === 0 ? 'This is the opening bounded narrative slot.' : slots[index - 1]!.requiredManagementTakeaway;
    slots[index]!.followingPurpose = index === slots.length - 1 ? 'Close the report with the central management judgement.' : slots[index + 1]!.purpose;
  }
  return {
    schemaVersion: BOUNDED_SECTION_ENGINE_SCHEMA_VERSION,
    architecture: BOUNDED_SECTION_ENGINE_ARCHITECTURE,
    reportThesis: thesis,
    slots,
    // Derived from the plan it governs, not a constant.
    //
    // A fixed 2,700-3,200 envelope assumed an eleven-slot remediation plan.
    // Sustainment and mixed assessments plan fourteen slots, whose per-slot
    // targets already sum past 3,200, so every such report failed a global check
    // that contradicted the per-slot budgets the same engine had just set. The
    // envelope is now the sum of those budgets, which makes the aggregate check
    // consistent with its parts by construction.
    reportWordEnvelope: {
      minimumWords: slots.reduce((sum, slot) => sum + slot.wordBudget.minimumWords, 0),
      maximumWords: slots.reduce((sum, slot) => sum + slot.wordBudget.maximumWords, 0)
    }
  };
}

export function assertNarrativeSlotPlan(plan: NarrativeSlotPlan, pack: NarrativeFactPack, blueprint: ReportBlueprint): void {
  if (plan.architecture !== BOUNDED_SECTION_ENGINE_ARCHITECTURE) throw new Error('Narrative Slot Plan has the wrong architecture.');
  if (!plan.slots.length) throw new Error('Narrative Slot Plan requires at least one slot.');
  const ids = plan.slots.map((slot) => slot.slotId);
  if (new Set(ids).size !== ids.length) throw new Error('Narrative Slot Plan slot IDs must be unique.');
  if (plan.slots.some((slot, index) => slot.order !== index + 1)) throw new Error('Narrative Slot Plan ordering must be contiguous.');
  const factRefs = new Set(pack.facts.map((fact) => fact.id));
  for (const slot of plan.slots) {
    if (slot.permittedClaimRefs.some((ref) => !factRefs.has(ref))) throw new Error(`Slot ${slot.slotId} contains an unauthorised claim reference.`);
    if (slot.primaryContentRefs.some((ref) => !slot.permittedClaimRefs.includes(ref))) throw new Error(`Slot ${slot.slotId} primary content is outside its permitted claim set.`);
    if (slot.requiredInsights.some((item) => item.supportingClaimRefs.some((ref) => !slot.permittedClaimRefs.includes(ref)))) throw new Error(`Slot ${slot.slotId} has an insight outside its permitted claim set.`);
  }
  const assignmentRefs = blueprint.contentAssignments.map((assignment) => assignment.contentRef);
  const slotPrimaryRefs = plan.slots.flatMap((slot) => slot.primaryContentRefs);
  if (new Set(slotPrimaryRefs).size !== slotPrimaryRefs.length) throw new Error('Narrative Slot Plan assigns primary content to more than one slot.');
  const missing = assignmentRefs.filter((ref) => !slotPrimaryRefs.includes(ref));
  if (missing.length) throw new Error(`Narrative Slot Plan has unowned primary content: ${missing.join(', ')}`);
  if (pack.organisation.name === 'Rivonia Health Logistics (Pty) Ltd' && pack.productTier === 'essential' && blueprint.findingClusters.length !== 3) {
    throw new Error(`Rivonia Essential requires exactly three priority exposure clusters; received ${blueprint.findingClusters.length}.`);
  }
}

export function buildNarrativeSectionContract(slot: NarrativeSlot, pack: NarrativeFactPack, thesis: ReportThesis): NarrativeSectionContract {
  return {
    contractVersion: BOUNDED_SECTION_ENGINE_SCHEMA_VERSION,
    slotId: slot.slotId,
    tier: pack.productTier,
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    reportThesis: thesis,
    narrativeRole: slot.narrativeRole,
    title: slot.title,
    purpose: slot.purpose,
    readerQuestion: slot.readerQuestion,
    requiredManagementTakeaway: slot.requiredManagementTakeaway,
    requiredInsights: slot.requiredInsights,
    primaryContentRefs: slot.primaryContentRefs,
    permittedCrossReferenceRefs: slot.permittedCrossReferenceRefs,
    permittedClaimRefs: slot.permittedClaimRefs,
    contentOwnedElsewhere: slot.contentOwnedElsewhere,
    forbiddenTopics: slot.forbiddenTopics,
    prohibitedClaims: blueprintProhibitedClaims(pack),
    style: {
      audience: 'Senior management and the board',
      tone: 'clear, calm, specific, commercially useful and conditional where scenario-based',
      expectedDepth: `${slot.wordBudget.targetWords} words of advisory narrative; explain meaning rather than reciting register fields`,
      continuityInstruction: `Advance one connected report. Previous approved takeaway: ${slot.precedingContext}. Next slot purpose: ${slot.followingPurpose}`,
      antiMechanicalRules: ['No raw database IDs or machine enums in customer prose.', 'No questionnaire language.', 'No report/register independent-assurance claims.', 'Do not repeat content owned elsewhere.', 'Do not use bullets unless the slot contract explicitly requires them.']
    },
    fit: { ...slot.wordBudget, targetCharacters: slot.characterBudget.targetCharacters, maximumCharacters: slot.characterBudget.maximumCharacters },
    context: { previousApprovedTakeaway: slot.precedingContext, nextSlotPurpose: slot.followingPurpose },
    authorisedFacts: slot.authorisedFacts,
    outputContract: slot.outputContract
  };
}

function blueprintProhibitedClaims(pack: NarrativeFactPack): string[] {
  return unique([...pack.prohibitedClaims, 'independent verification by MK', 'confirmed fraud event', 'completed remediation', 'assured operating effectiveness']);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return count;
    count += 1;
    from = index + needle.length;
  }
}

function customerText(result: NarrativeSlotResult): string {
  return [result.narrative, result.managementImplication].map(text).join('\n');
}

function rawIdTokens(value: string): string[] {
  return value.match(/\b[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)+\b/g) ?? [];
}

const MATURITY_TERMS = ['Reactive', 'Developing', 'Structured', 'Strategic'];
const MATURITY_CONTEXT = /\b(maturity|maturities|band|banding|rated|rating|assessed as|positioned at|level)\b/i;

/**
 * Hard truth: the narrative may not assert a maturity band other than the
 * authoritative one.
 *
 * Every maturity term is also ordinary advisory English — "a developing
 * exposure", "a structured approach", "a strategic priority". Matching them
 * case-insensitively made the control unwinnable, so it fires only where the
 * term is genuinely used as a label: capitalised mid-sentence, or in any case
 * within a short window of explicit maturity framing.
 */
export function usesForeignMaturityLabel(value: string, authoritativeMaturity: string): boolean {
  return MATURITY_TERMS.filter((term) => term !== authoritativeMaturity).some((term) => {
    // Capitalised mid-sentence reads as a proper-noun band label.
    const capitalised = new RegExp(`(?<![.!?]\\s)(?<!^)\\b${term}\\b`, 'g');
    for (const match of value.matchAll(capitalised)) {
      if (match[0] === term) return true;
    }
    // Any casing, but sitting beside explicit maturity framing.
    const anyCase = new RegExp(`\\b${term}\\b`, 'gi');
    for (const match of value.matchAll(anyCase)) {
      const from = Math.max(0, match.index - 60);
      const window = value.slice(from, match.index + term.length + 60);
      if (MATURITY_CONTEXT.test(window)) return true;
    }
    return false;
  });
}

function validateHardTruth(value: string, contract: NarrativeSectionContract): string[] {
  const issues: string[] = [];
  const allowed = new Set(numericTokens({ facts: contract.authorisedFacts, thesis: contract.reportThesis, fit: contract.fit, requiredInsights: contract.requiredInsights }));
  const numbers = numericTokens(value);
  const unexpected = numbers.filter((token) => !allowed.has(token));
  if (unexpected.length) issues.push(`Unsupported numeric claims: ${unique(unexpected).join(', ')}.`);
  const maturity = contract.reportThesis.overallPosition.maturity;
  if (maturity && usesForeignMaturityLabel(value, maturity)) issues.push(`Narrative introduces maturity term other than ${maturity}.`);
  return issues;
}

function validateAssurance(value: string): string[] {
  const patterns = [
    /(?:MK|the assessment|this report|the report|the review(?:er)?)\s+(?:has\s+)?(?:independently\s+)?(?:verified|validated|tested|confirmed|assured)/i,
    /evidence\s+(?:has\s+been\s+)?(?:independently\s+)?(?:verified|validated|confirmed)/i,
    /operating effectiveness\s+(?:has\s+been\s+)?(?:verified|validated|confirmed|assured)/i,
    /no fraud occurred|fraud did not occur/i
  ];
  return patterns.filter((pattern) => pattern.test(value)).map((pattern) => `Assurance boundary violation: ${pattern}.`);
}

export function validateNarrativeSlotResult(result: NarrativeSlotResult, contract: NarrativeSectionContract): NarrativeSlotValidationReport {
  const issues: NarrativeSlotValidationIssue[] = [];
  const combined = customerText(result);
  const resultRecord = result as unknown as Record<string, unknown>;
  if (result.contractVersion !== BOUNDED_SECTION_ENGINE_SCHEMA_VERSION || result.slotId !== contract.slotId) issues.push({ code: 'STRUCTURE_FAILURE', message: 'Result contract version or slot identity does not match the deterministic contract.' });
  if (!text(result.narrative) || !text(result.managementImplication)) issues.push({ code: 'STRUCTURE_FAILURE', message: 'Narrative and managementImplication are required.' });
  if (!Array.isArray(result.usedClaimRefs) || !Array.isArray(result.requirementCoverage)) issues.push({ code: 'STRUCTURE_FAILURE', message: 'usedClaimRefs and requirementCoverage are required arrays.' });
  const permitted = new Set(contract.permittedClaimRefs);
  const unknownRefs = (result.usedClaimRefs ?? []).filter((ref) => !permitted.has(ref));
  if (unknownRefs.length) issues.push({ code: 'PROVENANCE_VIOLATION', message: `Claim reference(s) are not authorised for this slot: ${unique(unknownRefs).join(', ')}.` });
  const ownedElsewhere = new Set(contract.contentOwnedElsewhere);
  const crossRefs = new Set(contract.permittedCrossReferenceRefs);
  const ownedViolations = (result.usedClaimRefs ?? []).filter((ref) => ownedElsewhere.has(ref) && !crossRefs.has(ref));
  if (ownedViolations.length) issues.push({ code: 'CONTENT_OWNERSHIP_VIOLATION', message: `Primary content owned by another slot was re-explained: ${unique(ownedViolations).join(', ')}.` });
  const requiredIds = contract.requiredInsights.map((item) => item.requirementId);
  const coverage = result.requirementCoverage ?? [];
  const coverageIds = coverage.map((item) => item.requirementId);
  const missingIds = requiredIds.filter((id) => !coverageIds.includes(id));
  const duplicateIds = coverageIds.filter((id, index) => coverageIds.indexOf(id) !== index);
  const unknownIds = coverageIds.filter((id) => !requiredIds.includes(id));
  if (missingIds.length) issues.push({ code: 'MISSING_REQUIRED_INSIGHT', message: `Required insight coverage is missing: ${missingIds.join(', ')}.` });
  if (duplicateIds.length || unknownIds.length) issues.push({ code: 'DUPLICATE_REQUIRED_INSIGHT', message: `Requirement coverage must contain each contract requirement exactly once; duplicate/unknown IDs: ${unique([...duplicateIds, ...unknownIds]).join(', ')}.` });
  for (const item of coverage) {
    const excerpt = text(item.supportingExcerpt);
    if (!requiredIds.includes(item.requirementId)) continue;
    if (!excerpt || countOccurrences(text(result.narrative), excerpt) !== 1) issues.push({ code: 'MISSING_REQUIRED_INSIGHT', message: `Supporting excerpt for ${item.requirementId} must occur exactly once in narrative.` });
  }
  const hardTruthIssues = validateHardTruth(combined, contract);
  if (hardTruthIssues.length) issues.push({ code: 'HARD_TRUTH_FAILURE', message: hardTruthIssues.join(' ') });
  const assuranceIssues = validateAssurance(combined);
  if (assuranceIssues.length) issues.push({ code: 'ASSURANCE_LANGUAGE', message: assuranceIssues.join(' ') });
  const rawIds = rawIdTokens(combined);
  if (rawIds.length) issues.push({ code: 'STYLE_FAILURE', message: `Customer prose contains machine artefact(s): ${unique(rawIds).join(', ')}.` });
  if (/^\s*[-*]\s+/m.test(text(result.narrative))) issues.push({ code: 'STYLE_FAILURE', message: 'Customer prose contains bullets where the bounded contract requires prose.' });
  if (/(?:did you|which option should|select one|questionnaire)/i.test(combined)) issues.push({ code: 'STYLE_FAILURE', message: 'Questionnaire language is not permitted in customer prose.' });
  for (const finding of analyseSlotMechanicalLanguage(contract.slotId, combined)) {
    issues.push({ code: 'MECHANICAL_LANGUAGE', message: `"${finding.family}" language used ${finding.count} time(s) against a per-section allowance of ${finding.allowance}. ${finding.guidance}` });
  }
  const wordCount = words(`${result.narrative} ${result.managementImplication}`);
  const characterCount = characters(`${result.narrative}\n${result.managementImplication}`);
  if (wordCount > contract.fit.maximumWords) issues.push({ code: 'FIT_OVERFLOW', message: `Maximum ${contract.fit.maximumWords} words; received ${wordCount}. Reduce by at least ${wordCount - contract.fit.maximumWords} words.` });
  if (wordCount < contract.fit.minimumWords) issues.push({ code: 'FIT_UNDERFLOW', message: `Minimum ${contract.fit.minimumWords} words; received ${wordCount}. Add at least ${contract.fit.minimumWords - wordCount} words while preserving required insights.` });
  if (characterCount > contract.fit.maximumCharacters) issues.push({ code: 'FIT_OVERFLOW', message: `Maximum ${contract.fit.maximumCharacters} characters; received ${characterCount}.` });
  return { ok: issues.length === 0, slotId: contract.slotId, wordCount, characterCount, issues, usedClaimRefs: [...(result.usedClaimRefs ?? [])], requirementIds: coverageIds };
}

function sentences(value: string): string[] {
  return value.split(/(?<=[.!?])\s+/).map((item) => item.trim().toLowerCase()).filter((item) => words(item) >= 8);
}

/**
 * The slot that should give ground when a sentence appears in more than one
 * approved slot. The first occurrence keeps it, because the earlier slot is the
 * primary home under the content-ownership model; the later slot repeats it.
 */
function normaliseHeading(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function laterOwnerOfSentence(approvedSlots: ApprovedNarrativeSlot[], sentence: string): string | undefined {
  const owners = approvedSlots.filter((slot) => sentences([slot.result.narrative, slot.result.managementImplication].join('\n')).includes(sentence));
  return owners.length > 1 ? owners[owners.length - 1]!.contract.slotId : undefined;
}

/**
 * Maps a failed global manuscript check back to the single slot that should be
 * repaired for it. Returns nothing where the defect is structural and no slot
 * rewrite can fix it.
 */
export function globalRepairTargets(plan: NarrativeSlotPlan, approvedSlots: ApprovedNarrativeSlot[], compiled: BoundedCompiledManuscript): Array<{ slotId: string; reason: string }> {
  const targets: Array<{ slotId: string; reason: string }> = [];
  for (const issue of compiled.validation.issues) {
    const envelope = issue.match(/Report-level narrative envelope is (\d+)-(\d+) words; received (\d+)\./);
    if (envelope) {
      const maximum = Number(envelope[2]);
      const received = Number(envelope[3]);
      if (received > maximum) {
        // Take the reduction from the longest approved slot, which has the most
        // room to give without losing a required insight.
        const longest = [...approvedSlots].sort((a, b) => words(b.result.narrative) - words(a.result.narrative))[0];
        if (longest) targets.push({ slotId: longest.contract.slotId, reason: `The compiled report is ${received - maximum} words over its ${maximum}-word envelope. Reduce this section by at least ${received - maximum + 20} words without dropping any required insight.` });
      }
      continue;
    }
    if (issue.startsWith('MECHANICAL_LANGUAGE_SATURATION:')) {
      const mechanical = analyseMechanicalLanguage(approvedSlots.map((slot) => ({ slotId: slot.contract.slotId, prose: [slot.result.narrative, slot.result.managementImplication].join('\n') })));
      for (const target of mechanical.repairTargets) targets.push(target);
      continue;
    }
    if (issue.includes('does not preserve the 30/60/90 implementation sequence')) {
      // The implementation slot owns the sequence, and a mechanical-language
      // rewrite of that slot can drop it. Without a target this threw instead of
      // repairing, so the run ended on a defect the engine could have corrected.
      const owner = approvedSlots.find((slot) => slot.contract.narrativeRole === 'IMPLEMENTATION');
      if (owner) targets.push({ slotId: owner.contract.slotId, reason: 'This section must state the 30-day, 60-day and 90-day sequence explicitly, using those day markers, because the compiled report is checked for that progression. Keep every fact, owner and action unchanged and restore the missing markers.' });
      continue;
    }
    if (issue.includes('does not contain incident/evidence-preservation meaning')) {
      const owner = approvedSlots.find((slot) => slot.contract.narrativeRole === 'IMPLEMENTATION')
        ?? approvedSlots.find((slot) => slot.contract.narrativeRole === 'RESPONSE');
      if (owner) targets.push({ slotId: owner.contract.slotId, reason: 'This section must refer to preserving evidence or handling a suspected incident, because the compiled report is checked for that meaning. Keep every fact and action unchanged and restore the reference.' });
      continue;
    }
    if (issue.startsWith('Repeated sentence overlap detected:')) {
      const repeated = issue.slice('Repeated sentence overlap detected:'.length).split(' | ').map((entry) => entry.trim()).filter(Boolean);
      for (const sentence of repeated) {
        const owner = laterOwnerOfSentence(approvedSlots, sentence);
        if (owner) targets.push({ slotId: owner, reason: `This sentence already appears in an earlier approved section and must not be repeated here: "${sentence}" Express the point differently or omit it; the earlier section owns it.` });
      }
      continue;
    }
  }
  const seen = new Set<string>();
  return targets.filter((target) => (seen.has(target.slotId) ? false : (seen.add(target.slotId), true)));
}

export function compileApprovedNarrativeSlots(plan: NarrativeSlotPlan, blueprint: ReportBlueprint, approvedSlots: ApprovedNarrativeSlot[], accounting: BoundedGenerationAccounting): BoundedCompiledManuscript {
  const expected = plan.slots.map((slot) => slot.slotId);
  const compiled = approvedSlots.map((approved) => approved.contract.slotId);
  const issues: string[] = [];
  if (compiled.join('|') !== expected.join('|')) issues.push('Approved slots are not compiled in deterministic plan order.');
  if (new Set(compiled).size !== compiled.length) issues.push('Compiled manuscript contains a duplicate slot.');
  const primaryRefs = blueprint.contentAssignments.map((assignment) => assignment.contentRef);
  const usedPrimary = approvedSlots.flatMap((slot) => slot.contract.primaryContentRefs);
  const missingPrimaryContentRefs = primaryRefs.filter((ref) => !usedPrimary.includes(ref));
  const duplicatePrimaryContentRefs = unique(usedPrimary.filter((ref, index) => usedPrimary.indexOf(ref) !== index));
  if (missingPrimaryContentRefs.length) issues.push(`Primary content is missing from compilation: ${missingPrimaryContentRefs.join(', ')}.`);
  if (duplicatePrimaryContentRefs.length) issues.push(`Primary content appears in more than one compiled slot: ${duplicatePrimaryContentRefs.join(', ')}.`);
  const headings: string[] = [];
  const blocks: string[] = [];
  let currentChapter = '';
  let openedChapterTitle = '';
  for (const approved of approvedSlots) {
    const slot = plan.slots.find((item) => item.slotId === approved.contract.slotId);
    if (!slot) { issues.push(`Approved slot ${approved.contract.slotId} is not in the plan.`); continue; }
    if (slot.chapterId !== currentChapter) {
      const chapter = blueprint.chapters.find((item) => item.chapterId === slot.chapterId);
      if (!chapter) { issues.push(`Slot ${slot.slotId} references an unknown chapter.`); continue; }
      blocks.push(`# ${chapter.title}`);
      currentChapter = slot.chapterId;
      openedChapterTitle = chapter.title;
    }
    headings.push(slot.title);
    // A chapter that opens with a slot of the same display text would otherwise
    // render "# Executive assessment" immediately above "## Executive
    // assessment". The chapter heading already carries it, so suppress the
    // duplicate rather than losing the hierarchy elsewhere.
    const duplicatesChapterHeading = normaliseHeading(slot.title) === normaliseHeading(openedChapterTitle);
    openedChapterTitle = '';
    blocks.push(`${duplicatesChapterHeading ? '' : `## ${slot.title}\n\n`}${approved.result.narrative.trim()}\n\n${approved.result.managementImplication.trim()}`);
  }
  const markdown = `# ${blueprint.reportTitle}\n\n${blocks.join('\n\n')}`.trim() + '\n';
  const totalWordCount = words(markdown.replace(/^#+\s.*$/gm, ''));
  const totalCharacterCount = characters(markdown);
  if (totalWordCount < plan.reportWordEnvelope.minimumWords || totalWordCount > plan.reportWordEnvelope.maximumWords) issues.push(`Report-level narrative envelope is ${plan.reportWordEnvelope.minimumWords}-${plan.reportWordEnvelope.maximumWords} words; received ${totalWordCount}.`);
  if (approvedSlots.length === 0 || approvedSlots[approvedSlots.length - 1]!.contract.narrativeRole !== 'CONCLUSION') issues.push('Compiled manuscript must end with an approved conclusion slot.');
  const allText = approvedSlots.map((slot) => [slot.result.narrative, slot.result.managementImplication].join('\n')).join('\n');
  const mechanical = analyseMechanicalLanguage(approvedSlots.map((slot) => ({ slotId: slot.contract.slotId, prose: [slot.result.narrative, slot.result.managementImplication].join('\n') })));
  if (!mechanical.ok) {
    for (const finding of mechanical.reportFindings) issues.push(`MECHANICAL_LANGUAGE_SATURATION: "${finding.family}" used ${finding.count} times across the report (allowance ${finding.allowance}, density ${finding.density} per 1,000 words).`);
  }
  const duplicateSentences = sentences(allText).filter((sentence, index, all) => all.indexOf(sentence) !== index);
  if (duplicateSentences.length) issues.push(`Repeated sentence overlap detected: ${unique(duplicateSentences).slice(0, 3).join(' | ')}`);
  const duplicateOwners = unique(duplicateSentences).map((sentence) => laterOwnerOfSentence(approvedSlots, sentence)).filter((slotId): slotId is string => Boolean(slotId));
  if (!/30\s+days[\s\S]{0,800}60\s+days[\s\S]{0,800}90\s+days/i.test(allText) && blueprint.reportTier === 'essential' && blueprint.narrativeMode !== 'SUSTAINMENT') issues.push('Essential compilation does not preserve the 30/60/90 implementation sequence.');
  if (!/evidence|custody|incident/i.test(allText) && blueprint.reportTier === 'essential' && blueprint.narrativeMode !== 'SUSTAINMENT') issues.push('Essential compilation does not contain incident/evidence-preservation meaning.');
  return { markdown, approvedSlots, validation: { ok: issues.length === 0, totalWordCount, totalCharacterCount, expectedSlotIds: expected, compiledSlotIds: compiled, missingPrimaryContentRefs, duplicatePrimaryContentRefs, issues }, accounting };
}

export function createEmptyBoundedAccounting(reportGenerationId: string): BoundedGenerationAccounting {
  return {
    reportGenerationId,
    architecture: BOUNDED_SECTION_ENGINE_ARCHITECTURE,
    modelBySlot: {},
    calls: [],
    initialCalls: 0,
    repairCalls: 0,
    qualityEscalations: 0,
    technicalProviderFailureCount: 0,
    technicalOutputParseFailureCount: 0,
    technicalFormatRetries: 0,
    technicalFormatRetriesRecovered: 0,
    technicalFailures: [],
    failedSlots: [],
    totalTokens: 0,
    totalProviderCostMicros: 0
  };
}

function technicalFailureRecord(slotId: string, provider: BoundedSectionProvider, callType: BoundedProviderMetadata['callType'], repairNumber: number, error: unknown): BoundedTechnicalFailureRecord {
  const failure = error instanceof BoundedTechnicalFailure
    ? error
    : new BoundedTechnicalFailure({
      kind: 'TECHNICAL_PROVIDER_FAILURE',
      diagnostics: {
        errorName: error instanceof Error && error.name ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
  return {
    ...failure.diagnostics,
    kind: failure.kind,
    slotId,
    provider: provider.provider,
    model: provider.model,
    callType,
    repairNumber
  };
}

interface FormatRetryBudget { used: number; }

/**
 * Runs one provider call. If it fails purely because the JSON envelope did not
 * satisfy the strict schema, spend the single per-slot technical format retry to
 * correct the serialization only. Any other technical failure, and any failure
 * once the budget is spent, propagates unchanged so the slot fails closed.
 */
async function callWithFormatRecovery(input: {
  provider: BoundedSectionProvider;
  contract: NarrativeSectionContract;
  accounting: BoundedGenerationAccounting;
  budget: FormatRetryBudget;
  callType: BoundedProviderMetadata['callType'];
  repairNumber: number;
  run: () => Promise<BoundedProviderCall>;
}): Promise<BoundedProviderCall> {
  try {
    return await input.run();
  } catch (error) {
    const isParseFailure = error instanceof BoundedTechnicalFailure && error.kind === 'TECHNICAL_OUTPUT_PARSE_FAILURE';
    if (!isParseFailure || !input.provider.formatRetry || input.budget.used >= MAX_TECHNICAL_FORMAT_RETRIES_PER_SLOT) throw error;
    const rejected = error as BoundedTechnicalFailure;
    recordTechnicalFailure(input.accounting, technicalFailureRecord(input.contract.slotId, input.provider, input.callType, input.repairNumber, rejected));
    input.budget.used += 1;
    input.accounting.technicalFormatRetries += 1;
    const recovered = await input.provider.formatRetry(input.contract, {
      rawText: rejected.diagnostics.rawText ?? '',
      schemaIssuePaths: rejected.diagnostics.schemaIssuePaths,
      schemaIssueCodes: rejected.diagnostics.schemaIssueCodes
    }, input.callType);
    if (recovered.result.slotId !== input.contract.slotId || recovered.result.contractVersion !== input.contract.contractVersion) {
      throw new BoundedTechnicalFailure({
        kind: 'TECHNICAL_OUTPUT_PARSE_FAILURE',
        diagnostics: {
          errorName: 'BoundedFormatRetryIdentityMismatch',
          errorMessage: 'Technical format retry returned a different slot identity or contract version.',
          rawText: rejected.diagnostics.rawText
        }
      });
    }
    input.accounting.technicalFormatRetriesRecovered += 1;
    return recovered;
  }
}

function recordTechnicalFailure(accounting: BoundedGenerationAccounting, record: BoundedTechnicalFailureRecord): void {
  accounting.technicalFailures.push(record);
  if (record.kind === 'TECHNICAL_PROVIDER_FAILURE') accounting.technicalProviderFailureCount += 1;
  if (record.kind === 'TECHNICAL_OUTPUT_PARSE_FAILURE') accounting.technicalOutputParseFailureCount += 1;
}

export async function generateBoundedNarrativeReport(input: {
  reportGenerationId: string;
  pack: NarrativeFactPack;
  blueprint: ReportBlueprint;
  thesis?: ReportThesis;
  plan?: NarrativeSlotPlan;
  provider: BoundedSectionProvider;
  preApprovedSlots?: ApprovedNarrativeSlot[];
  onCandidate?: (event: { slot: NarrativeSlot; contract: NarrativeSectionContract; call: BoundedProviderCall; validation: NarrativeSlotValidationReport; callNumber: number }) => Promise<void> | void;
}): Promise<BoundedCompiledManuscript> {
  const thesis = input.thesis ?? buildReportThesis(input.pack, input.blueprint);
  const plan = input.plan ?? buildNarrativeSlotPlan(input.pack, input.blueprint, thesis);
  assertNarrativeSlotPlan(plan, input.pack, input.blueprint);
  const accounting = createEmptyBoundedAccounting(input.reportGenerationId);
  const approved: ApprovedNarrativeSlot[] = [];
  const preApprovedById = new Map((input.preApprovedSlots ?? []).map((slot) => [slot.contract.slotId, slot]));
  for (const slot of plan.slots) {
    const contract = buildNarrativeSectionContract(slot, input.pack, thesis);
    const preApproved = preApprovedById.get(slot.slotId);
    if (preApproved) {
      const validation = validateNarrativeSlotResult(preApproved.result, contract);
      if (!validation.ok || preApproved.validation.ok !== true) {
        const issues = validation.issues.map((issue) => issue.message);
        accounting.failedSlots.push(slot.slotId);
        throw new BoundedGenerationFailure({ slotId: slot.slotId, accounting, message: `Pre-approved bounded section ${slot.slotId} failed revalidation: ${issues.join(' | ')}` });
      }
      const calls = preApproved.calls.length ? preApproved.calls : [{ result: preApproved.result, metadata: preApproved.metadata }];
      for (const priorCall of calls) {
        accounting.calls.push(priorCall.metadata);
        accounting.totalTokens += priorCall.metadata.totalTokens ?? 0;
        accounting.totalProviderCostMicros += priorCall.metadata.providerCostMicros ?? 0;
        if (priorCall.metadata.callType === 'INITIAL') accounting.initialCalls += 1;
        if (priorCall.metadata.callType === 'REPAIR') accounting.repairCalls += 1;
        if (priorCall.metadata.callType === 'QUALITY_ESCALATION') accounting.qualityEscalations += 1;
        if (priorCall.metadata.callType === 'TECHNICAL_FORMAT_RETRY') accounting.technicalFormatRetries += 1;
      }
      accounting.modelBySlot[slot.slotId] = preApproved.metadata.model;
      approved.push({ ...preApproved, contract, validation });
      continue;
    }
    const calls: BoundedProviderCall[] = [];
    const formatBudget: FormatRetryBudget = { used: 0 };
    accounting.initialCalls += 1;
    accounting.modelBySlot[slot.slotId] = input.provider.model;
    let call: BoundedProviderCall;
    try {
      call = await callWithFormatRecovery({ provider: input.provider, contract, accounting, budget: formatBudget, callType: 'INITIAL', repairNumber: 0, run: () => input.provider.generate(contract) });
    } catch (error) {
      const failure = technicalFailureRecord(slot.slotId, input.provider, 'INITIAL', 0, error);
      recordTechnicalFailure(accounting, failure);
      accounting.failedSlots.push(slot.slotId);
      throw new BoundedGenerationFailure({ slotId: slot.slotId, accounting, message: `Bounded section ${slot.slotId} failed closed: ${failure.kind}.`, technicalFailure: failure });
    }
    calls.push(call);
    accounting.modelBySlot[slot.slotId] = call.metadata.model;
    accounting.calls.push(call.metadata);
    accounting.totalTokens += call.metadata.totalTokens ?? 0;
    accounting.totalProviderCostMicros += call.metadata.providerCostMicros ?? 0;
    let validation = validateNarrativeSlotResult(call.result, contract);
    await input.onCandidate?.({ slot, contract, call, validation, callNumber: calls.length });
    let repairNumber = 0;
    while (!validation.ok && repairNumber < MAX_SECTION_REPAIR_CALLS) {
      repairNumber += 1;
      accounting.repairCalls += 1;
      try {
        const rejectedForRepair = { result: call.result, validation };
        call = await callWithFormatRecovery({ provider: input.provider, contract, accounting, budget: formatBudget, callType: 'REPAIR', repairNumber, run: () => input.provider.repair(contract, rejectedForRepair, repairNumber) });
      } catch (error) {
        const failure = technicalFailureRecord(slot.slotId, input.provider, 'REPAIR', repairNumber, error);
        recordTechnicalFailure(accounting, failure);
        accounting.failedSlots.push(slot.slotId);
        throw new BoundedGenerationFailure({ slotId: slot.slotId, accounting, message: `Bounded section ${slot.slotId} failed closed: ${failure.kind}.`, technicalFailure: failure });
      }
      calls.push(call);
      accounting.calls.push(call.metadata);
      accounting.totalTokens += call.metadata.totalTokens ?? 0;
      accounting.totalProviderCostMicros += call.metadata.providerCostMicros ?? 0;
      validation = validateNarrativeSlotResult(call.result, contract);
      await input.onCandidate?.({ slot, contract, call, validation, callNumber: calls.length });
    }
    if (!validation.ok && input.provider.qualityEscalate && validation.issues.every((issue) => issue.code === 'FIT_OVERFLOW' || issue.code === 'FIT_UNDERFLOW' || issue.code === 'MECHANICAL_LANGUAGE' || issue.code === 'STYLE_FAILURE')) {
      accounting.qualityEscalations += 1;
      try {
        const rejectedForEscalation = { result: call.result, validation };
        call = await callWithFormatRecovery({ provider: input.provider, contract, accounting, budget: formatBudget, callType: 'QUALITY_ESCALATION', repairNumber: 0, run: () => input.provider.qualityEscalate!(contract, rejectedForEscalation) });
      } catch (error) {
        const failure = technicalFailureRecord(slot.slotId, input.provider, 'QUALITY_ESCALATION', 0, error);
        recordTechnicalFailure(accounting, failure);
        accounting.failedSlots.push(slot.slotId);
        throw new BoundedGenerationFailure({ slotId: slot.slotId, accounting, message: `Bounded section ${slot.slotId} failed closed: ${failure.kind}.`, technicalFailure: failure });
      }
      calls.push(call);
      accounting.calls.push(call.metadata);
      accounting.totalTokens += call.metadata.totalTokens ?? 0;
      accounting.totalProviderCostMicros += call.metadata.providerCostMicros ?? 0;
      validation = validateNarrativeSlotResult(call.result, contract);
      await input.onCandidate?.({ slot, contract, call, validation, callNumber: calls.length });
    }
    if (!validation.ok) {
      accounting.failedSlots.push(slot.slotId);
      throw new BoundedGenerationFailure({ slotId: slot.slotId, accounting, message: `Bounded section ${slot.slotId} failed closed: ${validation.issues.map((issue) => issue.message).join(' | ')}` });
    }
    approved.push({ contract, result: call.result, validation, metadata: call.metadata, calls });
  }
  let compiled = compileApprovedNarrativeSlots(plan, input.blueprint, approved, accounting);
  // A global defect that maps to exactly one slot is repaired in that slot only.
  // Every other approved slot stays immutable and is never regenerated.
  for (let pass = 0; !compiled.validation.ok && pass < MAX_GLOBAL_REPAIR_PASSES; pass += 1) {
    const targets = globalRepairTargets(plan, approved, compiled);
    if (!targets.length) break;
    for (const target of targets) {
      const index = approved.findIndex((slot) => slot.contract.slotId === target.slotId);
      if (index < 0) continue;
      const existing = approved[index]!;
      const globalValidation: NarrativeSlotValidationReport = { ok: false, slotId: target.slotId, issues: [{ code: 'CONTENT_OWNERSHIP_VIOLATION', message: target.reason }], wordCount: existing.validation.wordCount, characterCount: existing.validation.characterCount, usedClaimRefs: existing.validation.usedClaimRefs, requirementIds: existing.validation.requirementIds };
      accounting.repairCalls += 1;
      let repaired: BoundedProviderCall;
      try {
        repaired = await input.provider.repair(existing.contract, { result: existing.result, validation: globalValidation }, MAX_SECTION_REPAIR_CALLS);
      } catch (error) {
        const failure = technicalFailureRecord(target.slotId, input.provider, 'REPAIR', MAX_SECTION_REPAIR_CALLS, error);
        recordTechnicalFailure(accounting, failure);
        accounting.failedSlots.push(target.slotId);
        throw new BoundedGenerationFailure({ slotId: target.slotId, accounting, message: `Bounded global repair for ${target.slotId} failed closed: ${failure.kind}.`, technicalFailure: failure });
      }
      accounting.calls.push(repaired.metadata);
      accounting.totalTokens += repaired.metadata.totalTokens ?? 0;
      accounting.totalProviderCostMicros += repaired.metadata.providerCostMicros ?? 0;
      const revalidated = validateNarrativeSlotResult(repaired.result, existing.contract);
      await input.onCandidate?.({ slot: plan.slots[index]!, contract: existing.contract, call: repaired, validation: revalidated, callNumber: existing.calls.length + 1 });
      if (!revalidated.ok) continue;
      approved[index] = { ...existing, result: repaired.result, validation: revalidated, metadata: repaired.metadata, calls: [...existing.calls, repaired] };
    }
    compiled = compileApprovedNarrativeSlots(plan, input.blueprint, approved, accounting);
  }
  if (!compiled.validation.ok) throw new BoundedGenerationFailure({ slotId: 'REPORT', accounting, message: `Bounded manuscript failed closed: ${compiled.validation.issues.join(' | ')}` });
  return compiled;
}

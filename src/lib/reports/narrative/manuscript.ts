import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';
import type { ReportBlueprint, WholeManuscriptWriterContext } from './report-blueprint';
import type { NarrativeRecoveryBudget } from './recovery-policy';
import type { EssentialSemanticReviewer, SemanticReviewerInput, SemanticReviewDiagnostics, SemanticReviewExecutionContract, SemanticReviewResult } from './semantic-reviewer';

export const NARRATIVE_MANUSCRIPT_SCHEMA_VERSION = 'mk-reporting-bible-1.1-manuscript-v1';
export const NARRATIVE_WRITER_CONTRACT_VERSION = 'mk-reporting-bible-1.1-writer-v1';
export const WHOLE_MANUSCRIPT_WRITER_CONTRACT_VERSION = 'mk-reporting-bible-1.1-whole-manuscript-writer-v1';

export interface NarrativeClaimBlock {
  id: string;
  text: string;
  claimRefs: string[];
}

export interface NarrativeManuscriptSection {
  sectionId: string;
  movementId: string;
  heading: NarrativeClaimBlock;
  paragraphs: NarrativeClaimBlock[];
  transition?: NarrativeClaimBlock;
}

export interface NarrativeSpine {
  schemaVersion: typeof NARRATIVE_MANUSCRIPT_SCHEMA_VERSION;
  bibleVersion: '1.1';
  productTier: NarrativeFactPack['productTier'];
  executiveDiagnosis: NarrativeClaimBlock;
  systemicThemeSummary: NarrativeClaimBlock;
  centralManagementImplication: NarrativeClaimBlock;
  route: NarrativeClaimBlock;
  writerMetadata: NarrativeWriterMetadata;
}

export interface NarrativeManuscript {
  schemaVersion: typeof NARRATIVE_MANUSCRIPT_SCHEMA_VERSION;
  bibleVersion: '1.1';
  productTier: NarrativeFactPack['productTier'];
  organisationName: string;
  assessmentReference: string;
  sections: NarrativeManuscriptSection[];
  spine: NarrativeSpine;
  writerMetadata: NarrativeWriterMetadata;
}

export interface NarrativeWriterMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  generationMode: 'ai' | 'test-injected';
  generatedAt: string;
  responseId?: string;
  generationId?: string;
  inputFactPackSha256: string;
  inputStoryPlanSha256: string;
  presentationSanitisedProvenanceTokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  providerCostRaw?: string | number;
  finishReason?: string;
  providerFinishReason?: string;
}

export interface NarrativeWriterContext {
  factPack: NarrativeFactPack;
  storyPlan: NarrativeStoryPlan;
  spine?: NarrativeSpine;
  previousTransition?: string;
  currentSectionId: string;
  currentMovementId: string;
  currentSectionPurpose: string;
  nextSectionPurpose: string;
  requiredManagementTakeaway: string;
  prohibitedClaims: string[];
}

export interface NarrativeWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  writeSpine(input: { factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeSpine>;
  writeSection(input: NarrativeWriterContext): Promise<NarrativeManuscriptSection>;
  coherencePass(input: { manuscript: NarrativeManuscript; factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeManuscript>;
}

export interface WholeManuscriptWriterMetadata extends NarrativeWriterMetadata {
  contractVersion: typeof WHOLE_MANUSCRIPT_WRITER_CONTRACT_VERSION;
  architecture: 'whole-manuscript' | 'whole-manuscript-targeted-repair' | 'whole-manuscript-coherence';
  recovery: NarrativeRecoveryBudget;
  /** Separate acceptance accounting: manuscript generation and semantic grounding review. */
  manuscriptProviderCalls?: number;
  semanticReviewProviderCalls?: number;
  totalProviderCalls?: number;
  manuscriptInputTokens?: number;
  manuscriptOutputTokens?: number;
  manuscriptTotalTokens?: number;
  manuscriptProviderCostMicros?: number;
  semanticReviewBlockCount?: number;
  semanticReviewCandidateCount?: number;
  semanticReviewAllowCount?: number;
  semanticReviewRepairCount?: number;
  semanticReviewRejectCount?: number;
  semanticReviewHoldCount?: number;
  semanticReviewInputTokens?: number;
  semanticReviewOutputTokens?: number;
  semanticReviewTotalTokens?: number;
  semanticReviewProviderCostMicros?: number;
  semanticReviewProvider?: string;
  semanticReviewModel?: string;
  semanticReviewDispatchOccurred?: boolean;
  semanticReviewGenerationId?: string;
  semanticReviewResponseId?: string;
  semanticReviewStartedAt?: string;
  semanticReviewEndedAt?: string;
  semanticReviewElapsedMs?: number;
  semanticReviewFinishReason?: string;
  semanticReviewProviderFinishReason?: string;
  semanticReviewResponseSchemaValid?: boolean;
  semanticReviewFailureCode?: string;
  semanticReviewDiagnostics?: SemanticReviewDiagnostics;
  inputBlueprintSha256?: string;
  executionContract?: {
    sdkFunction: 'generateText';
    responseFormat: 'markdown-text';
    structuredOutput: false;
    promptBytes: number;
    estimatedInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    providerOptions: Record<string, unknown>;
  };
  semanticReviewExecutionContract?: SemanticReviewExecutionContract;
}

export interface WholeManuscriptTailInput {
  context: WholeManuscriptWriterContext;
  blueprint: ReportBlueprint;
  previousMarkdown: string;
  missingHeadings: string[];
  lastCompleteHeading: string;
  precedingContext: string;
  boundary?: {
    previousHeadingIndex: number;
    nextHeadingIndex: number;
    previousHeading: { level: 1 | 2 | 3; title: string } | null;
    nextHeading: { level: 1 | 2 | 3; title: string } | null;
    missingHeadings: string[];
    continuationMode: 'next_heading' | 'complete_interrupted_prose_then_headings';
  };
}

export interface WholeManuscriptTailResult {
  contractVersion: typeof WHOLE_MANUSCRIPT_WRITER_CONTRACT_VERSION;
  architecture: 'whole-manuscript-tail-completion';
  markdown: string;
  continuationMarkdown: string;
  blueprint: ReportBlueprint;
  writerMetadata: WholeManuscriptWriterMetadata;
}

export interface WholeManuscriptTextResult {
  contractVersion: typeof WHOLE_MANUSCRIPT_WRITER_CONTRACT_VERSION;
  architecture: 'whole-manuscript';
  markdown: string;
  blueprint: ReportBlueprint;
  writerMetadata: WholeManuscriptWriterMetadata;
}

export interface WholeManuscriptRepairInput {
  context: WholeManuscriptWriterContext;
  blueprint: ReportBlueprint;
  previousMarkdown: string;
  scope: 'block' | 'block+adjacent' | 'subsection' | 'bounded section';
  sectionId: string;
  subsectionId?: string;
  failingPath: string;
  validationCode: string;
  matchedPhrase?: string;
  targetText: string;
  surroundingProse: string;
  permittedFacts: NarrativeFactPack['facts'];
  permittedClaimRefs: string[];
  requiredManagementTakeaway: string;
  assuranceBoundary: string;
}

export interface WholeManuscriptRepairResult {
  contractVersion: typeof WHOLE_MANUSCRIPT_WRITER_CONTRACT_VERSION;
  architecture: 'whole-manuscript-targeted-repair';
  repairedText: string;
  blueprint: ReportBlueprint;
  writerMetadata: WholeManuscriptWriterMetadata;
}

export interface WholeManuscriptCoherenceInput {
  context: WholeManuscriptWriterContext;
  blueprint: ReportBlueprint;
  previousMarkdown: string;
  editorialBrief?: string;
}

export interface WholeManuscriptCoherenceResult {
  contractVersion: typeof WHOLE_MANUSCRIPT_WRITER_CONTRACT_VERSION;
  architecture: 'whole-manuscript-coherence';
  markdown: string;
  blueprint: ReportBlueprint;
  writerMetadata: WholeManuscriptWriterMetadata;
}

export interface WholeManuscriptWriterInput {
  context: WholeManuscriptWriterContext;
  factPack: NarrativeFactPack;
  blueprint: ReportBlueprint;
}

/**
 * The production boundary for the next writer architecture. It deliberately accepts one
 * complete report context and returns one complete manuscript; section-by-section generation is
 * retained only through the legacy NarrativeWriter compatibility interface above.
 */
export interface WholeManuscriptWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  writeManuscript(input: WholeManuscriptWriterInput): Promise<WholeManuscriptTextResult>;
  completeTail(input: WholeManuscriptTailInput): Promise<WholeManuscriptTailResult>;
  repairBlock(input: WholeManuscriptRepairInput): Promise<WholeManuscriptRepairResult>;
  coherencePass(input: WholeManuscriptCoherenceInput): Promise<WholeManuscriptCoherenceResult>;
  /** Optional one-request semantic adjudication seam used by the Essential coordinator. */
  reviewSemanticCandidates?(input: SemanticReviewerInput): Promise<SemanticReviewResult>;
}

export class NarrativeWriterUnavailableError extends Error {
  readonly code = 'NARRATIVE_WRITER_UNAVAILABLE';

  constructor(message = 'No approved narrative writer/provider is configured. Report generation stops at Fact Pack and Story Plan.') {
    super(message);
    this.name = 'NarrativeWriterUnavailableError';
  }
}

export function assertManuscriptShape(manuscript: NarrativeManuscript, factPack: NarrativeFactPack): void {
  if (manuscript.bibleVersion !== '1.1' || manuscript.spine.bibleVersion !== '1.1') throw new Error('Manuscript must use Reporting Bible 1.1.');
  if (manuscript.productTier !== factPack.productTier) throw new Error('Manuscript product tier does not match Fact Pack.');
  if (!manuscript.sections.length) throw new Error('Manuscript must contain at least one section.');
  if (manuscript.sections.some((section) => !section.heading.text.trim() || section.paragraphs.length === 0)) throw new Error('Every manuscript section requires a heading and narrative paragraph.');
}

function markdownText(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

/** Export only headings, prose and transitions. No tables, cards, charts or field labels. */
export function manuscriptToPlainText(manuscript: NarrativeManuscript): string {
  if (!manuscript.sections.length || manuscript.sections.some((section) => !section.heading.text.trim() || section.paragraphs.length === 0)) {
    throw new Error('Manuscript must contain headings and narrative paragraphs before plain-text export.');
  }
  return manuscript.sections.map((section) => [
    `# ${markdownText(section.heading.text)}`,
    ...section.paragraphs.map((paragraph) => markdownText(paragraph.text)),
    ...(section.transition ? [markdownText(section.transition.text)] : [])
  ].join('\n\n')).join('\n\n');
}

/** Export the advisory spine as owner-review prose before section drafting begins. */
export function spineToPlainText(spine: NarrativeSpine): string {
  return [
    '# Executive diagnosis', spine.executiveDiagnosis.text,
    '# Systemic theme summary', spine.systemicThemeSummary.text,
    '# Central management implication', spine.centralManagementImplication.text,
    '# Route forward', spine.route.text
  ].map(markdownText).join('\n\n');
}

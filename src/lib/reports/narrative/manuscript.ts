import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';

export const NARRATIVE_MANUSCRIPT_SCHEMA_VERSION = 'mk-reporting-bible-1.1-manuscript-v1';
export const NARRATIVE_WRITER_CONTRACT_VERSION = 'mk-reporting-bible-1.1-writer-v1';

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
}

export interface NarrativeWriterContext {
  factPack: NarrativeFactPack;
  storyPlan: NarrativeStoryPlan;
  spine?: NarrativeSpine;
  previousTransition?: string;
  currentSectionId: string;
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

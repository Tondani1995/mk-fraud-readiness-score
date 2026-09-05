import crypto from 'node:crypto';
import type { NarrativeFactPack } from './fact-pack';
import type { ReportBlueprint } from './report-blueprint';
import { classifyAssuranceLanguage } from './validation';

export interface BlueprintHeadingExpectation {
  level: 1 | 2 | 3;
  kind: 'chapter' | 'section' | 'subsection';
  chapterId: string;
  sectionId?: string;
  subsectionId?: string;
  title: string;
}

export interface BlueprintMarkdownSkeleton {
  markdown: string;
  headings: BlueprintHeadingExpectation[];
}

export interface MissingBlueprintTail {
  ok: boolean;
  missingHeadings: string[];
  lastCompleteHeading: string;
  precedingContext: string;
  boundary: {
    previousHeadingIndex: number;
    nextHeadingIndex: number;
    previousHeading: BlueprintHeadingExpectation | null;
    nextHeading: BlueprintHeadingExpectation | null;
    missingHeadings: string[];
    continuationMode: 'next_heading' | 'complete_interrupted_prose_then_headings';
  };
  errors: string[];
}

export type WholeManuscriptGenerationOutcome = 'COMPLETE' | 'TECHNICAL_TRUNCATION' | 'PROVIDER_FAILURE' | 'CONTENT_FILTER';

export function classifyWholeManuscriptGeneration(input: {
  finishReason?: string;
  providerFinishReason?: string;
  outputTokens?: number;
  maxOutputTokens?: number;
  missingHeadingCount: number;
  providerFailed?: boolean;
}): WholeManuscriptGenerationOutcome {
  const reasons = [input.finishReason, input.providerFinishReason].filter(Boolean).map((value) => value!.toLowerCase());
  if (reasons.some((value) => ['length', 'max_tokens', 'token_limit', 'maximum_tokens'].includes(value))) return 'TECHNICAL_TRUNCATION';
  if (input.providerFailed) return 'PROVIDER_FAILURE';
  if (reasons.some((value) => value.includes('content_filter') || value.includes('content-filter'))) return 'CONTENT_FILTER';
  if (input.missingHeadingCount > 0 && input.outputTokens !== undefined && input.maxOutputTokens !== undefined && input.outputTokens >= input.maxOutputTokens) return 'TECHNICAL_TRUNCATION';
  return input.missingHeadingCount === 0 ? 'COMPLETE' : 'PROVIDER_FAILURE';
}

export interface BlueprintTextBlock {
  text: string;
  permittedClaimRefs: string[];
  provenance?: NarrativeParagraphProvenance;
}

/** Internal-only binding record. It is never rendered as customer-facing prose. */
export interface NarrativeParagraphProvenance {
  chapterId: string;
  sectionId: string;
  subsectionId?: string;
  paragraphIndex: number;
  authorisedClaimRefs: string[];
  blueprintSectionId: string;
  factPackSha256?: string;
  blueprintSha256?: string;
  generationId?: string;
}

export interface NarrativeHeadingProvenance {
  chapterId: string;
  sectionId?: string;
  subsectionId?: string;
  blueprintSectionId?: string;
  authorisedClaimRefs: string[];
  factPackSha256?: string;
  blueprintSha256?: string;
  generationId?: string;
}

export interface BlueprintTextSubsection {
  subsectionId: string;
  title: string;
  paragraphs: BlueprintTextBlock[];
  headingProvenance?: NarrativeHeadingProvenance;
}

export interface BlueprintTextSection {
  chapterId: string;
  sectionId: string;
  title: string;
  paragraphs: BlueprintTextBlock[];
  subsections: BlueprintTextSubsection[];
  permittedClaimRefs: string[];
  headingProvenance?: NarrativeHeadingProvenance;
}

export interface BlueprintTextChapter {
  chapterId: string;
  title: string;
  sections: BlueprintTextSection[];
  headingProvenance?: NarrativeHeadingProvenance;
}

export interface ParsedBlueprintMarkdown {
  ok: boolean;
  markdown: string;
  chapters: BlueprintTextChapter[];
  errors: Array<{ code: string; path: string; message: string }>;
}

export type TextFirstValidationSeverity = 'HARD_TRUTH_FAILURE' | 'REPAIRABLE_SEMANTIC_FAILURE' | 'QUALITY_FAILURE';

export interface TextFirstValidationIssue {
  code: string;
  severity: TextFirstValidationSeverity;
  path: string;
  message: string;
}

export interface TextFirstValidationReport {
  ok: boolean;
  hardTruth: { status: 'PASS' | 'FAIL'; issues: TextFirstValidationIssue[] };
  repairableSemantic: { status: 'PASS' | 'FAIL'; issues: TextFirstValidationIssue[] };
  quality: { status: 'PASS' | 'QUALITY_FAILURE'; issues: TextFirstValidationIssue[] };
  sectionCount: number;
  subsectionCount: number;
  paragraphCount: number;
}

/**
 * Customer-copy boundary for the manuscript surface. These expressions are
 * intentionally structural rather than pixel or wording snapshots: the
 * report may use different fluent language, but it must not expose the
 * machinery used to compose it.
 */
export const CUSTOMER_COPY_LEAKAGE_CHECKS: ReadonlyArray<{ id: string; pattern: RegExp; description: string }> = [
  { id: 'connected-management-story', pattern: /connected management story/i, description: 'connected management story' },
  { id: 'profile-supports-narrative', pattern: /the profile supports the narrative|not the narrative itself/i, description: 'narrative self-reference in a profile caption' },
  { id: 'register-dump', pattern: /progression and outcomes,?\s*not a register dump|register dump/i, description: 'register-dump construction language' },
  { id: 'narrative-led-report', pattern: /management report can remain narrative[- ]led/i, description: 'narrative-led report construction language' },
  { id: 'fixture-section-template', pattern: /translates the authorised evidence into a specific management account/i, description: 'fixture section template language' },
  { id: 'viewed-through-lens', pattern: /viewed through the .* lens/i, description: 'deterministic lens-template language' },
  { id: 'explicit-in-this-section', pattern: /management consequence .* explicit in this section/i, description: 'section-construction language' },
  { id: 'engine-vocabulary', pattern: /\b(?:narrative|renderer|rendered|deterministic|provider[- ]?(?:free|backed|call)|fact[ -]?pack|story[ -]?plan|whole[- ]manuscript|report (?:construction|architecture))\b/i, description: 'report-engine vocabulary' },
  // The assurance boundary is a statement about what this analysis is, never about what was paid
  // for it. Framing the limitation as a price or certification claim was owner-rejected on the
  // first released Comprehensive package, so the customer surface must not carry either framing.
  { id: 'price-based-assurance', pattern: /price[- ]based|assurance claim|\bR\s?\d{1,3},\d{3}\b/i, description: 'price or commercial-certification framing of the assurance boundary' }
];

/** Customer workbooks have the same boundary as the PDF, plus workbook-only
 * QA and certification language that must remain in evidence files. */
export const CUSTOMER_WORKBOOK_COPY_LEAKAGE_CHECKS: ReadonlyArray<{ id: string; pattern: RegExp; description: string }> = [
  { id: 'owner-review-workbook', pattern: /owner[- ]review workbook/i, description: 'owner-review workbook label' },
  { id: 'provider-free-qa-wording', pattern: /provider[- ]free|phase\s*A[-–]F|owner[- ]review proof|structural workbook QA|QA only/i, description: 'provider, QA or owner-review status wording' },
  { id: 'engineering-certification-language', pattern: /\b(?:engineering\s+(?:quality|acceptance|gate|certification)|(?:certification|certified)\s+(?:gate|status|proof|evidence|only)|architecture|compositor|composition fixture|acceptance gate|release gate)\b/i, description: 'engineering or certification language' }
];

export function findCustomerCopyLeakage(text: string): Array<{ id: string; description: string; match: string }> {
  return CUSTOMER_COPY_LEAKAGE_CHECKS.flatMap(({ id, pattern, description }) => {
    const match = text.match(pattern);
    return match ? [{ id, description, match: match[0] }] : [];
  });
}

export function findCustomerWorkbookCopyLeakage(text: string): Array<{ id: string; description: string; match: string }> {
  const checks = [...CUSTOMER_COPY_LEAKAGE_CHECKS, ...CUSTOMER_WORKBOOK_COPY_LEAKAGE_CHECKS];
  return checks.flatMap(({ id, pattern, description }) => {
    const match = text.match(pattern);
    return match ? [{ id, description, match: match[0] }] : [];
  });
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const normalise = (value: string): string => value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
const compact = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function expectedHeadings(blueprint: ReportBlueprint): BlueprintHeadingExpectation[] {
  return blueprint.chapters.flatMap((chapter) => [
    { level: 1, kind: 'chapter', chapterId: chapter.chapterId, title: chapter.title } as const,
    ...chapter.sections.flatMap((section) => [
      { level: 2, kind: 'section', chapterId: chapter.chapterId, sectionId: section.sectionId, title: section.title } as const,
      ...section.optionalSubsections.map((subsection) => ({ level: 3, kind: 'subsection', chapterId: chapter.chapterId, sectionId: section.sectionId, subsectionId: subsection.subsectionId, title: subsection.title }) as const)
    ])
  ]);
}

export function buildBlueprintMarkdownSkeleton(blueprint: ReportBlueprint): BlueprintMarkdownSkeleton {
  const headings = expectedHeadings(blueprint);
  const markdown = headings.map((heading) => `${'#'.repeat(heading.level)} ${heading.title}`).join('\n\n');
  return { markdown: `${markdown}\n`, headings };
}

function paragraphs(lines: string[]): string[] {
  const result: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join(' ').replace(/\s+/g, ' ').trim();
    if (text) result.push(text);
    current = [];
  };
  for (const line of lines) {
    if (!line.trim()) flush();
    else current.push(line.trim());
  }
  flush();
  return result;
}

function parseHeading(line: string): { level: number; title: string } | null {
  const match = line.match(/^(#{1,6})[ \t]+(.+?)[ \t]*$/);
  return match ? { level: match[1].length, title: match[2] } : null;
}

function headingTokens(markdown: string): Array<{ level: number; title: string }> {
  return normalise(markdown).split('\n').flatMap((line) => {
    const heading = parseHeading(line);
    return heading ? [heading] : [];
  });
}

export function deriveMissingBlueprintTail(markdown: string, blueprint: ReportBlueprint): MissingBlueprintTail {
  const expected = expectedHeadings(blueprint);
  const actual = headingTokens(markdown);
  const errors: string[] = [];
  if (actual.length > expected.length) errors.push(`received ${actual.length} headings but Blueprint has ${expected.length}`);
  const compareCount = Math.min(actual.length, expected.length);
  for (let index = 0; index < compareCount; index += 1) {
    const wanted = expected[index]!;
    const received = actual[index]!;
    if (wanted.level !== received.level || wanted.title !== received.title) errors.push(`heading ${index + 1} diverges at ${received.title}`);
  }
  if (!actual.length) errors.push('no complete Blueprint heading is present');
  const missing = actual.length <= expected.length ? expected.slice(actual.length) : [];
  const lastCompleteHeading = actual.length ? actual[actual.length - 1]!.title : '';
  const precedingContext = normalise(markdown).slice(-6000);
  return {
    ok: errors.length === 0 && missing.length > 0,
    missingHeadings: missing.map((heading) => heading.title),
    lastCompleteHeading,
    precedingContext,
    boundary: {
      previousHeadingIndex: actual.length - 1,
      nextHeadingIndex: actual.length,
      previousHeading: expected[actual.length - 1] ?? null,
      nextHeading: expected[actual.length] ?? null,
      missingHeadings: missing.map((heading) => heading.title),
      continuationMode: /[.!?…\u2019\u201d\)\]]$/.test(precedingContext.split('\n').filter((line) => line.trim()).at(-1)?.trim() ?? '')
        ? 'next_heading'
        : 'complete_interrupted_prose_then_headings'
    },
    errors
  };
}

function compactWords(value: string): string[] {
  return compact(value).split(' ').filter(Boolean);
}

function proseBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const value = current.join(' ').replace(/\s+/g, ' ').trim();
    if (value) blocks.push(value);
    current = [];
  };
  for (const line of normalise(markdown).split('\n')) {
    if (parseHeading(line)) {
      flush();
      continue;
    }
    if (!line.trim()) flush();
    else current.push(line.trim());
  }
  flush();
  return blocks;
}

function hasWordOverlap(previous: string, continuation: string, minimumWords = 8): boolean {
  const before = compactWords(previous);
  const after = compactWords(continuation);
  const maximum = Math.min(32, before.length, after.length);
  for (let size = maximum; size >= minimumWords; size -= 1) {
    const beforeSuffix = before.slice(-size).join(' ');
    const afterPrefix = after.slice(0, size).join(' ');
    if (beforeSuffix === afterPrefix) return true;
  }
  return false;
}

function assertNoContinuationOverlap(previousMarkdown: string, tailMarkdown: string): void {
  const previousBlocks = proseBlocks(previousMarkdown);
  const continuationBlocks = proseBlocks(tailMarkdown);
  const previousSet = new Set(previousBlocks.map(compact));
  for (const block of continuationBlocks) {
    if (compactWords(block).length >= 8 && previousSet.has(compact(block))) {
      throw new Error('Tail completion contains a duplicated prose block from the initial response.');
    }
  }
  const previousLast = previousBlocks.at(-1);
  const continuationFirst = continuationBlocks[0];
  if (previousLast && continuationFirst && hasWordOverlap(previousLast, continuationFirst)) {
    throw new Error('Tail completion overlaps the end of the initial response.');
  }
}

function assertCompleteContinuationEnding(tailMarkdown: string): void {
  const lines = normalise(tailMarkdown).split('\n').filter((line) => line.trim());
  const last = lines.at(-1)?.trim() ?? '';
  if (!last || parseHeading(last)) throw new Error('Tail completion must end with narrative prose.');
  const terminal = last.replace(/[ *_`]+$/g, '').trim();
  if (!/[.!?…\u2019\u201d\)\]]$/.test(terminal)) throw new Error('Tail completion ended before a complete sentence.');
}

function assertContinuationBoundary(tailMarkdown: string, expected: BlueprintHeadingExpectation, mode: MissingBlueprintTail['boundary']['continuationMode']): void {
  const lines = normalise(tailMarkdown).split('\n').filter((line) => line.trim());
  const required = `${'#'.repeat(expected.level)} ${expected.title}`;
  const firstHeadingIndex = lines.findIndex((line) => parseHeading(line));
  if (firstHeadingIndex < 0 || lines[firstHeadingIndex]?.trim() !== required) throw new Error(`Tail completion must reach the exact Blueprint boundary: ${required}.`);
  if (mode === 'next_heading' && firstHeadingIndex !== 0) throw new Error(`Tail completion must begin at the exact Blueprint boundary: ${required}.`);
  if (mode === 'complete_interrupted_prose_then_headings' && firstHeadingIndex === 0) throw new Error('Tail completion must complete the interrupted prose before the missing Blueprint heading.');
}

function joinContinuation(previousMarkdown: string, tailMarkdown: string, mode: MissingBlueprintTail['boundary']['continuationMode']): string {
  const previous = normalise(previousMarkdown);
  const tail = normalise(tailMarkdown);
  if (mode === 'next_heading') return `${previous}\n\n${tail}`;
  const lines = tail.split('\n');
  const firstHeadingIndex = lines.findIndex((line) => parseHeading(line));
  if (firstHeadingIndex < 1) throw new Error('Tail completion must contain interrupted prose before its deterministic heading boundary.');
  const interruptedProse = lines.slice(0, firstHeadingIndex).join('\n').trim();
  const headingSuffix = lines.slice(firstHeadingIndex).join('\n').trim();
  if (!interruptedProse || !headingSuffix) throw new Error('Tail completion must contain both interrupted prose completion and the deterministic heading suffix.');
  return `${previous} ${interruptedProse}\n\n${headingSuffix}`;
}

export function reconcileBlueprintTail(previousMarkdown: string, tailMarkdown: string, blueprint: ReportBlueprint): string {
  const tail = deriveMissingBlueprintTail(previousMarkdown, blueprint);
  if (!tail.ok) throw new Error(`Cannot append Blueprint tail: ${tail.errors.join(' | ')}`);
  const expectedTail = tail.missingHeadings;
  if (!normalise(tailMarkdown)) throw new Error('Tail completion returned no content.');
  if (/```/.test(tailMarkdown)) throw new Error('Tail completion may not contain code fences.');
  const nextHeading = tail.boundary.nextHeading;
  if (!nextHeading) throw new Error('Tail completion has no deterministic next Blueprint boundary.');
  assertContinuationBoundary(tailMarkdown, nextHeading, tail.boundary.continuationMode);
  assertNoContinuationOverlap(previousMarkdown, tailMarkdown);
  const receivedTail = headingTokens(tailMarkdown);
  const skeleton = expectedHeadings(blueprint).slice(expectedHeadings(blueprint).length - expectedTail.length);
  if (receivedTail.length !== expectedTail.length || receivedTail.some((heading, index) => heading.title !== skeleton[index]?.title || heading.level !== skeleton[index]?.level)) throw new Error('Tail completion must contain exactly the missing Blueprint headings in order.');
  assertCompleteContinuationEnding(tailMarkdown);
  const combined = joinContinuation(previousMarkdown, tailMarkdown, tail.boundary.continuationMode);
  const parsed = parseBlueprintMarkdown(combined, blueprint);
  if (!parsed.ok) throw new Error(`Tail completion failed deterministic binding: ${parsed.errors.map((error) => error.code).join(', ')}`);
  return combined;
}

export function appendBlueprintTail(previousMarkdown: string, tailMarkdown: string, blueprint: ReportBlueprint): string {
  return reconcileBlueprintTail(previousMarkdown, tailMarkdown, blueprint);
}

export function parseBlueprintMarkdown(markdown: string, blueprint: ReportBlueprint): ParsedBlueprintMarkdown {
  const source = normalise(markdown);
  const expected = expectedHeadings(blueprint);
  const tokens: Array<{ level: number; title: string; line: number }> = [];
  const lines = source.split('\n');
  const errors: ParsedBlueprintMarkdown['errors'] = [];
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const heading = parseHeading(line);
    if (heading) tokens.push({ ...heading, line: index + 1 });
    else if (/^#{1,6}(?:\s|$)/.test(line)) errors.push({ code: 'malformed_heading', path: `line ${index + 1}`, message: 'A Markdown heading is malformed.' });
  }
  if (lines.slice(0, tokens[0]?.line ? tokens[0].line - 1 : lines.length).some((line) => line.trim())) {
    errors.push({ code: 'unsupported_preamble', path: 'preamble', message: 'Text-first manuscript may contain only the deterministic Blueprint headings and prose beneath them.' });
  }
  if (tokens.length !== expected.length) errors.push({ code: 'heading_count', path: 'headings', message: `Expected ${expected.length} deterministic headings; received ${tokens.length}.` });
  const compareCount = Math.min(tokens.length, expected.length);
  for (let index = 0; index < compareCount; index += 1) {
    const actual = tokens[index];
    const wanted = expected[index];
    if (actual.level !== wanted.level || actual.title !== wanted.title) {
      errors.push({ code: actual.level === wanted.level ? 'heading_order_or_name' : 'heading_hierarchy', path: `headings[${index}]`, message: `Expected ${'#'.repeat(wanted.level)} ${wanted.title}; received ${'#'.repeat(actual.level)} ${actual.title}.` });
    }
  }
  if (errors.length) return { ok: false, markdown: source, chapters: [], errors };

  const chapters: BlueprintTextChapter[] = [];
  let chapter: BlueprintTextChapter | undefined;
  let section: BlueprintTextSection | undefined;
  let subsection: BlueprintTextSubsection | undefined;
  let body: string[] = [];
  let expectedHeadingIndex = 0;
  const flushBody = () => {
    const parsed = paragraphs(body);
    if (subsection) subsection.paragraphs.push(...parsed.map((text) => ({ text, permittedClaimRefs: [] })));
    else if (section) section.paragraphs.push(...parsed.map((text) => ({ text, permittedClaimRefs: [] })));
    body = [];
  };
  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      flushBody();
      const identity = expected[expectedHeadingIndex++];
      if (heading.level === 1) {
        chapter = { chapterId: identity?.chapterId ?? '', title: heading.title, sections: [] };
        chapters.push(chapter);
        section = undefined;
        subsection = undefined;
      } else if (heading.level === 2 && chapter) {
        section = { chapterId: chapter.chapterId, sectionId: identity?.sectionId ?? '', title: heading.title, paragraphs: [], subsections: [], permittedClaimRefs: [] };
        chapter.sections.push(section);
        subsection = undefined;
      } else if (heading.level === 3 && section) {
        subsection = { subsectionId: identity?.subsectionId ?? '', title: heading.title, paragraphs: [] };
        section.subsections.push(subsection);
      }
    } else if (chapter) body.push(line);
  }
  flushBody();

  const byChapter = new Map(blueprint.chapters.map((item) => [item.chapterId, item]));
  for (const parsedChapter of chapters) {
    const sourceChapter = byChapter.get(parsedChapter.chapterId);
    if (!sourceChapter) continue;
    for (const parsedSection of parsedChapter.sections) {
      const sourceSection = sourceChapter.sections.find((item) => item.sectionId === parsedSection.sectionId);
      if (!sourceSection) continue;
      parsedSection.permittedClaimRefs = unique([...sourceSection.requiredFacts, ...sourceSection.claimRefs, ...sourceSection.optionalSubsections.flatMap((item) => [...item.requiredFacts, ...item.claimRefs])]);
      const sourceSubs = new Map(sourceSection.optionalSubsections.map((item) => [item.subsectionId, item]));
      for (const parsedSubsection of parsedSection.subsections) {
        const sourceSubsection = sourceSubs.get(parsedSubsection.subsectionId);
        if (sourceSubsection) parsedSubsection.paragraphs = parsedSubsection.paragraphs.map((block) => ({ ...block, permittedClaimRefs: unique([...sourceSubsection.requiredFacts, ...sourceSubsection.claimRefs]) }));
      }
      const sectionClaimRefs = unique([...sourceSection.requiredFacts, ...sourceSection.claimRefs]);
      parsedSection.paragraphs = parsedSection.paragraphs.map((block) => ({ ...block, permittedClaimRefs: sectionClaimRefs }));
      if (parsedSection.paragraphs.length === 0 && parsedSection.subsections.every((item) => item.paragraphs.length === 0)) errors.push({ code: 'missing_narrative', path: parsedSection.sectionId, message: 'Every deterministic section must contain narrative prose.' });
      for (const parsedSubsection of parsedSection.subsections) if (parsedSubsection.paragraphs.length === 0) errors.push({ code: 'missing_subsection_narrative', path: parsedSubsection.subsectionId, message: 'Every deterministic subsection must contain narrative prose.' });
    }
  }
  return { ok: errors.length === 0, markdown: source, chapters, errors };
}

function sha256Json(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Bind every prose paragraph to the exact Blueprint scope and Fact Pack/version used to validate it. */
export function bindBlueprintTextProvenance(
  parsed: ParsedBlueprintMarkdown,
  input: { factPack: NarrativeFactPack; blueprint: ReportBlueprint; generationId: string }
): ParsedBlueprintMarkdown {
  const factPackSha256 = sha256Json(input.factPack);
  const blueprintSha256 = sha256Json(input.blueprint);
  return {
    ...parsed,
    chapters: parsed.chapters.map((chapter) => ({
      ...chapter,
      headingProvenance: {
        chapterId: chapter.chapterId,
        authorisedClaimRefs: [...(input.blueprint.chapters.find((item) => item.chapterId === chapter.chapterId)?.claimRefs ?? [])],
        factPackSha256,
        blueprintSha256,
        generationId: input.generationId
      },
      sections: chapter.sections.map((section) => ({
        ...section,
        headingProvenance: {
          chapterId: chapter.chapterId,
          sectionId: section.sectionId,
          blueprintSectionId: section.sectionId,
          authorisedClaimRefs: [...section.permittedClaimRefs],
          factPackSha256,
          blueprintSha256,
          generationId: input.generationId
        },
        paragraphs: section.paragraphs.map((block, paragraphIndex) => ({
          ...block,
          provenance: {
            chapterId: chapter.chapterId,
            sectionId: section.sectionId,
            paragraphIndex,
            authorisedClaimRefs: [...block.permittedClaimRefs],
            blueprintSectionId: section.sectionId,
            factPackSha256,
            blueprintSha256,
            generationId: input.generationId
          }
        })),
        subsections: section.subsections.map((subsection) => ({
          ...subsection,
          headingProvenance: {
            chapterId: chapter.chapterId,
            sectionId: section.sectionId,
            subsectionId: subsection.subsectionId,
            blueprintSectionId: section.sectionId,
            authorisedClaimRefs: [...subsection.paragraphs.flatMap((block) => block.permittedClaimRefs).filter((ref, index, refs) => refs.indexOf(ref) === index)],
            factPackSha256,
            blueprintSha256,
            generationId: input.generationId
          },
          paragraphs: subsection.paragraphs.map((block, paragraphIndex) => ({
            ...block,
            provenance: {
              chapterId: chapter.chapterId,
              sectionId: section.sectionId,
              subsectionId: subsection.subsectionId,
              paragraphIndex,
              authorisedClaimRefs: [...block.permittedClaimRefs],
              blueprintSectionId: section.sectionId,
              factPackSha256,
              blueprintSha256,
              generationId: input.generationId
            }
          }))
        }))
      }))
    }))
  };
}

function allBlocks(parsed: ParsedBlueprintMarkdown): Array<{ path: string; block: BlueprintTextBlock }> {
  return parsed.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => [
    ...section.paragraphs.map((block, index) => ({ path: `${section.sectionId}.paragraphs[${index}]`, block })),
    ...section.subsections.flatMap((subsection) => subsection.paragraphs.map((block, index) => ({ path: `${subsection.subsectionId}.paragraphs[${index}]`, block })))
  ]));
}

function scopedNumericValues(pack: NarrativeFactPack, permittedClaimRefs: string[]): Set<string> {
  // Essential keeps its certified whole-Fact-Pack numeric grounding behaviour.
  // Comprehensive uses the paragraph-scoped provenance contract below.
  const values = new Set<string>(['0', '1', '100']);
  if (pack.productTier === 'essential') {
    for (const match of JSON.stringify(pack).matchAll(/\b\d+(?:\.\d+)?%?\b/g)) values.add(match[0].replace('%', ''));
    return values;
  }
  const permitted = new Set(permittedClaimRefs);
  for (const fact of pack.facts) {
    if (!permitted.has(fact.id)) continue;
    for (const match of JSON.stringify(fact.value).matchAll(/\b\d+(?:\.\d+)?%?\b/g)) values.add(match[0].replace('%', ''));
  }
  return values;
}

const RAW_ID = /\b(?:D\d+-Q\d+|SCENARIO-\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/;

/** Peer, benchmark, industry or size comparisons -- none is ever evidenced. */
const COMPARATIVE_CLAIM = /\b(?:ahead of|behind|compared (?:to|with)|relative to|better than|worse than|above|below)\s+(?:many\s+)?(?:organisations?|peers?|companies|firms|businesses)?[^.]{0,40}?\b(?:of\s+)?similar\s+size\b|\b(?:industry|peer|benchmark)\s+(?:average|median|percentile|comparison)\b|\btypical for organisations of this size\b/gi;

/** Current staff counts or knowledge concentration. */
const WORKFORCE_CLAIM = /\b(?:the\s+)?one or two people\b|\ba single (?:employee|person|individual)\b|\bonly one person\b|\b\d+\s+(?:employees|staff|people)\b/gi;

/** Formal structures asserted as existing. */
const UNEVIDENCED_STRUCTURE = /\bAudit Committee\b|\bChief Technology Officer\b|\bChief People Officer\b|\bGeneral Counsel\b|\bSecurity Operations Cent(?:re|er)\b/g;
export function validateBlueprintTextManuscript(parsed: ParsedBlueprintMarkdown, blueprint: ReportBlueprint, factPack: NarrativeFactPack): TextFirstValidationReport {
  const hardTruth: TextFirstValidationIssue[] = parsed.errors.map((item) => ({ ...item, severity: 'HARD_TRUTH_FAILURE' }));
  const repairable: TextFirstValidationIssue[] = [];
  const quality: TextFirstValidationIssue[] = [];
  const paragraphsSeen: string[] = [];
  for (const { path, block } of allBlocks(parsed)) {
    const text = block.text;
    const knownNumbers = scopedNumericValues(factPack, block.provenance?.authorisedClaimRefs ?? block.permittedClaimRefs);
    paragraphsSeen.push(compact(text));
    if (/\u2014/u.test(text)) hardTruth.push({ code: 'em_dash', severity: 'HARD_TRUTH_FAILURE', path, message: 'Em dashes are not permitted in customer-facing report narrative.' });
    if (RAW_ID.test(text)) hardTruth.push({ code: 'raw_internal_id', severity: 'HARD_TRUTH_FAILURE', path, message: 'Raw internal identifiers are not customer-facing prose.' });
    for (const token of text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []) if (!knownNumbers.has(token.replace('%', ''))) hardTruth.push({ code: 'unsupported_numeric_claim', severity: 'HARD_TRUTH_FAILURE', path, message: `Numeric claim ${token} is not present in the authorised Fact Pack scope for this paragraph.` });
    // Claims about the customer's organisation that the assessment never established.
    // The first real Essential report told a customer they were "meaningfully ahead of
    // many of similar size" and that knowledge sat with "the one or two people who
    // currently hold" it -- no benchmark, headcount or structure evidence exists for
    // either. Deterministic counts already in the Fact Pack are unaffected.
    for (const match of text.match(COMPARATIVE_CLAIM) ?? []) {
      hardTruth.push({ code: 'unsupported_comparative_claim', severity: 'HARD_TRUTH_FAILURE', path, message: `Peer or size comparison is not supported by assessment evidence (${match.trim()}).` });
    }
    for (const match of text.match(WORKFORCE_CLAIM) ?? []) {
      hardTruth.push({ code: 'unsupported_workforce_claim', severity: 'HARD_TRUTH_FAILURE', path, message: `Staff-count or concentration claim is not supported by assessment evidence (${match.trim()}).` });
    }
    for (const match of text.match(UNEVIDENCED_STRUCTURE) ?? []) {
      if (compact(JSON.stringify(factPack)).toLowerCase().includes(match.toLowerCase())) continue;
      hardTruth.push({ code: 'unsupported_structure_claim', severity: 'HARD_TRUTH_FAILURE', path, message: `Organisational structure is not present in deterministic Fact Pack data (${match.trim()}).` });
    }
    const assurance = classifyAssuranceLanguage(text);
    if (assurance?.category === 'prohibited_assurance') hardTruth.push({ code: 'assurance_claim', severity: 'HARD_TRUTH_FAILURE', path, message: `Unsupported MK or assessment assurance language is prohibited (${assurance.matched}).` });
    for (const leakage of findCustomerCopyLeakage(text)) hardTruth.push({ code: 'customer_copy_leakage', severity: 'HARD_TRUTH_FAILURE', path, message: `Report-engine language is not permitted in customer prose (${leakage.description}: ${leakage.match}).` });
    if (/^\s*(?:[-*+]\s|\d+[.)]\s|```)/m.test(text)) quality.push({ code: 'mechanical_format', severity: 'QUALITY_FAILURE', path, message: 'The section contains list or code formatting rather than connected prose.' });
  }
  const duplicateCount = paragraphsSeen.filter((value, index) => value && paragraphsSeen.indexOf(value) !== index).length;
  if (duplicateCount) quality.push({ code: 'repetition', severity: 'QUALITY_FAILURE', path: 'manuscript', message: `${duplicateCount} repeated paragraph(s) detected.` });
  const disclaimers = paragraphsSeen.filter((value) => /self-assessment|not independent verification|operating effectiveness/i.test(value)).length;
  if (disclaimers > 2) quality.push({ code: 'excess_disclaimer', severity: 'QUALITY_FAILURE', path: 'manuscript', message: 'Assurance boundary language is repeated excessively.' });
  const sectionCount = parsed.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0);
  const subsectionCount = parsed.chapters.reduce((sum, chapter) => sum + chapter.sections.reduce((inner, section) => inner + section.subsections.length, 0), 0);
  const paragraphCount = allBlocks(parsed).length;
  const hardStatus = hardTruth.length ? 'FAIL' : 'PASS';
  return { ok: hardTruth.length === 0, hardTruth: { status: hardStatus, issues: hardTruth }, repairableSemantic: { status: repairable.length ? 'FAIL' : 'PASS', issues: repairable }, quality: { status: quality.length ? 'QUALITY_FAILURE' : 'PASS', issues: quality }, sectionCount, subsectionCount, paragraphCount };
}

export function assertBlueprintTextValidation(report: TextFirstValidationReport): void {
  if (!report.ok) throw new Error(`Blueprint-bound text validation failed: ${report.hardTruth.issues.map((item) => `${item.code} at ${item.path}`).join(', ')}`);
}

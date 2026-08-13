import type { NarrativeFactPack } from './fact-pack';
import type { ReportBlueprint } from './report-blueprint';

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

export interface BlueprintTextBlock {
  text: string;
  permittedClaimRefs: string[];
}

export interface BlueprintTextSubsection {
  subsectionId: string;
  title: string;
  paragraphs: BlueprintTextBlock[];
}

export interface BlueprintTextSection {
  chapterId: string;
  sectionId: string;
  title: string;
  paragraphs: BlueprintTextBlock[];
  subsections: BlueprintTextSubsection[];
  permittedClaimRefs: string[];
}

export interface BlueprintTextChapter {
  chapterId: string;
  title: string;
  sections: BlueprintTextSection[];
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
      parsedSection.paragraphs = parsedSection.paragraphs.map((block) => ({ ...block, permittedClaimRefs: parsedSection.permittedClaimRefs }));
      if (parsedSection.paragraphs.length === 0 && parsedSection.subsections.every((item) => item.paragraphs.length === 0)) errors.push({ code: 'missing_narrative', path: parsedSection.sectionId, message: 'Every deterministic section must contain narrative prose.' });
      for (const parsedSubsection of parsedSection.subsections) if (parsedSubsection.paragraphs.length === 0) errors.push({ code: 'missing_subsection_narrative', path: parsedSubsection.subsectionId, message: 'Every deterministic subsection must contain narrative prose.' });
    }
  }
  return { ok: errors.length === 0, markdown: source, chapters, errors };
}

function allBlocks(parsed: ParsedBlueprintMarkdown): Array<{ path: string; block: BlueprintTextBlock }> {
  return parsed.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => [
    ...section.paragraphs.map((block, index) => ({ path: `${section.sectionId}.paragraphs[${index}]`, block })),
    ...section.subsections.flatMap((subsection) => subsection.paragraphs.map((block, index) => ({ path: `${subsection.subsectionId}.paragraphs[${index}]`, block })))
  ]));
}

function numericValues(pack: NarrativeFactPack): Set<string> {
  const values = new Set<string>();
  for (const match of JSON.stringify(pack).matchAll(/\b\d+(?:\.\d+)?%?\b/g)) values.add(match[0].replace('%', ''));
  return values;
}

const RAW_ID = /\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/;
const ASSURANCE = /\b(?:independently?\s+(?:verified|reviewed|confirmed)|evidence(?:-linked|-based)?\s+assurance|validated operating effectiveness|the report provides assurance)\b/i;

export function validateBlueprintTextManuscript(parsed: ParsedBlueprintMarkdown, blueprint: ReportBlueprint, factPack: NarrativeFactPack): TextFirstValidationReport {
  const hardTruth: TextFirstValidationIssue[] = parsed.errors.map((item) => ({ ...item, severity: 'HARD_TRUTH_FAILURE' }));
  const repairable: TextFirstValidationIssue[] = [];
  const quality: TextFirstValidationIssue[] = [];
  const knownNumbers = numericValues(factPack);
  const paragraphsSeen: string[] = [];
  for (const { path, block } of allBlocks(parsed)) {
    const text = block.text;
    paragraphsSeen.push(compact(text));
    if (RAW_ID.test(text)) hardTruth.push({ code: 'raw_internal_id', severity: 'HARD_TRUTH_FAILURE', path, message: 'Raw internal identifiers are not customer-facing prose.' });
    for (const token of text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []) if (!knownNumbers.has(token.replace('%', ''))) hardTruth.push({ code: 'unsupported_numeric_claim', severity: 'HARD_TRUTH_FAILURE', path, message: `Numeric claim ${token} is not present in deterministic Fact Pack data.` });
    if (ASSURANCE.test(text)) hardTruth.push({ code: 'assurance_claim', severity: 'HARD_TRUTH_FAILURE', path, message: 'Unsupported MK or assessment assurance language is prohibited.' });
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

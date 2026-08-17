import { buildBlueprintMarkdownSkeleton, type ParsedBlueprintMarkdown } from './blueprint-text';
import type { ReportBlueprint } from './report-blueprint';

/**
 * Structural evidence for a manuscript that failed to bind to its blueprint.
 *
 * A paid generation returned HTTP 200, inside its output ceiling, and was rejected
 * because its headings did not bind -- and nothing recorded which heading, or how it
 * differed. The next failure has to be explicable from what is stored, without buying
 * another attempt and without keeping the customer's full manuscript merely to debug it.
 *
 * Only structure is captured: heading levels, titles and positions, and whether prose
 * exists under each required node. Narrative bodies are never retained here.
 */
export interface HeadingRecord {
  level: number;
  title: string;
  /** Blueprint path for expected headings; source line for received ones. */
  at: string;
}

export interface HeadingMismatch {
  index: number;
  expectedLevel?: number;
  expectedTitle?: string;
  receivedLevel?: number;
  receivedTitle?: string;
}

export interface ManuscriptStructuralDiagnostics {
  expectedHeadingCount: number;
  receivedHeadingCount: number;
  expectedHeadings: HeadingRecord[];
  receivedHeadings: HeadingRecord[];
  mismatches: HeadingMismatch[];
  parseErrors: Array<{ code: string; path: string; message: string }>;
  unsupportedPreamble: boolean;
  /** Bounded, non-reproducing sample so a stray preamble can be recognised. */
  preambleSample?: string;
  malformedHeadingLines: number[];
  narrativePresence: Array<{ path: string; present: boolean; paragraphs: number }>;
}

const HEADING = /^(#{1,6})\s+(.*)$/;

function receivedHeadings(markdown: string): HeadingRecord[] {
  return markdown.split('\n').flatMap((line, index) => {
    const match = HEADING.exec(line.trim());
    return match ? [{ level: match[1].length, title: match[2].trim(), at: `line ${index + 1}` }] : [];
  });
}

function expectedHeadings(blueprint: ReportBlueprint): HeadingRecord[] {
  const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
  return skeleton.headings.map((heading) => ({
    level: heading.level,
    title: heading.title,
    at: heading.subsectionId ?? heading.sectionId ?? heading.chapterId ?? ''
  }));
}

export function buildManuscriptStructuralDiagnostics(input: {
  markdown: string;
  blueprint: ReportBlueprint;
  parsed: ParsedBlueprintMarkdown;
}): ManuscriptStructuralDiagnostics {
  const expected = expectedHeadings(input.blueprint);
  const received = receivedHeadings(input.markdown);

  const mismatches: HeadingMismatch[] = [];
  for (let index = 0; index < Math.max(expected.length, received.length); index += 1) {
    const want = expected[index];
    const got = received[index];
    if (want && got && want.level === got.level && want.title === got.title) continue;
    mismatches.push({
      index,
      expectedLevel: want?.level,
      expectedTitle: want?.title,
      receivedLevel: got?.level,
      receivedTitle: got?.title
    });
  }

  const parseErrors = input.parsed.errors.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message }));
  const unsupportedPreamble = parseErrors.some((issue) => issue.code === 'unsupported_preamble');
  const firstHeadingLine = input.markdown.split('\n').findIndex((line) => HEADING.test(line.trim()));
  const preambleSample = unsupportedPreamble && firstHeadingLine > 0
    ? input.markdown.split('\n').slice(0, firstHeadingLine).join(' ').trim().slice(0, 160)
    : undefined;

  const malformedHeadingLines = parseErrors
    .filter((issue) => issue.code === 'malformed_heading')
    .map((issue) => Number(issue.path.replace(/\D+/g, '')))
    .filter((line) => Number.isFinite(line));

  // Narrative presence is reported per required node so a silent empty section is named.
  const narrativePresence = input.parsed.chapters.flatMap((chapter) =>
    chapter.sections.flatMap((section) => [
      { path: section.sectionId, present: section.paragraphs.length > 0, paragraphs: section.paragraphs.length },
      ...section.subsections.map((subsection) => ({
        path: subsection.subsectionId,
        present: subsection.paragraphs.length > 0,
        paragraphs: subsection.paragraphs.length
      }))
    ])
  );

  return {
    expectedHeadingCount: expected.length,
    receivedHeadingCount: received.length,
    expectedHeadings: expected,
    receivedHeadings: received,
    mismatches,
    parseErrors,
    unsupportedPreamble,
    preambleSample,
    malformedHeadingLines,
    narrativePresence
  };
}

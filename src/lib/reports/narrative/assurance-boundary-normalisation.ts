import type { ParsedBlueprintMarkdown } from './blueprint-text';

/**
 * Deterministic presentation normalisation is limited to equivalent numeric formatting. Semantic
 * language is never rewritten from a phrase dictionary here; it is surfaced to the bounded
 * semantic reviewer and, if repaired, replaced through exact Blueprint block targeting.
 */
function canonicaliseDecimalFormatting(value: string): { text: string; replacements: number } {
  let replacements = 0;
  const text = value.replace(/\b\d+\.\d+%?/g, (token) => {
    const hasPercent = token.endsWith('%');
    const raw = hasPercent ? token.slice(0, -1) : token;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return token;
    const canonical = `${String(parsed)}${hasPercent ? '%' : ''}`;
    if (canonical !== token) replacements += 1;
    return canonical;
  });
  return { text, replacements };
}

function normaliseText(value: string): { text: string; replacements: number } {
  return canonicaliseDecimalFormatting(value);
}

/** Kept as the stable call-site name; it no longer performs semantic phrase rewrites. */
export function normaliseProhibitedAssessmentAssurance(narrative: ParsedBlueprintMarkdown): number {
  let replacements = 0;
  const rewriteBlock = (block: { text: string }) => {
    const result = normaliseText(block.text);
    block.text = result.text;
    replacements += result.replacements;
  };

  for (const chapter of narrative.chapters) {
    for (const section of chapter.sections) {
      section.paragraphs.forEach(rewriteBlock);
      section.subsections.forEach((subsection) => subsection.paragraphs.forEach(rewriteBlock));
    }
  }

  const markdown = normaliseText(narrative.markdown);
  narrative.markdown = markdown.text;
  replacements += markdown.replacements;
  return replacements;
}

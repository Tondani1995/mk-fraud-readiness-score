import type { ParsedBlueprintMarkdown } from './blueprint-text';

/**
 * Deterministic customer-copy normalisation that removes U+2014 from Essential narrative prose.
 *
 * An em dash is a mechanical typography defect, not a matter of semantic judgement, but
 * validateBlueprintTextManuscript() records it as a release-blocking `em_dash` issue and the
 * bounded repair path then spent a provider call on it. In Production attempt 9107326c that call
 * was consumed by an em dash on one paragraph while a customer_copy_leakage defect on a different
 * paragraph went unrepaired, and the manuscript was rejected with the repair budget exhausted.
 *
 * The transform is purely punctuational: the dash and the whitespace around it become a comma.
 * No word is added, removed or reordered, no digit is touched, headings are not rewritten and no
 * paragraph changes owner. The unchanged validator remains authoritative afterwards -- this
 * clears `em_dash` and nothing else, so a paragraph carrying any other prohibited issue still
 * fails.
 */
const EM_DASH = /—/u;

function normaliseEmDashText(value: string): { text: string; replacements: number } {
  if (!EM_DASH.test(value)) return { text: value, replacements: 0 };
  let replacements = 0;
  let text = value.replace(/\s*—\s*/gu, () => {
    replacements += 1;
    return ', ';
  });
  // Tidy only the punctuation the substitution itself can produce. Each of these is a
  // consequence of the replacement above, never a change to the author's wording.
  text = text
    .replace(/,\s*,+/g, ',')          // two dashes collapsing onto one another
    .replace(/\s+([,.;:!?])/g, '$1')  // a space introduced before existing punctuation
    .replace(/,\s*([.;:!?])/g, '$1')  // a dash immediately before sentence punctuation
    .replace(/^\s*,\s*/, '')          // a leading dash
    .replace(/,\s*$/, '');            // a trailing dash
  return { text, replacements };
}

/**
 * Rewrites the parsed prose blocks and the matching Markdown lines. Heading lines are skipped
 * outright so Blueprint structure is byte-identical afterwards.
 */
export function normaliseEssentialEmDashes(narrative: ParsedBlueprintMarkdown): number {
  let replacements = 0;
  const rewriteBlock = (block: { text: string }) => {
    const result = normaliseEmDashText(block.text);
    block.text = result.text;
    replacements += result.replacements;
  };

  for (const chapter of narrative.chapters) {
    for (const section of chapter.sections) {
      section.paragraphs.forEach(rewriteBlock);
      section.subsections.forEach((subsection) => subsection.paragraphs.forEach(rewriteBlock));
    }
  }

  narrative.markdown = narrative.markdown
    .split('\n')
    .map((line) => {
      if (/^\s*#{1,6}\s/.test(line)) return line;
      return normaliseEmDashText(line).text;
    })
    .join('\n');

  return replacements;
}

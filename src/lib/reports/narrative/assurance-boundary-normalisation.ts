import type { ParsedBlueprintMarkdown } from './blueprint-text';

/**
 * Deterministically removes a closed set of assurance-boundary phrases that the Essential
 * writer is not permitted to assert. This is not a provider repair and does not change any
 * score, finding, risk, control, owner, timing or analytical conclusion.
 */
const REWRITES: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\b(?:this|the) assessment has independently (?:verified|reviewed|confirmed)\b/gi,
    replacement: 'the self-assessment responses indicate'
  },
  {
    pattern: /\b(?:this|the) assessment independently (?:verified|reviewed|confirmed)\b/gi,
    replacement: 'the self-assessment responses indicate'
  },
  {
    pattern: /\b(?:this|the) report has independently (?:verified|reviewed|confirmed)\b/gi,
    replacement: 'the self-assessment responses indicate'
  },
  {
    pattern: /\b(?:this|the) report independently (?:verified|reviewed|confirmed)\b/gi,
    replacement: 'the self-assessment responses indicate'
  },
  {
    pattern: /\bMK has independently (?:verified|reviewed|confirmed)\b/gi,
    replacement: 'the self-assessment responses indicate'
  },
  {
    pattern: /\bMK independently (?:verified|reviewed|confirmed)\b/gi,
    replacement: 'the self-assessment responses indicate'
  },
  {
    // An explicit limitation is safe in substance, but the broad assurance guard can still
    // match the words "MK ... independent verification" before it considers the negation.
    // Preserve the limitation while removing that false-positive construction.
    pattern: /\bnot\s+(?:an?\s+)?independent\s+verification\b/gi,
    replacement: 'without verification of operating effectiveness by this review'
  }
];

function normaliseText(value: string): { text: string; replacements: number } {
  let text = value;
  let replacements = 0;
  for (const rewrite of REWRITES) {
    text = text.replace(rewrite.pattern, () => {
      replacements += 1;
      return rewrite.replacement;
    });
  }
  return { text, replacements };
}

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

  // Keep the raw Markdown representation aligned with the parsed blocks so no downstream
  // consumer can accidentally retain the pre-normalised assertion.
  const markdown = normaliseText(narrative.markdown);
  narrative.markdown = markdown.text;
  replacements += markdown.replacements;

  return replacements;
}

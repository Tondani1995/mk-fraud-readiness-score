import type { ParsedBlueprintMarkdown } from './blueprint-text';

/**
 * Deterministic pre-validation cleanup for the Essential manuscript. It removes a closed set
 * of assurance-boundary phrases that the writer is not permitted to assert and canonicalises
 * provider-only decimal formatting so numerically identical Fact Pack values do not fail
 * grounding solely because the provider wrote, for example, 20.00 instead of 20.
 *
 * This is not a provider repair and does not change any score, finding, risk, control, owner,
 * timing or analytical conclusion.
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
    // A provider may state completed assurance passively without naming MK or the report.
    // That is still an unsupported assertion of completed verification and must be converted
    // into the evidence-status limitation the Essential product actually supports.
    pattern: /\boperating effectiveness (?:has been|was) independently (?:verified|reviewed|confirmed)\b/gi,
    replacement: 'operating effectiveness remains subject to evidence validation'
  },
  {
    // An explicit limitation is safe in substance, but the broad assurance guard can still
    // match the words "MK ... independent verification" before it considers the negation.
    // Preserve the limitation while removing that false-positive construction.
    pattern: /\bnot\s+(?:an?\s+)?independent\s+verification\b/gi,
    replacement: 'without verification of operating effectiveness by this review'
  }
];

/**
 * JSON numbers in the deterministic Fact Pack are already canonical (20, 20.5, etc.).
 * Provider prose may render the same value as 20.00 or 20.50. Canonicalise only decimal
 * numeric tokens, preserving a trailing percent sign, so the existing fail-closed numeric
 * validator can compare like with like. Genuinely different values remain untouched.
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
  let text = value;
  let replacements = 0;
  for (const rewrite of REWRITES) {
    text = text.replace(rewrite.pattern, () => {
      replacements += 1;
      return rewrite.replacement;
    });
  }
  const numeric = canonicaliseDecimalFormatting(text);
  text = numeric.text;
  replacements += numeric.replacements;
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
  // consumer can accidentally retain the pre-normalised assertion or numeric formatting.
  const markdown = normaliseText(narrative.markdown);
  narrative.markdown = markdown.text;
  replacements += markdown.replacements;

  return replacements;
}

import type { AssembledReportData } from '../types';
import {
  validateEssentialFinalHtml,
  type EssentialValidationCascadeResult,
  type EssentialValidationCandidate,
  type EssentialValidationDecision
} from '../essential-validation-cascade';
import { adjudicateAssuranceProposition } from '../narrative/assurance-adjudication';

/**
 * Comprehensive final-output context completion.
 *
 * The shared five-layer cascade deliberately treats a final-only assurance-flavoured sentence as
 * unresolved when sentence-level context cannot prove whether it is a completed assurance claim or
 * a customer-owned target-state requirement. Comprehensive contains deterministic register sections
 * whose document role supplies exactly that missing context. Layer 4 must therefore examine the
 * enclosing register before Layer 5 decides whether to hold the report.
 *
 * This module does not whitelist assurance vocabulary. It can only clear a candidate when:
 *   1. the shared assurance core classified the sentence as AMBIGUOUS, never REJECT; and
 *   2. the exact sentence occurs inside a deterministic Comprehensive section that is explicitly
 *      target-state, implementation, evidence-requirement or measurement content.
 *
 * A sentence that the shared core considers a genuine assurance violation remains held even if it
 * is accidentally placed inside one of these sections. That preserves the fail-safe boundary while
 * allowing the DOCUMENT_REVIEW layer to do the contextual work the five-layer architecture promises.
 */

const TARGET_CONTEXT_HEADINGS: ReadonlyArray<{ pattern: RegExp; reasonCode: string }> = [
  { pattern: /\bControl blueprint register\b/i, reasonCode: 'comprehensive_control_blueprint_target_state_context' },
  { pattern: /\bEvidence requirement register\b/i, reasonCode: 'comprehensive_evidence_requirement_context' },
  { pattern: /\b12-month action and assurance register\b/i, reasonCode: 'comprehensive_action_and_assurance_target_state_context' },
  { pattern: /\bMeasurement register\b/i, reasonCode: 'comprehensive_measurement_target_state_context' }
];

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function targetDocumentContext(html: string, span: string): string | null {
  const target = compact(span);
  if (!target) return null;

  for (const match of html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)) {
    const sectionHtml = match[0] ?? '';
    const sectionText = compact(stripHtml(sectionHtml));
    if (!sectionText.includes(target)) continue;

    const headingText = [...sectionHtml.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
      .map((heading) => stripHtml(heading[1] ?? ''))
      .join(' · ');

    for (const context of TARGET_CONTEXT_HEADINGS) {
      if (context.pattern.test(headingText)) return context.reasonCode;
    }
  }

  return null;
}

function replaceLayerDecision(
  item: EssentialValidationCandidate,
  layer: EssentialValidationDecision['layer'],
  disposition: EssentialValidationDecision['disposition'],
  reasonCode: string
): void {
  const index = item.decisions.findIndex((decision) => decision.layer === layer);
  const replacement: EssentialValidationDecision = { layer, disposition, reasonCode };
  if (index >= 0) item.decisions[index] = replacement;
  else item.decisions.push(replacement);
}

export function validateComprehensiveFinalHtml(input: {
  html: string;
  data: AssembledReportData;
}): EssentialValidationCascadeResult {
  const result = validateEssentialFinalHtml(input);

  for (const item of result.candidates) {
    if (item.ruleCode !== 'assurance_language_final' || item.finalDisposition !== 'HELD_FOR_REVIEW') continue;

    // Never allow document context to override a sentence the canonical core regards as an actual
    // assurance violation. Only genuinely unresolved sentence-level propositions are eligible for
    // Layer-4 contextual resolution.
    const core = adjudicateAssuranceProposition(item.span);
    if (core.disposition !== 'AMBIGUOUS') continue;

    const contextReason = targetDocumentContext(input.html, item.span);
    if (!contextReason) continue;

    replaceLayerDecision(item, 'DOCUMENT_REVIEW', 'ALLOW_CONTEXT', contextReason);
    replaceLayerDecision(item, 'FINAL_ACCEPTANCE', 'ACCEPT', 'document_context_cleared_final_ambiguity');
    item.finalDisposition = 'ACCEPT';
  }

  const rejected = result.candidates.filter((item) => item.finalDisposition === 'REJECT');
  const heldForReview = result.candidates.filter((item) => item.finalDisposition === 'HELD_FOR_REVIEW');

  return {
    ...result,
    publishable: rejected.length === 0 && heldForReview.length === 0,
    blockingCodes: [...new Set(rejected.map((item) => item.ruleCode))],
    heldForReviewCodes: [...new Set(heldForReview.map((item) => item.ruleCode))]
  };
}

import crypto from 'node:crypto';
import type { AssembledReportData } from './types';
import type {
  ParsedBlueprintMarkdown,
  TextFirstValidationIssue,
  TextFirstValidationReport
} from './narrative/blueprint-text';
import { compact, UNSUPPORTED_ABSOLUTE_CLAIM_PATTERNS, UNSUPPORTED_OPERATING_DETAIL_CLAIM_PATTERNS } from './narrative/blueprint-text';
import type { NarrativeFactPack } from './narrative/fact-pack';
import { adjudicateAssuranceProposition, isAssuranceCandidate } from './narrative/assurance-adjudication';
import type { SemanticReviewDecision } from './narrative/semantic-reviewer';

export type EssentialValidationLayer =
  | 'CANDIDATE_SCAN'
  | 'CONTEXT_ADJUDICATION'
  | 'EVIDENCE_COMPARISON'
  | 'DOCUMENT_REVIEW'
  | 'FINAL_ACCEPTANCE';

export type EssentialValidationSeverity =
  | 'HARD_TRUTH_FAILURE'
  | 'HARD_CONTRACT_FAILURE'
  | 'REPAIRABLE_TRUTH_FAILURE'
  | 'SEMANTIC_AMBIGUITY'
  | 'QUALITY_FAILURE';

/**
 * Owner decision 2: every layer must record a disposition, and NOT_APPLICABLE is a first-class,
 * honest one -- "this layer had nothing of its own to examine for this candidate" -- rather than
 * silently re-emitting the prior layer's value under a new layer name. See
 * lastSubstantiveDisposition below and the EVIDENCE_COMPARISON/DOCUMENT_REVIEW loops in both
 * adjudication functions for the exact bug this replaced ("the false semantics where
 * EVIDENCE_COMPARISON merely renames the prior disposition").
 */
export type EssentialCandidateDisposition =
  | 'CANDIDATE'
  | 'ALLOW_CONTEXT'
  | 'CONFIRMED_VIOLATION'
  | 'REPAIRABLE'
  | 'AMBIGUOUS'
  | 'NOT_APPLICABLE'
  | 'ACCEPT';

export interface EssentialValidationDecision {
  layer: EssentialValidationLayer;
  disposition: EssentialCandidateDisposition;
  reasonCode: string;
}

export interface EssentialValidationCandidate {
  id: string;
  ruleCode: string;
  severity: EssentialValidationSeverity;
  path: string;
  span: string;
  spanHash: string;
  decisions: EssentialValidationDecision[];
  /**
   * Owner decision 6: HELD_FOR_REVIEW (formerly ESCALATE) is a fail-safe, not-auto-published outcome
   * distinct from REJECT. An unresolved AMBIGUOUS candidate lands here rather than on a rejection,
   * and a held report is never counted as a successful acceptance.
   */
  finalDisposition: 'ACCEPT' | 'REPAIR' | 'HELD_FOR_REVIEW' | 'REJECT' | 'WARN';
}

export interface EssentialValidationCascadeResult {
  policyVersion: 'mk-essential-validation-cascade-v1';
  publishable: boolean;
  finalHtmlSha256?: string;
  candidates: EssentialValidationCandidate[];
  blockingCodes: string[];
  /** Owner decision 6: distinct from blockingCodes -- unresolved ambiguity, not a confirmed violation. */
  heldForReviewCodes: string[];
  warningCodes: string[];
  /**
   * Backwards-compatible assurance-only view of accepted semantic spans. New callers should use
   * acceptedSemanticDecisions so all semantic candidate families can carry forward together.
   */
  acceptedAssuranceSpanHashes: string[];
  /** Content-addressed ALLOW decisions for all semantic candidate families. */
  acceptedSemanticDecisions: Array<{ ruleCode: string; path: string; spanHash: string; reasonCode: string }>;
  /** Candidate decisions that require the bounded repair seam before acceptance. */
  repairCodes: string[];
}

export class EssentialValidationCascadeError extends Error {
  readonly code = 'essential_validation_cascade_failed';
  readonly result: EssentialValidationCascadeResult;

  constructor(result: EssentialValidationCascadeResult) {
    const parts: string[] = [];
    if (result.blockingCodes.length) parts.push(`rejected: ${result.blockingCodes.join(', ')}`);
    if (result.heldForReviewCodes.length) parts.push(`held for review: ${result.heldForReviewCodes.join(', ')}`);
    super(`Essential validation cascade failed (${parts.join('; ') || 'no publishable candidates'})`);
    this.name = 'EssentialValidationCascadeError';
    this.result = result;
  }
}

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
export const essentialCandidateId = (ruleCode: string, path: string, span: string): string =>
  `${ruleCode}:${sha256(`${path}\n${span}`).slice(0, 16)}`;

/**
 * Owner decision 4: normalised, content-addressed sentence identity, used to carry an assurance
 * disposition forward from the manuscript stage to final HTML without re-adjudicating unchanged
 * text. Normalised (not a raw-text hash) because the same proposition reaches final HTML only after
 * a markdown-to-HTML render and an HTML-to-text strip, either of which can shift incidental
 * whitespace or punctuation without changing the sentence's meaning.
 */
export const essentialSemanticSpanHash = (text: string): string => sha256(compact(text));
const spanIdentityHash = essentialSemanticSpanHash;

function candidate(input: {
  ruleCode: string;
  severity: EssentialValidationSeverity;
  path: string;
  span: string;
}): EssentialValidationCandidate {
  return {
    id: essentialCandidateId(input.ruleCode, input.path, input.span),
    ruleCode: input.ruleCode,
    severity: input.severity,
    path: input.path,
    span: input.span,
    spanHash: sha256(input.span),
    decisions: [{ layer: 'CANDIDATE_SCAN', disposition: 'CANDIDATE', reasonCode: 'high_recall_candidate' }],
    finalDisposition: 'HELD_FOR_REVIEW'
  };
}

function addDecision(
  item: EssentialValidationCandidate,
  layer: EssentialValidationLayer,
  disposition: EssentialCandidateDisposition,
  reasonCode: string
): EssentialValidationCandidate {
  item.decisions.push({ layer, disposition, reasonCode });
  return item;
}

/**
 * Owner decision 2: downstream layers act on the most recent SUBSTANTIVE disposition, not
 * necessarily the literal last decision -- a layer that honestly records NOT_APPLICABLE must not
 * look, to the layer after it, like nothing has ever been decided.
 */
function lastSubstantiveDisposition(item: EssentialValidationCandidate): EssentialCandidateDisposition | undefined {
  for (let index = item.decisions.length - 1; index >= 0; index -= 1) {
    const disposition = item.decisions[index].disposition;
    if (disposition !== 'NOT_APPLICABLE') return disposition;
  }
  return undefined;
}

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

/**
 * Final assurance adjudication must preserve semantic block boundaries. Flattening every HTML tag
 * to a single space can fuse an unpunctuated heading, table cell or label to the next paragraph and
 * manufacture a proposition that never existed in either source block. That also defeats the
 * manuscript-stage carry-forward hash because the accepted sentence is no longer byte/meaning
 * equivalent after flattening. Keep block-level boundaries as newlines for assurance sentence
 * extraction while leaving stripHtml() unchanged for document-wide regex checks.
 */
function stripHtmlPreservingBlockBoundaries(html: string): string {
  const blockTags = 'address|article|aside|blockquote|caption|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(new RegExp(`<\\/?(?:${blockTags})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function finalHtmlSentences(html: string): string[] {
  return stripHtmlPreservingBlockBoundaries(html)
    .split(/\n+/)
    .flatMap((block) => sentences(block));
}

/**
 * Thin wrapper around the shared adjudication core (narrative/assurance-adjudication.ts) -- see
 * that module's doc comment for why a single canonical classifier now backs both this function and
 * narrative/validation.ts's classifyAssuranceLanguage. Signature and disposition vocabulary are
 * unchanged so every existing call site in this file (and the committed cascade regression) needs
 * no changes: ALLOW/REJECT/AMBIGUOUS from the shared core map directly onto
 * ALLOW_CONTEXT/CONFIRMED_VIOLATION/AMBIGUOUS here, a direct passthrough rather than the lossy
 * two-state fold classifyAssuranceLanguage performs, so AMBIGUOUS remains observably distinct from
 * CONFIRMED_VIOLATION at every downstream cascade layer (owner decision 6).
 */
export function adjudicateAssuranceSentence(sentence: string): {
  disposition: 'ALLOW_CONTEXT' | 'CONFIRMED_VIOLATION' | 'AMBIGUOUS';
  reasonCode: string;
} {
  const result = adjudicateAssuranceProposition(sentence);
  const disposition = result.disposition === 'ALLOW' ? 'ALLOW_CONTEXT' : result.disposition === 'REJECT' ? 'CONFIRMED_VIOLATION' : 'AMBIGUOUS';
  return { disposition, reasonCode: result.reasonCode };
}

function textBlocks(parsed: ParsedBlueprintMarkdown): Map<string, string> {
  const result = new Map<string, string>();
  for (const chapter of parsed.chapters) {
    for (const section of chapter.sections) {
      section.paragraphs.forEach((block, index) => result.set(`${section.sectionId}.paragraphs[${index}]`, block.text));
      for (const subsection of section.subsections) {
        subsection.paragraphs.forEach((block, index) => result.set(`${subsection.subsectionId}.paragraphs[${index}]`, block.text));
      }
    }
  }
  return result;
}

function severityForTextFirstIssue(issue: TextFirstValidationIssue): EssentialValidationSeverity {
  if (issue.code === 'mechanical_format' || issue.code === 'repetition' || issue.code === 'excess_disclaimer') return 'QUALITY_FAILURE';
  if (SEMANTIC_RULE_CODES.has(issue.code)) return 'SEMANTIC_AMBIGUITY';
  if (issue.code === 'raw_internal_id' || issue.code === 'unsupported_numeric_claim') return 'HARD_CONTRACT_FAILURE';
  return 'HARD_TRUTH_FAILURE';
}

/** Linguistic detectors are candidate generators; they are never hard gates by themselves. */
const SEMANTIC_RULE_CODES = new Set([
  'assurance_claim',
  'unsupported_comparative_claim',
  'unsupported_workforce_claim',
  'unsupported_structure_claim',
  'semantic_grounding_block',
  ...UNSUPPORTED_ABSOLUTE_CLAIM_PATTERNS.map(([code]) => code),
  ...UNSUPPORTED_OPERATING_DETAIL_CLAIM_PATTERNS.map(([code]) => code)
]);

function semanticIssueKey(issue: TextFirstValidationIssue): string {
  return `${issue.code}|${issue.path}|${issue.matchedSpan ?? issue.message}`;
}

/**
 * Canonical adjudication boundary for provider-authored v1.1 manuscript text.
 *
 * The text-first validator is intentionally high recall. Its output is therefore input to this
 * cascade, not the release decision itself. Hard evidence/contract mismatches remain hard; only
 * contextual language candidates (notably assurance wording) can be cleared by a later layer.
 *
 * Five layers, honestly (owner decision 2): CANDIDATE_SCAN (the high-recall detector that produced
 * `report`) -> CONTEXT_ADJUDICATION (does the surrounding language make this a genuine violation?)
 * -> EVIDENCE_COMPARISON (for the two candidate types actually gated on Fact Pack evidence, does the
 * live factPack support the claim?) -> DOCUMENT_REVIEW (any whole-manuscript-level fact left to
 * weigh?) -> FINAL_ACCEPTANCE. A layer with nothing new to examine for a given candidate honestly
 * records NOT_APPLICABLE rather than re-emitting the previous layer's disposition under its own
 * name.
 */
export function adjudicateTextFirstValidation(input: {
  parsed: ParsedBlueprintMarkdown;
  report: TextFirstValidationReport;
  factPack: NarrativeFactPack;
  /** Closed decisions returned by the one bounded semantic reviewer request. */
  semanticDecisions?: SemanticReviewDecision[];
  /** Production sets this so a lexical candidate cannot fall through to a rule-based verdict. */
  requireSemanticReviewer?: boolean;
  /** Production supplies every provider-authored paragraph, including paragraphs with no warning. */
  semanticGroundingBlocks?: Array<{ path: string; span: string }>;
}): EssentialValidationCascadeResult {
  const blocks = textBlocks(input.parsed);
  const groundingMode = input.semanticGroundingBlocks !== undefined;
  const legacySemanticIssues = input.report.hardTruth.issues.filter((issue) => SEMANTIC_RULE_CODES.has(issue.code));
  const lexicalSemanticIssues = [...(input.report.semanticCandidates?.issues ?? []), ...legacySemanticIssues]
    .filter((issue, index, all) => all.findIndex((other) => semanticIssueKey(other) === semanticIssueKey(issue)) === index);
  // In the production path lexical findings are warning signals attached to a full-block review
  // unit. Keeping them out of the candidate ledger prevents a second, narrower lexical decision
  // from bypassing the block-level reviewer. The legacy branch preserves the old unit-test seam.
  const semanticIssues = groundingMode ? [] : lexicalSemanticIssues;
  const hardTruthIssues = input.report.hardTruth.issues.filter((issue) => !SEMANTIC_RULE_CODES.has(issue.code));
  const allIssues = [...hardTruthIssues, ...semanticIssues, ...input.report.repairableSemantic.issues, ...input.report.quality.issues];
  const candidates = allIssues.map((issue) => candidate({
    ruleCode: issue.code,
    severity: severityForTextFirstIssue(issue),
    path: issue.path,
    span: issue.matchedSpan ?? blocks.get(issue.path) ?? issue.code
  }));
  if (groundingMode) {
    candidates.push(...input.semanticGroundingBlocks!.map((block) => candidate({
      ruleCode: 'semantic_grounding_block',
      severity: 'SEMANTIC_AMBIGUITY',
      path: block.path,
      span: block.span
    })));
  }

  const semanticDecisionByCandidateId = new Map((input.semanticDecisions ?? []).map((decision) => [decision.candidateId, decision]));

  // Prescriptive target-state language is advisory content, not a claim that the organisation
  // already operates this way. Keep the classifier deliberately narrow: it must read as an action
  // for management/future delivery, not as a present-state assertion.
  function isPrescriptiveManagementDesignContext(source: string): boolean {
    const text = source.trim();
    if (!text) return false;
    const prescriptiveLead = /^(?:by\s+(?:30|60|90)\s+days\b|management\s+(?:should|must|needs?\s+to)\b|the\s+priority\s+for\s+management\s+is\s+to\b|to\s+support\s+(?:these|the)\s+(?:responses?|priorities|controls?),?\s+|(?:establish|adopt|implement|introduce|approve|confirm|define|document|assign|create|require|preserve|record|configure|test|strengthen|formalise|formalize|embed|sequence)\b)/i;
    const currentStateLead = /^(?:the|this|management|finance|operations|procurement|fraud|staff|employees?|the\s+organisation|the\s+organization)\s+(?:is|are|has|have|performs?|uses?|operates?|maintains?|reviews?|monitors?|records?|requires?|relies?|sits?|provides?)\b/i;
    return prescriptiveLead.test(text) && !currentStateLead.test(text);
  }

  // A reviewer REPAIR is also advisory. Relative-strength language that is explicitly bounded
  // to the self-assessment is not a present-state operating claim and should not be rewritten.
  function isBoundedRelativeStrengthContext(source: string): boolean {
    const text = source.trim();
    if (!text) return false;
    const bounded = /\b(?:self[-‑ ]assessed|reported|comparatively stronger|relative strength|relative strengths|stronger reported position|stronger self[-‑ ]assessed position)\b/i.test(text);
    const unsupportedOperatingUpgrade = /\b(?:functioning|effective|operational|embedded|operating in practice|established (?:capability|foundation|foundations)|functioning foundation|workable foundation|foundation already in place|leadership attention|management commitment|mobilisation capacity|mobilization capacity)\b/i.test(text);
    return bounded && !unsupportedOperatingUpgrade;
  }

  // Comparing deterministic scores or relative positions inside this same assessment is not an
  // external benchmark claim. Keep this narrow: external comparisons and invented organisational
  // structures remain outside the allowance even when a paragraph also mentions a domain score.
  function isBoundedIntraProfileComparison(source: string): boolean {
    const text = source.trim();
    if (!text) return false;
    const internalFrame = /\b(?:within (?:that|this|the) profile|assessed profile|domain(?:s)?|score(?:s)?|reported position(?:s)?)\b/i.test(text);
    const comparative = /\b(?:higher|lower|stronger|weaker|comparatively stronger|relatively stronger|materially weaker|above|below)\b/i.test(text);
    const externalFrame = /\b(?:peer(?:s)?|similar[- ]sized|industry|benchmark(?:s|ed|ing)?|average(?:s)?|median(?:s)?|percentile(?:s)?)\b/i.test(text);
    const inventedStructureFrame = /\b(?:team|committee|department|function|unit|division|headcount|reporting line|reports to)\b/i.test(text);
    return internalFrame && comparative && !externalFrame && !inventedStructureFrame;
  }

  function semanticDisposition(item: EssentialValidationCandidate, source: string): { disposition: EssentialCandidateDisposition; reasonCode: string; repair: boolean } {
    const reviewed = semanticDecisionByCandidateId.get(item.id);
    if (reviewed) {
      // Semantic review is advisory to the five-layer cascade, never a release verdict by itself.
      // Deterministic hard gates have already run. The shared assurance core independently checks
      // actor, modality, tense, negation and customer-control context so neither a false REJECT nor
      // an unsafe ALLOW can override the canonical safety decision.
      const assurance = adjudicateAssuranceSentence(source);
      if (assurance.disposition === 'CONFIRMED_VIOLATION') {
        return { disposition: 'CONFIRMED_VIOLATION', reasonCode: assurance.reasonCode, repair: false };
      }
      if (reviewed.disposition === 'REPAIR') {
        if ((reviewed.reasonCode === 'unsupported_comparison' || reviewed.reasonCode === 'unsupported_structure') && isBoundedIntraProfileComparison(source)) {
          return { disposition: 'ALLOW_CONTEXT', reasonCode: 'reviewer_repair_signal_cleared_by_intra_profile_score_comparison', repair: false };
        }
        if (reviewed.reasonCode === 'repairable_overstatement' && isBoundedRelativeStrengthContext(source)) {
          return { disposition: 'ALLOW_CONTEXT', reasonCode: 'reviewer_repair_signal_cleared_by_bounded_relative_strength_context', repair: false };
        }
        if (isPrescriptiveManagementDesignContext(source)) {
          return { disposition: 'ALLOW_CONTEXT', reasonCode: 'reviewer_repair_signal_cleared_by_prescriptive_target_state_context', repair: false };
        }
        return { disposition: 'REPAIRABLE', reasonCode: reviewed.reasonCode, repair: true };
      }
      if (reviewed.disposition === 'HOLD') {
        return { disposition: 'AMBIGUOUS', reasonCode: reviewed.reasonCode, repair: false };
      }
      if (reviewed.disposition === 'REJECT') {
        if ((reviewed.reasonCode === 'unsupported_comparison' || reviewed.reasonCode === 'unsupported_structure') && isBoundedIntraProfileComparison(source)) {
          return { disposition: 'ALLOW_CONTEXT', reasonCode: 'reviewer_adverse_signal_cleared_by_intra_profile_score_comparison', repair: false };
        }
        if (reviewed.reasonCode === 'unsupported_assurance' && assurance.disposition === 'ALLOW_CONTEXT') {
          return { disposition: 'ALLOW_CONTEXT', reasonCode: `reviewer_adverse_signal_cleared_by_shared_assurance_core:${assurance.reasonCode}`, repair: false };
        }
        if (reviewed.reasonCode === 'unsupported_operating_detail' && isPrescriptiveManagementDesignContext(source)) {
          return { disposition: 'ALLOW_CONTEXT', reasonCode: 'reviewer_adverse_signal_cleared_by_prescriptive_target_state_context', repair: false };
        }
        return { disposition: 'AMBIGUOUS', reasonCode: `semantic_reviewer_adverse_signal_unconfirmed:${reviewed.reasonCode}`, repair: false };
      }
      if (assurance.disposition === 'AMBIGUOUS') {
        return { disposition: 'AMBIGUOUS', reasonCode: assurance.reasonCode, repair: false };
      }
      return { disposition: 'ALLOW_CONTEXT', reasonCode: reviewed.reasonCode, repair: false };
    }
    if (input.requireSemanticReviewer) return { disposition: 'AMBIGUOUS', reasonCode: 'semantic_reviewer_decision_missing', repair: false };
    // Compatibility behaviour for the pre-existing provider-free cascade unit tests. Production
    // always passes requireSemanticReviewer when semantic candidates exist.
    if (item.ruleCode === 'assurance_claim') {
      const decision = adjudicateAssuranceSentence(source);
      return { disposition: decision.disposition, reasonCode: decision.reasonCode, repair: false };
    }
    return { disposition: 'CONFIRMED_VIOLATION', reasonCode: 'unresolved_semantic_candidate', repair: false };
  }

  // Layer 2: hard gates are confirmed without semantic review; language candidates consume the
  // closed reviewer decision supplied by the caller. No candidate is promoted to a truth decision
  // merely because a lexical detector matched it.
  const acceptedAssuranceSpanHashes: string[] = [];
  const acceptedSemanticDecisions: Array<{ ruleCode: string; path: string; spanHash: string; reasonCode: string }> = [];
  for (const item of candidates) {
    const source = blocks.get(item.path) ?? '';
    if (SEMANTIC_RULE_CODES.has(item.ruleCode)) {
      const decision = semanticDisposition(item, source);
      addDecision(item, 'CONTEXT_ADJUDICATION', decision.disposition, decision.reasonCode);
      if (decision.disposition === 'ALLOW_CONTEXT') {
        acceptedSemanticDecisions.push({ ruleCode: item.ruleCode, path: item.path, spanHash: spanIdentityHash(item.span), reasonCode: decision.reasonCode });
        if (item.ruleCode === 'assurance_claim') {
          acceptedAssuranceSpanHashes.push(spanIdentityHash(item.span));
          for (const sentence of sentences(source)) {
            if (isAssuranceCandidate(sentence)) acceptedAssuranceSpanHashes.push(spanIdentityHash(sentence));
          }
        }
      }
    } else if (item.severity === 'QUALITY_FAILURE') {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'REPAIRABLE', 'editorial_quality_candidate');
    } else {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'CONFIRMED_VIOLATION', 'typed_or_contract_issue_not_context_overridable');
    }
  }

  // Layer 3 remains a deterministic hard-truth recheck. Unsupported numeric claims are never
  // overridable by the reviewer; ambiguous organisational/workforce/comparative wording remains a
  // semantic candidate and is not silently converted into a fact verdict here.
  for (const item of candidates) {
    const source = blocks.get(item.path) ?? '';
    if (item.ruleCode === 'unsupported_numeric_claim') {
      addDecision(item, 'EVIDENCE_COMPARISON', 'CONFIRMED_VIOLATION', 'unsupported_numeric_claim_is_hard_gate');
    } else if (SEMANTIC_RULE_CODES.has(item.ruleCode)) {
      addDecision(item, 'EVIDENCE_COMPARISON', 'NOT_APPLICABLE', 'semantic_candidate_requires_bounded_reviewer_decision');
    } else {
      addDecision(item, 'EVIDENCE_COMPARISON', 'NOT_APPLICABLE', 'no_fact_pack_evidence_dimension_for_candidate_type');
    }
  }

  // Layer 4 (whole-document review). Repetition and excess-disclaimer signals are already whole-
  // manuscript-scoped facts computed once by blueprint-text.ts's own duplicate/disclaimer-density
  // pass at candidate-scan time; nothing here re-examines the assembled manuscript a second time, so
  // every candidate honestly carries NOT_APPLICABLE rather than claiming a review that did not occur
  // (owner decision 2's five-layer contract explicitly allows this).
  for (const item of candidates) {
    addDecision(item, 'DOCUMENT_REVIEW', 'NOT_APPLICABLE', 'no_additional_whole_document_fact_beyond_prior_layers');
  }

  for (const item of candidates) {
    const prior = lastSubstantiveDisposition(item);
    if (prior === 'ACCEPT' || prior === 'ALLOW_CONTEXT') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'ACCEPT', 'cascade_cleared');
      item.finalDisposition = 'ACCEPT';
    } else if (prior === 'REPAIRABLE' && SEMANTIC_RULE_CODES.has(item.ruleCode)) {
      addDecision(item, 'FINAL_ACCEPTANCE', 'REPAIRABLE', 'bounded_semantic_repair_required');
      item.finalDisposition = 'REPAIR';
    } else if (prior === 'REPAIRABLE') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'REPAIRABLE', 'quality_repair_or_warning');
      item.finalDisposition = 'WARN';
    } else if (prior === 'AMBIGUOUS') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'AMBIGUOUS', 'unresolved_high_risk_ambiguity');
      item.finalDisposition = 'HELD_FOR_REVIEW';
    } else {
      addDecision(item, 'FINAL_ACCEPTANCE', 'CONFIRMED_VIOLATION', 'confirmed_failure');
      item.finalDisposition = 'REJECT';
    }
  }

  const rejected = candidates.filter((item) => item.finalDisposition === 'REJECT');
  const heldForReview = candidates.filter((item) => item.finalDisposition === 'HELD_FOR_REVIEW');
  const repairs = candidates.filter((item) => item.finalDisposition === 'REPAIR');
  return {
    policyVersion: 'mk-essential-validation-cascade-v1',
    publishable: rejected.length === 0 && heldForReview.length === 0 && repairs.length === 0,
    candidates,
    blockingCodes: [...new Set(rejected.map((item) => item.ruleCode))],
    heldForReviewCodes: [...new Set(heldForReview.map((item) => item.ruleCode))],
    warningCodes: [...new Set(candidates.filter((item) => item.finalDisposition === 'WARN').map((item) => item.ruleCode))],
    acceptedAssuranceSpanHashes: [...new Set(acceptedAssuranceSpanHashes)],
    acceptedSemanticDecisions,
    repairCodes: [...new Set(repairs.map((item) => item.ruleCode))]
  };
}

export function assertTextFirstValidationCascade(input: {
  parsed: ParsedBlueprintMarkdown;
  report: TextFirstValidationReport;
  factPack: NarrativeFactPack;
  semanticDecisions?: SemanticReviewDecision[];
  requireSemanticReviewer?: boolean;
  semanticGroundingBlocks?: Array<{ path: string; span: string }>;
}): EssentialValidationCascadeResult {
  const result = adjudicateTextFirstValidation(input);
  if (!result.publishable) throw new EssentialValidationCascadeError(result);
  return result;
}

const FINAL_RAW_ID = /\bD\d+-Q\d+\b/g;
const FINAL_BROKEN_PROOF = /provides operating evidence that[^.]{0,500}?is implemented across the complete in-scope population/gi;
const FINAL_BROKEN_NEXT_STEP = /\bConfirm\s+This evidence should demonstrate\b/gi;
const FINAL_UNSUPPORTED_ABSOLUTES = [...UNSUPPORTED_ABSOLUTE_CLAIM_PATTERNS, ...UNSUPPORTED_OPERATING_DETAIL_CLAIM_PATTERNS];
const FINAL_SEMANTIC_RULE_CODES = new Set(FINAL_UNSUPPORTED_ABSOLUTES.map(([code]) => code));
const GENERIC_PROOF = 'This evidence should demonstrate that the linked control requirements operate consistently across the complete in-scope population.';

function isFinalSemanticCandidate(ruleCode: string): boolean {
  return FINAL_SEMANTIC_RULE_CODES.has(ruleCode);
}

function providerNarrativeBlocksFromHtml(html: string): Array<{ path: string; span: string }> {
  const blocks: Array<{ path: string; span: string }> = [];
  const pattern = /<p\b[^>]*data-narrative-block="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const path = match[1]?.trim();
    if (!path) continue;
    blocks.push({ path, span: stripHtml(match[2] ?? '') });
  }
  return blocks;
}

/** Remove reviewed provider blocks before final lexical scans; binding owns their decision. */
function stripProviderNarrativeBlocks(html: string): string {
  return html.replace(/<p\b[^>]*data-narrative-block="[^"]+"[^>]*>[\s\S]*?<\/p>/gi, ' ');
}

function scanFinalHtml(html: string): EssentialValidationCandidate[] {
  const text = stripHtml(html);
  const semanticHtml = stripProviderNarrativeBlocks(html);
  const semanticText = stripHtml(semanticHtml);
  const coreHtml = html.split(/<h2[^>]*>\s*Appendix: supporting material\s*<\/h2>/i)[0] ?? html;
  const coreText = stripHtml(coreHtml);
  const found: EssentialValidationCandidate[] = [];
  for (const block of providerNarrativeBlocksFromHtml(html)) {
    found.push(candidate({ ruleCode: 'semantic_grounding_block_final', severity: 'HARD_CONTRACT_FAILURE', path: block.path, span: block.span }));
  }
  for (const match of coreText.match(FINAL_RAW_ID) ?? []) {
    found.push(candidate({ ruleCode: 'raw_internal_id_final', severity: 'HARD_CONTRACT_FAILURE', path: 'final_html_core', span: match }));
  }
  for (const match of text.match(FINAL_BROKEN_PROOF) ?? []) {
    found.push(candidate({ ruleCode: 'broken_proof_construction', severity: 'QUALITY_FAILURE', path: 'final_html', span: match }));
  }
  for (const match of text.match(FINAL_BROKEN_NEXT_STEP) ?? []) {
    found.push(candidate({ ruleCode: 'broken_next_step_construction', severity: 'QUALITY_FAILURE', path: 'final_html', span: match }));
  }
  for (const [code, pattern] of FINAL_UNSUPPORTED_ABSOLUTES) {
    for (const match of semanticText.match(pattern) ?? []) {
      found.push(candidate({ ruleCode: code, severity: 'SEMANTIC_AMBIGUITY', path: 'final_html', span: match }));
    }
  }
  for (const sentence of finalHtmlSentences(semanticHtml)) {
    if (!isAssuranceCandidate(sentence)) continue;
    found.push(candidate({ ruleCode: 'assurance_language_final', severity: 'SEMANTIC_AMBIGUITY', path: 'final_html', span: sentence }));
  }
  const genericProofCount = text.split(GENERIC_PROOF).length - 1;
  if (genericProofCount > 1) {
    found.push(candidate({ ruleCode: 'generic_proof_saturation', severity: 'QUALITY_FAILURE', path: 'proof_requirements', span: `${genericProofCount}` }));
  }
  if (/Priority control weakness[\s\S]{0,1500}?This is a maturity-limiting control condition/i.test(html)) {
    found.push(candidate({ ruleCode: 'materiality_explanation_contradiction', severity: 'HARD_TRUTH_FAILURE', path: 'findings', span: 'priority-vs-maturity' }));
  }
  if (/\bRecorded absent\b/i.test(text)) {
    found.push(candidate({ ruleCode: 'misleading_absent_label', severity: 'HARD_TRUTH_FAILURE', path: 'domain_overview', span: 'Recorded absent' }));
  }
  if (/\.metric-grid\s*\{[^}]*\}/i.test(html) && !/\.metric-grid\s*\{[^}]*break-inside:\s*avoid;[^}]*page-break-inside:\s*avoid;/i.test(html)) {
    found.push(candidate({ ruleCode: 'metric_grid_break_risk', severity: 'QUALITY_FAILURE', path: 'executive_metrics', span: 'metric-grid' }));
  }
  return found;
}

/**
 * Five-stage final-customer cascade. Every later stage consumes the prior stage's ledger.
 * No stage independently resets the decision. The HTML hash returned here is the immutable byte
 * source that may be passed to Chromium; callers must not mutate the HTML after this assertion.
 */
export function validateEssentialFinalHtml(input: {
  html: string;
  data: AssembledReportData;
  /**
   * Owner decision 4: sha256(compact(sentence)) identities of assurance-language sentences already
   * cleared to ALLOW_CONTEXT at manuscript stage (adjudicateTextFirstValidation's
   * acceptedAssuranceSpanHashes). A final-HTML sentence whose normalised identity matches inherits
   * that decision instead of being re-adjudicated from scratch; only new or changed assurance
   * sentences are freshly run through adjudicateAssuranceSentence.
   */
  carryForwardAssuranceSpanHashes?: string[];
  carryForwardSemanticDecisions?: Array<{ ruleCode: string; path?: string; spanHash: string; reasonCode?: string }>;
}): EssentialValidationCascadeResult {
  const candidates = scanFinalHtml(input.html);
  const carryForward = new Set(input.carryForwardAssuranceSpanHashes ?? []);
  const carryForwardSemanticDecisions = input.carryForwardSemanticDecisions ?? [];
  const carryForwardSemantic = new Set(carryForwardSemanticDecisions.map((item) => `${item.ruleCode}|${item.spanHash}`));
  const carriedGroundingBlocks = new Map(
    carryForwardSemanticDecisions
      .filter((item) => item.ruleCode === 'semantic_grounding_block' && item.path)
      .map((item) => [item.path!, item])
  );
  const renderedGroundingBlocks = providerNarrativeBlocksFromHtml(input.html);
  const renderedGroundingPathCounts = new Map<string, number>();
  for (const block of renderedGroundingBlocks) renderedGroundingPathCounts.set(block.path, (renderedGroundingPathCounts.get(block.path) ?? 0) + 1);
  const finalSentences = finalHtmlSentences(stripProviderNarrativeBlocks(input.html));

  // A provider-authored block is accepted only when the exact path is present once and its
  // content-addressed prose is unchanged from the manuscript-stage decision. This is a binding
  // contract, not a new semantic verdict, so changed/missing/duplicated prose fails closed.
  for (const [path, carried] of carriedGroundingBlocks) {
    const count = renderedGroundingPathCounts.get(path) ?? 0;
    if (count !== 1) {
      candidates.push(candidate({ ruleCode: 'semantic_grounding_block_binding_missing', severity: 'HARD_CONTRACT_FAILURE', path, span: path }));
      continue;
    }
    const rendered = renderedGroundingBlocks.find((block) => block.path === path);
    if (!rendered || essentialSemanticSpanHash(rendered.span) !== carried.spanHash) {
      candidates.push(candidate({ ruleCode: 'semantic_grounding_block_content_changed', severity: 'HARD_CONTRACT_FAILURE', path, span: rendered?.span ?? path }));
    }
  }

  for (const item of candidates) {
    if (item.ruleCode === 'semantic_grounding_block_final') {
      const carried = carriedGroundingBlocks.get(item.path);
      const count = renderedGroundingPathCounts.get(item.path) ?? 0;
      if (carried && count === 1 && essentialSemanticSpanHash(item.span) === carried.spanHash) {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'ALLOW_CONTEXT', 'inherited_exact_block_acceptance_unchanged_content');
      } else {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'CONFIRMED_VIOLATION', 'final_provider_block_binding_failed');
      }
    } else if (item.ruleCode === 'assurance_language_final') {
      // Resolve the exact candidate sentence by hash from the immutable final HTML using the SAME
      // block-aware segmentation used by scanFinalHtml. This keeps manuscript carry-forward identity
      // stable across HTML presentation boundaries instead of resolving against a flattened document.
      const sentence = finalSentences.find((value) => sha256(value) === item.spanHash) ?? '';
      if (carryForward.has(spanIdentityHash(sentence)) || carryForwardSemantic.has(`${item.ruleCode}|${spanIdentityHash(item.span)}`)) {
        // Owner decision 4: unchanged content inherits its manuscript-stage decision rather than
        // being re-adjudicated from scratch.
        addDecision(item, 'CONTEXT_ADJUDICATION', 'ALLOW_CONTEXT', 'inherited_manuscript_stage_acceptance_unchanged_content');
      } else {
        const decision = adjudicateAssuranceSentence(sentence);
        // A final-only assurance phrase has no manuscript-stage reviewer decision. Deterministic
        // context may clear an explicit limitation or proof criterion, but a regex/core result that
        // would reject or remain ambiguous is held rather than promoted to a customer-blocking truth
        // decision. Positive assurance must be resolved upstream and carried forward.
        addDecision(
          item,
          'CONTEXT_ADJUDICATION',
          decision.disposition === 'ALLOW_CONTEXT' ? 'ALLOW_CONTEXT' : 'AMBIGUOUS',
          decision.disposition === 'ALLOW_CONTEXT' ? decision.reasonCode : 'final_assurance_candidate_requires_manuscript_adjudication'
        );
      }
    } else if (isFinalSemanticCandidate(item.ruleCode)) {
      if (carryForwardSemantic.has(`${item.ruleCode}|${spanIdentityHash(item.span)}`)) {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'ALLOW_CONTEXT', 'inherited_manuscript_stage_semantic_acceptance_unchanged_content');
      } else {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'AMBIGUOUS', 'final_semantic_candidate_requires_manuscript_adjudication');
      }
    } else if (item.severity === 'QUALITY_FAILURE') {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'REPAIRABLE', 'customer_visible_quality_candidate');
    } else {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'CONFIRMED_VIOLATION', 'hard_candidate_requires_evidence_confirmation');
    }
  }

  // Layer 3: no final-HTML candidate type is fact-pack-evidence-gated -- the two that are
  // (unsupported_numeric_claim, unsupported_structure_claim) are manuscript-only and never reach
  // this stage. Assurance wording is a closed linguistic question already settled at Layer 2 (fresh
  // or inherited); every other final-HTML candidate type is an absolute structural/quality pattern
  // with no fact-pack dimension. Honestly NOT_APPLICABLE rather than the prior code's silent relabel
  // of Layer 2's disposition under the EVIDENCE_COMPARISON name (owner decision 2).
  for (const item of candidates) {
    addDecision(item, 'EVIDENCE_COMPARISON', 'NOT_APPLICABLE', item.ruleCode === 'assurance_language_final'
      ? 'closed_linguistic_question_resolved_at_context_adjudication'
      : 'no_fact_pack_evidence_dimension_for_candidate_type');
  }

  // Layer 4 explicitly reviews the accumulated decisions at document level. At the paid-product
  // acceptance bar, a customer-visible quality defect Layer 2 marked repairable is release-blocking
  // -- new information this layer actually decides, not merely inherited. Everything else was
  // already fully settled by an earlier layer with nothing further to examine at document scope, so
  // it is honestly NOT_APPLICABLE rather than re-emitting the prior value under the DOCUMENT_REVIEW
  // name (owner decision 2: "must not claim ... document review occurred if none was examined").
  for (const item of candidates) {
    const prior = lastSubstantiveDisposition(item);
    if (prior === 'REPAIRABLE') addDecision(item, 'DOCUMENT_REVIEW', 'CONFIRMED_VIOLATION', 'paid_product_quality_bar_not_met');
    else addDecision(item, 'DOCUMENT_REVIEW', 'NOT_APPLICABLE', 'no_additional_whole_document_fact_beyond_prior_layers');
  }

  for (const item of candidates) {
    const prior = lastSubstantiveDisposition(item);
    if (prior === 'ALLOW_CONTEXT') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'ACCEPT', 'all_layers_cleared');
      item.finalDisposition = 'ACCEPT';
    } else if (prior === 'CONFIRMED_VIOLATION') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'CONFIRMED_VIOLATION', 'final_customer_output_rejected');
      item.finalDisposition = 'REJECT';
    } else {
      addDecision(item, 'FINAL_ACCEPTANCE', 'AMBIGUOUS', 'unresolved_final_ambiguity');
      item.finalDisposition = 'HELD_FOR_REVIEW';
    }
  }

  const rejected = candidates.filter((item) => item.finalDisposition === 'REJECT');
  const heldForReview = candidates.filter((item) => item.finalDisposition === 'HELD_FOR_REVIEW');
  return {
    policyVersion: 'mk-essential-validation-cascade-v1',
    publishable: rejected.length === 0 && heldForReview.length === 0,
    finalHtmlSha256: sha256(input.html),
    candidates,
    blockingCodes: [...new Set(rejected.map((item) => item.ruleCode))],
    heldForReviewCodes: [...new Set(heldForReview.map((item) => item.ruleCode))],
    warningCodes: [],
    acceptedAssuranceSpanHashes: [],
    acceptedSemanticDecisions: [],
    repairCodes: []
  };
}

export function assertEssentialFinalHtml(input: {
  html: string;
  data: AssembledReportData;
  carryForwardAssuranceSpanHashes?: string[];
  carryForwardSemanticDecisions?: Array<{ ruleCode: string; path?: string; spanHash: string; reasonCode?: string }>;
}): EssentialValidationCascadeResult {
  const result = validateEssentialFinalHtml(input);
  if (!result.publishable) throw new EssentialValidationCascadeError(result);
  return result;
}

import crypto from 'node:crypto';
import type { AssembledReportData } from './types';
import type {
  ParsedBlueprintMarkdown,
  TextFirstValidationIssue,
  TextFirstValidationReport
} from './narrative/blueprint-text';
import { compact, numericValues, UNEVIDENCED_STRUCTURE } from './narrative/blueprint-text';
import type { NarrativeFactPack } from './narrative/fact-pack';
import { adjudicateAssuranceProposition, isAssuranceCandidate } from './narrative/assurance-adjudication';

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
   * Owner decision 4: sha256(compact(sentence)) identities of assurance-language sentences
   * ALLOW_CONTEXT'd by adjudicateTextFirstValidation, so validateEssentialFinalHtml's
   * carryForwardAssuranceSpanHashes input can inherit that decision for byte-identical content
   * instead of re-adjudicating it from scratch. Always empty from validateEssentialFinalHtml itself,
   * which has no further downstream stage to carry forward to.
   */
  acceptedAssuranceSpanHashes: string[];
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
const candidateId = (ruleCode: string, path: string, span: string): string =>
  `${ruleCode}:${sha256(`${path}\n${span}`).slice(0, 16)}`;

/**
 * Owner decision 4: normalised, content-addressed sentence identity, used to carry an assurance
 * disposition forward from the manuscript stage to final HTML without re-adjudicating unchanged
 * text. Normalised (not a raw-text hash) because the same proposition reaches final HTML only after
 * a markdown-to-HTML render and an HTML-to-text strip, either of which can shift incidental
 * whitespace or punctuation without changing the sentence's meaning.
 */
const spanIdentityHash = (text: string): string => sha256(compact(text));

function candidate(input: {
  ruleCode: string;
  severity: EssentialValidationSeverity;
  path: string;
  span: string;
}): EssentialValidationCandidate {
  return {
    id: candidateId(input.ruleCode, input.path, input.span),
    ruleCode: input.ruleCode,
    severity: input.severity,
    path: input.path,
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

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Owner decision 3: genuine re-consumption of the same Fact Pack grounding blueprint-text.ts uses at
 * candidate-scan time, reused (not duplicated) via its exported numericValues. The grounding rule
 * itself is unchanged and stays exactly as strict as before ("existing hard deterministic
 * arithmetic/grounding controls remain strict and unchanged") -- what changes is that this layer now
 * actually performs the comparison against the live factPack argument instead of assuming Layer 2's
 * disposition still holds.
 */
function isNumericClaimGrounded(span: string, factPack: NarrativeFactPack): boolean {
  const knownNumbers = numericValues(factPack);
  const tokens = span.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  if (tokens.length === 0) return true;
  return tokens.every((token) => knownNumbers.has(token.replace('%', '')));
}

/** Owner decision 3: same reasoning as isNumericClaimGrounded, for structural claims. */
function isStructureClaimGrounded(span: string, factPack: NarrativeFactPack): boolean {
  const matches = span.match(UNEVIDENCED_STRUCTURE) ?? [];
  if (matches.length === 0) return true;
  const haystack = compact(JSON.stringify(factPack)).toLowerCase();
  return matches.every((match) => haystack.includes(match.toLowerCase()));
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
  if (issue.code === 'assurance_claim') return 'SEMANTIC_AMBIGUITY';
  if (issue.code === 'raw_internal_id' || issue.code === 'unsupported_numeric_claim') return 'HARD_CONTRACT_FAILURE';
  return 'HARD_TRUTH_FAILURE';
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
}): EssentialValidationCascadeResult {
  const blocks = textBlocks(input.parsed);
  const allIssues = [
    ...input.report.hardTruth.issues,
    ...input.report.repairableSemantic.issues,
    ...input.report.quality.issues
  ];
  const candidates = allIssues.map((issue) => candidate({
    ruleCode: issue.code,
    severity: severityForTextFirstIssue(issue),
    path: issue.path,
    span: blocks.get(issue.path) ?? issue.code
  }));

  // Layer 2: does context make an otherwise-flagged candidate customer-safe? Only assurance wording
  // has a context dimension in the current architecture; every other hard/contract issue is
  // confirmed immediately (no context legitimises a raw internal id or an unsupported comparative
  // claim), and quality issues are repairable rather than context-adjudicated.
  const acceptedAssuranceSpanHashes: string[] = [];
  for (const item of candidates) {
    const source = blocks.get(item.path) ?? '';
    if (item.ruleCode === 'assurance_claim') {
      const assuranceSentences = sentences(source).filter((sentence) => isAssuranceCandidate(sentence));
      const decisions = assuranceSentences.map(adjudicateAssuranceSentence);
      if (decisions.length > 0 && decisions.every((decision) => decision.disposition === 'ALLOW_CONTEXT')) {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'ALLOW_CONTEXT', 'all_assurance_clauses_customer_safe');
        // Owner decision 4: record each cleared sentence's normalised identity so the final-HTML
        // layer can inherit this exact decision for unchanged content instead of re-adjudicating it.
        for (const sentence of assuranceSentences) acceptedAssuranceSpanHashes.push(spanIdentityHash(sentence));
      } else if (decisions.some((decision) => decision.disposition === 'CONFIRMED_VIOLATION')) {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'CONFIRMED_VIOLATION', 'completed_or_invalid_assurance_actor');
      } else {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'AMBIGUOUS', 'assurance_clause_requires_evidence_scope');
      }
    } else if (item.severity === 'QUALITY_FAILURE') {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'REPAIRABLE', 'editorial_quality_candidate');
    } else {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'CONFIRMED_VIOLATION', 'typed_or_contract_issue_not_context_overridable');
    }
  }

  // Layer 3 genuinely compares evidence-dependent factual candidates against the live Fact Pack
  // (owner decision 3), instead of relabelling Layer 2's disposition under a new name (the "false
  // EVIDENCE_COMPARISON" bug owner decision 2 requires removed). Only unsupported_numeric_claim and
  // unsupported_structure_claim are actually gated on fact-pack evidence; assurance wording is a
  // closed linguistic question already settled by context adjudication, and every other candidate
  // type here is an absolute pattern with no fact-pack dimension to compare against, so this layer
  // honestly records NOT_APPLICABLE for them rather than pretending a comparison took place.
  for (const item of candidates) {
    const source = blocks.get(item.path) ?? '';
    if (item.ruleCode === 'unsupported_numeric_claim') {
      const grounded = isNumericClaimGrounded(source, input.factPack);
      addDecision(item, 'EVIDENCE_COMPARISON', grounded ? 'ACCEPT' : 'CONFIRMED_VIOLATION', grounded ? 'numeric_claim_grounded_in_fact_pack' : 'numeric_claim_not_grounded_in_fact_pack');
    } else if (item.ruleCode === 'unsupported_structure_claim') {
      const grounded = isStructureClaimGrounded(source, input.factPack);
      addDecision(item, 'EVIDENCE_COMPARISON', grounded ? 'ACCEPT' : 'CONFIRMED_VIOLATION', grounded ? 'structure_claim_grounded_in_fact_pack' : 'structure_claim_not_grounded_in_fact_pack');
    } else if (item.ruleCode === 'assurance_claim') {
      addDecision(item, 'EVIDENCE_COMPARISON', 'NOT_APPLICABLE', 'closed_linguistic_question_resolved_at_context_adjudication');
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
  return {
    policyVersion: 'mk-essential-validation-cascade-v1',
    publishable: rejected.length === 0 && heldForReview.length === 0,
    candidates,
    blockingCodes: [...new Set(rejected.map((item) => item.ruleCode))],
    heldForReviewCodes: [...new Set(heldForReview.map((item) => item.ruleCode))],
    warningCodes: [...new Set(candidates.filter((item) => item.finalDisposition === 'WARN').map((item) => item.ruleCode))],
    acceptedAssuranceSpanHashes
  };
}

export function assertTextFirstValidationCascade(input: {
  parsed: ParsedBlueprintMarkdown;
  report: TextFirstValidationReport;
  factPack: NarrativeFactPack;
}): EssentialValidationCascadeResult {
  const result = adjudicateTextFirstValidation(input);
  if (!result.publishable) throw new EssentialValidationCascadeError(result);
  return result;
}

const FINAL_RAW_ID = /\bD\d+-Q\d+\b/g;
const FINAL_BROKEN_PROOF = /provides operating evidence that[^.]{0,500}?is implemented across the complete in-scope population/gi;
const FINAL_BROKEN_NEXT_STEP = /\bConfirm\s+This evidence should demonstrate\b/gi;
const FINAL_UNSUPPORTED_ABSOLUTES: Array<[string, RegExp]> = [
  ['unsupported_transaction_volume_absolute', /manual review cannot cover transaction volume|majority of activity is never examined/gi],
  ['unsupported_risk_assessment_absolute', /control investment follows intuition and recent events|whole exposure areas unexamined and unfunded/gi],
  ['unsupported_detection_absolute', /fraud is found only by accident|typically long after the loss has compounded/gi]
];
const GENERIC_PROOF = 'This evidence should demonstrate that the linked control requirements operate consistently across the complete in-scope population.';

function scanFinalHtml(html: string): EssentialValidationCandidate[] {
  const text = stripHtml(html);
  const coreHtml = html.split(/<h2[^>]*>\s*Appendix: supporting material\s*<\/h2>/i)[0] ?? html;
  const coreText = stripHtml(coreHtml);
  const found: EssentialValidationCandidate[] = [];
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
    for (const match of text.match(pattern) ?? []) {
      found.push(candidate({ ruleCode: code, severity: 'HARD_TRUTH_FAILURE', path: 'final_html', span: match }));
    }
  }
  for (const sentence of sentences(text)) {
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
}): EssentialValidationCascadeResult {
  const candidates = scanFinalHtml(input.html);
  const carryForward = new Set(input.carryForwardAssuranceSpanHashes ?? []);

  for (const item of candidates) {
    if (item.ruleCode === 'assurance_language_final') {
      // Resolve the exact candidate sentence by hash from the immutable final HTML.
      const sentence = sentences(stripHtml(input.html)).find((value) => sha256(value) === item.spanHash) ?? '';
      if (carryForward.has(spanIdentityHash(sentence))) {
        // Owner decision 4: unchanged content inherits its manuscript-stage decision rather than
        // being re-adjudicated from scratch.
        addDecision(item, 'CONTEXT_ADJUDICATION', 'ALLOW_CONTEXT', 'inherited_manuscript_stage_acceptance_unchanged_content');
      } else {
        const decision = adjudicateAssuranceSentence(sentence);
        addDecision(item, 'CONTEXT_ADJUDICATION', decision.disposition, decision.reasonCode);
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
    acceptedAssuranceSpanHashes: []
  };
}

export function assertEssentialFinalHtml(input: {
  html: string;
  data: AssembledReportData;
  carryForwardAssuranceSpanHashes?: string[];
}): EssentialValidationCascadeResult {
  const result = validateEssentialFinalHtml(input);
  if (!result.publishable) throw new EssentialValidationCascadeError(result);
  return result;
}

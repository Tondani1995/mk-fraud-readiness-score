import crypto from 'node:crypto';
import type { AssembledReportData } from './types';
import type {
  ParsedBlueprintMarkdown,
  TextFirstValidationIssue,
  TextFirstValidationReport
} from './narrative/blueprint-text';
import type { NarrativeFactPack } from './narrative/fact-pack';

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

export type EssentialCandidateDisposition =
  | 'CANDIDATE'
  | 'ALLOW_CONTEXT'
  | 'CONFIRMED_VIOLATION'
  | 'REPAIRABLE'
  | 'AMBIGUOUS'
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
  finalDisposition: 'ACCEPT' | 'REPAIR' | 'ESCALATE' | 'REJECT' | 'WARN';
}

export interface EssentialValidationCascadeResult {
  policyVersion: 'mk-essential-validation-cascade-v1';
  publishable: boolean;
  finalHtmlSha256?: string;
  candidates: EssentialValidationCandidate[];
  blockingCodes: string[];
  warningCodes: string[];
}

export class EssentialValidationCascadeError extends Error {
  readonly code = 'essential_validation_cascade_failed';
  readonly result: EssentialValidationCascadeResult;

  constructor(result: EssentialValidationCascadeResult) {
    super(`Essential validation cascade failed: ${result.blockingCodes.join(', ')}`);
    this.name = 'EssentialValidationCascadeError';
    this.result = result;
  }
}

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const candidateId = (ruleCode: string, path: string, span: string): string =>
  `${ruleCode}:${sha256(`${path}\n${span}`).slice(0, 16)}`;

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
    finalDisposition: 'ESCALATE'
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
 * High-recall assurance candidate, but not a generic vocabulary scan. A bare word such as
 * "confirmed" in "confirmed true/false positives" is ordinary control language and must not enter
 * assurance adjudication. "Confirmed" is therefore only a candidate when attached to an actor or
 * evidence subject capable of making an assurance proposition.
 */
const ASSURANCE_CANDIDATE = /\b(?:independent(?:ly)?\s+(?:verif(?:y|ied|ication)|review(?:ed)?)|independent assurance|operating effectiveness|(?:MK|the assessment|this assessment|the report|this report|the findings?|the evidence|evidence)\b[^.!?]{0,100}\bconfirmed)\b/i;
/**
 * Evidence tables and recommended-next-step prose deliberately use epistemic criteria such as
 * "Whether X was independently verified" and "Confirm whether X was independently verified".
 * Those clauses describe what evidence must establish; they do not assert that verification was
 * completed. They therefore enter the high-recall scan but must be cleared by contextual review.
 */
const EVIDENCE_ASSURANCE_CRITERION = /\b(?:confirm\s+|determine\s+|establish\s+|verify\s+)?whether\b[^.!?]{0,260}\b(?:independent assurance|independent(?:ly)?\s+(?:verif(?:y|ied|ication)|review(?:ed)?)|operating effectiveness)\b/i;
const COMPLETED_ASSURANCE = /\b(?:MK|the assessment|this assessment|the report|this report|the findings?)\b[^.!?]{0,160}\b(?:independently\s+(?:verified|reviewed)|provides?\s+(?:independent\s+)?assurance|confirmed)\b/i;
const COMPLETED_EFFECTIVENESS = /\boperating effectiveness\b[^.!?]{0,100}\b(?:was|were|has been|have been|is|are)\s+(?:independently\s+)?(?:verified|reviewed|validated|confirmed|established)\b/i;
const EXPLICIT_LIMITATION = /\b(?:does not|do not|did not|has not|have not|not|without)\b[^.!?]{0,80}\b(?:independent(?:ly)?\s+(?:verification|verify|verified|review|reviewed)|operating effectiveness)\b/i;
const CUSTOMER_NORMATIVE_VERIFICATION = /\b(?:management|the organisation|the organization|control owner|process owner|internal audit|assurance function|supplier|bank[- ]detail|payment|identity|access|control(?:s)?|operating effectiveness|evidence)\b[^.!?]{0,180}\b(?:should|must|needs? to|is required to|are required to|before|prior to)\b[^.!?]{0,100}\bindependent(?:ly)?\s+(?:verif(?:y|ied)|verification|review(?:ed)?)\b/i;
const PASSIVE_NORMATIVE_VERIFICATION = /\b(?:operating effectiveness|control effectiveness|controls?|evidence|implementation|remediation|closure)\b[^.!?]{0,120}\b(?:should|must|needs? to|is required to|are required to)\s+be\s+independently\s+(?:verified|reviewed)\b/i;
const ASSESSMENT_DIRECTIONAL = /\b(?:the assessment|this assessment|the findings?|the report|this report)\b[^.!?]{0,120}\b(?:points?|directs?|guides?|recommends?|signals?)\b[^.!?]{0,100}\b(?:management|the organisation|the organization)\b[^.!?]{0,80}\bindependent\s+(?:verification|review)\b/i;
const REPORT_AS_VERIFIER = /\b(?:the report|this report|the assessment|this assessment|MK)\b[^.!?]{0,120}\b(?:should|must|needs? to|is required to|are required to)?\s*independently\s+(?:verify|review)\b/i;
/**
 * "Independent review" is often a control-design noun: separation from independent review,
 * independent-review responsibilities, or an independent-review route. That is not a proposition
 * that MK/the assessment performed assurance. Layer 2 must clear this context rather than letting a
 * high-recall lexical candidate become a false blocker.
 */
const CONTROL_DESIGN_INDEPENDENT_REVIEW = /(?:\b(?:separation|segregation|oversight|challenge|route|function|responsibilit(?:y|ies)|role|approval)\b[^.!?]{0,180}\bindependent review\b|\bindependent review\b[^.!?]{0,180}\b(?:role|function|responsibilit(?:y|ies)|route|requirement|separation|oversight|challenge)\b)/i;

export function adjudicateAssuranceSentence(sentence: string): {
  disposition: 'ALLOW_CONTEXT' | 'CONFIRMED_VIOLATION' | 'AMBIGUOUS';
  reasonCode: string;
} {
  const value = sentence.trim();
  if (!ASSURANCE_CANDIDATE.test(value)) return { disposition: 'ALLOW_CONTEXT', reasonCode: 'no_assurance_candidate' };
  if (EVIDENCE_ASSURANCE_CRITERION.test(value)) {
    return { disposition: 'ALLOW_CONTEXT', reasonCode: 'evidence_assurance_criterion_not_completed_assurance' };
  }
  if (COMPLETED_ASSURANCE.test(value) || COMPLETED_EFFECTIVENESS.test(value)) {
    return { disposition: 'CONFIRMED_VIOLATION', reasonCode: 'completed_assurance_not_supported' };
  }
  // A negative assurance-boundary statement is explicitly saying what was NOT done. It must be
  // cleared before the actor check below, otherwise "This assessment does not independently verify"
  // is mechanically misread as the assessment acting as verifier.
  if (EXPLICIT_LIMITATION.test(value)) {
    return { disposition: 'ALLOW_CONTEXT', reasonCode: 'explicit_assurance_limitation' };
  }
  if (REPORT_AS_VERIFIER.test(value) && !ASSESSMENT_DIRECTIONAL.test(value)) {
    return { disposition: 'CONFIRMED_VIOLATION', reasonCode: 'invalid_assurance_actor' };
  }
  if (
    CUSTOMER_NORMATIVE_VERIFICATION.test(value)
    || PASSIVE_NORMATIVE_VERIFICATION.test(value)
    || ASSESSMENT_DIRECTIONAL.test(value)
    || CONTROL_DESIGN_INDEPENDENT_REVIEW.test(value)
  ) {
    return { disposition: 'ALLOW_CONTEXT', reasonCode: 'customer_owned_or_control_design_context' };
  }
  return { disposition: 'AMBIGUOUS', reasonCode: 'assurance_context_unresolved' };
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

  for (const item of candidates) {
    const source = blocks.get(item.path) ?? '';
    if (item.ruleCode === 'assurance_claim') {
      const assuranceSentences = sentences(source).filter((sentence) => ASSURANCE_CANDIDATE.test(sentence));
      const decisions = assuranceSentences.map(adjudicateAssuranceSentence);
      if (decisions.length > 0 && decisions.every((decision) => decision.disposition === 'ALLOW_CONTEXT')) {
        addDecision(item, 'CONTEXT_ADJUDICATION', 'ALLOW_CONTEXT', 'all_assurance_clauses_customer_safe');
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

  // Layer 3 reviews Layer 2, it does not start from scratch. Context-cleared assurance wording is
  // accepted because it makes no completed assurance proposition. Confirmed hard truth/contract
  // issues remain confirmed. Ambiguity remains unresolved and therefore fail-closed.
  for (const item of candidates) {
    const prior = item.decisions.at(-1)?.disposition;
    if (prior === 'ALLOW_CONTEXT') addDecision(item, 'EVIDENCE_COMPARISON', 'ACCEPT', 'no_completed_assurance_claim_to_evidence');
    else if (prior === 'REPAIRABLE') addDecision(item, 'EVIDENCE_COMPARISON', 'REPAIRABLE', 'quality_only_no_truth_override');
    else if (prior === 'CONFIRMED_VIOLATION') addDecision(item, 'EVIDENCE_COMPARISON', 'CONFIRMED_VIOLATION', 'evidence_or_contract_failure_preserved');
    else addDecision(item, 'EVIDENCE_COMPARISON', 'AMBIGUOUS', 'unresolved_high_risk_semantic_ambiguity');
  }

  for (const item of candidates) {
    const prior = item.decisions.at(-1)?.disposition;
    if (prior === 'ACCEPT') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'ACCEPT', 'cascade_cleared');
      item.finalDisposition = 'ACCEPT';
    } else if (prior === 'REPAIRABLE') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'REPAIRABLE', 'quality_repair_or_warning');
      item.finalDisposition = 'WARN';
    } else if (prior === 'AMBIGUOUS') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'AMBIGUOUS', 'unresolved_high_risk_ambiguity');
      item.finalDisposition = 'ESCALATE';
    } else {
      addDecision(item, 'FINAL_ACCEPTANCE', 'CONFIRMED_VIOLATION', 'confirmed_failure');
      item.finalDisposition = 'REJECT';
    }
  }

  const blocking = candidates.filter((item) => item.finalDisposition === 'REJECT' || item.finalDisposition === 'ESCALATE');
  return {
    policyVersion: 'mk-essential-validation-cascade-v1',
    publishable: blocking.length === 0,
    candidates,
    blockingCodes: [...new Set(blocking.map((item) => item.ruleCode))],
    warningCodes: [...new Set(candidates.filter((item) => item.finalDisposition === 'WARN').map((item) => item.ruleCode))]
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
    if (!ASSURANCE_CANDIDATE.test(sentence)) continue;
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
}): EssentialValidationCascadeResult {
  const candidates = scanFinalHtml(input.html);

  for (const item of candidates) {
    if (item.ruleCode === 'assurance_language_final') {
      // Resolve the exact candidate sentence by hash from the immutable final HTML.
      const sentence = sentences(stripHtml(input.html)).find((value) => sha256(value) === item.spanHash) ?? '';
      const decision = adjudicateAssuranceSentence(sentence);
      addDecision(item, 'CONTEXT_ADJUDICATION', decision.disposition, decision.reasonCode);
    } else if (item.severity === 'QUALITY_FAILURE') {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'REPAIRABLE', 'customer_visible_quality_candidate');
    } else {
      addDecision(item, 'CONTEXT_ADJUDICATION', 'CONFIRMED_VIOLATION', 'hard_candidate_requires_evidence_confirmation');
    }
  }

  for (const item of candidates) {
    const prior = item.decisions.at(-1)?.disposition;
    if (prior === 'ALLOW_CONTEXT') {
      addDecision(item, 'EVIDENCE_COMPARISON', 'ACCEPT', 'context_proposition_does_not_assert_completed_assurance');
    } else if (prior === 'CONFIRMED_VIOLATION') {
      // These final-output hard candidates describe claims the self-assessment cannot establish or
      // a contract leak that no evidence can legitimise. They remain hard.
      addDecision(item, 'EVIDENCE_COMPARISON', 'CONFIRMED_VIOLATION', 'not_supported_by_self_assessment_contract');
    } else if (prior === 'REPAIRABLE') {
      addDecision(item, 'EVIDENCE_COMPARISON', 'REPAIRABLE', 'truth_preserved_but_customer_quality_not_acceptable');
    } else {
      addDecision(item, 'EVIDENCE_COMPARISON', 'AMBIGUOUS', 'evidence_scope_unresolved');
    }
  }

  // Layer 4 explicitly reviews the accumulated decisions at document level. At the paid-product
  // acceptance bar, known broken grammar, repeated generic proof language and pagination risk are
  // release-blocking quality defects, not harmless warnings.
  for (const item of candidates) {
    const prior = item.decisions.at(-1)?.disposition;
    if (prior === 'ACCEPT') addDecision(item, 'DOCUMENT_REVIEW', 'ACCEPT', 'document_context_consistent');
    else if (prior === 'REPAIRABLE') addDecision(item, 'DOCUMENT_REVIEW', 'CONFIRMED_VIOLATION', 'paid_product_quality_bar_not_met');
    else addDecision(item, 'DOCUMENT_REVIEW', prior ?? 'AMBIGUOUS', 'document_review_preserves_prior_decision');
  }

  for (const item of candidates) {
    const prior = item.decisions.at(-1)?.disposition;
    if (prior === 'ACCEPT') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'ACCEPT', 'all_layers_cleared');
      item.finalDisposition = 'ACCEPT';
    } else if (prior === 'CONFIRMED_VIOLATION') {
      addDecision(item, 'FINAL_ACCEPTANCE', 'CONFIRMED_VIOLATION', 'final_customer_output_rejected');
      item.finalDisposition = 'REJECT';
    } else {
      addDecision(item, 'FINAL_ACCEPTANCE', 'AMBIGUOUS', 'unresolved_final_ambiguity');
      item.finalDisposition = 'ESCALATE';
    }
  }

  const blocking = candidates.filter((item) => item.finalDisposition === 'REJECT' || item.finalDisposition === 'ESCALATE');
  return {
    policyVersion: 'mk-essential-validation-cascade-v1',
    publishable: blocking.length === 0,
    finalHtmlSha256: sha256(input.html),
    candidates,
    blockingCodes: [...new Set(blocking.map((item) => item.ruleCode))],
    warningCodes: []
  };
}

export function assertEssentialFinalHtml(input: {
  html: string;
  data: AssembledReportData;
}): EssentialValidationCascadeResult {
  const result = validateEssentialFinalHtml(input);
  if (!result.publishable) throw new EssentialValidationCascadeError(result);
  return result;
}

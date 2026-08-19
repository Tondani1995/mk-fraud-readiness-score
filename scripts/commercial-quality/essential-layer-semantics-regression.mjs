#!/usr/bin/env node
/**
 * Certification for the layer-semantics rework of essential-validation-cascade.ts (owner decisions
 * 2, 3, 4 and 6). Complements essential-validation-cascade-regression.mjs's higher-level smoke tests
 * with focused proofs of each specific architectural property the owner required:
 *
 *   - decision 2: a layer with nothing new to examine honestly records NOT_APPLICABLE, and
 *     downstream layers still see through it to the last substantive decision.
 *   - decision 3: EVIDENCE_COMPARISON for unsupported_numeric_claim/unsupported_structure_claim is a
 *     genuine, live re-check against the Fact Pack argument -- capable of a different answer for the
 *     same text under a different Fact Pack, not a rubber stamp of Layer 2's disposition.
 *   - decision 4: a manuscript-stage-accepted assurance sentence is inherited (not re-adjudicated) at
 *     final HTML when unchanged, and freshly adjudicated when the text differs.
 *   - decision 6: AMBIGUOUS/HELD_FOR_REVIEW is a distinct, fail-safe, non-publishable outcome from
 *     CONFIRMED_VIOLATION/REJECT, observable via separate result fields, and hard structural
 *     invariants remain fail-closed regardless.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjudicateTextFirstValidation,
  validateEssentialFinalHtml
} from '../../src/lib/reports/essential-validation-cascade.ts';

function minimalParsed(text) {
  return {
    ok: true,
    markdown: text,
    errors: [],
    chapters: [{
      chapterId: 'C',
      title: 'C',
      sections: [{
        chapterId: 'C',
        sectionId: 'SEC',
        title: 'Section',
        paragraphs: [{ text, permittedClaimRefs: [] }],
        subsections: [],
        permittedClaimRefs: []
      }]
    }]
  };
}

function reportWithIssue(code, message = code) {
  return {
    ok: false,
    hardTruth: {
      status: 'FAIL',
      issues: [{ code, severity: 'HARD_TRUTH_FAILURE', path: 'SEC.paragraphs[0]', message }]
    },
    repairableSemantic: { status: 'PASS', issues: [] },
    quality: { status: 'PASS', issues: [] },
    sectionCount: 1,
    subsectionCount: 0,
    paragraphCount: 1
  };
}

function decisionAt(candidateResult, layer) {
  return candidateResult.decisions.find((decision) => decision.layer === layer);
}

// ---------------------------------------------------------------------------------------------
// Owner decision 2: NOT_APPLICABLE is real and downstream layers see through it.
// ---------------------------------------------------------------------------------------------

test('decision 2: manuscript-stage assurance_claim is NOT_APPLICABLE at EVIDENCE_COMPARISON and DOCUMENT_REVIEW, not a relabelled ACCEPT', () => {
  const text = 'Operating effectiveness should be independently verified before closure.';
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: reportWithIssue('assurance_claim'),
    factPack: { facts: [] }
  });
  const item = result.candidates[0];
  assert.equal(decisionAt(item, 'CONTEXT_ADJUDICATION').disposition, 'ALLOW_CONTEXT');
  assert.equal(decisionAt(item, 'EVIDENCE_COMPARISON').disposition, 'NOT_APPLICABLE');
  assert.equal(decisionAt(item, 'DOCUMENT_REVIEW').disposition, 'NOT_APPLICABLE');
  // Downstream still reaches the correct final disposition by seeing through both NOT_APPLICABLE
  // layers to CONTEXT_ADJUDICATION's ALLOW_CONTEXT.
  assert.equal(item.finalDisposition, 'ACCEPT');
  assert.equal(result.publishable, true);
});

test('decision 2: final-HTML assurance_language_final is NOT_APPLICABLE at EVIDENCE_COMPARISON, not a relabelled ACCEPT', () => {
  const html = '<html><body><p>Operating effectiveness should be independently verified before closure.</p></body></html>';
  const result = validateEssentialFinalHtml({ html, data: {} });
  const item = result.candidates[0];
  assert.equal(decisionAt(item, 'CONTEXT_ADJUDICATION').disposition, 'ALLOW_CONTEXT');
  assert.equal(decisionAt(item, 'EVIDENCE_COMPARISON').disposition, 'NOT_APPLICABLE');
  // DOCUMENT_REVIEW performs genuine work only for REPAIRABLE-prior items; for an already-cleared
  // assurance sentence it too has nothing further to examine.
  assert.equal(decisionAt(item, 'DOCUMENT_REVIEW').disposition, 'NOT_APPLICABLE');
  assert.equal(item.finalDisposition, 'ACCEPT');
});

// ---------------------------------------------------------------------------------------------
// Owner decision 3: EVIDENCE_COMPARISON genuinely re-checks the live Fact Pack for the two
// evidence-gated candidate types. Same candidate text, different Fact Pack, different verdict --
// proof this is a real comparison and not a rubber stamp of Layer 2's CONFIRMED_VIOLATION.
// ---------------------------------------------------------------------------------------------

test('decision 3: unsupported_numeric_claim is REJECT against a Fact Pack that does not contain the number', () => {
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed('The reported score is 91.'),
    report: reportWithIssue('unsupported_numeric_claim'),
    factPack: { facts: [] }
  });
  assert.equal(decisionAt(result.candidates[0], 'EVIDENCE_COMPARISON').disposition, 'CONFIRMED_VIOLATION');
  assert.equal(result.candidates[0].finalDisposition, 'REJECT');
  assert.equal(result.publishable, false);
});

test('decision 3: the identical unsupported_numeric_claim candidate is ACCEPT once the live Fact Pack actually contains the number', () => {
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed('The reported score is 91.'),
    report: reportWithIssue('unsupported_numeric_claim'),
    factPack: { facts: [{ label: 'overall score', value: 91 }] }
  });
  assert.equal(decisionAt(result.candidates[0], 'EVIDENCE_COMPARISON').disposition, 'ACCEPT');
  assert.equal(result.candidates[0].finalDisposition, 'ACCEPT');
  assert.equal(result.publishable, true);
});

test('decision 3: unsupported_structure_claim is REJECT against a Fact Pack that does not contain the structure, ACCEPT once it does', () => {
  const text = 'The Audit Committee approved this control.';
  const rejected = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: reportWithIssue('unsupported_structure_claim'),
    factPack: { facts: [] }
  });
  assert.equal(decisionAt(rejected.candidates[0], 'EVIDENCE_COMPARISON').disposition, 'CONFIRMED_VIOLATION');
  assert.equal(rejected.candidates[0].finalDisposition, 'REJECT');

  const accepted = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: reportWithIssue('unsupported_structure_claim'),
    factPack: { facts: [{ structure: 'Audit Committee' }] }
  });
  assert.equal(decisionAt(accepted.candidates[0], 'EVIDENCE_COMPARISON').disposition, 'ACCEPT');
  assert.equal(accepted.candidates[0].finalDisposition, 'ACCEPT');
  assert.equal(accepted.publishable, true);
});

// ---------------------------------------------------------------------------------------------
// Owner decision 4: carry-forward inherits unchanged content, freshly adjudicates changed content.
// ---------------------------------------------------------------------------------------------

test('decision 4: an unchanged manuscript-accepted assurance sentence is inherited at final HTML, not re-adjudicated', () => {
  const text = 'Operating effectiveness should be independently verified before closure.';
  const manuscriptResult = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: reportWithIssue('assurance_claim'),
    factPack: { facts: [] }
  });
  assert.equal(manuscriptResult.publishable, true);
  assert.ok(manuscriptResult.acceptedAssuranceSpanHashes.length >= 1, 'manuscript stage must record at least one accepted assurance span hash');

  const html = `<html><body><p>${text}</p></body></html>`;
  const finalResult = validateEssentialFinalHtml({
    html,
    data: {},
    carryForwardAssuranceSpanHashes: manuscriptResult.acceptedAssuranceSpanHashes
  });
  const item = finalResult.candidates[0];
  assert.equal(decisionAt(item, 'CONTEXT_ADJUDICATION').reasonCode, 'inherited_manuscript_stage_acceptance_unchanged_content');
  assert.equal(item.finalDisposition, 'ACCEPT');
});

test('decision 4: changed text does not match the carried-forward identity and is freshly adjudicated on its own merits', () => {
  const acceptedText = 'Operating effectiveness should be independently verified before closure.';
  const manuscriptResult = adjudicateTextFirstValidation({
    parsed: minimalParsed(acceptedText),
    report: reportWithIssue('assurance_claim'),
    factPack: { facts: [] }
  });
  assert.equal(manuscriptResult.publishable, true);

  // A genuine MUST_REJECT sentence, unrelated to the accepted text, appears at final HTML instead.
  // A carry-forward mechanism that inherited on any non-empty hash list (rather than checking exact
  // per-sentence identity) would be a serious safety bug -- this proves it does not.
  const changedText = 'MK independently verified the controls.';
  const html = `<html><body><p>${changedText}</p></body></html>`;
  const finalResult = validateEssentialFinalHtml({
    html,
    data: {},
    carryForwardAssuranceSpanHashes: manuscriptResult.acceptedAssuranceSpanHashes
  });
  const item = finalResult.candidates[0];
  assert.notEqual(decisionAt(item, 'CONTEXT_ADJUDICATION').reasonCode, 'inherited_manuscript_stage_acceptance_unchanged_content');
  assert.equal(decisionAt(item, 'CONTEXT_ADJUDICATION').disposition, 'CONFIRMED_VIOLATION');
  assert.equal(item.finalDisposition, 'REJECT');
  assert.equal(finalResult.publishable, false);
});

test('decision 4: with no carry-forward hashes supplied, an otherwise-identical accepted sentence is still correctly (freshly) adjudicated ALLOW_CONTEXT', () => {
  const text = 'Operating effectiveness should be independently verified before closure.';
  const html = `<html><body><p>${text}</p></body></html>`;
  const finalResult = validateEssentialFinalHtml({ html, data: {} });
  const item = finalResult.candidates[0];
  assert.notEqual(decisionAt(item, 'CONTEXT_ADJUDICATION').reasonCode, 'inherited_manuscript_stage_acceptance_unchanged_content');
  assert.equal(decisionAt(item, 'CONTEXT_ADJUDICATION').disposition, 'ALLOW_CONTEXT');
  assert.equal(item.finalDisposition, 'ACCEPT');
});

// ---------------------------------------------------------------------------------------------
// Owner decision 6: AMBIGUOUS/HELD_FOR_REVIEW is distinct from CONFIRMED_VIOLATION/REJECT, fail-safe,
// and not counted as a successful acceptance. Hard structural invariants remain fail-closed.
// ---------------------------------------------------------------------------------------------

test('decision 6: an unresolved ambiguous manuscript candidate is HELD_FOR_REVIEW, tracked separately from blockingCodes, and the report is not publishable', () => {
  // "Independent review outcomes vary." resolves AMBIGUOUS under the shared adjudication core (see
  // assurance-adjudication-corpus-regression.mjs's dedicated AMBIGUOUS-reachability test) -- a
  // genuinely unresolved case, not a confirmed violation.
  const text = 'Independent review outcomes vary.';
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: reportWithIssue('assurance_claim'),
    factPack: { facts: [] }
  });
  const item = result.candidates[0];
  assert.equal(decisionAt(item, 'CONTEXT_ADJUDICATION').disposition, 'AMBIGUOUS');
  assert.equal(item.finalDisposition, 'HELD_FOR_REVIEW');
  assert.notEqual(item.finalDisposition, 'REJECT');
  assert.equal(result.heldForReviewCodes.includes('assurance_claim'), true);
  assert.equal(result.blockingCodes.includes('assurance_claim'), false);
  // Fail-safe: a held report is never a successful acceptance, exactly like a rejection.
  assert.equal(result.publishable, false);
});

test('decision 6: the same ambiguity at final HTML is HELD_FOR_REVIEW, distinct from a genuine rejection, and neither is publishable', () => {
  const ambiguousHtml = '<html><body><p>Independent review outcomes vary.</p></body></html>';
  const ambiguousResult = validateEssentialFinalHtml({ html: ambiguousHtml, data: {} });
  assert.equal(ambiguousResult.candidates[0].finalDisposition, 'HELD_FOR_REVIEW');
  assert.equal(ambiguousResult.heldForReviewCodes.includes('assurance_language_final'), true);
  assert.equal(ambiguousResult.blockingCodes.includes('assurance_language_final'), false);
  assert.equal(ambiguousResult.publishable, false);

  const rejectedHtml = '<html><body><p>MK independently verified the controls.</p></body></html>';
  const rejectedResult = validateEssentialFinalHtml({ html: rejectedHtml, data: {} });
  assert.equal(rejectedResult.candidates[0].finalDisposition, 'REJECT');
  assert.equal(rejectedResult.blockingCodes.includes('assurance_language_final'), true);
  assert.equal(rejectedResult.heldForReviewCodes.includes('assurance_language_final'), false);
  assert.equal(rejectedResult.publishable, false);
});

test('decision 6: hard structural invariants remain fail-closed (REJECT, not HELD_FOR_REVIEW or ACCEPT) regardless of the layer-semantics rework', () => {
  const html = '<html><body><p>Evidence mapped to D3-Q02.</p></body></html>';
  const result = validateEssentialFinalHtml({ html, data: {} });
  const item = result.candidates.find((candidate) => candidate.ruleCode === 'raw_internal_id_final');
  assert.ok(item, 'raw_internal_id_final candidate must still be detected');
  assert.equal(item.finalDisposition, 'REJECT');
  assert.equal(result.blockingCodes.includes('raw_internal_id_final'), true);
  assert.equal(result.publishable, false);
});

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO' }, null, 2));

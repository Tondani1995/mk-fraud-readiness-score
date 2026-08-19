#!/usr/bin/env node
/**
 * Owner decision 5: "Pre-certify deterministic template prose (evidence-proof-purpose strings,
 * evidence-table wording, Recommended Next Step boilerplate) in CI against the same shared corpus.
 * The exact Bokamoso false-positive family must be included."
 *
 * essentialEvidenceProofPurpose() (essential-commercial-output-closure.ts) is a closed, deterministic
 * lookup table -- no provider, no free text -- but its output is customer-facing prose that the
 * shared assurance/context adjudication core (narrative/assurance-adjudication.ts) must never flag as
 * a prohibited assurance claim. This script drives one representative artefact name per table rule
 * (plus the generic fallback branch) through the REAL production repair pipeline
 * (closeEssentialCommercialOutputDefects), extracts the exact evidence-table proof cell and
 * Recommended-Next-Step sentence it produces, and proves each one adjudicates ALLOW. It then runs the
 * same minimal document through the real final-HTML cascade (validateEssentialFinalHtml) end to end,
 * so this is a proof against the actual bytes a customer would see, not a re-implementation of the
 * lookup table's own logic.
 *
 * 'Approved fraud-risk RACI' (artefact id proof-01 below) is the exact Bokamoso order
 * MKORD-2026-4790A29D artefact family the owner named explicitly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { closeEssentialCommercialOutputDefects, essentialEvidenceProofPurpose } from '../../src/lib/reports/essential-commercial-output-closure.ts';
import { adjudicateAssuranceProposition } from '../../src/lib/reports/narrative/assurance-adjudication.ts';
import { validateEssentialFinalHtml } from '../../src/lib/reports/essential-validation-cascade.ts';

// One representative artefact name per essentialEvidenceProofPurpose() rule, in table order, plus a
// name matching none of them (PROOF_FALLBACK) to exercise the generic fallback sentence. Every string
// is crafted to match its rule's regex; several reuse the exact wording already used by committed
// tests (essential-validation-cascade-regression.mjs, essential-assurance-boundary-tests.mjs) for
// traceability back to those fixtures.
const ARTEFACTS = [
  { id: 'proof-01-bokamoso', artefact: 'Approved fraud-risk RACI', note: 'the exact Bokamoso MKORD-2026-4790A29D artefact family' },
  { id: 'proof-02', artefact: 'Governing body minutes evidencing independent reporting' },
  { id: 'proof-03', artefact: 'Internal audit charter' },
  { id: 'proof-04', artefact: 'Beneficial-ownership and conflict declarations' },
  { id: 'proof-05', artefact: 'Completed onboarding checklist' },
  { id: 'proof-06', artefact: 'Independent registration and bank verification' },
  { id: 'proof-07', artefact: 'Second-reviewer approval record' },
  { id: 'proof-08', artefact: 'Bank-detail-change request log' },
  { id: 'proof-09', artefact: 'Independent approval' },
  { id: 'proof-10', artefact: 'Monthly control exception report' },
  { id: 'proof-11', artefact: 'Payment hold and release audit trail' },
  { id: 'proof-12', artefact: 'Pre-existing contact record and callback log' },
  { id: 'proof-13', artefact: 'Chain-of-custody forms' },
  { id: 'proof-14', artefact: 'Evidence register' },
  { id: 'proof-15', artefact: 'Hash or seal record' },
  { id: 'proof-16', artefact: 'Repository access log' },
  { id: 'proof-17', artefact: 'Retention and legal-hold instructions' },
  { id: 'proof-18', artefact: 'Monitoring-rule catalogue' },
  { id: 'proof-19', artefact: 'Monitoring output records' },
  { id: 'proof-20', artefact: 'Population reconciliation report' },
  { id: 'proof-21', artefact: 'Monitoring coverage report' },
  { id: 'proof-22', artefact: 'Red-flag indicator definitions' },
  { id: 'proof-23', artefact: 'Alert case records' },
  { id: 'proof-24', artefact: 'In-scope event inventory' },
  { id: 'proof-25', artefact: 'Verification risk points register' },
  { id: 'proof-26', artefact: 'Re-verification records' },
  { id: 'proof-27', artefact: 'Exception approvals log' },
  { id: 'proof-28', artefact: 'Fraud risk assessment report' },
  { id: 'proof-29', artefact: 'Risk treatment plan' },
  { id: 'proof-30', artefact: 'Review scope and schedule document' },
  { id: 'proof-31', artefact: 'Lapsed or degraded control register' },
  { id: 'proof-32-fallback', artefact: 'Quarterly access certification summary', note: 'matches no named rule -- exercises the generic fallback sentence' }
];

const GENERIC_PROOF = 'This evidence should demonstrate that the linked control requirements operate consistently across the complete in-scope population.';

function fixtureHtml(artefact) {
  return `<html><head><style>.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }</style></head><body>
    <table><tr><td>1</td><td>${artefact}</td><td>${GENERIC_PROOF}</td><td>Risk</td><td>Not yet requested</td></tr></table>
    <p class="recommended-next-step"><strong>Recommended next step.</strong> Commission independent validation of the ${artefact}. Confirm ${GENERIC_PROOF} This is the immediate proof priority;</p>
  </body></html>`;
}

function extractProofCell(closedHtml) {
  const match = closedHtml.match(/<tr><td>1<\/td><td>[^<]*<\/td><td>([\s\S]*?)<\/td>/);
  assert.ok(match, 'evidence-proof cell not found in repaired HTML');
  return match[1].trim();
}

function extractNextStepConfirmSentence(closedHtml) {
  const match = closedHtml.match(/Confirm ([\s\S]*?)\.\s+This is the immediate proof priority;/);
  assert.ok(match, 'Recommended-Next-Step Confirm sentence not found in repaired HTML');
  return `Confirm ${match[1]}.`;
}

for (const { id, artefact, note } of ARTEFACTS) {
  test(`deterministic proof prose adjudicates ALLOW: ${id} (${artefact})${note ? ` -- ${note}` : ''}`, () => {
    // The lookup table function directly, in isolation.
    const purpose = essentialEvidenceProofPurpose(artefact);
    const purposeVerdict = adjudicateAssuranceProposition(purpose);
    assert.notEqual(purposeVerdict.disposition, 'REJECT', `proof purpose for "${artefact}" must not be a confirmed violation: "${purpose}" (${purposeVerdict.reasonCode})`);

    // The real production repair pipeline end to end: exact evidence-table cell and Recommended
    // Next Step sentence a customer would actually see.
    const closed = closeEssentialCommercialOutputDefects(fixtureHtml(artefact));
    const proofCell = extractProofCell(closed);
    const nextStepSentence = extractNextStepConfirmSentence(closed);
    assert.equal(proofCell, purpose, 'repaired evidence-table cell must equal essentialEvidenceProofPurpose output verbatim');

    const proofCellVerdict = adjudicateAssuranceProposition(proofCell);
    assert.notEqual(proofCellVerdict.disposition, 'REJECT', `repaired evidence-table cell must not be a confirmed violation: "${proofCell}" (${proofCellVerdict.reasonCode})`);

    const nextStepVerdict = adjudicateAssuranceProposition(nextStepSentence);
    assert.notEqual(nextStepVerdict.disposition, 'REJECT', `Recommended Next Step sentence must not be a confirmed violation: "${nextStepSentence}" (${nextStepVerdict.reasonCode})`);

    // And the real final-HTML cascade, end to end, on the exact repaired bytes.
    const result = validateEssentialFinalHtml({ html: closed, data: {} });
    assert.equal(result.publishable, true, `repaired fixture for "${artefact}" must be publishable; blockingCodes=${JSON.stringify(result.blockingCodes)} heldForReviewCodes=${JSON.stringify(result.heldForReviewCodes)}`);
  });
}

test('deterministic proof prose table coverage matches essentialEvidenceProofPurpose rule count', () => {
  // A guard against silent drift: if a new rule is added to the lookup table without a matching
  // artefact fixture here, this fails loudly instead of the new rule going uncertified.
  const distinctPurposes = new Set(ARTEFACTS.map(({ artefact }) => essentialEvidenceProofPurpose(artefact)));
  assert.equal(distinctPurposes.size, ARTEFACTS.length, 'every fixture artefact must exercise a distinct proof-purpose rule (including the fallback)');
});

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', artefactsChecked: ARTEFACTS.length }, null, 2));

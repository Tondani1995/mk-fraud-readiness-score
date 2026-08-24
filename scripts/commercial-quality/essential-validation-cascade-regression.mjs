import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjudicateAssuranceSentence,
  adjudicateTextFirstValidation,
  validateEssentialFinalHtml
} from '../../src/lib/reports/essential-validation-cascade.ts';
import {
  closeEssentialCommercialOutputDefects,
  essentialEvidenceProofPurpose
} from '../../src/lib/reports/essential-commercial-output-closure.ts';

const dummyData = {};

function final(html) {
  return validateEssentialFinalHtml({ html, data: dummyData });
}

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

test('layer 2 can clear a layer-1 assurance false positive without weakening hard truth', () => {
  const text = 'The assessment points management toward independent verification before closure.';
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: reportWithIssue('assurance_claim'),
    factPack: { facts: [] }
  });
  assert.equal(result.publishable, true);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(
    result.candidates[0].decisions.map((decision) => decision.layer),
    ['CANDIDATE_SCAN', 'CONTEXT_ADJUDICATION', 'EVIDENCE_COMPARISON', 'DOCUMENT_REVIEW', 'FINAL_ACCEPTANCE']
  );
  assert.equal(result.candidates[0].finalDisposition, 'ACCEPT');
});

test('hard evidence and contract failures cannot be context-cleared', () => {
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed('The reported score is 91.'),
    report: reportWithIssue('unsupported_numeric_claim'),
    factPack: { facts: [] }
  });
  assert.equal(result.publishable, false);
  assert.equal(result.candidates[0].finalDisposition, 'REJECT');
});

test('assurance adjudication distinguishes recommendation, proof criteria and completed assurance', () => {
  assert.equal(
    adjudicateAssuranceSentence('Operating effectiveness should be independently verified before closure.').disposition,
    'ALLOW_CONTEXT'
  );
  assert.equal(
    adjudicateAssuranceSentence('This assessment does not independently verify operating effectiveness.').disposition,
    'ALLOW_CONTEXT'
  );
  assert.equal(
    adjudicateAssuranceSentence('Whether supplier legal identity and bank-account ownership were independently verified before activation or payment.').disposition,
    'ALLOW_CONTEXT'
  );
  assert.equal(
    adjudicateAssuranceSentence('Confirm whether supplier legal identity and bank-account ownership were independently verified before activation or payment.').disposition,
    'ALLOW_CONTEXT'
  );
  assert.equal(
    adjudicateAssuranceSentence('Whether fraud-risk matters and independent assurance are reported through the approved governance route.').disposition,
    'ALLOW_CONTEXT'
  );
  assert.equal(
    adjudicateAssuranceSentence('MK independently verified the controls.').disposition,
    'CONFIRMED_VIOLATION'
  );
  assert.equal(
    adjudicateAssuranceSentence('This report provides independent assurance that the controls are effective.').disposition,
    'CONFIRMED_VIOLATION'
  );
});

test('final exact HTML carries the full candidate-to-acceptance ledger', () => {
  const html = '<html><body><p>Operating effectiveness should be independently verified before closure.</p></body></html>';
  const result = final(html);
  assert.equal(result.publishable, true);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(
    result.candidates[0].decisions.map((decision) => decision.layer),
    ['CANDIDATE_SCAN', 'CONTEXT_ADJUDICATION', 'EVIDENCE_COMPARISON', 'DOCUMENT_REVIEW', 'FINAL_ACCEPTANCE']
  );
  assert.equal(result.candidates[0].finalDisposition, 'ACCEPT');
  assert.match(result.finalHtmlSha256, /^[a-f0-9]{64}$/);
});

test('final assurance validation preserves HTML block boundaries and carry-forward identity', () => {
  const safeSentence = 'Independently review the governance process before closure.';
  const manuscript = adjudicateTextFirstValidation({
    parsed: minimalParsed(safeSentence),
    report: reportWithIssue('assurance_claim'),
    factPack: { facts: [] }
  });
  assert.equal(manuscript.publishable, true);
  assert.equal(manuscript.acceptedAssuranceSpanHashes.length, 1);

  // Before the block-aware fix, stripHtml() fused the unpunctuated heading and paragraph into
  // "Leadership action Independently review ...". That synthetic sentence no longer started with
  // the customer recommendation and therefore fell through to AMBIGUOUS at final HTML despite the
  // exact paragraph having already been accepted at manuscript stage.
  const safeFinal = validateEssentialFinalHtml({
    html: `<html><body><h3>Leadership action</h3><p>${safeSentence}</p></body></html>`,
    data: dummyData,
    carryForwardAssuranceSpanHashes: manuscript.acceptedAssuranceSpanHashes
  });
  assert.equal(safeFinal.publishable, true);
  assert.equal(safeFinal.heldForReviewCodes.length, 0);
  const assuranceCandidate = safeFinal.candidates.find((item) => item.ruleCode === 'assurance_language_final');
  assert.ok(assuranceCandidate);
  assert.ok(assuranceCandidate.decisions.some((decision) => decision.reasonCode === 'inherited_manuscript_stage_acceptance_unchanged_content'));

  const prohibited = final('<html><body><h3>Leadership action</h3><p>This report provides independent assurance that the controls are effective.</p></body></html>');
  assert.equal(prohibited.publishable, false);
  assert.ok(prohibited.heldForReviewCodes.includes('assurance_language_final'));
  assert.equal(prohibited.blockingCodes.includes('assurance_language_final'), false);
});

test('final deterministic template limitations are cleared while new positive assurance is held', () => {
  const limitations = final(`<html><body>
    <p>Exposure describes the operating model's inherent fraud risk. Readiness describes the reported control response. Neither measure is independent assurance.</p>
    <p>This remains a self-assessment: no document, interview, transaction sample or system evidence has been independently verified for any item.</p>
  </body></html>`);
  assert.equal(limitations.publishable, true);
  assert.equal(limitations.heldForReviewCodes.length, 0);
  assert.ok(limitations.candidates.length >= 2);
  assert.ok(limitations.candidates.every((item) => item.finalDisposition === 'ACCEPT'));

  const positive = final('<html><body><p>This report provides independent assurance that the controls are effective.</p></body></html>');
  assert.equal(positive.publishable, false);
  assert.ok(positive.heldForReviewCodes.includes('assurance_language_final'));
  assert.equal(positive.blockingCodes.includes('assurance_language_final'), false);
});

test('final evidence proof criteria do not masquerade as completed assurance', () => {
  const proof = essentialEvidenceProofPurpose('Independent registration and bank verification');
  const html = `<html><body><table><tr><td>1</td><td>Independent registration and bank verification</td><td>${proof}</td></tr></table><p>Confirm ${proof.replace(/^Whether /, 'whether ').replace(/[.]$/, '')}.</p></body></html>`;
  const result = final(html);
  assert.equal(result.publishable, true);
  assert.ok(result.candidates.length >= 1);
  assert.ok(result.candidates.every((item) => item.finalDisposition === 'ACCEPT'));
});

test('final exact HTML rejects internal ids and unsupported categorical risk claims', () => {
  const rawId = final('<html><body><p>Evidence mapped to D3-Q02.</p></body></html>');
  assert.equal(rawId.publishable, false);
  assert.ok(rawId.blockingCodes.includes('raw_internal_id_final'));

  const absolute = final('<html><body><p>Without deliberate monitoring, fraud is found only by accident, complaint or external notification, typically long after the loss has compounded.</p></body></html>');
  assert.equal(absolute.publishable, false);
  assert.ok(absolute.heldForReviewCodes.includes('unsupported_detection_absolute'));
  assert.equal(absolute.blockingCodes.includes('unsupported_detection_absolute'), false);

  // Final-output scanners surface these families as semantic candidates. Without a carried-forward
  // manuscript decision they hold, rather than turning a lexical match into a confirmed truth failure.
  const transactionVolume = final('<html><body><p>Manual review cannot cover transaction volume.</p></body></html>');
  assert.equal(transactionVolume.publishable, false);
  assert.ok(transactionVolume.heldForReviewCodes.includes('unsupported_transaction_volume_absolute'));
  assert.equal(transactionVolume.blockingCodes.includes('unsupported_transaction_volume_absolute'), false);

  const majorityUnexamined = final('<html><body><p>The majority of activity is never examined.</p></body></html>');
  assert.equal(majorityUnexamined.publishable, false);
  assert.ok(majorityUnexamined.heldForReviewCodes.includes('unsupported_transaction_volume_absolute'));
});

test('repeated generic proof language is a document-level commercial failure', () => {
  const phrase = 'This evidence should demonstrate that the linked control requirements operate consistently across the complete in-scope population.';
  const result = final(`<html><body><p>${phrase}</p><p>${phrase}</p></body></html>`);
  assert.equal(result.publishable, false);
  assert.ok(result.blockingCodes.includes('generic_proof_saturation'));
});

test('artefact proof purpose is specific rather than a generic linked-control sentence', () => {
  assert.match(essentialEvidenceProofPurpose('Approved fraud-risk RACI'), /ownership, decision rights, escalation authority/i);
  assert.match(essentialEvidenceProofPurpose('Pre-existing contact record and callback log'), /trusted contact details/i);
  assert.match(essentialEvidenceProofPurpose('Chain-of-custody forms'), /custody, timing and handover/i);
});

test('Bokamoso and Rivonia known defects are repaired before final validation, then revalidated', () => {
  const raw = `
    <html><head><style>.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; }</style></head><body>
      <p>Evidence mapped to G28-D3-Q02, including the complete in-scope population.</p>
      <article class="long-record finding-record"><span class="priority-badge">Priority control weakness</span><div>This is a maturity-limiting control condition.</div></article>
      <table><tr><td>1</td><td>Approved fraud-risk RACI</td><td>Whether the approved fraud-risk RACI provides operating evidence that A named senior owner is accountable for fraud risk management is implemented across the complete in-scope population.</td><td>Risk</td><td>Not yet requested</td></tr></table>
      <p class="recommended-next-step"><strong>Recommended next step.</strong> Commission independent validation of the approved fraud-risk RACI. Confirm whether the approved fraud-risk RACI provides operating evidence that A named senior owner is accountable for fraud risk management is implemented across the complete in-scope population. This is the immediate proof priority;</p>
      <p>Without a current structured assessment, material fraud exposures may not be identified, prioritised or treated consistently.</p>
      <p>Without deliberate monitoring, suspicious activity may not be detected or escalated consistently before losses or exceptions compound.</p>
    </body></html>`;
  const closed = closeEssentialCommercialOutputDefects(raw);
  assert.doesNotMatch(closed, /D3-Q02/);
  assert.doesNotMatch(closed, /provides operating evidence that/);
  assert.doesNotMatch(closed, /Confirm This evidence/);
  assert.match(closed, /fraud-risk ownership, decision rights, escalation authority/i);
  assert.match(closed, /break-inside: avoid/);
  assert.equal(final(closed).publishable, true);
});

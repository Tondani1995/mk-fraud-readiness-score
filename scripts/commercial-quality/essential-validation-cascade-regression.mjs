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
    ['CANDIDATE_SCAN', 'CONTEXT_ADJUDICATION', 'EVIDENCE_COMPARISON', 'FINAL_ACCEPTANCE']
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

test('assurance adjudication distinguishes recommendation from completed assurance', () => {
  assert.equal(
    adjudicateAssuranceSentence('Operating effectiveness should be independently verified before closure.').disposition,
    'ALLOW_CONTEXT'
  );
  assert.equal(
    adjudicateAssuranceSentence('This assessment does not independently verify operating effectiveness.').disposition,
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

test('final exact HTML rejects internal ids and unsupported categorical risk claims', () => {
  const rawId = final('<html><body><p>Evidence mapped to D3-Q02.</p></body></html>');
  assert.equal(rawId.publishable, false);
  assert.ok(rawId.blockingCodes.includes('raw_internal_id_final'));

  const absolute = final('<html><body><p>Without deliberate monitoring, fraud is found only by accident, complaint or external notification, typically long after the loss has compounded.</p></body></html>');
  assert.equal(absolute.publishable, false);
  assert.ok(absolute.blockingCodes.includes('unsupported_detection_absolute'));
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
      <p>Without a current structured assessment, control investment follows intuition and recent events, leaving whole exposure areas unexamined and unfunded.</p>
      <p>Without deliberate monitoring, fraud is found only by accident, complaint or external notification, typically long after the loss has compounded.</p>
    </body></html>`;
  const closed = closeEssentialCommercialOutputDefects(raw);
  assert.doesNotMatch(closed, /D3-Q02/);
  assert.doesNotMatch(closed, /provides operating evidence that/);
  assert.doesNotMatch(closed, /Confirm This evidence/);
  assert.doesNotMatch(closed, /control investment follows intuition/i);
  assert.doesNotMatch(closed, /fraud is found only by accident/i);
  assert.match(closed, /fraud-risk ownership, decision rights, escalation authority/i);
  assert.match(closed, /break-inside: avoid/);
  assert.equal(final(closed).publishable, true);
});

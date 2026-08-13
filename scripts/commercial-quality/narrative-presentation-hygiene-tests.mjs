import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitiseClaimBlock, sanitiseNarrativePresentation } from '../../src/lib/reports/narrative/presentation-hygiene.ts';
import { validateNarrativeManuscript } from '../../src/lib/reports/narrative/validation.ts';

function pack() {
  return {
    bibleVersion: '1.1',
    productTier: 'essential',
    organisation: { name: 'Rivonia Health Logistics (Pty) Ltd' },
    assessment: { reference: 'MKFRS-2026-F4047D75C0' },
    facts: [
      { id: 'FINDING-001', kind: 'finding', value: 'Supplier payment-change controls require attention.' },
      { id: 'CONTROL-002', kind: 'control', value: 'Supplier payment integrity.' },
      { id: 'D4-Q01', kind: 'question', value: 'Detection control.' }
    ]
  };
}

function manuscript(text, claimRefs = ['FINDING-001']) {
  const spineBlock = (value) => ({ id: 'SPINE', text: value, claimRefs });
  const sectionBlock = (value) => ({ id: 'SECTION', text: value, claimRefs });
  return {
    bibleVersion: '1.1',
    schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1',
    productTier: 'essential',
    organisationName: 'Rivonia Health Logistics (Pty) Ltd',
    assessmentReference: 'MKFRS-2026-F4047D75C0',
    sections: [{
      sectionId: 'EXECUTIVE-DIAGNOSIS',
      movementId: 'MOVE-1',
      heading: sectionBlock(text),
      paragraphs: [sectionBlock(text)],
      transition: sectionBlock(text)
    }],
    spine: {
      schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1',
      bibleVersion: '1.1',
      productTier: 'essential',
      executiveDiagnosis: spineBlock(text),
      systemicThemeSummary: spineBlock(text),
      centralManagementImplication: spineBlock(text),
      route: spineBlock(text),
      writerMetadata: { provider: 'openai', model: 'openai/gpt-5.6-sol', promptVersion: 'test', generationMode: 'test-injected', generatedAt: new Date().toISOString(), inputFactPackSha256: 'a', inputStoryPlanSha256: 'b' }
    },
    writerMetadata: { provider: 'openai', model: 'openai/gpt-5.6-sol', promptVersion: 'test', generationMode: 'test-injected', generatedAt: new Date().toISOString(), inputFactPackSha256: 'a', inputStoryPlanSha256: 'b' }
  };
}

const plan = {
  movements: [{ order: 1, sectionIds: ['EXECUTIVE-DIAGNOSIS'] }]
};

test('A: provenance ID is removed from customer text while claimRefs remain unchanged', () => {
  const input = { text: 'FINDING-001 indicates that supplier payment-change controls require attention.', claimRefs: ['FINDING-001'] };
  const result = sanitiseClaimBlock(input);
  assert.equal(result.block.text, 'indicates that supplier payment-change controls require attention.');
  assert.deepEqual(result.block.claimRefs, ['FINDING-001']);
  assert.equal(result.removedTokenCount, 1);
});

test('B: heading provenance ID is not exposed', () => {
  const result = sanitiseClaimBlock({ text: 'CONTROL-002 — Supplier payment integrity', claimRefs: ['CONTROL-002'] });
  assert.equal(result.block.text, 'Supplier payment integrity');
  assert.deepEqual(result.block.claimRefs, ['CONTROL-002']);
});

test('C: raw question ID is not exposed', () => {
  const result = sanitiseClaimBlock({ text: 'D4-Q01 indicates a detection priority.', claimRefs: ['D4-Q01'] });
  assert.equal(result.block.text, 'indicates a detection priority.');
  assert.deepEqual(result.block.claimRefs, ['D4-Q01']);
});

test('D: valid numbers, organisation names, owners, periods and approved wording remain unchanged', () => {
  const text = 'Rivonia Health Logistics (Pty) Ltd should retain 12 monthly records with the accountable executive and process owner during the first 30 days. Supplier payment integrity remains the approved control response.';
  const result = sanitiseClaimBlock({ text, claimRefs: ['FINDING-001'] });
  assert.equal(result.block.text, text);
});

test('E: raw_internal_id validation remains blocking when an ID survives outside the sanitiser', () => {
  const validation = validateNarrativeManuscript(manuscript('FINDING-001 remains in customer prose.'), pack(), plan);
  assert.ok(validation.issues.some((issue) => issue.code === 'raw_internal_id'));
});

test('F: sanitisation preserves claimRefs and they resolve to Fact Pack facts', () => {
  const result = sanitiseNarrativePresentation({ heading: { text: 'CONTROL-002 — Supplier payment integrity', claimRefs: ['CONTROL-002'] } });
  assert.deepEqual(result.value.heading.claimRefs, ['CONTROL-002']);
  const validation = validateNarrativeManuscript(manuscript(result.value.heading.text, result.value.heading.claimRefs), pack(), plan);
  assert.equal(validation.issues.some((issue) => issue.code === 'unknown_claim_ref'), false);
  assert.equal(validation.issues.some((issue) => issue.code === 'missing_provenance'), false);
});

test('sanitisation fails closed when a provenance-only block would become empty', () => {
  assert.throws(() => sanitiseClaimBlock({ text: 'FINDING-001', claimRefs: ['FINDING-001'] }), /sanitisation removed the complete/);
});

console.log('Narrative presentation hygiene tests: PASS');

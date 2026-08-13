import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';

const fail = [
  'MK independently verified the organisation\'s supplier controls.',
  'The assessment provides independent verification.',
  'The findings were independently verified.',
  'Independent verification confirmed the controls operate effectively.',
  'Operating effectiveness was independently verified.',
  'The evidence was validated.',
  'MK\'s review confirmed operating effectiveness.',
  'The report provides independent assurance.',
  'This report provides evidence-based assurance.',
  'The assessment contains evidence-linked validation.'
];

const pass = [
  'Supplier bank-detail changes should be independently verified through a trusted channel before release.',
  'Sensitive profile changes require independent verification before approval.',
  'Privileged-access recertification should include independent review.',
  'Management should retain proof that the independent verification step was completed.',
  'The control design is evidence-based and should be retained for implementation.'
];

const rivoniaCustomerControl = 'Fraud-risk ownership, structured assessment and periodic review are recorded as initial or ad hoc. Management owns fraud risk, while independent review responsibilities should remain separate where an internal audit or equivalent assurance function exists. The CEO / Managing Director should approve the accountability RACI and establish a scheduled review.';
const rivoniaAmbiguousDisclaimer = 'The intended measure is a complete custody trail; this is a management control objective, not a statement that evidence has been validated.';

test('prohibited assurance claims remain blocking', () => {
  for (const text of fail) assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
});

test('customer control verification language is allowed', () => {
  for (const text of pass) assert.notEqual(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
});

test('Rivonia governance role-separation activity is allowed narrowly', () => {
  assert.equal(classifyAssuranceLanguage(rivoniaCustomerControl)?.category, 'customer_control_activity');
});

test('Rivonia evidence-validation disclaimer remains fail-closed', () => {
  assert.equal(classifyAssuranceLanguage(rivoniaAmbiguousDisclaimer)?.category, 'prohibited_assurance');
});

test('ambiguous independent verification fails closed', () => {
  assert.equal(classifyAssuranceLanguage('Independent verification is important.')?.category, 'prohibited_assurance');
});

console.log(JSON.stringify({ passed: true, prohibited: fail.length, customerControl: pass.length, checks: ['MK assurance claims remain blocking', 'customer control verification allowed', 'ambiguous verification fails closed'] }, null, 2));

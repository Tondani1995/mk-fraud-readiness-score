#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyAssuranceLanguage, classifyAssuranceLanguageDetailed } from '../../src/lib/reports/narrative/validation.ts';

const allowed = [
  ['Luna limitation', "The result provides a clear starting point for management action. It reflects management's own responses evaluated through the MK scoring method. It is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness."],
  ['Terra limitation', 'This conclusion is based on management’s own responses and the MK scoring method. It is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.'],
  ['Luna negative premise', 'This target environment is designed to protect what is already working. It does not assume that the assessment independently verified operating effectiveness.'],
  ['direct negative verb', 'The assessment does not independently verify operating effectiveness.']
];
for (const [name, text] of allowed) {
  assert.equal(classifyAssuranceLanguage(text), null, `${name} must be allowed as an explicit limitation`);
  assert.equal(classifyAssuranceLanguageDetailed(text)?.category, 'EXPLICIT_LIMITATION', `${name} must be classified as an explicit limitation`);
}

const blocked = [
  ['negation removed', 'This target environment assumes that the assessment independently verified operating effectiveness.'],
  ['positive assessment verification', 'The assessment independently verified operating effectiveness.'],
  ['positive control verification', 'The controls were independently verified as effective.'],
  ['positive MK effectiveness confirmation', 'MK confirmed the controls operated effectively.'],
  ['mixed limitation and positive assurance', 'The assessment is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness. The assessment independently verified operating effectiveness.']
];
for (const [name, text] of blocked) {
  assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', `${name} must remain release-blocking`);
  assert.match(classifyAssuranceLanguageDetailed(text)?.category ?? '', /^PROHIBITED_/, `${name} must not be treated as a limitation`);
}

assert.equal(
  classifyAssuranceLanguage('Management should independently review whether supplier activation evidence was completed before release.')?.category,
  'customer_control_activity'
);

console.log(JSON.stringify({
  status: 'PASS',
  providerCalls: 0,
  allowedExplicitLimitations: allowed.map(([name]) => name),
  blockedPositiveOrMixedClaims: blocked.map(([name]) => name),
  strictHardTruthPreserved: true
}, null, 2));

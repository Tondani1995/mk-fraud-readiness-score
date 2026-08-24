#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateComprehensiveFinalHtml } from '../../src/lib/reports/comprehensive/final-validation.ts';

const dummyData = {};
const validate = (html) => validateComprehensiveFinalHtml({ html, data: dummyData });

const targetMeasure = 'All material stock and physical assets are counted and reconciled on schedule, with shrinkage and write-offs independently reviewed.';
const evidenceRequirement = 'Independent review scope and report';

test('Layer 4 clears an ambiguous assurance phrase when the document proves it is a target-state control measure', () => {
  const result = validate(`<html><body>
    <section class="reg">
      <h2>Control blueprint register</h2>
      <table><tr><th>Effectiveness test</th></tr><tr><td>${targetMeasure}</td></tr></table>
    </section>
  </body></html>`);
  assert.equal(result.publishable, true);
  const candidate = result.candidates.find((item) => item.ruleCode === 'assurance_language_final');
  assert.ok(candidate);
  assert.equal(candidate.finalDisposition, 'ACCEPT');
  assert.ok(candidate.decisions.some((decision) => decision.layer === 'DOCUMENT_REVIEW' && decision.disposition === 'ALLOW_CONTEXT' && decision.reasonCode === 'comprehensive_control_blueprint_target_state_context'));
});

test('Layer 4 clears an ambiguous independent-review artefact only inside the evidence requirement register', () => {
  const result = validate(`<html><body>
    <section class="reg">
      <h2>Evidence requirement register</h2>
      <table><tr><th>Evidence required</th></tr><tr><td>${evidenceRequirement}</td></tr></table>
    </section>
  </body></html>`);
  assert.equal(result.publishable, true);
  const candidate = result.candidates.find((item) => item.ruleCode === 'assurance_language_final');
  assert.ok(candidate);
  assert.equal(candidate.finalDisposition, 'ACCEPT');
});

test('the same ambiguous target-state sentence remains held when document context does not establish its role', () => {
  const result = validate(`<html><body><section><h2>Executive interpretation</h2><p>${targetMeasure}</p></section></body></html>`);
  assert.equal(result.publishable, false);
  assert.ok(result.heldForReviewCodes.includes('assurance_language_final'));
});

test('a genuine report assurance claim is never cleared merely because it appears inside a target-state register', () => {
  const unsafe = 'This report provides independent assurance that the controls are effective.';
  const result = validate(`<html><body>
    <section class="reg">
      <h2>Control blueprint register</h2>
      <table><tr><td>${unsafe}</td></tr></table>
    </section>
  </body></html>`);
  assert.equal(result.publishable, false);
  assert.ok(result.heldForReviewCodes.includes('assurance_language_final'));
  const candidate = result.candidates.find((item) => item.ruleCode === 'assurance_language_final');
  assert.ok(candidate);
  assert.notEqual(candidate.finalDisposition, 'ACCEPT');
});

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', checks: 4 }, null, 2));

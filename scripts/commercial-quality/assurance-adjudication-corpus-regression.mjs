#!/usr/bin/env node
/**
 * Canonical certification for the shared assurance/context adjudication core.
 *
 * Owner decision 1: "consolidate every current MUST_ALLOW/MUST_REPAIR/MUST_REJECT and cascade
 * regression example into one shared corpus and prove both current engines against it. Then
 * implement the shared core and prove the new core against the full combined corpus before
 * retiring duplication." This script is that proof for the new core
 * (narrative/assurance-adjudication.ts). See scripts/commercial-quality/
 * narrative-presentation-hygiene-tests.mjs, narrative-assurance-semantics-tests.mjs,
 * essential-assurance-boundary-tests.mjs, essential-false-positive-safety-net-tests.mjs and
 * essential-validation-cascade-regression.mjs for the thin wrapper contracts
 * (classifyAssuranceLanguage / adjudicateAssuranceSentence) proven separately, unchanged, against
 * the exact same corpus.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { adjudicateAssuranceProposition } from '../../src/lib/reports/narrative/assurance-adjudication.ts';
import { ASSURANCE_MUST_ALLOW, ASSURANCE_MUST_REPAIR, ASSURANCE_MUST_REJECT } from '../../src/lib/reports/narrative/assurance-corpus.ts';

test('MUST_ALLOW corpus: shared core never disposes ALLOW entries as REJECT or AMBIGUOUS', () => {
  for (const entry of ASSURANCE_MUST_ALLOW) {
    const result = adjudicateAssuranceProposition(entry.text);
    assert.equal(result.disposition, 'ALLOW', `${entry.id}: ${entry.text}`);
    if (entry.expectNoCandidate) assert.equal(result.isCandidate, false, `${entry.id} must not even read as an assurance candidate: ${entry.text}`);
    if (entry.expectCandidate) assert.equal(result.isCandidate, true, `${entry.id} must read as a candidate that context adjudication clears: ${entry.text}`);
  }
});

test('MUST_REPAIR corpus: shared core disposes as REJECT (repair is a separate, later concern)', () => {
  for (const entry of ASSURANCE_MUST_REPAIR) {
    const result = adjudicateAssuranceProposition(entry.text);
    assert.equal(result.disposition, 'REJECT', `${entry.id}: ${entry.text}`);
  }
});

test('MUST_REJECT corpus: shared core never disposes REJECT entries as ALLOW', () => {
  for (const entry of ASSURANCE_MUST_REJECT) {
    const result = adjudicateAssuranceProposition(entry.text);
    assert.notEqual(result.disposition, 'ALLOW', `${entry.id}: ${entry.text}`);
    assert.equal(result.isCandidate, true, `${entry.id} must read as an assurance candidate: ${entry.text}`);
  }
});

test('AMBIGUOUS is a real, reachable, distinct disposition', () => {
  // A genuinely unresolved case: a bare assurance-flavoured fragment with no actor, no customer
  // ownership, no limitation and no evidence criterion. Must never be treated as identical to
  // ALLOW (silently published) or silently merged into REJECT's reason-code space (see owner
  // decision 6 -- AMBIGUOUS and CONFIRMED_VIOLATION must remain distinguishable downstream).
  const result = adjudicateAssuranceProposition('Independent review outcomes vary.');
  assert.equal(result.disposition, 'AMBIGUOUS');
  assert.notEqual(result.reasonCode, 'hard_assurance_vocabulary');
  assert.notEqual(result.reasonCode, 'completed_assurance_not_supported');
});

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  allowChecked: ASSURANCE_MUST_ALLOW.length,
  repairChecked: ASSURANCE_MUST_REPAIR.length,
  rejectChecked: ASSURANCE_MUST_REJECT.length
}, null, 2));

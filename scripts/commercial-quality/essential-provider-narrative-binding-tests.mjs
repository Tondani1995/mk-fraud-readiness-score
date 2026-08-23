#!/usr/bin/env node
import assert from 'node:assert/strict';
import { closeEssentialCommercialOutputDefects } from '../../src/lib/reports/essential-commercial-output-closure.ts';
import {
  essentialSemanticSpanHash,
  validateEssentialFinalHtml
} from '../../src/lib/reports/essential-validation-cascade.ts';

const path = 'EXECUTIVE-ASSESSMENT-POSITION.paragraphs[0]';
const acceptedProse = 'D1 is a comparatively stronger reported position. The deterministic roadmap records no prerequisite dependency.';
const rawHtml = `<!doctype html><html><body><p data-narrative-block="${path}">${acceptedProse}</p></body></html>`;

// The customer-output closure is allowed to rewrite deterministic template content, but a provider
// block has already passed manuscript adjudication. It must survive this seam byte-for-byte.
const closed = closeEssentialCommercialOutputDefects(rawHtml);
assert.ok(closed.includes(`<p data-narrative-block="${path}">${acceptedProse}</p>`), 'accepted provider narrative was mutated by customer-output closure');
assert.ok(!closed.includes('Fraud Leadership and Governance is a comparatively stronger'), 'D1 replacement leaked into accepted provider narrative');
assert.ok(!closed.includes('The current roadmap records no prerequisite dependency'), 'template wording replacement leaked into accepted provider narrative');

const carried = [{
  ruleCode: 'semantic_grounding_block',
  path,
  spanHash: essentialSemanticSpanHash(acceptedProse),
  reasonCode: 'test_manuscript_acceptance'
}];

const accepted = validateEssentialFinalHtml({
  html: closed,
  data: {},
  carryForwardSemanticDecisions: carried
});
assert.equal(accepted.publishable, true, 'unchanged accepted provider narrative did not bind at final acceptance');
assert.deepEqual(accepted.blockingCodes, []);
assert.deepEqual(accepted.heldForReviewCodes, []);

// A real post-adjudication content change must still fail closed. Protecting provider blocks from the
// deterministic closure is not a bypass of the final binding contract.
const mutated = closed.replace('comparatively stronger reported position', 'functioning established control capability');
const rejected = validateEssentialFinalHtml({
  html: mutated,
  data: {},
  carryForwardSemanticDecisions: carried
});
assert.equal(rejected.publishable, false, 'post-adjudication provider mutation was not rejected');
assert.ok(rejected.blockingCodes.includes('semantic_grounding_block_final'), 'mutated provider block did not fail final provider binding');
assert.ok(rejected.blockingCodes.includes('semantic_grounding_block_content_changed'), 'mutated provider block did not record content-changed contract failure');

console.log(JSON.stringify({
  ok: true,
  contract: 'accepted-provider-narrative-immutable-through-customer-output-closure',
  unchangedFinalDisposition: accepted.candidates.find((candidate) => candidate.ruleCode === 'semantic_grounding_block_final')?.finalDisposition,
  mutatedBlockingCodes: rejected.blockingCodes
}, null, 2));

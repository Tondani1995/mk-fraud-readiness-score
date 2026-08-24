#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { closeEssentialCommercialOutputDefects } from '../../src/lib/reports/essential-commercial-output-closure.ts';
import { closeResidualEssentialGroundingDefects } from '../../src/lib/reports/essential-grounding-closure.ts';
import { validateEssentialFinalHtml } from '../../src/lib/reports/essential-validation-cascade.ts';

const leadership = fs.readFileSync('src/lib/reports/evidence-model/leadership.ts', 'utf8');

const acceptanceExcerpt = `
<p>The management exposure is that unusual activity may remain below timely challenge. Manual review cannot cover the full practical range of transaction or behavioural activity, so management needs a defined monitoring cycle.</p>
<p>The mechanism is that activity may be reviewed locally rather than compared across the complete relevant population, so the unusual pattern is not challenged centrally.</p>
<p>The mechanism is that records remain with the location where the matter arose, making scope and timing harder to establish once the matter is escalated.</p>
<p>Risk priority is produced by the deterministic qualitative likelihood/impact matrix.</p>
<p>Risk priority uses the deterministic qualitative likelihood/impact matrix.</p>
<p>Use authoritative roadmap dependency IDs and escalate threatened prerequisites.</p>
<p>Manual review cannot cover every relevant transaction or behavioural pattern, and account compromise or misuse can persist when anomalous patterns are not surfaced.</p>
<p>The actor relies on the activity being reviewed locally rather than compared across sites.</p>
<p>The actor may rely on records staying with the location where the matter arose, so that scope and timing become harder to establish once the matter is escalated.</p>
<p>Manual review also cannot cover the full transaction volume, so without data-driven tests, structured patterns may remain unchallenged.</p>
<p>Activity within an in-scope process or event population could fall outside the expected pattern without a timely central review route. The pathway depends on activity being reviewed locally rather than compared across the complete in-scope population, so an unusual pattern may not be challenged centrally.</p>
`;

const commerciallyClosed = closeEssentialCommercialOutputDefects(acceptanceExcerpt);
const closed = closeResidualEssentialGroundingDefects(commerciallyClosed);

assert.match(closed, /Manual review cannot cover the full practical range/i);
assert.match(closed, /Manual review cannot cover every relevant transaction or behavioural pattern/i);
assert.match(closed, /Manual review also cannot cover the full transaction volume/i);

assert.match(closed, /reviewed locally rather than compared across the complete relevant population/i);
assert.match(closed, /reviewed locally rather than compared across the complete in-scope population/i);
assert.match(closed, /reviewed locally rather than compared across sites/i);
assert.match(closed, /timely central review route/i);
assert.match(closed, /challenged centrally/i);

assert.match(closed, /records remain with the location where the matter arose/i);
assert.match(closed, /records staying with the location where the matter arose/i);

assert.doesNotMatch(closed, /deterministic qualitative likelihood\/impact matrix/i);
assert.match(closed, /MK qualitative likelihood\/impact matrix/i);

assert.doesNotMatch(closed, /authoritative roadmap dependency IDs/i);
assert.match(closed, /Approve the prerequisite sequence and escalate threatened prerequisites\./i);

assert.doesNotMatch(leadership, /recommendedDecision: 'Use authoritative roadmap dependency IDs and escalate threatened prerequisites\.'/);
assert.match(leadership, /recommendedDecision: 'Approve the prerequisite sequence and escalate threatened prerequisites\.'/);

const safeControlDesign = 'Management should compare exception outcomes across sites where the organisation actually operates multiple sites.';
assert.equal(closeResidualEssentialGroundingDefects(safeControlDesign), safeControlDesign, 'generic location wording outside the known unsupported scenario shapes must remain unchanged');

const safeGroundedCentralRoute = 'Management documented a central review route in the submitted operating model and should retain evidence that it operates as designed.';
assert.equal(closeResidualEssentialGroundingDefects(safeGroundedCentralRoute), safeGroundedCentralRoute, 'grounded central-route language outside the known speculative provider shape must remain unchanged');

const finalCandidate = validateEssentialFinalHtml({ html: `<html><body>${closed}</body></html>`, data: {} });
assert.equal(finalCandidate.publishable, false, 'historical semantic wording is held for manuscript-stage review, not rewritten here');
assert.ok(finalCandidate.heldForReviewCodes.length > 0);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  semanticCandidatePreservation: 'PASS',
  siyakhulaV3VariantPreservation: 'PASS',
  siyakhulaV4VariantPreservation: 'PASS',
  manualReviewAbsolute: 'HELD_FOR_REVIEW',
  inventedLocationMechanism: 'HELD_FOR_REVIEW',
  roadmapInternalIdLanguage: 'CLOSED',
  methodologyImplementationJargon: 'CLOSED',
  unrelatedLocationLanguage: 'PRESERVED',
  groundedCentralRouteLanguage: 'PRESERVED'
}, null, 2));

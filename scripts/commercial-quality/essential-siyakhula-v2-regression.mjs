#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { closeEssentialCommercialOutputDefects } from '../../src/lib/reports/essential-commercial-output-closure.ts';

const leadership = fs.readFileSync('src/lib/reports/evidence-model/leadership.ts', 'utf8');

const v2Excerpt = `
<p>The management exposure is that unusual activity may remain below timely challenge. Manual review cannot cover the full practical range of transaction or behavioural activity, so management needs a defined monitoring cycle.</p>
<p>The mechanism is that activity may be reviewed locally rather than compared across the complete relevant population, so the unusual pattern is not challenged centrally.</p>
<p>The mechanism is that records remain with the location where the matter arose, making scope and timing harder to establish once the matter is escalated.</p>
<p>Risk priority is produced by the deterministic qualitative likelihood/impact matrix.</p>
<p>Risk priority uses the deterministic qualitative likelihood/impact matrix.</p>
<p>Use authoritative roadmap dependency IDs and escalate threatened prerequisites.</p>
`;

const closed = closeEssentialCommercialOutputDefects(v2Excerpt);

assert.doesNotMatch(closed, /Manual review cannot cover the full practical range/i);
assert.match(closed, /self-assessment does not establish complete monitoring coverage across the relevant transaction or behavioural population/i);

assert.doesNotMatch(closed, /reviewed locally rather than compared across the complete relevant population/i);
assert.match(closed, /reviewed in isolation rather than compared across the complete relevant population/i);

assert.doesNotMatch(closed, /records remain with the location where the matter arose/i);
assert.match(closed, /records may remain outside a defined preservation and custody route/i);

assert.doesNotMatch(closed, /deterministic qualitative likelihood\/impact matrix/i);
assert.match(closed, /MK qualitative likelihood\/impact matrix/i);

assert.doesNotMatch(closed, /authoritative roadmap dependency IDs/i);
assert.match(closed, /Approve the prerequisite sequence and escalate threatened prerequisites\./i);

assert.doesNotMatch(leadership, /recommendedDecision: 'Use authoritative roadmap dependency IDs and escalate threatened prerequisites\.'/);
assert.match(leadership, /recommendedDecision: 'Approve the prerequisite sequence and escalate threatened prerequisites\.'/);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  siyakhulaV2GroundingClosure: 'PASS',
  manualReviewAbsolute: 'CLOSED',
  inventedLocationMechanism: 'CLOSED',
  roadmapInternalIdLanguage: 'CLOSED',
  methodologyImplementationJargon: 'CLOSED'
}, null, 2));

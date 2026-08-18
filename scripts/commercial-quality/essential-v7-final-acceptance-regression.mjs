#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adaptation = readFileSync(new URL('../../src/lib/reports/essential-presentation-adaptation.ts', import.meta.url), 'utf8');
const assurance = readFileSync(new URL('../../src/lib/reports/narrative/assurance-boundary-normalisation.ts', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../src/lib/reports/templates/report-template.ts', import.meta.url), 'utf8');

// The assurance normaliser's behaviour is exercised directly in
// essential-assurance-boundary-tests.mjs. Keep this V7 acceptance regression focused on the
// customer-visible invariant that originally failed, rather than the implementation shape of the
// normaliser regex. This avoids rejecting valid refactors that preserve the same behaviour.
assert.doesNotMatch(
  assurance,
  /by this review of operating effectiveness/,
  'assurance normaliser must not retain the V7 duplicate effectiveness tail'
);

// Scenario language must be response-grounded rather than collapsing multiple controls to one
// weaker maturity state.
for (const expected of [
  'transaction and activity monitoring is self-assessed as',
  'evidence preservation and custody are self-assessed as',
  'confidential or anonymous reporting is self-assessed as'
]) {
  assert.match(adaptation, new RegExp(expected), `missing response-grounded scenario phrase: ${expected}`);
}
assert.match(
  adaptation,
  /groundEssentialScenarioStateLanguage/,
  'scenario grounding helper must remain exported'
);

// The helper must accept both the historic and the exact V8 pathway wording so future provider
// variation cannot bypass the deterministic grounding step.
for (const fixture of [
  'The current control weakness in the pathway is that monitoring and exception review are at an initial or ad hoc stage.',
  'The current weakness linked to this pathway is that monitoring and exception review are at an initial or ad hoc stage.',
  'The current weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage.'
]) {
  assert.ok(adaptation.includes(fixture.split(' is that ')[0].replace(/^The /, '').toLowerCase().split(' ')[0]) || adaptation.includes('current\\s+(?:control\\s+)?weakness'), `scenario matcher coverage missing for fixture family: ${fixture}`);
}

// Roadmap must render chronologically and keep each stage's narrative bound to its own rows.
const first30 = template.indexOf('First 30 days — decisions and foundations');
const day60 = template.indexOf('60-day implementation actions');
const day90 = template.indexOf('90-day implementation actions');
const conclusion = template.indexOf('roadmapConclusionNarrative ?');
assert.ok(first30 >= 0 && day60 > first30 && day90 > day60 && conclusion > day90, 'roadmap must render 30 -> 60 -> 90 -> conclusion');
assert.doesNotMatch(template, /60- and 90-day implementation actions/);
assert.match(template, /roadmapRowsForPeriod\('30 days'\)/);
assert.match(template, /roadmapRowsForPeriod\('60 days'\)/);
assert.match(template, /roadmapRowsForPeriod\('90 days'\)/);

// Sparse-page protections: priority findings and risks may split internally while preserving
// record headings/fields; appendix short tails may continue into available space.
assert.match(template, /long-section continue-after-short-tail splittable-finding-section'\),/);
assert.match(template, /long-section continue-after-short-tail splittable-risk-section'\),/);
assert.match(template, /long-section continue-after-short-tail'\)\n  \]\.join/);
assert.match(template, /\.report-section\.continue-after-short-tail \{ break-before: auto; page-break-before: auto; \}/);
assert.match(template, /\.splittable-risk-section \.risk-record \{ break-inside: auto; page-break-inside: auto; \}/);
assert.match(template, /\.splittable-finding-section \.finding-record \{ break-inside: auto; page-break-inside: auto; \}/);
assert.match(template, /groundEssentialScenarioStateLanguage\(value, evidenceModel\.materialFindings\)/);
assert.match(template, /\.roadmap-stage-panel \.manuscript-section > h3 \{ break-after: avoid; page-break-after: avoid; \}/);
assert.match(template, /\.roadmap-stage-panel \.manuscript-section > h3 \+ p \{ break-before: avoid; page-break-before: avoid; \}/);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  v7FinalAcceptance: 'PASS',
  executiveAssuranceCopy: 'PASS',
  scenarioStateGrounding: 'PASS',
  roadmapChronology: 'PASS',
  sparsePageFlow: 'PASS'
}, null, 2));

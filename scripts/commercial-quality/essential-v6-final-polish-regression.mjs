#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptEssentialText, buildEssentialAdaptationContext } from '../../src/lib/reports/essential-presentation-adaptation.ts';

const template = readFileSync(new URL('../../src/lib/reports/templates/report-template.ts', import.meta.url), 'utf8');
assert.match(template, /@page \{ size: A4 portrait; margin: 12mm 13mm 15mm 13mm; \}/);
assert.doesNotMatch(template, /@page \{ size: A4 portrait; margin: 0; \}/);
assert.match(template, /\.cover \{ break-before: auto; margin: -12mm -13mm 0;/);
assert.match(template, /control_failure: 'Priority control weakness'/);
assert.match(template, /customerMaterialityLabel\(finding\.materialityClass\)/);
assert.doesNotMatch(template, /esc\(finding\.materialityClass\.replaceAll\('_', ' '\)\)/);
assert.match(template, /completed using the assessment's oversight question set rather than the standard question set/);
assert.match(template, /adaptiveScope\.resultStatus !== 'PROVISIONAL'/);
assert.match(template, /<p class="recommended-next-step"><strong>Recommended next step\.<\/strong>/);
assert.doesNotMatch(template, /<div class="closing-note"><strong>Recommended next step/);
assert.doesNotMatch(template, /<strong>Next step\.<\/strong> Agree the proof requirements/);

const context = buildEssentialAdaptationContext({});
const ugly = 'The ethics owner must publish reporting routes in plain language across the channels the workforce actually uses — induction packs, the workforce communication channels used by the organisation, appropriate workforce communication channels and operating locations, internal workforce communication channel and supervisor briefings.';
const cleaned = adaptEssentialText(ugly, context);
assert.match(cleaned, /induction and onboarding materials, workforce communication channels used by the organisation, and supervisor briefings/i);
assert.doesNotMatch(cleaned, /appropriate workforce communication channels and operating locations|internal workforce communication channel/i);

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', v6FinalPolish: 'PASS', footerCollisionBoundary: 'PASS', sparsePageCleanup: 'PASS' }, null, 2));

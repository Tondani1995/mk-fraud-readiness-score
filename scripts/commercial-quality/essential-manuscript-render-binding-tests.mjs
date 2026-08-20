#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const nav = fs.readFileSync('src/lib/reports/render-validated-commercial-pdf.ts', 'utf8');
const template = fs.readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');

// The renderer now uses one shared CommercialPdfInput contract for both render entry points. Prove
// the manuscript remains part of that contract and is forwarded by BOTH the first render and every
// numbered navigation render. Do not couple this regression to where the type declaration happens
// to sit relative to a function name.
assert.match(
  nav,
  /type CommercialPdfInput\s*=\s*\{[\s\S]*?narrative\?: ParsedBlueprintMarkdown;[\s\S]*?\};/,
  'CommercialPdfInput no longer carries the validated manuscript'
);
assert.match(
  nav,
  /renderValidatedCommercialPdf\([\s\S]*?dependencies\.renderHtml\([\s\S]*?undefined,\s*undefined,\s*input\.narrative\s*\)/,
  'first-pass commercial render no longer forwards the manuscript'
);
assert.match(
  nav,
  /renderValidatedCommercialPdfWithNavigation\([\s\S]*?dependencies\.renderHtml\([\s\S]*?pageMap,\s*undefined,\s*input\.narrative\s*\)/,
  'numbered navigation render no longer forwards the manuscript'
);
assert.match(
  nav,
  /prepareAcceptedCustomerHtml\(input, rawHtml\)/,
  'rendered customer HTML no longer passes through final acceptance'
);

for (const id of ['EXECUTIVE-ASSESSMENT','WHAT-HOLDS-READINESS-BACK','PRIORITY-FRAUD-EXPOSURES','EXPOSURE-COULD-MATERIALISE','TARGET-CONTROL-ENVIRONMENT']) {
  assert.match(template, new RegExp(`narrativeChapterBody\\('${id}'\\)`), `${id} is not bound`);
}
assert.match(template, /narrativeChapterBody\('FIRST-90-DAYS-CONCLUSION',/, 'FIRST-90-DAYS-CONCLUSION staged sections are not bound');
assert.match(template, /roadmapConclusionNarrative/, 'FIRST-90-DAYS-CONCLUSION conclusion is not bound');
assert.doesNotMatch(template, /const narrativeSections =/);
assert.doesNotMatch(template, /narrativeSections,/);
assert.doesNotMatch(template, /No domain narrative was produced/);
assert.match(template, /scenarioNarrative \|\| topScenarios\.map\(scenarioCard\)/);
assert.match(template, /First 30 days — decisions and foundations/);
assert.match(template, /applicable and \$\{adaptiveScope\.excludedCount\} excluded/);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  manuscriptBinding: 'PASS',
  navigationPersistence: 'PASS',
  finalAcceptanceBinding: 'PASS',
  stagedRoadmapBinding: 'PASS'
}, null, 2));

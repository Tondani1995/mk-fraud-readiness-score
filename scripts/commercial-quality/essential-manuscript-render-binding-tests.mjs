#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
const nav = fs.readFileSync('src/lib/reports/render-validated-commercial-pdf.ts', 'utf8');
const template = fs.readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
assert.match(nav, /renderValidatedCommercialPdfWithNavigation[\s\S]*narrative\?: ParsedBlueprintMarkdown/);
assert.match(nav, /pageMap, undefined, input\.narrative\)/);
for (const id of ['EXECUTIVE-ASSESSMENT','WHAT-HOLDS-READINESS-BACK','PRIORITY-FRAUD-EXPOSURES','EXPOSURE-COULD-MATERIALISE','TARGET-CONTROL-ENVIRONMENT','FIRST-90-DAYS-CONCLUSION']) {
  assert.match(template, new RegExp(`narrativeChapterBody\\('${id}'\\)`), `${id} is not bound`);
}
assert.doesNotMatch(template, /const narrativeSections =/);
assert.doesNotMatch(template, /narrativeSections,/);
assert.doesNotMatch(template, /No domain narrative was produced/);
assert.match(template, /scenarioNarrative \|\| topScenarios\.map\(scenarioCard\)/);
assert.match(template, /First 30 days — decisions and foundations/);
assert.match(template, /full checklist in the supporting register\./);
assert.match(template, /applicable and \$\{adaptiveScope\.excludedCount\} excluded/);
console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', manuscriptBinding: 'PASS', navigationPersistence: 'PASS' }, null, 2));

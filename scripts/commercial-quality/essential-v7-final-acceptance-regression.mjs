#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';
import { groundEssentialScenarioStateLanguage } from '../../src/lib/reports/essential-presentation-adaptation.ts';

const execNarrative = {
  ok: true,
  markdown: '# Executive\n\nThe assessment is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.',
  errors: [],
  chapters: [{
    chapterId: 'EXECUTIVE-ASSESSMENT',
    title: 'Executive assessment',
    sections: [{
      chapterId: 'EXECUTIVE-ASSESSMENT',
      sectionId: 'POSITION',
      title: 'Position',
      permittedClaimRefs: [],
      paragraphs: [{
        text: 'The assessment is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.',
        permittedClaimRefs: []
      }],
      subsections: []
    }]
  }]
};
normaliseProhibitedAssessmentAssurance(execNarrative);
const execText = execNarrative.chapters[0].sections[0].paragraphs[0].text;
assert.match(execText, /without verification of operating effectiveness by this review\.$/i);
assert.doesNotMatch(execText, /by this review of operating effectiveness/i);
assert.doesNotMatch(execNarrative.markdown, /by this review of operating effectiveness/i);

const findings = [
  {
    questionPrompt: 'The organisation monitors transactions or operational activity for unusual patterns, anomalies or red flags.',
    responseLabel: 'Partially designed'
  },
  {
    questionPrompt: 'Evidence linked to suspected fraud is identified, preserved and handled appropriately.',
    responseLabel: 'Initial / ad hoc'
  },
  {
    questionPrompt: 'The organisation provides a confidential or anonymous channel for reporting suspected fraud or misconduct.',
    responseLabel: 'Partially designed'
  }
];
const scenarioOne = groundEssentialScenarioStateLanguage(
  'The current control weakness in the pathway is that monitoring and exception review are at an initial or ad hoc stage. The activity may appear routine.',
  findings
);
assert.match(scenarioOne, /transaction and activity monitoring is self-assessed as "Partially designed"/i);
assert.doesNotMatch(scenarioOne, /monitoring and exception review are at an initial or ad hoc stage/i);

const scenarioTwo = groundEssentialScenarioStateLanguage(
  'The current control weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage. A delayed report can weaken containment.',
  findings
);
assert.match(scenarioTwo, /evidence preservation and custody are self-assessed as "Initial \/ ad hoc"/i);
assert.match(scenarioTwo, /confidential or anonymous reporting is self-assessed as "Partially designed"/i);
assert.doesNotMatch(scenarioTwo, /evidence preservation, reporting and custody are at an initial or ad hoc stage/i);

const template = readFileSync(new URL('../../src/lib/reports/templates/report-template.ts', import.meta.url), 'utf8');
const first30 = template.indexOf('First 30 days — decisions and foundations');
const day60 = template.indexOf('60-day implementation actions');
const day90 = template.indexOf('90-day implementation actions');
const conclusion = template.indexOf('roadmapConclusionNarrative ?');
assert.ok(first30 >= 0 && day60 > first30 && day90 > day60 && conclusion > day90, 'roadmap must render 30 -> 60 -> 90 -> conclusion');
assert.doesNotMatch(template, /60- and 90-day implementation actions/);
assert.match(template, /roadmapRowsForPeriod\('30 days'\)/);
assert.match(template, /roadmapRowsForPeriod\('60 days'\)/);
assert.match(template, /roadmapRowsForPeriod\('90 days'\)/);

assert.match(template, /long-section continue-after-short-tail'\),/);
assert.match(template, /long-section continue-after-short-tail splittable-risk-section'\),/);
assert.match(template, /long-section continue-after-short-tail'\)\n  \]\.join/);
assert.match(template, /\.report-section\.continue-after-short-tail \{ break-before: auto; page-break-before: auto; \}/);
assert.match(template, /\.splittable-risk-section \.risk-record \{ break-inside: auto; page-break-inside: auto; \}/);
assert.match(template, /groundEssentialScenarioStateLanguage\(value, evidenceModel\.materialFindings\)/);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  v7ExecutiveCopy: 'PASS',
  v7ScenarioStateGrounding: 'PASS',
  v7RoadmapChronology: 'PASS',
  v7SparsePageFlow: 'PASS'
}, null, 2));

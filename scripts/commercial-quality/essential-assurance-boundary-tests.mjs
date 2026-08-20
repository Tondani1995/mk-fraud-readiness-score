#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';

assert.equal(
  classifyAssuranceLanguage('This assessment has independently verified that the control operates as designed.')?.category,
  'prohibited_assurance'
);

// Regression from Mahlori attempt b4d82940-8391-4c10-9fd8-dbd41d4151a3: a target-control
// recommendation used passive future/normative wording and was incorrectly treated as MK assurance.
assert.equal(
  classifyAssuranceLanguage('Operating effectiveness should then be independently verified before management closes the action.')?.category,
  'customer_control_activity'
);
assert.equal(
  classifyAssuranceLanguage('The control evidence must be independently reviewed before reliance.')?.category,
  'customer_control_activity'
);
assert.equal(
  classifyAssuranceLanguage('Control effectiveness can be independently verified once the evidence pack is complete.')?.category,
  'customer_control_activity'
);
// Do not weaken the assurance boundary: assertions that verification already occurred remain blocked.
assert.equal(
  classifyAssuranceLanguage('Operating effectiveness was independently verified.')?.category,
  'prohibited_assurance'
);
assert.equal(
  classifyAssuranceLanguage('Operating effectiveness has been independently verified.')?.category,
  'prohibited_assurance'
);
assert.equal(
  classifyAssuranceLanguage('The report should independently verify the control before management relies on it.')?.category,
  'prohibited_assurance'
);
assert.equal(
  classifyAssuranceLanguage('The evidence must be independently verified by MK before closure.')?.category,
  'prohibited_assurance'
);

const narrative = {
  ok: true,
  markdown: '# Executive\n\nThe MK scoring method is strategic fraud-risk analysis and control design, not independent verification.\n\n## Target\n\nThis assessment has independently verified that evidence exists.',
  errors: [],
  chapters: [{
    chapterId: 'EXEC',
    title: 'Executive',
    sections: [{
      chapterId: 'EXEC',
      sectionId: 'POSITION',
      title: 'Position',
      permittedClaimRefs: [],
      paragraphs: [{
        text: 'The MK scoring method is strategic fraud-risk analysis and control design, not independent verification.',
        permittedClaimRefs: []
      }],
      subsections: [{
        subsectionId: 'TARGET',
        title: 'Target',
        paragraphs: [{
          text: 'This assessment has independently verified that evidence exists.',
          permittedClaimRefs: []
        }]
      }]
    }]
  }]
};

const count = normaliseProhibitedAssessmentAssurance(narrative);
assert.equal(count, 4, 'both parsed prose and raw Markdown should be normalised');
assert.doesNotMatch(narrative.markdown, /not independent verification/i);
assert.doesNotMatch(narrative.markdown, /assessment has independently verified/i);
assert.match(
  narrative.chapters[0].sections[0].paragraphs[0].text,
  /without verification of operating effectiveness by this review/i
);
assert.match(
  narrative.chapters[0].sections[0].subsections[0].paragraphs[0].text,
  /^the self-assessment responses indicate that evidence exists\.$/i
);
assert.equal(classifyAssuranceLanguage(narrative.chapters[0].sections[0].paragraphs[0].text), null);
assert.equal(classifyAssuranceLanguage(narrative.chapters[0].sections[0].subsections[0].paragraphs[0].text), null);

// Regression from Mahlori V6 attempt fd53430a-2a9e-4945-9c2c-6bb24c87a2ee: the provider
// used a passive completed-assurance assertion inside the target-control chapter. It correctly
// failed validation, but the deterministic normaliser did not yet cover this closed phrase.
const passiveCompletedAssurance = {
  ok: true,
  markdown: '# Target\n\nOperating effectiveness has been independently verified before closure.',
  errors: [],
  chapters: [{
    chapterId: 'TARGET',
    title: 'Target',
    sections: [{
      chapterId: 'TARGET',
      sectionId: 'RESPONSE-05',
      title: 'Response 05',
      permittedClaimRefs: [],
      paragraphs: [{
        text: 'Operating effectiveness has been independently verified before closure.',
        permittedClaimRefs: []
      }],
      subsections: []
    }]
  }]
};
const passiveCount = normaliseProhibitedAssessmentAssurance(passiveCompletedAssurance);
assert.equal(passiveCount, 2, 'passive completed-assurance wording must be normalised in parsed prose and raw Markdown');
assert.match(
  passiveCompletedAssurance.chapters[0].sections[0].paragraphs[0].text,
  /^operating effectiveness remains subject to evidence validation before closure\.$/i
);
assert.doesNotMatch(passiveCompletedAssurance.markdown, /has been independently verified/i);
assert.equal(classifyAssuranceLanguage(passiveCompletedAssurance.chapters[0].sections[0].paragraphs[0].text), null);

// Vhutshilo Customer-1 acceptance regression (2026-08-20): the provider manuscript was accepted,
// then final HTML rejected a transaction-volume absolute that had no earlier manuscript equivalent.
// Layer 0 must now remove the two closed unsupported absolutes before manuscript validation, while
// preserving the analytical point as an explicit self-assessment evidence limitation.
const unsupportedVolumeAbsolutes = {
  ok: true,
  markdown: '# Detection\n\nManual review cannot cover transaction volume. The majority of activity is never examined.',
  errors: [],
  chapters: [{
    chapterId: 'DETECTION',
    title: 'Detection',
    sections: [{
      chapterId: 'DETECTION',
      sectionId: 'VOLUME',
      title: 'Volume',
      permittedClaimRefs: [],
      paragraphs: [{
        text: 'Manual review cannot cover transaction volume. The majority of activity is never examined.',
        permittedClaimRefs: []
      }],
      subsections: []
    }]
  }]
};
const volumeCount = normaliseProhibitedAssessmentAssurance(unsupportedVolumeAbsolutes);
assert.equal(volumeCount, 4, 'both unsupported absolutes must be normalised in parsed prose and raw Markdown');
const volumeText = unsupportedVolumeAbsolutes.chapters[0].sections[0].paragraphs[0].text;
assert.doesNotMatch(volumeText, /manual review cannot cover transaction volume/i);
assert.doesNotMatch(volumeText, /majority of activity is never examined/i);
assert.match(volumeText, /manual-review coverage is not established by this self-assessment/i);
assert.match(volumeText, /share of activity examined is not established by this self-assessment/i);
assert.doesNotMatch(unsupportedVolumeAbsolutes.markdown, /manual review cannot cover transaction volume/i);
assert.doesNotMatch(unsupportedVolumeAbsolutes.markdown, /majority of activity is never examined/i);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  deterministicAssuranceBoundary: 'PASS',
  passiveCompletedAssuranceNormalisation: 'PASS',
  vhutshiloTransactionVolumeNormalisation: 'PASS'
}, null, 2));

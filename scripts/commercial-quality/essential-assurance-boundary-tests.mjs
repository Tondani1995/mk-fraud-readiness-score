#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';
import { validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { adjudicateTextFirstValidation, essentialCandidateId } from '../../src/lib/reports/essential-validation-cascade.ts';

function parsedWith(text) {
  return {
    ok: true,
    markdown: `# Chapter\n\n## Section\n\n${text}`,
    errors: [],
    chapters: [{
      chapterId: 'CHAPTER',
      title: 'Chapter',
      sections: [{
        chapterId: 'CHAPTER',
        sectionId: 'SECTION',
        title: 'Section',
        permittedClaimRefs: [],
        paragraphs: [{ text, permittedClaimRefs: [] }],
        subsections: []
      }]
    }]
  };
}

const factPack = { facts: [] };

test('limitation language is preserved; the normaliser only canonicalises equivalent decimals', () => {
  const limitation = parsedWith('Neither measure is independent assurance. No document, interview, transaction sample or system evidence has been independently verified for any item.');
  assert.equal(normaliseProhibitedAssessmentAssurance(limitation), 0);
  assert.match(limitation.chapters[0].sections[0].paragraphs[0].text, /Neither measure is independent assurance/);
  assert.match(limitation.markdown, /has been independently verified/);

  const report = validateBlueprintTextManuscript(limitation, {}, factPack);
  assert.equal(report.hardTruth.issues.length, 0);
  assert.equal(report.semanticCandidates.issues.length, 0, 'known limitation framing is not a prohibited assurance candidate');
});

test('prohibited assurance remains unchanged and becomes a semantic candidate for one reviewer pass', () => {
  const text = 'This report provides independent assurance that the controls are effective.';
  const parsed = parsedWith(text);
  assert.equal(normaliseProhibitedAssessmentAssurance(parsed), 0);
  const report = validateBlueprintTextManuscript(parsed, {}, factPack);
  assert.equal(report.hardTruth.issues.length, 0);
  assert.equal(report.semanticCandidates.issues.some((issue) => issue.code === 'assurance_claim'), true);

  const candidateSpan = report.semanticCandidates.issues[0].matchedSpan;
  const candidateId = essentialCandidateId('assurance_claim', 'SECTION.paragraphs[0]', candidateSpan);
  const rejected = adjudicateTextFirstValidation({
    parsed,
    report,
    factPack,
    semanticDecisions: [{ candidateId, disposition: 'REJECT', reasonCode: 'completed_assurance', reason: 'The report cannot claim it performed independent assurance.' }],
    requireSemanticReviewer: true
  });
  assert.equal(rejected.publishable, false);
  assert.ok(rejected.blockingCodes.includes('assurance_claim'));
});

test('customer-owned verification instructions remain safe without a phrase rewrite', () => {
  const text = 'Management should independently review whether supplier activation evidence was completed before release.';
  const parsed = parsedWith(text);
  assert.equal(normaliseProhibitedAssessmentAssurance(parsed), 0);
  const report = validateBlueprintTextManuscript(parsed, {}, factPack);
  assert.equal(report.hardTruth.issues.length, 0);
  assert.equal(report.semanticCandidates.issues.length, 0);
  assert.notEqual(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance');
});

test('decimal formatting remains deterministic and semantic wording is untouched', () => {
  const parsed = parsedWith('The recorded score is 20.00.');
  assert.equal(normaliseProhibitedAssessmentAssurance(parsed), 2);
  assert.equal(parsed.chapters[0].sections[0].paragraphs[0].text, 'The recorded score is 20.');
  assert.equal(parsed.markdown.includes('20.00'), false);
});

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  semanticPhraseNormalisation: 'REMOVED',
  limitationFalsePositives: 'PRESERVED',
  prohibitedAssurance: 'REVIEWER_CANDIDATE'
}, null, 2));

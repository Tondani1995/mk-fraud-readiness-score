#!/usr/bin/env node
import assert from 'node:assert/strict';
import { validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';

function parsedWith(text) {
  return {
    ok: true,
    markdown: `# Executive\n\n## Position\n\n${text}`,
    errors: [],
    chapters: [{
      chapterId: 'EXEC',
      title: 'Executive',
      sections: [{
        chapterId: 'EXEC',
        sectionId: 'POSITION',
        title: 'Position',
        permittedClaimRefs: [],
        paragraphs: [{ text, permittedClaimRefs: [] }],
        subsections: []
      }]
    }]
  };
}

function validateAfterRuntimeNormalisation(text, factPack) {
  const parsed = parsedWith(text);
  normaliseProhibitedAssessmentAssurance(parsed);
  return { parsed, report: validateBlueprintTextManuscript(parsed, {}, factPack) };
}

const factPack = {
  bibleVersion: '1.1',
  productTier: 'essential',
  organisation: { name: 'Fixture' },
  facts: [
    { id: 'score-20', kind: 'score', value: 20 },
    { id: 'score-20-5', kind: 'score', value: 20.5 }
  ]
};

const equivalent = validateAfterRuntimeNormalisation('The recorded score is 20.00.', factPack);
assert.equal(equivalent.parsed.chapters[0].sections[0].paragraphs[0].text, 'The recorded score is 20.');
assert.equal(equivalent.report.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), false, '20.00 must pass when deterministic Fact Pack contains 20');

const equivalentPercent = validateAfterRuntimeNormalisation('The recorded score is 20.00%.', factPack);
assert.equal(equivalentPercent.parsed.chapters[0].sections[0].paragraphs[0].text, 'The recorded score is 20%.');
assert.equal(equivalentPercent.report.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), false, '20.00% must preserve the existing percentage-insensitive numeric grounding rule');

const trailingZero = validateAfterRuntimeNormalisation('The recorded score is 20.50.', factPack);
assert.equal(trailingZero.parsed.chapters[0].sections[0].paragraphs[0].text, 'The recorded score is 20.5.');
assert.equal(trailingZero.report.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), false, '20.50 must pass when deterministic Fact Pack contains 20.5');

const unsupported = validateAfterRuntimeNormalisation('The recorded score is 20.01.', factPack);
assert.equal(unsupported.parsed.chapters[0].sections[0].paragraphs[0].text, 'The recorded score is 20.01.');
assert.equal(unsupported.report.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), true, 'A genuinely different numeric claim must still fail closed');

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', numericFormattingNormalisation: 'PASS', unsupportedNumericStillBlocked: 'PASS' }, null, 2));

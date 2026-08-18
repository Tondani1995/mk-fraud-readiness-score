#!/usr/bin/env node
import assert from 'node:assert/strict';
import { validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';

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

const factPack = {
  bibleVersion: '1.1',
  productTier: 'essential',
  organisation: { name: 'Fixture' },
  facts: [{ id: 'score-20', kind: 'score', value: 20 }]
};

const equivalent = validateBlueprintTextManuscript(parsedWith('The recorded score is 20.00.'), {}, factPack);
assert.equal(equivalent.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), false, '20.00 must be accepted when deterministic Fact Pack contains 20');

const equivalentPercent = validateBlueprintTextManuscript(parsedWith('The recorded score is 20.00%.'), {}, factPack);
assert.equal(equivalentPercent.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), false, '20.00% must retain the existing percentage-insensitive numeric equivalence');

const unsupported = validateBlueprintTextManuscript(parsedWith('The recorded score is 20.01.'), {}, factPack);
assert.equal(unsupported.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), true, 'A genuinely different numeric claim must still fail closed');

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', numericSemanticEquivalence: 'PASS' }, null, 2));

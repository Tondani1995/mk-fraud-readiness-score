#!/usr/bin/env node
import fs from 'node:fs';

const path = 'src/lib/reports/narrative/report-blueprint.ts';
let source = fs.readFileSync(path, 'utf8');

const varianceMarker = "const OUTPUT_BUDGET_NARRATIVE_VARIANCE = 0.2;";
if (!source.includes(varianceMarker)) {
  throw new Error('Could not find output-budget variance marker.');
}
if (!source.includes('const OUTPUT_BUDGET_TOKENS_PER_WORD = 1.5;')) {
  source = source.replace(
    varianceMarker,
    "// The commercial envelope is expressed in words, while provider maxOutputTokens is a token ceiling.\n// Treating one word as one token caused the 4,200-word Essential envelope to be capped at only\n// 6,204 tokens after reserves, which forced valid manuscripts into tail recovery. A conservative\n// 1.5 tokens/word conversion keeps the commercial word envelope unchanged while giving the\n// provider enough technical headroom to complete a normal Essential manuscript in one call.\nconst OUTPUT_BUDGET_TOKENS_PER_WORD = 1.5;\n" + varianceMarker
  );
}

const oldExpected = 'const expectedOutputTokens = expectedWordRange.maximum;';
const newExpected = 'const expectedOutputTokens = Math.ceil(expectedWordRange.maximum * OUTPUT_BUDGET_TOKENS_PER_WORD);';
if (!source.includes(oldExpected) && !source.includes(newExpected)) {
  throw new Error('Could not find expected-output-token calculation.');
}
source = source.replace(oldExpected, newExpected);

const oldBasis = "basis: 'Expected tier envelope is kept separate from the technical limit. Technical headroom is derived from 20% narrative variance, 20% heading/transition variance and two average heading units for the conclusion; the active model maximum remains the hard ceiling.'";
const newBasis = "basis: 'Expected tier envelope remains a commercial word range. The provider token budget converts the maximum word envelope at 1.5 tokens per word, then adds 20% narrative variance, 20% heading/transition variance and two average heading units for the conclusion; the active model maximum remains the hard ceiling.'";
if (!source.includes(oldBasis) && !source.includes(newBasis)) {
  throw new Error('Could not find output-budget basis text.');
}
source = source.replace(oldBasis, newBasis);

fs.writeFileSync(path, source);

const check = fs.readFileSync(path, 'utf8');
if (!check.includes('OUTPUT_BUDGET_TOKENS_PER_WORD = 1.5')) throw new Error('Token conversion was not written.');
if (!check.includes('Math.ceil(expectedWordRange.maximum * OUTPUT_BUDGET_TOKENS_PER_WORD)')) throw new Error('Expected token calculation was not corrected.');
console.log('Essential output-budget source patched successfully.');

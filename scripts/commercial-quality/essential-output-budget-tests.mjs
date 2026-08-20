#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  deriveWholeManuscriptOutputBudget,
  WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS
} from '../../src/lib/reports/narrative/report-blueprint.ts';

function syntheticBlueprint(reportTier, headingCount = 26) {
  assert.ok(headingCount >= 1);
  return {
    reportTier,
    chapters: [
      {
        sections: Array.from({ length: headingCount - 1 }, () => ({ optionalSubsections: [] }))
      }
    ]
  };
}

const essential = deriveWholeManuscriptOutputBudget(syntheticBlueprint('essential'));
assert.deepEqual(essential.expectedWordRange, { minimum: 2200, maximum: 4200 });
assert.equal(essential.headingCount, 26);
assert.equal(essential.expectedOutputTokens, 6300);
assert.equal(essential.averageExpectedTokensPerHeading, 243);
assert.equal(essential.narrativeVarianceTokens, 1260);
assert.equal(essential.headingAndTransitionReserveTokens, 1260);
assert.equal(essential.conclusionReserveTokens, 486);
assert.equal(essential.safetyMarginTokens, 3006);
assert.equal(essential.hardOutputTokenLimit, 9306);
assert.ok(essential.hardOutputTokenLimit > 6204, 'The corrected Essential ceiling must exceed the failed 6,204-token envelope.');
assert.ok(essential.hardOutputTokenLimit <= WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS);
assert.match(essential.basis, /1\.5 tokens per word/i);

// The commercial product envelope must not be widened by this technical correction.
const snapshot = deriveWholeManuscriptOutputBudget(syntheticBlueprint('snapshot', 10));
assert.deepEqual(snapshot.expectedWordRange, { minimum: 700, maximum: 1400 });
const comprehensive = deriveWholeManuscriptOutputBudget(syntheticBlueprint('comprehensive', 30));
assert.deepEqual(comprehensive.expectedWordRange, { minimum: 4200, maximum: 7600 });

// Acceptance generation uses one bounded attempt ledger per logical stage. Tail recovery remains
// available in the writer, but production must not silently spend it when the first call truncates.
const fulfilmentSource = fs.readFileSync('src/lib/reports/phase1-manual-fulfilment.ts', 'utf8');
assert.match(fulfilmentSource, /createV11WholeManuscriptWriter\(flags\.model, \{ allowTailRecovery: false \}\)/);
const writerSource = fs.readFileSync('src/lib/reports/narrative/whole-manuscript-writer.ts', 'utf8');
assert.match(writerSource, /this\.chargeProviderCall\('tail'\)/);
assert.match(writerSource, /runStage\('manuscript'/);
assert.match(writerSource, /runStage\('semantic_review'/);
assert.match(writerSource, /MAX_PROVIDER_ATTEMPTS_PER_STAGE/);
assert.match(writerSource, /maxRetries:\s*0/);
assert.match(writerSource, /provider_call_budget_exhausted/);
assert.match(writerSource, /allowTailRecovery/);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  essential: {
    expectedWordRange: essential.expectedWordRange,
    expectedOutputTokens: essential.expectedOutputTokens,
    hardOutputTokenLimit: essential.hardOutputTokenLimit,
    headingCount: essential.headingCount
  },
  boundedAttemptAcceptanceGuard: 'PRESERVED',
  boundedTailRecovery: 'PRESERVED'
}, null, 2));

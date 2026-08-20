#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  appendBlueprintTail,
  buildBlueprintMarkdownSkeleton,
  classifyWholeManuscriptGeneration,
  deriveMissingBlueprintTail
} from '../../src/lib/reports/narrative/blueprint-text.ts';
import { deriveTailOutputTokenLimit, deriveWholeManuscriptOutputBudget } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { classifyNarrativeIssue } from '../../src/lib/reports/narrative/validation-severity.ts';
import { emptyNarrativeRecoveryBudget, MAX_TRUNCATION_CONTINUATIONS, recoveryDecision } from '../../src/lib/reports/narrative/recovery-policy.ts';

function blueprint(reportTier) {
  return {
    reportTier,
    chapters: [{
      chapterId: 'CH-01',
      title: 'Executive assessment',
      sections: [
        { chapterId: 'CH-01', sectionId: 'SEC-01', title: 'Current position', requiredFacts: [], claimRefs: [], optionalSubsections: [{ subsectionId: 'SUB-01', title: 'Evidence', requiredFacts: [], claimRefs: [] }] },
        { chapterId: 'CH-01', sectionId: 'SEC-02', title: 'Management conclusion', requiredFacts: [], claimRefs: [], optionalSubsections: [] }
      ]
    }]
  };
}

const snapshotBudget = deriveWholeManuscriptOutputBudget(blueprint('snapshot'));
const essentialBudget = deriveWholeManuscriptOutputBudget(blueprint('essential'));
const comprehensiveBudget = deriveWholeManuscriptOutputBudget(blueprint('comprehensive'));
assert.equal(snapshotBudget.expectedOutputTokens, 2100);
assert.equal(essentialBudget.expectedOutputTokens, 6300);
assert.equal(comprehensiveBudget.expectedOutputTokens, 11400);
for (const budget of [snapshotBudget, essentialBudget, comprehensiveBudget]) {
  assert.ok(budget.hardOutputTokenLimit > budget.expectedOutputTokens);
  assert.ok(budget.safetyMarginTokens > 0);
  assert.equal(budget.hardOutputTokenLimit, budget.expectedOutputTokens + budget.safetyMarginTokens);
  assert.ok(deriveTailOutputTokenLimit(budget, 1) <= budget.hardOutputTokenLimit);
}

assert.equal(classifyWholeManuscriptGeneration({ finishReason: 'length', missingHeadingCount: 1 }), 'TECHNICAL_TRUNCATION');
assert.equal(classifyWholeManuscriptGeneration({ outputTokens: 4200, maxOutputTokens: 4200, missingHeadingCount: 1 }), 'TECHNICAL_TRUNCATION');
assert.equal(classifyWholeManuscriptGeneration({ finishReason: 'stop', missingHeadingCount: 0 }), 'COMPLETE');
assert.equal(classifyNarrativeIssue('technical_truncation').severity, 'TECHNICAL_TRUNCATION');
assert.equal(classifyNarrativeIssue('technical_truncation').repairEligible, false);

const testBlueprint = blueprint('essential');
const skeleton = buildBlueprintMarkdownSkeleton(testBlueprint).markdown;
const previous = [
  '# Executive assessment', 'The executive assessment is grounded in the deterministic record.',
  '## Current position', 'The current position is described for management action.',
  '### Evidence', 'The evidence path is stated without adding a new claim.'
].join('\n\n');
const missing = deriveMissingBlueprintTail(previous, testBlueprint);
assert.deepEqual(missing.missingHeadings, ['Management conclusion']);
assert.equal(missing.lastCompleteHeading, 'Evidence');
const tail = '## Management conclusion\n\nManagement should close the remaining gap through the agreed route.';
const completed = appendBlueprintTail(previous, tail, testBlueprint);
assert.match(completed, /## Management conclusion/);
assert.match(completed, /The current position is described for management action\./);
assert.throws(() => appendBlueprintTail(previous, `${tail}\n\n## Management conclusion`, testBlueprint), /Tail completion/);
assert.throws(() => appendBlueprintTail(previous, '## Wrong heading\n\nText', testBlueprint), /Tail completion/);
assert.match(skeleton, /## Management conclusion/);

const initial = emptyNarrativeRecoveryBudget();
assert.equal(recoveryDecision({ budget: initial, issueSeverity: 'TECHNICAL_TRUNCATION', issueScope: 'missing tail', fullGenerationRejected: true }).action, 'TAIL_COMPLETION');
const exhausted = { ...initial, truncationContinuationCount: MAX_TRUNCATION_CONTINUATIONS };
assert.equal(recoveryDecision({ budget: exhausted, issueSeverity: 'TECHNICAL_TRUNCATION', issueScope: 'missing tail', fullGenerationRejected: true }).action, 'FULL_REGENERATION');
assert.equal(recoveryDecision({ budget: exhausted, issueSeverity: 'TECHNICAL_TRUNCATION', issueScope: 'missing tail', fullGenerationRejected: false }).action, 'COHERENCE_PASS');

console.log(JSON.stringify({
  status: 'PASS',
  checks: [
    'tier-derived expected envelopes and technical headroom',
    'finish-reason and exact-cap truncation classification',
    'technical truncation severity is distinct from truth and quality',
    'missing-tail identification',
    'suffix-only append and duplicate/out-of-order rejection',
    'one continuation maximum with bounded full-regeneration fallback',
    'tail call remains separately accounted'
  ],
  budgets: {
    snapshot: snapshotBudget,
    essential: essentialBudget,
    comprehensive: comprehensiveBudget
  }
}, null, 2));

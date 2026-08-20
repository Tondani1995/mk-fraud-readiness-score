#!/usr/bin/env node
import assert from 'node:assert/strict';

import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildBlueprintMarkdownSkeleton } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { emptyNarrativeRecoveryBudget } from '../../src/lib/reports/narrative/recovery-policy.ts';
import { mergeWholeManuscriptRecoveryBudgets, reconcileWholeManuscript, WholeManuscriptReconciliationError } from '../../src/lib/reports/narrative/whole-manuscript-reconciliation.ts';

const data = await assembleReportData('MKORD-2026-22FF6B69');
const evidence = buildAdvisoryEvidenceModel(data);
const factPack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
assertNarrativeFactPack(factPack);
const plan = buildNarrativeStoryPlan(factPack);
assertNarrativeStoryPlan(plan, factPack);
const productionBlueprint = buildReportBlueprint(factPack, plan);
const productionSkeleton = buildBlueprintMarkdownSkeleton(productionBlueprint);
assert.equal(productionSkeleton.headings.length, 27, 'the corrected Rivonia Blueprint is intentionally concise');

// Keep the historical transport regression independent from the current commercial Blueprint.
// Attempt 1 stopped at a complete 38-heading fixture; changing the live Rivonia editorial shape
// must not erase that exact 37-to-38 reconciliation contract.
const sectionTemplate = productionBlueprint.chapters[0].sections[0];
const blueprint = {
  ...productionBlueprint,
  chapters: [{
    ...productionBlueprint.chapters[0],
    chapterId: 'ATTEMPT-1-FIXTURE',
    title: 'Attempt 1 fixture',
    order: 1,
    sections: Array.from({ length: 37 }, (_, index) => ({
      ...sectionTemplate,
      sectionId: index === 36 ? 'MANAGEMENT-CONCLUSION-SECTION' : index === 35 ? 'BY-90-DAYS-SECTION' : `FIXTURE-SECTION-${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      title: index === 36 ? 'Management conclusion' : index === 35 ? 'By 90 days' : `Fixture section ${String(index + 1).padStart(2, '0')}`,
      requiredFacts: ['SCORE-001'],
      claimRefs: ['SCORE-001'],
      optionalSubsections: []
    }))
  }]
};
const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
assert.equal(skeleton.headings.length, 38, 'the exact Attempt-1 fixture requires a complete 38-heading Blueprint');

function contentFor(heading) {
  if (heading.kind === 'chapter') return `# ${heading.title}`;
  return `${'#'.repeat(heading.level)} ${heading.title}\n\nManagement should translate this deterministic section into a clear organisation-owned next step through the agreed governance route.`;
}

const allHeadings = skeleton.headings.map(contentFor);
const completeInitialMarkdown = allHeadings.slice(0, -1).join('\n\n');
const initialMarkdown = `${completeInitialMarkdown.slice(0, -1)},`;
const validContinuation = [
  'with the next management checkpoint recorded through the agreed governance route.',
  '',
  '## Management conclusion',
  '',
  'Management should close the first operating cycle through accountable ownership, priority controls and a repeatable review rhythm.'
].join('\n');

function reconcile(overrides = {}) {
  return reconcileWholeManuscript({
    initialMarkdown,
    blueprint,
    factPack,
    initialOutputTokens: 4200,
    initialMaxOutputTokens: 4200,
    ...overrides
  });
}

// Exact Attempt-1 replay: the persisted first response stops immediately before the deterministic
// Management conclusion node; the legitimate bounded continuation is joined before final parsing.
const replay = reconcile({ continuationMarkdown: validContinuation });
assert.equal(replay.continuationUsed, true);
assert.equal(replay.initialHeadingCount, 37);
assert.equal(replay.finalHeadingCount, 38);
assert.equal(replay.parsed.ok, true, JSON.stringify(replay.parsed.errors));
assert.equal(replay.validation.ok, true, JSON.stringify(replay.validation));
assert.equal(replay.validation.hardTruth.status, 'PASS');
assert.equal(replay.validation.repairableSemantic.status, 'PASS');
assert.equal(replay.parsed.chapters.at(-1).sections.at(-1).title, 'Management conclusion');
assert.equal(replay.boundary.previousHeading?.title, 'By 90 days');
assert.equal(replay.boundary.nextHeading?.title, 'Management conclusion');
assert.deepEqual(replay.boundary.missingHeadings, ['Management conclusion']);
assert.equal((replay.markdown.match(/^#{1,3} .+$/gm) ?? []).length, 38);
assert.equal((replay.markdown.match(/^## Management conclusion$/gm) ?? []).length, 1);

// The returned reconciled manuscript is the persistence candidate, not the incomplete initial text.
const persistedParsed = JSON.parse(JSON.stringify(replay.parsed));
assert.equal(persistedParsed.chapters.at(-1).sections.at(-1).title, 'Management conclusion');
assert.deepEqual(
  persistedParsed.chapters.at(-1).sections.at(-1).permittedClaimRefs,
  [...new Set([
    ...blueprint.chapters.at(-1).sections.at(-1).requiredFacts,
    ...blueprint.chapters.at(-1).sections.at(-1).claimRefs
  ])]
);

// Technical completion is not semantic repair and does not consume Attempt 2.
const initialBudget = { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 };
const continuationBudget = { ...emptyNarrativeRecoveryBudget(), truncationContinuationCount: 1, totalCalls: 1 };
const mergedBudget = mergeWholeManuscriptRecoveryBudgets(initialBudget, continuationBudget);
assert.equal(mergedBudget.initialGenerationCount, 1);
assert.equal(mergedBudget.truncationContinuationCount, 1);
assert.equal(mergedBudget.targetedRepairCount, 0);
assert.equal(mergedBudget.fullRegenerationCount, 0);
assert.equal(mergedBudget.totalCalls, 2);

function expectFailure(name, continuationMarkdown, code) {
  assert.throws(() => reconcile({ continuationMarkdown }), (error) => {
    assert.ok(error instanceof WholeManuscriptReconciliationError, `${name} should use the reconciliation failure type`);
    assert.equal(error.code, code, `${name} should fail with ${code}, received ${error.code}`);
    return true;
  });
}

expectFailure('missing continuation', undefined, 'continuation_missing');
expectFailure('overlapping/duplicated continuation', [
  'with the next management checkpoint recorded through the agreed governance route.', '',
  '## Management conclusion', '',
  'Management should translate this deterministic section into a clear organisation-owned next step through the agreed governance route.', '',
  'Management should close the first operating cycle through accountable ownership, priority controls and a repeatable review rhythm.'
].join('\n'), 'continuation_invalid');
expectFailure('invalid continuation provenance', [
  'with the next management checkpoint recorded through the agreed governance route.', '',
  '## Management conclusion', '',
  'Management should close ROADMAP-999 through accountable ownership and a repeatable review rhythm.'
].join('\n'), 'reconciled_validation_failed');
expectFailure('continuation ends incomplete', '## Management conclusion\n\nManagement should close the first operating cycle through accountable ownership', 'continuation_invalid');
assert.throws(() => reconcile({ continuationMarkdown: validContinuation, initialFinishReason: 'stop', initialOutputTokens: 3000 }), (error) => {
  assert.ok(error instanceof WholeManuscriptReconciliationError);
  assert.equal(error.code, 'initial_manuscript_incomplete');
  return true;
});

// A normal complete response is persisted as-is and never triggers a continuation.
const complete = reconcileWholeManuscript({ initialMarkdown: allHeadings.join('\n\n'), blueprint, factPack, initialOutputTokens: 3000, initialMaxOutputTokens: 4200 });
assert.equal(complete.continuationUsed, false);
assert.equal(complete.finalHeadingCount, 38);
assert.equal(complete.validation.ok, true);
assert.equal(complete.parsed.chapters.at(-1).sections.at(-1).title, 'Management conclusion');

// A cleanly terminated prefix must start its continuation at the exact heading boundary.
assert.throws(() => reconcileWholeManuscript({ initialMarkdown: completeInitialMarkdown, continuationMarkdown: validContinuation, blueprint, factPack, initialOutputTokens: 4200, initialMaxOutputTokens: 4200 }), (error) => {
  assert.ok(error instanceof WholeManuscriptReconciliationError);
  assert.equal(error.code, 'continuation_invalid');
  return true;
});

console.log(JSON.stringify({
  status: 'PASS',
  aiCalls: 0,
  initialHeadings: replay.initialHeadingCount,
  reconciledHeadings: replay.finalHeadingCount,
  persistedManagementConclusion: true,
  provenance: replay.validation.ok ? 'PASS' : 'FAIL',
  assurance: replay.validation.hardTruth.issues.some((issue) => issue.code === 'assurance_claim') ? 'FAIL' : 'PASS',
  semanticCorrectionsConsumed: mergedBudget.targetedRepairCount,
  attempt2Consumed: mergedBudget.fullRegenerationCount,
  checks: [
    'exact Attempt-1 37-to-38 heading replay',
    'single logical manuscript before parse and persistence',
    'missing continuation fail-closed',
    'overlap/duplicate continuation fail-closed',
    'continuation provenance fail-closed',
    'incomplete continuation fail-closed',
    'normal complete response requires no continuation',
    'technical completion does not consume semantic repair budget'
  ]
}, null, 2));

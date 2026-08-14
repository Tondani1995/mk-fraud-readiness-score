#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { fromAssembledReportData } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildEssentialNarrativeFactPack, buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, buildSnapshotReportBlueprint, buildWholeManuscriptContext, assertReportBlueprint, validateReportBlueprint, WHOLE_MANUSCRIPT_APPROVED_INPUT_TOKENS, WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { classifyNarrativeIssue, canReleaseNarrative } from '../../src/lib/reports/narrative/validation-severity.ts';
import { emptyNarrativeRecoveryBudget, recoveryDecision, assertRecoveryBudget } from '../../src/lib/reports/narrative/recovery-policy.ts';

const rivonia = await assembleReportData('MKORD-2026-22FF6B69');
const rivoniaEvidence = buildAdvisoryEvidenceModel(rivonia);
const rivoniaPack = buildEssentialNarrativeFactPack(rivonia, rivoniaEvidence, buildEssentialProjection(rivonia, rivoniaEvidence));
assertNarrativeFactPack(rivoniaPack);
const rivoniaPlan = buildNarrativeStoryPlan(rivoniaPack);
assertNarrativeStoryPlan(rivoniaPlan, rivoniaPack);
const rivoniaBlueprint = buildReportBlueprint(rivoniaPack, rivoniaPlan);
assertReportBlueprint(rivoniaBlueprint, rivoniaPack);
assert.equal(rivoniaBlueprint.chapters.length, 6);
assert.equal(rivoniaBlueprint.chapters.filter((chapter) => /executive/i.test(chapter.title)).length, 1);
assert.equal(rivoniaBlueprint.chapters.filter((chapter) => /90 days|roadmap/i.test(chapter.title)).length, 1);
assert.equal(rivoniaBlueprint.findingClusters.length > 0, true);
assert.deepEqual(rivoniaBlueprint.findingClusters.map((cluster) => cluster.title), [
  'Value diversion through supplier and payment processes',
  'Weak challenge at identity, transaction and sensitive-change points',
  'Limited containment and learning after suspected fraud'
]);
const rivoniaDiagnosis = rivoniaBlueprint.chapters.find((chapter) => chapter.chapterId === 'WHAT-HOLDS-READINESS-BACK');
// The diagnosis chapter title is generic. The engine no longer names a customer.
assert.equal(rivoniaDiagnosis?.title, 'What is holding readiness back');
assert.equal(rivoniaDiagnosis?.narrativeRole, 'DIAGNOSIS');
assert.equal(rivoniaDiagnosis?.sections.length, 1);
// Diagnosis claims the domains the assessment makes material, weakest first,
// rather than a hand-picked list. D4 (20.00) and D7 (20.59) are the weakest two.
assert.equal(rivoniaDiagnosis?.sections[0]?.requiredFacts.includes('DOMAIN-D4'), true);
assert.equal(rivoniaDiagnosis?.sections[0]?.requiredFacts.includes('DOMAIN-D7'), true);
// Cross-cutting findings are diagnosed, not listed as exposures.
assert.equal(rivoniaDiagnosis?.sections[0]?.requiredFacts.includes('FINDING-001'), true);
assert.equal(rivoniaDiagnosis?.sections[0]?.requiredFacts.includes('FINDING-007'), true);
const rivoniaExposure = rivoniaBlueprint.chapters.find((chapter) => chapter.chapterId === 'PRIORITY-FRAUD-EXPOSURES');
assert.equal(rivoniaExposure?.title, 'Priority fraud exposures');
assert.equal(rivoniaExposure?.narrativeRole, 'EXPOSURE');
// FINDING-001 (fraud governance) and FINDING-007 (fraud risk identification) are
// cross-cutting: they enable every exposure rather than being one, so both are
// diagnosed above and neither appears in the exposure register.
assert.deepEqual(rivoniaExposure?.sections.map((section) => section.requiredFacts), [
  ['FINDING-002', 'FINDING-003'],
  ['FINDING-005', 'FINDING-006'],
  ['FINDING-004', 'FINDING-008']
]);
assert.equal(rivoniaExposure?.sections.every((section) => section.optionalSubsections.length === 0), true);
assert.equal(rivoniaBlueprint.contentAssignments.find((item) => item.contentType === 'finding' && item.contentRef === 'FINDING-001')?.chapterId, 'WHAT-HOLDS-READINESS-BACK');
const rivoniaThirtyDays = rivoniaBlueprint.chapters.find((chapter) => chapter.chapterId === 'FIRST-90-DAYS-CONCLUSION')?.sections[0];
assert.equal(rivoniaThirtyDays?.title, 'By 30 days — Stabilise');
// The stage claims the roadmap actions targeted at it, not a hand-picked control.
assert.deepEqual(rivoniaThirtyDays?.requiredFacts, rivoniaPack.roadmap.filter((item) => item.targetPeriod === '30 days').map((item) => item.factRef));
assert.match(rivoniaThirtyDays?.purpose ?? '', /evidence-preservation/i);
assert.equal(rivoniaBlueprint.chapters.find((chapter) => chapter.chapterId === 'EXPOSURE-COULD-MATERIALISE')?.narrativeRole, 'EXPOSURE_ILLUSTRATION');
assert.equal(rivoniaBlueprint.chapters.some((chapter) => chapter.sections.length > 1), true);
assert.equal(rivoniaBlueprint.chapters.some((chapter) => chapter.sections.some((section) => section.optionalSubsections.length > 1)), true);
assert.equal(rivoniaBlueprint.chapters.some((chapter) => chapter.sections.some((section) => section.optionalSubsections.length === 0)), true);
assert.equal(rivoniaBlueprint.chapters.flatMap((chapter) => chapter.exhibits).every((item) => item.narrativeLeadIn && item.demonstrates && item.interpretation), true);
assert.equal(rivoniaBlueprint.contentAssignments.every((item) => item.assignmentType === 'primary_home'), true);
assert.equal(rivoniaBlueprint.narrativeCrossReferences.length > 0, true);
assert.equal(rivoniaBlueprint.chapters.flatMap((chapter) => chapter.exhibits).every((item) => item.sourceRefs.length > 0), true);
assert.equal(rivoniaBlueprint.chapters.every((chapter) => chapter.narrativeRole && chapter.sections.every((section) => section.narrativeRole && section.optionalSubsections.every((subsection) => subsection.narrativeRole))), true);
assert.deepEqual(rivoniaBlueprint.transformationSequence.map((stage) => stage.stage), ['STABILISE', 'ESTABLISH', 'EMBED', 'MATURE']);
assert.equal(rivoniaBlueprint.narrativeRoleUsage.ledger.length > 0, true);
assert.equal(Object.keys(rivoniaBlueprint.narrativeRoleUsage.findingUsage).length > 0, true);
assert.equal(/\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/.test(rivoniaBlueprint.chapters.flatMap((chapter) => [chapter.title, chapter.purpose, chapter.requiredManagementTakeaway, ...chapter.sections.flatMap((section) => [section.title, section.purpose, section.requiredManagementTakeaway, ...section.optionalSubsections.map((subsection) => subsection.title)])]).join(' ')), false);
assert.equal(validateReportBlueprint(rivoniaBlueprint, rivoniaPack).ok, true);
assert.deepEqual(buildReportBlueprint(rivoniaPack, rivoniaPlan), rivoniaBlueprint);
const rivoniaContext = buildWholeManuscriptContext(rivoniaPack, rivoniaBlueprint);
assert.equal(rivoniaContext.architecture, 'whole-manuscript');
assert.equal(rivoniaContext.permittedDeterministicFacts.length > 0, true);
assert.equal(rivoniaContext.singleCallFeasible, true);
assert.equal(rivoniaContext.partitionPlan.length, 0);
assert.equal(rivoniaContext.approvedInputTokenLimit, WHOLE_MANUSCRIPT_APPROVED_INPUT_TOKENS);
assert.equal(WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS, 400000);

const kestrel = await assembleReportData('MKORD-2026-7FBBEE23');
const kestrelModel = await fromAssembledReportData(kestrel);
const kestrelPack = buildComprehensiveNarrativeFactPack(kestrelModel);
assertNarrativeFactPack(kestrelPack);
const kestrelPlan = buildNarrativeStoryPlan(kestrelPack);
assertNarrativeStoryPlan(kestrelPlan, kestrelPack);
const kestrelBlueprint = buildReportBlueprint(kestrelPack, kestrelPlan);
assertReportBlueprint(kestrelBlueprint, kestrelPack);
assert.equal(kestrelBlueprint.chapters.length, 9);
assert.equal(kestrelBlueprint.chapters.filter((chapter) => /executive/i.test(chapter.title)).length, 1);
assert.equal(kestrelBlueprint.chapters.filter((chapter) => /conclusion/i.test(chapter.title)).length, 1);
assert.equal(validateReportBlueprint(kestrelBlueprint, kestrelPack).ok, true);
const kestrelContext = buildWholeManuscriptContext(kestrelPack, kestrelBlueprint);
assert.equal(kestrelContext.reportBlueprint.reportTier, 'comprehensive');
assert.equal(kestrelContext.projectedInputTokens.maximum > 0, true);
assert.equal(kestrelContext.singleCallFeasible, true);
assert.equal(kestrelContext.partitionPlan.length, 0);
assert.equal(kestrelBlueprint.chapters.some((chapter) => chapter.sections.length > 1), true);
assert.equal(kestrelBlueprint.chapters.flatMap((chapter) => chapter.sections).some((section) => section.optionalSubsections.length > 1), true);
assert.equal(kestrelBlueprint.narrativeCrossReferences.length > 0, true);
assert.deepEqual(kestrelBlueprint.transformationSequence.map((stage) => stage.stage), ['STABILISE', 'ESTABLISH', 'EMBED', 'MATURE']);
assert.equal(kestrelBlueprint.narrativeRoleUsage.ledger.length > 0, true);

const snapshot = buildSnapshotReportBlueprint({ organisation: { name: 'Snapshot Organisation' }, assessmentReference: 'MKFRS-SNAPSHOT' });
assertReportBlueprint(snapshot);
assert.equal(snapshot.chapters.length, 5);
assert.equal(snapshot.chapters.every((chapter) => chapter.narrativeRole && chapter.sections.every((section) => section.narrativeRole)), true);
assert.deepEqual(snapshot.transformationSequence, []);
assert.equal(/Essential|Comprehensive|paid report|order|payment/i.test([snapshot.reportTitle, snapshot.executiveStory, ...snapshot.chapters.flatMap((chapter) => [chapter.title, chapter.purpose, chapter.requiredManagementTakeaway])].join(' ')), false);

assert.equal(classifyNarrativeIssue('unknown_claim_ref').severity, 'HARD_TRUTH_FAILURE');
assert.equal(classifyNarrativeIssue('duplicate_statement').repairEligible, true);
assert.equal(classifyNarrativeIssue('repetition').blocking, false);
assert.equal(canReleaseNarrative(['repetition']), true);
assert.equal(canReleaseNarrative(['unknown_claim_ref']), false);

const oversizedBlueprint = structuredClone(rivoniaBlueprint);
oversizedBlueprint.executiveStory = 'x'.repeat(1_000_000);
const oversizedContext = buildWholeManuscriptContext(rivoniaPack, oversizedBlueprint);
assert.equal(oversizedContext.singleCallFeasible, false);
assert.equal(oversizedContext.partitionPlan.length, 2);

const budget = emptyNarrativeRecoveryBudget();
assert.equal(recoveryDecision({ budget, issueSeverity: 'REPAIRABLE_SEMANTIC_FAILURE', issueScope: 'block', fullGenerationRejected: false }).scope, 'block');
budget.targetedRepairCount = 4;
assert.equal(recoveryDecision({ budget, issueSeverity: 'REPAIRABLE_SEMANTIC_FAILURE', issueScope: 'section', fullGenerationRejected: true }).action, 'FULL_REGENERATION');
budget.fullRegenerationCount = 1;
budget.coherenceCount = 1;
budget.initialGenerationCount = 1;
budget.totalCalls = 7;
assert.equal(recoveryDecision({ budget, issueSeverity: 'REPAIRABLE_SEMANTIC_FAILURE', issueScope: 'section', fullGenerationRejected: false }).action, 'HUMAN_REVIEW_REQUIRED');
assertRecoveryBudget(budget);

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', rivonia: { chapters: rivoniaBlueprint.chapters.length, clusters: rivoniaBlueprint.findingClusters.length, context: rivoniaContext.projectedInputTokens }, kestrel: { chapters: kestrelBlueprint.chapters.length, clusters: kestrelBlueprint.findingClusters.length, context: kestrelContext.projectedInputTokens }, snapshot: { chapters: snapshot.chapters.length }, severity: 'PASS', recovery: 'PASS' }, null, 2));

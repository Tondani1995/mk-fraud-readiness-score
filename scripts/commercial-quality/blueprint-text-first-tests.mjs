#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { classifyNarrativeIssue } from '../../src/lib/reports/narrative/validation-severity.ts';
import { emptyNarrativeRecoveryBudget, recoveryDecision } from '../../src/lib/reports/narrative/recovery-policy.ts';

const data = await assembleReportData('MKORD-2026-22FF6B69');
const evidence = buildAdvisoryEvidenceModel(data);
const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
assertNarrativeFactPack(pack);
const plan = buildNarrativeStoryPlan(pack);
assertNarrativeStoryPlan(plan, pack);
const blueprint = buildReportBlueprint(pack, plan);
const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
const complete = skeleton.headings.map((heading) => {
  const paragraph = heading.kind === 'chapter' ? '' : `Management should translate the ${heading.title.toLowerCase()} assessment into a clear next step for the organisation.`;
  return `${'#'.repeat(heading.level)} ${heading.title}${paragraph ? `\n\n${paragraph}` : ''}`;
}).join('\n\n');

const parsed = parseBlueprintMarkdown(complete, blueprint);
assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
assert.equal(parsed.chapters.length, blueprint.chapters.length);
assert.equal(parsed.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0), blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0));
assert.equal(parsed.chapters.flatMap((chapter) => chapter.sections).every((section) => section.permittedClaimRefs.length > 0), true);
assert.equal(validateBlueprintTextManuscript(parsed, blueprint, pack).ok, true);

const cases = [
  ['missing heading', complete.replace('# What management should change', '') , 'heading_count'],
  ['renamed heading', complete.replace('# What management should change', '# What management should do'), 'heading_order_or_name'],
  ['reordered heading', complete.replace('## By 30 days', '## TEMPORARY-ORDER').replace('## By 60 days', '## By 30 days').replace('## TEMPORARY-ORDER', '## By 60 days'), 'heading_order_or_name'],
  ['added heading', `${complete}\n\n## Unsupported analytical chapter\n\nUnsupported prose.`, 'heading_count']
];
for (const [name, markdown, errorCode] of cases) {
  const result = parseBlueprintMarkdown(markdown, blueprint);
  assert.equal(result.ok, false, `${name} should fail`);
  assert.equal(result.errors.some((issue) => issue.code === errorCode), true, `${name} should emit ${errorCode}: ${JSON.stringify(result.errors)}`);
}

const rawId = parseBlueprintMarkdown(complete.replace('Management should translate', 'Management should translate FINDING-001 and'), blueprint);
assert.equal(validateBlueprintTextManuscript(rawId, blueprint, pack).hardTruth.issues.some((issue) => issue.code === 'raw_internal_id'), true);
const unsupportedNumber = parseBlueprintMarkdown(complete.replace('Management should translate', 'Management should translate 999999'), blueprint);
assert.equal(validateBlueprintTextManuscript(unsupportedNumber, blueprint, pack).hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), true);
const assurance = parseBlueprintMarkdown(complete.replace('Management should translate', 'The report independently verified operating effectiveness; management should translate'), blueprint);
assert.equal(validateBlueprintTextManuscript(assurance, blueprint, pack).semanticCandidates.issues.some((issue) => issue.code === 'assurance_claim'), true);
const customerOwnedReview = parseBlueprintMarkdown(complete.replace('Management should translate', 'Management should independently review whether supplier activation evidence was completed before release; management should translate'), blueprint);
assert.equal(validateBlueprintTextManuscript(customerOwnedReview, blueprint, pack).hardTruth.issues.some((issue) => issue.code === 'assurance_claim'), false);
const customerOwnedVerification = parseBlueprintMarkdown(complete.replace('Management should translate', 'If a bank-detail change is not independently verified through a trusted channel before payment, management should pause release; management should translate'), blueprint);
assert.equal(validateBlueprintTextManuscript(customerOwnedVerification, blueprint, pack).hardTruth.issues.some((issue) => issue.code === 'assurance_claim'), false);

assert.equal(classifyNarrativeIssue('missing_section').severity, 'HARD_TRUTH_FAILURE');
assert.equal(classifyNarrativeIssue('repetition').severity, 'QUALITY_FAILURE');
assert.equal(classifyNarrativeIssue('duplicate_statement').repairEligible, true);
const budget = emptyNarrativeRecoveryBudget();
assert.equal(recoveryDecision({ budget, issueSeverity: 'REPAIRABLE_SEMANTIC_FAILURE', issueScope: 'block', fullGenerationRejected: false }).scope, 'block');
budget.targetedRepairCount = 4;
assert.equal(recoveryDecision({ budget, issueSeverity: 'REPAIRABLE_SEMANTIC_FAILURE', issueScope: 'section', fullGenerationRejected: true }).action, 'FULL_REGENERATION');
budget.fullRegenerationCount = 1;
assert.equal(recoveryDecision({ budget, issueSeverity: 'QUALITY_FAILURE', issueScope: 'section', fullGenerationRejected: false }).action, 'QUALITY_ESCALATION');
budget.qualityEscalationCount = 1;
budget.coherenceCount = 1;
assert.equal(recoveryDecision({ budget, issueSeverity: 'QUALITY_FAILURE', issueScope: 'section', fullGenerationRejected: false }).action, 'HUMAN_REVIEW_REQUIRED');

console.log(JSON.stringify({
  status: 'PASS',
  aiCalls: 0,
  skeletonHeadings: skeleton.headings.length,
  chapters: blueprint.chapters.length,
  sections: blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0),
  checks: ['skeleton rendering', 'exact hierarchy and order', 'missing/renamed/reordered/added heading rejection', 'deterministic section provenance', 'synthetic manuscript parse and validation', 'hard/repairable/quality severity', 'recovery budgets']
}, null, 2));

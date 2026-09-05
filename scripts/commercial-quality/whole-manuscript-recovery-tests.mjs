#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { recoverWholeManuscript } from '../../src/lib/reports/narrative/whole-manuscript-recovery.ts';
import { emptyNarrativeRecoveryBudget, recoveryDecision } from '../../src/lib/reports/narrative/recovery-policy.ts';
import { classifyNarrativeIssue, classifyNarrativeRecoveryIssue } from '../../src/lib/reports/narrative/validation-severity.ts';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';

const fact = (id, value = 'Recorded fact') => ({ id, kind: 'finding', value });
const sections = [
  { chapterId: 'CH-01', sectionId: 'EXECUTIVE-ASSESSMENT-TAKEAWAY', order: 1, title: 'What management should take away', purpose: 'Set the implication.', requiredManagementTakeaway: 'Management should preserve the recorded meaning.', requiredFacts: ['FACT-001'], claimRefs: ['FACT-001'], narrativeRole: 'JUDGEMENT', optionalSubsections: [] },
  ...Array.from({ length: 36 }, (_, index) => ({ chapterId: 'CH-01', sectionId: `SECTION-${String(index + 2).padStart(2, '0')}`, order: index + 2, title: `Deterministic section ${index + 2}`, purpose: 'Explain the bounded position.', requiredManagementTakeaway: 'Management should preserve the recorded meaning.', requiredFacts: ['FACT-001'], claimRefs: ['FACT-001'], narrativeRole: 'EVIDENCE', optionalSubsections: [] }))
];
const blueprint = {
  schemaVersion: 'test-blueprint', bibleVersion: '1.1', reportTitle: 'Test', reportTier: 'essential', narrativeMode: 'ADVISORY', organisation: { name: 'Test Organisation', sectorFacts: [] },
  assessmentPosition: { reference: 'TEST-ASSESSMENT', score: 42, maturity: 'Developing', exposureScore: 10, exposureBand: 'Moderate', summary: 'Recorded position.', assuranceBoundary: 'The assessment does not independently verify operating effectiveness.' },
  executiveStory: 'A bounded story.', chapters: [{ chapterId: 'CH-01', order: 1, title: 'Executive assessment', purpose: 'Explain the position.', requiredManagementTakeaway: 'Management should preserve the recorded meaning.', requiredFacts: ['FACT-001'], claimRefs: ['FACT-001'], linkedFindingIds: [], linkedScenarioIds: [], linkedControlIds: [], linkedDecisionIds: [], linkedRoadmapIds: [], narrativeRole: 'JUDGEMENT', exhibits: [], sections }],
  findingClusters: [], contentAssignments: [], narrativeCrossReferences: [], narrativeRoleUsage: { factUsage: {}, findingUsage: {}, scenarioUsage: {}, controlUsage: {}, ledger: [] }, transformationSequence: [], deterministicRules: [], prohibitedClaims: ['Do not claim independent verification.']
};
const facts = { facts: [fact('FACT-001', 'The recorded control position is initial.'), fact('FACT-002', 'A neighbouring recorded management implication.')], productTier: 'essential', bibleVersion: '1.1', organisation: { name: 'Test Organisation', sectorFacts: [] }, assessment: { reference: 'TEST-ASSESSMENT', score: 42, maturity: 'Developing', exposureBand: 'Moderate', uncertaintyFacts: [] }, systemicThemeInputs: [], findings: [], scenarios: [], controls: [], decisions: [], roadmap: [], maturationSteps: [], sustainmentPriorities: [], relativeStrengths: [], narrativeMode: 'ADVISORY', proofOfProgress: [] };
const context = { boundaries: { assurance: 'The assessment does not independently verify operating effectiveness, evidence or every in-scope control.' }, outputBudget: { hardOutputTokenLimit: 4200 }, permittedDeterministicFacts: facts.facts };
const skeleton = buildBlueprintMarkdownSkeleton(blueprint).markdown;
let proseIndex = 0;
const complete = skeleton.split('\n\n').map((block) => /^## /.test(block) ? `${block}\n\nThe recorded position should guide a clear management response for area ${String.fromCharCode(65 + (proseIndex++ % 26))}${proseIndex > 26 ? ' extended' : ''}.` : block).join('\n\n');
assert.equal((complete.match(/^#{1,3} .+$/gm) ?? []).length, 38);
const bad = `${complete.replace(/## What management should take away\n\n[^\n]+/, '## What management should take away\n\nthe controls were independently verified\n\nA neighbouring management implication remains recorded.')}`;
const good = bad.replace('the controls were independently verified', 'the recorded control position should be reviewed by management before reliance');
const baseCandidate = (markdown, recovery = { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }) => ({ contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', markdown, blueprint, writerMetadata: { contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', provider: 'openai', model: 'openai/gpt-5.6-luna', promptVersion: 'test', generationMode: 'ai', generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'fact', inputStoryPlanSha256: 'plan', recovery } });
const validation = validateBlueprintTextManuscript(parseBlueprintMarkdown(bad, blueprint), blueprint, facts);
assert.equal(validation.ok, false);
assert.equal(validation.hardTruth.issues.some((issue) => issue.code === 'assurance_claim'), true);
assert.equal(classifyNarrativeIssue('assurance_claim').blocking, true);
assert.equal(classifyNarrativeIssue('assurance_claim').repairEligible, false);
assert.equal(classifyNarrativeRecoveryIssue({ code: 'assurance_claim', localSemanticEligible: true }).severity, 'REPAIRABLE_SEMANTIC_FAILURE');
assert.equal(classifyNarrativeRecoveryIssue({ code: 'assurance_claim', localSemanticEligible: true }).blocking, true);
assert.equal(recoveryDecision({ budget: { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1 }, issueSeverity: 'REPAIRABLE_SEMANTIC_FAILURE', issueScope: 'block', fullGenerationRejected: true }).action, 'TARGETED_REPAIR');

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-v11-recovery-'));
let repairCalls = 0;
const writer = {
  model: 'openai/gpt-5.6-luna', provider: 'openai', promptVersion: 'test',
  async repairBlock() { repairCalls += 1; return { contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript-targeted-repair', repairedText: 'the recorded control position should be reviewed by management before reliance', blueprint, writerMetadata: { ...baseCandidate('', { ...emptyNarrativeRecoveryBudget(), targetedRepairCount: 1, totalCalls: 1 }).writerMetadata } }; },
  async coherencePass(input) { return { contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript-coherence', markdown: input.previousMarkdown, blueprint, writerMetadata: { ...baseCandidate('', { ...emptyNarrativeRecoveryBudget(), coherenceCount: 1, totalCalls: 1 }).writerMetadata } }; },
  async completeTail() { throw new Error('not used'); },
  async writeManuscript() { throw new Error('not used'); }
};
const repaired = await recoverWholeManuscript({ writer, context, blueprint, factPack: facts, initialResult: baseCandidate(bad), attemptIdentity: 'case-a', diagnosticsRootDirectory: root, runCoherence: false });
assert.equal(repairCalls, 1);
assert.equal(repaired.validation.ok, true);
assert.equal(repaired.recovery.targetedRepairCount, 1);
assert.equal(repaired.recovery.fullRegenerationCount, 0);
assert.equal(repaired.recovery.coherenceCount, 0);
assert.equal(repaired.parsed.chapters[0].sections[0].title, 'What management should take away');

let strictRepairCalls = 0;
const strictWriter = { ...writer, async repairBlock() { strictRepairCalls += 1; return writer.repairBlock(); } };
const strictRepaired = await recoverWholeManuscript({ writer: strictWriter, context, blueprint, factPack: facts, initialResult: baseCandidate(bad), attemptIdentity: 'case-strict-repairable', diagnosticsRootDirectory: root, runCoherence: false, strictHardTruth: true });
assert.equal(strictRepairCalls, 1);
assert.equal(strictRepaired.validation.ok, true);
assert.equal(classifyNarrativeIssue('em_dash').repairEligible, true);
assert.equal(classifyNarrativeIssue('customer_copy_leakage').repairEligible, true);
assert.match(repaired.markdown, /reviewed by management/);
assert.equal((repaired.markdown.match(/^#{1,3} .+$/gm) ?? []).length, 38);
assert.equal((await fs.readdir(path.join(root, 'failed-attempts', 'case-a-01'))).includes('customer-manuscript.md'), true);

let failingRepairCalls = 0;
const failingWriter = { ...writer, async repairBlock() { failingRepairCalls += 1; return { contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript-targeted-repair', repairedText: 'the controls were independently verified again', blueprint, writerMetadata: { ...baseCandidate('', { ...emptyNarrativeRecoveryBudget(), targetedRepairCount: 1, totalCalls: 1 }).writerMetadata } }; } };
let fullRegenerations = 0;
await assert.rejects(() => recoverWholeManuscript({ writer: failingWriter, context, blueprint, factPack: facts, initialResult: baseCandidate(bad), attemptIdentity: 'case-c', diagnosticsRootDirectory: root, regenerate: async () => { fullRegenerations += 1; return baseCandidate(bad, { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }); } }), (error) => error?.code === 'human_review_required' && error?.details?.recovery?.targetedRepairCount === 4 && error?.details?.recovery?.fullRegenerationCount === 1);
assert.equal(failingRepairCalls, 4);
assert.equal(fullRegenerations, 1);

const structural = `${skeleton.replace('## What management should take away', '')}`;
await assert.rejects(() => recoverWholeManuscript({ writer, context, blueprint, factPack: facts, initialResult: baseCandidate(structural), attemptIdentity: 'case-e', diagnosticsRootDirectory: root }), (error) => error?.code === 'human_review_required');

const beforeUnaffected = bad.split('## What management should take away')[0];
assert.equal(repaired.markdown.split('## What management should take away')[0], beforeUnaffected);
assert.equal(classifyAssuranceLanguage('the recorded control position should be reviewed by management before reliance'), null);

console.log(JSON.stringify({ status: 'PASS', checks: ['release-blocking assurance claim routed to targeted repair', 'strict Comprehensive mode permits only explicitly repairable customer-copy defects', 'em dash and customer-copy leakage are repairable without weakening truth validation', 'safe wording passes hard truth and assurance', 'retry increments per failed repair and stops at four', 'full regeneration remains available only after repairs', 'non-repairable structural failure fails closed', 'rejected candidate persisted before repair handling', 'unaffected prose preserved'], aiCalls: 0, repairCalls: repairCalls + failingRepairCalls + strictRepairCalls }));

#!/usr/bin/env node
/**
 * Combined real-shape regression for the Comprehensive whole-manuscript recovery router.
 *
 * This replays the Production manuscript shape that failed closed with human_review_required
 * before its first targeted repair: one paragraph carrying three unsupported numeric claims,
 * three separate paragraphs carrying assurance claims, and the repeated
 * "Monitoring, escalation and detection coverage" heading condition in the same manuscript.
 *
 * Recovery must treat recoverability as a property of one validation issue against one
 * deterministic Blueprint target. Six validator findings collapse to exactly four repair
 * targets. The validators themselves are unchanged: unsupported numeric claims and assurance
 * claims stay release-blocking until a bounded replacement passes the same validator.
 *
 * The test is provider-free and cannot reach a provider, a database or the filesystem outside
 * a temporary diagnostics directory.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { recoverWholeManuscript, replaceWholeManuscriptRepairTarget } from '../../src/lib/reports/narrative/whole-manuscript-recovery.ts';
import { MAX_TARGETED_REPAIRS, emptyNarrativeRecoveryBudget } from '../../src/lib/reports/narrative/recovery-policy.ts';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';

const REPEATED_HEADING = 'Monitoring, escalation and detection coverage';

let providerCalls = 0;

const fact = (id, value) => ({ id, kind: 'finding', value });
const facts = {
  facts: [
    fact('FACT-001', 'The recorded monitoring position is initial.'),
    fact('FACT-002', 'The recorded escalation ownership is assigned.')
  ],
  productTier: 'comprehensive',
  bibleVersion: '1.1',
  organisation: { name: 'Test Organisation', sectorFacts: [] },
  assessment: { reference: 'TEST-ASSESSMENT', score: 42, maturity: 'Developing', exposureBand: 'Moderate', uncertaintyFacts: [] },
  systemicThemeInputs: [], findings: [], scenarios: [], controls: [], decisions: [], roadmap: [],
  maturationSteps: [], sustainmentPriorities: [], relativeStrengths: [], narrativeMode: 'ADVISORY', proofOfProgress: []
};

const section = (chapterId, sectionId, title) => ({
  chapterId, sectionId, order: 1, title,
  purpose: 'Explain the bounded position.',
  requiredManagementTakeaway: 'Management should preserve the recorded meaning.',
  requiredFacts: ['FACT-001'], claimRefs: ['FACT-001', 'FACT-002'],
  narrativeRole: 'EVIDENCE', optionalSubsections: []
});

const chapter = (chapterId, order, title, sections) => ({
  chapterId, order, title,
  purpose: 'Explain the position.',
  requiredManagementTakeaway: 'Management should preserve the recorded meaning.',
  requiredFacts: ['FACT-001'], claimRefs: ['FACT-001'],
  linkedFindingIds: [], linkedScenarioIds: [], linkedControlIds: [], linkedDecisionIds: [], linkedRoadmapIds: [],
  narrativeRole: 'JUDGEMENT', exhibits: [], sections
});

const blueprint = {
  schemaVersion: 'test-blueprint', bibleVersion: '1.1', reportTitle: 'Test', reportTier: 'comprehensive',
  narrativeMode: 'ADVISORY', organisation: { name: 'Test Organisation', sectorFacts: [] },
  assessmentPosition: {
    reference: 'TEST-ASSESSMENT', score: 42, maturity: 'Developing', exposureScore: 10, exposureBand: 'Moderate',
    summary: 'Recorded position.',
    assuranceBoundary: 'The assessment does not independently verify operating effectiveness.'
  },
  executiveStory: 'A bounded story.',
  chapters: [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', [section('EXECUTIVE-ASSESSMENT', 'EXECUTIVE-ASSESSMENT-POSITION', 'Recorded assessment position')]),
    chapter('SYSTEMIC-FRAUD-READINESS-DIAGNOSIS', 2, 'Systemic fraud-readiness diagnosis', [section('SYSTEMIC-FRAUD-READINESS-DIAGNOSIS', 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS-THEME-03', REPEATED_HEADING)]),
    chapter('MATERIAL-FRAUD-RISK-THEMES', 3, 'Material fraud-risk themes', [section('MATERIAL-FRAUD-RISK-THEMES', 'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03', REPEATED_HEADING)]),
    chapter('CONTROL-ENVIRONMENT', 4, 'Control environment', [section('CONTROL-ENVIRONMENT', 'CONTROL-03-01', REPEATED_HEADING)])
  ],
  findingClusters: [], contentAssignments: [], narrativeCrossReferences: [],
  narrativeRoleUsage: { factUsage: {}, findingUsage: {}, scenarioUsage: {}, controlUsage: {}, ledger: [] },
  transformationSequence: [], deterministicRules: [], prohibitedClaims: ['Do not claim independent verification.']
};

const context = {
  boundaries: { assurance: 'The assessment does not independently verify operating effectiveness, evidence or every in-scope control.' },
  outputBudget: { hardOutputTokenLimit: 4200 },
  permittedDeterministicFacts: facts.facts
};

// ---------------------------------------------------------------------------
// The Production manuscript shape.
// ---------------------------------------------------------------------------
const EXEC_P0 = 'The recorded assessment position frames how management should read the sections that follow.';
const EXEC_P1_BAD = 'Recorded coverage across the monitoring estate sits at 76.15, with escalation recorded at 88.11 and detection recorded at 64.67 on the same basis.';
const EXEC_P2 = 'The recorded position should guide the sequence in which management addresses the themes below.';
const SYSTEMIC_P0 = 'The earlier systemic theme records the management context for monitoring coverage.';
const MATERIAL_P0_BAD = 'The monitoring theme was confirmed through independent review of the escalation records.';
const MATERIAL_P1_BAD = 'The cluster position reflects independent review of detection coverage across the estate.';
const MATERIAL_P2 = 'The following material-risk paragraph remains linked to the recorded management response.';
const CONTROL_P0 = 'The preceding control paragraph remains linked to the recorded control position.';
const CONTROL_P1_BAD = 'Control ownership was established by independent review of the recorded evidence.';

const productionMarkdown = [
  '# Executive assessment',
  '## Recorded assessment position',
  EXEC_P0,
  EXEC_P1_BAD,
  EXEC_P2,
  '# Systemic fraud-readiness diagnosis',
  `## ${REPEATED_HEADING}`,
  SYSTEMIC_P0,
  '# Material fraud-risk themes',
  `## ${REPEATED_HEADING}`,
  MATERIAL_P0_BAD,
  MATERIAL_P1_BAD,
  MATERIAL_P2,
  '# Control environment',
  `## ${REPEATED_HEADING}`,
  CONTROL_P0,
  CONTROL_P1_BAD
].join('\n\n');

const REPAIRS = {
  'EXECUTIVE-ASSESSMENT-POSITION.paragraphs[1]': 'Recorded coverage across the monitoring estate remains initial, and escalation ownership is assigned without a recorded measure of detection performance.',
  'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[0]': 'Management should confirm that monitoring exceptions are escalated and evidenced within the recorded process.',
  'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[1]': 'Management should retain evidence that detection coverage is examined by the accountable owner.',
  'CONTROL-03-01.paragraphs[1]': 'Management should record how escalation outcomes are tracked to closure by the control owner.'
};

// ---------------------------------------------------------------------------
// Initial validation: all six findings must be visible, across four target blocks.
// ---------------------------------------------------------------------------
const initialParsed = parseBlueprintMarkdown(productionMarkdown, blueprint);
assert.equal(initialParsed.ok, true, JSON.stringify(initialParsed.errors));
const initialValidation = validateBlueprintTextManuscript(initialParsed, blueprint, facts);
const initialFindings = initialValidation.hardTruth.issues.map((issue) => `${issue.path}::${issue.code}`);
assert.deepEqual(initialFindings, [
  'EXECUTIVE-ASSESSMENT-POSITION.paragraphs[1]::unsupported_numeric_claim',
  'EXECUTIVE-ASSESSMENT-POSITION.paragraphs[1]::unsupported_numeric_claim',
  'EXECUTIVE-ASSESSMENT-POSITION.paragraphs[1]::unsupported_numeric_claim',
  'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[0]::assurance_claim',
  'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[1]::assurance_claim',
  'CONTROL-03-01.paragraphs[1]::assurance_claim'
], JSON.stringify(initialFindings, null, 2));
assert.equal(initialValidation.hardTruth.issues.length, 6);
assert.deepEqual(
  initialValidation.hardTruth.issues.filter((issue) => issue.code === 'unsupported_numeric_claim').map((issue) => issue.message.match(/claim (\S+) is/)[1]),
  ['76.15', '88.11', '64.67']
);
assert.equal(new Set(initialValidation.hardTruth.issues.map((issue) => issue.path)).size, 4, 'six findings collapse to four repair targets');
assert.equal(initialValidation.quality.status, 'PASS');
assert.equal((productionMarkdown.match(new RegExp(`^## ${REPEATED_HEADING}$`, 'gm')) ?? []).length, 3, 'repeated heading condition present');
for (const bad of [MATERIAL_P0_BAD, MATERIAL_P1_BAD, CONTROL_P1_BAD]) {
  assert.equal(classifyAssuranceLanguage(bad)?.matched.toLowerCase(), 'independent review');
}

// ---------------------------------------------------------------------------
// Provider-free writer double. Records every repair and the validation seen before it.
// ---------------------------------------------------------------------------
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-mixed-recovery-'));
const baseWriterMetadata = (recovery) => ({
  contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript',
  provider: 'test-double', model: 'test-double', promptVersion: 'test', generationMode: 'ai',
  generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'fact', inputStoryPlanSha256: 'plan', recovery
});
const candidateFor = (markdown) => ({
  contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript',
  markdown, blueprint,
  writerMetadata: baseWriterMetadata({ ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 })
});
const repairMetadata = () => baseWriterMetadata({ ...emptyNarrativeRecoveryBudget(), targetedRepairCount: 1, totalCalls: 1 });

function makeWriter(options = {}) {
  const calls = [];
  return {
    calls,
    writer: {
      model: 'test-double', provider: 'test-double', promptVersion: 'test',
      async repairBlock(input) {
        providerCalls += 0; // the double never reaches a provider
        calls.push({ path: input.failingPath, code: input.validationCode, scope: input.scope, sectionId: input.sectionId, targetText: input.targetText, matchedPhrase: input.matchedPhrase });
        const repairedText = options.repairedTextFor ? options.repairedTextFor(input) : REPAIRS[input.failingPath];
        assert.ok(repairedText, `unexpected repair target ${input.failingPath}`);
        return {
          contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
          architecture: 'whole-manuscript-targeted-repair',
          repairedText, blueprint, writerMetadata: repairMetadata()
        };
      },
      async coherencePass() { throw new Error('coherence pass must not run in this regression'); },
      async completeTail() { throw new Error('tail completion must not run in this regression'); },
      async writeManuscript() { throw new Error('whole-manuscript generation must not run in this regression'); }
    }
  };
}

// ---------------------------------------------------------------------------
// PRIMARY: the mixed Production shape recovers in exactly four targeted repairs.
// ---------------------------------------------------------------------------
let fullRegenerations = 0;
const primary = makeWriter();
const recovered = await recoverWholeManuscript({
  writer: primary.writer, context, blueprint, factPack: facts,
  initialResult: candidateFor(productionMarkdown),
  attemptIdentity: 'production-mixed-numeric-and-assurance',
  diagnosticsRootDirectory: root,
  runCoherence: false,
  strictHardTruth: true,
  regenerate: async () => { fullRegenerations += 1; return candidateFor(productionMarkdown); }
});

// 1. Exactly four targeted paragraph repairs, not six.
assert.equal(primary.calls.length, 4, `expected four targeted repairs, received ${primary.calls.length}`);
assert.equal(recovered.recovery.targetedRepairCount, 4);
assert.equal(MAX_TARGETED_REPAIRS, 4, 'repair budget must not be increased');

// The exact four-repair sequence, in deterministic Blueprint order.
assert.deepEqual(primary.calls.map((call) => `${call.path}::${call.code}`), [
  'EXECUTIVE-ASSESSMENT-POSITION.paragraphs[1]::unsupported_numeric_claim',
  'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[0]::assurance_claim',
  'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[1]::assurance_claim',
  'CONTROL-03-01.paragraphs[1]::assurance_claim'
]);
assert.deepEqual(primary.calls.map((call) => call.scope), ['block', 'block+adjacent', 'subsection', 'bounded section']);

// 2. The numeric paragraph is repaired once and all three numeric violations clear together.
assert.equal(primary.calls.filter((call) => call.code === 'unsupported_numeric_claim').length, 1);
assert.equal(primary.calls[0].targetText, EXEC_P1_BAD);
for (const value of ['76.15', '88.11', '64.67']) assert.equal(recovered.markdown.includes(value), false, `${value} must not survive`);
assert.equal(recovered.validation.hardTruth.issues.filter((issue) => issue.code === 'unsupported_numeric_claim').length, 0);

// 3. Each assurance paragraph is repaired independently against its own deterministic target.
const assuranceCalls = primary.calls.filter((call) => call.code === 'assurance_claim');
assert.equal(assuranceCalls.length, 3);
assert.deepEqual(assuranceCalls.map((call) => call.targetText), [MATERIAL_P0_BAD, MATERIAL_P1_BAD, CONTROL_P1_BAD]);
assert.deepEqual(assuranceCalls.map((call) => call.matchedPhrase.toLowerCase()), ['independent review', 'independent review', 'independent review']);
assert.deepEqual(assuranceCalls.map((call) => call.sectionId), ['MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03', 'MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03', 'CONTROL-03-01']);

// 4. Whole-manuscript validation runs after each repair: the remaining findings shrink
//    monotonically and each repair is chosen from a freshly revalidated manuscript.
assert.deepEqual(recovered.repairRecords.map((record) => record.attempt), [1, 2, 3, 4]);
assert.deepEqual(recovered.repairRecords.map((record) => record.path), primary.calls.map((call) => call.path));
assert.equal(recovered.rejectedCandidateDirectories.length, 4, 'one revalidated candidate persisted before each repair');
const remainingPerRound = [];
for (const directory of recovered.rejectedCandidateDirectories) {
  const report = JSON.parse(await fs.readFile(path.join(directory, 'validation-report.json'), 'utf8'));
  remainingPerRound.push(report.hardTruth.issues.length);
}
assert.deepEqual(remainingPerRound, [6, 3, 2, 1], 'whole-manuscript revalidation after every targeted repair');

// 5. The final manuscript passes the unchanged validation.
const finalParsed = parseBlueprintMarkdown(recovered.markdown, blueprint);
const finalValidation = validateBlueprintTextManuscript(finalParsed, blueprint, facts);
assert.equal(finalParsed.ok, true);
assert.equal(finalValidation.ok, true, JSON.stringify(finalValidation.hardTruth.issues));
assert.equal(finalValidation.hardTruth.issues.length, 0);
assert.equal(finalValidation.quality.status, 'PASS');
assert.equal(recovered.validation.ok, true);

// 6. No full regeneration, quality escalation or coherence pass occurred.
assert.equal(fullRegenerations, 0);
assert.equal(recovered.recovery.fullRegenerationCount, 0);
assert.equal(recovered.recovery.qualityEscalationCount, 0);
assert.equal(recovered.recovery.coherenceCount, 0);
assert.equal(recovered.coherenceUsed, false);

// 7. Neighbouring prose remains byte-identical: exactly the four target blocks changed.
const expectedMarkdown = productionMarkdown
  .replace(EXEC_P1_BAD, REPAIRS['EXECUTIVE-ASSESSMENT-POSITION.paragraphs[1]'])
  .replace(MATERIAL_P0_BAD, REPAIRS['MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[0]'])
  .replace(MATERIAL_P1_BAD, REPAIRS['MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[1]'])
  .replace(CONTROL_P1_BAD, REPAIRS['CONTROL-03-01.paragraphs[1]']);
assert.equal(recovered.markdown, expectedMarkdown, 'only the four repair targets may change');
for (const untouched of [EXEC_P0, EXEC_P2, SYSTEMIC_P0, MATERIAL_P2, CONTROL_P0]) {
  assert.equal(recovered.markdown.includes(untouched), true, `neighbouring prose changed: ${untouched}`);
}

// 8. Every heading remains byte-identical.
assert.deepEqual(recovered.markdown.match(/^#{1,3} .+$/gm), productionMarkdown.match(/^#{1,3} .+$/gm));

// 9. Duplicate-heading structural targeting still selects the correct section. The systemic
//    theme carries the same H2 and must remain untouched, and the two later repeats resolve
//    to their own Blueprint positions.
assert.equal(recovered.markdown.split('# Material fraud-risk themes')[0].includes(SYSTEMIC_P0), true);
assert.equal(recovered.markdown.split('# Material fraud-risk themes')[0].includes(REPAIRS['MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[0]']), false);
const controlScope = recovered.markdown.split('# Control environment')[1];
assert.equal(controlScope.includes(REPAIRS['CONTROL-03-01.paragraphs[1]']), true);
assert.equal(controlScope.includes(REPAIRS['MATERIAL-FRAUD-RISK-THEMES-CLUSTER-03.paragraphs[1]']), false);

// ---------------------------------------------------------------------------
// NEGATIVE 1: a genuinely non-repairable hard-truth issue alongside the mixed repairable
// issues must fail closed immediately, before any targeted repair.
// ---------------------------------------------------------------------------
// An unevidenced organisational structure is a truth-bearing defect with no bounded local
// correction: recovery must not attempt it even though repairable issues sit beside it.
const nonRepairableMarkdown = productionMarkdown.replace(EXEC_P0, 'The Audit Committee reviews the recorded assessment position before management acts on it.');
const nonRepairableValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(nonRepairableMarkdown, blueprint), blueprint, facts);
assert.equal(nonRepairableValidation.hardTruth.issues.some((issue) => issue.code === 'unsupported_structure_claim'), true);
assert.equal(nonRepairableValidation.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim'), true);
assert.equal(nonRepairableValidation.hardTruth.issues.some((issue) => issue.code === 'assurance_claim'), true);
const nonRepairable = makeWriter();
await assert.rejects(
  () => recoverWholeManuscript({
    writer: nonRepairable.writer, context, blueprint, factPack: facts,
    initialResult: candidateFor(nonRepairableMarkdown),
    attemptIdentity: 'negative-non-repairable-hard-truth',
    diagnosticsRootDirectory: root, runCoherence: false, strictHardTruth: true
  }),
  (error) => {
    assert.equal(error?.code, 'human_review_required');
    assert.match(error.message, /cannot be auto-repaired on the Comprehensive path/);
    assert.equal(error.details.recovery.targetedRepairCount, 0);
    assert.equal(error.details.validation.hardTruth.issues.some((issue) => issue.code === 'unsupported_structure_claim'), true);
    return true;
  }
);
assert.equal(nonRepairable.calls.length, 0, 'a non-repairable hard-truth defect must not reach a repair call');

// ---------------------------------------------------------------------------
// NEGATIVE 2: a structural defect gives the issue no deterministic target: fail closed.
// ---------------------------------------------------------------------------
const structural = makeWriter();
const structuralMarkdown = productionMarkdown.replace(`## ${REPEATED_HEADING}\n\n${SYSTEMIC_P0}`, SYSTEMIC_P0);
await assert.rejects(
  () => recoverWholeManuscript({
    writer: structural.writer, context, blueprint, factPack: facts,
    initialResult: candidateFor(structuralMarkdown),
    attemptIdentity: 'negative-missing-deterministic-target',
    diagnosticsRootDirectory: root, runCoherence: false, strictHardTruth: true
  }),
  (error) => error?.code === 'human_review_required' && error.details.recovery.targetedRepairCount === 0
);
assert.equal(structural.calls.length, 0);

// Blueprint-position targeting itself fails closed when the target block is absent.
assert.throws(
  () => replaceWholeManuscriptRepairTarget(productionMarkdown, { title: REPEATED_HEADING, level: 2, headingIndex: 5, targetText: 'Prose that is absent from this structural scope.', repairedText: 'Replacement.' }),
  (error) => error?.code === 'repair_target_ambiguous' && /received 0/.test(error.message)
);
// And when the heading is not at its Blueprint position.
assert.throws(
  () => replaceWholeManuscriptRepairTarget(productionMarkdown, { title: REPEATED_HEADING, level: 2, headingIndex: 0, targetText: MATERIAL_P0_BAD, repairedText: 'Replacement.' }),
  (error) => error?.code === 'repair_target_missing'
);

// ---------------------------------------------------------------------------
// NEGATIVE 3: an ambiguous target inside the correct structural scope fails closed.
// ---------------------------------------------------------------------------
assert.throws(
  () => replaceWholeManuscriptRepairTarget(productionMarkdown.replace(MATERIAL_P1_BAD, `${MATERIAL_P0_BAD}\n\n${MATERIAL_P1_BAD}`), { title: REPEATED_HEADING, level: 2, headingIndex: 5, targetText: MATERIAL_P0_BAD, repairedText: 'Replacement.' }),
  (error) => error?.code === 'repair_target_ambiguous' && /received 2/.test(error.message)
);

// ---------------------------------------------------------------------------
// NEGATIVE 4: more than four repairable target blocks keeps the existing recovery budget.
// ---------------------------------------------------------------------------
const fiveBlockMarkdown = productionMarkdown
  .replace(EXEC_P0, 'The recorded assessment position was supported by independent review of the recorded governance minutes.')
  .replace(MATERIAL_P2, 'The following material-risk paragraph reflects independent review of the recorded escalation ledger.');
const fiveBlockParsed = parseBlueprintMarkdown(fiveBlockMarkdown, blueprint);
const fiveBlockValidation = validateBlueprintTextManuscript(fiveBlockParsed, blueprint, facts);
assert.equal(new Set(fiveBlockValidation.hardTruth.issues.map((issue) => issue.path)).size, 6, 'six distinct repair targets');
let fiveBlockRegenerations = 0;
const overBudget = makeWriter({
  repairedTextFor: (input) => `Management should record the ${input.failingPath.replace(/[^a-z]/gi, ' ').trim().toLowerCase()} response without asserting completed assurance.`
});
await assert.rejects(
  () => recoverWholeManuscript({
    writer: overBudget.writer, context, blueprint, factPack: facts,
    initialResult: candidateFor(fiveBlockMarkdown),
    attemptIdentity: 'negative-over-budget-repair-targets',
    diagnosticsRootDirectory: root, runCoherence: false, strictHardTruth: true,
    regenerate: async () => { fiveBlockRegenerations += 1; return candidateFor(fiveBlockMarkdown); }
  }),
  (error) => {
    assert.equal(error?.code, 'human_review_required');
    assert.equal(error.details.recovery.targetedRepairCount, MAX_TARGETED_REPAIRS);
    assert.equal(error.details.recovery.fullRegenerationCount, 1);
    return true;
  }
);
// The targeted-repair budget is cumulative across the single permitted full regeneration:
// four repairs total, then one regeneration, then fail closed. No extra repair is granted.
assert.equal(overBudget.calls.length, MAX_TARGETED_REPAIRS, 'the targeted-repair budget stays at four across the whole recovery');
assert.equal(fiveBlockRegenerations, 1, 'the full-regeneration maximum is unchanged');

// ---------------------------------------------------------------------------
// NEGATIVE 5: a clean, valid manuscript performs zero repairs.
// ---------------------------------------------------------------------------
const clean = makeWriter();
const cleanRecovered = await recoverWholeManuscript({
  writer: clean.writer, context, blueprint, factPack: facts,
  initialResult: candidateFor(expectedMarkdown),
  attemptIdentity: 'clean-manuscript',
  diagnosticsRootDirectory: root, runCoherence: false, strictHardTruth: true
});
assert.equal(clean.calls.length, 0);
assert.equal(cleanRecovered.recovery.targetedRepairCount, 0);
assert.equal(cleanRecovered.recovery.fullRegenerationCount, 0);
assert.equal(cleanRecovered.markdown, expectedMarkdown);
assert.equal(cleanRecovered.rejectedCandidateDirectories.length, 0);

// 10. No provider was reached anywhere in this regression.
assert.equal(providerCalls, 0);

await fs.rm(root, { recursive: true, force: true });

console.log(JSON.stringify({
  status: 'PASS',
  aiCalls: 0,
  providerCalls,
  repairSequence: primary.calls.map((call) => ({ path: call.path, code: call.code, scope: call.scope })),
  remainingHardIssuesPerRound: remainingPerRound,
  checks: [
    'six mixed validator findings collapse to exactly four deterministic repair targets',
    'the numeric paragraph is repaired once and all three unsupported numbers clear together',
    'each assurance paragraph is repaired independently against its own target',
    'whole-manuscript validation runs after every targeted repair',
    'the final manuscript passes the unchanged validation',
    'no full regeneration, quality escalation or coherence pass occurs when four repairs succeed',
    'neighbouring prose and every heading remain byte-identical',
    'duplicate Monitoring heading targeting still selects the correct Blueprint section',
    'a genuinely non-repairable hard-truth defect still fails closed before any repair',
    'a missing or ambiguous deterministic target fails closed',
    'more than four repairable target blocks keeps the existing recovery budget',
    'a clean valid manuscript performs zero repairs'
  ]
}));

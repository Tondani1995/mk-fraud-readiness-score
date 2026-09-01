#!/usr/bin/env node
/**
 * Provider-free behavioural proof for the Comprehensive whole-manuscript policy.
 *
 * The fake writer never calls a model. It exercises the same recovery coordinator
 * with deterministic candidates so the release gate proves routing and ceilings,
 * not provider availability.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { recoverWholeManuscript, WholeManuscriptRecoveryError } from '../../src/lib/reports/narrative/whole-manuscript-recovery.ts';
import {
  assertComprehensiveRecoveryBudget,
  ComprehensiveProviderCallLedger,
  emptyComprehensiveRecoveryBudget
} from '../../src/lib/reports/comprehensive/recovery-policy.ts';

const blueprint = {
  schemaVersion: 'mk-comprehensive-test-blueprint-v1',
  bibleVersion: '1.1',
  reportTitle: 'Comprehensive provider-free recovery fixture',
  reportTier: 'comprehensive',
  narrativeMode: 'ADVISORY',
  organisation: { name: 'Comprehensive Test Organisation', sectorFacts: [] },
  assessmentPosition: {
    reference: 'MKFRS-RECOVERY-FIXTURE',
    score: 48,
    maturity: 'Developing',
    exposureScore: 52,
    exposureBand: 'Moderate',
    summary: 'Recorded position.',
    assuranceBoundary: 'The assessment does not independently verify operating effectiveness.'
  },
  executiveStory: 'A bounded management story.',
  chapters: [{
    chapterId: 'CH-01',
    order: 1,
    title: 'Executive assessment',
    purpose: 'Explain the recorded position.',
    requiredManagementTakeaway: 'Management should preserve the recorded meaning.',
    requiredFacts: ['FACT-001'],
    claimRefs: ['FACT-001'],
    linkedFindingIds: [],
    linkedScenarioIds: [],
    linkedControlIds: [],
    linkedDecisionIds: [],
    linkedRoadmapIds: [],
    narrativeRole: 'JUDGEMENT',
    exhibits: [],
    sections: [
      {
        chapterId: 'CH-01',
        sectionId: 'EXECUTIVE-ASSESSMENT-TAKEAWAY',
        order: 1,
        title: 'What management should take away',
        purpose: 'Set the implication.',
        requiredManagementTakeaway: 'Management should preserve the recorded meaning.',
        requiredFacts: ['FACT-001'],
        claimRefs: ['FACT-001'],
        narrativeRole: 'JUDGEMENT',
        optionalSubsections: []
      },
      {
        chapterId: 'CH-01',
        sectionId: 'EXECUTIVE-ASSESSMENT-ROUTE',
        order: 2,
        title: 'Route forward',
        purpose: 'Explain the bounded response.',
        requiredManagementTakeaway: 'Management should retain a clear owned response.',
        requiredFacts: ['FACT-001'],
        claimRefs: ['FACT-001'],
        narrativeRole: 'JUDGEMENT',
        optionalSubsections: []
      },
      {
        chapterId: 'CH-01',
        sectionId: 'EXECUTIVE-ASSESSMENT-GUARDRAIL',
        order: 3,
        title: 'Assurance boundary',
        purpose: 'State the boundary.',
        requiredManagementTakeaway: 'Management should interpret the assessment within its stated boundary.',
        requiredFacts: ['FACT-001'],
        claimRefs: ['FACT-001'],
        narrativeRole: 'BOUNDARY',
        optionalSubsections: []
      }
    ]
  }],
  findingClusters: [],
  contentAssignments: [],
  narrativeCrossReferences: [],
  narrativeRoleUsage: { factUsage: {}, findingUsage: {}, scenarioUsage: {}, controlUsage: {}, ledger: [] },
  transformationSequence: [],
  deterministicRules: [],
  prohibitedClaims: ['Do not claim independent verification.']
};

const factPack = {
  facts: [{ id: 'FACT-001', kind: 'finding', value: 'The recorded control position is bounded.' }],
  productTier: 'comprehensive',
  bibleVersion: '1.1',
  organisation: { name: 'Comprehensive Test Organisation', sectorFacts: [] },
  assessment: { reference: 'MKFRS-RECOVERY-FIXTURE', score: 48, maturity: 'Developing', exposureBand: 'Moderate', uncertaintyFacts: [] },
  systemicThemeInputs: [],
  findings: [],
  risks: [],
  scenarios: [],
  controls: [],
  decisions: [],
  roadmap: [],
  maturationSteps: [],
  sustainmentPriorities: [],
  relativeStrengths: [],
  narrativeMode: 'ADVISORY',
  proofOfProgress: []
};

const context = {
  boundaries: { assurance: 'The assessment does not independently verify operating effectiveness, evidence or every in-scope control.' },
  outputBudget: { hardOutputTokenLimit: 4200 },
  permittedDeterministicFacts: factPack.facts
};

function fixtureMarkdown({ duplicate = false, unsafe = false } = {}) {
  const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
  const paragraphs = [
    'The recorded management position is bounded and should guide a clear owned response.',
    duplicate ? 'The recorded management position is bounded and should guide a clear owned response.' : 'The route forward keeps ownership and measurement visible to management.',
    'The assessment boundary remains explicit and the recorded meaning should not be extended beyond the supplied facts.'
  ];
  if (unsafe) paragraphs[0] = 'The controls were independently verified and confirmed.';
  let sectionIndex = 0;
  return `${skeleton.headings.map((heading) => {
    const headingText = `#${'#'.repeat(heading.level - 1)} ${heading.title}`;
    if (heading.kind === 'chapter') return headingText;
    return `${headingText}\n\n${paragraphs[sectionIndex++]}`;
  }).join('\n\n')}\n`;
}

const zeroRecovery = () => ({ ...emptyComprehensiveRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 });
const candidate = (markdown, recovery = zeroRecovery()) => ({
  contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
  architecture: 'whole-manuscript',
  markdown,
  blueprint,
  writerMetadata: {
    contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
    architecture: 'whole-manuscript',
    provider: 'provider-free-fixture',
    model: 'openai/gpt-5.6-luna',
    promptVersion: 'provider-free-recovery-fixture',
    generationMode: 'test-injected',
    generatedAt: new Date(0).toISOString(),
    inputFactPackSha256: 'fact-pack-fixture',
    inputStoryPlanSha256: 'story-plan-fixture',
    recovery
  }
});

const safeRepair = 'The recorded control position should be reviewed by management before reliance.';
const repairMetadata = () => ({ ...emptyComprehensiveRecoveryBudget(), targetedRepairCount: 1, totalCalls: 1 });
const coherenceMetadata = () => ({ ...emptyComprehensiveRecoveryBudget(), coherenceCount: 1, totalCalls: 1 });
const qualityMetadata = () => zeroRecovery();

function writerWith({ repairText = safeRepair, coherenceMarkdown = fixtureMarkdown(), repairMetadataFactory = repairMetadata } = {}) {
  return {
    model: 'openai/gpt-5.6-luna',
    provider: 'provider-free-fixture',
    promptVersion: 'provider-free-recovery-fixture',
    async repairBlock() {
      return {
        contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
        architecture: 'whole-manuscript-targeted-repair',
        repairedText: repairText,
        blueprint,
        writerMetadata: { ...candidate('', repairMetadataFactory()).writerMetadata }
      };
    },
    async coherencePass(input) {
      return {
        contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
        architecture: 'whole-manuscript-coherence',
        markdown: coherenceMarkdown ?? input.previousMarkdown,
        blueprint,
        writerMetadata: { ...candidate('', coherenceMetadata()).writerMetadata }
      };
    },
    async completeTail() { throw new Error('not used'); },
    async writeManuscript() { throw new Error('not used'); }
  };
}

const diagnosticsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-comprehensive-recovery-behaviour-'));
const validation = validateBlueprintTextManuscript(parseBlueprintMarkdown(fixtureMarkdown(), blueprint), blueprint, factPack);
assert.equal(validation.ok, true, 'provider-free safe fixture must pass hard-truth validation');

const clean = await recoverWholeManuscript({
  writer: writerWith(), context, blueprint, factPack,
  initialResult: candidate(fixtureMarkdown()),
  attemptIdentity: 'clean', diagnosticsRootDirectory: diagnosticsRoot
});
assert.equal(clean.recovery.targetedRepairCount, 0);
assert.equal(clean.recovery.fullRegenerationCount, 0);
assert.equal(clean.recovery.qualityEscalationCount, 0);

const repaired = await recoverWholeManuscript({
  writer: writerWith(), context, blueprint, factPack,
  initialResult: candidate(fixtureMarkdown({ unsafe: true })),
  attemptIdentity: 'repair', diagnosticsRootDirectory: diagnosticsRoot,
  strictHardTruth: false
});
assert.equal(repaired.recovery.targetedRepairCount, 1);
assert.equal(repaired.validation.ok, true);
assert.match(repaired.markdown, /reviewed by management/);

await assert.rejects(
  () => recoverWholeManuscript({
    writer: writerWith(), context, blueprint, factPack,
    initialResult: candidate(fixtureMarkdown({ unsafe: true })),
    attemptIdentity: 'hard-truth', diagnosticsRootDirectory: diagnosticsRoot,
    strictHardTruth: true
  }),
  (error) => error instanceof WholeManuscriptRecoveryError
    && error.code === 'human_review_required'
    && error.details.recovery.targetedRepairCount === 0
);

let repairCeilingCalls = 0;
let fullRegenerationCalls = 0;
await assert.rejects(
  () => recoverWholeManuscript({
    writer: {
      ...writerWith({ repairText: 'The controls were independently verified again.' }),
      async repairBlock() {
        repairCeilingCalls += 1;
        return {
          contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
          architecture: 'whole-manuscript-targeted-repair',
          repairedText: 'The controls were independently verified again.',
          blueprint,
          writerMetadata: { ...candidate('', repairMetadata()).writerMetadata }
        };
      }
    },
    context, blueprint, factPack,
    initialResult: candidate(fixtureMarkdown({ unsafe: true })),
    attemptIdentity: 'repair-ceiling', diagnosticsRootDirectory: diagnosticsRoot,
    strictHardTruth: false,
    regenerate: async () => {
      fullRegenerationCalls += 1;
      return candidate(fixtureMarkdown({ unsafe: true }));
    }
  }),
  (error) => error instanceof WholeManuscriptRecoveryError
    && error.code === 'human_review_required'
    && error.details.recovery.targetedRepairCount === 4
    && error.details.recovery.fullRegenerationCount === 1
);
assert.equal(repairCeilingCalls, 4);
assert.equal(fullRegenerationCalls, 1);

const qualityEscalated = await recoverWholeManuscript({
  writer: writerWith(), context, blueprint, factPack,
  initialResult: candidate(fixtureMarkdown({ duplicate: true })),
  attemptIdentity: 'quality-escalation', diagnosticsRootDirectory: diagnosticsRoot,
  escalateQuality: async () => candidate(fixtureMarkdown(), qualityMetadata())
});
assert.equal(qualityEscalated.recovery.qualityEscalationCount, 1);
assert.equal(qualityEscalated.validation.quality.status, 'PASS');

let coherenceCalls = 0;
const coherent = await recoverWholeManuscript({
  writer: {
    ...writerWith(),
    async coherencePass(input) {
      coherenceCalls += 1;
      return {
        contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
        architecture: 'whole-manuscript-coherence',
        markdown: input.previousMarkdown,
        blueprint,
        writerMetadata: { ...candidate('', coherenceMetadata()).writerMetadata }
      };
    }
  },
  context, blueprint, factPack,
  initialResult: candidate(fixtureMarkdown()),
  attemptIdentity: 'coherence', diagnosticsRootDirectory: diagnosticsRoot,
  runCoherence: true
});
assert.equal(coherenceCalls, 1);
assert.equal(coherent.coherenceUsed, true);
assert.equal(coherent.recovery.coherenceCount, 1);

const ledger = new ComprehensiveProviderCallLedger();
ledger.claim('initial');
ledger.claim('technical_fallback');
assert.equal(ledger.totalCalls, 2);
for (let index = ledger.totalCalls; index < ledger.maxCalls; index += 1) ledger.claim(`bounded-rung-${index + 1}`);
assert.equal(ledger.totalCalls, 10);
assert.throws(() => ledger.claim('eleventh-call'), /budget_exhausted/);
assert.throws(() => assertComprehensiveRecoveryBudget({ ...emptyComprehensiveRecoveryBudget(), technicalFallbackCount: 2, totalCalls: 2 }), /technical-fallback/);
assert.throws(() => assertComprehensiveRecoveryBudget({ ...emptyComprehensiveRecoveryBudget(), totalCalls: 11 }), /total provider-call/);

console.log(JSON.stringify({
  status: 'PASS',
  gate: 'comprehensive-recovery-behaviour',
  providerCalls: 0,
  checks: {
    clean: true,
    boundedSemanticRepair: repaired.recovery.targetedRepairCount,
    hardTruthFailsClosed: true,
    repairCeiling: repairCeilingCalls,
    regenerationCeiling: fullRegenerationCalls,
    qualityEscalation: qualityEscalated.recovery.qualityEscalationCount,
    coherence: coherent.recovery.coherenceCount,
    technicalFallbackLedgerCalls: 2,
    totalCallCeiling: ledger.maxCalls,
    failClosedAccounting: true
  }
}, null, 2));

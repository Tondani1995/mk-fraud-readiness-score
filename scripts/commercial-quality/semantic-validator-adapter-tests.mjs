#!/usr/bin/env node
/**
 * Validator-to-semantic-cascade adapter integration tests.
 *
 * These tests deliberately retain the legacy validator's assurance_claim bucket and prove that
 * the Essential and Snapshot adapters apply the newer proposition/context disposition before the
 * shared cascade decides whether AI adjudication is allowed. No provider, database or file output
 * is used by this harness.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { adaptEssentialEvidenceModel } from '../../src/lib/reports/essential-presentation-adaptation.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { composeEssentialManuscript } from '../../src/lib/reports/narrative/essential-manuscript-coordinator.ts';
import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import {
  buildCachedSnapshotNarrative,
  buildDeterministicSnapshotNarrative,
  buildSnapshotNarrativeInput,
  validateSnapshotNarrative
} from '../../src/lib/snapshot/narrative.ts';
import { buildCommercialSnapshotInsights } from '../../src/lib/snapshot/commercial-insights.ts';
import { buildDeterministicSnapshotPrioritySignals } from '../../src/lib/snapshot/deterministic-narrative.ts';

const ROOT = process.cwd();
const DATA = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'src/lib/reports/__fixtures__/bounded-essential-f1-all-zero.json'),
  'utf8'
));

function buildFactPack() {
  const evidence = buildAdvisoryEvidenceModel(DATA);
  const adapted = adaptEssentialEvidenceModel(evidence, DATA.adaptiveGatewayAnswers ?? {});
  const projection = buildEssentialProjection(DATA, adapted);
  const factPack = buildEssentialNarrativeFactPack(DATA, adapted, projection);
  assertNarrativeFactPack(factPack);
  return factPack;
}

function manuscriptMarkdown(blueprint, firstParagraph) {
  const safeParagraph = 'Management should use this recorded position to focus ownership and evidence of progress within the defined response.';
  return buildBlueprintMarkdownSkeleton(blueprint).headings.map((heading, index) => {
    // Chapter headings carry no prose in the parser. The first section heading is index 1.
    const paragraph = index === 1 ? firstParagraph : safeParagraph;
    return `${'#'.repeat(heading.level)} ${heading.title}\n\n${paragraph}`;
  }).join('\n\n');
}

function writerFor(firstParagraph) {
  return {
    provider: 'test-injected',
    model: 'test-injected-model',
    async writeManuscript({ blueprint }) {
      return {
        contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
        architecture: 'whole-manuscript',
        markdown: manuscriptMarkdown(blueprint, firstParagraph),
        blueprint,
        writerMetadata: { model: 'test-injected-model', recovery: { totalCalls: 1 } }
      };
    }
  };
}

function adaptersFor({ adjudicate, repair } = {}) {
  return {
    adjudicate: adjudicate ?? (async () => []),
    repair: repair ?? (async () => [])
  };
}

async function expectEssentialSemanticReject(factPack, firstParagraph) {
  let adjudicationCalls = 0;
  let repairCalls = 0;
  await assert.rejects(
    () => composeEssentialManuscript({
      factPack,
      writer: writerFor(firstParagraph),
      semanticAdapters: adaptersFor({
        adjudicate: async () => { adjudicationCalls += 1; return []; },
        repair: async () => { repairCalls += 1; return []; }
      })
    }),
    (error) => {
      assert.equal(error.name, 'EssentialManuscriptError');
      assert.equal(error.stage, 'semantic_safety');
      assert.equal(error.diagnostics.semanticSafety.adjudicationCalls, 0);
      assert.equal(error.diagnostics.semanticSafety.repairCalls, 0);
      assert.equal(error.diagnostics.semanticSafety.finalResult, 'HARD_REJECT');
      return true;
    }
  );
  assert.equal(adjudicationCalls, 0);
  assert.equal(repairCalls, 0);
}

test('Essential explicit limitation remains byte-preserved and bypasses legacy hard truth', async () => {
  const factPack = buildFactPack();
  const limitation = 'This assessment is based on management responses and does not constitute independent verification of operating effectiveness.';
  const plan = (await import('../../src/lib/reports/narrative/story-plan.ts')).buildNarrativeStoryPlan(factPack);
  const blueprint = (await import('../../src/lib/reports/narrative/report-blueprint.ts')).buildReportBlueprint(factPack, plan);
  const rawMarkdown = manuscriptMarkdown(blueprint, limitation);
  const parsed = parseBlueprintMarkdown(rawMarkdown, blueprint);
  const legacy = validateBlueprintTextManuscript(parsed, blueprint, factPack);
  assert.equal(legacy.hardTruth.issues.some((issue) => issue.code === 'assurance_claim'), true);

  const result = await composeEssentialManuscript({
    factPack,
    writer: writerFor(limitation),
    semanticAdapters: adaptersFor({
      adjudicate: async () => { throw new Error('deterministic limitation must not need adjudication'); },
      repair: async () => { throw new Error('deterministic limitation must not need repair'); }
    })
  });

  assert.equal(result.semanticSafety.adjudicationCalls, 0);
  assert.equal(result.semanticSafety.repairCalls, 0);
  assert.equal(result.semanticSafety.finalResult, 'ACCEPT');
  assert.equal(result.narrative.chapters[0].sections[0].paragraphs[0].text, limitation);
  assert.equal(result.narrative.markdown, rawMarkdown);
});

test('Essential ambiguous assurance reaches one adjudication and one repair after generation', async () => {
  const factPack = buildFactPack();
  const ambiguous = 'Independent verification is important.';
  const repaired = 'The recorded responses indicate a position requiring management attention.';
  let adjudicationCalls = 0;
  let repairCalls = 0;
  const result = await composeEssentialManuscript({
    factPack,
    writer: writerFor(ambiguous),
    semanticAdapters: adaptersFor({
      adjudicate: async (candidates) => {
        adjudicationCalls += 1;
        assert.equal(candidates.length, 1);
        assert.equal(candidates[0].deterministicFeatures.assuranceCategory, 'AMBIGUOUS_ASSURANCE');
        return candidates.map((candidate) => ({
          targetId: candidate.targetId,
          label: 'REPAIRABLE',
          confidence: 0.95,
          reasonCode: 'bounded_assurance_repair',
          evidenceRefs: ['validation:assurance_claim']
        }));
      },
      repair: async (targets) => {
        repairCalls += 1;
        return targets.map((target) => ({ targetId: target.targetId, repairedText: repaired }));
      }
    })
  });

  assert.equal(adjudicationCalls, 1);
  assert.equal(repairCalls, 1);
  assert.equal(result.semanticSafety.generationCalls, 1);
  assert.equal(result.semanticSafety.adjudicationCalls, 1);
  assert.equal(result.semanticSafety.repairCalls, 1);
  assert.equal(result.semanticSafety.totalProviderCalls, 3);
  assert.equal(result.semanticSafety.finalResult, 'ACCEPT');
  assert.doesNotMatch(result.narrative.markdown, /Independent verification is important/);
  assert.equal(validateBlueprintTextManuscript(result.narrative, result.blueprint, factPack).hardTruth.issues.length, 0);
});

test('Essential completed assurance is a direct bounded repair with no adjudication call', async () => {
  const factPack = buildFactPack();
  const repaired = 'The recorded responses indicate a position requiring management attention.';
  let adjudicationCalls = 0;
  let repairCalls = 0;
  const result = await composeEssentialManuscript({
    factPack,
    writer: writerFor('This report provides independent assurance that operating effectiveness is confirmed.'),
    semanticAdapters: adaptersFor({
      adjudicate: async () => { adjudicationCalls += 1; return []; },
      repair: async (targets) => {
        repairCalls += 1;
        assert.deepEqual(targets.map((target) => target.targetId), ['essential:EXECUTIVE-ASSESSMENT-POSITION.paragraphs[0]']);
        return targets.map((target) => ({ targetId: target.targetId, repairedText: repaired }));
      }
    })
  });
  assert.equal(adjudicationCalls, 0);
  assert.equal(repairCalls, 1);
  assert.equal(result.semanticSafety.generationCalls, 1);
  assert.equal(result.semanticSafety.adjudicationCalls, 0);
  assert.equal(result.semanticSafety.repairCalls, 1);
  assert.equal(result.semanticSafety.totalProviderCalls, 2);
  assert.equal(result.semanticSafety.finalResult, 'ACCEPT');
  assert.doesNotMatch(result.narrative.markdown, /independent assurance|operating effectiveness is confirmed/i);
  assert.equal(validateBlueprintTextManuscript(result.narrative, result.blueprint, factPack).hardTruth.issues.length, 0);
});

test('Essential completed assurance without a pre-validation rewrite is also directly repairable', async () => {
  const factPack = buildFactPack();
  const result = await composeEssentialManuscript({
    factPack,
    writer: writerFor('This report provides assurance that operating effectiveness is confirmed.'),
    semanticAdapters: adaptersFor({
      adjudicate: async () => { throw new Error('direct assurance repair must not adjudicate'); },
      repair: async (targets) => targets.map((target) => ({
        targetId: target.targetId,
        repairedText: 'The recorded responses indicate a position requiring management attention.'
      }))
    })
  });
  assert.equal(result.semanticSafety.adjudicationCalls, 0);
  assert.equal(result.semanticSafety.repairCalls, 1);
  assert.equal(result.semanticSafety.totalProviderCalls, 2);
  assert.equal(result.semanticSafety.finalResult, 'ACCEPT');
});

test('Essential assurance mixed with unsupported numeric truth remains hard and cannot be repaired', async () => {
  await expectEssentialSemanticReject(
    buildFactPack(),
    'This report provides independent assurance that operating effectiveness is confirmed for 999999 controls.'
  );
});

test('Essential objective numeric fabrication is deterministic hard rejection with no adapter calls', async () => {
  const factPack = buildFactPack();
  assert.equal(JSON.stringify(factPack).includes('999999'), false);
  await expectEssentialSemanticReject(factPack, 'The recorded position is 999999.');
});

function snapshotFixture() {
  const snapshot = {
    assessmentId: 'adapter-snapshot',
    assessmentReference: 'ADAPTER-SNAPSHOT',
    organisationName: 'Adapter Test Organisation',
    respondentName: null,
    respondentEmail: null,
    scoreRunId: 'adapter-score-run',
    methodologyVersionId: 'methodology-v1-2',
    runNumber: 1,
    overallScore: 42,
    calculatedMaturity: 'Developing',
    finalMaturity: 'Developing',
    exposureScore: 50,
    exposureBand: 'Moderate',
    coveragePct: 100,
    nARatePct: 0,
    criticalGapCount: 1,
    majorGapCount: 2,
    capApplied: false,
    capReason: null,
    scoredAt: null,
    domains: [
      { domainId: 'd1', domainCode: 'D1', domainName: 'Fraud Leadership and Governance', weightPct: 50, rawScore: 30, weightedContribution: 15, coveragePct: 100, criticalGapCount: 1 },
      { domainId: 'd2', domainCode: 'D2', domainName: 'Fraud Risk Identification', weightPct: 50, rawScore: 54, weightedContribution: 27, coveragePct: 100, criticalGapCount: 0 }
    ]
  };
  return { snapshot, insights: buildCommercialSnapshotInsights(snapshot) };
}

function generatedSnapshot(overrides = {}) {
  const { snapshot, insights } = snapshotFixture();
  return {
    ...buildDeterministicSnapshotNarrative({ snapshot, insights }),
    mode: 'ai',
    model: 'openai/gpt-5-mini',
    aiCallCount: 1,
    ...overrides
  };
}

function narrativeContent(value) {
  return {
    headline: value.headline,
    executiveDiagnosis: value.executiveDiagnosis,
    strength: value.strength,
    prioritySignals: value.prioritySignals,
    managementImplication: value.managementImplication
  };
}

function memoryCache() {
  let row = null;
  return {
    get row() { return row; },
    cache: {
      async read() { return row; },
      async write(_key, record) { row = record; }
    }
  };
}

test('Snapshot explicit limitation is allowed while legacy assurance detection remains observable', async () => {
  const { snapshot, insights } = snapshotFixture();
  const limitation = 'The recorded responses indicate a self-assessment position. This assessment is based on management responses and does not constitute independent verification of operating effectiveness.';
  const generated = generatedSnapshot({ executiveDiagnosis: limitation });
  const narrativeInput = buildSnapshotNarrativeInput(snapshot, insights);
  assert.ok(validateSnapshotNarrative(narrativeContent(generated), narrativeInput).includes('assurance_claim'));
  const cacheState = memoryCache();
  const result = await buildCachedSnapshotNarrative({
    snapshot,
    insights,
    cache: cacheState.cache,
    generator: async () => generated,
    adjudicator: async () => { throw new Error('explicit limitation must be deterministically allowed'); },
    repairer: async () => { throw new Error('explicit limitation must not be repaired'); }
  });
  assert.equal(result.mode, 'ai');
  assert.equal(result.aiCallCount, 1);
  assert.equal(result.executiveDiagnosis, limitation);
  assert.equal(result.semanticSafety.adjudicationCalls, 0);
  assert.equal(result.semanticSafety.repairCalls, 0);
  assert.equal(cacheState.row.status, 'available');
});

test('Snapshot ambiguous assurance consumes adjudication and repair exactly once each', async () => {
  const { snapshot, insights } = snapshotFixture();
  const first = generatedSnapshot({
    executiveDiagnosis: 'The recorded responses indicate a position requiring management attention. Independent verification is important.'
  });
  const repaired = 'The recorded responses indicate a position requiring management attention.';
  let adjudicationCalls = 0;
  let repairCalls = 0;
  const cacheState = memoryCache();
  const result = await buildCachedSnapshotNarrative({
    snapshot,
    insights,
    cache: cacheState.cache,
    generator: async () => first,
    adjudicator: async (candidates) => {
      adjudicationCalls += 1;
      assert.ok(candidates.some((candidate) => candidate.deterministicFeatures.assuranceCategory === 'AMBIGUOUS_ASSURANCE'));
      return candidates.map((candidate) => ({ targetId: candidate.targetId, label: 'REPAIRABLE', confidence: 0.95, reasonCode: 'bounded_assurance_repair', evidenceRefs: ['snapshot-validation'] }));
    },
    repairer: async (targets) => {
      repairCalls += 1;
      return targets.map((target) => ({ targetId: target.targetId, repairedText: repaired }));
    }
  });
  assert.equal(adjudicationCalls, 1);
  assert.equal(repairCalls, 1);
  assert.equal(result.mode, 'ai');
  assert.equal(result.aiCallCount, 3);
  assert.equal(result.semanticSafety.generationCalls, 1);
  assert.equal(result.semanticSafety.adjudicationCalls, 1);
  assert.equal(result.semanticSafety.repairCalls, 1);
  assert.equal(result.semanticSafety.totalProviderCalls, 3);
  assert.deepEqual(validateSnapshotNarrative(narrativeContent(result), buildSnapshotNarrativeInput(snapshot, insights)), []);
});

test('Snapshot completed assurance uses one direct repair and remains bounded', async () => {
  const { snapshot, insights } = snapshotFixture();
  let adjudicationCalls = 0;
  let repairCalls = 0;
  const result = await buildCachedSnapshotNarrative({
    snapshot,
    insights,
    cache: { async read() { return null; }, async write() {} },
    generator: async () => generatedSnapshot({ executiveDiagnosis: 'The recorded responses indicate a position requiring management attention. Operating effectiveness was independently verified.' }),
    adjudicator: async () => { adjudicationCalls += 1; return []; },
    repairer: async (targets) => {
      repairCalls += 1;
      assert.deepEqual(targets.map((target) => target.targetId), ['snapshot.executiveDiagnosis']);
      return targets.map((target) => ({
        targetId: target.targetId,
        repairedText: 'The recorded responses indicate a position requiring management attention.'
      }));
    }
  });
  assert.equal(adjudicationCalls, 0);
  assert.equal(repairCalls, 1);
  assert.equal(result.mode, 'ai');
  assert.equal(result.aiCallCount, 2);
  assert.equal(result.semanticSafety.adjudicationCalls, 0);
  assert.equal(result.semanticSafety.repairCalls, 1);
  assert.equal(result.semanticSafety.totalProviderCalls, 2);
  assert.equal(result.semanticSafety.finalResult, 'ACCEPT');
  assert.deepEqual(validateSnapshotNarrative(narrativeContent(result), buildSnapshotNarrativeInput(snapshot, insights)), []);
});

test('Snapshot assurance mixed with unsupported numeric truth remains hard and cannot be repaired', async () => {
  const { snapshot, insights } = snapshotFixture();
  let adjudicationCalls = 0;
  let repairCalls = 0;
  const result = await buildCachedSnapshotNarrative({
    snapshot,
    insights,
    cache: { async read() { return null; }, async write() {} },
    generator: async () => generatedSnapshot({ executiveDiagnosis: 'The recorded responses indicate a position requiring management attention. This report provides independent assurance that operating effectiveness is confirmed for 999999 controls.' }),
    adjudicator: async () => { adjudicationCalls += 1; return []; },
    repairer: async () => { repairCalls += 1; return []; }
  });
  assert.equal(adjudicationCalls, 0);
  assert.equal(repairCalls, 0);
  assert.equal(result.mode, 'deterministic');
  assert.equal(result.aiCallCount, 1);
  assert.equal(result.semanticSafety.finalResult, 'HARD_REJECT');
});

test('Snapshot objective unsupported factual consequence remains hard and cannot be AI-overridden', async () => {
  const { snapshot, insights } = snapshotFixture();
  let adjudicationCalls = 0;
  const result = await buildCachedSnapshotNarrative({
    snapshot,
    insights,
    cache: { async read() { return null; }, async write() {} },
    generator: async () => generatedSnapshot({ executiveDiagnosis: 'The recorded responses indicate a position requiring management attention. The organisation suffered financial losses.' }),
    adjudicator: async () => { adjudicationCalls += 1; return []; }
  });
  assert.equal(adjudicationCalls, 0);
  assert.equal(result.mode, 'deterministic');
  assert.equal(result.semanticSafety.finalResult, 'HARD_REJECT');
});

test('Snapshot cache hit reuses a safely allowed limitation without auth or another provider call', async () => {
  const { snapshot, insights } = snapshotFixture();
  const limitation = 'The recorded responses indicate a self-assessment position. This assessment is based on management responses and does not constitute independent verification of operating effectiveness.';
  const generated = generatedSnapshot({ executiveDiagnosis: limitation });
  const cacheState = memoryCache();
  let generatorCalls = 0;
  const generator = async () => { generatorCalls += 1; return generated; };
  const first = await buildCachedSnapshotNarrative({ snapshot, insights, cache: cacheState.cache, generator });
  const second = await buildCachedSnapshotNarrative({
    snapshot,
    insights,
    cache: cacheState.cache,
    generator: async () => { throw new Error('cache hit must not generate'); }
  });
  assert.equal(first.mode, 'ai');
  assert.equal(second.mode, 'ai');
  assert.equal(second.aiCallCount, 1);
  assert.equal(generatorCalls, 1);
  assert.equal(second.executiveDiagnosis, limitation);
  assert.deepEqual(buildDeterministicSnapshotPrioritySignals(
    buildSnapshotNarrativeInput(snapshot, insights).attentionAreas,
    buildSnapshotNarrativeInput(snapshot, insights).nextStepDirection
  ), second.prioritySignals);
});

console.log(JSON.stringify({
  passed: true,
  checks: [
    'legacy assurance bucket is not automatic Essential hard truth',
    'Essential explicit limitation allow',
    'Essential ambiguous assurance 1+1+1 cascade',
    'Essential completed assurance direct repair',
    'Essential completed assurance without rewrite direct repair',
    'Essential mixed hard truth and assurance hard reject',
    'Essential objective numeric hard reject',
    'Snapshot explicit limitation allow and cache',
    'Snapshot ambiguous assurance 1+1+1 cascade',
    'Snapshot completed assurance direct repair',
    'Snapshot mixed hard truth and assurance hard reject',
    'Snapshot unsupported consequence hard reject'
  ]
}, null, 2));

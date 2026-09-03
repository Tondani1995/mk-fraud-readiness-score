#!/usr/bin/env node
/**
 * Provider-free architecture gate for the current Comprehensive path.
 *
 * This replaces the historical six-slot/reviewer-lane assertion. The current
 * release boundary is Fact Pack -> Story Plan -> Blueprint -> one complete
 * manuscript -> bounded recovery -> provenance -> branded PDF, with detailed
 * registers kept in the companion workbook.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';

const read = (file) => fs.readFile(file, 'utf8');
const [generation, manual, coordinator, renderer, recovery, brand] = await Promise.all([
  read('src/lib/reports/comprehensive/narrative-generation.ts'),
  read('src/lib/reports/comprehensive/manual-generation.ts'),
  read('src/lib/reports/comprehensive/manuscript-coordinator.ts'),
  read('src/lib/reports/comprehensive/render-narrative-html.ts'),
  read('src/lib/reports/comprehensive/recovery-policy.ts'),
  read('src/lib/reports/design/brand-assets.ts')
]);

assert.match(generation, /composeComprehensiveManuscript/);
assert.match(generation, /ComprehensiveProviderCallLedger/);
assert.match(generation, /createV11WholeManuscriptWriter\(COMPREHENSIVE_PRIMARY_MODEL/);
assert.doesNotMatch(generation, /composeEssentialManuscript|generateComprehensiveInterpretation|maxRepairsPerSlot/);
assert.match(manual, /generateComprehensiveNarrativeReport/);
assert.match(coordinator, /buildNarrativeStoryPlan/);
assert.match(coordinator, /buildReportBlueprint/);
assert.match(coordinator, /strictHardTruth:\s*true/);
assert.match(coordinator, /bindBlueprintTextProvenance/);
assert.match(coordinator, /assertComprehensiveRecoveryBudget/);
assert.match(recovery, /COMPREHENSIVE_MAX_TOTAL_PROVIDER_CALLS\s*=\s*10/);
assert.match(recovery, /technicalFallbackCount\s*>\s*1/);
assert.match(recovery, /ComprehensiveProviderCallLedger/);
assert.match(renderer, /renderCoverLogo\(\)/);
assert.match(renderer, /MK_CSS_VARIABLES/);
assert.match(brand, /MK_LOGO_ASPECT_RATIO/);

function analyticalFor(data, evidenceModel) {
  return {
    assembled: data,
    evidenceModel,
    score: {
      overallScore: data.scoreRun.overallScore,
      calculatedMaturity: data.scoreRun.calculatedMaturity,
      finalMaturity: data.scoreRun.finalMaturity,
      exposureScore: data.scoreRun.exposureScore,
      exposureBand: data.scoreRun.exposureBand,
      coveragePct: data.scoreRun.coveragePct,
      nARatePct: data.scoreRun.nARatePct,
      criticalGapCount: data.scoreRun.criticalGapCount,
      majorGapCount: data.scoreRun.majorGapCount,
      capApplied: data.scoreRun.capApplied,
      capReason: data.scoreRun.capReason,
      methodologyVersionId: data.scoreRun.methodologyVersionId
    },
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    generatedAt: data.generatedAt
  };
}

const profileResults = {};
for (const key of ['motheo', 'bokamoso']) {
  const { data } = buildV12ProfileAssembled(key);
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const delivery = buildComprehensiveDeliveryModel(analyticalFor(data, evidenceModel));
  assertComprehensiveBlueprintContract(delivery);
  const factPack = buildComprehensiveNarrativeFactPack(delivery);
  assertNarrativeFactPack(factPack);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  assertReportBlueprint(blueprint, factPack);
  const exhibitIds = blueprint.chapters.flatMap((chapter) => chapter.exhibits.map((exhibit) => exhibit.exhibitId));
  assert.equal(new Set(exhibitIds).size, exhibitIds.length, `${key}: Blueprint exhibit IDs must be unique`);
  assert.equal(factPack.productTier, 'comprehensive');
  profileResults[key] = {
    mode: factPack.narrativeMode,
    score: factPack.assessment.score,
    chapters: blueprint.chapters.length,
    exhibits: exhibitIds.length,
    facts: factPack.facts.length
  };
}

console.log(JSON.stringify({
  status: 'PASS',
  gate: 'comprehensive-current-architecture',
  providerCalls: 0,
  path: ['Fact Pack', 'Story Plan', 'Blueprint', 'whole-manuscript writer', 'bounded recovery', 'provenance', 'branded narrative PDF', 'detailed companion workbook'],
  profileResults,
  ceilings: { targetedRepairs: 4, fullRegenerations: 1, qualityEscalations: 1, coherencePasses: 1, technicalFallbacks: 1, totalProviderCalls: 10 },
  phaseG: 'not run'
}, null, 2));

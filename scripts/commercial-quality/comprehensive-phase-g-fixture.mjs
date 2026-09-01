import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, buildWholeManuscriptContext } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildBlueprintMarkdownSkeleton } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { buildWholeManuscriptGenerationPrompt } from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';

export function buildMotheoDeterministicFixture() {
  const { data } = buildV12ProfileAssembled('motheo');
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const delivery = buildComprehensiveDeliveryModel({
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
  });
  const factPack = buildComprehensiveNarrativeFactPack(delivery);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  const context = buildWholeManuscriptContext(factPack, blueprint);
  const promptInput = { context, factPack, blueprint, semanticSafety: false };
  const generationPrompt = buildWholeManuscriptGenerationPrompt(promptInput);
  return { data, evidenceModel, delivery, factPack, storyPlan, blueprint, context, promptInput, generationPrompt };
}

export function buildBoundedFixtureMarkdown(blueprint, conclusion = 'Management should use the authorised information to keep ownership, review and follow-up visible.') {
  const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
  return `${skeleton.headings.map((heading) => {
    if (heading.kind === 'chapter') return `${'#'.repeat(heading.level)} ${heading.title}`;
    const paragraph = heading.title === 'Management conclusion' ? conclusion : 'Management should use the authorised information to keep ownership, review and follow-up visible.';
    return `${'#'.repeat(heading.level)} ${heading.title}\n\n${paragraph}`;
  }).join('\n\n')}\n`;
}

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

const PREMIUM_FIXTURE_SECTION_COPY = new Map([
  ['EXECUTIVE-ASSESSMENT-POSITION', 'The recorded assessment places the organisation at a strong strategic position. The management task is to preserve that position while keeping the assessment boundary visible.'],
  ['ANALYTICAL-BASIS-SECTION', 'The complete question record supports an even ten-domain profile. Four enterprise loops, supported dependencies and three selective change pathways explain how authority, risk direction, control signals and learning connect.'],
  ['READINESS-SUPPORTING-STANDARDS-SECTION', 'Recorded strengths in governance, risk identification and operations form a positive foundation. Their value depends on keeping ownership, review and useful proof current.'],
  ['SUSTAINMENT-PRIORITIES-SECTION', 'Three named disciplines carry the sustainment route: governance authority, control-effectiveness learning and a current fraud-risk view. Each has its own owner, evidence and early signal.'],
  ['DETERIORATION-WATCHPOINTS-SECTION', 'Three supported change pathways and three conditional resilience tests define when management should re-check the strong position. They are forward-looking tests, not current findings.'],
  ['TARGET-RESILIENT-CONTROL-ENVIRONMENT-SECTION', 'Each priority has a distinct control objective, target state, owner, proof and effectiveness measure linked to the management outcome it protects.'],
  ['LEADERSHIP-DECISIONS-TO-PRESERVE-SECTION', 'The leadership choices are distinct: protect the governance mandate and escalation route, preserve control-effectiveness learning, and refresh the fraud-risk view after material change.'],
  ['SUSTAINMENT-OPTIMISATION-SECTION', 'The existing route moves from PRESERVE through EMBED and MEASURE to OPTIMISE. Each later stage depends on a usable operating cycle and management information.'],
  ['MANAGEMENT-CONCLUSION-SECTION', 'The integrated outcome is durable readiness: preserve authority, keep the risk view current and use learning signals to surface change early.']
]);

export function buildBoundedFixtureMarkdown(blueprint, conclusion = 'The integrated outcome is durable readiness: preserve authority, keep the risk view current and use learning signals to surface change early.') {
  const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
  return `${skeleton.headings.map((heading) => {
    if (heading.kind === 'chapter') return `${'#'.repeat(heading.level)} ${heading.title}`;
    const paragraph = heading.sectionId && PREMIUM_FIXTURE_SECTION_COPY.has(heading.sectionId)
      ? (heading.sectionId === 'MANAGEMENT-CONCLUSION-SECTION' ? conclusion : PREMIUM_FIXTURE_SECTION_COPY.get(heading.sectionId))
      : heading.title === 'Management conclusion' ? conclusion : 'Management should use the authorised information to keep ownership, review and follow-up visible.';
    return `${'#'.repeat(heading.level)} ${heading.title}\n\n${paragraph}`;
  }).join('\n\n')}\n`;
}

import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildComprehensiveDeliveryModel } from './contract';
import { buildComprehensiveNarrativeFactPack } from '../narrative/fact-pack';
import { buildNarrativeStoryPlan } from '../narrative/story-plan';
import { buildReportBlueprint } from '../narrative/report-blueprint';
import {
  buildNarrativeSlotPlan,
  buildReportThesis,
  generateBoundedNarrativeReport,
  type BoundedCompiledManuscript
} from '../narrative/bounded-section-engine';
import { createV11BoundedSectionWriter } from '../narrative/bounded-section-writer';
import { renderHtmlToPdfBuffer } from '../render-pdf';
import { COMPREHENSIVE_INTERPRETATION_MODEL } from './interpretation';
import { buildComprehensiveNarrativePresentationModel } from './narrative-presentation-model';
import { renderComprehensiveNarrativeReportHtml } from './render-narrative-html';

export interface ComprehensiveNarrativeGenerationResult {
  pdf: Buffer;
  manuscript: BoundedCompiledManuscript;
  html: string;
}

/**
 * Customer-facing Comprehensive generation.
 *
 * The deterministic engine still owns truth. The existing Reporting Bible
 * Blueprint owns the story. The bounded writer explains each authorised
 * movement. The PDF publishes the validated manuscript; detailed registers stay
 * in the companion XLSX rather than being reproduced as report appendices.
 */
export async function generateComprehensiveNarrativeReport(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
}): Promise<ComprehensiveNarrativeGenerationResult> {
  const { assembled, evidenceModel } = input;
  const delivery = buildComprehensiveDeliveryModel({
    assembled,
    evidenceModel,
    score: {
      overallScore: assembled.scoreRun.overallScore,
      calculatedMaturity: assembled.scoreRun.calculatedMaturity,
      finalMaturity: assembled.scoreRun.finalMaturity,
      exposureScore: assembled.scoreRun.exposureScore,
      exposureBand: assembled.scoreRun.exposureBand,
      coveragePct: assembled.scoreRun.coveragePct,
      nARatePct: assembled.scoreRun.nARatePct,
      criticalGapCount: assembled.scoreRun.criticalGapCount,
      majorGapCount: assembled.scoreRun.majorGapCount,
      capApplied: assembled.scoreRun.capApplied,
      capReason: assembled.scoreRun.capReason,
      methodologyVersionId: assembled.scoreRun.methodologyVersionId
    },
    organisationName: assembled.organisationName,
    assessmentReference: assembled.assessmentReference,
    generatedAt: assembled.generatedAt
  });

  const factPack = buildComprehensiveNarrativeFactPack(delivery);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  const thesis = buildReportThesis(factPack, blueprint);
  const plan = buildNarrativeSlotPlan(factPack, blueprint, thesis);
  const manuscript = await generateBoundedNarrativeReport({
    reportGenerationId: `comprehensive:${assembled.orderId}:${assembled.assessmentReference}`,
    pack: factPack,
    blueprint,
    thesis,
    plan,
    provider: createV11BoundedSectionWriter(COMPREHENSIVE_INTERPRETATION_MODEL)
  });

  const presentation = buildComprehensiveNarrativePresentationModel({
    factPack,
    blueprint,
    plan,
    manuscript
  });
  const html = renderComprehensiveNarrativeReportHtml(presentation);
  const pdf = await renderHtmlToPdfBuffer(html, {
    footerLabel: `MK Fraud Readiness · Comprehensive · ${factPack.organisation.name}`
  });

  return { pdf, manuscript, html };
}

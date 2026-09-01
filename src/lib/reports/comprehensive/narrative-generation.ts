import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildComprehensiveDeliveryModel } from './contract';
import { buildComprehensiveNarrativeFactPack } from '../narrative/fact-pack';
import { composeEssentialManuscript as composeReportingManuscript, type EssentialManuscriptResult } from '../narrative/essential-manuscript-coordinator';
import { createV11WholeManuscriptWriter } from '../narrative/whole-manuscript-writer';
import { renderHtmlToPdfBuffer } from '../render-pdf';
import { COMPREHENSIVE_INTERPRETATION_MODEL } from './interpretation';
import { buildComprehensiveNarrativePresentationModel } from './narrative-presentation-model';
import { renderComprehensiveNarrativeReportHtml } from './render-narrative-html';
import type { WholeManuscriptTextResult } from '../narrative/manuscript';

export interface ComprehensiveNarrativeGenerationResult {
  pdf: Buffer;
  narrativeRun: WholeManuscriptTextResult;
  semanticSafety?: EssentialManuscriptResult['semanticSafety'];
  html: string;
}

/**
 * Customer-facing Comprehensive generation.
 *
 * The deterministic engine owns truth. The Reporting Bible Blueprint owns the
 * story. One whole-manuscript writer creates a coherent advisory narrative and
 * the same semantic-safety cascade used by Essential decides whether the prose
 * can be published. Detailed registers stay in the companion XLSX.
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
  const composed = await composeReportingManuscript({
    factPack,
    // Match Essential's production safety architecture: one generation-role
    // dispatch, with semantic adjudication/repair roles owned separately by the
    // coordinator rather than hidden inside the writer.
    writer: createV11WholeManuscriptWriter(COMPREHENSIVE_INTERPRETATION_MODEL, { providerCallBudget: 1 })
  });

  const presentation = buildComprehensiveNarrativePresentationModel({
    factPack,
    blueprint: composed.blueprint,
    narrative: composed.narrative
  });
  const html = renderComprehensiveNarrativeReportHtml(presentation);
  const pdf = await renderHtmlToPdfBuffer(html, {
    footerLabel: `MK Fraud Readiness · Comprehensive · ${factPack.organisation.name}`
  });

  return {
    pdf,
    narrativeRun: composed.manuscript,
    semanticSafety: composed.semanticSafety,
    html
  };
}

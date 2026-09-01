import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildComprehensiveDeliveryModel } from './contract';
import { buildComprehensiveNarrativeFactPack } from '../narrative/fact-pack';
import { composeComprehensiveManuscript } from './manuscript-coordinator';
import { createV11WholeManuscriptWriter } from '../narrative/whole-manuscript-writer';
import { renderHtmlToPdfBuffer } from '../render-pdf';
import { ComprehensiveProviderCallLedger, COMPREHENSIVE_PRIMARY_MODEL, COMPREHENSIVE_TECHNICAL_MODEL_CHAIN } from './recovery-policy';
import { buildComprehensiveNarrativePresentationModel } from './narrative-presentation-model';
import { renderComprehensiveNarrativeReportHtml } from './render-narrative-html';
import type { WholeManuscriptTextResult } from '../narrative/manuscript';

export interface ComprehensiveNarrativeSafetySummary {
  contractVersion: 'mk-comprehensive-deterministic-safety-v1';
  outcome: 'ACCEPT';
  hardTruthFailures: number;
  repairableSemanticFailures: number;
  qualityFailures: number;
  providerCalls: number;
}

export interface ComprehensiveNarrativeGenerationResult {
  pdf: Buffer;
  narrativeRun: WholeManuscriptTextResult;
  semanticSafety?: ComprehensiveNarrativeSafetySummary;
  html: string;
}

/**
 * Customer-facing Comprehensive generation.
 *
 * The deterministic engine owns truth. The Reporting Bible Blueprint owns the
 * story. One whole-manuscript writer creates a coherent advisory narrative and
 * the bounded text validator/recovery path decides whether the prose can be
 * published. Detailed registers stay in the companion XLSX.
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
  const ledger = new ComprehensiveProviderCallLedger();
  const composed = await composeComprehensiveManuscript({
    factPack,
    ledger,
    modelChain: COMPREHENSIVE_TECHNICAL_MODEL_CHAIN,
    writer: createV11WholeManuscriptWriter(COMPREHENSIVE_PRIMARY_MODEL, { providerCallLedger: ledger }),
    createWriter: (model, sharedLedger) => createV11WholeManuscriptWriter(model, { providerCallLedger: sharedLedger }),
    attemptIdentity: `${assembled.assessmentReference}:comprehensive:${assembled.generatedAt}`
  });

  const presentation = buildComprehensiveNarrativePresentationModel({
    factPack,
    blueprint: composed.blueprint,
    narrative: composed.narrative
  });
  const html = renderComprehensiveNarrativeReportHtml(presentation);
  const pdf = await renderHtmlToPdfBuffer(html, {
    footerLabel: `MK Fraud Insights · Comprehensive Fraud Readiness Report · ${factPack.assessment.reference}`
  });

  return {
    pdf,
    narrativeRun: composed.manuscript,
    semanticSafety: {
      contractVersion: 'mk-comprehensive-deterministic-safety-v1',
      outcome: 'ACCEPT',
      hardTruthFailures: 0,
      repairableSemanticFailures: composed.recovery.targetedRepairCount,
      qualityFailures: composed.recovery.qualityEscalationCount,
      providerCalls: composed.recovery.totalCalls
    },
    html
  };
}

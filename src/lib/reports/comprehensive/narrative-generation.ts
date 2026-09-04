import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildComprehensiveDeliveryModel } from './contract';
import { buildComprehensiveNarrativeFactPack } from '../narrative/fact-pack';
import { composeComprehensiveManuscript } from './manuscript-coordinator';
import { createV11WholeManuscriptWriter } from '../narrative/whole-manuscript-writer-comprehensive';
import { renderHtmlToPdfBuffer } from '../render-pdf';
import { ComprehensiveProviderCallLedger, COMPREHENSIVE_PRIMARY_MODEL, COMPREHENSIVE_TECHNICAL_MODEL_CHAIN } from './recovery-policy';
import { buildComprehensiveNarrativePresentationModel } from './narrative-presentation-model';
import { renderComprehensiveNarrativeReportHtml } from './render-narrative-html';
import type { WholeManuscriptTextResult } from '../narrative/manuscript';
import type { ParsedBlueprintMarkdown, TextFirstValidationReport } from '../narrative/blueprint-text';

export interface ComprehensiveNarrativeSafetySummary {
  contractVersion: 'mk-comprehensive-deterministic-safety-v1';
  outcome: 'ACCEPT';
  hardTruthFailures: number;
  repairableSemanticFailures: number;
  qualityFailures: number;
  providerCalls: number;
}

/**
 * Everything needed to durably bind the accepted manuscript to its generation attempt. Returned
 * alongside the PDF so the fulfilment path cannot render a customer package and then let the
 * accepted narrative fall out of scope with the request.
 */
export interface ComprehensiveNarrativeProvenance {
  generationMode: 'ai' | 'ai_repair' | 'deterministic_fallback';
  contractVersion: string;
  architecture: string;
  promptVersion: string;
  schemaVersion: string;
  requestedProvider: string | null;
  requestedModel: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  markdown: string;
  narrative: ParsedBlueprintMarkdown;
  validation: TextFirstValidationReport;
  semanticSafety: ComprehensiveNarrativeSafetySummary;
  providerCalls: number;
  targetedRepairs: number;
  coherencePasses: number;
  generationId: string;
  factPackSha256: string;
  storyPlanSha256: string;
  blueprintSha256: string;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    estimated_cost_micros: number | null;
  } | null;
}

export interface ComprehensiveNarrativeGenerationResult {
  pdf: Buffer;
  narrativeRun: WholeManuscriptTextResult;
  semanticSafety?: ComprehensiveNarrativeSafetySummary;
  html: string;
  provenance: ComprehensiveNarrativeProvenance;
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

  const semanticSafety: ComprehensiveNarrativeSafetySummary = {
    contractVersion: 'mk-comprehensive-deterministic-safety-v1',
    outcome: 'ACCEPT',
    hardTruthFailures: 0,
    repairableSemanticFailures: composed.recovery.targetedRepairCount,
    qualityFailures: composed.recovery.qualityEscalationCount,
    providerCalls: composed.recovery.totalCalls
  };
  const metadata = composed.manuscript.writerMetadata;

  return {
    pdf,
    narrativeRun: composed.manuscript,
    provenance: {
      generationMode: composed.recovery.totalCalls === 0
        ? 'deterministic_fallback'
        : composed.recovery.targetedRepairCount > 0 ? 'ai_repair' : 'ai',
      contractVersion: composed.manuscript.contractVersion,
      architecture: metadata.architecture,
      promptVersion: metadata.promptVersion || composed.manuscript.contractVersion,
      schemaVersion: 'mk-comprehensive-blueprint-text-v1',
      requestedProvider: COMPREHENSIVE_PRIMARY_MODEL.split('/')[0] || null,
      requestedModel: COMPREHENSIVE_PRIMARY_MODEL,
      resolvedProvider: metadata.provider ?? metadata.model?.split('/')[0] ?? null,
      resolvedModel: metadata.model ?? null,
      markdown: composed.manuscript.markdown,
      narrative: composed.narrative,
      validation: composed.finalValidation,
      semanticSafety,
      providerCalls: composed.recovery.totalCalls,
      targetedRepairs: composed.recovery.targetedRepairCount,
      coherencePasses: composed.recovery.coherenceCount,
      generationId: composed.generationId,
      factPackSha256: composed.factPackSha256,
      storyPlanSha256: composed.storyPlanSha256,
      blueprintSha256: composed.blueprintSha256,
      usage: {
        input_tokens: metadata.inputTokens ?? null,
        output_tokens: metadata.outputTokens ?? null,
        total_tokens: metadata.totalTokens ?? null,
        estimated_cost_micros: metadata.providerCostMicros ?? null
      }
    },
    semanticSafety,
    html
  };
}

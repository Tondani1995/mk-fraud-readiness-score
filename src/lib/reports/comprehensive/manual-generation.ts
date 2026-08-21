import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildEssentialProjection } from '../essential-projection';
import { buildEssentialNarrativeFactPack } from '../narrative/fact-pack';
import { getMaturityBand } from '@/lib/scoring/maturity-band';
import { assembleComprehensive } from './assembly';
import { buildComprehensiveManagementModel } from './management-model';
import { renderComprehensiveManagementReportHtml } from './render-comprehensive-html';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract } from './contract';
import { buildComprehensiveRegisterWorkbook, type ComprehensiveRegisterWorkbook } from './workbook-builder';
import {
  adaptComprehensiveEvidenceModel,
  adaptComprehensiveScenarioFacts
} from './customer-visible-adaptation';
import {
  buildInterpretationBrief,
  ComprehensiveInterpretationFailure,
  generateComprehensiveInterpretation,
  interpretationToCommentary,
  type ComprehensiveInterpretationFailureReasonCode,
  type ComprehensiveSafetyFailureEvidence,
  type DiagnosticTriState,
  type InterpretationAccounting,
  type InterpretationRun
} from './interpretation';
import { validateComprehensiveFinalHtml, validateComprehensiveInterpretationSafety, type ComprehensiveSafetyRun } from './safety';
import { renderHtmlToPdfBuffer } from '../render-pdf';

export interface ComprehensiveReportPackage {
  pdf: Buffer;
  workbook: ComprehensiveRegisterWorkbook;
  interpretationRun: InterpretationRun;
  safetyRun: ComprehensiveSafetyRun;
  source: {
    assemblyVersion: string;
    managementModelVersion: string;
    reportReference: string;
    versionNumber: number | null;
  };
}

function accountingAvailable(accounting: InterpretationAccounting): boolean {
  return Boolean(accounting.inputTokens || accounting.outputTokens || accounting.totalTokens || accounting.costMicros);
}

function wrapPostProcessingFailure(accounting: InterpretationAccounting, reasonCode: ComprehensiveInterpretationFailureReasonCode): ComprehensiveInterpretationFailure {
  const providerAttempted = accounting.calls > 0;
  const completedBoundary: DiagnosticTriState = providerAttempted ? 'yes' : 'no';
  return new ComprehensiveInterpretationFailure({
    stage: 'POST_PROCESSING',
    reasonCode,
    provider: accounting.model.split('/')[0]?.trim() || 'vercel-ai-gateway',
    model: accounting.model,
    providerAttempted: providerAttempted ? 'yes' : 'no',
    providerDispatched: completedBoundary,
    providerResponseReceived: completedBoundary,
    gatewayResponseReceived: completedBoundary,
    accountingAvailable: accountingAvailable(accounting),
    retryable: false,
    accounting: { ...accounting, repairedSlots: [...accounting.repairedSlots] }
  });
}

function safetyEvidenceForFailure(run: ComprehensiveSafetyRun): ComprehensiveSafetyFailureEvidence {
  return {
    interpretation: run.interpretation,
    issues: run.issues.map((issue) => ({
      slot: issue.slot,
      kind: issue.kind,
      code: issue.code,
      detail: issue.detail
    })),
    repairs: run.repairs.map((repair) => ({
      kind: repair.kind,
      slots: [...repair.slots],
      replacements: repair.replacements
    })),
    cascade: {
      policyVersion: run.cascade.policyVersion,
      publishable: run.cascade.publishable,
      blockingCodes: [...run.cascade.blockingCodes],
      heldForReviewCodes: [...run.cascade.heldForReviewCodes],
      warningCodes: [...run.cascade.warningCodes],
      repairCodes: [...run.cascade.repairCodes],
      candidates: run.cascade.candidates.map((candidate) => ({
        id: candidate.id,
        ruleCode: candidate.ruleCode,
        severity: candidate.severity,
        path: candidate.path,
        span: candidate.span,
        spanHash: candidate.spanHash,
        finalDisposition: candidate.finalDisposition,
        decisions: candidate.decisions.map((decision) => ({
          layer: decision.layer,
          disposition: decision.disposition,
          reasonCode: decision.reasonCode
        }))
      }))
    },
    candidateTrace: run.candidateTrace.map((trace) => ({ ...trace }))
  };
}

function throwSafetyFailure(
  accounting: InterpretationAccounting,
  reasonCode: ComprehensiveInterpretationFailureReasonCode,
  safetyRun?: ComprehensiveSafetyRun
): never {
  const providerAttempted = accounting.calls > 0;
  const completedBoundary: DiagnosticTriState = providerAttempted ? 'yes' : 'no';
  throw new ComprehensiveInterpretationFailure({
    stage: 'SAFETY_VALIDATION',
    reasonCode,
    provider: accounting.model.split('/')[0]?.trim() || 'vercel-ai-gateway',
    model: accounting.model,
    providerAttempted: providerAttempted ? 'yes' : 'no',
    providerDispatched: completedBoundary,
    providerResponseReceived: completedBoundary,
    gatewayResponseReceived: completedBoundary,
    accountingAvailable: accountingAvailable(accounting),
    retryable: false,
    accounting: { ...accounting, repairedSlots: [...accounting.repairedSlots] },
    ...(safetyRun ? { safetyEvidence: safetyEvidenceForFailure(safetyRun) } : {})
  });
}

/**
 * The Comprehensive generation path used by admin manual fulfilment.
 *
 * This composes the already-certified Comprehensive pipeline and nothing else. Every
 * analytical decision -- scoring, Fact Pack, scenarios, controls, programme taxonomy,
 * governance, assurance and resilience logic, the interpretation contracts and the
 * renderer -- stays in the frozen modules called below. This file only orders those
 * calls, which is exactly the order the accepted owner-approved PDFs were produced in.
 * There is deliberately no second Comprehensive implementation and no copy of the
 * renderer here; a divergence between what the operator generates and what was
 * certified would be a silent product change.
 */
export async function renderComprehensiveReportPackage(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
  /**
   * Repairs are additional paid provider calls. Manual fulfilment runs on an explicit
   * single-call budget, so the default is zero: one call produces the report or the
   * attempt fails visibly rather than quietly spending more.
  */
  maxRepairsPerSlot?: number;
  orderReference?: string;
  reportReference?: string;
  versionNumber?: number;
  /** Called immediately after the provider result is validated and before PDF/XLSX construction. */
  onInterpretationComplete?: (input: { accounting: InterpretationAccounting }) => Promise<void> | void;
  /** Provider-free seam for exercising the package builder without an AI call. */
  generateInterpretation?: typeof generateComprehensiveInterpretation;
  /** Provider-free seam for exercising the package builder without Chromium. */
  renderPdf?: typeof renderHtmlToPdfBuffer;
}): Promise<ComprehensiveReportPackage> {
  const { assembled, evidenceModel } = input;

  // The standing playbooks deliberately carry formal roles, illustrative operating
  // routes and case-validation placeholders. They remain authoritative analytical
  // inputs, but Comprehensive must not present those labels as facts about a customer.
  // Use one adapted copy for every customer-visible Comprehensive consumer so the
  // interpretation brief, management model and PDF cannot disagree with each other.
  const customerEvidenceModel = adaptComprehensiveEvidenceModel(evidenceModel);
  const pack = buildEssentialNarrativeFactPack(
    assembled,
    customerEvidenceModel,
    buildEssentialProjection(assembled, customerEvidenceModel)
  );
  // Fail closed before the provider call. A Comprehensive report is an interpretation of
  // a completed score; without one there is nothing to interpret and no report to sell.
  const { score, maturity } = pack.assessment;
  if (typeof score !== 'number' || !maturity) {
    throw new Error('Comprehensive generation requires a scored assessment with a maturity band.');
  }

  const domains = pack.domains
    .filter((domain) => typeof domain.score === 'number')
    .map((domain) => ({ name: domain.name, score: domain.score as number, band: getMaturityBand(domain.score as number) }));

  const assembly = assembleComprehensive(customerEvidenceModel, {
    scenarioFacts: adaptComprehensiveScenarioFacts(pack.scenarios),
    domains,
    contradictions: customerEvidenceModel.contradictions,
    assembled,
    scenarioUniverse: customerEvidenceModel.scenarios
  });
  const model = buildComprehensiveManagementModel(assembly);

  // The workbook is derived from the same adapted deterministic evidence model and score
  // snapshot used to build the PDF's Comprehensive assembly. It is not the Essential workbook
  // and it is not a second provider or reviewer path.
  const deliveryModel = buildComprehensiveDeliveryModel({
    assembled,
    evidenceModel: customerEvidenceModel,
    score: {
      overallScore: score,
      calculatedMaturity: pack.assessment.maturity,
      finalMaturity: pack.assessment.maturity,
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
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    generatedAt: assembled.generatedAt
  }, {
    domainDiagnostics: assembly.domainDiagnostics,
    scenarioSelectionAudit: assembly.scenarioSelectionAudit,
    scenarioPortfolio: assembly.scenarioPortfolio
  });
  assertComprehensiveBlueprintContract(deliveryModel);

  const interpretationGenerator = input.generateInterpretation ?? generateComprehensiveInterpretation;
  const interpretationRun = await interpretationGenerator(
    buildInterpretationBrief({
      model,
      organisationName: pack.organisation.name,
      score,
      maturity,
      domains,
      assembled,
      evidenceModel: customerEvidenceModel
    }),
    { maxRepairsPerSlot: input.maxRepairsPerSlot ?? 0 }
  );
  const safetyRun = validateComprehensiveInterpretationSafety({
    interpretation: interpretationRun.interpretation,
    brief: buildInterpretationBrief({
      model,
      organisationName: pack.organisation.name,
      score,
      maturity,
      domains,
      assembled,
      evidenceModel: customerEvidenceModel
    }),
    factPack: pack
  });
  if (!safetyRun.publishable) {
    throwSafetyFailure(
      interpretationRun.accounting,
      'interpretation_safety_unpublishable',
      safetyRun
    );
  }
  try {
    await input.onInterpretationComplete?.({ accounting: interpretationRun.accounting });
  } catch {
    throw wrapPostProcessingFailure(interpretationRun.accounting, 'interpretation_accounting_persistence_failed');
  }

  let html: string;
  try {
    html = renderComprehensiveManagementReportHtml({
      model,
      organisationName: pack.organisation.name,
      assessmentReference: pack.assessment.reference,
      score,
      maturity,
      domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band })),
      commentary: interpretationToCommentary(safetyRun.interpretation)
    });
  } catch {
    throw wrapPostProcessingFailure(interpretationRun.accounting, 'management_report_render_failed');
  }
  let finalSafety: ReturnType<typeof validateComprehensiveFinalHtml>;
  try {
    finalSafety = validateComprehensiveFinalHtml({ html, data: assembled, safety: safetyRun });
  } catch {
    throw wrapPostProcessingFailure(interpretationRun.accounting, 'final_output_safety_evaluation_failed');
  }
  if (!finalSafety.publishable) {
    throwSafetyFailure(
      interpretationRun.accounting,
      'final_output_safety_unpublishable'
    );
  }

  const pdfRenderer = input.renderPdf ?? renderHtmlToPdfBuffer;
  let pdf: Buffer;
  let workbook: ComprehensiveRegisterWorkbook;
  try {
    pdf = await pdfRenderer(html, {
      footerLabel: `MK Fraud Readiness Comprehensive — ${pack.organisation.name}`
    });

    workbook = await buildComprehensiveRegisterWorkbook(deliveryModel, {
      orderReference: input.orderReference,
      reportReference: input.reportReference ?? assembled.reportReference,
      versionNumber: input.versionNumber
    });
  } catch {
    throw wrapPostProcessingFailure(interpretationRun.accounting, 'report_artifact_construction_failed');
  }

  return {
    pdf,
    workbook,
    interpretationRun: { ...interpretationRun, interpretation: safetyRun.interpretation, issues: safetyRun.issues },
    safetyRun,
    source: {
      assemblyVersion: assembly.version,
      managementModelVersion: model.version,
      reportReference: input.reportReference ?? assembled.reportReference,
      versionNumber: input.versionNumber ?? null
    }
  };
}

export async function renderComprehensiveReportPdf(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
  maxRepairsPerSlot?: number;
}): Promise<{ pdf: Buffer; interpretationRun: InterpretationRun }> {
  const result = await renderComprehensiveReportPackage(input);
  return { pdf: result.pdf, interpretationRun: result.interpretationRun };
}

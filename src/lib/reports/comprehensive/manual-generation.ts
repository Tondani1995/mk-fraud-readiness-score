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
  generateComprehensiveInterpretation,
  interpretationToCommentary,
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
    const detail = [...safetyRun.cascade.blockingCodes, ...safetyRun.cascade.heldForReviewCodes, ...safetyRun.issues.map((issue) => issue.code)];
    throw new Error(`Comprehensive interpretation safety failed: ${[...new Set(detail)].join(', ') || 'unpublishable interpretation'}`);
  }
  await input.onInterpretationComplete?.({ accounting: interpretationRun.accounting });

  const html = renderComprehensiveManagementReportHtml({
    model,
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    score,
    maturity,
    domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band })),
    commentary: interpretationToCommentary(safetyRun.interpretation)
  });
  const finalSafety = validateComprehensiveFinalHtml({ html, data: assembled, safety: safetyRun });
  if (!finalSafety.publishable) {
    throw new Error(`Comprehensive final-output safety failed: ${[...finalSafety.blockingCodes, ...finalSafety.heldForReviewCodes].join(', ') || 'unpublishable final output'}`);
  }

  const pdfRenderer = input.renderPdf ?? renderHtmlToPdfBuffer;
  const pdf = await pdfRenderer(html, {
    footerLabel: `MK Fraud Readiness Comprehensive — ${pack.organisation.name}`
  });

  const workbook = await buildComprehensiveRegisterWorkbook(deliveryModel, {
    orderReference: input.orderReference,
    reportReference: input.reportReference ?? assembled.reportReference,
    versionNumber: input.versionNumber
  });

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

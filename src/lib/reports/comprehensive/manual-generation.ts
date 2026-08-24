import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildEssentialProjection } from '../essential-projection';
import { buildEssentialNarrativeFactPack } from '../narrative/fact-pack';
import { getMaturityBand } from '@/lib/scoring/maturity-band';
import { assembleComprehensive } from './assembly';
import { buildComprehensiveManagementModel } from './management-model';
import { renderComprehensiveManagementReportHtml, comprehensiveSectionPlan, COMPREHENSIVE_REGISTER_TITLES } from './render-comprehensive-html';
import { addPdfBookmarks, extractHeadingPageMap, type BookmarkNode, type TocEntry } from '../pdf-navigation';
import type { ComprehensiveManagementModel } from './management-model';
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
    // A 49-page management report with no outline is a navigation defect, not a design
    // choice. Bookmarks are metadata written into the finished bytes: no page is
    // re-laid-out and nothing visible moves.
    pdf = await withComprehensiveBookmarks(pdf, model, html);

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

/**
 * Write the PDF outline for a rendered Comprehensive report.
 *
 * The tree follows the document's own numbered management architecture, with the appendix
 * registers nested under one parent, mirroring how Essential already presents its appendix.
 * Headings are located by scanning the rendered bytes, so the outline can only ever point at
 * pages the render actually produced.
 *
 * The scan starts at page 3 because the contents page prints every section label as plain
 * text; starting earlier resolves every entry to the contents page.
 *
 * A failure here must never cost the customer their report. The document is complete and
 * correct without an outline, so a scan that cannot find its headings returns the original
 * bytes rather than throwing.
 */
async function withComprehensiveBookmarks(pdf: Buffer, model: ComprehensiveManagementModel, html: string): Promise<Buffer> {
  try {
    const sections = comprehensiveSectionPlan(model);
    // Anchor each section on the first real heading of its opening page, not on the numbered
    // kicker above it. The kicker is 6.8pt, below the size at which the heading scanner will
    // consider an item a heading at all, so keying on it finds nothing. The opening <h1> is
    // large, unique and already the thing a reader would call the start of the section.
    const sectionEntries: TocEntry[] = [];
    for (const [index, section] of sections.entries()) {
      // Most sections open with a small numbered kicker followed by a full-size heading.
      // A few -- the scenario portfolio among them -- use the register-style head instead,
      // whose own heading is already the section title. Try the kicker first, fall back to
      // the title itself, so the outline does not quietly lose a section to markup variance.
      const at = html.indexOf(`class="q">${index + 1} · ${section.title}<`);
      const heading = at >= 0 ? /<h1[^>]*>([^<]+)<\/h1>/.exec(html.slice(at)) : null;
      sectionEntries.push({ key: (heading?.[1] ?? section.title).trim(), label: section.title });
    }
    const registerEntries: TocEntry[] = COMPREHENSIVE_REGISTER_TITLES.map(([letter, title]) => ({
      key: title,
      label: `Appendix ${letter} · ${title}`
    }));
    const pageMap = await extractHeadingPageMap(new Uint8Array(pdf), [...sectionEntries, ...registerEntries], 3);
    const located = (entry: TocEntry): boolean => Number.isInteger(pageMap[entry.key]);
    const bookmarks: BookmarkNode[] = sectionEntries.filter(located).map((entry) => ({
      title: entry.label,
      pageNumber: pageMap[entry.key]!
    }));
    const registers = registerEntries.filter(located);
    if (registers.length) {
      bookmarks.push({
        title: 'Appendices',
        pageNumber: pageMap[registers[0]!.key]!,
        children: registers.map((entry) => ({ title: entry.label, pageNumber: pageMap[entry.key]! }))
      });
    }
    if (!bookmarks.length) return pdf;
    return Buffer.from(await addPdfBookmarks(new Uint8Array(pdf), bookmarks));
  } catch {
    return pdf;
  }
}

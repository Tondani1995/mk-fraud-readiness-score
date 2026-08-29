import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildEssentialProjection } from '../essential-projection';
import { buildEssentialNarrativeFactPack } from '../narrative/fact-pack';
import { getMaturityBand } from '@/lib/scoring/maturity-band';
import { assembleComprehensive } from './assembly';
import { buildComprehensiveManagementModel } from './management-model';
import { renderComprehensiveManagementReportHtml } from './render-comprehensive-html';
import {
  adaptComprehensiveEvidenceModel,
  adaptComprehensiveScenarioFacts
} from './customer-visible-adaptation';
import {
  buildInterpretationBrief,
  generateComprehensiveInterpretation,
  interpretationToCommentary,
  type InterpretationRun
} from './interpretation';
import { renderHtmlToPdfBuffer } from '../render-pdf';

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
export async function renderComprehensiveReportPdf(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
  /**
   * Repairs are additional paid provider calls. Manual fulfilment runs on an explicit
   * single-call budget, so the default is zero: one call produces the report or the
   * attempt fails visibly rather than quietly spending more.
   */
  maxRepairsPerSlot?: number;
}): Promise<{ pdf: Buffer; interpretationRun: InterpretationRun }> {
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

  const model = buildComprehensiveManagementModel(
    assembleComprehensive(customerEvidenceModel, {
      scenarioFacts: adaptComprehensiveScenarioFacts(pack.scenarios),
      domains
    })
  );

  const interpretationRun = await generateComprehensiveInterpretation(
    buildInterpretationBrief({
      model,
      organisationName: pack.organisation.name,
      score,
      maturity,
      domains
    }),
    { maxRepairsPerSlot: input.maxRepairsPerSlot ?? 0 }
  );

  const html = renderComprehensiveManagementReportHtml({
    model,
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    score,
    maturity,
    domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band })),
    commentary: interpretationToCommentary(interpretationRun.interpretation)
  });

  const pdf = await renderHtmlToPdfBuffer(html, {
    footerLabel: `MK Fraud Readiness Comprehensive: ${pack.organisation.name}`
  });

  return { pdf, interpretationRun };
}

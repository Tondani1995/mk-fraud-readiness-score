import { createHash } from 'node:crypto';
import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { buildEssentialProjection } from '../essential-projection';
import { buildEssentialNarrativeFactPack } from '../narrative/fact-pack';
import { getMaturityBand } from '@/lib/scoring/maturity-band';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleComprehensive } from './assembly';
import { buildComprehensiveManagementModel } from './management-model';
import { renderComprehensiveManagementReportHtml } from './render-comprehensive-html';
import {
  adaptComprehensiveEvidenceModel,
  adaptComprehensiveScenarioFacts
} from './customer-visible-adaptation';
import {
  buildInterpretationBrief,
  COMPREHENSIVE_INTERPRETATION_VERSION,
  generateComprehensiveInterpretation,
  interpretationToCommentary,
  type InterpretationBrief,
  type InterpretationRun
} from './interpretation';
import { renderHtmlToPdfBuffer } from '../render-pdf';

const COMPREHENSIVE_INTERPRETATION_SCHEMA_VERSION = 'mk-comprehensive-interpretation-schema-v1';

function reportVersionFromReference(reportReference: string): number {
  const match = reportReference.match(/-V(\d+)$/);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Comprehensive manual generation requires a versioned report reference.');
  }
  return version;
}

function evidenceChecksum(brief: InterpretationBrief): string {
  // This is the exact deterministic brief supplied to the bounded writer. Hashing it here makes
  // the persisted provenance describe the evidence actually interpreted, rather than a wider
  // assessment payload that the provider never received.
  return createHash('sha256').update(JSON.stringify(brief), 'utf8').digest('hex');
}

async function resolveManualGenerationProvenanceTarget(assembled: AssembledReportData) {
  const db = createSupabaseServiceClient() as any;
  const reportVersion = reportVersionFromReference(assembled.reportReference);
  let query: any = db
    .from('manual_report_generation_attempts')
    .select('id')
    .eq('assessment_id', assembled.assessmentId)
    .eq('report_version', reportVersion)
    .eq('status', 'REPORT_GENERATING');

  query = assembled.orderId
    ? query.eq('order_id', assembled.orderId)
    : query.is('order_id', null);

  const { data, error } = await query.limit(2);
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1 || !data[0]?.id) {
    throw new Error('Comprehensive manual generation provenance target is not uniquely active.');
  }
  return { db, attemptId: String(data[0].id), reportVersion };
}

async function persistComprehensiveManuscriptProvenance(input: {
  db: any;
  attemptId: string;
  brief: InterpretationBrief;
  interpretationRun: InterpretationRun;
}) {
  const { interpretationRun } = input;
  const model = interpretationRun.accounting.model;
  const provider = model.split('/')[0]?.trim() || 'vercel-ai-gateway';
  const checksum = evidenceChecksum(input.brief);
  const finalValidation = {
    validation_mode: 'comprehensive_interpretation_contract_v1',
    interpretation_version: COMPREHENSIVE_INTERPRETATION_VERSION,
    issue_count: interpretationRun.issues.length,
    issues: interpretationRun.issues
  };
  const generationMode = interpretationRun.accounting.repairs > 0 ? 'ai_repair' : 'ai';

  const { data, error } = await input.db.rpc('record_manual_report_narrative_provenance', {
    p_manual_generation_attempt_id: input.attemptId,
    p_provenance: {
      generation_mode: generationMode,
      evidence_checksum: checksum,
      prompt_version: COMPREHENSIVE_INTERPRETATION_VERSION,
      schema_version: COMPREHENSIVE_INTERPRETATION_SCHEMA_VERSION,
      requested_provider: provider,
      requested_model: model,
      resolved_provider: provider,
      resolved_model: model,
      structured_ai_output: interpretationRun.interpretation,
      final_narrative: interpretationRun.interpretation,
      final_validation: finalValidation,
      initial_validation: finalValidation,
      repair_validation: interpretationRun.accounting.repairs > 0 ? finalValidation : null,
      usage: {
        input_tokens: interpretationRun.accounting.inputTokens,
        output_tokens: interpretationRun.accounting.outputTokens,
        total_tokens: interpretationRun.accounting.totalTokens,
        estimated_cost_micros: interpretationRun.accounting.costMicros,
        latency_ms: interpretationRun.accounting.durationMs
      },
      fallback_reason: null
    }
  });

  if (error || !data) {
    throw error ?? new Error('Comprehensive manuscript provenance could not be persisted.');
  }
  return { checksum, persisted: data };
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

  // Resolve the exact active manual attempt before spending a provider call. This is the row the
  // database provenance guard will inspect when finalisation later moves the attempt to
  // REPORT_READY. If it cannot be identified uniquely, fail here rather than after AI and Storage.
  const provenanceTarget = await resolveManualGenerationProvenanceTarget(assembled);

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

  const brief = buildInterpretationBrief({
    model,
    organisationName: pack.organisation.name,
    score,
    maturity,
    domains
  });
  const interpretationRun = await generateComprehensiveInterpretation(
    brief,
    { maxRepairsPerSlot: input.maxRepairsPerSlot ?? 0 }
  );

  // The final interpretation is the exact manuscript rendered below. Persist it while the parent
  // attempt is still REPORT_GENERATING and before PDF rendering or Storage publication. The
  // database finalisation guard therefore proves provenance instead of discovering its absence at
  // the last write after the report has already been produced and uploaded.
  await persistComprehensiveManuscriptProvenance({
    db: provenanceTarget.db,
    attemptId: provenanceTarget.attemptId,
    brief,
    interpretationRun
  });

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

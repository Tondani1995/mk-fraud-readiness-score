import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { generateComprehensiveNarrativeReport, type ComprehensiveNarrativeProvenance } from './narrative-generation';

function reportVersionFromReference(reportReference: string): number {
  const match = reportReference.match(/-V(\d+)$/);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Comprehensive manual generation requires a versioned report reference.');
  }
  return version;
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
  return { db, attemptId: String(data[0].id) };
}

async function persistComprehensiveManuscriptProvenance(input: {
  db: any;
  attemptId: string;
  provenance: ComprehensiveNarrativeProvenance;
}) {
  const { provenance } = input;
  const { data, error } = await input.db.rpc('record_manual_report_narrative_provenance', {
    p_manual_generation_attempt_id: input.attemptId,
    p_provenance: {
      generation_mode: provenance.generationMode,
      evidence_checksum: provenance.factPackSha256,
      prompt_version: provenance.promptVersion,
      schema_version: provenance.schemaVersion,
      requested_provider: provenance.requestedProvider,
      requested_model: provenance.requestedModel,
      resolved_provider: provenance.resolvedProvider,
      resolved_model: provenance.resolvedModel,
      structured_ai_output: {
        contract_version: provenance.contractVersion,
        architecture: provenance.architecture,
        markdown: provenance.markdown
      },
      final_narrative: provenance.narrative,
      final_validation: {
        ...provenance.validation,
        product: 'Comprehensive',
        semantic_safety: provenance.semanticSafety,
        provider_calls: provenance.providerCalls,
        targeted_repairs: provenance.targetedRepairs,
        coherence_passes: provenance.coherencePasses,
        generation_id: provenance.generationId,
        fact_pack_sha256: provenance.factPackSha256,
        story_plan_sha256: provenance.storyPlanSha256,
        blueprint_sha256: provenance.blueprintSha256
      },
      usage: provenance.usage,
      fallback_reason: null
    }
  });
  if (error || !data) {
    throw error ?? new Error('Comprehensive narrative provenance could not be persisted.');
  }
  return data;
}

/**
 * Production manual fulfilment adapter for the owner-approved Comprehensive architecture.
 *
 * The customer PDF itself is produced only by the manuscript-first chain:
 * Fact Pack -> Story Plan -> Report Blueprint -> bounded whole-manuscript generation/recovery ->
 * provenance validation -> narrative-led PDF. This adapter adds no analytical or presentation
 * logic. It only binds the resulting manuscript to the exact active manual-generation attempt and
 * exposes a small compatibility accounting surface to the shared fulfilment controller.
 */
export async function renderComprehensiveReportPdf(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
}): Promise<{
  pdf: Buffer;
  narrativeRun: Awaited<ReturnType<typeof generateComprehensiveNarrativeReport>>['narrativeRun'];
  semanticSafety: Awaited<ReturnType<typeof generateComprehensiveNarrativeReport>>['semanticSafety'];
  provenance: Awaited<ReturnType<typeof generateComprehensiveNarrativeReport>>['provenance'];
  interpretationRun: {
    accounting: {
      calls: number;
      repairs: number;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      costMicros: number | null;
    };
  };
}> {
  // Resolve the exact active attempt before provider dispatch. If the attempt identity is
  // ambiguous, fail before any paid generation occurs.
  const target = await resolveManualGenerationProvenanceTarget(input.assembled);
  const result = await generateComprehensiveNarrativeReport(input);

  // Fail closed before Storage/finalisation if the accepted manuscript cannot be durably bound to
  // this attempt. The database finalisation guard remains authoritative.
  await persistComprehensiveManuscriptProvenance({
    db: target.db,
    attemptId: target.attemptId,
    provenance: result.provenance
  });

  const resolvedModel = result.provenance.resolvedModel
    ?? result.provenance.requestedModel
    ?? 'openai/gpt-5.6-luna';

  return {
    pdf: result.pdf,
    narrativeRun: result.narrativeRun,
    semanticSafety: result.semanticSafety,
    provenance: result.provenance,
    // Compatibility only: current shared fulfilment logs these three old accounting labels. They
    // are derived from the manuscript provenance and do not select or alter the report engine.
    interpretationRun: {
      accounting: {
        calls: result.provenance.providerCalls,
        repairs: result.provenance.targetedRepairs,
        model: resolvedModel,
        inputTokens: result.provenance.usage?.input_tokens ?? null,
        outputTokens: result.provenance.usage?.output_tokens ?? null,
        totalTokens: result.provenance.usage?.total_tokens ?? null,
        costMicros: result.provenance.usage?.estimated_cost_micros ?? null
      }
    }
  };
}

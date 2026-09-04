import type { ComprehensiveNarrativeProvenance } from './narrative-generation';

function isMissingProvenanceContract(error: any) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  return ['42883', 'PGRST202'].includes(code)
    || /record_manual_report_narrative_provenance.*(?:does not exist|could not find|schema cache)/i.test(message);
}

/**
 * Durably bind the accepted Comprehensive manuscript to its generation attempt.
 *
 * The first real Preview Comprehensive package was released with `final_narrative_json` null: the
 * Comprehensive branch rendered the PDF from an in-memory manuscript and never reached the
 * provenance boundary, because that boundary was only wired for the Essential path and its
 * `persistGenerationProvenance()` sibling exits when the legacy `fulfilmentId` is null. The
 * accepted narrative was therefore unrecoverable the moment the request ended, and a provider-free
 * revision of a released report became impossible.
 *
 * This uses the same contract the Essential path already uses --
 * `record_manual_report_narrative_provenance()` writing onto `manual_report_generation_attempts` --
 * rather than introducing a second provenance model, and it deliberately does not fabricate a
 * fulfilment id to reach the older `report_generation_runs` path.
 *
 * Nothing here writes a secret or a provider credential: the payload carries the manuscript, its
 * validation outcome, the deterministic hashes it was bound to, and provider/model identifiers.
 */
export async function persistComprehensiveNarrativeProvenance(input: {
  db: any;
  manualGenerationAttemptId: string;
  provenance: ComprehensiveNarrativeProvenance;
}) {
  const { provenance } = input;
  const { data, error } = await input.db.rpc('record_manual_report_narrative_provenance', {
    p_manual_generation_attempt_id: input.manualGenerationAttemptId,
    p_provenance: {
      generation_mode: provenance.generationMode,
      // The Comprehensive evidence identity is its deterministic Fact Pack, which is exactly what
      // the manuscript was written and validated against.
      evidence_checksum: provenance.factPackSha256,
      prompt_version: provenance.promptVersion,
      schema_version: provenance.schemaVersion,
      requested_provider: provenance.requestedProvider,
      requested_model: provenance.requestedModel,
      resolved_provider: provenance.resolvedProvider,
      resolved_model: provenance.resolvedModel,
      // Comprehensive is a text-first architecture: the manuscript Markdown is the provider's
      // structured output, so it is recorded as such rather than left null.
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
    // Fail closed. A Comprehensive package must not reach REPORT_READY with its accepted
    // manuscript discarded -- that is the defect this boundary exists to prevent.
    throw error ?? new Error('Comprehensive narrative provenance could not be persisted.');
  }
  return data;
}

export { isMissingProvenanceContract };

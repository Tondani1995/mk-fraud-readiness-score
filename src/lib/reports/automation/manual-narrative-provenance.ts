import type {
  PreparedPremiumReportNarrative,
  PremiumReportAutomationFlags
} from './types';

/** Persists the final Phase 1 narrative decision without storing customer contact details. */
export async function persistManualNarrativeProvenance(input: {
  db: any;
  manualGenerationAttemptId: string;
  prepared: PreparedPremiumReportNarrative;
  flags: PremiumReportAutomationFlags;
}) {
  const selectedGeneration = input.prepared.mode === 'ai_repair'
    ? input.prepared.repairGeneration
    : input.prepared.generation;
  const usage = selectedGeneration?.usage;
  const requestedProvider = input.flags.aiNarrativeEnabled
    ? input.flags.model.split('/')[0]?.trim() || 'vercel-ai-gateway'
    : null;
  const requestedModel = input.flags.aiNarrativeEnabled ? input.flags.model : null;
  const { data, error } = await input.db.rpc('record_manual_report_narrative_provenance', {
    p_manual_generation_attempt_id: input.manualGenerationAttemptId,
    p_provenance: {
      generation_mode: input.prepared.mode,
      evidence_checksum: input.prepared.evidenceChecksum,
      prompt_version: input.flags.promptVersion,
      schema_version: input.flags.schemaVersion,
      requested_provider: requestedProvider,
      requested_model: requestedModel,
      resolved_provider: selectedGeneration?.provider ?? null,
      resolved_model: selectedGeneration?.model ?? null,
      structured_ai_output: selectedGeneration?.output ?? null,
      final_narrative: input.prepared.narrative,
      final_validation: input.prepared.validation,
      initial_validation: input.prepared.initialValidation ?? null,
      repair_validation: input.prepared.repairValidation ?? null,
      usage: usage ? {
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        total_tokens: usage.totalTokens ?? null,
        estimated_cost_micros: usage.estimatedCostMicros ?? null,
        latency_ms: selectedGeneration?.latencyMs ?? null
      } : null,
      fallback_reason: input.prepared.fallbackReason ?? null
    }
  });
  if (error || !data) throw error ?? new Error('Manual report narrative provenance could not be persisted.');
  return data;
}

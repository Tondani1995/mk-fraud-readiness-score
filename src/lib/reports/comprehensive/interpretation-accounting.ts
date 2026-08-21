import type { InterpretationAccounting } from './interpretation';

/**
 * Persist only the bounded provider-accounting envelope for a Comprehensive interpretation.
 * The database RPC intentionally receives no prompt or interpretation text, so this record remains
 * useful when a later renderer, storage upload or finalisation step fails.
 */
export async function persistComprehensiveInterpretationAccounting(input: {
  db: any;
  manualGenerationAttemptId: string;
  accounting: InterpretationAccounting;
}): Promise<void> {
  const { accounting } = input;
  const provider = accounting.model.split('/')[0]?.trim() || 'vercel-ai-gateway';
  const { error } = await input.db.rpc('record_comprehensive_interpretation_accounting', {
    p_attempt_id: input.manualGenerationAttemptId,
    p_accounting: {
      provider,
      model: accounting.model,
      calls: accounting.calls,
      repairs: accounting.repairs,
      input_tokens: accounting.inputTokens,
      output_tokens: accounting.outputTokens,
      total_tokens: accounting.totalTokens,
      cost_micros: accounting.costMicros,
      duration_ms: accounting.durationMs,
      repaired_slots: accounting.repairedSlots
    }
  });
  if (error) throw new Error('comprehensive_interpretation_accounting_persistence_failed');
}

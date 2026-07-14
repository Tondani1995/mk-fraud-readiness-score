import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS,
  PREMIUM_REPORT_AI_TIMEOUT_MS
} from './ai-sdk-generator';
import type {
  NarrativeGenerationInput,
  NarrativeGenerationResult,
  PremiumReportNarrativeGenerator
} from './types';

export const PREMIUM_REPORT_AI_MAX_ATTEMPTS = 2;
export const PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS = 250_000;
export const PREMIUM_REPORT_AI_MAX_TOTAL_TOKENS = 20_000;

type AttemptKind = 'generate' | 'repair';

function asGenerationResult(value: unknown): NarrativeGenerationResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as NarrativeGenerationResult;
  return result.output && result.provider && result.model ? result : null;
}

export function createDurablePremiumReportNarrativeGenerator(input: {
  generator: PremiumReportNarrativeGenerator;
  generationIdentity: string;
  fulfilmentId?: string | null;
}): PremiumReportNarrativeGenerator {
  const db = createSupabaseServiceClient() as any;

  async function run(kind: AttemptKind, generationInput: NarrativeGenerationInput) {
    const { data: existing, error: lookupError } = await db
      .from('report_ai_attempts')
      .select('id,status,output_json,attempt_number')
      .eq('generation_identity', input.generationIdentity)
      .eq('attempt_kind', kind)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing?.status === 'succeeded') {
      const persisted = asGenerationResult(existing.output_json);
      if (!persisted) throw new Error(`Persisted ${kind} AI output is invalid and requires reconciliation.`);
      return persisted;
    }
    if (existing && ['started', 'provider_result_uncertain', 'reconciliation_required'].includes(existing.status)) {
      throw new Error(`AI ${kind} attempt ${existing.id} has unresolved provider state; automatic replay is blocked.`);
    }

    const attemptNumber = Number(existing?.attempt_number ?? 0) + 1;
    const totalPriorAttempts = kind === 'repair' ? 1 : 0;
    if (attemptNumber + totalPriorAttempts > PREMIUM_REPORT_AI_MAX_ATTEMPTS) {
      throw new Error('Premium report AI maximum attempt limit reached.');
    }
    const providerRequestKey = `premium-report-ai:${input.generationIdentity}:${kind}:${attemptNumber}`;
    const { data: attempt, error: insertError } = await db
      .from('report_ai_attempts')
      .insert({
        generation_identity: input.generationIdentity,
        fulfilment_id: input.fulfilmentId ?? null,
        attempt_kind: kind,
        attempt_number: attemptNumber,
        provider_request_key: providerRequestKey,
        provider: input.generator.provider,
        model: input.generator.model,
        evidence_checksum: generationInput.evidenceChecksum,
        max_output_tokens: PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS,
        max_estimated_cost_micros: PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS,
        timeout_ms: PREMIUM_REPORT_AI_TIMEOUT_MS,
        status: 'started'
      })
      .select('id')
      .single();
    if (insertError || !attempt) throw insertError ?? new Error('AI attempt could not be persisted before provider dispatch.');

    try {
      const result = kind === 'generate'
        ? await input.generator.generate(generationInput)
        : await input.generator.repair(generationInput);
      const usage = result.usage;
      if ((usage?.totalTokens ?? 0) > PREMIUM_REPORT_AI_MAX_TOTAL_TOKENS) {
        throw new Error('AI provider result exceeded the configured total-token limit.');
      }
      if ((usage?.estimatedCostMicros ?? 0) > PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS) {
        throw new Error('AI provider result exceeded the configured cost limit.');
      }

      const { data: persisted, error: persistError } = await db
        .from('report_ai_attempts')
        .update({
          status: 'succeeded',
          output_json: result,
          input_token_count: usage?.inputTokens ?? null,
          output_token_count: usage?.outputTokens ?? null,
          total_token_count: usage?.totalTokens ?? null,
          estimated_cost_micros: usage?.estimatedCostMicros ?? null,
          latency_ms: result.latencyMs,
          completed_at: new Date().toISOString(),
          error_message: null
        })
        .eq('id', attempt.id)
        .eq('status', 'started')
        .select('id')
        .maybeSingle();
      if (persistError || !persisted) {
        const { error: uncertainError } = await db.from('report_ai_attempts').update({
          status: 'provider_result_uncertain',
          error_message: `Provider returned output but durable persistence failed: ${persistError?.message ?? 'compare-and-set lost'}`,
          completed_at: new Date().toISOString()
        }).eq('id', attempt.id).eq('status', 'started');
        if (uncertainError) {
          throw new Error(`AI output persistence and uncertainty recovery both failed: ${persistError?.message}; ${uncertainError.message}`);
        }
        throw new Error('AI provider output is marked uncertain and must be reconciled before any retry.');
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { error: recoveryError } = await db.from('report_ai_attempts').update({
        status: 'provider_result_uncertain',
        error_message: message,
        completed_at: new Date().toISOString()
      }).eq('id', attempt.id).eq('status', 'started');
      if (recoveryError) {
        throw new Error(`AI provider failure and durable recovery update both failed: ${message}; ${recoveryError.message}`);
      }
      throw error;
    }
  }

  return {
    provider: input.generator.provider,
    model: input.generator.model,
    generate: (generationInput) => run('generate', generationInput),
    repair: (generationInput) => run('repair', generationInput)
  };
}

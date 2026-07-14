import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requirePhase14Action } from '../phase14-security';
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
export const PREMIUM_REPORT_AI_MAX_INPUT_BYTES = 196_608;
export const PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS = 49_152;
const CONSERVATIVE_INPUT_MICROS_PER_TOKEN = 10;
const CONSERVATIVE_OUTPUT_MICROS_PER_TOKEN = 20;

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
  db?: any;
  authorizeAction?: () => Promise<unknown>;
}): PremiumReportNarrativeGenerator {
  const db = input.db ?? createSupabaseServiceClient() as any;

  async function run(kind: AttemptKind, generationInput: NarrativeGenerationInput) {
    await (input.authorizeAction
      ? input.authorizeAction()
      : requirePhase14Action('ai_narrative_generation'));
    const inputSizeBytes = Buffer.byteLength(JSON.stringify(generationInput), 'utf8');
    const estimatedInputTokens = Math.max(1, Math.ceil(inputSizeBytes / 4));
    const preDispatchEstimatedCostMicros =
      estimatedInputTokens * CONSERVATIVE_INPUT_MICROS_PER_TOKEN
      + PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS * CONSERVATIVE_OUTPUT_MICROS_PER_TOKEN;
    if (inputSizeBytes > PREMIUM_REPORT_AI_MAX_INPUT_BYTES) {
      throw new Error('Premium report AI input exceeds the pre-dispatch byte limit.');
    }
    if (estimatedInputTokens > PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS) {
      throw new Error('Premium report AI input exceeds the pre-dispatch estimated-token limit.');
    }
    if (preDispatchEstimatedCostMicros > PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS) {
      throw new Error('Premium report AI request exceeds the pre-dispatch estimated-cost limit.');
    }
    const { data: existing, error: lookupError } = await db
      .from('report_ai_attempts')
      .select('id,status,output_json,attempt_number,accounting_status')
      .eq('generation_identity', input.generationIdentity)
      .eq('evidence_checksum', generationInput.evidenceChecksum)
      .eq('requested_provider', input.generator.provider)
      .eq('requested_model', input.generator.model)
      .eq('prompt_version', generationInput.promptVersion)
      .eq('schema_version', generationInput.schemaVersion)
      .eq('attempt_kind', kind)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing?.status === 'succeeded' && existing.accounting_status === 'verified') {
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
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
      generationIdentity: input.generationIdentity,
      evidenceChecksum: generationInput.evidenceChecksum,
      provider: input.generator.provider,
      model: input.generator.model,
      promptVersion: generationInput.promptVersion,
      schemaVersion: generationInput.schemaVersion,
      kind
    })).digest('hex').slice(0, 24);
    const providerRequestKey = `premium-report-ai:${fingerprint}:${attemptNumber}`;
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
        requested_provider: input.generator.provider,
        requested_model: input.generator.model,
        evidence_checksum: generationInput.evidenceChecksum,
        prompt_version: generationInput.promptVersion,
        schema_version: generationInput.schemaVersion,
        input_size_bytes: inputSizeBytes,
        estimated_input_tokens: estimatedInputTokens,
        max_output_tokens: PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS,
        max_estimated_cost_micros: PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS,
        timeout_ms: PREMIUM_REPORT_AI_TIMEOUT_MS,
        status: 'started',
        accounting_status: 'unverified'
      })
      .select('id')
      .single();
    if (insertError || !attempt) throw insertError ?? new Error('AI attempt could not be persisted before provider dispatch.');

    let accountingStatePersisted = false;
    try {
      const result = kind === 'generate'
        ? await input.generator.generate(generationInput)
        : await input.generator.repair(generationInput);
      if (!result.provider?.trim() || !result.model?.trim()) {
        throw new Error('AI provider result did not identify its resolved provider and model.');
      }
      const usage = result.usage;
      const accountingValues = [usage?.inputTokens, usage?.outputTokens, usage?.totalTokens, usage?.estimatedCostMicros];
      if (accountingValues.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        const { error: accountingError } = await db.from('report_ai_attempts').update({
          status: 'accounting_unverified',
          accounting_status: 'unverified',
          output_json: result,
          resolved_provider: result.provider,
          resolved_model: result.model,
          input_token_count: usage?.inputTokens ?? null,
          output_token_count: usage?.outputTokens ?? null,
          total_token_count: usage?.totalTokens ?? null,
          estimated_cost_micros: usage?.estimatedCostMicros ?? null,
          latency_ms: result.latencyMs,
          completed_at: new Date().toISOString(),
          error_message: 'Provider usage or cost metadata is incomplete; AI output is prohibited from release.'
        }).eq('id', attempt.id).eq('status', 'started');
        if (accountingError) throw accountingError;
        accountingStatePersisted = true;
        throw new Error('AI accounting metadata is unverified; generated content cannot be released.');
      }
      if (usage!.totalTokens! > PREMIUM_REPORT_AI_MAX_TOTAL_TOKENS) {
        throw new Error('AI provider result exceeded the configured total-token limit.');
      }
      if (usage!.estimatedCostMicros! > PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS) {
        throw new Error('AI provider result exceeded the configured cost limit.');
      }

      const { data: persisted, error: persistError } = await db
        .from('report_ai_attempts')
        .update({
          status: 'succeeded',
          accounting_status: 'verified',
          output_json: result,
          provider: result.provider,
          model: result.model,
          resolved_provider: result.provider,
          resolved_model: result.model,
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
      if (accountingStatePersisted) throw error;
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

import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  executePhase14WorkerStep,
  loadPhase14WorkerLease,
  requirePhase14Action
} from '../phase14-security';
import {
  PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS,
  PREMIUM_REPORT_AI_TIMEOUT_MS
} from './ai-sdk-generator';
import { aiAttemptStatusForFailureClass, classifyAiProviderFailure } from './ai-failure-classification';
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
  workerCapabilityId?: string | null;
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

    // M2/M3: PREMIUM_REPORT_AI_MAX_ATTEMPTS is a COMBINED generate+repair budget, not a per-kind
    // one -- a hard-coded `kind === 'repair' ? 1 : 0` assumption here previously mispriced any
    // history with more than exactly one prior generate attempt (for example, a proven-not-
    // reached-provider generate retry followed by a repair). This is now an authoritative count of
    // every prior attempt for this exact fingerprint, any kind, matching the same cross-kind check
    // enforced atomically in public.claim_phase14_ai_attempt (migration 0029) -- this TS check
    // remains a cheap early exit; the SQL count is the real, authoritative boundary.
    const attemptNumber = Number(existing?.attempt_number ?? 0) + 1;
    // M1: a `failed_before_provider` attempt is PROVEN to have made zero real provider
    // calls (see ai-failure-classification.ts), so it must not consume the same
    // combined budget as an attempt that actually reached the provider -- otherwise
    // "automatic retry is allowed for proven pre-dispatch failures" would be
    // meaningless in practice: two configuration/validation glitches in a row would
    // silently exhaust the entire real-provider-call budget before a single real
    // attempt was ever made. Excluded here and in the matching SQL-side count inside
    // public.claim_phase14_ai_attempt (migration 0030).
    const { count: totalPriorAttempts, error: totalCountError } = await db
      .from('report_ai_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('generation_identity', input.generationIdentity)
      .eq('evidence_checksum', generationInput.evidenceChecksum)
      .eq('requested_provider', input.generator.provider)
      .eq('requested_model', input.generator.model)
      .eq('prompt_version', generationInput.promptVersion)
      .eq('schema_version', generationInput.schemaVersion)
      .neq('status', 'failed_before_provider');
    if (totalCountError) throw totalCountError;
    if ((totalPriorAttempts ?? 0) + 1 > PREMIUM_REPORT_AI_MAX_ATTEMPTS) {
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
    if (!input.workerCapabilityId || !input.fulfilmentId) {
      throw new Error('AI attempt persistence requires an opaque worker capability and fulfilment binding.');
    }
    const attemptLease = await loadPhase14WorkerLease(input.workerCapabilityId);
    let attempt: any;
    try {
      attempt = await executePhase14WorkerStep(attemptLease, 'claim_phase14_ai_attempt', {
        attempt: {
        generation_identity: input.generationIdentity,
        fulfilment_id: input.fulfilmentId,
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
        }
      });
    } catch (insertError) {
      throw insertError ?? new Error('AI attempt could not be persisted before provider dispatch.');
    }
    if (!attempt) throw new Error('AI attempt could not be persisted before provider dispatch.');

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
        let accountingError: unknown = null;
        try {
          await executePhase14WorkerStep(attemptLease, 'settle_phase14_ai_attempt', {
            attempt_id: attempt.id,
            result: {
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
            }
          });
        } catch (caught) {
          accountingError = caught;
        }
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

      let persisted: unknown = null;
      let persistError: any = null;
      try {
        persisted = await executePhase14WorkerStep(attemptLease, 'settle_phase14_ai_attempt', {
          attempt_id: attempt.id,
          result: {
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
          }
        });
      } catch (caught) {
        persistError = caught;
      }
      if (persistError || !persisted) {
        let uncertainError: any = null;
        try {
          const recoveryLease = await loadPhase14WorkerLease(input.workerCapabilityId);
          await executePhase14WorkerStep(recoveryLease, 'settle_phase14_ai_attempt', {
            attempt_id: attempt.id,
            result: { status: 'provider_result_uncertain', accounting_status: 'unverified',
              error_message: `Provider returned output but durable persistence failed: ${persistError?.message ?? 'compare-and-set lost'}` }
          });
        } catch (caught) {
          uncertainError = caught;
        }
        if (uncertainError) {
          throw new Error(`AI output persistence and uncertainty recovery both failed: ${persistError?.message}; ${uncertainError.message}`);
        }
        throw new Error('AI provider output is marked uncertain and must be reconciled before any retry.');
      }
      return result;
    } catch (error) {
      if (accountingStatePersisted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      // M1: classify BEFORE persisting. Only a failure proven (by AI SDK error class) to
      // have happened before any HTTP request was dispatched is recorded as
      // `failed_before_provider` -- the one status the top-of-run() existing-attempt
      // lookup does not block on, so the durable workflow can claim a fresh attempt on
      // its next call without any operator action. Every other failure (a genuine
      // network/timeout ambiguity, or a response we know the provider sent but could not
      // use) is recorded as `provider_result_uncertain`, which remains blocked pending
      // reconciliation -- retrying either of those automatically risks a duplicate real
      // provider call or simply repeats a certain rejection.
      const failureClass = classifyAiProviderFailure(error);
      const settledStatus = aiAttemptStatusForFailureClass(failureClass);
      const classifiedMessage = `[${failureClass}] ${message}`;
      let recoveryError: any = null;
      try {
        const recoveryLease = await loadPhase14WorkerLease(input.workerCapabilityId);
        await executePhase14WorkerStep(recoveryLease, 'settle_phase14_ai_attempt', {
          attempt_id: attempt.id,
          result: { status: settledStatus, accounting_status: 'unverified', error_message: classifiedMessage }
        });
      } catch (caught) {
        recoveryError = caught;
      }
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

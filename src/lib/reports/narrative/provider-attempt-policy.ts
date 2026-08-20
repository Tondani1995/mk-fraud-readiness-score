import {
  MAX_FALLBACK_ATTEMPTS_PER_STAGE,
  MAX_MINI_ATTEMPTS_PER_STAGE,
  MAX_PROVIDER_ATTEMPTS_PER_STAGE,
  NARRATIVE_MODEL_CHAIN,
  PRIMARY_NARRATIVE_MODEL,
  type NarrativeFallbackReason,
  type NarrativeModelSelection
} from '../ai-model-policy';

export type NarrativeLogicalStage = 'manuscript' | 'semantic_review';

export type NarrativeFailureClassification =
  | 'retryable_technical'
  | 'fallback_technical'
  | 'non_retryable';

export interface NarrativeProviderFailure {
  classification: NarrativeFailureClassification;
  code: string;
  retryable: boolean;
  fallbackEligible: boolean;
  fallbackReason?: NarrativeFallbackReason;
}

export interface NarrativeProviderAttemptContext {
  logicalStage: NarrativeLogicalStage;
  attempt: number;
  modelAttempt: number;
  model: string;
  provider: string;
  primaryOrFallback: 'primary' | 'fallback';
  /** Per-attempt application-owned output ceiling, when a stage uses progressive budgeting. */
  maxOutputTokens?: number;
  miniAttempt?: number;
  fallbackIndex?: number;
  retryReason?: string;
  fallbackReason?: string;
}

export interface NarrativeProviderAttemptRecord extends NarrativeProviderAttemptContext {
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  generationId?: string;
  responseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  visibleOutputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  finishReason?: string;
  providerFinishReason?: string;
  /** False when the application budget stopped dispatch before the SDK was called. */
  providerRequestDispatched?: boolean;
  success: boolean;
  failureClassification?: NarrativeFailureClassification;
  failureCode?: string;
  /** Safe deterministic manuscript-output diagnostics; never the rejected paragraph. */
  conformanceFailureCode?: string;
  conformancePath?: string;
  structuralErrorCodes?: string[];
  conformancePatternFamily?: string;
  conformancePatternHash?: string;
}

export interface NarrativeProviderStageAccounting {
  logicalStage: NarrativeLogicalStage;
  attemptRecords: NarrativeProviderAttemptRecord[];
  totalMiniAttempts: number;
  totalFallbackAttempts: number;
  totalPhysicalProviderRequests: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  visibleOutputTokens?: number;
  totalTokens?: number;
  costMicros: number;
}

export interface NarrativeProviderAttemptResult<T> {
  value: T;
  response?: unknown;
  provider: string;
  model: string;
  accounting: NarrativeProviderStageAccounting;
}

export interface NarrativeProviderAttemptExecution<T> {
  value: T;
  response?: unknown;
}

export interface NarrativeProviderAttemptRunnerInput<T> {
  logicalStage: NarrativeLogicalStage;
  modelSelection: NarrativeModelSelection;
  execute: (context: NarrativeProviderAttemptContext) => Promise<NarrativeProviderAttemptExecution<T>>;
  classifyFailure: (error: unknown, context: NarrativeProviderAttemptContext) => NarrativeProviderFailure;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boundedStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim().slice(0, 100)))].slice(0, 12);
  return values.length ? values : undefined;
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export interface NarrativeProviderTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  visibleOutputTokens?: number;
  totalTokens?: number;
}

/**
 * AI SDK exposes reasoning separately when the provider reports outputTokenDetails. Some
 * gateway/provider responses only expose the raw OpenAI-style completion-token details, so the
 * extractor accepts both shapes. It never returns or logs reasoning content itself.
 */
export function extractNarrativeTokenUsage(response: unknown): NarrativeProviderTokenUsage {
  const responseRecord = recordValue(response);
  const usage = recordValue(responseRecord?.usage);
  const outputTokenDetails = recordValue(usage?.outputTokenDetails);
  const rawUsage = recordValue(usage?.raw);
  const rawOutputTokenDetails = recordValue(rawUsage?.completion_tokens_details)
    ?? recordValue(rawUsage?.completionTokensDetails)
    ?? recordValue(rawUsage?.output_token_details)
    ?? recordValue(rawUsage?.outputTokenDetails);
  const providerMetadata = recordValue(responseRecord?.providerMetadata);
  const openaiMetadata = recordValue(providerMetadata?.openai);
  const providerUsage = recordValue(openaiMetadata?.usage);
  const providerOutputTokenDetails = recordValue(providerUsage?.completion_tokens_details)
    ?? recordValue(providerUsage?.completionTokensDetails)
    ?? recordValue(providerUsage?.output_token_details)
    ?? recordValue(providerUsage?.outputTokenDetails);
  const outputTokens = numeric(usage?.outputTokens) ?? numeric(providerUsage?.completion_tokens);
  const reasoningTokens = numeric(outputTokenDetails?.reasoningTokens)
    ?? numeric(usage?.reasoningTokens)
    ?? numeric(rawOutputTokenDetails?.reasoning_tokens)
    ?? numeric(rawOutputTokenDetails?.reasoningTokens)
    ?? numeric(providerOutputTokenDetails?.reasoning_tokens)
    ?? numeric(providerOutputTokenDetails?.reasoningTokens);
  const explicitVisibleOutputTokens = numeric(outputTokenDetails?.textTokens)
    ?? numeric(outputTokenDetails?.visibleOutputTokens)
    ?? numeric(rawOutputTokenDetails?.text_tokens)
    ?? numeric(rawOutputTokenDetails?.textTokens)
    ?? numeric(rawOutputTokenDetails?.visible_output_tokens)
    ?? numeric(rawOutputTokenDetails?.visibleOutputTokens)
    ?? numeric(providerOutputTokenDetails?.text_tokens)
    ?? numeric(providerOutputTokenDetails?.textTokens)
    ?? numeric(providerOutputTokenDetails?.visible_output_tokens)
    ?? numeric(providerOutputTokenDetails?.visibleOutputTokens);
  const visibleOutputTokens = explicitVisibleOutputTokens
    ?? (outputTokens !== undefined && reasoningTokens !== undefined
      ? Math.max(0, outputTokens - reasoningTokens)
      : undefined);
  return {
    inputTokens: numeric(usage?.inputTokens),
    outputTokens,
    reasoningTokens,
    visibleOutputTokens,
    totalTokens: numeric(usage?.totalTokens)
  };
}

function responseMetadata(response: unknown): Pick<NarrativeProviderAttemptRecord, 'generationId' | 'responseId' | 'inputTokens' | 'outputTokens' | 'reasoningTokens' | 'visibleOutputTokens' | 'totalTokens' | 'providerCostMicros' | 'finishReason' | 'providerFinishReason'> {
  const responseRecord = recordValue(response);
  const tokenUsage = extractNarrativeTokenUsage(response);
  const gateway = recordValue(recordValue(responseRecord?.providerMetadata)?.gateway);
  const providerResponse = recordValue(responseRecord?.response);
  const providerBody = recordValue(providerResponse?.body);
  const choices = Array.isArray(providerBody?.choices) ? providerBody.choices : [];
  const firstChoice = recordValue(choices[0]);
  const rawCost = gateway?.cost;
  const cost = typeof rawCost === 'number' ? rawCost : typeof rawCost === 'string' ? Number(rawCost) : NaN;
  return {
    generationId: textValue(gateway?.generationId),
    responseId: textValue(providerResponse?.id) ?? textValue(responseRecord?.id),
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    reasoningTokens: tokenUsage.reasoningTokens,
    visibleOutputTokens: tokenUsage.visibleOutputTokens,
    totalTokens: tokenUsage.totalTokens,
    providerCostMicros: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 1_000_000) : undefined,
    finishReason: textValue(responseRecord?.finishReason) ?? textValue(providerResponse?.finishReason),
    providerFinishReason: textValue(gateway?.finishReason)
      ?? textValue(recordValue(responseRecord?.providerMetadata)?.openai && recordValue(recordValue(responseRecord?.providerMetadata)?.openai)?.finishReason)
      ?? textValue(firstChoice?.finish_reason)
      ?? textValue(recordValue(providerResponse?.headers)?.['x-provider-finish-reason'])
  };
}

function conformanceMetadata(error: unknown): Pick<NarrativeProviderAttemptRecord, 'conformanceFailureCode' | 'conformancePath' | 'structuralErrorCodes' | 'conformancePatternFamily' | 'conformancePatternHash'> {
  const failure = recordValue(recordValue(error)?.narrativeConformanceFailure);
  if (!failure) return {};
  const patternHash = textValue(failure.conformancePatternHash);
  return {
    conformanceFailureCode: textValue(failure.conformanceFailureCode),
    conformancePath: textValue(failure.conformancePath),
    structuralErrorCodes: boundedStringList(failure.structuralErrorCodes),
    conformancePatternFamily: textValue(failure.conformancePatternFamily),
    conformancePatternHash: patternHash && /^[a-f0-9]{8,64}$/i.test(patternHash) ? patternHash : undefined
  };
}

function providerFromModel(model: string): string {
  return model.split('/')[0]?.trim() || 'vercel-ai-gateway';
}

function modelSequence(selection: NarrativeModelSelection): string[] {
  const start = NARRATIVE_MODEL_CHAIN.indexOf(selection.requestedModel as typeof NARRATIVE_MODEL_CHAIN[number]);
  if (start < 0) return [PRIMARY_NARRATIVE_MODEL, ...selection.fallbackModels];
  return [...NARRATIVE_MODEL_CHAIN.slice(start)];
}

function stageAccounting(logicalStage: NarrativeLogicalStage, records: NarrativeProviderAttemptRecord[]): NarrativeProviderStageAccounting {
  const sum = (field: 'inputTokens' | 'outputTokens' | 'reasoningTokens' | 'visibleOutputTokens' | 'totalTokens'): number | undefined => {
    const values = records.map((record) => record[field]).filter((value): value is number => value !== undefined);
    return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
  };
  const physicalRecords = records.filter((record) => record.providerRequestDispatched !== false);
  return {
    logicalStage,
    attemptRecords: records.map((record) => ({ ...record })),
    totalMiniAttempts: physicalRecords.filter((record) => record.model === PRIMARY_NARRATIVE_MODEL).length,
    totalFallbackAttempts: physicalRecords.filter((record) => record.model !== PRIMARY_NARRATIVE_MODEL).length,
    totalPhysicalProviderRequests: physicalRecords.length,
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    reasoningTokens: sum('reasoningTokens'),
    visibleOutputTokens: sum('visibleOutputTokens'),
    totalTokens: sum('totalTokens'),
    costMicros: records.reduce((total, record) => total + (record.providerCostMicros ?? 0), 0)
  };
}

function attachAccounting(error: unknown, accounting: NarrativeProviderStageAccounting): void {
  if (error && typeof error === 'object') {
    (error as { narrativeAttemptAccounting?: NarrativeProviderStageAccounting }).narrativeAttemptAccounting = accounting;
  }
}

/**
 * Runs one logical AI stage with application-owned retry/fallback accounting. The callback must
 * make exactly one SDK request; SDK-level retries are disabled by the caller with maxRetries: 0.
 */
export async function runNarrativeProviderAttempts<T>(input: NarrativeProviderAttemptRunnerInput<T>): Promise<NarrativeProviderAttemptResult<T>> {
  const models = modelSequence(input.modelSelection);
  const records: NarrativeProviderAttemptRecord[] = [];
  let globalAttempt = 0;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]!;
    const isMini = model === PRIMARY_NARRATIVE_MODEL;
    const maxAttemptsForModel = isMini ? MAX_MINI_ATTEMPTS_PER_STAGE : 1;
    let modelAttempt = 0;
    let retryReason: string | undefined;
    let fallbackReason: string | undefined;

    while (modelAttempt < maxAttemptsForModel) {
      modelAttempt += 1;
      globalAttempt += 1;
      if (globalAttempt > MAX_PROVIDER_ATTEMPTS_PER_STAGE) {
        const error = new Error('narrative_provider_attempt_budget_exhausted');
        const accounting = stageAccounting(input.logicalStage, records);
        attachAccounting(error, accounting);
        throw error;
      }
      const context: NarrativeProviderAttemptContext = {
        logicalStage: input.logicalStage,
        attempt: globalAttempt,
        modelAttempt,
        model,
        provider: providerFromModel(model),
        primaryOrFallback: isMini ? 'primary' : 'fallback',
        ...(isMini ? { miniAttempt: modelAttempt } : { fallbackIndex: modelIndex }),
        ...(retryReason ? { retryReason } : {}),
        ...(fallbackReason ? { fallbackReason } : {})
      };
      const startedAtMs = Date.now();
      try {
        const result = await input.execute(context);
        const endedAtMs = Date.now();
        const record: NarrativeProviderAttemptRecord = {
          ...context,
          startedAt: new Date(startedAtMs).toISOString(),
          endedAt: new Date(endedAtMs).toISOString(),
          elapsedMs: Math.max(0, endedAtMs - startedAtMs),
          ...responseMetadata(result.response),
          providerRequestDispatched: true,
          success: true
        };
        records.push(record);
        return {
          value: result.value,
          response: result.response,
          provider: context.provider,
          model,
          accounting: stageAccounting(input.logicalStage, records)
        };
      } catch (error) {
        const response = recordValue(error)?.providerResponse;
        const endedAtMs = Date.now();
        const failure = input.classifyFailure(error, context);
        records.push({
          ...context,
          startedAt: new Date(startedAtMs).toISOString(),
          endedAt: new Date(endedAtMs).toISOString(),
          elapsedMs: Math.max(0, endedAtMs - startedAtMs),
          ...responseMetadata(response),
          ...conformanceMetadata(error),
          providerRequestDispatched: recordValue(error)?.narrativeProviderRequestDispatched === false ? false : true,
          success: false,
          failureClassification: failure.classification,
          failureCode: failure.code
        });
        const accounting = stageAccounting(input.logicalStage, records);
        if (failure.classification === 'non_retryable') {
          attachAccounting(error, accounting);
          throw error;
        }
        if (isMini && failure.retryable && modelAttempt < maxAttemptsForModel) {
          retryReason = failure.code;
          fallbackReason = undefined;
          continue;
        }
        const nextModel = models[modelIndex + 1];
        if (failure.fallbackEligible && nextModel) {
          fallbackReason = failure.fallbackReason ?? failure.code;
          retryReason = undefined;
          break;
        }
        attachAccounting(error, accounting);
        throw error;
      }
    }
  }

  const error = new Error('narrative_provider_attempts_exhausted');
  attachAccounting(error, stageAccounting(input.logicalStage, records));
  throw error;
}

export function getNarrativeAttemptAccounting(error: unknown): NarrativeProviderStageAccounting | undefined {
  return recordValue(error)?.narrativeAttemptAccounting as NarrativeProviderStageAccounting | undefined;
}

export function narrativeProviderAttemptLimits(): { miniAttempts: number; fallbackAttempts: number; maxPhysicalRequests: number } {
  return {
    miniAttempts: MAX_MINI_ATTEMPTS_PER_STAGE,
    fallbackAttempts: MAX_FALLBACK_ATTEMPTS_PER_STAGE,
    maxPhysicalRequests: MAX_PROVIDER_ATTEMPTS_PER_STAGE
  };
}

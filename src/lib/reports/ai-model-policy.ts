export const PRIMARY_NARRATIVE_MODEL = 'openai/gpt-5-mini' as const;
export const NARRATIVE_FALLBACK_MODELS = Object.freeze([
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-sol'
] as const);
export const NARRATIVE_MODEL_CHAIN = Object.freeze([
  PRIMARY_NARRATIVE_MODEL,
  ...NARRATIVE_FALLBACK_MODELS
] as const);
export const MAX_MINI_ATTEMPTS_PER_STAGE = 4 as const;
export const MAX_FALLBACK_ATTEMPTS_PER_STAGE = NARRATIVE_FALLBACK_MODELS.length;
export const MAX_PROVIDER_ATTEMPTS_PER_STAGE = MAX_MINI_ATTEMPTS_PER_STAGE + MAX_FALLBACK_ATTEMPTS_PER_STAGE;
export const SNAPSHOT_PRIMARY_MODEL = PRIMARY_NARRATIVE_MODEL;
export const SNAPSHOT_MAX_SUCCESSFUL_GENERATIONS = 1 as const;
export const SNAPSHOT_TECHNICAL_FALLBACK = NARRATIVE_FALLBACK_MODELS;
export const COMPREHENSIVE_PRIMARY_MODEL = 'openai/gpt-5.6-luna' as const;

export interface ComprehensiveModelSelection {
  requestedModel: string;
  primaryModel: typeof COMPREHENSIVE_PRIMARY_MODEL;
  overrideUsed: boolean;
  selectionSource: 'compiled_primary' | 'approved_override' | 'invalid_override_compiled_primary';
  configuredOverride?: string;
  overrideRejectedReason?: 'unsupported_model';
}

export type NarrativeModel = typeof PRIMARY_NARRATIVE_MODEL | typeof NARRATIVE_FALLBACK_MODELS[number] | (string & {});

export interface NarrativeModelSelection {
  requestedModel: string;
  primaryModel: typeof PRIMARY_NARRATIVE_MODEL;
  fallbackModels: readonly string[];
  overrideUsed: boolean;
  selectionSource: 'compiled_primary' | 'database_override' | 'environment_override' | 'invalid_override_compiled_primary';
  configuredOverride?: string;
  overrideRejectedReason?: 'unsupported_model';
}

export interface SnapshotModelSelection {
  requestedModel: typeof SNAPSHOT_PRIMARY_MODEL;
  primaryModel: typeof SNAPSHOT_PRIMARY_MODEL;
  fallbackModels: typeof NARRATIVE_FALLBACK_MODELS;
  maxSuccessfulGenerations: typeof SNAPSHOT_MAX_SUCCESSFUL_GENERATIONS;
}

export function selectSnapshotModel(): SnapshotModelSelection {
  return {
    requestedModel: SNAPSHOT_PRIMARY_MODEL,
    primaryModel: SNAPSHOT_PRIMARY_MODEL,
    fallbackModels: NARRATIVE_FALLBACK_MODELS,
    maxSuccessfulGenerations: SNAPSHOT_MAX_SUCCESSFUL_GENERATIONS
  };
}

/** Comprehensive has an explicit Luna primary; only the approved technical fallback chain may override it. */
export function selectComprehensiveModel(requestedModel?: unknown): ComprehensiveModelSelection {
  const configuredOverride = optionalModelText(requestedModel);
  const approvedOverride = configuredOverride && NARRATIVE_FALLBACK_MODELS.includes(configuredOverride as typeof NARRATIVE_FALLBACK_MODELS[number]);
  if (approvedOverride) {
    return {
      requestedModel: configuredOverride,
      primaryModel: COMPREHENSIVE_PRIMARY_MODEL,
      overrideUsed: true,
      selectionSource: 'approved_override',
      configuredOverride
    };
  }
  return {
    requestedModel: COMPREHENSIVE_PRIMARY_MODEL,
    primaryModel: COMPREHENSIVE_PRIMARY_MODEL,
    overrideUsed: false,
    selectionSource: configuredOverride ? 'invalid_override_compiled_primary' : 'compiled_primary',
    ...(configuredOverride ? { configuredOverride, overrideRejectedReason: 'unsupported_model' as const } : {})
  };
}

export function selectNarrativeModel(environment: NodeJS.ProcessEnv = process.env): NarrativeModelSelection {
  return selectNarrativeModelWithDatabaseOverride(environment);
}

/**
 * Essential model precedence is explicit and closed:
 *
 *   database premium_report_ai_model > MK_REPORT_AI_MODEL > compiled Mini
 *
 * A configured value is an explicit operator override only when it is one of the approved
 * Mini/Luna/Terra/Sol models. Unsupported values, including stale model names such as
 * openai/gpt-5.5, cannot silently widen the provider policy and resolve to compiled Mini with a
 * safe diagnostic. The caller may log the diagnostic, but customer prose never contains it.
 */
export function selectNarrativeModelWithDatabaseOverride(
  environment: NodeJS.ProcessEnv = process.env,
  options: { databaseModel?: unknown } = {}
): NarrativeModelSelection {
  const databaseOverride = optionalModelText(options.databaseModel);
  const environmentOverride = optionalModelText(environment.MK_REPORT_AI_MODEL);
  const configuredOverride = databaseOverride ?? environmentOverride;
  const selectionSource = databaseOverride
    ? 'database_override'
    : environmentOverride
      ? 'environment_override'
      : 'compiled_primary';
  const supported = configuredOverride ? isApprovedNarrativeModel(configuredOverride) : false;
  const requestedModel = supported ? configuredOverride! : PRIMARY_NARRATIVE_MODEL;
  return {
    requestedModel,
    primaryModel: PRIMARY_NARRATIVE_MODEL,
    fallbackModels: NARRATIVE_FALLBACK_MODELS,
    overrideUsed: supported,
    selectionSource: configuredOverride && !supported ? 'invalid_override_compiled_primary' : selectionSource,
    ...(configuredOverride ? { configuredOverride } : {}),
    ...(configuredOverride && !supported ? { overrideRejectedReason: 'unsupported_model' as const } : {})
  };
}

/** Resolve a model already selected by a caller without re-reading ambient environment state. */
export function selectNarrativeModelForRequestedModel(requestedModel: string): NarrativeModelSelection {
  const normalized = optionalModelText(requestedModel);
  if (!normalized || !isApprovedNarrativeModel(normalized)) {
    return {
      requestedModel: PRIMARY_NARRATIVE_MODEL,
      primaryModel: PRIMARY_NARRATIVE_MODEL,
      fallbackModels: NARRATIVE_FALLBACK_MODELS,
      overrideUsed: false,
      selectionSource: normalized ? 'invalid_override_compiled_primary' : 'compiled_primary',
      ...(normalized ? { configuredOverride: normalized, overrideRejectedReason: 'unsupported_model' as const } : {})
    };
  }
  return {
    requestedModel: normalized,
    primaryModel: PRIMARY_NARRATIVE_MODEL,
    fallbackModels: NARRATIVE_FALLBACK_MODELS,
    overrideUsed: normalized !== PRIMARY_NARRATIVE_MODEL,
    selectionSource: normalized === PRIMARY_NARRATIVE_MODEL ? 'compiled_primary' : 'environment_override',
    ...(normalized !== PRIMARY_NARRATIVE_MODEL ? { configuredOverride: normalized } : {})
  };
}

export function isApprovedNarrativeModel(model: string): model is typeof NARRATIVE_MODEL_CHAIN[number] {
  return (NARRATIVE_MODEL_CHAIN as readonly string[]).includes(model);
}

function optionalModelText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export type NarrativeFallbackReason = 'model_unavailable' | 'provider_outage' | 'capability_incompatibility' | 'model_transport_failure';

export interface NarrativeFallbackMetadata {
  fallbackUsed: boolean;
  fallbackFrom?: string;
  fallbackTo?: string;
  fallbackReason?: NarrativeFallbackReason;
}

export function assertTechnicalFallback(input: NarrativeFallbackMetadata): void {
  if (!input.fallbackUsed) return;
  if (!input.fallbackFrom || !input.fallbackTo || !input.fallbackReason) throw new Error('Technical model fallback metadata requires from, to and reason.');
  if (isQualityFailureFallbackReason(input.fallbackReason)) throw new Error('Quality or editorial failures cannot trigger model fallback.');
  const chain: readonly string[] = NARRATIVE_MODEL_CHAIN;
  const fromIndex = chain.indexOf(input.fallbackFrom);
  const toIndex = chain.indexOf(input.fallbackTo);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) throw new Error('Model fallback must follow the exact Mini, Luna, Terra, Sol order.');
}

export function isQualityFailureFallbackReason(reason: string): boolean {
  return /raw.?id|assurance|number|provenance|editorial|generic|quality|validation/i.test(reason);
}

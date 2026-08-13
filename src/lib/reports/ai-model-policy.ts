export const PRIMARY_NARRATIVE_MODEL = 'openai/gpt-5-mini' as const;
export const NARRATIVE_FALLBACK_MODELS = Object.freeze([
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-sol'
] as const);
export const SNAPSHOT_PRIMARY_MODEL = PRIMARY_NARRATIVE_MODEL;
export const SNAPSHOT_MAX_SUCCESSFUL_GENERATIONS = 1 as const;
export const SNAPSHOT_TECHNICAL_FALLBACK = NARRATIVE_FALLBACK_MODELS;

export type NarrativeModel = typeof PRIMARY_NARRATIVE_MODEL | typeof NARRATIVE_FALLBACK_MODELS[number] | (string & {});

export interface NarrativeModelSelection {
  requestedModel: string;
  primaryModel: typeof PRIMARY_NARRATIVE_MODEL;
  fallbackModels: readonly string[];
  overrideUsed: boolean;
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

export function selectNarrativeModel(environment: NodeJS.ProcessEnv = process.env): NarrativeModelSelection {
  const override = environment.MK_REPORT_AI_MODEL?.trim();
  return {
    requestedModel: override || PRIMARY_NARRATIVE_MODEL,
    primaryModel: PRIMARY_NARRATIVE_MODEL,
    fallbackModels: NARRATIVE_FALLBACK_MODELS,
    overrideUsed: Boolean(override)
  };
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
  const chain: readonly string[] = [PRIMARY_NARRATIVE_MODEL, ...NARRATIVE_FALLBACK_MODELS];
  const fromIndex = chain.indexOf(input.fallbackFrom);
  const toIndex = chain.indexOf(input.fallbackTo);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) throw new Error('Model fallback must follow the exact Mini, Luna, Terra, Sol order.');
}

export function isQualityFailureFallbackReason(reason: string): boolean {
  return /raw.?id|assurance|number|provenance|editorial|generic|quality|validation/i.test(reason);
}

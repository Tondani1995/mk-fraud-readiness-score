import type { AiTimeoutDiagnostic } from './ai-failure-classification';

export const PREMIUM_REPORT_ROUTE_MAX_DURATION_SECONDS = 300;
export const PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS = 30_000;

export type PremiumReportPhase =
  | 'route_received'
  | 'admin_authenticated'
  | 'generation_attempt_claimed'
  | 'evidence_assembled'
  | 'ai_route_authorised'
  | 'ai_budget_evaluated'
  | 'provider_dispatch_started'
  | 'provider_response_received'
  | 'gateway_identity_validated'
  | 'accounting_persisted'
  | 'narrative_validation_started'
  | 'narrative_validation_completed'
  | 'repair_started'
  | 'repair_completed'
  | 'pdf_rendering_started'
  | 'pdf_rendering_completed'
  | 'storage_publication_started'
  | 'storage_publication_completed'
  | 'report_finalised'
  | 'delivery_authorised'
  | 'request_completed';

export type PremiumReportPhaseStatus = 'started' | 'completed' | 'failed';

export interface PremiumReportAiBudgetDiagnostics {
  inputSizeBytes: number;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostMicros: number;
  limits: {
    maxInputBytes: number;
    maxEstimatedInputTokens: number;
    maxTotalTokens: number;
    maxEstimatedCostMicros: number;
  };
  reason: 'pre_dispatch_input_bytes_exceeded' | 'pre_dispatch_input_tokens_exceeded' | 'pre_dispatch_total_tokens_exceeded' | 'pre_dispatch_estimated_cost_exceeded' | null;
}

export function logPremiumReportPhase(input: {
  phase: PremiumReportPhase;
  status: PremiumReportPhaseStatus;
  startedAt: number;
  technicalReference?: string | null;
  generationAttemptId?: string | null;
  reportReference?: string | null;
  provider?: string | null;
  model?: string | null;
  requestedModel?: string | null;
  modelSelectionSource?: string | null;
  configuredModelOverride?: string | null;
  modelOverrideRejected?: string | null;
  gatewayGenerationId?: string | null;
  timeoutDiagnostic?: AiTimeoutDiagnostic | null;
  aiBudgetDiagnostics?: PremiumReportAiBudgetDiagnostics | null;
}) {
  console.info('phase14_report_generation_timing', {
    phase: input.phase,
    status: input.status,
    elapsedMs: Math.max(0, Date.now() - input.startedAt),
    technicalReference: input.technicalReference ?? null,
    generationAttemptId: input.generationAttemptId ?? null,
    reportReference: input.reportReference ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    requestedModel: input.requestedModel ?? null,
    modelSelectionSource: input.modelSelectionSource ?? null,
    configuredModelOverride: input.configuredModelOverride ?? null,
    modelOverrideRejected: input.modelOverrideRejected ?? null,
    gatewayGenerationId: input.gatewayGenerationId ?? null,
    timeoutDiagnostic: input.timeoutDiagnostic ?? null,
    aiBudgetDiagnostics: input.aiBudgetDiagnostics ?? null
  });
}

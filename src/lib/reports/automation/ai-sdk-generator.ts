import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai';
import { z } from 'zod';
import {
  buildPremiumReportGenerationPrompt,
  buildPremiumReportRepairPrompt,
  PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS
} from './prompt';
import type {
  NarrativeGenerationInput,
  NarrativeGenerationResult,
  PremiumReportAiEditorialPlan,
  PremiumReportNarrativeGenerator
} from './types';
import { parseAiGatewayExecutionIdentity } from './ai-gateway-identity';
import { classifyTimeoutDiagnostic } from './ai-failure-classification';
import {
  makeStructuredOutputDiagnostics,
  StructuredOutputGenerationError
} from './structured-output-diagnostics';
import {
  logPremiumReportPhase,
  PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS
} from './phase-timing';

import { PREMIUM_REPORT_AI_BODY_MAX_CHARS } from './types';
import crypto from 'node:crypto';

const evidenceRefs = z.array(z.string().min(1)).min(1);
const narrativeBody = z.string().min(1).max(PREMIUM_REPORT_AI_BODY_MAX_CHARS);
export const PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS = 5000;
export const PREMIUM_REPORT_AI_TIMEOUT_MS = 240_000;
export { PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS };

export const premiumReportNarrativeSchema = z.object({
  executiveEvidenceRefs: evidenceRefs,
  executiveBody: narrativeBody,
  falseComfortEvidenceRefs: evidenceRefs,
  falseComfortBody: narrativeBody,
  leadershipEvidenceRefs: evidenceRefs,
  leadershipBody: narrativeBody,
  domainEvidence: z.array(z.object({
    domainCode: z.string().min(1),
    evidenceRefs,
    body: narrativeBody
  }).strict()),
  gapEvidence: z.array(z.object({
    questionCode: z.string().min(1),
    evidenceRefs,
    body: narrativeBody
  }).strict())
}).strict();

function providerFromModel(model: string) {
  const provider = model.split('/')[0]?.trim();
  return provider || 'vercel-ai-gateway';
}

async function runStructuredGeneration(input: {
  model: string;
  prompt: string;
}): Promise<NarrativeGenerationResult> {
  const startedAt = Date.now();
  const requestedProvider = providerFromModel(input.model);
  logPremiumReportPhase({ phase: 'provider_dispatch_started', status: 'started', startedAt, provider: requestedProvider, model: input.model });
  let result;
  try {
    result = await generateText({
      model: input.model,
      system: PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS,
      prompt: input.prompt,
      output: Output.object({
        schema: premiumReportNarrativeSchema,
        name: 'mk_essential_report_v4_advisory_editor',
        description: 'Controlled customer-facing narrative bodies with section-scoped deterministic evidence references. Titles, scores, findings, controls, decisions, owners and roadmap actions are excluded.'
      }),
      maxOutputTokens: PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      providerOptions: {
        gateway: { only: [requestedProvider] }
      },
      abortSignal: AbortSignal.timeout(PREMIUM_REPORT_AI_TIMEOUT_MS)
    });
  } catch (error) {
    logPremiumReportPhase({
      phase: 'provider_response_received',
      status: 'failed',
      startedAt,
      provider: requestedProvider,
      model: input.model,
      timeoutDiagnostic: classifyTimeoutDiagnostic(error)
    });
    // Some ai 6.0.83 paths throw the structured-output error from generateText itself
    // instead of returning a result whose output getter throws. Preserve the same safe
    // response/usage/finish evidence in that path as well.
    if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
      const response = NoObjectGeneratedError.isInstance(error) ? error.response : undefined;
      const usage = NoObjectGeneratedError.isInstance(error) ? error.usage : undefined;
      const finishReason = NoObjectGeneratedError.isInstance(error) ? error.finishReason : undefined;
      throw new StructuredOutputGenerationError({
        diagnostics: makeStructuredOutputDiagnostics({
          error,
          response,
          finishReason,
          rawFinishReason: finishReason
        }),
        provider: requestedProvider,
        model: input.model,
        usage,
        latencyMs: Date.now() - startedAt
      });
    }
    throw error;
  }
  logPremiumReportPhase({ phase: 'provider_response_received', status: 'completed', startedAt, provider: requestedProvider, model: input.model });

  // Capture every safe response field before touching result.output. In ai 6.0.83 the
  // output getter can throw a new bare NoOutputGeneratedError, while NoObjectGeneratedError
  // carries the useful response/usage/finish metadata on the original failure.
  const response = result.response;
  const providerMetadata = result.providerMetadata;
  const usage = result.usage;
  const finishReason = result.finishReason;
  const rawFinishReason = result.rawFinishReason;
  let parsedIdentity: ReturnType<typeof parseAiGatewayExecutionIdentity> | null = null;
  let gatewayIdentityError: string | undefined;
  try {
    parsedIdentity = parseAiGatewayExecutionIdentity({
      requestedProvider,
      requestedModel: input.model,
      providerMetadata,
      response
    });
  } catch (error) {
    gatewayIdentityError = error instanceof Error ? error.name : 'identity_verification_failed';
  }
  const resolvedProvider = parsedIdentity?.identity.finalProvider
    ?? parsedIdentity?.identity.resolvedProvider
    ?? requestedProvider;
  const resolvedModel = parsedIdentity?.identity.resolvedProviderApiModelId
    ?? (typeof response?.modelId === 'string' ? response.modelId : input.model);
  const usageSnapshot = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostMicros: parsedIdentity?.gatewayCostMicros
  };
  if (!parsedIdentity) {
    logPremiumReportPhase({
      phase: 'gateway_identity_validated',
      status: 'failed',
      startedAt,
      provider: resolvedProvider,
      model: resolvedModel,
      timeoutDiagnostic: null
    });
  }
  let output: PremiumReportAiEditorialPlan;
  try {
    output = result.output as PremiumReportAiEditorialPlan;
  } catch (error) {
    const diagnostics = makeStructuredOutputDiagnostics({
      error,
      response,
      providerMetadata,
      finishReason,
      rawFinishReason,
      gatewayIdentityError
    });
    throw new StructuredOutputGenerationError({
      diagnostics,
      provider: resolvedProvider,
      model: resolvedModel,
      usage: usageSnapshot,
      gateway: parsedIdentity?.identity,
      gatewayCostMicros: parsedIdentity?.gatewayCostMicros,
      latencyMs: Date.now() - startedAt
    });
  }
  if (!parsedIdentity) {
    throw new StructuredOutputGenerationError({
      diagnostics: makeStructuredOutputDiagnostics({
        error: new Error('AI Gateway identity was not verifiable after structured output.'),
        response,
        providerMetadata,
        finishReason,
        rawFinishReason,
        gatewayIdentityError
      }),
      provider: resolvedProvider,
      model: resolvedModel,
      usage: usageSnapshot,
      latencyMs: Date.now() - startedAt
    });
  }
  logPremiumReportPhase({
    phase: 'gateway_identity_validated',
    status: 'completed',
    startedAt,
    provider: parsedIdentity.identity.finalProvider,
    model: parsedIdentity.identity.resolvedProviderApiModelId,
    gatewayGenerationId: parsedIdentity.identity.generationId
  });
  return {
    output,
    provider: resolvedProvider,
    model: resolvedModel,
    latencyMs: Date.now() - startedAt,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostMicros: parsedIdentity.gatewayCostMicros
    },
    gateway: parsedIdentity.identity,
    responseId: typeof response?.id === 'string' ? response.id : undefined,
    finishReason: typeof finishReason === 'string' ? finishReason : undefined,
    rawFinishReason: typeof rawFinishReason === 'string' ? rawFinishReason : undefined,
    rawOutputLength: typeof result.text === 'string' ? result.text.length : undefined,
    rawOutputSha256: typeof result.text === 'string'
      ? crypto.createHash('sha256').update(result.text, 'utf8').digest('hex')
      : undefined
  };
}

export class AiSdkPremiumReportNarrativeGenerator implements PremiumReportNarrativeGenerator {
  readonly provider: string;
  readonly model: string;

  constructor(model: string) {
    this.model = model;
    this.provider = providerFromModel(model);
  }

  generate(input: NarrativeGenerationInput) {
    return runStructuredGeneration({
      model: this.model,
      prompt: buildPremiumReportGenerationPrompt(input)
    });
  }

  repair(input: NarrativeGenerationInput) {
    return runStructuredGeneration({
      model: this.model,
      prompt: buildPremiumReportRepairPrompt(input)
    });
  }
}

export function createAiSdkPremiumReportNarrativeGenerator(model: string) {
  return new AiSdkPremiumReportNarrativeGenerator(model);
}

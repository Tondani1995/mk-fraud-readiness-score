import { generateText, Output } from 'ai';
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
  logPremiumReportPhase,
  PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS
} from './phase-timing';

import { PREMIUM_REPORT_AI_BODY_MAX_CHARS } from './types';

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
    throw error;
  }
  logPremiumReportPhase({ phase: 'provider_response_received', status: 'completed', startedAt, provider: requestedProvider, model: input.model });

  if (!result.output) throw new Error('AI provider returned no structured narrative output.');

  const parsedIdentity = parseAiGatewayExecutionIdentity({
    requestedProvider,
    requestedModel: input.model,
    providerMetadata: result.providerMetadata,
    response: result.response
  });
  logPremiumReportPhase({
    phase: 'gateway_identity_validated',
    status: 'completed',
    startedAt,
    provider: parsedIdentity.identity.finalProvider,
    model: parsedIdentity.identity.resolvedProviderApiModelId,
    gatewayGenerationId: parsedIdentity.identity.generationId
  });
  const resolvedProvider = parsedIdentity.identity.finalProvider ?? parsedIdentity.identity.resolvedProvider ?? requestedProvider;
  const resolvedModel = parsedIdentity.identity.resolvedProviderApiModelId;
  return {
    output: result.output as PremiumReportAiEditorialPlan,
    provider: resolvedProvider,
    model: resolvedModel,
    latencyMs: Date.now() - startedAt,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      estimatedCostMicros: parsedIdentity.gatewayCostMicros
    },
    gateway: parsedIdentity.identity
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

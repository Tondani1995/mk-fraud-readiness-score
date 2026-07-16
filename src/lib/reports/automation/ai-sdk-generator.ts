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

import { PREMIUM_REPORT_AI_BODY_MAX_CHARS } from './types';

const evidenceRefs = z.array(z.string().min(1)).min(1);
const narrativeBody = z.string().min(1).max(PREMIUM_REPORT_AI_BODY_MAX_CHARS);
export const PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS = 5000;
export const PREMIUM_REPORT_AI_TIMEOUT_MS = 45_000;

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
  const result = await generateText({
    model: input.model,
    system: PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS,
    prompt: input.prompt,
    output: Output.object({
      schema: premiumReportNarrativeSchema,
      name: 'mk_premium_report_narrative',
      description: 'Evidence-reference editorial plan. It contains no scores, control assertions, roadmap claims, or free-form prose.'
    }),
    maxOutputTokens: PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS,
    maxRetries: 0,
    providerOptions: {
      gateway: { only: [requestedProvider] }
    },
    abortSignal: AbortSignal.timeout(PREMIUM_REPORT_AI_TIMEOUT_MS)
  });

  if (!result.output) throw new Error('AI provider returned no structured narrative output.');

  const gatewayMetadata = (result.providerMetadata as any)?.gateway;
  const gatewayCost = Number(gatewayMetadata?.cost);
  const resolvedProvider = String(
    gatewayMetadata?.provider ?? gatewayMetadata?.providerName ?? gatewayMetadata?.routing?.provider ?? ''
  ).trim().toLowerCase();
  const resolvedModel = String(result.response.modelId ?? '').trim();
  if (!resolvedProvider || !resolvedModel) {
    throw new Error('AI Gateway response omitted authoritative provider or model identity.');
  }
  if (resolvedProvider !== requestedProvider.toLowerCase()) {
    throw new Error(`AI Gateway routed to an unapproved provider: ${resolvedProvider}.`);
  }
  return {
    output: result.output as PremiumReportAiEditorialPlan,
    provider: resolvedProvider,
    model: resolvedModel,
    latencyMs: Date.now() - startedAt,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      estimatedCostMicros: Number.isFinite(gatewayCost) ? Math.round(gatewayCost * 1_000_000) : undefined
    }
  };
}

export class AiSdkPremiumReportNarrativeGenerator implements PremiumReportNarrativeGenerator {
  readonly provider: string;

  constructor(public readonly model: string) {
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

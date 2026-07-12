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
  PremiumReportNarrative,
  PremiumReportNarrativeGenerator
} from './types';

const evidenceRefs = z.array(z.string().min(1)).min(1);

export const premiumReportNarrativeSchema = z.object({
  executiveDiagnosis: z.object({
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(2500),
    evidenceRefs
  }).strict(),
  falseComfort: z.object({
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(2500),
    evidenceRefs
  }).strict(),
  leadershipAttention: z.object({
    body: z.string().min(1).max(2500),
    evidenceRefs
  }).strict(),
  domainNarratives: z.array(z.object({
    domainCode: z.string().min(1),
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(2500),
    evidenceRefs
  }).strict()),
  gapCommentary: z.array(z.object({
    questionCode: z.string().min(1),
    body: z.string().min(1).max(2500),
    evidenceRefs
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
  const result = await generateText({
    model: input.model,
    system: PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS,
    prompt: input.prompt,
    output: Output.object({
      schema: premiumReportNarrativeSchema,
      name: 'mk_premium_report_narrative',
      description: 'Evidence-cited narrative sections for an MK Fraud Readiness premium report.'
    }),
    maxOutputTokens: 9000
  });

  if (!result.output) throw new Error('AI provider returned no structured narrative output.');

  return {
    output: result.output as PremiumReportNarrative,
    provider: providerFromModel(input.model),
    model: result.response.modelId || input.model,
    latencyMs: Date.now() - startedAt,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens
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

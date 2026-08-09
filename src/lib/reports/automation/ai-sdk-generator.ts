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

import { PREMIUM_REPORT_AI_BODY_MAX_CHARS, PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS } from './types';
import { ESSENTIAL_CAPS } from '../essential-projection';
import crypto from 'node:crypto';

const evidenceRefs = z.array(z.string().min(1)).min(1);
/** Backstop only. Every provider-facing field below uses its own tighter section maximum. */
const narrativeBody = z.string().min(1).max(PREMIUM_REPORT_AI_BODY_MAX_CHARS);
const sectionBody = (kind: keyof typeof PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS) =>
  z.string().min(1).max(PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS[kind]);

/**
 * Raised from 5,000 after V5 truncated at exactly the old ceiling (finishReason 'length',
 * rawFinishReason 'max_output_tokens'). Deliberately NOT 8k/10k: the envelope was tightened first,
 * so this is headroom over a ~13.7k-character worst case rather than room for an oversized one.
 * Against the V5 actual input of 10,850 tokens this gives ~17,350 total, inside the existing 24,000
 * hard total ceiling, and cost stays well under the 500,000-micro hard ceiling.
 */
export const PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS = 6500;
export const PREMIUM_REPORT_AI_TIMEOUT_MS = 240_000;
export { PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS };

/** The MFS domain set the Essential projection reports on. */
export const PREMIUM_REPORT_AI_MAX_DOMAIN_SECTIONS = 10;
/**
 * Gap sections are one-per-selected-material-finding (automation/evidence.ts derives them from
 * projection.findings), so the authoritative bound is the Essential findings cap itself rather than
 * an invented number. Systemic reports select fewer (findingsSystemic); this is the ceiling.
 */
export const PREMIUM_REPORT_AI_MAX_GAP_SECTIONS = ESSENTIAL_CAPS.findings;

export const premiumReportNarrativeSchema = z.object({
  executiveEvidenceRefs: evidenceRefs,
  executiveBody: sectionBody('executive'),
  falseComfortEvidenceRefs: evidenceRefs,
  falseComfortBody: sectionBody('falseComfort'),
  leadershipEvidenceRefs: evidenceRefs,
  leadershipBody: sectionBody('leadership'),
  // Output-shape protection only. These bound what the model may EMIT; they do not touch which
  // domains or gaps the deterministic projection selects, MFS, or systemic logic.
  domainEvidence: z.array(z.object({
    domainCode: z.string().min(1),
    evidenceRefs,
    body: sectionBody('domain')
  }).strict()).max(PREMIUM_REPORT_AI_MAX_DOMAIN_SECTIONS),
  gapEvidence: z.array(z.object({
    questionCode: z.string().min(1),
    evidenceRefs,
    body: sectionBody('gap')
  }).strict()).max(PREMIUM_REPORT_AI_MAX_GAP_SECTIONS)
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

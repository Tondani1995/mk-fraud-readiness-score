import { generateText, Output } from 'ai';
import { z } from 'zod';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { NarrativeWriterUnavailableError } from './manuscript';
import { selectNarrativeModel } from '../ai-model-policy';
import {
  BOUNDED_SECTION_PROMPT_VERSION,
  type BoundedProviderCall,
  type BoundedProviderMetadata,
  type BoundedSectionProvider,
  type NarrativeSectionContract,
  type NarrativeSlotResult,
  type NarrativeSlotValidationReport
} from './bounded-section-engine';

export const BOUNDED_SECTION_TIMEOUT_MS = 240_000;

function providerFromModel(model: string): string {
  return model.split('/')[0]?.trim() || 'vercel-ai-gateway';
}

function requireCredential(model: string): { model: string; provider: string } {
  if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
  return { model, provider: providerFromModel(model) };
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rawCostMicros(response: any): number | undefined {
  const raw = response?.providerMetadata?.gateway?.cost;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : undefined;
}

function sha(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const resultSchema = z.object({
  contractVersion: z.string().min(1),
  slotId: z.string().min(1),
  centralJudgement: z.string().min(1),
  narrative: z.string().min(1),
  managementImplication: z.string().min(1),
  usedClaimRefs: z.array(z.string()),
  requirementCoverage: z.array(z.object({ requirementId: z.string().min(1), supportingExcerpt: z.string().min(1) }).strict()),
  transitionCue: z.string()
}).strict();

function contractPrompt(contract: NarrativeSectionContract, repair?: { previous: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport; repairNumber: number }): string {
  const repairInstructions = repair ? [
    '',
    `THIS IS BOUNDED REPAIR ${repair.repairNumber} OF 2 FOR THE SAME SLOT. Do not rewrite any other slot.`,
    'Preserve every authorised fact and the contract meaning. Correct only the deterministic rejection reasons below.',
    `REJECTED RESULT: ${JSON.stringify(repair.previous)}`,
    `REJECTION REPORT: ${JSON.stringify(repair.validation)}`
  ] : [];
  return [
    repair ? 'Repair one bounded MK Fraud Readiness v1.1 narrative slot.' : 'Write one bounded MK Fraud Readiness v1.1 narrative slot.',
    '',
    'DETERMINISTIC ENGINE DECIDES. AI EXPLAINS.',
    'Return exactly one JSON object matching the structured output contract. The application owns headings, order, scoring, maturity, findings, scenarios, controls, decisions, roadmap, ownership and report compilation.',
    'Use only the authorised facts and permitted claim references in this contract. Do not ask for or infer missing facts. The customer prose must not contain IDs, database keys, machine enums, bullet lists, questionnaire language or claims that MK, the assessment or this report independently verified operating effectiveness.',
    'For every required insight, include one supportingExcerpt copied verbatim from the narrative. Each requirement ID must occur exactly once in requirementCoverage.',
    ...repairInstructions,
    '',
    'SECTION CONTRACT',
    JSON.stringify(contract)
  ].join('\n');
}

function metadata(contract: NarrativeSectionContract, model: string, provider: string, response: any, prompt: string, callType: BoundedProviderMetadata['callType'], repairNumber: number): BoundedProviderMetadata {
  const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
  const finishReason = typeof response.finishReason === 'string' ? response.finishReason : typeof response.response?.finishReason === 'string' ? response.response.finishReason : undefined;
  return {
    provider,
    model,
    promptVersion: BOUNDED_SECTION_PROMPT_VERSION,
    generationMode: 'ai',
    generatedAt: new Date().toISOString(),
    generationId: identity?.identity.generationId,
    responseId: typeof response.response?.id === 'string' ? response.response.id : undefined,
    inputTokens: numeric(response.usage?.inputTokens),
    outputTokens: numeric(response.usage?.outputTokens),
    totalTokens: numeric(response.usage?.totalTokens),
    providerCostMicros: identity?.gatewayCostMicros ?? rawCostMicros(response),
    providerCostRaw: typeof response.providerMetadata?.gateway?.cost === 'string' || typeof response.providerMetadata?.gateway?.cost === 'number' ? response.providerMetadata.gateway.cost : undefined,
    finishReason,
    callType,
    repairNumber
  };
}

export class V11BoundedSectionWriter implements BoundedSectionProvider {
  readonly provider: string;
  readonly model: string;

  constructor(model = selectNarrativeModel().fallbackModels[0] ?? 'openai/gpt-5.6-luna') {
    const resolved = requireCredential(model);
    this.model = resolved.model;
    this.provider = resolved.provider;
  }

  private async call(contract: NarrativeSectionContract, callType: BoundedProviderMetadata['callType'], repairNumber: number, repair?: { previous: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport; repairNumber: number }): Promise<BoundedProviderCall> {
    const prompt = contractPrompt(contract, repair);
    const response = await generateText({
      model: this.model,
      system: 'You are the bounded MK Fraud Readiness v1.1 section writer. Deterministic contract facts are the only authority. Return structured JSON only.',
      prompt,
      output: Output.object({ schema: resultSchema, name: 'mk_fraud_readiness_bounded_section' }),
      maxOutputTokens: Math.min(4_000, Math.max(1_200, Math.ceil(contract.fit.maximumWords * 1.9))),
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(BOUNDED_SECTION_TIMEOUT_MS)
    });
    const result = response.output as NarrativeSlotResult;
    return { result, metadata: metadata(contract, this.model, this.provider, response, prompt, callType, repairNumber), prompt };
  }

  generate(contract: NarrativeSectionContract): Promise<BoundedProviderCall> {
    return this.call(contract, 'INITIAL', 0);
  }

  repair(contract: NarrativeSectionContract, rejected: { result: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport }, repairNumber: number): Promise<BoundedProviderCall> {
    return this.call(contract, 'REPAIR', repairNumber, { previous: rejected.result, validation: rejected.validation, repairNumber });
  }

  qualityEscalate(contract: NarrativeSectionContract, rejected: { result: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport }): Promise<BoundedProviderCall> {
    // Quality escalation is deliberately a separate Terra call. It must never
    // silently reuse the Mini/Luna model that already exhausted bounded repair.
    const escalated = new V11BoundedSectionWriter('openai/gpt-5.6-terra');
    return escalated.call(contract, 'QUALITY_ESCALATION', 0, { previous: rejected.result, validation: rejected.validation, repairNumber: 2 });
  }
}

export function createV11BoundedSectionWriter(model = selectNarrativeModel().fallbackModels[0] ?? 'openai/gpt-5.6-luna'): BoundedSectionProvider {
  return new V11BoundedSectionWriter(model);
}

export function boundedSectionPromptFingerprint(contract: NarrativeSectionContract): string {
  return sha({ promptVersion: BOUNDED_SECTION_PROMPT_VERSION, contract });
}

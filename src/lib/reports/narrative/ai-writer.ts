import { generateText, Output } from 'ai';
import { z } from 'zod';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { NarrativeWriterUnavailableError, type NarrativeManuscript, type NarrativeManuscriptSection, type NarrativeSpine, type NarrativeWriter, type NarrativeWriterContext, type NarrativeWriterMetadata } from './manuscript';
import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';

export const V11_NARRATIVE_PROMPT_VERSION = 'mk-reporting-bible-1.1-manuscript-advisory-v1';
export const V11_NARRATIVE_MODEL = process.env.MK_REPORT_AI_MODEL?.trim() ?? '';

const claimBlock = z.object({ id: z.string().min(1), text: z.string().min(1), claimRefs: z.array(z.string().min(1)) }).strict();
const spineSchema = z.object({ executiveDiagnosis: claimBlock, systemicThemeSummary: claimBlock, centralManagementImplication: claimBlock, route: claimBlock }).strict();
const sectionSchema = z.object({ sectionId: z.string().min(1), movementId: z.string().min(1), heading: claimBlock, paragraphs: z.array(claimBlock).min(1), transition: claimBlock.optional() }).strict();

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function sha(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function requireProvider(): { model: string; provider: string } {
  const model = V11_NARRATIVE_MODEL;
  const hasCredential = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY);
  if (!model || !hasCredential) throw new NarrativeWriterUnavailableError();
  return { model, provider: providerFromModel(model) };
}

function contextPayload(pack: NarrativeFactPack, plan: NarrativeStoryPlan): string {
  return JSON.stringify({ bibleVersion: '1.1', factPack: pack, storyPlan: plan });
}

function metadata(provider: string, model: string, pack: NarrativeFactPack, plan: NarrativeStoryPlan, identity?: ReturnType<typeof parseAiGatewayExecutionIdentity>, response?: unknown): NarrativeWriterMetadata {
  const responseId = response && typeof response === 'object' && typeof (response as { id?: unknown }).id === 'string' ? (response as { id: string }).id : undefined;
  return { provider, model, promptVersion: V11_NARRATIVE_PROMPT_VERSION, generationMode: 'ai', generatedAt: new Date().toISOString(), generationId: identity?.identity.generationId, responseId, inputFactPackSha256: sha(pack), inputStoryPlanSha256: sha(plan) };
}

type NarrativeWritePhase = 'spine' | 'section' | 'coherence';
const TOKEN_BUDGETS: Record<NarrativeWritePhase, number> = { spine: 2200, section: 2800, coherence: 16000 };

async function objectCall<T>(input: { model: string; provider: string; prompt: string; schema: z.ZodType<T>; pack: NarrativeFactPack; plan: NarrativeStoryPlan; phase: NarrativeWritePhase }): Promise<{ value: T; metadata: NarrativeWriterMetadata }> {
  const response = await generateText({
    model: input.model,
    system: 'You are the constrained MK Fraud Readiness v1.1 advisory writer. Deterministic facts are the sole authority. Write only fluent, calm, non-accusatory executive prose. Do not invent or change any fact, priority, owner, timing, control, scenario, decision or number. Every heading and material paragraph must carry stable Fact Pack claimRefs. Do not emit raw IDs in text. Do not claim evidence validation or independent operating effectiveness. Return only the requested structured object.',
    prompt: input.prompt,
    output: Output.object({ schema: input.schema, name: 'mk_fraud_readiness_v11_manuscript' }),
    maxOutputTokens: TOKEN_BUDGETS[input.phase],
    maxRetries: 0,
    providerOptions: { gateway: { only: [input.provider] } },
    abortSignal: AbortSignal.timeout(240_000)
  });
  const gateway = parseAiGatewayExecutionIdentity({ requestedProvider: input.provider, requestedModel: input.model, providerMetadata: response.providerMetadata, response: response.response });
  return { value: response.output as T, metadata: metadata(input.provider, input.model, input.pack, input.plan, gateway, response.response) };
}

export class V11AiNarrativeWriter implements NarrativeWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion = V11_NARRATIVE_PROMPT_VERSION;

  constructor(model = V11_NARRATIVE_MODEL) {
    if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
    this.model = model;
    this.provider = providerFromModel(model);
  }

  async writeSpine(input: { factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeSpine> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: spineSchema, pack: input.factPack, plan: input.storyPlan, phase: 'spine', prompt: `Write the executive narrative spine first. Establish the central management story from diagnosis to findings to conditional exposure pathways to treatment. Use claimRefs from the Fact Pack.\n\n${contextPayload(input.factPack, input.storyPlan)}` });
    return { schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: input.factPack.productTier, ...result.value, writerMetadata: result.metadata };
  }

  async writeSection(input: NarrativeWriterContext): Promise<NarrativeManuscriptSection> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: sectionSchema, pack: input.factPack, plan: input.storyPlan, phase: 'section', prompt: `Write section ${input.currentSectionId}. The previous transition is: ${input.previousTransition ?? '(first section)'}. Current purpose: ${input.currentSectionPurpose}. Next section purpose: ${input.nextSectionPurpose}. Required management takeaway: ${input.requiredManagementTakeaway}. Prohibited claims: ${input.prohibitedClaims.join('; ')}. Keep all priorities and facts deterministic; use only relevant Fact Pack references.\n\n${contextPayload(input.factPack, input.storyPlan)}\n\nEXECUTIVE SPINE\n${JSON.stringify(input.spine)}` });
    return result.value;
  }

  async coherencePass(input: { manuscript: NarrativeManuscript; factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeManuscript> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: z.object({ sections: z.array(sectionSchema).min(1) }).strict(), pack: input.factPack, plan: input.storyPlan, phase: 'coherence', prompt: `Perform one bounded editorial coherence pass over this manuscript. Smooth transitions, remove repetition, standardise terminology and preserve every deterministic fact, priority, owner, timing, control, scenario, decision and claim reference. Do not add analytical content. Return all sections.\n\n${contextPayload(input.factPack, input.storyPlan)}\n\nMANUSCRIPT\n${JSON.stringify(input.manuscript)}` });
    return { ...input.manuscript, sections: result.value.sections, writerMetadata: { ...input.manuscript.writerMetadata, generatedAt: new Date().toISOString() } };
  }
}

export function createV11NarrativeWriter(): NarrativeWriter {
  const { model } = requireProvider();
  return new V11AiNarrativeWriter(model);
}

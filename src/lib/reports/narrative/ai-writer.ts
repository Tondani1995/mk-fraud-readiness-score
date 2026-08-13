import { generateText, Output } from 'ai';
import { z } from 'zod';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { NarrativeWriterUnavailableError, type NarrativeManuscript, type NarrativeManuscriptSection, type NarrativeSpine, type NarrativeWriter, type NarrativeWriterContext, type NarrativeWriterMetadata } from './manuscript';
import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';
import { buildNarrativeWriterBrief, type NarrativeWriterBrief } from './writer-brief';
import { sanitiseNarrativePresentation } from './presentation-hygiene';

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
  const writerBrief: NarrativeWriterBrief = buildNarrativeWriterBrief(pack, plan);
  return JSON.stringify({ bibleVersion: '1.1', writerBrief });
}

function metadata(provider: string, model: string, pack: NarrativeFactPack, plan: NarrativeStoryPlan, identity?: ReturnType<typeof parseAiGatewayExecutionIdentity>, response?: unknown, sanitisedProvenanceTokenCount = 0): NarrativeWriterMetadata {
  const responseId = response && typeof response === 'object' && typeof (response as { id?: unknown }).id === 'string' ? (response as { id: string }).id : undefined;
  return { provider, model, promptVersion: V11_NARRATIVE_PROMPT_VERSION, generationMode: 'ai', generatedAt: new Date().toISOString(), generationId: identity?.identity.generationId, responseId, inputFactPackSha256: sha(pack), inputStoryPlanSha256: sha(plan), presentationSanitisedProvenanceTokenCount: sanitisedProvenanceTokenCount };
}

type NarrativeWritePhase = 'spine' | 'section' | 'coherence';
const TOKEN_BUDGETS: Record<NarrativeWritePhase, number> = { spine: 2200, section: 2800, coherence: 16000 };

async function objectCall<T>(input: { model: string; provider: string; prompt: string; schema: z.ZodType<T>; pack: NarrativeFactPack; plan: NarrativeStoryPlan; phase: NarrativeWritePhase }): Promise<{ value: T; metadata: NarrativeWriterMetadata }> {
  const response = await generateText({
    model: input.model,
    system: 'You are the constrained MK Fraud Readiness v1.1 advisory writer. Deterministic facts are the sole authority. Write only fluent, calm, non-accusatory executive prose. Do not invent or change any fact, priority, owner, timing, control, scenario, decision or number. Text fields are customer-facing prose. claimRefs fields are internal provenance metadata only: identifiers such as FINDING-001, THEME-001, CONTROL-001, RISK-..., SC-..., DECISION-..., ROADMAP-..., PROOF-... and D4-Q01 may appear only inside claimRefs when required and must never appear inside heading.text, paragraph.text, transition.text, executiveDiagnosis.text, systemicThemeSummary.text, centralManagementImplication.text or route.text. Every heading and material paragraph must carry stable Fact Pack claimRefs. Do not claim evidence validation or independent operating effectiveness. Return only the requested structured object.',
    prompt: input.prompt,
    output: Output.object({ schema: input.schema, name: 'mk_fraud_readiness_v11_manuscript' }),
    maxOutputTokens: TOKEN_BUDGETS[input.phase],
    maxRetries: 0,
    providerOptions: { gateway: { only: [input.provider] } },
    abortSignal: AbortSignal.timeout(240_000)
  });
  const gateway = parseAiGatewayExecutionIdentity({ requestedProvider: input.provider, requestedModel: input.model, providerMetadata: response.providerMetadata, response: response.response });
  const sanitised = sanitiseNarrativePresentation(response.output as T);
  return { value: sanitised.value, metadata: metadata(input.provider, input.model, input.pack, input.plan, gateway, response.response, sanitised.removedTokenCount) };
}

export class V11AiNarrativeWriter implements NarrativeWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion = V11_NARRATIVE_PROMPT_VERSION;
  presentationSanitisedProvenanceTokenCount = 0;

  constructor(model = V11_NARRATIVE_MODEL) {
    if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
    this.model = model;
    this.provider = providerFromModel(model);
  }

  async writeSpine(input: { factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeSpine> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: spineSchema, pack: input.factPack, plan: input.storyPlan, phase: 'spine', prompt: `Write the executive narrative spine first. Establish the central management story from diagnosis to findings to conditional exposure pathways to treatment. Use claimRefs from the Fact Pack. The text fields are customer prose; claimRefs are internal provenance metadata only. Identifiers may appear in claimRefs but never in executiveDiagnosis.text, systemicThemeSummary.text, centralManagementImplication.text or route.text.\n\n${contextPayload(input.factPack, input.storyPlan)}` });
    this.presentationSanitisedProvenanceTokenCount += result.metadata.presentationSanitisedProvenanceTokenCount ?? 0;
    return { schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: input.factPack.productTier, ...result.value, writerMetadata: { ...result.metadata, presentationSanitisedProvenanceTokenCount: this.presentationSanitisedProvenanceTokenCount } };
  }

  async writeSection(input: NarrativeWriterContext): Promise<NarrativeManuscriptSection> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: sectionSchema, pack: input.factPack, plan: input.storyPlan, phase: 'section', prompt: `Write section ${input.currentSectionId}. The previous transition is: ${input.previousTransition ?? '(first section)'}. Current purpose: ${input.currentSectionPurpose}. Next section purpose: ${input.nextSectionPurpose}. Required management takeaway: ${input.requiredManagementTakeaway}. Prohibited claims: ${input.prohibitedClaims.join('; ')}. Keep all priorities and facts deterministic; use only relevant Fact Pack references. Text fields are customer prose; claimRefs are internal provenance metadata only. Identifiers may appear in claimRefs but never in heading.text, paragraph.text or transition.text.\n\n${contextPayload(input.factPack, input.storyPlan)}\n\nEXECUTIVE SPINE\n${JSON.stringify(input.spine)}` });
    this.presentationSanitisedProvenanceTokenCount += result.metadata.presentationSanitisedProvenanceTokenCount ?? 0;
    return result.value;
  }

  async coherencePass(input: { manuscript: NarrativeManuscript; factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeManuscript> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: z.object({ sections: z.array(sectionSchema).min(1) }).strict(), pack: input.factPack, plan: input.storyPlan, phase: 'coherence', prompt: `Perform one bounded editorial coherence pass over this manuscript. Smooth transitions, remove repetition, standardise terminology and preserve every deterministic fact, priority, owner, timing, control, scenario, decision and claim reference. Do not add analytical content. Return all sections. Text fields are customer prose; claimRefs are internal provenance metadata only. Identifiers may appear in claimRefs but never in heading.text, paragraph.text or transition.text.\n\n${contextPayload(input.factPack, input.storyPlan)}\n\nMANUSCRIPT\n${JSON.stringify(input.manuscript)}` });
    this.presentationSanitisedProvenanceTokenCount += result.metadata.presentationSanitisedProvenanceTokenCount ?? 0;
    return { ...input.manuscript, sections: result.value.sections, writerMetadata: { ...input.manuscript.writerMetadata, generatedAt: new Date().toISOString(), presentationSanitisedProvenanceTokenCount: this.presentationSanitisedProvenanceTokenCount } };
  }
}

export function createV11NarrativeWriter(): NarrativeWriter {
  const { model } = requireProvider();
  return new V11AiNarrativeWriter(model);
}

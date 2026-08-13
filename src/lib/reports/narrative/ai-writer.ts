import { generateText, Output } from 'ai';
import { z } from 'zod';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { NarrativeWriterUnavailableError, type NarrativeManuscript, type NarrativeManuscriptSection, type NarrativeSpine, type NarrativeWriter, type NarrativeWriterContext, type NarrativeWriterMetadata } from './manuscript';
import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';
import { buildNarrativeWriterBrief, type NarrativeWriterBrief } from './writer-brief';
import { sanitiseNarrativePresentation } from './presentation-hygiene';
import { NarrativeAiCallAccounting } from './call-accounting';

export const V11_NARRATIVE_PROMPT_VERSION = 'mk-reporting-bible-1.1-manuscript-advisory-v1';
export const V11_NARRATIVE_MODEL = process.env.MK_REPORT_AI_MODEL?.trim() ?? '';

const claimBlock = z.object({ id: z.string().min(1), text: z.string().min(1), claimRefs: z.array(z.string().min(1)) }).strict();
const spineSchema = z.object({ executiveDiagnosis: claimBlock, systemicThemeSummary: claimBlock, centralManagementImplication: claimBlock, route: claimBlock }).strict();
// The AI Gateway's strict structured-output contract requires every object property to be listed
// as required. A final section has no transition, so represent that absence as explicit null at
// the provider boundary and normalise it back to the internal optional manuscript shape below.
const sectionSchema = z.object({ sectionId: z.string().min(1), movementId: z.string().min(1), heading: claimBlock, paragraphs: z.array(claimBlock).min(1), transition: claimBlock.nullable() }).strict();

function normaliseSection(value: z.infer<typeof sectionSchema>): NarrativeManuscriptSection {
  return { ...value, transition: value.transition ?? undefined };
}

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

function metadata(provider: string, model: string, pack: NarrativeFactPack, plan: NarrativeStoryPlan, identity?: ReturnType<typeof parseAiGatewayExecutionIdentity>, response?: unknown, sanitisedProvenanceTokenCount = 0, usage?: unknown): NarrativeWriterMetadata {
  const responseId = response && typeof response === 'object' && typeof (response as { id?: unknown }).id === 'string' ? (response as { id: string }).id : undefined;
  const usageRecord = usage && typeof usage === 'object' ? usage as { inputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown } : {};
  const numeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return { provider, model, promptVersion: V11_NARRATIVE_PROMPT_VERSION, generationMode: 'ai', generatedAt: new Date().toISOString(), generationId: identity?.identity.generationId, responseId, inputFactPackSha256: sha(pack), inputStoryPlanSha256: sha(plan), presentationSanitisedProvenanceTokenCount: sanitisedProvenanceTokenCount, inputTokens: numeric(usageRecord.inputTokens), outputTokens: numeric(usageRecord.outputTokens), totalTokens: numeric(usageRecord.totalTokens), providerCostMicros: identity?.gatewayCostMicros };
}

type NarrativeWritePhase = 'spine' | 'section' | 'coherence';
const TOKEN_BUDGETS: Record<NarrativeWritePhase, number> = { spine: 2200, section: 2800, coherence: 16000 };

async function objectCall<T>(input: { model: string; provider: string; prompt: string; schema: z.ZodType<T>; pack: NarrativeFactPack; plan: NarrativeStoryPlan; phase: NarrativeWritePhase; sectionId?: string; accounting?: NarrativeAiCallAccounting }): Promise<{ value: T; metadata: NarrativeWriterMetadata }> {
  input.accounting?.announceBeforeLiveCall(input.plan);
  const call = input.accounting?.start(input.phase, input.sectionId);
  try {
    const response = await generateText({
    model: input.model,
    system: 'You are the constrained MK Fraud Readiness v1.1 advisory writer. Deterministic facts are the sole authority. Write only fluent, calm, non-accusatory executive prose. Do not invent or change any fact, priority, owner, timing, control, scenario, decision or number. Text fields are customer-facing prose. claimRefs fields are internal provenance metadata only: identifiers such as FINDING-001, THEME-001, CONTROL-001, RISK-..., SC-..., DECISION-..., ROADMAP-..., PROOF-... and D4-Q01 may appear only inside claimRefs when required and must never appear inside heading.text, paragraph.text, transition.text, executiveDiagnosis.text, systemicThemeSummary.text, centralManagementImplication.text or route.text. Every heading and material paragraph must carry stable Fact Pack claimRefs. You may describe independent verification or independent review as an organisation-owned customer control activity only when the Writer Brief supplies that control design. You must never state or imply that MK, the assessment or this report independently verified, validated, tested, confirmed or assured the operating effectiveness of the organisation\'s controls, that evidence was validated, or that the report provides assurance. Return only the requested structured object.',
    prompt: input.prompt,
    output: Output.object({ schema: input.schema, name: 'mk_fraud_readiness_v11_manuscript' }),
    maxOutputTokens: TOKEN_BUDGETS[input.phase],
    maxRetries: 0,
    providerOptions: { gateway: { only: [input.provider] } },
    abortSignal: AbortSignal.timeout(240_000)
    });
    const gateway = parseAiGatewayExecutionIdentity({ requestedProvider: input.provider, requestedModel: input.model, providerMetadata: response.providerMetadata, response: response.response });
    const sanitised = sanitiseNarrativePresentation(response.output as T);
    const writerMetadata = metadata(input.provider, input.model, input.pack, input.plan, gateway, response.response, sanitised.removedTokenCount, response.usage);
    if (call) input.accounting?.complete(call, writerMetadata);
    return { value: sanitised.value, metadata: writerMetadata };
  } catch (error) {
    if (call) input.accounting?.fail(call, error);
    throw error;
  }
}

export class V11AiNarrativeWriter implements NarrativeWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion = V11_NARRATIVE_PROMPT_VERSION;
  readonly callAccounting?: NarrativeAiCallAccounting;
  presentationSanitisedProvenanceTokenCount = 0;

  constructor(model = V11_NARRATIVE_MODEL, callAccounting?: NarrativeAiCallAccounting) {
    if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
    this.model = model;
    this.provider = providerFromModel(model);
    this.callAccounting = callAccounting;
  }

  async writeSpine(input: { factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeSpine> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: spineSchema, pack: input.factPack, plan: input.storyPlan, phase: 'spine', accounting: this.callAccounting, prompt: `Write the executive narrative spine first. Establish the central management story from diagnosis to findings to conditional exposure pathways to treatment. Use claimRefs from the Fact Pack. The text fields are customer prose; claimRefs are internal provenance metadata only. Identifiers may appear in claimRefs but never in executiveDiagnosis.text, systemicThemeSummary.text, centralManagementImplication.text or route.text. Independent verification/review may be described only as a customer control activity supplied by the Writer Brief; never attribute it to MK, the assessment or the report.\n\n${contextPayload(input.factPack, input.storyPlan)}` });
    this.presentationSanitisedProvenanceTokenCount += result.metadata.presentationSanitisedProvenanceTokenCount ?? 0;
    return { schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: input.factPack.productTier, ...result.value, writerMetadata: { ...result.metadata, presentationSanitisedProvenanceTokenCount: this.presentationSanitisedProvenanceTokenCount } };
  }

  async writeSection(input: NarrativeWriterContext): Promise<NarrativeManuscriptSection> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: sectionSchema, pack: input.factPack, plan: input.storyPlan, phase: 'section', sectionId: input.currentSectionId, accounting: this.callAccounting, prompt: `Write section ${input.currentSectionId}. The previous transition is: ${input.previousTransition ?? '(first section)'}. Current purpose: ${input.currentSectionPurpose}. Next section purpose: ${input.nextSectionPurpose}. Required management takeaway: ${input.requiredManagementTakeaway}. Prohibited claims: ${input.prohibitedClaims.join('; ')}. Keep all priorities and facts deterministic; use only relevant Fact Pack references. Text fields are customer prose; claimRefs are internal provenance metadata only. Identifiers may appear in claimRefs but never in heading.text, paragraph.text or transition.text. Independent verification/review may be described only as a customer control activity supplied by the Writer Brief; never state that MK, the assessment or the report performed or confirmed it. Include the required transition property as a ClaimBlock for every non-final section and as null for the final section.\n\n${contextPayload(input.factPack, input.storyPlan)}\n\nEXECUTIVE SPINE\n${JSON.stringify(input.spine)}` });
    this.presentationSanitisedProvenanceTokenCount += result.metadata.presentationSanitisedProvenanceTokenCount ?? 0;
    return normaliseSection(result.value);
  }

  async coherencePass(input: { manuscript: NarrativeManuscript; factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan }): Promise<NarrativeManuscript> {
    const result = await objectCall({ model: this.model, provider: this.provider, schema: z.object({ sections: z.array(sectionSchema).min(1) }).strict(), pack: input.factPack, plan: input.storyPlan, phase: 'coherence', accounting: this.callAccounting, prompt: `Perform one bounded editorial coherence pass over this manuscript. Smooth transitions, remove repetition, standardise terminology and preserve every deterministic fact, priority, owner, timing, control, scenario, decision and claim reference. Do not add analytical content. Return all sections. Text fields are customer prose; claimRefs are internal provenance metadata only. Identifiers may appear in claimRefs but never in heading.text, paragraph.text or transition.text. Preserve customer control-design language for independent verification or review, but never introduce or imply MK, assessment or report assurance, validation, testing or confirmation of operating effectiveness.\n\n${contextPayload(input.factPack, input.storyPlan)}\n\nMANUSCRIPT\n${JSON.stringify(input.manuscript)}` });
    this.presentationSanitisedProvenanceTokenCount += result.metadata.presentationSanitisedProvenanceTokenCount ?? 0;
    return { ...input.manuscript, sections: result.value.sections.map(normaliseSection), writerMetadata: { ...input.manuscript.writerMetadata, generatedAt: new Date().toISOString(), presentationSanitisedProvenanceTokenCount: this.presentationSanitisedProvenanceTokenCount } };
  }
}

export function createV11NarrativeWriter(options: { callAccounting?: NarrativeAiCallAccounting } = {}): NarrativeWriter {
  const { model } = requireProvider();
  return new V11AiNarrativeWriter(model, options.callAccounting);
}

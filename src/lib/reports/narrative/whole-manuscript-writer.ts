import { generateText, Output } from 'ai';
import { z } from 'zod';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { selectNarrativeModel } from '../ai-model-policy';
import { sanitiseNarrativePresentation } from './presentation-hygiene';
import { NarrativeWriterUnavailableError, type NarrativeClaimBlock, type NarrativeManuscript, type WholeManuscriptWriter, type WholeManuscriptWriterInput, type WholeManuscriptWriterMetadata } from './manuscript';
import type { ReportBlueprint } from './report-blueprint';
import { emptyNarrativeRecoveryBudget } from './recovery-policy';

export const WHOLE_MANUSCRIPT_PROMPT_VERSION = 'mk-fraud-readiness-v1.1-whole-manuscript-blueprint-v1';

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function sha(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function claimRefEnum(refs: string[]) {
  const unique = [...new Set(refs.filter(Boolean))];
  if (unique.length === 0) throw new Error('Whole-manuscript context must contain permitted deterministic fact references.');
  return z.enum(Object.fromEntries(unique.map((ref) => [ref, ref])) as Record<string, string>);
}

function claimBlockSchema(refs: string[]) {
  return z.object({ id: z.string().min(1), text: z.string().min(1), claimRefs: z.array(claimRefEnum(refs)).min(1) }).strict();
}

function manuscriptSchema(input: WholeManuscriptWriterInput) {
  const refs = input.context.permittedDeterministicFacts.map((fact) => fact.id);
  const block = claimBlockSchema(refs);
  const sections = input.blueprint.chapters.flatMap((chapter) => chapter.sections.map((section) => ({ sectionId: section.sectionId, movementId: chapter.chapterId })));
  return z.object({
    spine: z.object({ executiveDiagnosis: block, systemicThemeSummary: block, centralManagementImplication: block, route: block }).strict(),
    sections: z.array(z.object({ heading: block, paragraphs: z.array(block).min(1), transition: block.nullable() }).strict()).length(sections.length)
  }).strict();
}

function requireProvider(model = selectNarrativeModel().requestedModel): { model: string; provider: string } {
  if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
  return { model, provider: providerFromModel(model) };
}

function metadata(input: WholeManuscriptWriterInput, provider: string, model: string, response: any, usage: any): WholeManuscriptWriterMetadata {
  const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
  const numeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return {
    contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
    architecture: 'whole-manuscript',
    provider,
    model,
    promptVersion: WHOLE_MANUSCRIPT_PROMPT_VERSION,
    generationMode: 'ai',
    generatedAt: new Date().toISOString(),
    generationId: identity?.identity.generationId,
    responseId: typeof response.response?.id === 'string' ? response.response.id : undefined,
    inputFactPackSha256: sha(input.factPack),
    inputStoryPlanSha256: sha(input.blueprint),
    inputBlueprintSha256: sha(input.blueprint),
    inputTokens: numeric(usage?.inputTokens),
    outputTokens: numeric(usage?.outputTokens),
    totalTokens: numeric(usage?.totalTokens),
    providerCostMicros: identity?.gatewayCostMicros,
    recovery: { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1, totalTokens: numeric(usage?.totalTokens) ?? 0, totalProviderCostMicros: identity?.gatewayCostMicros ?? 0 }
  };
}

export class V11WholeManuscriptWriter implements WholeManuscriptWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion = WHOLE_MANUSCRIPT_PROMPT_VERSION;

  constructor(model = selectNarrativeModel().requestedModel) {
    const resolved = requireProvider(model);
    this.provider = resolved.provider;
    this.model = resolved.model;
  }

  async writeManuscript(input: WholeManuscriptWriterInput): Promise<NarrativeManuscript & { blueprint: ReportBlueprint; writerMetadata: WholeManuscriptWriterMetadata }> {
    if (!input.context.singleCallFeasible && input.context.partitionPlan.length < 2) throw new Error('Whole-manuscript context is over the approved limit without a coherent partition plan.');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 whole-manuscript advisory writer. The deterministic Report Blueprint decides the report. Write one connected manuscript within its exact chapter and section order. The complete Fact Pack is the only source of material facts. Do not add, remove or reorder chapters. Do not invent numbers, owners, dates, findings, scenarios, controls, decisions or assurance. Keep raw identifiers in claimRefs only. Use one authorial voice, no repeated executive diagnosis, no duplicate conclusion, no next-section stitching and no register dump. Never imply that MK, the assessment or the report independently verified operating effectiveness. Return only the requested structured object.',
      prompt: JSON.stringify({ architecture: input.context.architecture, blueprint: input.blueprint, permittedDeterministicFacts: input.context.permittedDeterministicFacts, boundaries: input.context.boundaries, style: input.context.style, partitionPlan: input.context.partitionPlan }),
      output: Output.object({ schema: manuscriptSchema(input), name: 'mk_fraud_readiness_v11_whole_manuscript' }),
      maxOutputTokens: input.context.projectedOutputTokens.maximum,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(240_000)
    });
    const sanitised = sanitiseNarrativePresentation(response.output as any);
    const writerMetadata = metadata(input, this.provider, this.model, response, response.usage);
    const locations = input.blueprint.chapters.flatMap((chapter) => chapter.sections.map((section) => ({ sectionId: section.sectionId, movementId: chapter.chapterId })));
    const sections = (sanitised.value.sections as Array<{ heading: NarrativeClaimBlock; paragraphs: NarrativeClaimBlock[]; transition: NarrativeClaimBlock | null }>).map((section, index) => ({ ...locations[index], heading: section.heading, paragraphs: section.paragraphs, ...(section.transition ? { transition: section.transition } : {}) }));
    const spine = sanitised.value.spine as NarrativeManuscript['spine'];
    return {
      schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1',
      bibleVersion: '1.1',
      productTier: input.factPack.productTier,
      organisationName: input.factPack.organisation.name,
      assessmentReference: input.factPack.assessment.reference,
      sections,
      spine: { ...spine, schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: input.factPack.productTier, writerMetadata },
      blueprint: input.blueprint,
      writerMetadata
    };
  }
}

export function createV11WholeManuscriptWriter(model = selectNarrativeModel().requestedModel): WholeManuscriptWriter {
  return new V11WholeManuscriptWriter(model);
}

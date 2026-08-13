import { generateText } from 'ai';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { selectNarrativeModel } from '../ai-model-policy';
import { NarrativeWriterUnavailableError, type WholeManuscriptWriter, type WholeManuscriptWriterInput, type WholeManuscriptWriterMetadata, type WholeManuscriptTextResult } from './manuscript';
import { buildBlueprintMarkdownSkeleton } from './blueprint-text';
import { emptyNarrativeRecoveryBudget } from './recovery-policy';

export const WHOLE_MANUSCRIPT_PROMPT_VERSION = 'mk-fraud-readiness-v1.1-whole-manuscript-blueprint-text-v1';
export const WHOLE_MANUSCRIPT_TIMEOUT_MS = 240_000;

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function sha(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }

function requireProvider(model = selectNarrativeModel().requestedModel): { model: string; provider: string } {
  if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
  return { model, provider: providerFromModel(model) };
}

function generationPrompt(input: WholeManuscriptWriterInput): string {
  const skeleton = buildBlueprintMarkdownSkeleton(input.blueprint);
  return [
    'Write the complete MK Fraud Readiness v1.1 advisory manuscript as Markdown.',
    '',
    'The deterministic Blueprint owns every chapter, section, subsection, order, analytical role, required fact, management takeaway and exhibit. Write only narrative beneath the existing headings in the exact skeleton below.',
    'Do not remove, rename, add or reorder headings. Do not emit a title, preamble, tables, bullets, numbering, code fences, IDs or metadata outside the skeleton. Do not repeat the executive judgement as a new opening in later chapters. Use connected professional prose with natural transitions. Separate diagnosis, evidence, exposure, target state, response, implementation and conclusion by their assigned Blueprint roles.',
    'Use only the deterministic Fact Pack and the permitted claim references assigned to each Blueprint section. Do not invent facts, scores, dates, owners, controls, scenarios, decisions, costs or assurance. Do not claim that MK, the assessment or the report independently verified operating effectiveness. Customer control design may describe what management should independently review or verify.',
    '',
    'WRITE ONLY THE NARRATIVE UNDER THESE EXISTING HEADINGS.',
    '',
    'MARKDOWN SKELETON',
    skeleton.markdown,
    '',
    'DETERMINISTIC REPORT BLUEPRINT',
    JSON.stringify(input.blueprint),
    '',
    'PERMITTED DETERMINISTIC FACTS',
    JSON.stringify(input.context.permittedDeterministicFacts),
    '',
    'BOUNDARIES AND STYLE',
    JSON.stringify({ boundaries: input.context.boundaries, style: input.context.style })
  ].join('\n');
}

function metadata(input: WholeManuscriptWriterInput, provider: string, model: string, response: any, prompt: string): WholeManuscriptWriterMetadata {
  const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
  const inputTokens = numeric(response.usage?.inputTokens);
  const outputTokens = numeric(response.usage?.outputTokens);
  const totalTokens = numeric(response.usage?.totalTokens);
  const providerCostMicros = identity?.gatewayCostMicros;
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
    inputTokens,
    outputTokens,
    totalTokens,
    providerCostMicros,
    executionContract: {
      sdkFunction: 'generateText',
      responseFormat: 'markdown-text',
      structuredOutput: false,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      estimatedInputTokens: Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4),
      maxOutputTokens: input.context.projectedOutputTokens.maximum,
      timeoutMs: WHOLE_MANUSCRIPT_TIMEOUT_MS,
      providerOptions: { gateway: { only: [provider] } }
    },
    recovery: { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1, totalTokens: totalTokens ?? 0, totalProviderCostMicros: providerCostMicros ?? 0 }
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

  async writeManuscript(input: WholeManuscriptWriterInput): Promise<WholeManuscriptTextResult> {
    if (!input.context.singleCallFeasible && input.context.partitionPlan.length < 2) throw new Error('Whole-manuscript context is over the approved limit without a coherent partition plan.');
    const prompt = generationPrompt(input);
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 whole-manuscript advisory writer. The deterministic Blueprint decides the report. Return plain Markdown text only. The application will parse and bind every heading deterministically after generation.',
      prompt,
      maxOutputTokens: input.context.projectedOutputTokens.maximum,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const markdown = String(response.text ?? '').trim();
    if (!markdown) throw new Error('Whole-manuscript text generation returned empty Markdown.');
    return {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript',
      markdown,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt)
    };
  }
}

export function createV11WholeManuscriptWriter(model = selectNarrativeModel().requestedModel): WholeManuscriptWriter {
  return new V11WholeManuscriptWriter(model);
}

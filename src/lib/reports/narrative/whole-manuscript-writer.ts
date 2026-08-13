import { generateText } from 'ai';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { selectNarrativeModel } from '../ai-model-policy';
import { NarrativeWriterUnavailableError, type WholeManuscriptWriter, type WholeManuscriptWriterInput, type WholeManuscriptWriterMetadata, type WholeManuscriptTextResult, type WholeManuscriptTailInput, type WholeManuscriptTailResult, type WholeManuscriptRepairInput, type WholeManuscriptRepairResult, type WholeManuscriptCoherenceInput, type WholeManuscriptCoherenceResult } from './manuscript';
import { appendBlueprintTail, buildBlueprintMarkdownSkeleton, classifyWholeManuscriptGeneration, deriveMissingBlueprintTail, parseBlueprintMarkdown, type MissingBlueprintTail } from './blueprint-text';
import { deriveTailOutputTokenLimit } from './report-blueprint';
import { emptyNarrativeRecoveryBudget } from './recovery-policy';
import { mergeWholeManuscriptRecoveryBudgets, reconcileWholeManuscript, WholeManuscriptReconciliationError } from './whole-manuscript-reconciliation';

export const WHOLE_MANUSCRIPT_PROMPT_VERSION = 'mk-fraud-readiness-v1.1-whole-manuscript-blueprint-text-v1';
export const WHOLE_MANUSCRIPT_TIMEOUT_MS = 240_000;

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function sha(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function textValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }

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

function tailPrompt(input: WholeManuscriptTailInput, tail: MissingBlueprintTail): string {
  const skeleton = buildBlueprintMarkdownSkeleton(input.blueprint);
  return [
    'Complete only the missing tail of the MK Fraud Readiness v1.1 advisory manuscript as Markdown.',
    '',
    'This is a bounded technical truncation recovery. The existing manuscript is preserved. If the preceding context ends mid-sentence, complete only that interrupted sentence under the current final heading; then emit each missing deterministic heading exactly once, followed by its narrative. Do not rewrite, repeat or summarise any complete existing paragraph.',
    'Do not add, rename or reorder headings. Do not emit a title, preamble, tables, bullets, numbering, code fences, IDs or metadata. Use only the deterministic Fact Pack and permitted claim references. Do not invent facts, scores, dates, owners, controls, scenarios, decisions, costs or assurance.',
    '',
    `LAST COMPLETE HEADING: ${input.lastCompleteHeading}`,
    `MISSING HEADINGS IN REQUIRED ORDER: ${JSON.stringify(tail.missingHeadings)}`,
    `EXACT BLUEPRINT CONTINUATION BOUNDARY: ${JSON.stringify(tail.boundary)}`,
    'When the boundary mode is next_heading, begin with the exact next Blueprint heading. When the boundary mode is complete_interrupted_prose_then_headings, complete only the interrupted sentence first and then emit the exact next Blueprint heading. The application rejects any other boundary, overlap or ordering.',
    '',
    'REQUIRED BLUEPRINT HEADING SKELETON',
    skeleton.markdown,
    '',
    'PRECEDING MANUSCRIPT CONTEXT',
    input.precedingContext,
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

function metadata(input: { context: WholeManuscriptWriterInput['context']; blueprint: WholeManuscriptWriterInput['blueprint']; factPack?: unknown }, provider: string, model: string, response: any, prompt: string, maxOutputTokens: number, recovery: WholeManuscriptWriterMetadata['recovery'], architecture: WholeManuscriptWriterMetadata['architecture'] = 'whole-manuscript'): WholeManuscriptWriterMetadata {
  const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
  const inputTokens = numeric(response.usage?.inputTokens);
  const outputTokens = numeric(response.usage?.outputTokens);
  const totalTokens = numeric(response.usage?.totalTokens);
  const rawGatewayCost = response.providerMetadata?.gateway?.cost;
  const providerCostMicros = identity?.gatewayCostMicros;
  const finishReason = textValue(response.finishReason) ?? textValue(response.response?.finishReason);
  const providerFinishReason = textValue(response.providerMetadata?.gateway?.finishReason)
    ?? textValue(response.providerMetadata?.openai?.finishReason)
    ?? textValue(response.response?.body?.choices?.[0]?.finish_reason)
    ?? textValue(response.response?.headers?.['x-provider-finish-reason']);
  return {
    contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
    architecture,
    provider,
    model,
    promptVersion: WHOLE_MANUSCRIPT_PROMPT_VERSION,
    generationMode: 'ai',
    generatedAt: new Date().toISOString(),
    generationId: identity?.identity.generationId,
    responseId: typeof response.response?.id === 'string' ? response.response.id : undefined,
    inputFactPackSha256: sha(input.factPack ?? input.context.permittedDeterministicFacts),
    inputStoryPlanSha256: sha(input.blueprint),
    inputBlueprintSha256: sha(input.blueprint),
    inputTokens,
    outputTokens,
    totalTokens,
    providerCostMicros,
    providerCostRaw: typeof rawGatewayCost === 'string' || typeof rawGatewayCost === 'number' ? rawGatewayCost : undefined,
    finishReason,
    providerFinishReason,
    executionContract: {
      sdkFunction: 'generateText',
      responseFormat: 'markdown-text',
      structuredOutput: false,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      estimatedInputTokens: Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4),
      maxOutputTokens,
      timeoutMs: WHOLE_MANUSCRIPT_TIMEOUT_MS,
      providerOptions: { gateway: { only: [provider] } }
    },
    recovery
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
      maxOutputTokens: input.context.outputBudget.hardOutputTokenLimit,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const markdown = String(response.text ?? '').trim();
    if (!markdown) throw new Error('Whole-manuscript text generation returned empty Markdown.');
    const initialResult: WholeManuscriptTextResult = {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript',
      markdown,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt, input.context.outputBudget.hardOutputTokenLimit, { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1, totalTokens: numeric(response.usage?.totalTokens) ?? 0, totalProviderCostMicros: parseCostMicros(response) })
    };
    const initialParsed = parseBlueprintMarkdown(initialResult.markdown, input.blueprint);
    // A structurally complete manuscript is returned to the caller even when text-first
    // validation identifies an editorial/semantic issue; the existing bounded semantic-repair
    // policy owns that path. Only a structurally incomplete, proven truncation may enter tail
    // reconciliation here.
    if (initialParsed.ok) return initialResult;

    const missing = deriveMissingBlueprintTail(initialResult.markdown, input.blueprint);
    const initialOutcome = classifyWholeManuscriptGeneration({
      finishReason: initialResult.writerMetadata.finishReason,
      providerFinishReason: initialResult.writerMetadata.providerFinishReason,
      outputTokens: initialResult.writerMetadata.outputTokens,
      maxOutputTokens: initialResult.writerMetadata.executionContract?.maxOutputTokens,
      missingHeadingCount: missing.missingHeadings.length
    });
    if (initialOutcome !== 'TECHNICAL_TRUNCATION' || !missing.ok) {
      throw new WholeManuscriptReconciliationError('initial_manuscript_not_recoverable', 'Initial whole-manuscript generation did not produce a valid complete manuscript or a proven technical-truncation prefix.', { outcome: initialOutcome, parsed: initialParsed.errors, missing: missing.errors });
    }
    const tailResult = await this.completeTail({
      context: input.context,
      blueprint: input.blueprint,
      previousMarkdown: initialResult.markdown,
      missingHeadings: missing.missingHeadings,
      lastCompleteHeading: missing.lastCompleteHeading,
      precedingContext: missing.precedingContext,
      boundary: missing.boundary
    });
    const reconciled = reconcileWholeManuscript({
      initialMarkdown: initialResult.markdown,
      continuationMarkdown: tailResult.continuationMarkdown,
      blueprint: input.blueprint,
      factPack: input.factPack,
      initialOutputTokens: initialResult.writerMetadata.outputTokens,
      initialMaxOutputTokens: initialResult.writerMetadata.executionContract?.maxOutputTokens,
      initialFinishReason: initialResult.writerMetadata.finishReason,
      initialProviderFinishReason: initialResult.writerMetadata.providerFinishReason
    });
    const initialMeta = initialResult.writerMetadata;
    const tailMeta = tailResult.writerMetadata;
    return {
      ...initialResult,
      markdown: reconciled.markdown,
      writerMetadata: {
        ...initialMeta,
        generatedAt: tailMeta.generatedAt,
        generationId: tailMeta.generationId ?? initialMeta.generationId,
        responseId: tailMeta.responseId ?? initialMeta.responseId,
        inputTokens: sumOptional(initialMeta.inputTokens, tailMeta.inputTokens),
        outputTokens: sumOptional(initialMeta.outputTokens, tailMeta.outputTokens),
        totalTokens: sumOptional(initialMeta.totalTokens, tailMeta.totalTokens),
        providerCostMicros: sumOptional(initialMeta.providerCostMicros, tailMeta.providerCostMicros),
        providerCostRaw: sumRawCosts(initialMeta.providerCostRaw, tailMeta.providerCostRaw),
        finishReason: tailMeta.finishReason ?? initialMeta.finishReason,
        providerFinishReason: tailMeta.providerFinishReason ?? initialMeta.providerFinishReason,
        recovery: mergeWholeManuscriptRecoveryBudgets(initialMeta.recovery, tailMeta.recovery)
      }
    };
  }

  async completeTail(input: WholeManuscriptTailInput): Promise<WholeManuscriptTailResult> {
    const tail = deriveMissingBlueprintTail(input.previousMarkdown, input.blueprint);
    if (!tail.ok || !tail.missingHeadings.length) throw new Error(`Tail completion requires a deterministic missing suffix: ${tail.errors.join(' | ')}`);
    const prompt = tailPrompt(input, tail);
    const maxOutputTokens = deriveTailOutputTokenLimit(input.context.outputBudget, tail.missingHeadings.length);
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 tail-completion writer. The deterministic Blueprint decides the report. Return only the missing Markdown tail; never rewrite existing content.',
      prompt,
      maxOutputTokens,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const markdown = String(response.text ?? '').trim();
    if (!markdown) throw new Error('Whole-manuscript tail completion returned empty Markdown.');
    const appended = appendBlueprintTail(input.previousMarkdown, markdown, input.blueprint);
    const totalTokens = numeric(response.usage?.totalTokens) ?? 0;
    return {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript-tail-completion',
      markdown: appended,
      continuationMarkdown: markdown,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt, maxOutputTokens, { ...emptyNarrativeRecoveryBudget(), truncationContinuationCount: 1, totalCalls: 1, totalTokens, totalProviderCostMicros: parseCostMicros(response) })
    };
  }

  async repairBlock(input: WholeManuscriptRepairInput): Promise<WholeManuscriptRepairResult> {
    const permittedFacts = input.permittedFacts.map((fact) => ({ id: fact.id, kind: fact.kind, value: fact.value }));
    const prompt = [
      'Repair one bounded customer-facing prose block in an MK Fraud Readiness v1.1 manuscript.',
      '',
      'This is a targeted semantic correction, not a report regeneration. Return only the replacement prose for the target block. Do not return a heading, bullets, labels, IDs, claim references, metadata, commentary or code fences.',
      'Preserve the deterministic meaning exactly. Do not change any score, maturity, finding, scenario, control, owner, timing, decision, roadmap, fact or Blueprint hierarchy.',
      'The assurance boundary remains strict: do not imply that MK, the assessment, the report or any external reviewer independently verified evidence or operating effectiveness. Customer-owned control design may describe what management should independently review or verify.',
      '',
      `REPAIR SCOPE: ${input.scope}`,
      `FAILING PATH: ${input.failingPath}`,
      `VALIDATION CODE: ${input.validationCode}`,
      `MATCHED PHRASE: ${input.matchedPhrase ?? '(not exposed)'}`,
      `TARGET BLOCK:\n${input.targetText}`,
      `IMMEDIATELY RELEVANT CONTEXT:\n${input.surroundingProse}`,
      `PERMITTED FACTS:\n${JSON.stringify(permittedFacts)}`,
      `PERMITTED CLAIM REFS: ${JSON.stringify(input.permittedClaimRefs)}`,
      `REQUIRED MANAGEMENT TAKEAWAY: ${input.requiredManagementTakeaway}`,
      `ASSURANCE BOUNDARY: ${input.assuranceBoundary}`
    ].join('\n');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 targeted semantic repair writer. Return only safe replacement prose for the bounded block.',
      prompt,
      maxOutputTokens: 900,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const repairedText = String(response.text ?? '').trim();
    if (!repairedText) throw new Error('Targeted semantic repair returned empty prose.');
    return {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript-targeted-repair',
      repairedText,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt, 900, { ...emptyNarrativeRecoveryBudget(), targetedRepairCount: 1, totalCalls: 1, totalTokens: numeric(response.usage?.totalTokens) ?? 0, totalProviderCostMicros: parseCostMicros(response) }, 'whole-manuscript-targeted-repair')
    };
  }

  async coherencePass(input: WholeManuscriptCoherenceInput): Promise<WholeManuscriptCoherenceResult> {
    const prompt = [
      'Perform one bounded editorial coherence pass over this complete MK Fraud Readiness v1.1 manuscript.',
      '',
      'Return the complete Markdown manuscript with every existing Blueprint heading in the exact same order. Preserve every heading and every deterministic fact. Smooth transitions, remove only genuine repetition and improve connected professional rhythm. Do not add analytical content, identifiers, tables, bullets, metadata or assurance claims.',
      'Do not claim that MK, the assessment, the report or any reviewer independently verified evidence or operating effectiveness.',
      '',
      'BLUEPRINT',
      JSON.stringify(input.blueprint),
      '',
      'CURRENT MANUSCRIPT',
      input.previousMarkdown
    ].join('\n');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 coherence editor. Return only the complete Markdown manuscript.',
      prompt,
      maxOutputTokens: input.context.outputBudget.hardOutputTokenLimit,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
    const markdown = String(response.text ?? '').trim();
    if (!markdown) throw new Error('Whole-manuscript coherence pass returned empty Markdown.');
    return {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript-coherence',
      markdown,
      blueprint: input.blueprint,
      writerMetadata: metadata(input, this.provider, this.model, response, prompt, input.context.outputBudget.hardOutputTokenLimit, { ...emptyNarrativeRecoveryBudget(), coherenceCount: 1, totalCalls: 1, totalTokens: numeric(response.usage?.totalTokens) ?? 0, totalProviderCostMicros: parseCostMicros(response) }, 'whole-manuscript-coherence')
    };
  }
}

function sumOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function sumRawCosts(a: string | number | undefined, b: string | number | undefined): string | number | undefined {
  if (a === undefined && b === undefined) return undefined;
  const left = typeof a === 'number' ? a : Number(a ?? 0);
  const right = typeof b === 'number' ? b : Number(b ?? 0);
  if (Number.isFinite(left) && Number.isFinite(right)) return left + right;
  return [a, b].filter((value) => value !== undefined).join(' + ');
}

function parseCostMicros(response: any): number {
  const raw = response.providerMetadata?.gateway?.cost;
  const numericCost = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(numericCost) ? Math.round(numericCost * 1_000_000) : 0;
}

export function createV11WholeManuscriptWriter(model = selectNarrativeModel().requestedModel): WholeManuscriptWriter {
  return new V11WholeManuscriptWriter(model);
}

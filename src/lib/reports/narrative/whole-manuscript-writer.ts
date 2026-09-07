import { generateText } from 'ai';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { selectNarrativeModel } from '../ai-model-policy';
import { NarrativeWriterUnavailableError, type WholeManuscriptWriter, type WholeManuscriptWriterInput, type WholeManuscriptWriterMetadata, type WholeManuscriptTextResult, type WholeManuscriptTailInput, type WholeManuscriptTailResult, type WholeManuscriptRepairInput, type WholeManuscriptRepairResult, type WholeManuscriptCoherenceInput, type WholeManuscriptCoherenceResult } from './manuscript';
import { appendBlueprintTail, buildBlueprintMarkdownSkeleton, classifyWholeManuscriptGeneration, deriveMissingBlueprintTail, parseBlueprintMarkdown, type MissingBlueprintTail } from './blueprint-text';
import { deriveTailOutputTokenLimit } from './report-blueprint';
import { emptyNarrativeRecoveryBudget } from './recovery-policy';
import { mergeWholeManuscriptRecoveryBudgets, reconcileWholeManuscript, WholeManuscriptReconciliationError } from './whole-manuscript-reconciliation';
import { buildManuscriptStructuralDiagnostics } from './manuscript-diagnostics';

export const WHOLE_MANUSCRIPT_PROMPT_VERSION = 'mk-fraud-readiness-v1.1-whole-manuscript-blueprint-text-v1';
export const WHOLE_MANUSCRIPT_TIMEOUT_MS = 240_000;

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function sha(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function textValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }

// Alignment metadata is required by the deterministic binder, but exposing raw IDs in
// the prose-writing prompt encourages the model to copy them into customer narrative.
// Give the writer the same evidence and plain-language blueprint shape without the
// identifiers that are only meaningful to the application.
const WRITER_ALIGNMENT_KEYS = new Set([
  'id', 'chapterId', 'sectionId', 'subsectionId', 'exhibitId', 'clusterId', 'contentRef',
  'factRef', 'sourceId', 'sourceRefs', 'claimRefs', 'requiredFacts', 'linkedFindingIds',
  'linkedScenarioIds', 'linkedControlIds', 'linkedDecisionIds', 'linkedRoadmapIds',
  'linkedFindingRefs', 'linkedRiskRefs', 'linkedSustainmentPriorityRefs', 'sourceFindingRef',
  'sourceSustainmentPriorityRef', 'canonicalScenarioId', 'contentAssignments',
  'narrativeCrossReferences', 'narrativeRoleUsage', 'ledger', 'factUsage', 'findingUsage',
  'scenarioUsage', 'controlUsage'
]);
const WRITER_ALIGNMENT_TOKEN = /\b(?:D\d+-Q\d+|SCENARIO-\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;

function writerFacingPayload(value: unknown, key?: string): unknown {
  if (key && WRITER_ALIGNMENT_KEYS.has(key)) return undefined;
  if (typeof value === 'string') return value.replace(WRITER_ALIGNMENT_TOKEN, '[alignment reference]');
  if (Array.isArray(value)) return value.map((item) => writerFacingPayload(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([entryKey, entryValue]) => {
      const projected = writerFacingPayload(entryValue, entryKey);
      return projected === undefined ? [] : [[entryKey, projected]];
    }));
  }
  return value;
}

function requireProvider(model = selectNarrativeModel().requestedModel): { model: string; provider: string } {
  const runningOnVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  if (!model || (!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) && !runningOnVercel)) throw new NarrativeWriterUnavailableError();
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
    // The validator rejects customer assertions the assessment never established. The
    // writer was never told about them, so it produced one and the manuscript failed
    // after a paid call. Both sides now state the same boundary.
    'CUSTOMER FACT BOUNDARY. Do not compare this organisation with peers, similar-sized organisations, industry averages, benchmarks, medians or percentiles unless an explicit deterministic benchmark fact is supplied. Do not infer or state employee or staff counts. Do not say or imply that knowledge or control responsibility sits with "one or two people", "a single employee" or any other invented concentration of people. Do not invent organisational structures, committees, executive titles or functions; use only those present in the permitted deterministic facts. Where a fact is not in the permitted deterministic material, express the management implication without inventing it.',
    'NUMERIC FACT BOUNDARY. Do not write a numeral, percentage, date, duration, count or other numeric claim unless that exact value is present in the permitted deterministic facts for the paragraph. When a number is not needed, use qualitative wording such as "the recorded position" or "the identified pathway". Never use an approximate or invented count to make prose sound concrete.',
    'IDENTIFIER BOUNDARY. Any alignment references that appear in the supplied JSON are metadata only. Never copy an ID, claim reference, Blueprint key or placeholder such as [alignment reference] into narrative prose. Refer to the plain-language subject instead.',
    'PUNCTUATION BOUNDARY. The Unicode em dash character (U+2014, —) is forbidden. If a sentence needs a pause, use a comma, colon or full stop.',
    '',
    `PROHIBITED CLAIMS: ${(input.context.boundaries?.prohibitedClaims ?? []).join('; ') || '(none supplied)'}`,
    'WRITE ONLY THE NARRATIVE UNDER THESE EXISTING HEADINGS.',
    '',
    'MARKDOWN SKELETON',
    skeleton.markdown,
    '',
    'DETERMINISTIC REPORT BLUEPRINT',
    JSON.stringify(writerFacingPayload(input.blueprint)),
    '',
    'PERMITTED DETERMINISTIC FACTS',
    JSON.stringify(writerFacingPayload(input.context.permittedDeterministicFacts)),
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
    // The validator rejects customer assertions the assessment never established. The
    // writer was never told about them, so it produced one and the manuscript failed
    // after a paid call. Both sides now state the same boundary.
    'CUSTOMER FACT BOUNDARY. Do not compare this organisation with peers, similar-sized organisations, industry averages, benchmarks, medians or percentiles unless an explicit deterministic benchmark fact is supplied. Do not infer or state employee or staff counts. Do not say or imply that knowledge or control responsibility sits with "one or two people", "a single employee" or any other invented concentration of people. Do not invent organisational structures, committees, executive titles or functions; use only those present in the permitted deterministic facts. Where a fact is not in the permitted deterministic material, express the management implication without inventing it.',
    'NUMERIC FACT BOUNDARY. Do not write a numeral, percentage, date, duration, count or other numeric claim unless that exact value is present in the permitted deterministic facts for the paragraph. When a number is not needed, use qualitative wording such as "the recorded position" or "the identified pathway". Never use an approximate or invented count to make prose sound concrete.',
    'IDENTIFIER BOUNDARY. Any alignment references that appear in the supplied JSON are metadata only. Never copy an ID, claim reference, Blueprint key or placeholder such as [alignment reference] into narrative prose. Refer to the plain-language subject instead.',
    'PUNCTUATION BOUNDARY. The Unicode em dash character (U+2014, —) is forbidden. If a sentence needs a pause, use a comma, colon or full stop.',
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
    JSON.stringify(writerFacingPayload(input.blueprint)),
    '',
    'PERMITTED DETERMINISTIC FACTS',
    JSON.stringify(writerFacingPayload(input.context.permittedDeterministicFacts)),
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

export type StructuralBindingAction = 'ACCEPT' | 'TAIL_COMPLETION' | 'TECHNICAL_REGENERATION';

/**
 * The single deterministic discriminator for a structurally non-conforming manuscript.
 *
 * ACCEPT                 the manuscript binds to the Blueprint exactly.
 * TAIL_COMPLETION        deriveMissingBlueprintTail() proved a clean deterministic prefix and a
 *                        missing suffix, and the generation classifies as technical truncation.
 * TECHNICAL_REGENERATION the prefix cannot be proven, so no prose may be re-bound. Only a
 *                        bounded technical-format regeneration is permitted.
 *
 * It never inspects prose and never guesses which text belongs to which Blueprint node.
 */
export function resolveStructuralBindingAction(input: {
  parsedOk: boolean;
  missing: MissingBlueprintTail;
  generationOutcome: string;
}): StructuralBindingAction {
  if (input.parsedOk) return 'ACCEPT';
  if (input.missing.ok && input.generationOutcome === 'TECHNICAL_TRUNCATION') return 'TAIL_COMPLETION';
  return 'TECHNICAL_REGENERATION';
}

export class V11WholeManuscriptWriter implements WholeManuscriptWriter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion = WHOLE_MANUSCRIPT_PROMPT_VERSION;

  /**
   * Optional ceiling on provider requests for one writeManuscript call.
   *
   * Recovery is unchanged by default. Acceptance runs set this to 1 so a single Generate
   * cannot silently spend a second call on tail completion, semantic repair or a
   * coherence pass -- which is how two calls were consumed and billed while the system
   * recorded none. Exceeding it fails closed rather than dispatching.
   */
  private readonly providerCallBudget: number;
  private providerCallsUsed = 0;

  constructor(model = selectNarrativeModel().requestedModel, options: { providerCallBudget?: number } = {}) {
    const resolved = requireProvider(model);
    this.provider = resolved.provider;
    this.model = resolved.model;
    this.providerCallBudget = options.providerCallBudget ?? Number.POSITIVE_INFINITY;
  }

  /** Charged immediately before every provider request. */
  private chargeProviderCall(kind: string): void {
    if (this.providerCallsUsed >= this.providerCallBudget) {
      const error = new Error(`provider_call_budget_exhausted: ${kind} would exceed the ${this.providerCallBudget}-call ceiling for this generation.`);
      (error as { code?: string }).code = 'provider_call_budget_exhausted';
      throw error;
    }
    this.providerCallsUsed += 1;
    console.info('essential_manuscript_provider_dispatch_authorised', {
      kind,
      provider: this.provider,
      model: this.model,
      router: 'vercel_ai_gateway',
      dispatchOccurred: true,
      providerCallNumber: this.providerCallsUsed,
      providerCallBudget: Number.isFinite(this.providerCallBudget) ? this.providerCallBudget : null
    });
  }

  /**
   * One bounded technical-format regeneration for a structurally non-conforming manuscript.
   *
   * Nothing analytical changes: the same deterministic Blueprint and Fact Pack are re-sent. No
   * prose is remapped and no semantic repair runs, because structural binding has not yet
   * succeeded. The second response must parse exactly against the Blueprint or this fails
   * closed; there is no third structural attempt.
   *
   * It is charged as its own provider-call kind and recorded as technicalFallbackCount, so it
   * stays distinguishable from the semantic adjudication and repair budgets.
   */
  private async regenerateForStructuralBinding(
    input: WholeManuscriptWriterInput,
    initialResult: WholeManuscriptTextResult,
    initialParsed: ReturnType<typeof parseBlueprintMarkdown>,
    initialMissing: MissingBlueprintTail,
    initialOutcome: string
  ): Promise<WholeManuscriptTextResult> {
    const failClosed = (stage: string, message: string, detail: Record<string, unknown>, result: WholeManuscriptTextResult, parsed: ReturnType<typeof parseBlueprintMarkdown>, technicalRegenerations: number) => {
      const failure = new WholeManuscriptReconciliationError('initial_manuscript_not_recoverable', message, detail);
      (failure as { writerDiagnostics?: unknown }).writerDiagnostics = {
        stage,
        writerMetadata: result.writerMetadata,
        classification: 'STRUCTURAL_BINDING_FAILURE',
        missingTail: { ok: initialMissing.ok, missingHeadingCount: initialMissing.missingHeadings.length, lastCompleteHeading: initialMissing.lastCompleteHeading, errors: initialMissing.errors },
        providerCalls: this.providerCallsUsed,
        technicalRegenerations,
        structural: buildManuscriptStructuralDiagnostics({ markdown: result.markdown, blueprint: input.blueprint, parsed })
      };
      throw failure;
    };

    let response;
    const prompt = generationPrompt(input);
    try {
      this.chargeProviderCall('technical_structural_regeneration');
      response = await this.dispatchGeneration({
        system: 'You are the constrained MK Fraud Readiness v1.1 whole-manuscript advisory writer. The previous response did not match the deterministic Blueprint heading contract. Reproduce every Blueprint heading exactly once, at exactly the given level, in exactly the given order, with the given text unchanged, and write prose only under each heading. Never copy alignment IDs, numeric metadata or [alignment reference] placeholders from the supplied JSON into narrative prose. Never emit the Unicode em dash character U+2014. Return plain Markdown text only.',
        prompt,
        maxOutputTokens: input.context.outputBudget.hardOutputTokenLimit
      });
    } catch (error) {
      // The ceiling refused the second call, or the provider failed. Either way the original
      // structural failure stands and nothing further is attempted.
      failClosed('initial_manuscript_not_recoverable', 'Structural binding failed and the bounded technical regeneration could not be dispatched.', { outcome: initialOutcome, parsed: initialParsed.errors, missing: initialMissing.errors, regeneration: error instanceof Error ? error.message : String(error) }, initialResult, initialParsed, 0);
      throw error;
    }

    const markdown = String(response.text ?? '').trim();
    const recovery = {
      ...emptyNarrativeRecoveryBudget(),
      initialGenerationCount: 1,
      technicalFallbackCount: 1,
      totalCalls: 2,
      totalTokens: (initialResult.writerMetadata.recovery.totalTokens ?? 0) + (numeric(response.usage?.totalTokens) ?? 0),
      totalProviderCostMicros: (initialResult.writerMetadata.recovery.totalProviderCostMicros ?? 0) + parseCostMicros(response)
    };
    // Production persistence reads the top-level writerMetadata token and cost fields, so a
    // successful two-call recovery must return the combined spend for both provider calls, not
    // just the second response. This follows the existing tail-reconciliation aggregation:
    // the second call's generation and response identity is retained, the spend is summed.
    const initialMeta = initialResult.writerMetadata;
    const regeneratedMeta = metadata(input, this.provider, this.model, response, prompt, input.context.outputBudget.hardOutputTokenLimit, recovery);
    const regenerated: WholeManuscriptTextResult = {
      contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
      architecture: 'whole-manuscript',
      markdown,
      blueprint: input.blueprint,
      writerMetadata: {
        ...regeneratedMeta,
        inputTokens: sumOptional(initialMeta.inputTokens, regeneratedMeta.inputTokens),
        outputTokens: sumOptional(initialMeta.outputTokens, regeneratedMeta.outputTokens),
        totalTokens: sumOptional(initialMeta.totalTokens, regeneratedMeta.totalTokens),
        providerCostMicros: sumOptional(initialMeta.providerCostMicros, regeneratedMeta.providerCostMicros),
        providerCostRaw: sumRawCosts(initialMeta.providerCostRaw, regeneratedMeta.providerCostRaw)
      }
    };
    if (!markdown) failClosed('technical_regeneration_not_recoverable', 'The bounded technical regeneration returned empty Markdown.', { outcome: initialOutcome, parsed: initialParsed.errors }, regenerated, initialParsed, 1);
    const reparsed = parseBlueprintMarkdown(markdown, input.blueprint);
    if (!reparsed.ok) {
      failClosed('technical_regeneration_not_recoverable', 'The bounded technical regeneration still did not bind to the deterministic Blueprint.', { outcome: initialOutcome, parsed: reparsed.errors, initialParsed: initialParsed.errors }, regenerated, reparsed, 1);
    }
    return regenerated;
  }

  /** Single provider seam. Overridden only by provider-free structural-recovery tests. */
  protected async dispatchGeneration(args: { system: string; prompt: string; maxOutputTokens: number }): Promise<any> {
    return generateText({
      model: this.model,
      system: args.system,
      prompt: args.prompt,
      maxOutputTokens: args.maxOutputTokens,
      maxRetries: 0,
      providerOptions: { gateway: { only: [this.provider] } },
      abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
    });
  }

  async writeManuscript(input: WholeManuscriptWriterInput): Promise<WholeManuscriptTextResult> {
    if (!input.context.singleCallFeasible && input.context.partitionPlan.length < 2) throw new Error('Whole-manuscript context is over the approved limit without a coherent partition plan.');
    const prompt = generationPrompt(input);
    this.chargeProviderCall('initial');
    const response = await this.dispatchGeneration({
      system: 'You are the constrained MK Fraud Readiness v1.1 whole-manuscript advisory writer. The deterministic Blueprint decides the report. Never copy alignment IDs, numeric metadata or [alignment reference] placeholders from the supplied JSON into narrative prose. Never emit the Unicode em dash character U+2014. Return plain Markdown text only. The application will parse and bind every heading deterministically after generation.',
      prompt,
      maxOutputTokens: input.context.outputBudget.hardOutputTokenLimit
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
    // Structural binding is decided on deterministic evidence, never on a presumed label.
    // The previous semantic-safety branch threw here and stamped the failure
    // SEMANTIC_SAFETY_TECHNICAL_TRUNCATION before deriveMissingBlueprintTail() had run, so a
    // renamed, reordered or mis-levelled manuscript was reported as truncation and no bounded
    // technical recovery was ever attempted. The derivation below is the only discriminator:
    // it proves a clean deterministic prefix with a missing suffix, or it does not.
    if (input.semanticSafety && !initialParsed.ok) {
      const semanticMissing = deriveMissingBlueprintTail(initialResult.markdown, input.blueprint);
      const semanticOutcome = classifyWholeManuscriptGeneration({
        finishReason: initialResult.writerMetadata.finishReason,
        providerFinishReason: initialResult.writerMetadata.providerFinishReason,
        outputTokens: initialResult.writerMetadata.outputTokens,
        maxOutputTokens: initialResult.writerMetadata.executionContract?.maxOutputTokens,
        missingHeadingCount: semanticMissing.missingHeadings.length
      });
      // A proven technical truncation keeps the existing bounded tail path below.
      if (resolveStructuralBindingAction({ parsedOk: initialParsed.ok, missing: semanticMissing, generationOutcome: semanticOutcome }) === 'TECHNICAL_REGENERATION') {
        // The prefix cannot be proven, so no prose may be re-bound heuristically. One explicit
        // technical-format regeneration is permitted against the same Blueprint and Fact Pack.
        // It is a separately counted operation and never consumes a semantic adjudication or
        // repair slot. The second response must parse exactly or this fails closed.
        return await this.regenerateForStructuralBinding(input, initialResult, initialParsed, semanticMissing, semanticOutcome);
      }
    }
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
      // This is the exact path a non-conforming but complete manuscript takes, and it is
      // where the evidence has to be captured: the caller never receives initialResult,
      // so anything not attached here is lost with the throw -- which is how a paid
      // generation failed leaving no record of which heading disagreed.
      const failure = new WholeManuscriptReconciliationError('initial_manuscript_not_recoverable', 'Initial whole-manuscript generation did not produce a valid complete manuscript or a proven technical-truncation prefix.', { outcome: initialOutcome, parsed: initialParsed.errors, missing: missing.errors });
      (failure as { writerDiagnostics?: unknown }).writerDiagnostics = {
        stage: 'initial_manuscript_not_recoverable',
        writerMetadata: initialResult.writerMetadata,
        classification: initialOutcome,
        missingTail: { ok: missing.ok, missingHeadingCount: missing.missingHeadings.length, lastCompleteHeading: missing.lastCompleteHeading, errors: missing.errors },
        providerCalls: this.providerCallsUsed,
        structural: buildManuscriptStructuralDiagnostics({ markdown: initialResult.markdown, blueprint: input.blueprint, parsed: initialParsed })
      };
      throw failure;
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
    this.chargeProviderCall('tail');
    const response = await this.dispatchGeneration({
      system: 'You are the constrained MK Fraud Readiness v1.1 tail-completion writer. The deterministic Blueprint decides the report. Do not use em dashes. Use normal sentence punctuation instead. Return only the missing Markdown tail; never rewrite existing content.',
      prompt,
      maxOutputTokens
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
      'The assurance boundary remains strict: do not imply that MK, the assessment, the report or any external reviewer independently verified evidence or operating effectiveness. Customer-owned control design may describe what management should independently review or verify. Do not use em dashes. Use normal sentence punctuation instead.',
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
    this.chargeProviderCall('repair');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 targeted semantic repair writer. Do not use em dashes. Use normal sentence punctuation instead. Return only safe replacement prose for the bounded block.',
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
      'Do not claim that MK, the assessment, the report or any reviewer independently verified evidence or operating effectiveness. Do not use em dashes. Use normal sentence punctuation instead.',
      ...(input.editorialBrief ? ['', 'OWNER-DIRECTED EDITORIAL BRIEF', input.editorialBrief] : []),
      '',
      'BLUEPRINT',
      JSON.stringify(input.blueprint),
      '',
      'CURRENT MANUSCRIPT',
      input.previousMarkdown
    ].join('\n');
    this.chargeProviderCall('coherence');
    const response = await generateText({
      model: this.model,
      system: 'You are the constrained MK Fraud Readiness v1.1 coherence editor. Do not use em dashes. Use normal sentence punctuation instead. Return only the complete Markdown manuscript.',
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

export function createV11WholeManuscriptWriter(model = selectNarrativeModel().requestedModel, options: { providerCallBudget?: number } = {}): WholeManuscriptWriter {
  return new V11WholeManuscriptWriter(model, options);
}

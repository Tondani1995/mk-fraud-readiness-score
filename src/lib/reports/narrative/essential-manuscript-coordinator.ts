import type { NarrativeFactPack } from './fact-pack';
import type { WholeManuscriptWriter, WholeManuscriptTextResult } from './manuscript';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from './story-plan';
import { buildReportBlueprint, buildWholeManuscriptContext, type ReportBlueprint } from './report-blueprint';
import { buildManuscriptStructuralDiagnostics, type ManuscriptStructuralDiagnostics } from './manuscript-diagnostics';
import { WHOLE_MANUSCRIPT_TIMEOUT_MS } from './whole-manuscript-writer';
import {
  parseBlueprintMarkdown,
  providerAuthoredNarrativeBlocks,
  validateBlueprintTextManuscript,
  type ParsedBlueprintMarkdown
} from './blueprint-text';
import { normaliseProhibitedAssessmentAssurance } from './assurance-boundary-normalisation';
import {
  assertTextFirstValidationCascade,
  adjudicateTextFirstValidation,
  EssentialValidationCascadeError,
  essentialCandidateId,
  type EssentialValidationCascadeResult
} from '../essential-validation-cascade';
import { replaceTargetBlock } from './whole-manuscript-recovery';
import {
  validateSemanticReviewResult,
  type EssentialSemanticReviewer,
  type SemanticReviewCandidateInput,
  type SemanticReviewDecision,
  type SemanticReviewDiagnostics,
  type SemanticReviewResult
} from './semantic-reviewer';

/**
 * The Essential production narrative path.
 *
 * Essential manual fulfilment used to call preparePremiumReportNarrative, which the v1.1
 * release boundary closed unconditionally, so no Essential report could be produced at
 * all. Every part needed to replace it already existed -- blueprint, story plan, whole
 * manuscript writer, parser, validator, recovery -- but nothing composed them at runtime.
 * This is that composition and nothing more.
 *
 * It deliberately owns no analytical judgement. The blueprint decides what must be
 * written and in what order, the writer produces prose against it, and the canonical
 * validation cascade decides whether detector findings survive contextual and evidence
 * adjudication. Scores, findings, risks, controls, roadmap actions and evidence remain the
 * deterministic pipeline's, and nothing here reads a number back out of provider prose.
 */
export interface EssentialManuscriptResult {
  narrative: ParsedBlueprintMarkdown;
  blueprint: ReportBlueprint;
  manuscript: WholeManuscriptTextResult;
  /**
   * Owner decision 4: content-addressed identities of assurance-language sentences already cleared
   * to ALLOW_CONTEXT by the manuscript-stage validation cascade, so the final-HTML validation stage
   * (validateEssentialFinalHtml's carryForwardAssuranceSpanHashes input) can inherit this decision
   * for byte-identical content rather than re-adjudicating it from scratch.
   */
  acceptedAssuranceSpanHashes: string[];
  acceptedSemanticDecisions: Array<{ ruleCode: string; path: string; spanHash: string; reasonCode: string }>;
}

/** Evidence the writer attaches when it rejects its own initial response. */
export interface WriterFailureDiagnostics {
  stage: string;
  writerMetadata?: Record<string, any>;
  classification?: string;
  missingTail?: { ok: boolean; missingHeadingCount: number; lastCompleteHeading?: string; errors: string[] };
  providerCalls?: number;
  structural?: ManuscriptStructuralDiagnostics;
}

export type EssentialProviderFailureCategory =
  | 'timeout'
  | 'network'
  | 'provider_http'
  | 'empty_response'
  | 'provider_sdk'
  | 'writer_preflight'
  | 'unknown';

export interface EssentialProviderFailureDiagnostics {
  errorName?: string;
  errorCode?: string;
  errorCategory: EssentialProviderFailureCategory;
  safeErrorMessage?: string;
  httpStatus?: number;
  providerRequestId?: string;
  elapsedWriterMs: number;
  configuredTimeoutMs: number;
  maxOutputTokens?: number;
  accountingStatus: 'recorded' | 'dispatched_settlement_unknown' | 'not_dispatched';
}

export interface EssentialManuscriptDiagnostics {
  stage: string;
  requestedModel?: string;
  requestedProvider?: string;
  dispatchOccurred: boolean;
  generationId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  finishReason?: string;
  providerFinishReason?: string;
  providerCalls?: number;
  manuscriptProviderCalls?: number;
  semanticReviewProviderCalls?: number;
  totalProviderCalls?: number;
  semanticReviewDiagnostics?: SemanticReviewDiagnostics;
  providerFailure?: EssentialProviderFailureDiagnostics;
  parseOk?: boolean;
  parseErrors?: Array<{ code: string; path: string }>;
  validationCode?: string;
  /** Every surviving hard-truth/contract rule, so a rejection names itself. */
  validationIssues?: Array<{ code: string; path: string; message: string }>;
  /** Heading-level evidence for a manuscript that would not bind. */
  structural?: ManuscriptStructuralDiagnostics;
  /** Outcome of classifyWholeManuscriptGeneration, when the writer rejected the response. */
  classification?: string;
  missingTail?: { ok: boolean; missingHeadingCount: number; lastCompleteHeading?: string; errors: string[] };
}

export class EssentialManuscriptError extends Error {
  readonly stage: string;
  readonly diagnostics: EssentialManuscriptDiagnostics;

  constructor(stage: string, message: string, diagnostics?: Partial<EssentialManuscriptDiagnostics>) {
    super(message);
    this.name = 'EssentialManuscriptError';
    this.stage = stage;
    this.diagnostics = { stage, dispatchOccurred: false, ...diagnostics };
  }
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, any> : undefined;
}

function boundedSafeMessage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-key]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted-token]')
    .replace(/((?:AI_GATEWAY_API_KEY|VERCEL_AI_GATEWAY_API_KEY)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted-key]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 300) || undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 160);
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function headerValue(headers: unknown, name: string): string | undefined {
  const record = asRecord(headers);
  if (!record) return undefined;
  const direct = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  if (typeof direct === 'string' && direct.trim()) return direct.trim().slice(0, 160);
  if (typeof record.get === 'function') {
    try {
      const value = record.get(name);
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 160);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function providerFailureCategory(input: { name?: string; code?: string; message?: string; status?: number; preflight: boolean }): EssentialProviderFailureCategory {
  if (input.preflight) return 'writer_preflight';
  const joined = `${input.name ?? ''} ${input.code ?? ''} ${input.message ?? ''}`.toLowerCase();
  if (/abort|timeout|timed out|etimedout|headers_timeout|connect_timeout/.test(joined)) return 'timeout';
  if (/econnreset|econnrefused|enotfound|eai_again|socket|network|fetch failed|connection/.test(joined)) return 'network';
  if (input.status !== undefined && input.status >= 400) return 'provider_http';
  if (/empty markdown|empty response|no text/.test(joined)) return 'empty_response';
  if (/ai_|aisdk|api call|provider|gateway/.test(joined)) return 'provider_sdk';
  return 'unknown';
}

/**
 * Build a bounded, customer-content-free description of a thrown writer/provider error.
 *
 * The provider SDK is not consistent about where it places status, request ID or the
 * underlying error code. This deliberately inspects only known metadata fields and never
 * serialises response bodies, prompts, customer prose or arbitrary nested objects.
 */
export function describeEssentialWriterFailure(input: {
  error: unknown;
  elapsedWriterMs: number;
  configuredTimeoutMs?: number;
  maxOutputTokens?: number;
  dispatchOccurred: boolean;
  providerCallsRecorded?: number;
}): EssentialProviderFailureDiagnostics {
  const error = asRecord(input.error);
  const cause = asRecord(error?.cause);
  const response = asRecord(error?.response);
  const causeResponse = asRecord(cause?.response);
  const errorName = firstText(error?.name, input.error instanceof Error ? input.error.name : undefined);
  const errorCode = firstText(error?.code, cause?.code, error?.type, cause?.type);
  const safeErrorMessage = boundedSafeMessage(
    firstText(error?.message, cause?.message, input.error instanceof Error ? input.error.message : undefined)
  );
  const httpStatus = firstNumber(
    error?.statusCode, error?.status, response?.status,
    cause?.statusCode, cause?.status, causeResponse?.status
  );
  const providerRequestId = firstText(
    error?.requestId, error?.request_id, error?.responseId,
    cause?.requestId, cause?.request_id, cause?.responseId,
    headerValue(response?.headers, 'x-request-id'),
    headerValue(response?.headers, 'x-vercel-id'),
    headerValue(causeResponse?.headers, 'x-request-id'),
    headerValue(causeResponse?.headers, 'x-vercel-id')
  );
  const preflight = !input.dispatchOccurred;
  return {
    errorName,
    errorCode,
    errorCategory: providerFailureCategory({ name: errorName, code: errorCode, message: safeErrorMessage, status: httpStatus, preflight }),
    safeErrorMessage,
    httpStatus,
    providerRequestId,
    elapsedWriterMs: Math.max(0, Math.round(input.elapsedWriterMs)),
    configuredTimeoutMs: input.configuredTimeoutMs ?? WHOLE_MANUSCRIPT_TIMEOUT_MS,
    maxOutputTokens: input.maxOutputTokens,
    accountingStatus: input.providerCallsRecorded !== undefined
      ? 'recorded'
      : input.dispatchOccurred
        ? 'dispatched_settlement_unknown'
        : 'not_dispatched'
  };
}

function diagnosticsFrom(stage: string, writer: { provider?: string; model?: string }, manuscript?: { writerMetadata?: any }): EssentialManuscriptDiagnostics {
  const meta = manuscript?.writerMetadata ?? {};
  return {
    stage,
    requestedProvider: writer.provider,
    requestedModel: writer.model,
    dispatchOccurred: Boolean(manuscript),
    generationId: meta.generationId ?? meta.responseId,
    inputTokens: meta.inputTokens,
    outputTokens: meta.outputTokens,
    totalTokens: meta.totalTokens,
    providerCostMicros: meta.providerCostMicros,
    finishReason: meta.finishReason,
    providerFinishReason: meta.providerFinishReason,
    manuscriptProviderCalls: meta.manuscriptProviderCalls,
    semanticReviewProviderCalls: meta.semanticReviewProviderCalls,
    totalProviderCalls: meta.totalProviderCalls,
    semanticReviewDiagnostics: meta.semanticReviewDiagnostics,
    providerCalls: meta.totalProviderCalls ?? meta.recovery?.totalCalls
  };
}

function rawWriterThrowWasDispatched(error: unknown, forwarded?: WriterFailureDiagnostics): boolean {
  if (forwarded) return true;
  const record = asRecord(error);
  const message = firstText(record?.message, error instanceof Error ? error.message : undefined) ?? '';
  const code = firstText(record?.code);
  if (code === 'NARRATIVE_WRITER_UNAVAILABLE') return false;
  if (/over the approved limit without a coherent partition plan/i.test(message)) return false;
  // In the production writer the initial call is charged immediately before generateText.
  // Any other unforwarded throw from writeManuscript is therefore treated conservatively as
  // dispatched so a potentially billable call is never under-counted.
  return true;
}

type SemanticBlockTarget = {
  chapterTitle: string;
  sectionTitle: string;
  subsectionTitle?: string;
  sectionId: string;
  subsectionId?: string;
  level: 2 | 3;
  paragraphIndex: number;
  targetText: string;
  surroundingProse: string;
  permittedClaimRefs: string[];
  requiredManagementTakeaway: string;
};

function semanticBlockTarget(parsed: ParsedBlueprintMarkdown, blueprint: ReportBlueprint, path: string): SemanticBlockTarget | null {
  const match = path.match(/^([^\.]+)\.paragraphs\[(\d+)\]$/);
  if (!match) return null;
  const identity = match[1]!;
  const paragraphIndex = Number(match[2]);
  for (const chapter of blueprint.chapters) {
    const parsedChapter = parsed.chapters.find((item) => item.chapterId === chapter.chapterId);
    for (const section of chapter.sections) {
      const parsedSection = parsedChapter?.sections.find((item) => item.sectionId === section.sectionId);
      if (section.sectionId === identity && parsedSection) {
        const block = parsedSection.paragraphs[paragraphIndex];
        if (!block) return null;
        return {
          chapterTitle: chapter.title,
          sectionTitle: section.title,
          sectionId: section.sectionId,
          level: 2,
          paragraphIndex,
          targetText: block.text,
          surroundingProse: parsedSection.paragraphs.map((item) => item.text).slice(Math.max(0, paragraphIndex - 1), paragraphIndex + 2).join('\n\n'),
          permittedClaimRefs: block.permittedClaimRefs,
          requiredManagementTakeaway: section.requiredManagementTakeaway
        };
      }
      const subsection = section.optionalSubsections.find((item) => item.subsectionId === identity);
      const parsedSubsection = parsedSection?.subsections.find((item) => item.subsectionId === identity);
      if (subsection && parsedSubsection) {
        const block = parsedSubsection.paragraphs[paragraphIndex];
        if (!block) return null;
        return {
          chapterTitle: chapter.title,
          sectionTitle: section.title,
          subsectionTitle: subsection.title,
          sectionId: section.sectionId,
          subsectionId: subsection.subsectionId,
          level: 3,
          paragraphIndex,
          targetText: block.text,
          surroundingProse: parsedSubsection.paragraphs.map((item) => item.text).slice(Math.max(0, paragraphIndex - 1), paragraphIndex + 2).join('\n\n'),
          permittedClaimRefs: block.permittedClaimRefs,
          requiredManagementTakeaway: subsection.requiredManagementTakeaway
        };
      }
    }
  }
  return null;
}

function semanticReviewBlocks(input: {
  parsed: ParsedBlueprintMarkdown;
  blueprint: ReportBlueprint;
  factPack: NarrativeFactPack;
  assuranceBoundary: string;
  issues: Array<{ code: string; path: string; matchedSpan?: string }>;
}): SemanticReviewCandidateInput[] {
  const warningsByPath = new Map<string, Array<{ code: string; matchedSpan?: string; message?: string }>>();
  for (const issue of input.issues) {
    const warnings = warningsByPath.get(issue.path) ?? [];
    warnings.push({ code: issue.code, matchedSpan: issue.matchedSpan, message: 'deterministic lexical signal; not a review gate' });
    warningsByPath.set(issue.path, warnings);
  }
  return providerAuthoredNarrativeBlocks(input.parsed).map(({ path, block }) => {
    const target = semanticBlockTarget(input.parsed, input.blueprint, path);
    if (!target) throw new Error(`semantic_grounding_block_target_missing: ${path}`);
    return {
      candidateId: essentialCandidateId('semantic_grounding_block', path, target.targetText),
      ruleCode: 'semantic_grounding_block',
      path,
      candidateSpan: target.targetText,
      paragraph: target.targetText,
      surroundingProse: target.surroundingProse,
      blueprintPath: [target.sectionId, target.subsectionId].filter(Boolean).join('/'),
      chapterTitle: target.chapterTitle,
      sectionTitle: target.sectionTitle,
      subsectionTitle: target.subsectionTitle,
      permittedClaimRefs: target.permittedClaimRefs,
      permittedFacts: input.factPack.facts.filter((fact) => target.permittedClaimRefs.includes(fact.id)),
      requiredManagementTakeaway: target.requiredManagementTakeaway,
      assuranceBoundary: input.assuranceBoundary,
      warningSignals: warningsByPath.get(path)
    };
  });
}

function numberTokens(value: string): string[] {
  return value.match(/\b\d+(?:\.\d+)?%?\b/g)?.map((token) => token.replace('%', '')) ?? [];
}

function factLiterals(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(factLiterals);
  if (value && typeof value === 'object') return Object.values(value).flatMap(factLiterals);
  return [];
}

function compactFact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Deterministic post-repair proof: protected numeric tokens and any relevant fact literals that
 * were present in the target block must remain present in the replacement. The semantic reviewer
 * can soften unsafe wording, but it cannot silently change a deterministic fact.
 */
export function assertProtectedRepairFacts(before: string, after: string, protectedFacts: NarrativeFactPack['facts'] = []): void {
  const expected = numberTokens(before).sort();
  const received = numberTokens(after).sort();
  if (expected.length !== received.length || expected.some((value, index) => value !== received[index])) {
    throw new Error('semantic_repair_changed_protected_numeric_facts');
  }
  const beforeCompact = compactFact(before);
  const afterCompact = compactFact(after);
  for (const literal of protectedFacts.flatMap((fact) => factLiterals(fact.value))) {
    const compactLiteral = compactFact(literal);
    if (compactLiteral.length < 4 || !beforeCompact.includes(compactLiteral)) continue;
    if (!afterCompact.includes(compactLiteral)) throw new Error('semantic_repair_changed_protected_fact');
  }
}

function addSemanticReviewAccounting(manuscript: WholeManuscriptTextResult, result: SemanticReviewResult, candidateCount: number): WholeManuscriptTextResult {
  const accounting = result.accounting;
  const previous = manuscript.writerMetadata;
  const manuscriptProviderCalls = previous.manuscriptProviderCalls ?? previous.recovery.initialGenerationCount ?? 1;
  const semanticReviewProviderCalls = accounting?.providerCalls ?? 0;
  const previousRecovery = previous.recovery ?? {
    initialGenerationCount: manuscriptProviderCalls,
    truncationContinuationCount: 0,
    targetedRepairCount: 0,
    coherenceCount: 0,
    totalCalls: manuscriptProviderCalls,
    totalTokens: 0,
    totalProviderCostMicros: 0
  };
  return {
    ...manuscript,
    writerMetadata: {
      ...previous,
      manuscriptProviderCalls,
      semanticReviewProviderCalls,
      totalProviderCalls: manuscriptProviderCalls + semanticReviewProviderCalls,
      manuscriptInputTokens: previous.manuscriptInputTokens ?? previous.inputTokens,
      manuscriptOutputTokens: previous.manuscriptOutputTokens ?? previous.outputTokens,
      manuscriptTotalTokens: previous.manuscriptTotalTokens ?? previous.totalTokens,
      manuscriptProviderCostMicros: previous.manuscriptProviderCostMicros ?? previous.providerCostMicros,
      semanticReviewBlockCount: accounting?.candidateCount ?? candidateCount,
      semanticReviewCandidateCount: accounting?.candidateCount ?? candidateCount,
      semanticReviewAllowCount: accounting?.allowCount ?? result.decisions.filter((decision) => decision.disposition === 'ALLOW').length,
      semanticReviewRepairCount: accounting?.repairCount ?? result.decisions.filter((decision) => decision.disposition === 'REPAIR').length,
      semanticReviewRejectCount: accounting?.rejectCount ?? result.decisions.filter((decision) => decision.disposition === 'REJECT').length,
      semanticReviewHoldCount: accounting?.holdCount ?? result.decisions.filter((decision) => decision.disposition === 'HOLD').length,
      semanticReviewInputTokens: accounting?.inputTokens,
      semanticReviewOutputTokens: accounting?.outputTokens,
      semanticReviewTotalTokens: accounting?.totalTokens,
      semanticReviewProviderCostMicros: accounting?.providerCostMicros,
      semanticReviewProvider: accounting?.diagnostics?.provider,
      semanticReviewModel: accounting?.diagnostics?.model,
      semanticReviewDispatchOccurred: accounting?.diagnostics?.dispatchOccurred,
      semanticReviewGenerationId: accounting?.diagnostics?.generationId,
      semanticReviewResponseId: accounting?.diagnostics?.responseId,
      semanticReviewStartedAt: accounting?.diagnostics?.startedAt,
      semanticReviewEndedAt: accounting?.diagnostics?.endedAt,
      semanticReviewElapsedMs: accounting?.diagnostics?.elapsedMs,
      semanticReviewFinishReason: accounting?.diagnostics?.finishReason,
      semanticReviewProviderFinishReason: accounting?.diagnostics?.providerFinishReason,
      semanticReviewResponseSchemaValid: accounting?.diagnostics?.responseSchemaValid,
      semanticReviewFailureCode: accounting?.diagnostics?.failureCode,
      semanticReviewDiagnostics: accounting?.diagnostics,
      semanticReviewExecutionContract: accounting?.executionContract,
      inputTokens: (previous.inputTokens ?? 0) + (accounting?.inputTokens ?? 0),
      outputTokens: (previous.outputTokens ?? 0) + (accounting?.outputTokens ?? 0),
      totalTokens: (previous.totalTokens ?? 0) + (accounting?.totalTokens ?? 0),
      providerCostMicros: (previous.providerCostMicros ?? 0) + (accounting?.providerCostMicros ?? 0),
      recovery: {
        ...previousRecovery,
        targetedRepairCount: previousRecovery.targetedRepairCount + (accounting?.repairCount ?? 0),
        totalCalls: previousRecovery.totalCalls + semanticReviewProviderCalls,
        totalTokens: previousRecovery.totalTokens + (accounting?.totalTokens ?? 0),
        totalProviderCostMicros: previousRecovery.totalProviderCostMicros + (accounting?.providerCostMicros ?? 0)
      }
    }
  };
}

export async function composeEssentialManuscript(input: {
  factPack: NarrativeFactPack;
  writer: WholeManuscriptWriter;
  semanticReviewer?: EssentialSemanticReviewer;
}): Promise<EssentialManuscriptResult> {
  const { factPack, writer } = input;

  const plan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(plan, factPack);

  const blueprint = buildReportBlueprint(factPack, plan);
  const context = buildWholeManuscriptContext(factPack, blueprint);

  const writerIdentity = writer as unknown as { provider?: string; model?: string };
  const writerStartedAt = Date.now();
  let manuscript: WholeManuscriptTextResult;
  try {
    manuscript = await writer.writeManuscript({ context, factPack, blueprint });
  } catch (error) {
    // The writer already holds evidence when it rejects a non-conforming manuscript. Raw
    // provider/SDK/network throws do not, so preserve a closed set of safe transport fields
    // here instead of allowing the exact V4 failure to collapse to a row of undefined values.
    const forwarded = (error as { writerDiagnostics?: WriterFailureDiagnostics })?.writerDiagnostics;
    const meta = forwarded?.writerMetadata ?? {};
    const dispatchOccurred = rawWriterThrowWasDispatched(error, forwarded);
    const recordedProviderCalls = forwarded?.providerCalls ?? meta.recovery?.totalCalls;
    const providerCalls = recordedProviderCalls ?? (dispatchOccurred ? 1 : 0);
    const providerFailure = describeEssentialWriterFailure({
      error,
      elapsedWriterMs: Date.now() - writerStartedAt,
      configuredTimeoutMs: meta.executionContract?.timeoutMs ?? WHOLE_MANUSCRIPT_TIMEOUT_MS,
      maxOutputTokens: meta.executionContract?.maxOutputTokens ?? context.outputBudget.hardOutputTokenLimit,
      dispatchOccurred,
      providerCallsRecorded: recordedProviderCalls
    });
    throw new EssentialManuscriptError(
      'write_manuscript',
      error instanceof Error ? error.message : 'The manuscript writer failed.',
      {
        stage: forwarded?.stage ?? 'write_manuscript',
        requestedProvider: writerIdentity.provider,
        requestedModel: meta.model ?? writerIdentity.model,
        dispatchOccurred,
        generationId: meta.generationId ?? meta.responseId,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        totalTokens: meta.totalTokens,
        providerCostMicros: meta.providerCostMicros,
        finishReason: meta.finishReason,
        providerFinishReason: meta.providerFinishReason,
        providerCalls,
        providerFailure,
        parseOk: forwarded ? false : undefined,
        parseErrors: forwarded?.structural?.parseErrors?.map((issue) => ({ code: issue.code, path: issue.path })),
        classification: forwarded?.classification,
        missingTail: forwarded?.missingTail,
        structural: forwarded?.structural
      }
    );
  }

  // The blueprint the writer echoes back is the one it actually wrote against. Parsing
  // against anything else would risk attaching prose to the wrong node.
  const authoritativeBlueprint = manuscript.blueprint ?? blueprint;

  const narrative = parseBlueprintMarkdown(manuscript.markdown, authoritativeBlueprint);
  if (!narrative.ok) {
    // Structural ambiguity fails closed rather than guessing which node prose belongs to.
    throw new EssentialManuscriptError(
      'parse_manuscript',
      `The manuscript could not be resolved against the blueprint (${narrative.errors.map((issue) => `${issue.code}:${issue.path}`).join(', ')}).`,
      {
        ...diagnosticsFrom('parse_manuscript', writerIdentity, manuscript),
        parseOk: false,
        parseErrors: narrative.errors.map((issue) => ({ code: issue.code, path: issue.path })),
        structural: buildManuscriptStructuralDiagnostics({
          markdown: manuscript.markdown, blueprint: authoritativeBlueprint, parsed: narrative
        })
      }
    );
  }

  // Closed-set normalisation is Layer 0. It may repair only known-safe presentation wording; the
  // candidate ledger that follows still decides whether any suspicious proposition survives.
  const deterministicAssuranceNormalisations = normaliseProhibitedAssessmentAssurance(narrative);
  if (deterministicAssuranceNormalisations > 0) {
    console.info('essential_manuscript_numeric_normalisation', {
      replacements: deterministicAssuranceNormalisations
    });
  }
  const manuscriptProviderCalls = manuscript.writerMetadata.manuscriptProviderCalls
    ?? manuscript.writerMetadata.recovery?.initialGenerationCount
    ?? 1;
  manuscript = {
    ...manuscript,
    markdown: narrative.markdown,
    writerMetadata: {
      ...manuscript.writerMetadata,
      manuscriptProviderCalls,
      semanticReviewProviderCalls: manuscript.writerMetadata.semanticReviewProviderCalls ?? 0,
      totalProviderCalls: manuscript.writerMetadata.totalProviderCalls ?? manuscriptProviderCalls,
      manuscriptInputTokens: manuscript.writerMetadata.manuscriptInputTokens ?? manuscript.writerMetadata.inputTokens,
      manuscriptOutputTokens: manuscript.writerMetadata.manuscriptOutputTokens ?? manuscript.writerMetadata.outputTokens,
      manuscriptTotalTokens: manuscript.writerMetadata.manuscriptTotalTokens ?? manuscript.writerMetadata.totalTokens,
      manuscriptProviderCostMicros: manuscript.writerMetadata.manuscriptProviderCostMicros ?? manuscript.writerMetadata.providerCostMicros
    }
  };

  // The text-first validator separates deterministic hard gates from high-recall language
  // warnings. A hard gate stops here; after it passes, every provider-authored paragraph becomes
  // one review unit, whether or not a lexical detector matched it.
  const report = validateBlueprintTextManuscript(narrative, authoritativeBlueprint, factPack);
  if (report.hardTruth.issues.length > 0) {
    throw new EssentialManuscriptError(
      'validate_manuscript',
      `The manuscript failed deterministic hard validation (${report.hardTruth.issues.map((issue) => `${issue.code}:${issue.path}`).join(', ')}).`,
      {
        ...diagnosticsFrom('validate_manuscript', writerIdentity, manuscript),
        parseOk: true,
        validationCode: report.hardTruth.issues[0]?.code,
        validationIssues: report.hardTruth.issues.map((issue) => ({ code: issue.code, path: issue.path, message: String(issue.message ?? '').slice(0, 200) }))
      }
    );
  }

  let cascadeResult: EssentialValidationCascadeResult;
  let reviewed: SemanticReviewResult | undefined;
  let reviewInput: SemanticReviewCandidateInput[] = [];
  reviewInput = semanticReviewBlocks({
    parsed: narrative,
    blueprint: authoritativeBlueprint,
    factPack,
    assuranceBoundary: context.boundaries.assurance,
    issues: report.semanticCandidates.issues
  });
  if (reviewInput.length === 0) {
    throw new EssentialManuscriptError(
      'semantic_review',
      'The manuscript contains no provider-authored narrative blocks to bind to semantic review.',
      {
        ...diagnosticsFrom('semantic_review', writerIdentity, manuscript),
        parseOk: true,
        validationCode: 'semantic_review_no_blocks'
      }
    );
  }
  const semanticReviewerUsesWriter = !input.semanticReviewer && Boolean(writer.reviewSemanticCandidates);
  const semanticReviewer: EssentialSemanticReviewer | undefined = input.semanticReviewer
    ?? (writer.reviewSemanticCandidates
      ? { review: (reviewRequest) => writer.reviewSemanticCandidates!(reviewRequest) }
      : undefined);
  if (!semanticReviewer) {
    throw new EssentialManuscriptError(
      'semantic_review',
      'Every provider-authored narrative block requires a configured semantic reviewer.',
      {
        ...diagnosticsFrom('semantic_review', writerIdentity, manuscript),
        parseOk: true,
        validationCode: 'semantic_reviewer_unavailable',
        validationIssues: [{ code: 'semantic_grounding_block', path: 'manuscript', message: 'The bounded block review seam is unavailable.' }]
      }
    );
  }
  try {
    // Exactly one batched request covers every block. Lexical warnings are included only as
    // compact context on their owning block and can never suppress an otherwise required review.
    reviewed = validateSemanticReviewResult({ candidates: reviewInput }, await semanticReviewer.review({ candidates: reviewInput }));
    if ((reviewed.accounting?.providerCalls ?? 0) > 1) {
      const error = new Error('semantic_review_provider_call_budget_exceeded');
      (error as { semanticReviewerDiagnostics?: SemanticReviewDiagnostics }).semanticReviewerDiagnostics = reviewed.accounting?.diagnostics;
      throw error;
    }
    const expectedTotalProviderCalls = manuscript.writerMetadata.manuscriptProviderCalls! + (reviewed.accounting?.providerCalls ?? 0);
    if (expectedTotalProviderCalls > 2) {
      const error = new Error('essential_provider_call_budget_exceeded');
      (error as { semanticReviewerDiagnostics?: SemanticReviewDiagnostics }).semanticReviewerDiagnostics = reviewed.accounting?.diagnostics;
      throw error;
    }
    manuscript = addSemanticReviewAccounting(manuscript, reviewed, reviewInput.length);
  } catch (error) {
    const diagnostics = (error as { semanticReviewerDiagnostics?: SemanticReviewDiagnostics })?.semanticReviewerDiagnostics;
    const manuscriptCalls = manuscript.writerMetadata.manuscriptProviderCalls ?? manuscript.writerMetadata.recovery.totalCalls;
    const semanticCalls = diagnostics?.providerCalls ?? (semanticReviewerUsesWriter ? 1 : 0);
    const providerCalls = manuscriptCalls + semanticCalls;
    const failureCode = diagnostics?.failureCode ?? (error instanceof Error && /semantic_review_provider_call_budget_exceeded|essential_provider_call_budget_exceeded/.test(error.message)
      ? 'semantic_review_provider_call_budget_exceeded'
      : 'semantic_review_failed');
    throw new EssentialManuscriptError(
      'semantic_review',
      `The bounded semantic reviewer failed safely (${failureCode}).`,
      {
        ...diagnosticsFrom('semantic_review', writerIdentity, manuscript),
        parseOk: true,
        providerCalls,
        manuscriptProviderCalls: manuscriptCalls,
        semanticReviewProviderCalls: semanticCalls,
        totalProviderCalls: providerCalls,
        semanticReviewDiagnostics: diagnostics,
        validationCode: failureCode,
        validationIssues: [{ code: 'semantic_grounding_block', path: 'manuscript', message: 'The single bounded semantic review did not complete safely.' }]
      }
    );
  }

  const semanticDecisions = reviewed?.decisions ?? [];
  const rejectedDecisions = semanticDecisions.filter((decision) => decision.disposition === 'REJECT');
  const heldDecisions = semanticDecisions.filter((decision) => decision.disposition === 'HOLD');
  const repairDecisions = semanticDecisions.filter((decision) => decision.disposition === 'REPAIR');
  const semanticPolicyDiagnostics = reviewed?.accounting?.diagnostics;
  const semanticPolicyBase = diagnosticsFrom('semantic_review', writerIdentity, manuscript);
  if (rejectedDecisions.length > 0) {
    throw new EssentialManuscriptError(
      'semantic_review',
      'The semantic reviewer rejected one or more provider-authored narrative blocks.',
      {
        ...semanticPolicyBase,
        semanticReviewDiagnostics: semanticPolicyDiagnostics,
        validationCode: 'semantic_reject',
        validationIssues: rejectedDecisions.map((decision) => ({ code: 'semantic_grounding_block', path: decision.candidateId, message: 'A provider-authored narrative block was rejected by semantic grounding review.' }))
      }
    );
  }
  if (heldDecisions.length > 0) {
    throw new EssentialManuscriptError(
      'semantic_review',
      'The semantic reviewer held one or more provider-authored narrative blocks for review.',
      {
        ...semanticPolicyBase,
        semanticReviewDiagnostics: semanticPolicyDiagnostics,
        validationCode: 'semantic_hold',
        validationIssues: heldDecisions.map((decision) => ({ code: 'semantic_grounding_block', path: decision.candidateId, message: 'A provider-authored narrative block was held by semantic grounding review.' }))
      }
    );
  }
  if (repairDecisions.length > 1) {
    throw new EssentialManuscriptError(
      'semantic_review',
      'More than one semantic repair is required; the bounded single-repair policy fails closed.',
      {
        ...semanticPolicyBase,
        semanticReviewDiagnostics: semanticPolicyDiagnostics,
        validationCode: 'multiple_semantic_repairs_required',
        validationIssues: repairDecisions.map((decision) => ({ code: 'semantic_grounding_block', path: decision.candidateId, message: 'Multiple provider-authored blocks require semantic repair; no repair was applied.' }))
      }
    );
  }

  const firstCascade = adjudicateTextFirstValidation({
    parsed: narrative,
    report,
    factPack,
    semanticDecisions: reviewed?.decisions,
    requireSemanticReviewer: true,
    semanticGroundingBlocks: reviewInput.map((block) => ({ path: block.path, span: block.paragraph }))
  });

  const failureDetails = (result: EssentialValidationCascadeResult) => {
    const codes = [...result.blockingCodes, ...result.heldForReviewCodes, ...result.repairCodes];
    const issues = [...report.hardTruth.issues, ...report.semanticCandidates.issues, ...report.quality.issues, ...report.repairableSemantic.issues];
    if (codes.includes('semantic_grounding_block')) {
      issues.push({ code: 'semantic_grounding_block', severity: 'SEMANTIC_CANDIDATE', path: 'manuscript', message: 'A provider-authored narrative block was not cleared by the bounded semantic reviewer.' });
    }
    return {
      codes,
      validationIssues: issues.filter((issue) => codes.includes(issue.code)).map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: String(issue.message ?? '').slice(0, 200)
      }))
    };
  };

  if (firstCascade.blockingCodes.length || firstCascade.heldForReviewCodes.length) {
    const failure = failureDetails(firstCascade);
    throw new EssentialManuscriptError(
      'validate_manuscript',
      `The manuscript failed semantic validation (${failure.codes.join(', ')}).`,
      {
        ...diagnosticsFrom('validate_manuscript', writerIdentity, manuscript),
        parseOk: true,
        validationCode: failure.codes[0],
        validationIssues: failure.validationIssues
      }
    );
  }

  // A semantic reviewer may repair exactly one deterministic paragraph. Apply that response
  // without entering the old recovery loop: reparse, rerun hard gates, and rescan candidates once.
  const repairDecision = reviewed?.decisions.find((decision) => decision.disposition === 'REPAIR');
  if (repairDecision) {
    const target = reviewInput?.find((item) => item.candidateId === repairDecision.candidateId);
    const block = target ? semanticBlockTarget(narrative, authoritativeBlueprint, target.path) : null;
    if (!target || !block || !repairDecision.replacementProse) {
      throw new EssentialManuscriptError('semantic_repair', 'The semantic repair did not resolve to one deterministic Blueprint prose block.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: true, validationCode: 'semantic_repair_validation_failed' });
    }
    try {
      assertProtectedRepairFacts(
        block.targetText,
        repairDecision.replacementProse,
        input.factPack.facts.filter((fact) => block.permittedClaimRefs.includes(fact.id))
      );
    } catch {
      throw new EssentialManuscriptError('semantic_repair', 'The bounded semantic repair changed protected deterministic content.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: true, validationCode: 'semantic_repair_validation_failed', validationIssues: [{ code: 'semantic_grounding_block', path: repairDecision.candidateId, message: 'The bounded semantic repair changed protected deterministic content.' }] });
    }
    let repairedMarkdown: string;
    try {
      repairedMarkdown = replaceTargetBlock(
        narrative.markdown,
        block.subsectionTitle ?? block.sectionTitle,
        block.level,
        block.targetText,
        repairDecision.replacementProse
      );
    } catch (error) {
      throw new EssentialManuscriptError('semantic_repair', 'The bounded semantic repair could not be applied.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: true, validationCode: 'semantic_repair_validation_failed' });
    }
    const repairedNarrative = parseBlueprintMarkdown(repairedMarkdown, authoritativeBlueprint);
    if (!repairedNarrative.ok) {
      throw new EssentialManuscriptError('semantic_repair', 'The semantic repair changed deterministic manuscript structure.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: false, validationCode: 'semantic_repair_validation_failed', parseErrors: repairedNarrative.errors.map((issue) => ({ code: issue.code, path: issue.path })) });
    }
    const repairedReport = validateBlueprintTextManuscript(repairedNarrative, authoritativeBlueprint, factPack);
    if (repairedReport.hardTruth.issues.length > 0) {
      throw new EssentialManuscriptError('semantic_repair', 'The semantic repair failed a deterministic hard gate.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: true, validationCode: 'semantic_repair_validation_failed', validationIssues: repairedReport.hardTruth.issues.map((issue) => ({ code: issue.code, path: issue.path, message: 'The bounded semantic repair failed a deterministic hard gate.' })) });
    }
    const postReviewInput = semanticReviewBlocks({
      parsed: repairedNarrative,
      blueprint: authoritativeBlueprint,
      factPack,
      assuranceBoundary: context.boundaries.assurance,
      issues: repairedReport.semanticCandidates.issues
    });
    const beforeByPath = new Map(reviewInput.map((item) => [item.path, item]));
    const postByPath = new Map(postReviewInput.map((item) => [item.path, item]));
    if (beforeByPath.size !== postByPath.size || [...beforeByPath.keys()].some((path) => !postByPath.has(path))) {
      throw new EssentialManuscriptError('semantic_repair', 'The bounded semantic repair changed the provider block set; no second reviewer call is permitted.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: true, validationCode: 'semantic_repair_validation_failed' });
    }
    const originalDecisionById = new Map((reviewed?.decisions ?? []).map((decision) => [decision.candidateId, decision]));
    const postDecisions = postReviewInput.map((postBlock) => {
      const before = beforeByPath.get(postBlock.path)!;
      if (postBlock.path === target.path && postBlock.paragraph !== before.paragraph) {
        return {
          candidateId: postBlock.candidateId,
          disposition: 'ALLOW' as const,
          reasonCode: 'bounded_semantic_repair_accepted',
          reason: 'The exact reviewed block repair passed deterministic revalidation.'
        };
      }
      if (postBlock.paragraph !== before.paragraph) {
        throw new EssentialManuscriptError('semantic_repair', 'The bounded semantic repair changed an unapproved provider block; no second reviewer call is permitted.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: true, validationCode: 'semantic_repair_validation_failed' });
      }
      const originalDecision = originalDecisionById.get(before.candidateId);
      if (!originalDecision || originalDecision.disposition !== 'ALLOW') {
        throw new EssentialManuscriptError('semantic_repair', 'An unchanged provider block lacks an ALLOW decision after the bounded repair; no second reviewer call is permitted.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), semanticReviewDiagnostics: semanticPolicyDiagnostics, parseOk: true, validationCode: 'semantic_repair_validation_failed' });
      }
      return originalDecision;
    });
    const repairedCascade = assertTextFirstValidationCascade({
      parsed: repairedNarrative,
      report: repairedReport,
      factPack,
      semanticDecisions: postDecisions,
      requireSemanticReviewer: true,
      semanticGroundingBlocks: postReviewInput.map((block) => ({ path: block.path, span: block.paragraph }))
    });
    narrative.markdown = repairedNarrative.markdown;
    narrative.chapters = repairedNarrative.chapters;
    manuscript = { ...manuscript, markdown: repairedNarrative.markdown };
    cascadeResult = repairedCascade;
  } else {
    cascadeResult = assertTextFirstValidationCascade({
      parsed: narrative,
      report,
      factPack,
      semanticDecisions: reviewed?.decisions,
      requireSemanticReviewer: true,
      semanticGroundingBlocks: reviewInput.map((block) => ({ path: block.path, span: block.paragraph }))
    });
  }

  return {
    narrative,
    blueprint: authoritativeBlueprint,
    manuscript,
    acceptedAssuranceSpanHashes: cascadeResult.acceptedAssuranceSpanHashes,
    acceptedSemanticDecisions: cascadeResult.acceptedSemanticDecisions
  };
}

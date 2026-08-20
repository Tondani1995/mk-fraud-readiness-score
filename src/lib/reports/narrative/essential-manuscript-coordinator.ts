import type { NarrativeFactPack } from './fact-pack';
import type { WholeManuscriptWriter, WholeManuscriptTextResult } from './manuscript';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from './story-plan';
import { buildReportBlueprint, buildWholeManuscriptContext, type ReportBlueprint } from './report-blueprint';
import { buildManuscriptStructuralDiagnostics, type ManuscriptStructuralDiagnostics } from './manuscript-diagnostics';
import { WHOLE_MANUSCRIPT_TIMEOUT_MS } from './whole-manuscript-writer';
import {
  parseBlueprintMarkdown,
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
  acceptedSemanticDecisions: Array<{ ruleCode: string; spanHash: string; reasonCode: string }>;
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
    providerCalls: meta.recovery?.totalCalls
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

function semanticReviewCandidates(input: {
  parsed: ParsedBlueprintMarkdown;
  blueprint: ReportBlueprint;
  factPack: NarrativeFactPack;
  assuranceBoundary: string;
  issues: Array<{ code: string; path: string; matchedSpan?: string }>;
}): SemanticReviewCandidateInput[] {
  return input.issues.map((issue) => {
    const target = semanticBlockTarget(input.parsed, input.blueprint, issue.path);
    if (!target) throw new Error(`semantic_candidate_target_missing: ${issue.code} at ${issue.path}`);
    const candidateSpan = issue.matchedSpan ?? target.targetText;
    return {
      candidateId: essentialCandidateId(issue.code, issue.path, candidateSpan),
      ruleCode: issue.code,
      path: issue.path,
      candidateSpan,
      paragraph: target.targetText,
      surroundingProse: target.surroundingProse,
      blueprintPath: [target.sectionId, target.subsectionId].filter(Boolean).join('/'),
      chapterTitle: target.chapterTitle,
      sectionTitle: target.sectionTitle,
      subsectionTitle: target.subsectionTitle,
      permittedClaimRefs: target.permittedClaimRefs,
      permittedFacts: input.factPack.facts.filter((fact) => target.permittedClaimRefs.includes(fact.id)),
      requiredManagementTakeaway: target.requiredManagementTakeaway,
      assuranceBoundary: input.assuranceBoundary
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

function addSemanticReviewAccounting(manuscript: WholeManuscriptTextResult, result: SemanticReviewResult): WholeManuscriptTextResult {
  const accounting = result.accounting;
  if (!accounting || accounting.providerCalls === 0) return manuscript;
  const previous = manuscript.writerMetadata;
  return {
    ...manuscript,
    writerMetadata: {
      ...previous,
      inputTokens: (previous.inputTokens ?? 0) + (accounting.inputTokens ?? 0),
      outputTokens: (previous.outputTokens ?? 0) + (accounting.outputTokens ?? 0),
      totalTokens: (previous.totalTokens ?? 0) + (accounting.totalTokens ?? 0),
      providerCostMicros: (previous.providerCostMicros ?? 0) + (accounting.providerCostMicros ?? 0),
      recovery: {
        ...previous.recovery,
        targetedRepairCount: previous.recovery.targetedRepairCount + accounting.repairCount,
        totalCalls: previous.recovery.totalCalls + accounting.providerCalls,
        totalTokens: previous.recovery.totalTokens + (accounting.totalTokens ?? 0),
        totalProviderCostMicros: previous.recovery.totalProviderCostMicros + (accounting.providerCostMicros ?? 0)
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
  manuscript = { ...manuscript, markdown: narrative.markdown };

  // The text-first validator separates deterministic hard gates from high-recall language
  // candidates. A hard gate stops here; semantic candidates are the only inputs to the one bounded
  // reviewer request below.
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

  const semanticIssues = report.semanticCandidates.issues;
  let cascadeResult: EssentialValidationCascadeResult;
  let reviewed: SemanticReviewResult | undefined;
  let reviewInput: SemanticReviewCandidateInput[] = [];
  if (semanticIssues.length > 0) {
    const semanticReviewer: EssentialSemanticReviewer | undefined = input.semanticReviewer
      ?? (writer.reviewSemanticCandidates
        ? { review: (reviewInput) => writer.reviewSemanticCandidates!(reviewInput) }
        : undefined);
    if (!semanticReviewer) {
      throw new EssentialManuscriptError(
        'semantic_review',
        'Semantic candidates were found but no semantic reviewer was injected or configured.',
        {
          ...diagnosticsFrom('semantic_review', writerIdentity, manuscript),
          parseOk: true,
          validationCode: 'semantic_reviewer_unavailable',
          validationIssues: semanticIssues.map((issue) => ({ code: issue.code, path: issue.path, message: String(issue.message ?? '').slice(0, 200) }))
        }
      );
    }
    try {
      reviewInput = semanticReviewCandidates({
        parsed: narrative,
        blueprint: authoritativeBlueprint,
        factPack,
        assuranceBoundary: context.boundaries.assurance,
        issues: semanticIssues
      });
      reviewed = validateSemanticReviewResult({ candidates: reviewInput }, await semanticReviewer.review({ candidates: reviewInput }));
      if ((reviewed.accounting?.providerCalls ?? 0) > 1) throw new Error('semantic_review_provider_call_budget_exceeded');
      manuscript = addSemanticReviewAccounting(manuscript, reviewed);
    } catch (error) {
      const diagnostics = (error as { semanticReviewerDiagnostics?: { providerCalls?: number } })?.semanticReviewerDiagnostics;
      const providerCalls = manuscript.writerMetadata.recovery.totalCalls + (diagnostics?.providerCalls ?? 0);
      throw new EssentialManuscriptError(
        'semantic_review',
        error instanceof Error ? error.message : 'The semantic reviewer failed.',
        {
          ...diagnosticsFrom('semantic_review', writerIdentity, manuscript),
          parseOk: true,
          providerCalls,
          validationCode: 'semantic_review_failed',
          validationIssues: semanticIssues.map((issue) => ({ code: issue.code, path: issue.path, message: String(issue.message ?? '').slice(0, 200) }))
        }
      );
    }
  }

  const firstCascade = adjudicateTextFirstValidation({
    parsed: narrative,
    report,
    factPack,
    semanticDecisions: reviewed?.decisions,
    requireSemanticReviewer: semanticIssues.length > 0
  });

  const failureDetails = (result: EssentialValidationCascadeResult) => {
    const codes = [...result.blockingCodes, ...result.heldForReviewCodes, ...result.repairCodes];
    const issues = [...report.hardTruth.issues, ...report.semanticCandidates.issues, ...report.quality.issues, ...report.repairableSemantic.issues];
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
      throw new EssentialManuscriptError('semantic_repair', 'The semantic repair did not resolve to one deterministic Blueprint prose block.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), parseOk: true, validationCode: 'semantic_repair_target_missing' });
    }
    assertProtectedRepairFacts(
      block.targetText,
      repairDecision.replacementProse,
      input.factPack.facts.filter((fact) => block.permittedClaimRefs.includes(fact.id))
    );
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
      throw new EssentialManuscriptError('semantic_repair', error instanceof Error ? error.message : 'The bounded semantic repair could not be applied.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), parseOk: true, validationCode: 'semantic_repair_target_invalid' });
    }
    const repairedNarrative = parseBlueprintMarkdown(repairedMarkdown, authoritativeBlueprint);
    if (!repairedNarrative.ok) {
      throw new EssentialManuscriptError('semantic_repair', 'The semantic repair changed deterministic manuscript structure.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), parseOk: false, validationCode: repairedNarrative.errors[0]?.code, parseErrors: repairedNarrative.errors.map((issue) => ({ code: issue.code, path: issue.path })) });
    }
    const repairedReport = validateBlueprintTextManuscript(repairedNarrative, authoritativeBlueprint, factPack);
    if (repairedReport.hardTruth.issues.length > 0) {
      throw new EssentialManuscriptError('semantic_repair', 'The semantic repair failed a deterministic hard gate.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), parseOk: true, validationCode: repairedReport.hardTruth.issues[0]?.code, validationIssues: repairedReport.hardTruth.issues.map((issue) => ({ code: issue.code, path: issue.path, message: String(issue.message ?? '').slice(0, 200) })) });
    }
    const allowedIds = new Set((reviewed?.decisions ?? []).filter((decision) => decision.disposition === 'ALLOW').map((decision) => decision.candidateId));
    const repairedSemanticIds = repairedReport.semanticCandidates.issues.map((issue) => essentialCandidateId(issue.code, issue.path, issue.matchedSpan ?? (semanticBlockTarget(repairedNarrative, authoritativeBlueprint, issue.path)?.targetText ?? issue.code)));
    const unresolved = repairedSemanticIds.filter((id) => !allowedIds.has(id));
    if (unresolved.length > 0) {
      throw new EssentialManuscriptError('semantic_repair', 'The bounded semantic repair left a semantic candidate unresolved; no second reviewer call is permitted.', { ...diagnosticsFrom('semantic_repair', writerIdentity, manuscript), parseOk: true, validationCode: 'semantic_repair_left_candidate' });
    }
    const postDecisions = (reviewed?.decisions ?? []).filter((decision) => repairedSemanticIds.includes(decision.candidateId));
    const repairedCascade = assertTextFirstValidationCascade({
      parsed: repairedNarrative,
      report: repairedReport,
      factPack,
      semanticDecisions: postDecisions,
      requireSemanticReviewer: repairedReport.semanticCandidates.issues.length > 0
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
      requireSemanticReviewer: semanticIssues.length > 0
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

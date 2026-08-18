import type { NarrativeFactPack } from './fact-pack';
import type { WholeManuscriptWriter, WholeManuscriptTextResult } from './manuscript';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from './story-plan';
import { buildReportBlueprint, buildWholeManuscriptContext, type ReportBlueprint } from './report-blueprint';
import { buildManuscriptStructuralDiagnostics, type ManuscriptStructuralDiagnostics } from './manuscript-diagnostics';
import { WHOLE_MANUSCRIPT_TIMEOUT_MS } from './whole-manuscript-writer';
import {
  parseBlueprintMarkdown,
  validateBlueprintTextManuscript,
  assertBlueprintTextValidation,
  type ParsedBlueprintMarkdown
} from './blueprint-text';
import { normaliseProhibitedAssessmentAssurance } from './assurance-boundary-normalisation';

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
 * written and in what order, the writer produces prose against it, and the existing
 * validator decides whether that prose is acceptable. Scores, findings, risks, controls,
 * roadmap actions and evidence remain the deterministic pipeline's, and nothing here
 * reads a number back out of provider prose.
 */
export interface EssentialManuscriptResult {
  narrative: ParsedBlueprintMarkdown;
  blueprint: ReportBlueprint;
  manuscript: WholeManuscriptTextResult;
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
  /** Every hard-truth rule that fired, so a rejection names itself. */
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

export async function composeEssentialManuscript(input: {
  factPack: NarrativeFactPack;
  writer: WholeManuscriptWriter;
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

  const deterministicAssuranceNormalisations = normaliseProhibitedAssessmentAssurance(narrative);
  if (deterministicAssuranceNormalisations > 0) {
    console.info('essential_assurance_boundary_normalisation', {
      replacements: deterministicAssuranceNormalisations
    });
  }

  const report = validateBlueprintTextManuscript(narrative, authoritativeBlueprint, factPack);
  try {
    assertBlueprintTextValidation(report);
  } catch (error) {
    throw new EssentialManuscriptError(
      'validate_manuscript',
      error instanceof Error ? error.message : 'The manuscript failed validation.',
      {
        ...diagnosticsFrom('validate_manuscript', writerIdentity, manuscript),
        parseOk: true,
        validationCode: report.hardTruth.issues[0]?.code,
        validationIssues: report.hardTruth.issues.map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: String(issue.message ?? '').slice(0, 200)
        }))
      }
    );
  }

  return { narrative, blueprint: authoritativeBlueprint, manuscript };
}

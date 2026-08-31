import crypto from 'node:crypto';
import { generateText, Output } from 'ai';
import { z } from 'zod';
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
import {
  classifyAssuranceLanguageDetailed,
  type AssuranceSemanticCategory
} from './validation';
import { normaliseProhibitedAssessmentAssurance } from './assurance-boundary-normalisation';
import {
  runSemanticSafetyCascade,
  SemanticCallLedger,
  type SemanticAdjudicationResult,
  type SemanticCandidate,
  type SemanticRepairResult,
  type SemanticCascadeDiagnostics
} from './semantic-safety-cascade';

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
  semanticSafety?: SemanticCascadeDiagnostics;
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
  semanticSafety?: SemanticCascadeDiagnostics;
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

function semanticCandidateHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parsedBlockAtPath(parsed: ParsedBlueprintMarkdown, path: string): { text: string; permittedClaimRefs: string[] } | undefined {
  const match = /^(.+)\.paragraphs\[(\d+)\]$/.exec(path);
  if (!match) return undefined;
  const owner = match[1];
  const index = Number(match[2]);
  for (const chapter of parsed.chapters) {
    for (const section of chapter.sections) {
      if (section.sectionId === owner) return section.paragraphs[index];
      for (const subsection of section.subsections) if (subsection.subsectionId === owner) return subsection.paragraphs[index];
    }
  }
  return undefined;
}

function cloneParsedBlueprint(parsed: ParsedBlueprintMarkdown): ParsedBlueprintMarkdown {
  return JSON.parse(JSON.stringify(parsed)) as ParsedBlueprintMarkdown;
}

function serializeParsedBlueprint(parsed: ParsedBlueprintMarkdown): string {
  const blocks: string[] = [];
  for (const chapter of parsed.chapters) {
    blocks.push(`# ${chapter.title}`);
    for (const section of chapter.sections) {
      blocks.push(`## ${section.title}`);
      blocks.push(...section.paragraphs.map((paragraph) => paragraph.text));
      for (const subsection of section.subsections) {
        blocks.push(`### ${subsection.title}`);
        blocks.push(...subsection.paragraphs.map((paragraph) => paragraph.text));
      }
    }
  }
  return `${blocks.filter((block) => block.trim()).join('\n\n')}\n`;
}

function replaceParsedBlock(parsed: ParsedBlueprintMarkdown, targetId: string, repairedText: string): ParsedBlueprintMarkdown {
  const path = targetId.replace(/^essential:/, '');
  const next = cloneParsedBlueprint(parsed);
  const block = parsedBlockAtPath(next, path);
  if (!block) throw new Error('unknown_essential_repair_target');
  block.text = repairedText.trim();
  next.markdown = serializeParsedBlueprint(next);
  return next;
}

function reparseAuthoritativeBlueprint(parsed: ParsedBlueprintMarkdown, blueprint: ReportBlueprint): ParsedBlueprintMarkdown {
  const reparsed = parseBlueprintMarkdown(parsed.markdown, blueprint);
  if (!reparsed.ok) throw new Error('semantic_repair_structural_validation_failed');
  return reparsed;
}

type EssentialSemanticDisposition = 'OBJECTIVE_HARD' | 'DETERMINISTIC_ALLOW' | 'SEMANTIC_CANDIDATE';

function essentialAssuranceDisposition(parsed: ParsedBlueprintMarkdown, issue: { code: string; path: string }): {
  disposition: EssentialSemanticDisposition;
  category?: AssuranceSemanticCategory;
} {
  if (issue.code !== 'assurance_claim') return { disposition: 'OBJECTIVE_HARD' };
  const block = parsedBlockAtPath(parsed, issue.path);
  // A missing block is a structural binding failure, not a wording ambiguity. Fail closed.
  if (!block) return { disposition: 'OBJECTIVE_HARD' };
  const classification = classifyAssuranceLanguageDetailed(block.text);
  if (!classification) return { disposition: 'OBJECTIVE_HARD' };
  if (classification.category === 'SAFE_CUSTOMER_CONTROL' || classification.category === 'EXPLICIT_LIMITATION') {
    return { disposition: 'DETERMINISTIC_ALLOW', category: classification.category };
  }
  if (classification.category === 'AMBIGUOUS_ASSURANCE') {
    return { disposition: 'SEMANTIC_CANDIDATE', category: classification.category };
  }
  return { disposition: 'OBJECTIVE_HARD', category: classification.category };
}

function essentialCandidatesForReport(
  parsed: ParsedBlueprintMarkdown,
  issues: Array<{ code: string; severity: string; path: string; message: string }>,
  factPack: NarrativeFactPack,
  hardTruth: boolean,
  assuranceCategories?: Map<string, AssuranceSemanticCategory>
): SemanticCandidate[] {
  const byTarget = new Map<string, SemanticCandidate>();
  for (const issue of issues) {
    const targetId = `essential:${issue.path}`;
    const block = parsedBlockAtPath(parsed, issue.path);
    const text = block?.text ?? issue.message;
    const existing = byTarget.get(targetId);
    if (existing) {
      existing.issueCode = `${existing.issueCode},${issue.code}`;
      existing.evidenceRefs.push(`validation:${issue.code}`);
      continue;
    }
    byTarget.set(targetId, {
      targetId,
      candidateHash: semanticCandidateHash({ targetId, text, issue: issue.code }),
      text: text.slice(0, 1800),
      fieldRole: 'essential-blueprint-paragraph',
      issueCode: issue.code,
      issueFamily: 'essential_semantic_safety',
      deterministicFeatures: {
        hardTruth,
        validationCode: issue.code,
        permittedClaimRefCount: block?.permittedClaimRefs.length ?? 0,
        ...(assuranceCategories?.has(issue.path) ? { assuranceCategory: assuranceCategories.get(issue.path) } : {})
      },
      evidenceRefs: [`validation:${issue.code}`, ...((block?.permittedClaimRefs ?? []).slice(0, 8).map((ref) => `claim:${ref}`))],
      evidence: { productTier: factPack.productTier, targetPath: issue.path },
      hardTruth,
      deterministicRepairAvailable: false
    });
  }
  return [...byTarget.values()];
}

function partitionEssentialValidationIssues(
  parsed: ParsedBlueprintMarkdown,
  hardIssues: Array<{ code: string; severity: string; path: string; message: string }>,
  semanticIssues: Array<{ code: string; severity: string; path: string; message: string }>,
  factPack: NarrativeFactPack
): { hardCandidates: SemanticCandidate[]; candidates: SemanticCandidate[] } {
  const hardIssuesForCascade: typeof hardIssues = [];
  const candidateIssues: typeof semanticIssues = [];
  const hardAssuranceCategories = new Map<string, AssuranceSemanticCategory>();
  const candidateAssuranceCategories = new Map<string, AssuranceSemanticCategory>();

  const classify = (issue: { code: string; severity: string; path: string; message: string }, source: 'hard' | 'semantic') => {
    if (issue.code !== 'assurance_claim') {
      (source === 'hard' ? hardIssuesForCascade : candidateIssues).push(issue);
      return;
    }
    const result = essentialAssuranceDisposition(parsed, issue);
    if (result.disposition === 'DETERMINISTIC_ALLOW') {
      return;
    } else if (result.disposition === 'SEMANTIC_CANDIDATE') {
      candidateIssues.push(issue);
      if (result.category) candidateAssuranceCategories.set(issue.path, result.category);
    } else {
      hardIssuesForCascade.push(issue);
      if (result.category) hardAssuranceCategories.set(issue.path, result.category);
    }
  };

  for (const issue of hardIssues) classify(issue, 'hard');
  for (const issue of semanticIssues) classify(issue, 'semantic');

  return {
    hardCandidates: essentialCandidatesForReport(parsed, hardIssuesForCascade, factPack, true, hardAssuranceCategories),
    candidates: essentialCandidatesForReport(parsed, candidateIssues, factPack, false, candidateAssuranceCategories)
  };
}

function finalEssentialValidationReport(
  parsed: ParsedBlueprintMarkdown,
  report: ReturnType<typeof validateBlueprintTextManuscript>,
  semanticSafety: SemanticCascadeDiagnostics
): ReturnType<typeof validateBlueprintTextManuscript> {
  const allowedByCascade = new Set(
    semanticSafety.decisions
      .filter((decision) => decision.disposition === 'MUST_ALLOW')
      .map((decision) => decision.targetId.replace(/^essential:/, ''))
  );
  const hardIssues = report.hardTruth.issues.filter((issue) => {
    if (issue.code !== 'assurance_claim') return true;
    const classification = essentialAssuranceDisposition(parsed, issue);
    if (classification.disposition === 'DETERMINISTIC_ALLOW') return false;
    return !allowedByCascade.has(issue.path);
  });
  return {
    ...report,
    ok: hardIssues.length === 0,
    hardTruth: {
      ...report.hardTruth,
      status: hardIssues.length === 0 ? 'PASS' : 'FAIL',
      issues: hardIssues
    }
  };
}

const essentialAdjudicationSchema = z.object({
  decisions: z.array(z.object({
    targetId: z.string().min(1).max(200),
    label: z.enum(['ALLOW_CONTEXT', 'REPAIRABLE', 'CONFIRMED_VIOLATION', 'AMBIGUOUS']),
    confidence: z.number().min(0).max(1),
    reasonCode: z.string().min(1).max(120),
    evidenceRefs: z.array(z.string().min(1).max(120)).max(8)
  }).strict()).max(64)
}).strict();

const essentialRepairSchema = z.object({
  repairs: z.array(z.object({
    targetId: z.string().min(1).max(200),
    repairedText: z.string().trim().min(1).max(2400)
  }).strict()).max(64)
}).strict();

export type EssentialSemanticAdapters = {
  adjudicate: (candidates: SemanticCandidate[]) => Promise<SemanticAdjudicationResult[]>;
  repair: (targets: SemanticCandidate[]) => Promise<SemanticRepairResult[]>;
};

function createEssentialSemanticAdapters(input: {
  writer: WholeManuscriptWriter;
  factPack: NarrativeFactPack;
  blueprint: ReportBlueprint;
}): EssentialSemanticAdapters | undefined {
  if (!input.writer.model) return undefined;
  const provider = input.writer.provider || input.writer.model.split('/')[0] || 'openai';
  const model = input.writer.model;
  const gateway = { only: [provider], tags: ['feature:mk-fraud-readiness-essential', 'stage:semantic-safety'] };
  const boundedFacts = input.factPack.facts.slice(0, 40).map((fact) => ({ id: fact.id, kind: fact.kind, value: fact.value }));
  return {
    async adjudicate(candidates) {
      const response = await generateText({
        model,
        system: 'You are a bounded semantic adjudicator for an MK Fraud Readiness Essential report. Assess only the candidate prose and bounded evidence supplied. You cannot rewrite text. Hard factual or structural failures are already excluded from this call. Use ALLOW_CONTEXT only when the candidate is supported, REPAIRABLE only when a bounded prose repair can preserve the deterministic meaning, and AMBIGUOUS when evidence is insufficient. Return only the structured object.',
        prompt: `Return exactly one disposition for every candidate. Do not add facts or identifiers.\n\nBOUNDED FACTS\n${JSON.stringify(boundedFacts)}\n\nCANDIDATES\n${JSON.stringify(candidates.map((candidate) => ({ targetId: candidate.targetId, fieldRole: candidate.fieldRole, issueCode: candidate.issueCode, issueFamily: candidate.issueFamily, candidateHash: candidate.candidateHash, text: candidate.text, neighbourText: candidate.neighborText, deterministicFeatures: candidate.deterministicFeatures, evidenceRefs: candidate.evidenceRefs, evidence: candidate.evidence })))}\n\nBLUEPRINT SUMMARY\n${JSON.stringify({ schemaVersion: input.blueprint.schemaVersion, reportTier: input.blueprint.reportTier, chapterCount: input.blueprint.chapters.length })}`,
        output: Output.object({ schema: essentialAdjudicationSchema, name: 'mk_essential_semantic_adjudication' }),
        maxOutputTokens: 2048,
        maxRetries: 0,
        providerOptions: { gateway },
        abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
      });
      return response.output.decisions;
    },
    async repair(targets) {
      const response = await generateText({
        model,
        system: 'You are a bounded semantic repair editor for an MK Fraud Readiness Essential report. Return one replacement prose value for each supplied target ID and no other target. Preserve every deterministic fact, evidence reference, finding, scenario, owner, timing, score, maturity and Blueprint hierarchy. Repair only the flagged wording. Do not use em dashes, raw IDs, unsupported numbers, unsupported assurance, invented consequences or new facts. Return only the structured object.',
        prompt: `Repair exactly these target IDs and nothing else.\n\nBOUNDED FACTS\n${JSON.stringify(boundedFacts)}\n\nTARGETS\n${JSON.stringify(targets.map((target) => ({ targetId: target.targetId, fieldRole: target.fieldRole, issueCode: target.issueCode, text: target.text, deterministicFeatures: target.deterministicFeatures, evidenceRefs: target.evidenceRefs, evidence: target.evidence })))}\n\nBLUEPRINT SUMMARY\n${JSON.stringify({ schemaVersion: input.blueprint.schemaVersion, reportTier: input.blueprint.reportTier })}`,
        output: Output.object({ schema: essentialRepairSchema, name: 'mk_essential_semantic_repairs' }),
        maxOutputTokens: 4096,
        maxRetries: 0,
        providerOptions: { gateway },
        abortSignal: AbortSignal.timeout(WHOLE_MANUSCRIPT_TIMEOUT_MS)
      });
      return response.output.repairs;
    }
  };
}

export async function composeEssentialManuscript(input: {
  factPack: NarrativeFactPack;
  writer: WholeManuscriptWriter;
  semanticAdapters?: EssentialSemanticAdapters;
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
    manuscript = await writer.writeManuscript({ context, factPack, blueprint, semanticSafety: true });
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

  const ledger = new SemanticCallLedger();
  ledger.claim('generation');
  const evaluate = (candidate: ParsedBlueprintMarkdown) => {
    const report = validateBlueprintTextManuscript(candidate, authoritativeBlueprint, factPack);
    const partition = partitionEssentialValidationIssues(
      candidate,
      report.hardTruth.issues,
      report.repairableSemantic.issues,
      factPack
    );
    return {
      value: candidate,
      // The legacy validator's hardTruth bucket is intentionally broader than the semantic
      // cascade's hard truth. Explicit limitations are retained in that legacy report for old
      // callers, but are not objective failures at this adapter boundary.
      valid: partition.hardCandidates.length === 0 && partition.candidates.length === 0,
      validationIssues: [...report.hardTruth.issues, ...report.repairableSemantic.issues].map((issue) => issue.code),
      hardCandidates: partition.hardCandidates,
      candidates: partition.candidates
    };
  };
  const adapters = input.semanticAdapters ?? createEssentialSemanticAdapters({ writer, factPack, blueprint: authoritativeBlueprint });
  const cascade = await runSemanticSafetyCascade({
    initialValue: narrative,
    ledger,
    evaluate,
    adjudicate: adapters?.adjudicate,
    repair: adapters?.repair,
    applyRepairs: (value, replacements) => reparseAuthoritativeBlueprint(
      replacements.reduce((current, replacement) => replaceParsedBlock(current, replacement.targetId, replacement.repairedText), value),
      authoritativeBlueprint
    )
  });
  if (cascade.outcome !== 'ACCEPT' || !cascade.value) {
    const finalReport = validateBlueprintTextManuscript(narrative, authoritativeBlueprint, factPack);
    throw new EssentialManuscriptError(
      'semantic_safety',
      `The manuscript failed the semantic safety cascade (${cascade.diagnostics.reasonCode ?? cascade.diagnostics.finalResult}).`,
      {
        ...diagnosticsFrom('semantic_safety', writerIdentity, manuscript),
        parseOk: true,
        validationCode: finalReport.hardTruth.issues[0]?.code,
        validationIssues: finalReport.hardTruth.issues.map((issue) => ({ code: issue.code, path: issue.path, message: String(issue.message ?? '').slice(0, 200) })),
        semanticSafety: cascade.diagnostics
      }
    );
  }

  const finalNarrative = reparseAuthoritativeBlueprint(cascade.value, authoritativeBlueprint);
  const finalReport = finalEssentialValidationReport(
    finalNarrative,
    validateBlueprintTextManuscript(finalNarrative, authoritativeBlueprint, factPack),
    cascade.diagnostics
  );
  try {
    assertBlueprintTextValidation(finalReport);
  } catch (error) {
    throw new EssentialManuscriptError(
      'validate_manuscript',
      error instanceof Error ? error.message : 'The manuscript failed validation.',
      {
        ...diagnosticsFrom('validate_manuscript', writerIdentity, manuscript),
        parseOk: true,
        validationCode: finalReport.hardTruth.issues[0]?.code,
        validationIssues: finalReport.hardTruth.issues.map((issue) => ({ code: issue.code, path: issue.path, message: String(issue.message ?? '').slice(0, 200) })),
        semanticSafety: cascade.diagnostics
      }
    );
  }
  const finalManuscript = finalNarrative.markdown === manuscript.markdown ? manuscript : { ...manuscript, markdown: finalNarrative.markdown };
  return { narrative: finalNarrative, blueprint: authoritativeBlueprint, manuscript: finalManuscript, semanticSafety: cascade.diagnostics };
}

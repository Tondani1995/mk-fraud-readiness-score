import { generateText, Output } from 'ai';
import { z } from 'zod';
import crypto from 'node:crypto';
import { parseAiGatewayExecutionIdentity } from '../automation/ai-gateway-identity';
import { NarrativeWriterUnavailableError } from './manuscript';
import { selectNarrativeModel } from '../ai-model-policy';
import {
  BOUNDED_SECTION_PROMPT_VERSION,
  BoundedTechnicalFailure,
  type BoundedTechnicalFailureDiagnostics,
  type BoundedProviderCall,
  type BoundedProviderMetadata,
  type BoundedSectionProvider,
  type NarrativeSectionContract,
  type NarrativeSlotResult,
  type NarrativeSlotValidationReport
} from './bounded-section-engine';

export const BOUNDED_SECTION_TIMEOUT_MS = 240_000;

/**
 * Output budget for one bounded slot. Covers the narrative, the management
 * implication, the verbatim requirement excerpts that repeat narrative spans,
 * JSON structure, and the reasoning tokens a reasoning model consumes before
 * emitting text.
 */
export function boundedMaxOutputTokens(maximumWords: number): number {
  return Math.min(8_000, Math.max(3_000, Math.ceil(maximumWords * 6)));
}

function providerFromModel(model: string): string {
  return model.split('/')[0]?.trim() || 'vercel-ai-gateway';
}

function requireCredential(model: string): { model: string; provider: string } {
  if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new NarrativeWriterUnavailableError();
  return { model, provider: providerFromModel(model) };
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rawCostMicros(response: any): number | undefined {
  const raw = response?.providerMetadata?.gateway?.cost;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : undefined;
}

function sha(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export const boundedNarrativeSlotResultSchema = z.object({
  contractVersion: z.string().min(1),
  slotId: z.string().min(1),
  narrative: z.string().min(1),
  managementImplication: z.string().min(1),
  usedClaimRefs: z.array(z.string()),
  requirementCoverage: z.array(z.object({ requirementId: z.string().min(1), supportingExcerpt: z.string().min(1) }).strict())
}).strict();

function technicalParseFailure(message: string, rawText: string, cause?: unknown, schemaIssuePaths?: string[], schemaIssueCodes?: string[]): never {
  throw new BoundedTechnicalFailure({
    kind: 'TECHNICAL_OUTPUT_PARSE_FAILURE',
    diagnostics: {
      errorName: cause instanceof Error && cause.name ? cause.name : 'BoundedNarrativeSlotParseError',
      errorMessage: message,
      cause: cause instanceof Error ? cause.message : undefined,
      rawText,
      schemaIssuePaths,
      schemaIssueCodes
    }
  });
}

export function parseBoundedNarrativeSlotText(providerText: string): NarrativeSlotResult {
  const rawText = typeof providerText === 'string' ? providerText : String(providerText ?? '');
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^\`\`\`json[ \t]*\r?\n([\s\S]*?)\r?\n\`\`\`$/i);
  const remaining = fenced ? fenced[1]!.trim() : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(remaining);
  } catch (error) {
    return technicalParseFailure('Provider text was not exactly one complete JSON object.', rawText, error);
  }
  const result = boundedNarrativeSlotResultSchema.safeParse(parsed);
  if (!result.success) {
    return technicalParseFailure(
      'Provider JSON failed the bounded NarrativeSlotResult schema.',
      rawText,
      undefined,
      result.error.issues.map((issue) => issue.path.join('.')),
      result.error.issues.map((issue) => issue.code)
    );
  }
  return result.data as NarrativeSlotResult;
}

function safeDiagnosticValue(value: unknown): string | undefined {
  if (value instanceof Error) return String(value.name) + ': ' + String(value.message);
  if (typeof value === 'string') return value.slice(0, 4_000);
  return undefined;
}

function providerFailure(error: unknown, response?: any, rawText?: string): BoundedTechnicalFailure {
  const cause = error instanceof Error ? error.cause : undefined;
  const diagnostics: BoundedTechnicalFailureDiagnostics = {
    errorName: error instanceof Error && error.name ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
    cause: safeDiagnosticValue(cause),
    responseMetadata: response?.providerMetadata,
    finishReason: typeof response?.finishReason === 'string' ? response.finishReason : undefined,
    usage: response?.usage,
    rawText: rawText ?? (typeof (error as any)?.text === 'string' ? (error as any).text : undefined)
  };
  return new BoundedTechnicalFailure({ kind: 'TECHNICAL_PROVIDER_FAILURE', diagnostics });
}

function attachResponseDiagnostics(error: unknown, response: any, rawText: string): BoundedTechnicalFailure {
  if (error instanceof BoundedTechnicalFailure) {
    return new BoundedTechnicalFailure({
      kind: error.kind,
      diagnostics: {
        ...error.diagnostics,
        responseMetadata: response?.providerMetadata,
        finishReason: typeof response?.finishReason === 'string' ? response.finishReason : undefined,
        usage: response?.usage,
        rawText: error.diagnostics.rawText ?? rawText
      }
    });
  }
  return providerFailure(error, response, rawText);
}

function formatRetryPrompt(contract: NarrativeSectionContract, rejected: { rawText: string; schemaIssuePaths?: string[]; schemaIssueCodes?: string[] }): string {
  return [
    'Your previous reply for this MK Fraud Readiness narrative slot contained the right analysis but the wrong JSON envelope.',
    '',
    'THIS IS A SERIALIZATION CORRECTION ONLY.',
    'Do NOT reconsider, rewrite, shorten, lengthen or improve the analytical content.',
    'Do NOT change the wording of narrative or managementImplication.',
    'Do NOT add or remove claim references. Do NOT change requirement coverage.',
    'Re-emit the SAME answer with the correct keys and types.',
    '',
    'REJECTED OUTPUT:',
    rejected.rawText,
    '',
    'SCHEMA ERRORS:',
    `paths: ${JSON.stringify(rejected.schemaIssuePaths ?? [])}`,
    `codes: ${JSON.stringify(rejected.schemaIssueCodes ?? [])}`,
    '',
    '================ OUTPUT — RETURN THIS OBJECT ONLY ================',
    'Return exactly one JSON object with exactly these six keys and no others:',
    JSON.stringify({
      contractVersion: contract.contractVersion,
      slotId: contract.slotId,
      narrative: '<unchanged prose from your rejected output>',
      managementImplication: '<unchanged implication from your rejected output>',
      usedClaimRefs: ['<unchanged>'],
      requirementCoverage: [{ requirementId: '<unchanged>', supportingExcerpt: '<unchanged, verbatim from narrative>' }]
    }, null, 2),
    '',
    `contractVersion MUST be exactly "${contract.contractVersion}". slotId MUST be exactly "${contract.slotId}".`,
    'DO NOT RETURN any other key, including title, purpose, centralJudgement or transitionCue.',
    'No Markdown. No code fences. No commentary. One JSON object only.'
  ].join('\n');
}

function contractPrompt(contract: NarrativeSectionContract, repair?: { previous: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport; repairNumber: number }): string {
  const repairInstructions = repair ? [
    '',
    `THIS IS BOUNDED REPAIR ${repair.repairNumber} OF 2 FOR THE SAME SLOT. Do not rewrite any other slot.`,
    'Preserve every authorised fact and the contract meaning. Correct only the deterministic rejection reasons below.',
    `REJECTED RESULT: ${JSON.stringify(repair.previous)}`,
    `REJECTION REPORT: ${JSON.stringify(repair.validation)}`
  ] : [];
  return [
    repair ? 'Repair one bounded MK Fraud Readiness v1.1 narrative slot.' : 'Write one bounded MK Fraud Readiness v1.1 narrative slot.',
    '',
    'DETERMINISTIC ENGINE DECIDES. AI EXPLAINS.',
    'The application owns headings, order, scoring, maturity, findings, scenarios, controls, decisions, roadmap, ownership and report compilation.',
    'Use only the authorised facts and permitted claim references in the Section Contract. Do not ask for or infer missing facts. The customer prose must not contain IDs, database keys, machine enums, bullet lists, questionnaire language or claims that MK, the assessment or this report independently verified operating effectiveness.',
    'For every required insight, include one supportingExcerpt copied verbatim from your own narrative. Each requirement ID must occur exactly once in requirementCoverage.',
    ...repairInstructions,
    '',
    '================ LENGTH BUDGET — BOTH LIMITS ARE ENFORCED ================',
    `narrative + managementImplication together: ${contract.fit.minimumWords}-${contract.fit.maximumWords} words AND at most ${contract.fit.maximumCharacters} characters.`,
    `Aim for about ${contract.fit.targetWords} words and about ${contract.fit.targetCharacters} characters.`,
    `Both are checked. At ${contract.fit.maximumWords} words you have roughly ${Math.floor(contract.fit.maximumCharacters / contract.fit.maximumWords)} characters per word including spaces, so write in plain advisory English.`,
    'Prefer short concrete words over long Latinate ones: "use" not "utilisation", "check" not "verification process", "pay" not "disbursement". Name the thing rather than describing the category of thing.',
    '',
    '================ SECTION CONTRACT — INPUT ONLY ================',
    'This object is your brief. It is NOT the shape you return.',
    JSON.stringify(contract),
    '',
    '================ OUTPUT — RETURN THIS OBJECT ONLY ================',
    'Return exactly one JSON object with exactly these six keys and no others:',
    JSON.stringify({
      contractVersion: contract.contractVersion,
      slotId: contract.slotId,
      narrative: '<your customer-facing prose for this slot>',
      managementImplication: '<what management should take from it>',
      usedClaimRefs: ['<claim refs you actually relied on, each drawn from permittedClaimRefs>'],
      requirementCoverage: [{ requirementId: '<id from requiredInsights>', supportingExcerpt: '<verbatim span copied from your narrative>' }]
    }, null, 2),
    '',
    `contractVersion MUST be exactly "${contract.contractVersion}". slotId MUST be exactly "${contract.slotId}".`,
    '',
    'DO NOT RETURN any Section Contract field. In particular DO NOT RETURN:',
    'title, purpose, readerQuestion, requiredManagementTakeaway, requiredInsights, reportThesis, authorisedFacts, primaryContentRefs, permittedCrossReferenceRefs, permittedClaimRefs, contentOwnedElsewhere, forbiddenTopics, prohibitedClaims, style, fit, tier, organisationName, assessmentReference, narrativeRole, context.',
    'DO NOT RETURN centralJudgement or transitionCue. They are not part of this contract.',
    'No Markdown. No code fences. No commentary. No additional keys. One JSON object only.'
  ].join('\n');
}

function metadata(contract: NarrativeSectionContract, model: string, provider: string, response: any, prompt: string, callType: BoundedProviderMetadata['callType'], repairNumber: number): BoundedProviderMetadata {
  const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
  const finishReason = typeof response.finishReason === 'string' ? response.finishReason : typeof response.response?.finishReason === 'string' ? response.response.finishReason : undefined;
  return {
    provider,
    model,
    promptVersion: BOUNDED_SECTION_PROMPT_VERSION,
    generationMode: 'ai',
    generatedAt: new Date().toISOString(),
    generationId: identity?.identity.generationId,
    responseId: typeof response.response?.id === 'string' ? response.response.id : undefined,
    inputTokens: numeric(response.usage?.inputTokens),
    outputTokens: numeric(response.usage?.outputTokens),
    totalTokens: numeric(response.usage?.totalTokens),
    providerCostMicros: identity?.gatewayCostMicros ?? rawCostMicros(response),
    providerCostRaw: typeof response.providerMetadata?.gateway?.cost === 'string' || typeof response.providerMetadata?.gateway?.cost === 'number' ? response.providerMetadata.gateway.cost : undefined,
    finishReason,
    callType,
    repairNumber
  };
}

export class V11BoundedSectionWriter implements BoundedSectionProvider {
  readonly provider: string;
  readonly model: string;

  constructor(model = selectNarrativeModel().fallbackModels[0] ?? 'openai/gpt-5.6-luna') {
    const resolved = requireCredential(model);
    this.model = resolved.model;
    this.provider = resolved.provider;
  }

  private async call(contract: NarrativeSectionContract, callType: BoundedProviderMetadata['callType'], repairNumber: number, repair?: { previous: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport; repairNumber: number }, formatRecovery?: { rejected: { rawText: string; schemaIssuePaths?: string[]; schemaIssueCodes?: string[] }; originCallType: BoundedProviderMetadata['callType'] }): Promise<BoundedProviderCall> {
    const prompt = formatRecovery ? formatRetryPrompt(contract, formatRecovery.rejected) : contractPrompt(contract, repair);
    let response: any;
    try {
      response = await generateText({
        model: this.model,
        system: 'You are the bounded MK Fraud Readiness v1.1 section writer. Deterministic contract facts are the only authority. RETURN EXACTLY ONE JSON OBJECT as plain text. No commentary, explanation, Markdown prose outside the object or multiple objects.',
        prompt,
        output: Output.text(),
        // Reasoning models spend part of the output budget on reasoning tokens
        // before emitting any text, and requirementCoverage repeats verbatim
        // spans of the narrative, so the visible payload is roughly double the
        // slot word budget. Sizing this on words alone truncated the JSON.
        maxOutputTokens: boundedMaxOutputTokens(contract.fit.maximumWords),
        maxRetries: 0,
        providerOptions: { gateway: { only: [this.provider] } },
        abortSignal: AbortSignal.timeout(BOUNDED_SECTION_TIMEOUT_MS)
      });
    } catch (error) {
      throw providerFailure(error);
    }
    let rawText: string;
    try {
      const output = response.output;
      rawText = typeof output === 'string' ? output : typeof response.text === 'string' ? response.text : '';
    } catch (error) {
      throw providerFailure(error, response);
    }
    const finish = typeof response.finishReason === 'string' ? response.finishReason : undefined;
    if (finish === 'length') {
      // A truncated envelope is not recoverable by re-serialising the same
      // truncated text, so surface it distinctly rather than spending the
      // technical format retry on it.
      throw attachResponseDiagnostics(new BoundedTechnicalFailure({
        kind: 'TECHNICAL_PROVIDER_FAILURE',
        diagnostics: {
          errorName: 'BoundedNarrativeSlotTruncated',
          errorMessage: `Provider stopped on output-token limit before completing the JSON object (maxOutputTokens ${boundedMaxOutputTokens(contract.fit.maximumWords)}).`,
          rawText
        }
      }), response, rawText);
    }
    let result: NarrativeSlotResult;
    try {
      result = parseBoundedNarrativeSlotText(rawText);
    } catch (error) {
      throw attachResponseDiagnostics(error, response, rawText);
    }
    return { result, metadata: metadata(contract, this.model, this.provider, response, prompt, callType, repairNumber), prompt };
  }

  generate(contract: NarrativeSectionContract): Promise<BoundedProviderCall> {
    return this.call(contract, 'INITIAL', 0);
  }

  repair(contract: NarrativeSectionContract, rejected: { result: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport }, repairNumber: number): Promise<BoundedProviderCall> {
    return this.call(contract, 'REPAIR', repairNumber, { previous: rejected.result, validation: rejected.validation, repairNumber });
  }

  formatRetry(contract: NarrativeSectionContract, rejected: { rawText: string; schemaIssuePaths?: string[]; schemaIssueCodes?: string[] }, originCallType: BoundedProviderMetadata['callType']): Promise<BoundedProviderCall> {
    return this.call(contract, 'TECHNICAL_FORMAT_RETRY', 0, undefined, { rejected, originCallType });
  }

  qualityEscalate(contract: NarrativeSectionContract, rejected: { result: NarrativeSlotResult | null; validation: NarrativeSlotValidationReport }): Promise<BoundedProviderCall> {
    // Quality escalation is deliberately a separate Terra call. It must never
    // silently reuse the Mini/Luna model that already exhausted bounded repair.
    const escalated = new V11BoundedSectionWriter('openai/gpt-5.6-terra');
    return escalated.call(contract, 'QUALITY_ESCALATION', 0, { previous: rejected.result, validation: rejected.validation, repairNumber: 2 });
  }
}

export function createV11BoundedSectionWriter(model = selectNarrativeModel().fallbackModels[0] ?? 'openai/gpt-5.6-luna'): BoundedSectionProvider {
  return new V11BoundedSectionWriter(model);
}

export function boundedSectionPromptFingerprint(contract: NarrativeSectionContract): string {
  return sha({ promptVersion: BOUNDED_SECTION_PROMPT_VERSION, contract });
}

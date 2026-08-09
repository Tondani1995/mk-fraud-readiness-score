import crypto from 'node:crypto';
import { NoObjectGeneratedError, NoOutputGeneratedError } from 'ai';
import type { AiGatewayExecutionProvenance, NarrativeGenerationUsage } from './types';

export type StructuredOutputDiagnosticStatus =
  | 'structured_output_invalid'
  | 'structured_output_truncated'
  | 'structured_output_refused'
  | 'structured_output_schema_failed'
  | 'structured_output_json_invalid';

export interface StructuredOutputDiagnostics {
  status: StructuredOutputDiagnosticStatus;
  sdkErrorName: string;
  finishReason?: string;
  rawFinishReason?: string;
  responseId?: string;
  responseModelId?: string;
  responseHeadersPresent: boolean;
  providerMetadataPresent: boolean;
  rawTextLength?: number;
  rawTextSha256?: string;
  schemaIssuePaths?: string[];
  schemaIssueCodes?: string[];
  gatewayIdentityError?: string;
}

export class StructuredOutputGenerationError extends Error {
  readonly diagnostics: StructuredOutputDiagnostics;
  readonly provider: string;
  readonly model: string;
  readonly usage?: NarrativeGenerationUsage;
  readonly gateway?: AiGatewayExecutionProvenance;
  readonly gatewayCostMicros?: number;
  readonly latencyMs: number;

  constructor(input: {
    diagnostics: StructuredOutputDiagnostics;
    provider: string;
    model: string;
    usage?: NarrativeGenerationUsage;
    gateway?: AiGatewayExecutionProvenance;
    gatewayCostMicros?: number;
    latencyMs: number;
  }) {
    super(`Structured AI output failed: ${input.diagnostics.status}.`);
    this.name = 'StructuredOutputGenerationError';
    this.diagnostics = input.diagnostics;
    this.provider = input.provider;
    this.model = input.model;
    this.usage = input.usage;
    this.gateway = input.gateway;
    this.gatewayCostMicros = input.gatewayCostMicros;
    this.latencyMs = input.latencyMs;
  }
}

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordLike : null;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

function safeErrorName(error: unknown) {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

function issueDetails(error: unknown) {
  const cause = record(error instanceof Error ? error.cause : undefined);
  const issues = Array.isArray(cause?.issues) ? cause.issues : [];
  const paths = issues
    .map((issue) => {
      const value = record(issue);
      return Array.isArray(value?.path) ? value.path.map((part) => String(part)).join('.') : '';
    })
    .filter(Boolean)
    .slice(0, 32);
  const codes = issues
    .map((issue) => text(record(issue)?.code))
    .filter((value): value is string => Boolean(value))
    .slice(0, 32);
  return { paths: [...new Set(paths)], codes: [...new Set(codes)] };
}

function classify(error: unknown, finishReason?: string): StructuredOutputDiagnosticStatus {
  const name = safeErrorName(error);
  const message = error instanceof Error ? error.message : '';
  if (finishReason === 'length' || finishReason === 'max_tokens') return 'structured_output_truncated';
  if (/refus|content.?policy|safety/i.test(`${name} ${message}`)) return 'structured_output_refused';
  if (/json.?parse|invalid.?json/i.test(`${name} ${message}`)) return 'structured_output_json_invalid';
  if (/schema|validation|type.?validation|noobject/i.test(`${name} ${message}`)) return 'structured_output_schema_failed';
  return 'structured_output_invalid';
}

function safeRawText(error: unknown) {
  const value = error instanceof Error && NoObjectGeneratedError.isInstance(error) ? error.text : undefined;
  if (typeof value !== 'string' || value.length === 0) return {};
  return {
    rawTextLength: value.length,
    rawTextSha256: crypto.createHash('sha256').update(value, 'utf8').digest('hex')
  };
}

export function makeStructuredOutputDiagnostics(input: {
  error: unknown;
  response?: unknown;
  providerMetadata?: unknown;
  finishReason?: unknown;
  rawFinishReason?: unknown;
  gatewayIdentityError?: string;
}): StructuredOutputDiagnostics {
  const responseRecord = record(input.response);
  const issue = issueDetails(input.error);
  const finishReason = text(input.finishReason);
  const rawFinishReason = text(input.rawFinishReason);
  const diagnostics: StructuredOutputDiagnostics = {
    status: classify(input.error, finishReason),
    sdkErrorName: safeErrorName(input.error),
    finishReason,
    rawFinishReason,
    responseId: text(responseRecord?.id),
    responseModelId: text(responseRecord?.modelId),
    responseHeadersPresent: Boolean(responseRecord?.headers),
    providerMetadataPresent: input.providerMetadata !== undefined && input.providerMetadata !== null,
    schemaIssuePaths: issue.paths,
    schemaIssueCodes: issue.codes,
    gatewayIdentityError: input.gatewayIdentityError,
    ...safeRawText(input.error)
  };
  return diagnostics;
}

export function isStructuredOutputSdkError(error: unknown) {
  return NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
}

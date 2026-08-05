import type { AiGatewayExecutionProvenance } from './types';

type JsonRecord = Record<string, unknown>;

export class AiGatewayIdentityVerificationError extends Error {
  readonly failureClass = 'provider_declared' as const;

  constructor(detail: string) {
    super(`AI Gateway execution identity could not be verified${detail ? `: ${detail}` : '.'}`);
    this.name = 'AiGatewayIdentityVerificationError';
  }
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function normaliseProvider(value: string): string {
  return value.trim().toLowerCase();
}

function modelAliases(value: string, provider: string): Set<string> {
  const trimmed = value.trim().toLowerCase();
  const aliases = new Set([trimmed]);
  const prefix = `${provider.toLowerCase()}/`;
  if (trimmed.startsWith(prefix)) aliases.add(trimmed.slice(prefix.length));
  else aliases.add(`${prefix}${trimmed}`);
  return aliases;
}

function modelsAgree(left: string, right: string, provider: string): boolean {
  const leftAliases = modelAliases(left, provider);
  return [...modelAliases(right, provider)].some((alias) => leftAliases.has(alias));
}

function parseCostMicros(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 1_000_000) : undefined;
}

export function parseAiGatewayExecutionIdentity(input: {
  requestedProvider: string;
  requestedModel: string;
  providerMetadata?: unknown;
  response?: unknown;
}): { identity: AiGatewayExecutionProvenance; gatewayCostMicros?: number } {
  const requestedProvider = normaliseProvider(input.requestedProvider);
  const gateway = record(record(input.providerMetadata)?.gateway);
  const routing = record(gateway?.routing);
  if (!gateway || !routing) throw new AiGatewayIdentityVerificationError('Gateway routing metadata is missing.');

  const generationId = text(gateway.generationId);
  const originalModelId = text(routing.originalModelId);
  const canonicalSlug = text(routing.canonicalSlug);
  const resolvedProvider = text(routing.resolvedProvider);
  const finalProvider = text(routing.finalProvider);
  const resolvedProviderApiModelId = text(routing.resolvedProviderApiModelId);
  const sdkResponseModelId = text(record(input.response)?.modelId);

  if (!generationId) throw new AiGatewayIdentityVerificationError('Gateway generationId is missing.');
  if (!resolvedProvider && !finalProvider) throw new AiGatewayIdentityVerificationError('Gateway routing provider is missing.');
  if (resolvedProvider && finalProvider && normaliseProvider(resolvedProvider) !== normaliseProvider(finalProvider)) {
    throw new AiGatewayIdentityVerificationError('Gateway routing providers disagree.');
  }

  const effectiveProvider = normaliseProvider(finalProvider ?? resolvedProvider!);
  if (effectiveProvider !== requestedProvider) {
    throw new AiGatewayIdentityVerificationError(`Gateway resolved provider ${effectiveProvider} is not authorised.`);
  }
  if (!resolvedProviderApiModelId) throw new AiGatewayIdentityVerificationError('Gateway resolvedProviderApiModelId is missing.');
  if (!originalModelId && !canonicalSlug) throw new AiGatewayIdentityVerificationError('Gateway model proof is missing.');
  if (originalModelId && originalModelId !== input.requestedModel) {
    throw new AiGatewayIdentityVerificationError('Gateway originalModelId does not match the requested model.');
  }
  if (canonicalSlug && canonicalSlug !== input.requestedModel) {
    throw new AiGatewayIdentityVerificationError('Gateway canonicalSlug does not match the requested model.');
  }
  if (sdkResponseModelId && !modelsAgree(sdkResponseModelId, resolvedProviderApiModelId, requestedProvider)) {
    throw new AiGatewayIdentityVerificationError('SDK response model contradicts Gateway routing identity.');
  }

  return {
    identity: {
      generationId,
      originalModelId,
      canonicalSlug,
      resolvedProvider: resolvedProvider ? normaliseProvider(resolvedProvider) : undefined,
      finalProvider: finalProvider ? normaliseProvider(finalProvider) : undefined,
      resolvedProviderApiModelId,
      sdkResponseModelId,
      identitySource: 'gateway.routing'
    },
    gatewayCostMicros: parseCostMicros(gateway.cost)
  };
}

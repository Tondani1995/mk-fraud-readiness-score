/**
 * Versioned, provenance-carrying operating context.
 *
 * Gateway numbers are transport positions, not meaning. This module is the one place where a
 * compiled adaptive graph is translated into canonical operating facts. Every fact retains the
 * exact question and option that produced it, so customer language can never be assembled from a
 * positional assumption alone.
 */

import v11Graph from '../../../../docs/adaptive-assessment/adaptive-graph-v1-draft.json' with { type: 'json' };
import v12Graph from '../../adaptive/candidates/adaptive-graph-v1-2-candidate.json' with { type: 'json' };

/** Canonical, version-independent operating-context keys. */
export const OPERATING_CONTEXT_KEYS = [
  'OPERATING_ENVIRONMENT',
  'WORKFORCE_SIZE',
  'EXTERNAL_SUPPLIERS_PRESENT',
  'SUPPLIER_MANAGEMENT_MODEL',
  'PROCUREMENT_MODEL',
  'PHYSICAL_CASH_EXPOSURE',
  'STOCK_OR_PHYSICAL_ASSETS',
  'PAYROLL_DELIVERY_MODEL',
  'CUSTOMER_DIGITAL_CHANNELS',
  'CUSTOMER_DIGITAL_PAYMENTS',
  'PERSONAL_OR_IDENTITY_DATA',
  'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS',
  'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS',
  'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE',
  'REMOTE_SYSTEM_OR_DATA_ACCESS',
  'HIGHER_RISK_PAYMENT_APPROVAL_MODEL',
  'INTERMEDIARY_EXPOSURE'
] as const;

export type OperatingContextKey = (typeof OPERATING_CONTEXT_KEYS)[number];

/** Explicitly retained truth state; UNKNOWN is not the same as NO. */
export type ContextCertainty = 'AFFIRMED' | 'NEGATED' | 'NOT_ESTABLISHED';

/** The fact came directly from a recorded adaptive gateway response. */
export type ContextProvenance = 'RECORDED_GATEWAY_RESPONSE';

export interface OperatingContextFact {
  key: OperatingContextKey;
  /** Normalised semantic option value, never a customer-authored sentence. */
  value: string;
  certainty: ContextCertainty;
  sourceGatewayCode: string;
  sourceQuestionId: string;
  sourcePrompt: string;
  sourceOptionId: string;
  sourceOptionLabel: string;
  graphVersion: string;
  graphFingerprint?: string;
  provenance: ContextProvenance;
  /** True means bounded customer language may describe this recorded position. */
  customerNarrativeAllowed: boolean;
}

export interface CompiledOperatingGraph {
  graphVersion?: string;
  graphFingerprint?: string;
  gateways?: Array<{
    questionId?: string;
    prompt?: string;
    responseOptions?: Array<{ value?: string; label?: string }>;
  }>;
}

export interface OperatingContextMappingEntry {
  key: OperatingContextKey;
  gatewayCode: string;
}

interface GraphSemantics {
  graphVersion: string;
  graphFingerprint: string;
  graph: CompiledOperatingGraph;
  mappings: readonly OperatingContextMappingEntry[];
}

export class UnsupportedGraphVersionError extends Error {
  readonly graphVersion: string;

  constructor(graphVersion: string) {
    super(
      `operating-context: no semantic mapping is registered for graph "${graphVersion}". `
      + 'Refusing to interpret gateway answers through another version\'s mapping.'
    );
    this.name = 'UnsupportedGraphVersionError';
    this.graphVersion = graphVersion;
  }
}

export class OperatingContextGraphMismatchError extends Error {
  readonly graphVersion: string;
  readonly expectedFingerprint: string;
  readonly actualFingerprint: string | undefined;

  constructor(graphVersion: string, expectedFingerprint: string, actualFingerprint: string | undefined) {
    super(
      `operating-context: compiled graph "${graphVersion}" does not match the registered `
      + `fingerprint (expected ${expectedFingerprint}, received ${actualFingerprint ?? 'missing'}).`
    );
    this.name = 'OperatingContextGraphMismatchError';
    this.graphVersion = graphVersion;
    this.expectedFingerprint = expectedFingerprint;
    this.actualFingerprint = actualFingerprint;
  }
}

export class OperatingContextProvenanceError extends Error {
  readonly graphVersion: string;
  readonly gatewayCode: string;
  readonly detail: string;

  constructor(graphVersion: string, gatewayCode: string, detail: string) {
    super(`operating-context: ${graphVersion} ${gatewayCode}: ${detail}`);
    this.name = 'OperatingContextProvenanceError';
    this.graphVersion = graphVersion;
    this.gatewayCode = gatewayCode;
    this.detail = detail;
  }
}

/** V1.2 is the active owner-approved candidate graph for this increment. */
const V12_MAPPINGS: readonly OperatingContextMappingEntry[] = [
  { key: 'OPERATING_ENVIRONMENT', gatewayCode: 'G01' },
  { key: 'WORKFORCE_SIZE', gatewayCode: 'G02' },
  { key: 'EXTERNAL_SUPPLIERS_PRESENT', gatewayCode: 'G03' },
  { key: 'SUPPLIER_MANAGEMENT_MODEL', gatewayCode: 'G04' },
  { key: 'PROCUREMENT_MODEL', gatewayCode: 'G05' },
  { key: 'PHYSICAL_CASH_EXPOSURE', gatewayCode: 'G06' },
  { key: 'STOCK_OR_PHYSICAL_ASSETS', gatewayCode: 'G07' },
  { key: 'PAYROLL_DELIVERY_MODEL', gatewayCode: 'G08' },
  { key: 'CUSTOMER_DIGITAL_CHANNELS', gatewayCode: 'G09' },
  { key: 'CUSTOMER_DIGITAL_PAYMENTS', gatewayCode: 'G10' },
  { key: 'PERSONAL_OR_IDENTITY_DATA', gatewayCode: 'G11' },
  { key: 'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS', gatewayCode: 'G12' },
  { key: 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS', gatewayCode: 'G13' },
  { key: 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE', gatewayCode: 'G14' },
  { key: 'REMOTE_SYSTEM_OR_DATA_ACCESS', gatewayCode: 'G15' },
  { key: 'HIGHER_RISK_PAYMENT_APPROVAL_MODEL', gatewayCode: 'G16' },
  { key: 'INTERMEDIARY_EXPOSURE', gatewayCode: 'G17' }
] as const;

/**
 * V1.1 is registered separately only to prevent historical assessments being read through V1.2.
 * Ambiguous V1.1 questions (combined remote/platform dependence and supplier wording that does
 * not identify a management owner) are intentionally not mapped.
 */
const V11_MAPPINGS: readonly OperatingContextMappingEntry[] = [
  { key: 'OPERATING_ENVIRONMENT', gatewayCode: 'G01' },
  { key: 'WORKFORCE_SIZE', gatewayCode: 'G02' },
  { key: 'PROCUREMENT_MODEL', gatewayCode: 'G04' },
  { key: 'PHYSICAL_CASH_EXPOSURE', gatewayCode: 'G05' },
  { key: 'STOCK_OR_PHYSICAL_ASSETS', gatewayCode: 'G06' },
  { key: 'PAYROLL_DELIVERY_MODEL', gatewayCode: 'G07' },
  { key: 'CUSTOMER_DIGITAL_CHANNELS', gatewayCode: 'G08' },
  { key: 'PERSONAL_OR_IDENTITY_DATA', gatewayCode: 'G09' },
  { key: 'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS', gatewayCode: 'G10' },
  { key: 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS', gatewayCode: 'G11' },
  { key: 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE', gatewayCode: 'G12' },
  { key: 'HIGHER_RISK_PAYMENT_APPROVAL_MODEL', gatewayCode: 'G14' }
] as const;

const V12_GRAPH_VERSION = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821';
const V12_GRAPH_FINGERPRINT = '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7';
const V11_GRAPH_VERSION = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
const V11_GRAPH_FINGERPRINT = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab';

const REGISTRY: readonly GraphSemantics[] = [
  {
    graphVersion: V12_GRAPH_VERSION,
    graphFingerprint: V12_GRAPH_FINGERPRINT,
    graph: v12Graph as CompiledOperatingGraph,
    mappings: V12_MAPPINGS
  },
  {
    graphVersion: V11_GRAPH_VERSION,
    graphFingerprint: V11_GRAPH_FINGERPRINT,
    graph: v11Graph as CompiledOperatingGraph,
    mappings: V11_MAPPINGS
  }
];

const NEGATIVE_OPTION_VALUES = new Set(['no', 'none', 'no_procurement', 'no_payroll', 'no_formal']);
const UNKNOWN_OPTION_VALUES = new Set(['unknown']);

export interface DeriveOperatingContextInput {
  graphVersion: string | null | undefined;
  gatewayAnswers: Readonly<Record<string, string>> | null | undefined;
  /** Optional active compiled graph. Its version and fingerprint must match the registry. */
  graph?: CompiledOperatingGraph;
}

export function isSupportedGraphVersion(graphVersion: string | null | undefined): boolean {
  return REGISTRY.some((entry) => entry.graphVersion === graphVersion);
}

export function registeredGraphVersions(): string[] {
  return REGISTRY.map((entry) => entry.graphVersion);
}

export function registeredOperatingContextMappings(graphVersion: string): OperatingContextMappingEntry[] {
  const semantics = REGISTRY.find((entry) => entry.graphVersion === graphVersion);
  if (!semantics) throw new UnsupportedGraphVersionError(graphVersion);
  return semantics.mappings.map((entry) => ({ ...entry }));
}

export function gatewaySemanticKeys(graphVersion: string): Readonly<Record<string, OperatingContextKey[]>> {
  const grouped: Record<string, OperatingContextKey[]> = {};
  for (const entry of registeredOperatingContextMappings(graphVersion)) {
    (grouped[entry.gatewayCode] ??= []).push(entry.key);
  }
  return grouped;
}

function certaintyFor(optionValue: string): ContextCertainty {
  if (UNKNOWN_OPTION_VALUES.has(optionValue)) return 'NOT_ESTABLISHED';
  if (NEGATIVE_OPTION_VALUES.has(optionValue)) return 'NEGATED';
  return 'AFFIRMED';
}

function validateGraph(semantics: GraphSemantics, graph: CompiledOperatingGraph): void {
  if (graph.graphVersion !== semantics.graphVersion || graph.graphFingerprint !== semantics.graphFingerprint) {
    throw new OperatingContextGraphMismatchError(semantics.graphVersion, semantics.graphFingerprint, graph.graphFingerprint);
  }
}

function graphGateways(graph: CompiledOperatingGraph, semantics: GraphSemantics): Map<string, NonNullable<CompiledOperatingGraph['gateways']>[number]> {
  const gateways = graph.gateways ?? [];
  const byId = new Map(gateways.map((gateway) => [String(gateway.questionId ?? ''), gateway]));
  for (const entry of semantics.mappings) {
    const matches = gateways.filter((candidate) => String(candidate.questionId ?? '') === entry.gatewayCode);
    const gateway = matches[0];
    if (matches.length !== 1 || !gateway) throw new OperatingContextProvenanceError(semantics.graphVersion, entry.gatewayCode, 'mapped question is missing or duplicated in the compiled graph');
    if (!gateway.prompt?.trim()) throw new OperatingContextProvenanceError(semantics.graphVersion, entry.gatewayCode, 'mapped question has no compiled prompt');
  }
  return byId;
}

/**
 * Resolve only facts the active graph can prove. A mapped answer with a missing compiled option
 * throws rather than becoming a partially-proven fact. That makes graph/mapping drift visible and
 * prevents a raw gateway value from crossing into customer narrative.
 */
export function deriveOperatingContext(input: DeriveOperatingContextInput): OperatingContextFact[] {
  const graphVersion = String(input.graphVersion ?? '');
  const semantics = REGISTRY.find((entry) => entry.graphVersion === graphVersion);
  if (!semantics) throw new UnsupportedGraphVersionError(graphVersion || 'unknown');
  if (!input.gatewayAnswers || Object.keys(input.gatewayAnswers).length === 0) return [];

  const graph = input.graph ?? semantics.graph;
  validateGraph(semantics, graph);
  const gateways = graphGateways(graph, semantics);
  const facts: OperatingContextFact[] = [];

  for (const entry of semantics.mappings) {
    const optionValue = input.gatewayAnswers[entry.gatewayCode];
    if (optionValue === undefined || optionValue === null || optionValue === '') continue;
    if (typeof optionValue !== 'string') {
      throw new OperatingContextProvenanceError(semantics.graphVersion, entry.gatewayCode, 'recorded response is not a string option value');
    }

    const gateway = gateways.get(entry.gatewayCode)!;
    const options = (gateway.responseOptions ?? []).filter((candidate) => candidate.value === optionValue);
    const option = options[0];
    if (options.length !== 1 || !option?.value || !option.label?.trim()) {
      throw new OperatingContextProvenanceError(
        semantics.graphVersion,
        entry.gatewayCode,
        `recorded option "${optionValue}" is not present exactly once in the compiled graph`
      );
    }

    facts.push({
      key: entry.key,
      value: option.value.trim(),
      certainty: certaintyFor(option.value.trim()),
      sourceGatewayCode: entry.gatewayCode,
      sourceQuestionId: String(gateway.questionId),
      sourcePrompt: gateway.prompt!.trim(),
      sourceOptionId: option.value.trim(),
      sourceOptionLabel: option.label.trim(),
      graphVersion: semantics.graphVersion,
      graphFingerprint: semantics.graphFingerprint,
      provenance: 'RECORDED_GATEWAY_RESPONSE',
      customerNarrativeAllowed: true
    });
  }
  return facts;
}

export function contextFact(
  facts: readonly OperatingContextFact[],
  key: OperatingContextKey
): OperatingContextFact | undefined {
  return facts.find((fact) => fact.key === key);
}

export function contextAffirms(
  facts: readonly OperatingContextFact[],
  key: OperatingContextKey,
  ...values: string[]
): boolean {
  const fact = contextFact(facts, key);
  if (!fact || fact.certainty !== 'AFFIRMED') return false;
  return values.length === 0 || values.includes(fact.value);
}

export function contextNegates(facts: readonly OperatingContextFact[], key: OperatingContextKey): boolean {
  return contextFact(facts, key)?.certainty === 'NEGATED';
}

export function contextNotEstablished(facts: readonly OperatingContextFact[], key: OperatingContextKey): boolean {
  return contextFact(facts, key)?.certainty === 'NOT_ESTABLISHED';
}

function lowerInitial(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function unknownLanguage(fact: OperatingContextFact, subject: string): string {
  return `The assessment did not establish whether ${subject}.`;
}

/**
 * Bounded customer language for one fact. It uses the compiled graph label and prompt, but never
 * turns a negative into a broader absence or an unknown into a negative.
 */
export function describeOperatingContextFact(fact: OperatingContextFact): string {
  if (!fact.customerNarrativeAllowed) return '';
  const label = lowerInitial(fact.sourceOptionLabel);
  switch (fact.key) {
    case 'OPERATING_ENVIRONMENT':
      return fact.certainty === 'NOT_ESTABLISHED'
        ? unknownLanguage(fact, 'the organisation\'s operating environment')
        : `The assessment records ${label.toLowerCase()} as the organisation's operating environment.`;
    case 'WORKFORCE_SIZE':
      return fact.certainty === 'NOT_ESTABLISHED'
        ? unknownLanguage(fact, 'the size of the organisation\'s workforce')
        : `The assessment records a workforce of ${fact.sourceOptionLabel}.`;
    case 'EXTERNAL_SUPPLIERS_PRESENT':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether external suppliers, contractors or service providers are used');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no external suppliers, contractors or service providers.'
        : 'The assessment records that external suppliers, contractors or service providers are used.';
    case 'SUPPLIER_MANAGEMENT_MODEL':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'who handles supplier onboarding and ongoing supplier management');
      return `The assessment records supplier onboarding and ongoing supplier management as: ${fact.sourceOptionLabel}.`;
    case 'PROCUREMENT_MODEL':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'who handles procurement and sourcing');
      return `The assessment records procurement and sourcing as: ${fact.sourceOptionLabel}.`;
    case 'PHYSICAL_CASH_EXPOSURE':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether physical cash is handled in normal operations');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no physical cash handling in normal operations.'
        : 'The assessment records physical cash handling in normal operations.';
    case 'STOCK_OR_PHYSICAL_ASSETS':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether stock, inventory or valuable physical assets are held or managed');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no stock, inventory or valuable physical assets held or managed.'
        : 'The assessment records stock, inventory or valuable physical assets held or managed.';
    case 'PAYROLL_DELIVERY_MODEL':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'who is responsible for delivering payroll');
      return `The assessment records payroll delivery as: ${fact.sourceOptionLabel}.`;
    case 'CUSTOMER_DIGITAL_CHANNELS':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'which customer or user digital channels are operated');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no customer-facing digital channel.'
        : `The assessment records customer or user digital channels as: ${fact.sourceOptionLabel}.`;
    case 'CUSTOMER_DIGITAL_PAYMENTS':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether customer or user payments are accepted through digital channels');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no customer or user digital payments.'
        : 'The assessment records customer or user digital payments.';
    case 'PERSONAL_OR_IDENTITY_DATA':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether personal or identity information is handled');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no personal or identity information handling.'
        : 'The assessment records personal or identity information handling.';
    case 'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether people can make manual financial, stock or similar record adjustments');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no manual financial, stock or similar record adjustments.'
        : 'The assessment records that people can make manual financial, stock or similar record adjustments.';
    case 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether the organisation operates from more than one site, store or project location');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records a single-site operating footprint.'
        : 'The assessment records that the organisation operates from more than one site, store or project location.';
    case 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether temporary, seasonal or subcontracted workers are used');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records that temporary, seasonal or subcontracted workers are not used.'
        : 'The assessment records that temporary, seasonal or subcontracted workers are used.';
    case 'REMOTE_SYSTEM_OR_DATA_ACCESS':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'whether systems or organisation data can be accessed remotely');
      return fact.certainty === 'NEGATED'
        ? 'The assessment records no remote access to systems or organisation data.'
        : 'The assessment records remote access to systems or organisation data.';
    case 'HIGHER_RISK_PAYMENT_APPROVAL_MODEL':
      if (fact.certainty === 'NOT_ESTABLISHED') return unknownLanguage(fact, 'which approval arrangement normally applies to higher-risk payments or significant spending');
      return `The assessment records the higher-risk payment or significant-spending approval arrangement as: ${fact.sourceOptionLabel}.`;
    case 'INTERMEDIARY_EXPOSURE':
      if (fact.certainty === 'NOT_ESTABLISHED') return 'The assessment did not establish whether agents, brokers, distributors or other intermediaries are used.';
      return fact.certainty === 'NEGATED'
        ? 'The assessment records that agents, brokers, distributors or other intermediaries are not used.'
        : 'The assessment records that agents, brokers, distributors or other intermediaries are used.';
    default: {
      const exhaustive: never = fact.key;
      return exhaustive;
    }
  }
}

/** The graph version persisted with an adaptive score run, if available. */
export function adaptiveGraphVersionForAssessment(input: {
  adaptiveScope?: { graphVersion?: string | null } | null;
  scoreRun?: { adaptiveMetrics?: { graphVersion?: string | null } | null } | null;
}): string | undefined {
  const version = input.scoreRun?.adaptiveMetrics?.graphVersion ?? input.adaptiveScope?.graphVersion;
  return typeof version === 'string' && version.trim() ? version : undefined;
}

/**
 * Narrative callers use this safe adapter for legacy/pre-adaptive records. Empty or malformed
 * legacy input produces no operating facts; it never falls back to a positional interpretation.
 * Direct resolver callers still receive the typed error for unsupported or drifted graphs.
 */
export function deriveNarrativeOperatingContext(input: DeriveOperatingContextInput): OperatingContextFact[] {
  if (!input.gatewayAnswers || Object.keys(input.gatewayAnswers).length === 0) return [];
  try {
    return deriveOperatingContext(input);
  } catch (error) {
    if (error instanceof UnsupportedGraphVersionError
      || error instanceof OperatingContextGraphMismatchError
      || error instanceof OperatingContextProvenanceError) return [];
    throw error;
  }
}

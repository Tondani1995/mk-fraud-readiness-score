import { createGateway, generateText, NoOutputGeneratedError, Output } from 'ai';
import { z } from 'zod';
import type { FreeSnapshot } from './free-snapshot';
import type { CommercialSnapshotInsights } from './commercial-insights';
import {
  buildDeterministicSnapshotNarrativeContent,
  buildDeterministicSnapshotPrioritySignals,
  buildMinimalSafeSnapshotNarrativeContent
} from './deterministic-narrative';
import { classifyAssuranceLanguage } from '../reports/narrative/validation';
import { parseAiGatewayExecutionIdentity } from '../reports/automation/ai-gateway-identity';
import { selectSnapshotModel } from '../reports/ai-model-policy';

export const SNAPSHOT_NARRATIVE_PROMPT_VERSION = 'mk-snapshot-five-part-advisory-v6-bounded-repair-canonical-facts';
export const SNAPSHOT_NARRATIVE_MAX_WORDS = 180;

const shortText = (max: number) => z.string().trim().min(1).max(max);

/** The complete customer-visible Snapshot interpretation contract. */
export const snapshotNarrativeContentSchema = z.object({
  headline: shortText(160),
  executiveDiagnosis: shortText(700),
  strength: shortText(320),
  prioritySignals: z.array(shortText(220)).length(2),
  managementImplication: shortText(420)
}).strict();

const snapshotAiNarrativeContentSchema = z.object({
  headline: shortText(160),
  executiveDiagnosis: shortText(700),
  strength: shortText(320),
  managementImplication: shortText(420)
}).strict();

export type SnapshotNarrativeContent = z.infer<typeof snapshotNarrativeContentSchema>;

export type SnapshotNarrativeInput = {
  organisationName: string | null;
  overallScore: number | null;
  maturity: string | null;
  coveragePct: number;
  nARatePct: number;
  criticalGapCount: number;
  majorGapCount: number;
  resultStatus: string | null;
  strongestAreas: string[];
  attentionAreas: string[];
  nextStepDirection: string;
  assuranceBoundary: string;
};

/**
 * The deliberately small fact set given to the AI prose generator.
 *
 * Numerical diagnostics remain available to the deterministic result interface and to the
 * full validation input above. They are excluded here so the five prose fields cannot turn a
 * coverage or gap count into an unsupported customer claim.
 */
export type SnapshotNarrativeBrief = {
  organisationName: string | null;
  maturity: string | null;
  resultStatus: string | null;
  strongestAreas: string[];
  attentionAreas: string[];
  nextStepDirection: string;
  assuranceBoundary: string;
};

export type SnapshotNarrativeValidationInput = SnapshotNarrativeInput | SnapshotNarrativeBrief;
type SnapshotNarrativeValidationOptions = { mode?: 'ai' | 'deterministic' };

export type SnapshotNarrativeAiField = 'headline' | 'executiveDiagnosis' | 'strength' | 'managementImplication';

export type SnapshotNarrativeRepairRequest = {
  validationCodes: string[];
  fields: SnapshotNarrativeAiField[];
};

export type SnapshotNarrativeFailureClass =
  | 'VALIDATOR_FALSE_POSITIVE / CANONICAL_FACT'
  | 'REPAIRABLE_AI_SEMANTIC_FAILURE'
  | 'HARD_UNSUPPORTED_AI_CLAIM'
  | 'TECHNICAL_PROVIDER_FAILURE'
  | 'DETERMINISTIC/FALLBACK VALIDATION DEFECT';

export type SnapshotNarrative = SnapshotNarrativeContent & {
  mode: 'ai' | 'deterministic';
  model: string;
  promptVersion: string;
  aiCallCount: number;
  attemptedModels?: string[];
  fallbackReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  /** Internal hand-off from a rejected first AI pass to one targeted repair attempt. */
  repairRequest?: SnapshotNarrativeRepairRequest;
};

export type SnapshotNarrativeCacheKey = {
  assessmentId: string;
  scoreRunId: string;
  methodologyVersion: string;
  promptVersion: string;
};

export type SnapshotNarrativeCacheRecord = {
  status: 'available' | 'fallback';
  narrativeJson: unknown;
  model: string;
  aiCallCount: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  fallbackReason?: string | null;
};

export type SnapshotNarrativeCache = {
  read: (key: SnapshotNarrativeCacheKey) => Promise<SnapshotNarrativeCacheRecord | null>;
  write: (key: SnapshotNarrativeCacheKey, record: SnapshotNarrativeCacheRecord) => Promise<void>;
};

/** Request-scoped Gateway authentication. This value is never persisted or included in cache keys. */
export type SnapshotGatewayAuth = {
  requestOidcToken?: string | null;
};

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function wordCount(value: string): number { return (value.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) ?? []).length; }
function numbers(value: string): Set<string> { return new Set((value.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []).map((item) => item.replace('%', ''))); }
function validAiCallCount(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2; }
function sentenceCount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return Math.max(1, (trimmed.match(/[.!?]+(?=\s|$)/g) ?? []).length);
}
function forbiddenSnapshotDetail(value: string): boolean {
  return /\b(?:30\/60\/90|30-,? ?60-,? ?and 90-day|roadmap|blueprint|risk register|scenario(?:s)?|leadership agenda|evidence checklist|control action(?:s)?|target-state|operating model|decision library|supporting register|supporting xlsx|comprehensive|essential report|paid report|detailed report|provider|gateway|model|unavailable|fallback)\b/i.test(value);
}

const CALIBRATED_SELF_ASSESSMENT_LANGUAGE = /\b(?:recorded responses?|self-assessment|assessment records?|recorded result|result (?:points|indicates|suggests)|responses? (?:indicate|suggest))\b/i;
const UNSUPPORTED_CONTROL_ABSOLUTE = /\b(?:controls?|control environment|fraud controls?)\s+(?:are|were|remain|appear|seem)\s+(?:not\s+(?:functioning|working|effective|operating|present|reliable)|absent|ineffective|non[- ]?functioning|failing)\b|\b(?:no|without)\s+(?:effective\s+)?controls?\b|\b(?:control|controls?)\s+(?:failure|failures|absence|absent|ineffective|non[- ]?functioning)\b/i;
const UNSUPPORTED_COVERAGE_CLAIM = /\bno\s+blind\s+spots?\b|\b(?:full|complete|comprehensive|total)\s+(?:assessment\s+)?coverage\b|\bcoverage\b.{0,80}\b(?:all\s+risks?|ensures?|guarantees?|leaves?\s+no)\b/i;
const UNSUPPORTED_CONSEQUENCE = /\b(?:fraud losses?|account compromise|financial losses?|financial loss|realised harm|realized harm|exposure events?|security incidents?|fraud incidents?)\b/i;
const UNSUPPORTED_ASSURANCE_REQUIREMENT = /\b(?:requires?|need(?:s)?|must|should)\b.{0,40}\b(?:assurance activities?|an?\s+assurance|independent validation|independent review)\b|\bassurance\s+is\s+(?:required|needed)\b/i;
const UNSUPPORTED_PROCEDURAL_METRIC_DISCUSSION = /\b(?:assessment\s+coverage|control\s+visibility|unknown(?:[- ]share)?(?:\s+(?:responses?|percentage|rate))?|unanswered\s+responses?|coverage|completeness|blind\s+spots?|(?:critical(?:[- ]control)?|major)\s+gaps?|gap\s+counts?)\b/i;

const REPAIRABLE_SNAPSHOT_ISSUES = new Set([
  'snapshot_narrative_too_long',
  'snapshot_diagnosis_too_long',
  'paid_tier_detail_leakage',
  'snapshot_narrative_unavailable_message',
  'raw_internal_id',
  'raw_internal_enum',
  'assurance_claim',
  'invented_number',
  'snapshot_procedural_metric_leakage',
  'snapshot_em_dash',
  'snapshot_uncalibrated_interpretation',
  'snapshot_unsupported_control_assertion',
  'snapshot_unsupported_coverage_claim',
  'snapshot_unsupported_consequence_claim',
  'snapshot_unsupported_assurance_requirement',
  'snapshot_domain_gap_count_attribution'
]);

const HARD_UNSUPPORTED_SNAPSHOT_ISSUES = new Set([
  'snapshot_unsupported_control_assertion',
  'snapshot_unsupported_coverage_claim',
  'snapshot_unsupported_consequence_claim',
  'snapshot_unsupported_assurance_requirement',
  'snapshot_domain_gap_count_attribution',
  'invented_number'
]);

const AI_FIELDS: SnapshotNarrativeAiField[] = ['headline', 'executiveDiagnosis', 'strength', 'managementImplication'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canonicalDomainNames(input: SnapshotNarrativeValidationInput): string[] {
  return [...new Set([...input.strongestAreas, ...input.attentionAreas]
    .map((name) => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean))];
}

/** Remove only exact authorised domain-label tokens before consequence matching. */
function withoutCanonicalDomainLabels(text: string, input: SnapshotNarrativeValidationInput): string {
  return canonicalDomainNames(input).reduce((value, domain) => {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(domain)}(?=$|[^\\p{L}\\p{N}])`, 'giu');
    return value.replace(pattern, '$1');
  }, text);
}

function isCanonicalConsequenceFalsePositive(content: SnapshotNarrativeContent, input: SnapshotNarrativeValidationInput): boolean {
  const text = [content.headline, content.executiveDiagnosis, content.strength, ...content.prioritySignals, content.managementImplication].join('\n');
  return UNSUPPORTED_CONSEQUENCE.test(text)
    && !UNSUPPORTED_CONSEQUENCE.test(withoutCanonicalDomainLabels(text, input));
}

function sentenceParts(value: string): string[] {
  return value.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
}

function unsupportedSnapshotGroundingIssues(content: SnapshotNarrativeContent, input: SnapshotNarrativeValidationInput): string[] {
  const parts = [content.headline, content.executiveDiagnosis, content.strength, ...content.prioritySignals, content.managementImplication];
  const text = parts.join('\n');
  const issues: string[] = [];
  if (text.includes('\u2014')) issues.push('snapshot_em_dash');
  if (!CALIBRATED_SELF_ASSESSMENT_LANGUAGE.test([content.executiveDiagnosis, content.strength, content.managementImplication].join('\n'))) {
    issues.push('snapshot_uncalibrated_interpretation');
  }
  if (UNSUPPORTED_CONTROL_ABSOLUTE.test(text)) issues.push('snapshot_unsupported_control_assertion');
  if (UNSUPPORTED_COVERAGE_CLAIM.test(text)) issues.push('snapshot_unsupported_coverage_claim');
  // Domain labels such as "Fraud Incident Response" are canonical facts supplied by the
  // deterministic result. Strip only those exact labels for this one check, then retain the
  // consequence guard for every remaining customer-facing phrase.
  if (UNSUPPORTED_CONSEQUENCE.test(withoutCanonicalDomainLabels(text, input))) {
    issues.push('snapshot_unsupported_consequence_claim');
  }
  if (UNSUPPORTED_ASSURANCE_REQUIREMENT.test(text)) issues.push('snapshot_unsupported_assurance_requirement');

  const domainNames = canonicalDomainNames(input);
  for (const sentence of sentenceParts(text)) {
    if (/\b\d+(?:\.\d+)?\s+(?:critical(?:[- ]control)?|major)\s+gaps?\b/i.test(sentence)
      && domainNames.some((domain) => sentence.toLocaleLowerCase().includes(domain.toLocaleLowerCase()))) {
      issues.push('snapshot_domain_gap_count_attribution');
      break;
    }
  }
  return [...new Set(issues)];
}

export function classifySnapshotNarrativeFailure(input: {
  issues?: readonly string[];
  content?: unknown;
  validationInput?: SnapshotNarrativeValidationInput;
  error?: unknown;
}): SnapshotNarrativeFailureClass {
  if (input.content && input.validationInput) {
    const parsed = snapshotNarrativeContentSchema.safeParse(input.content);
    if (parsed.success && isCanonicalConsequenceFalsePositive(parsed.data, input.validationInput)) {
      return 'VALIDATOR_FALSE_POSITIVE / CANONICAL_FACT';
    }
  }
  if (input.error) return 'TECHNICAL_PROVIDER_FAILURE';
  const issues = [...(input.issues ?? [])];
  if (issues.some((issue) => HARD_UNSUPPORTED_SNAPSHOT_ISSUES.has(issue))) return 'HARD_UNSUPPORTED_AI_CLAIM';
  if (issues.some((issue) => REPAIRABLE_SNAPSHOT_ISSUES.has(issue))) return 'REPAIRABLE_AI_SEMANTIC_FAILURE';
  return 'DETERMINISTIC/FALLBACK VALIDATION DEFECT';
}

function repairFieldsForIssues(issues: readonly string[]): SnapshotNarrativeAiField[] {
  const fields = new Set<SnapshotNarrativeAiField>();
  for (const issue of issues) {
    switch (issue) {
      case 'snapshot_diagnosis_too_long':
      case 'snapshot_unsupported_consequence_claim':
      case 'snapshot_unsupported_control_assertion':
      case 'snapshot_unsupported_coverage_claim':
      case 'snapshot_unsupported_assurance_requirement':
      case 'snapshot_domain_gap_count_attribution':
        fields.add('executiveDiagnosis');
        break;
      case 'assurance_claim':
        fields.add('executiveDiagnosis');
        fields.add('strength');
        fields.add('managementImplication');
        break;
      default:
        for (const field of AI_FIELDS) fields.add(field);
    }
  }
  return AI_FIELDS.filter((field) => fields.has(field));
}

function repairRequestFor(
  content: SnapshotNarrativeContent | null,
  issues: readonly string[],
  validationInput: SnapshotNarrativeValidationInput
): SnapshotNarrativeRepairRequest | undefined {
  if (!content || issues.length === 0) return undefined;
  // This branch is defensive. The canonical-label fix should make the issue list empty, and a
  // recognised fact must never consume a second provider call merely to satisfy a regex.
  if (isCanonicalConsequenceFalsePositive(content, validationInput)) return undefined;
  if (issues.some((issue) => !REPAIRABLE_SNAPSHOT_ISSUES.has(issue))) return undefined;
  const fields = repairFieldsForIssues(issues);
  if (fields.length === 0) return undefined;
  return { validationCodes: [...new Set(issues)], fields };
}

type SnapshotGatewayFailureReason =
  | 'gateway_authentication_failed'
  | 'gateway_request_invalid'
  | 'gateway_provider_unavailable'
  | 'gateway_timeout'
  | 'snapshot_no_output_generated'
  | 'snapshot_provider_unavailable';

type SnapshotGatewayCredential = {
  token: string;
  authMethod: 'api-key' | 'oidc';
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveSnapshotGatewayCredential(gatewayAuth?: SnapshotGatewayAuth): SnapshotGatewayCredential | null {
  const requestOidcToken = nonEmpty(gatewayAuth?.requestOidcToken);
  if (requestOidcToken) return { token: requestOidcToken, authMethod: 'oidc' };

  const apiKey = nonEmpty(process.env.AI_GATEWAY_API_KEY) ?? nonEmpty(process.env.VERCEL_AI_GATEWAY_API_KEY);
  if (apiKey) return { token: apiKey, authMethod: 'api-key' };

  // Keep the environment token for local/build contexts. Deployed Vercel requests use the
  // request-scoped header above, so runtime authentication does not depend on this variable.
  const environmentOidcToken = nonEmpty(process.env.VERCEL_OIDC_TOKEN);
  if (environmentOidcToken) return { token: environmentOidcToken, authMethod: 'oidc' };

  return null;
}

function snapshotGatewayModel(model: string, credential: SnapshotGatewayCredential) {
  const headers = credential.authMethod === 'oidc'
    ? { 'ai-gateway-auth-method': 'oidc' }
    : undefined;

  return createGateway({
    apiKey: credential.token,
    ...(headers ? { headers } : {})
  })(model);
}

export function snapshotGatewayFailureReason(error: unknown): SnapshotGatewayFailureReason {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const name = typeof record.name === 'string' ? record.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const status = typeof record.statusCode === 'number' ? record.statusCode : null;
  const detail = `${name} ${message}`.toLowerCase();

  if (NoOutputGeneratedError.isInstance(error)) return 'snapshot_no_output_generated';
  if (status === 401 || status === 403 || /authentication|invalid (?:api key|oidc)|unauthori[sz]ed/.test(detail)) {
    return 'gateway_authentication_failed';
  }
  if (status === 400 || status === 404 || /invalid request|malformed|model not found|unsupported model/.test(detail)) {
    return 'gateway_request_invalid';
  }
  if (name === 'GatewayTimeoutError' || status === 408 || status === 504 || /timeout|timed out|aborted/.test(detail)) {
    return 'gateway_timeout';
  }
  if (status === 429 || (status !== null && status >= 500) || /provider unavailable|upstream|capacity|rate limit/.test(detail)) {
    return 'gateway_provider_unavailable';
  }
  return 'snapshot_provider_unavailable';
}

export function buildSnapshotNarrativeInput(snapshot: FreeSnapshot, insights: CommercialSnapshotInsights): SnapshotNarrativeInput {
  const brief = buildSnapshotNarrativeBrief(snapshot, insights);
  return {
    ...brief,
    resultStatus: snapshot.resultStatus ?? null,
    overallScore: snapshot.overallScore,
    coveragePct: snapshot.coveragePct,
    nARatePct: snapshot.nARatePct,
    criticalGapCount: snapshot.criticalGapCount,
    majorGapCount: snapshot.majorGapCount,
  };
}

function publicResultStatus(snapshot: FreeSnapshot): string | null {
  if (!snapshot.resultStatus) return null;
  return snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY'
    ? 'insufficient visibility for a reliable readiness interpretation'
    : 'available for interpretation';
}

export function buildSnapshotNarrativeBrief(snapshot: FreeSnapshot, insights: CommercialSnapshotInsights): SnapshotNarrativeBrief {
  return {
    organisationName: snapshot.organisationName || null,
    maturity: snapshot.finalMaturity,
    resultStatus: publicResultStatus(snapshot),
    strongestAreas: insights.strengths.slice(0, 2).map((area) => area.domainName),
    attentionAreas: insights.priorityAreas.slice(0, 3).map((area) => area.domainName),
    nextStepDirection: insights.leadershipPriority,
    assuranceBoundary: 'This is an interpretation of the organisation’s recorded self-assessment. It does not establish operating effectiveness or independently validate evidence.'
  };
}

function normaliseSnapshotEmDash(value: string, field: 'headline' | 'prose'): string {
  if (!value.includes('\u2014')) return value;
  if (field === 'headline') return value.replace(/\s*\u2014\s*/g, ': ');
  return value
    .replace(/\s+\u2014\s+(?=[A-Z])/g, '. ')
    .replace(/\s*\u2014\s*/g, ', ');
}

/** Normalises a valid AI object before the customer-content guard runs. */
export function normaliseSnapshotNarrativeContent(value: unknown): SnapshotNarrativeContent | null {
  const parsed = snapshotNarrativeContentSchema.safeParse(value);
  if (!parsed.success) return null;
  const normalised = {
    ...parsed.data,
    headline: normaliseSnapshotEmDash(parsed.data.headline, 'headline'),
    executiveDiagnosis: normaliseSnapshotEmDash(parsed.data.executiveDiagnosis, 'prose'),
    strength: normaliseSnapshotEmDash(parsed.data.strength, 'prose'),
    prioritySignals: parsed.data.prioritySignals.map((signal) => normaliseSnapshotEmDash(signal, 'prose')),
    managementImplication: normaliseSnapshotEmDash(parsed.data.managementImplication, 'prose')
  };
  const final = snapshotNarrativeContentSchema.safeParse(normalised);
  return final.success ? final.data : null;
}

function deterministicPrioritySignalsFor(brief: SnapshotNarrativeBrief): [string, string] {
  return buildDeterministicSnapshotPrioritySignals(brief.attentionAreas, brief.nextStepDirection);
}

function canonicaliseSnapshotNarrativeContent(value: unknown, brief: SnapshotNarrativeBrief): SnapshotNarrativeContent | null {
  const parsed = snapshotNarrativeContentSchema.safeParse(value);
  if (!parsed.success) return null;
  return normaliseSnapshotNarrativeContent({
    ...parsed.data,
    prioritySignals: deterministicPrioritySignalsFor(brief)
  });
}

function canonicaliseSnapshotAiNarrative(value: unknown, brief: SnapshotNarrativeBrief): SnapshotNarrativeContent | null {
  const parsed = snapshotAiNarrativeContentSchema.safeParse(value);
  if (!parsed.success) return null;
  return normaliseSnapshotNarrativeContent({
    ...parsed.data,
    prioritySignals: deterministicPrioritySignalsFor(brief)
  });
}

export function validateSnapshotNarrative(
  value: unknown,
  input: SnapshotNarrativeValidationInput,
  options: SnapshotNarrativeValidationOptions = {}
): string[] {
  const parsed = snapshotNarrativeContentSchema.safeParse(value);
  if (!parsed.success) return ['snapshot_narrative_schema_invalid'];

  const content = parsed.data;
  const text = [content.headline, content.executiveDiagnosis, content.strength, ...content.prioritySignals, content.managementImplication].join('\n');
  const issues: string[] = [];
  if (wordCount(text) > SNAPSHOT_NARRATIVE_MAX_WORDS) issues.push('snapshot_narrative_too_long');
  if (sentenceCount(content.executiveDiagnosis) > 2) issues.push('snapshot_diagnosis_too_long');
  if (forbiddenSnapshotDetail(text)) issues.push('paid_tier_detail_leakage');
  if (/\b(?:personalised interpretation|interpretation)\s+(?:is\s+)?(?:temporarily\s+)?unavailable\b/i.test(text)) issues.push('snapshot_narrative_unavailable_message');
  if (/\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+)\b/i.test(text)) issues.push('raw_internal_id');
  if (/\b(?:control_failure|control_gap|maturity_constraint|assurance_priority|cross_domain_dependency)\b/i.test(text)) issues.push('raw_internal_enum');
  for (const part of [content.headline, content.executiveDiagnosis, content.strength, ...content.prioritySignals, content.managementImplication]) {
    if (classifyAssuranceLanguage(part)?.category === 'prohibited_assurance') issues.push('assurance_claim');
  }
  const allowedNumbers = numbers(JSON.stringify(input));
  for (const token of numbers(text)) if (!allowedNumbers.has(token)) issues.push('invented_number');
  if (options.mode === 'ai' && UNSUPPORTED_PROCEDURAL_METRIC_DISCUSSION.test(text)) {
    issues.push('snapshot_procedural_metric_leakage');
  }
  issues.push(...unsupportedSnapshotGroundingIssues(content, input));
  return [...new Set(issues)];
}

export function buildDeterministicSnapshotNarrative(input: {
  snapshot: FreeSnapshot;
  insights: CommercialSnapshotInsights;
  aiCallCount?: number;
  attemptedModels?: string[];
  fallbackReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  repairRequest?: SnapshotNarrativeRepairRequest;
}): SnapshotNarrative {
  const validationInput = buildSnapshotNarrativeInput(input.snapshot, input.insights);
  const candidate = normaliseSnapshotNarrativeContent(buildDeterministicSnapshotNarrativeContent(input));
  const candidateIssues = candidate
    ? validateSnapshotNarrative(candidate, validationInput, { mode: 'deterministic' })
    : ['snapshot_narrative_schema_invalid'];
  const minimal = buildMinimalSafeSnapshotNarrativeContent();
  const minimalIssues = validateSnapshotNarrative(minimal, validationInput, { mode: 'deterministic' });
  const content = candidate && candidateIssues.length === 0 ? candidate : minimal;
  const fallbackDiagnostics = candidateIssues.length > 0
    ? `deterministic_fallback_validation_defect:${candidateIssues.join(',')}`
    : minimalIssues.length > 0
      ? `deterministic_fallback_validation_defect:${minimalIssues.join(',')}`
      : undefined;

  return {
    ...content,
    mode: 'deterministic',
    model: 'deterministic',
    promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION,
    aiCallCount: input.aiCallCount ?? 0,
    attemptedModels: input.attemptedModels,
    fallbackReason: [input.fallbackReason, fallbackDiagnostics].filter(Boolean).join(',') || undefined,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
    providerCostMicros: input.providerCostMicros,
    repairRequest: input.repairRequest
  };
}

function cacheKeyForSnapshot(snapshot: FreeSnapshot): SnapshotNarrativeCacheKey {
  if (!snapshot.assessmentId || !snapshot.scoreRunId || !snapshot.methodologyVersionId) {
    throw new Error('Snapshot narrative cache requires assessment, score-run and methodology identity.');
  }
  return {
    assessmentId: snapshot.assessmentId,
    scoreRunId: snapshot.scoreRunId,
    methodologyVersion: snapshot.methodologyVersionId,
    promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION
  };
}

function contentFromNarrative(narrative: SnapshotNarrative): SnapshotNarrativeContent {
  return {
    headline: narrative.headline,
    executiveDiagnosis: narrative.executiveDiagnosis,
    strength: narrative.strength,
    prioritySignals: narrative.prioritySignals,
    managementImplication: narrative.managementImplication
  };
}

function narrativeFromCache(key: SnapshotNarrativeCacheKey, cached: SnapshotNarrativeCacheRecord, content: SnapshotNarrativeContent): SnapshotNarrative {
  return {
    ...content,
    mode: cached.status === 'available' ? 'ai' : 'deterministic',
    model: cached.model,
    promptVersion: key.promptVersion,
    aiCallCount: cached.aiCallCount,
    inputTokens: cached.inputTokens,
    outputTokens: cached.outputTokens,
    totalTokens: cached.totalTokens,
    providerCostMicros: cached.providerCostMicros,
    fallbackReason: cached.fallbackReason ?? undefined
  };
}

function mergeAttemptedModels(...values: Array<readonly string[] | undefined>): string[] | undefined {
  const models = [...new Set(values.flatMap((value) => value ?? []).filter((value) => typeof value === 'string' && value.trim()))];
  return models.length > 0 ? models : undefined;
}

function sumOptional(...values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) : undefined;
}

type SnapshotNarrativeGeneratorInput = {
  snapshot: FreeSnapshot;
  insights: CommercialSnapshotInsights;
  gatewayAuth?: SnapshotGatewayAuth;
  repair?: SnapshotNarrativeRepairRequest;
};

type SnapshotNarrativeGenerator = (value: SnapshotNarrativeGeneratorInput) => Promise<SnapshotNarrative>;

export async function buildCachedSnapshotNarrative(input: {
  snapshot: FreeSnapshot;
  insights: CommercialSnapshotInsights;
  cache: SnapshotNarrativeCache;
  gatewayAuth?: SnapshotGatewayAuth;
  generator?: SnapshotNarrativeGenerator;
}): Promise<SnapshotNarrative> {
  const narrativeInput = buildSnapshotNarrativeInput(input.snapshot, input.insights);
  const narrativeBrief = buildSnapshotNarrativeBrief(input.snapshot, input.insights);
  let key: SnapshotNarrativeCacheKey;
  try {
    key = cacheKeyForSnapshot(input.snapshot);
  } catch {
    return buildDeterministicSnapshotNarrative({
      snapshot: input.snapshot,
      insights: input.insights,
      fallbackReason: 'deterministic_fallback_validation_defect'
    });
  }

  let cached: SnapshotNarrativeCacheRecord | null = null;
  try {
    cached = await input.cache.read(key);
  } catch {
    // A cache outage must not make an otherwise valid Snapshot inaccessible. Continue with the
    // bounded generation/fallback path and avoid exposing the storage error to the customer.
  }
  if (cached) {
    try {
      const content = canonicaliseSnapshotNarrativeContent(cached.narrativeJson, narrativeBrief);
      const validationInput = cached.status === 'available' ? narrativeBrief : narrativeInput;
      if (content
        && (cached.status === 'available' || cached.status === 'fallback')
        && typeof cached.model === 'string'
        && cached.model.trim().length > 0
        && validAiCallCount(cached.aiCallCount)
        && validateSnapshotNarrative(content, validationInput, { mode: cached.status === 'available' ? 'ai' : 'deterministic' }).length === 0) {
        return narrativeFromCache(key, cached, content);
      }
    } catch {
      // Treat malformed historical cache data as a miss. The final validation below still
      // guarantees that only safe content is returned.
    }
  }

  const generator = input.generator ?? buildSnapshotNarrative;
  let generated: SnapshotNarrative;
  try {
    generated = await generator({
      snapshot: input.snapshot,
      insights: input.insights,
      gatewayAuth: input.gatewayAuth
    });
  } catch {
    generated = buildDeterministicSnapshotNarrative({
      snapshot: input.snapshot,
      insights: input.insights,
      fallbackReason: 'TECHNICAL_PROVIDER_FAILURE'
    });
  }

  const firstCallCount = validAiCallCount(generated.aiCallCount) ? generated.aiCallCount : 0;
  let finalNarrative = generated;
  let content = canonicaliseSnapshotNarrativeContent(contentFromNarrative(generated), narrativeBrief);
  const validationInput = generated.mode === 'ai' ? narrativeBrief : narrativeInput;
  let validationIssues = content
    ? validateSnapshotNarrative(content, validationInput, { mode: generated.mode })
    : ['snapshot_narrative_schema_invalid'];
  let repairRequest = generated.repairRequest
    ?? repairRequestFor(content, validationIssues, validationInput);

  if (repairRequest && firstCallCount === 1) {
    let repaired: SnapshotNarrative;
    try {
      repaired = await generator({
        snapshot: input.snapshot,
        insights: input.insights,
        gatewayAuth: input.gatewayAuth,
        repair: repairRequest
      });
    } catch {
      repaired = buildDeterministicSnapshotNarrative({
        snapshot: input.snapshot,
        insights: input.insights,
        aiCallCount: 2,
        attemptedModels: mergeAttemptedModels(generated.attemptedModels),
        fallbackReason: 'TECHNICAL_PROVIDER_FAILURE'
      });
    }

    const repairedContent = canonicaliseSnapshotNarrativeContent(contentFromNarrative(repaired), narrativeBrief);
    const repairedInput = repaired.mode === 'ai' ? narrativeBrief : narrativeInput;
    const repairedIssues = repairedContent
      ? validateSnapshotNarrative(repairedContent, repairedInput, { mode: repaired.mode })
      : ['snapshot_narrative_schema_invalid'];
    const repairedIsSafeAi = repaired.mode === 'ai' && Boolean(repairedContent) && repairedIssues.length === 0;

    if (repairedIsSafeAi) {
      finalNarrative = {
        ...repaired,
        aiCallCount: 2,
        attemptedModels: mergeAttemptedModels(generated.attemptedModels, repaired.attemptedModels),
        inputTokens: sumOptional(generated.inputTokens, repaired.inputTokens),
        outputTokens: sumOptional(generated.outputTokens, repaired.outputTokens),
        totalTokens: sumOptional(generated.totalTokens, repaired.totalTokens),
        providerCostMicros: sumOptional(generated.providerCostMicros, repaired.providerCostMicros),
        repairRequest: undefined
      };
      content = repairedContent;
      validationIssues = [];
    } else {
      finalNarrative = buildDeterministicSnapshotNarrative({
        snapshot: input.snapshot,
        insights: input.insights,
        aiCallCount: 2,
        attemptedModels: mergeAttemptedModels(generated.attemptedModels, repaired.attemptedModels),
        inputTokens: sumOptional(generated.inputTokens, repaired.inputTokens),
        outputTokens: sumOptional(generated.outputTokens, repaired.outputTokens),
        totalTokens: sumOptional(generated.totalTokens, repaired.totalTokens),
        providerCostMicros: sumOptional(generated.providerCostMicros, repaired.providerCostMicros),
        fallbackReason: `repair_failed:${repairedIssues.join(',') || 'snapshot_narrative_schema_invalid'}`
      });
      content = contentFromNarrative(finalNarrative);
      validationIssues = [];
    }
    repairRequest = undefined;
  } else if (firstCallCount !== generated.aiCallCount || !content || validationIssues.length > 0) {
    finalNarrative = buildDeterministicSnapshotNarrative({
      snapshot: input.snapshot,
      insights: input.insights,
      aiCallCount: validAiCallCount(finalNarrative.aiCallCount) ? finalNarrative.aiCallCount : firstCallCount,
      attemptedModels: generated.attemptedModels,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      totalTokens: generated.totalTokens,
      providerCostMicros: generated.providerCostMicros,
      fallbackReason: generated.fallbackReason ?? `deterministic_fallback_validation_defect:${validationIssues.join(',') || 'invalid_call_count'}`
    });
    content = contentFromNarrative(finalNarrative);
    validationIssues = [];
    repairRequest = undefined;
  }

  // Final non-AI validation is always applied immediately before persistence. If a future change
  // makes the richer deterministic copy invalid, buildDeterministicSnapshotNarrative has already
  // reduced it to the minimal safe presentation rather than throwing through the page.
  if (!content || validateSnapshotNarrative(content, finalNarrative.mode === 'ai' ? narrativeBrief : narrativeInput, { mode: finalNarrative.mode }).length > 0) {
    finalNarrative = buildDeterministicSnapshotNarrative({
      snapshot: input.snapshot,
      insights: input.insights,
      aiCallCount: validAiCallCount(finalNarrative.aiCallCount) ? finalNarrative.aiCallCount : firstCallCount,
      attemptedModels: finalNarrative.attemptedModels,
      fallbackReason: 'deterministic_fallback_validation_defect'
    });
    content = contentFromNarrative(finalNarrative);
  }

  const record: SnapshotNarrativeCacheRecord = {
    status: finalNarrative.mode === 'ai' ? 'available' : 'fallback',
    narrativeJson: content,
    model: finalNarrative.model,
    aiCallCount: validAiCallCount(finalNarrative.aiCallCount) ? finalNarrative.aiCallCount : 0,
    inputTokens: finalNarrative.inputTokens,
    outputTokens: finalNarrative.outputTokens,
    totalTokens: finalNarrative.totalTokens,
    providerCostMicros: finalNarrative.providerCostMicros,
    fallbackReason: finalNarrative.fallbackReason ?? null
  };
  try {
    await input.cache.write(key, record);
  } catch {
    // Cache persistence is an optimisation. Return the already validated result if storage is
    // temporarily unavailable, without surfacing an implementation exception to the customer.
  }
  return { ...finalNarrative, ...content, repairRequest };
}

export async function buildSnapshotNarrative(input: SnapshotNarrativeGeneratorInput): Promise<SnapshotNarrative> {
  const policy = selectSnapshotModel();
  const narrativeBrief = buildSnapshotNarrativeBrief(input.snapshot, input.insights);
  const gatewayCredential = resolveSnapshotGatewayCredential(input.gatewayAuth);
  if (!gatewayCredential) {
    return buildDeterministicSnapshotNarrative({
      ...input,
      aiCallCount: input.repair ? 1 : 0,
      fallbackReason: 'snapshot_ai_unavailable',
      repairRequest: undefined
    });
  }

  // The cache schema permits one initial attempt and one targeted semantic repair. Technical
  // failures never consume the repair budget and fall back deterministically.
  const model = policy.primaryModel;
  const provider = providerFromModel(model);
  const attemptedCallCount = input.repair ? 2 : 1;
  try {
    const strengthInstruction = narrativeBrief.strongestAreas.length > 0
      ? `Interpret only the supplied strongest areas: ${narrativeBrief.strongestAreas.join(', ')}.`
      : 'Do not manufacture a strength from coverage, completion, visibility, absence of unknowns or any other procedural fact. The strength field should say: "The recorded responses do not yet support identifying a dependable organisational strength."';
    const repairInstruction = input.repair
      ? `This is the single targeted repair attempt. Repair only these fields: ${input.repair.fields.join(', ')}. The rejected validation codes are: ${input.repair.validationCodes.join(', ')}. Use the exact same narrative brief and add no facts. Preserve the bounded four-field response shape and return only the requested object.`
      : '';
    const response = await generateText({
      model: snapshotGatewayModel(model, gatewayCredential),
      system: 'You are the constrained MK Fraud Readiness free Snapshot editor. This is a self-assessment interpretation, not an independent finding or assurance opinion. Use only the supplied narrative brief. Return exactly four AI-authored fields: headline, executiveDiagnosis, strength, and managementImplication. Priority signals are constructed deterministically after generation from the supplied attention areas and are not model-authored. Keep the headline short and organisation-specific; keep the diagnosis to at most two sentences. Use calibrated language such as "the recorded responses indicate", "the self-assessment suggests", "the result points to" and "leadership attention should focus on". Do not state that controls are absent, failing, ineffective or non-functioning. Do not invent consequences such as losses, compromise, incidents or realised harm. Do not require or imply assurance, independent validation or independent review. Do not mention assessment coverage, control visibility, unknown-share percentages, completeness, blind spots or gap counts in the AI-authored fields. These are presented separately by the deterministic result interface. Do not include internal IDs, paid-report depth, roadmaps, blueprints, scenarios, registers, target-state controls, decision libraries, provider/model details or technical fallback language. Do not use em dashes. Use normal sentence punctuation instead. Use only supplied facts and return only the requested object.',
      prompt: 'Use this narrative brief and return only the four AI-authored fields. Priority signals will be added deterministically after generation from the supplied attention areas. Keep the total response within ' + SNAPSHOT_NARRATIVE_MAX_WORDS + ' words. ' + strengthInstruction + ' Do not mention assessment coverage, control visibility, unknown-share percentages, completeness, blind spots or gap counts in the AI-authored fields. These are presented separately by the deterministic result interface. Do not use em dashes. Use normal sentence punctuation instead. ' + repairInstruction + '\n\n' + JSON.stringify(narrativeBrief),
      output: Output.object({ schema: snapshotAiNarrativeContentSchema, name: 'mk_fraud_readiness_snapshot_ai_narrative' }),
      maxOutputTokens: 2048,
      maxRetries: 0,
      providerOptions: {
        openai: { reasoningEffort: 'minimal' },
        gateway: { only: [provider], tags: ['feature:mk-fraud-readiness-snapshot', 'product:free-snapshot'] }
      },
      abortSignal: AbortSignal.timeout(120_000)
    });
    const parsed = canonicaliseSnapshotAiNarrative(response.output, narrativeBrief);
    if (!parsed) {
      return buildDeterministicSnapshotNarrative({
        ...input,
        aiCallCount: attemptedCallCount,
        attemptedModels: [model],
        fallbackReason: 'snapshot_schema_invalid',
        repairRequest: undefined
      });
    }
    const issues = validateSnapshotNarrative(parsed, narrativeBrief, { mode: 'ai' });
    if (issues.length > 0) {
      return buildDeterministicSnapshotNarrative({
        ...input,
        aiCallCount: attemptedCallCount,
        attemptedModels: [model],
        fallbackReason: issues.join(','),
        repairRequest: input.repair ? undefined : repairRequestFor(parsed, issues, narrativeBrief)
      });
    }
    const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
    const usage = response.usage;
    return {
      ...parsed,
      mode: 'ai',
      model,
      promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION,
      aiCallCount: attemptedCallCount,
      attemptedModels: [model],
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      providerCostMicros: identity.gatewayCostMicros
    };
  } catch (error) {
    return buildDeterministicSnapshotNarrative({
      ...input,
      aiCallCount: attemptedCallCount,
      attemptedModels: [model],
      fallbackReason: snapshotGatewayFailureReason(error)
    });
  }
}

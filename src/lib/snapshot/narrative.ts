import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { FreeSnapshot } from './free-snapshot';
import type { CommercialSnapshotInsights } from './commercial-insights';
import { classifyAssuranceLanguage } from '../reports/narrative/validation';
import { parseAiGatewayExecutionIdentity } from '../reports/automation/ai-gateway-identity';
import { selectSnapshotModel } from '../reports/ai-model-policy';
import { createSupabaseServiceClient } from '../supabase/server';

export const SNAPSHOT_NARRATIVE_PROMPT_VERSION = 'mk-snapshot-mini-advisory-v2';
export const SNAPSHOT_NARRATIVE_MAX_WORDS = 180;

const snapshotNarrativeSchema = z.object({
  headline: z.string().min(1).max(120),
  diagnosis: z.string().min(1).max(420),
  strongestArea: z.object({ label: z.string().min(1).max(90), interpretation: z.string().min(1).max(220) }).strict(),
  prioritySignals: z.array(z.object({ label: z.string().min(1).max(90), interpretation: z.string().min(1).max(220) }).strict()).min(1).max(2),
  managementImplication: z.string().min(1).max(260)
}).strict();

export type SnapshotNarrativeInput = {
  organisationName: string | null;
  overallScore: number | null;
  maturity: string | null;
  exposureBand: string | null;
  uncertaintyPct: number;
  domainResults: Array<{ name: string; readiness: string; coveragePct: number }>;
  strongestAreas: string[];
  attentionAreas: string[];
  nextStepDirection: string;
  assuranceBoundary: string;
};

export type SnapshotNarrative = {
  /** Compatibility projections retained for existing report/event consumers. */
  interpretation: string;
  nextStep: string;
  headline: string;
  diagnosis: string;
  strongestArea: { label: string; interpretation: string };
  prioritySignals: Array<{ label: string; interpretation: string }>;
  managementImplication: string;
  mode: 'ai' | 'deterministic' | 'unavailable';
  model: string;
  promptVersion: string;
  aiCallCount: number;
  attemptedModels?: string[];
  fallbackReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
};

function providerFromModel(model: string): string { return model.split('/')[0]?.trim() || 'vercel-ai-gateway'; }
function wordCount(value: string): number { return (value.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) ?? []).length; }
function numbers(value: string): Set<string> { return new Set((value.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []).map((item) => item.replace('%', ''))); }
function forbiddenSnapshotDetail(value: string): boolean {
  return /\b(?:30\/60\/90|30-,? ?60-,? ?and 90-day|roadmap|blueprint|risk register|scenario(?:s)?|leadership agenda|evidence checklist|control action(?:s)?|comprehensive|essential report|paid report|detailed report|pricing?|invoice|product entitlement|order reference)\b/i.test(value)
    || /R\s?\d[\d,]*/i.test(value);
}

export function buildSnapshotNarrativeInput(snapshot: FreeSnapshot, insights: CommercialSnapshotInsights): SnapshotNarrativeInput {
  return {
    organisationName: snapshot.organisationName || null,
    overallScore: snapshot.overallScore,
    maturity: snapshot.finalMaturity,
    exposureBand: snapshot.exposureBand,
    uncertaintyPct: Math.round(snapshot.adaptiveMetrics?.unknownSharePct ?? snapshot.nARatePct),
    domainResults: snapshot.domains.slice(0, 10).map((domain) => ({
      name: domain.domainName,
      readiness: domain.rawScore === null ? 'Not visible' : domain.rawScore < 40 ? 'Needs attention' : domain.rawScore < 60 ? 'Developing' : domain.rawScore < 80 ? 'Structured' : 'Stronger foundation',
      coveragePct: Math.round(domain.coveragePct)
    })),
    strongestAreas: insights.strengths.slice(0, 2).map((area) => area.domainName),
    attentionAreas: insights.priorityAreas.slice(0, 3).map((area) => area.domainName),
    nextStepDirection: insights.leadershipPriority,
    assuranceBoundary: 'This is an interpretation of the organisation’s recorded self-assessment. It does not establish operating effectiveness or independently validate evidence.'
  };
}

function narrativeParts(value: Partial<SnapshotNarrative> & { interpretation?: string; nextStep?: string }) {
  return [
    value.headline,
    value.diagnosis,
    value.strongestArea?.label,
    value.strongestArea?.interpretation,
    ...(value.prioritySignals ?? []).flatMap((signal) => [signal.label, signal.interpretation]),
    value.managementImplication,
    value.interpretation,
    value.nextStep
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);
}

export function validateSnapshotNarrative(value: { interpretation?: string; nextStep?: string; headline?: string; diagnosis?: string; strongestArea?: { label: string; interpretation: string }; prioritySignals?: Array<{ label: string; interpretation: string }>; managementImplication?: string }, input: SnapshotNarrativeInput): string[] {
  const text = narrativeParts(value).join('\n');
  const issues: string[] = [];
  if (wordCount(text) > SNAPSHOT_NARRATIVE_MAX_WORDS) issues.push('snapshot_narrative_too_long');
  if (forbiddenSnapshotDetail(text)) issues.push('paid_tier_detail_leakage');
  if (/\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+)\b/i.test(text)) issues.push('raw_internal_id');
  if (/\b(?:control_failure|control_gap|maturity_constraint|assurance_priority|cross_domain_dependency)\b/i.test(text)) issues.push('raw_internal_enum');
  for (const part of narrativeParts(value)) if (classifyAssuranceLanguage(part)?.category === 'prohibited_assurance') issues.push('assurance_claim');
  const allowedNumbers = numbers(JSON.stringify(input));
  for (const token of numbers(text)) if (!allowedNumbers.has(token)) issues.push('invented_number');
  return [...new Set(issues)];
}

function emptyStructuredNarrative() {
  return {
    headline: '',
    diagnosis: '',
    strongestArea: { label: '', interpretation: '' },
    prioritySignals: [],
    managementImplication: ''
  };
}

export function unavailableSnapshotNarrative(input: { aiCallCount?: number; attemptedModels?: string[]; fallbackReason?: string } = {}): SnapshotNarrative {
  return {
    interpretation: '',
    nextStep: '',
    ...emptyStructuredNarrative(),
    mode: 'unavailable',
    model: 'none',
    promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION,
    aiCallCount: input.aiCallCount ?? 0,
    attemptedModels: input.attemptedModels,
    fallbackReason: input.fallbackReason ?? 'snapshot_narrative_unavailable'
  };
}

function clip(value: string, maximumWords = 35) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= maximumWords ? value.trim() : `${words.slice(0, maximumWords).join(' ')}…`;
}

export function deterministicSnapshotNarrative(snapshot: FreeSnapshot, insights: CommercialSnapshotInsights, fallbackReason = 'snapshot_ai_unavailable'): SnapshotNarrative {
  const strongest = insights.strengths[0];
  const priorities = insights.priorityAreas.slice(0, 2);
  const strongestArea = strongest
    ? { label: strongest.domainName, interpretation: clip(strongest.finding, 28) }
    : { label: 'Recorded readiness position', interpretation: 'The submitted responses provide the current baseline for management review.' };
  const prioritySignals = priorities.length
    ? priorities.map((area) => ({ label: area.domainName, interpretation: clip(area.implication, 28) }))
    : [{ label: 'Management attention', interpretation: clip(insights.leadershipPriority, 28) }];
  const diagnosis = clip(insights.conciseInterpretation || insights.currentPosition, 42);
  const managementImplication = clip(insights.leadershipPriority, 36);
  return {
    interpretation: diagnosis,
    nextStep: managementImplication,
    headline: `${insights.scoreBand} fraud-readiness position`,
    diagnosis,
    strongestArea,
    prioritySignals,
    managementImplication,
    mode: 'deterministic',
    model: 'deterministic',
    promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION,
    aiCallCount: 0,
    fallbackReason
  };
}

function toSnapshotNarrative(parsed: z.infer<typeof snapshotNarrativeSchema>, metadata: Pick<SnapshotNarrative, 'mode' | 'model' | 'promptVersion' | 'aiCallCount' | 'attemptedModels' | 'inputTokens' | 'outputTokens' | 'totalTokens' | 'providerCostMicros'>): SnapshotNarrative {
  return {
    ...parsed,
    interpretation: parsed.diagnosis,
    nextStep: parsed.managementImplication,
    ...metadata
  };
}

/** One Mini attempt only; technical exhaustion falls back to the deterministic cached result. */
export async function buildSnapshotNarrative(input: { snapshot: FreeSnapshot; insights: CommercialSnapshotInsights }): Promise<SnapshotNarrative> {
  const policy = selectSnapshotModel();
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_AI_GATEWAY_API_KEY) return unavailableSnapshotNarrative({ fallbackReason: 'snapshot_ai_unavailable' });
  const narrativeInput = buildSnapshotNarrativeInput(input.snapshot, input.insights);
  const model = policy.primaryModel;
  const provider = providerFromModel(model);
  try {
    const response = await generateText({
      model,
      system: 'You are the constrained MK Fraud Readiness free Snapshot editor. Deterministic facts are the sole authority. Return only the requested structured object. Write a short management headline, a diagnosis of no more than two sentences, one strongest area, no more than two priority risk/control signals, and one management implication. Do not calculate or create a score, maturity, finding, risk, scenario, control, recommendation, organisation fact or number. Use only supplied facts. Do not include internal IDs, methodology enums, paid-report detail, roadmaps, blueprints, scenarios, prices or product claims. Do not claim that MK, the assessment or the report verified, validated, tested, confirmed or assured operating effectiveness or evidence.',
      prompt: `Use this deterministic Snapshot input and return only the structured object. Keep the total response within ${SNAPSHOT_NARRATIVE_MAX_WORDS} words.\n\n${JSON.stringify(narrativeInput)}`,
      output: Output.object({ schema: snapshotNarrativeSchema, name: 'mk_fraud_readiness_snapshot_narrative' }),
      maxOutputTokens: 700,
      maxRetries: 0,
      providerOptions: { gateway: { only: [provider], tags: ['feature:mk-fraud-readiness-snapshot', 'product:free-snapshot'] } },
      abortSignal: AbortSignal.timeout(120_000)
    });
    const parsed = snapshotNarrativeSchema.safeParse(response.output);
    if (!parsed.success) return unavailableSnapshotNarrative({ aiCallCount: 1, attemptedModels: [model], fallbackReason: 'snapshot_invalid_schema' });
    const issues = validateSnapshotNarrative(parsed.data, narrativeInput);
    if (issues.length > 0) return unavailableSnapshotNarrative({ aiCallCount: 1, attemptedModels: [model], fallbackReason: issues.join(',') });
    const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
    const usage = response.usage;
    return toSnapshotNarrative(parsed.data, {
      mode: 'ai',
      model,
      promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION,
      aiCallCount: 1,
      attemptedModels: [model],
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      providerCostMicros: identity.gatewayCostMicros
    });
  } catch {
    return unavailableSnapshotNarrative({ aiCallCount: 1, attemptedModels: [model], fallbackReason: 'snapshot_mini_unavailable' });
  }
}

function isMissingCacheTable(error: any) {
  return error?.code === '42P01' || /free_snapshot_narratives|does not exist/i.test(String(error?.message ?? ''));
}

function cacheClient() {
  return createSupabaseServiceClient() as any;
}

export async function loadCachedSnapshotNarrative(snapshot: FreeSnapshot): Promise<SnapshotNarrative | null> {
  try {
    const { data, error } = await cacheClient()
      .from('free_snapshot_narratives')
      .select('narrative_json,status,model,prompt_version,ai_call_count,input_tokens,output_tokens,total_tokens,provider_cost_micros,fallback_reason')
      .eq('assessment_id', snapshot.assessmentId)
      .eq('score_run_id', snapshot.scoreRunId)
      .eq('methodology_version', snapshot.methodologyVersion)
      .eq('prompt_version', SNAPSHOT_NARRATIVE_PROMPT_VERSION)
      .maybeSingle();
    if (error || !data || isMissingCacheTable(error)) return null;
    const value = data.narrative_json as Partial<SnapshotNarrative>;
    if (!value || typeof value !== 'object' || typeof value.headline !== 'string') return null;
    return {
      ...unavailableSnapshotNarrative(),
      ...value,
      mode: data.status === 'available' ? 'ai' : 'deterministic',
      model: data.model ?? value.model ?? 'deterministic',
      promptVersion: data.prompt_version ?? SNAPSHOT_NARRATIVE_PROMPT_VERSION,
      aiCallCount: Number(data.ai_call_count ?? value.aiCallCount ?? 0),
      inputTokens: data.input_tokens ?? value.inputTokens,
      outputTokens: data.output_tokens ?? value.outputTokens,
      totalTokens: data.total_tokens ?? value.totalTokens,
      providerCostMicros: data.provider_cost_micros ?? value.providerCostMicros,
      fallbackReason: data.fallback_reason ?? value.fallbackReason
    };
  } catch {
    return null;
  }
}

async function cacheSnapshotNarrative(snapshot: FreeSnapshot, narrative: SnapshotNarrative) {
  try {
    const { error } = await cacheClient().from('free_snapshot_narratives').upsert({
      assessment_id: snapshot.assessmentId,
      score_run_id: snapshot.scoreRunId,
      methodology_version: snapshot.methodologyVersion,
      prompt_version: SNAPSHOT_NARRATIVE_PROMPT_VERSION,
      status: narrative.mode === 'ai' ? 'available' : 'fallback',
      narrative_json: narrative,
      model: narrative.model,
      ai_call_count: narrative.aiCallCount,
      input_tokens: narrative.inputTokens ?? null,
      output_tokens: narrative.outputTokens ?? null,
      total_tokens: narrative.totalTokens ?? null,
      provider_cost_micros: narrative.providerCostMicros ?? null,
      fallback_reason: narrative.fallbackReason ?? null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'assessment_id,score_run_id,methodology_version,prompt_version' });
    if (error && !isMissingCacheTable(error)) console.error('snapshot_narrative_cache_write_failed', { code: error.code ?? null });
  } catch {
    // Narrative caching is enrichment; the deterministic persisted score remains authoritative.
  }
}

/** Loads once from cache or creates exactly one Mini/deterministic result for this score run. */
export async function getOrCreateSnapshotNarrative(input: { snapshot: FreeSnapshot; insights: CommercialSnapshotInsights }): Promise<SnapshotNarrative> {
  const cached = await loadCachedSnapshotNarrative(input.snapshot);
  if (cached) return cached;
  const generated = await buildSnapshotNarrative(input);
  const narrative = generated.mode === 'ai'
    ? generated
    : deterministicSnapshotNarrative(input.snapshot, input.insights, generated.fallbackReason);
  await cacheSnapshotNarrative(input.snapshot, narrative);
  return narrative;
}

export async function queueSnapshotNarrative(input: { snapshot: FreeSnapshot; insights: CommercialSnapshotInsights }) {
  await getOrCreateSnapshotNarrative(input);
}

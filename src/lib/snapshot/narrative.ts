import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { FreeSnapshot } from './free-snapshot';
import type { CommercialSnapshotInsights } from './commercial-insights';
import { classifyAssuranceLanguage } from '../reports/narrative/validation';
import { parseAiGatewayExecutionIdentity } from '../reports/automation/ai-gateway-identity';
import { selectSnapshotModel } from '../reports/ai-model-policy';

export const SNAPSHOT_NARRATIVE_PROMPT_VERSION = 'mk-snapshot-mini-advisory-v1';
export const SNAPSHOT_NARRATIVE_MAX_WORDS = 180;
const snapshotNarrativeSchema = z.object({ interpretation: z.string().min(1).max(700), nextStep: z.string().min(1).max(500) }).strict();

export type SnapshotNarrativeInput = {
  organisationName: string | null;
  overallScore: number | null;
  maturity: string | null;
  strongestAreas: string[];
  attentionAreas: string[];
  nextStepDirection: string;
  assuranceBoundary: string;
};

export type SnapshotNarrative = {
  interpretation: string;
  nextStep: string;
  mode: 'ai' | 'unavailable';
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
function forbiddenSnapshotDetail(value: string): boolean { return /\b(?:30\/60\/90|30-,? ?60-,? ?and 90-day|roadmap|blueprint|risk register|scenario(?:s)?|leadership agenda|evidence checklist|control action(?:s)?|comprehensive|essential report|paid report|detailed report)\b/i.test(value); }

export function buildSnapshotNarrativeInput(snapshot: FreeSnapshot, insights: CommercialSnapshotInsights): SnapshotNarrativeInput {
  return {
    organisationName: snapshot.organisationName || null,
    overallScore: snapshot.overallScore,
    maturity: snapshot.finalMaturity,
    strongestAreas: insights.strengths.slice(0, 2).map((area) => area.domainName),
    attentionAreas: insights.priorityAreas.slice(0, 3).map((area) => area.domainName),
    nextStepDirection: insights.leadershipPriority,
    assuranceBoundary: 'This is an interpretation of the organisation’s recorded self-assessment. It does not establish operating effectiveness or independently validate evidence.'
  };
}

export function validateSnapshotNarrative(value: { interpretation: string; nextStep: string }, input: SnapshotNarrativeInput): string[] {
  const text = value.interpretation + '\n' + value.nextStep;
  const issues: string[] = [];
  if (wordCount(text) > SNAPSHOT_NARRATIVE_MAX_WORDS) issues.push('snapshot_narrative_too_long');
  if (forbiddenSnapshotDetail(text)) issues.push('paid_tier_detail_leakage');
  if (/\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+)\b/i.test(text)) issues.push('raw_internal_id');
  if (/\b(?:control_failure|control_gap|maturity_constraint|assurance_priority|cross_domain_dependency)\b/i.test(text)) issues.push('raw_internal_enum');
  for (const part of [value.interpretation, value.nextStep]) if (classifyAssuranceLanguage(part)?.category === 'prohibited_assurance') issues.push('assurance_claim');
  const allowedNumbers = numbers(JSON.stringify(input));
  for (const token of numbers(text)) if (!allowedNumbers.has(token)) issues.push('invented_number');
  return [...new Set(issues)];
}

export function unavailableSnapshotNarrative(input: { aiCallCount?: number; attemptedModels?: string[]; fallbackReason?: string } = {}): SnapshotNarrative {
  return {
    interpretation: '',
    nextStep: '',
    mode: 'unavailable',
    model: 'none',
    promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION,
    aiCallCount: input.aiCallCount ?? 0,
    attemptedModels: input.attemptedModels,
    fallbackReason: input.fallbackReason ?? 'snapshot_narrative_unavailable'
  };
}

export async function buildSnapshotNarrative(input: { snapshot: FreeSnapshot; insights: CommercialSnapshotInsights }): Promise<SnapshotNarrative> {
  const policy = selectSnapshotModel();
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_AI_GATEWAY_API_KEY) return unavailableSnapshotNarrative({ fallbackReason: 'snapshot_ai_unavailable' });
  const narrativeInput = buildSnapshotNarrativeInput(input.snapshot, input.insights);
  const attemptedModels: string[] = [];
  for (const model of [policy.primaryModel, ...policy.fallbackModels]) {
    attemptedModels.push(model);
    const provider = providerFromModel(model);
    try {
      const response = await generateText({
        model,
        system: 'You are the constrained MK Fraud Readiness free Snapshot editor. Deterministic Snapshot facts are the sole authority. Write only a concise personalised interpretation and one high-level next step. Do not calculate or create a score, maturity, finding, risk, scenario, control, recommendation, organisation fact or number. Use only the supplied facts. Do not include internal IDs, methodology enums, paid-report detail, roadmaps, blueprints, scenarios or decision architecture. Do not claim that MK, the assessment or the report verified, validated, tested, confirmed or assured operating effectiveness or evidence. Return only the requested object.',
        prompt: 'Use this deterministic Snapshot input and return only the structured object. Keep the total response within ' + SNAPSHOT_NARRATIVE_MAX_WORDS + ' words. The organisation name, score and maturity are supplied facts; do not alter them.\n\n' + JSON.stringify(narrativeInput),
        output: Output.object({ schema: snapshotNarrativeSchema, name: 'mk_fraud_readiness_snapshot_narrative' }),
        maxOutputTokens: 500,
        maxRetries: 0,
        providerOptions: { gateway: { only: [provider], tags: ['feature:mk-fraud-readiness-snapshot', 'product:free-snapshot'] } },
        abortSignal: AbortSignal.timeout(120_000)
      });
      const parsed = snapshotNarrativeSchema.safeParse(response.output);
      if (!parsed.success) continue;
      const issues = validateSnapshotNarrative(parsed.data, narrativeInput);
      if (issues.length > 0) return unavailableSnapshotNarrative({ aiCallCount: attemptedModels.length, attemptedModels, fallbackReason: issues.join(',') });
      const identity = parseAiGatewayExecutionIdentity({ requestedProvider: provider, requestedModel: model, providerMetadata: response.providerMetadata, response: response.response });
      const usage = response.usage;
      return { ...parsed.data, mode: 'ai', model, promptVersion: SNAPSHOT_NARRATIVE_PROMPT_VERSION, aiCallCount: attemptedModels.length, attemptedModels, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, totalTokens: usage?.totalTokens, providerCostMicros: identity.gatewayCostMicros };
    } catch {
      // Technical failures only may advance to the next approved model. A structurally valid
      // candidate that fails narrative validation returns above and never quality-escalates.
    }
  }
  return unavailableSnapshotNarrative({ aiCallCount: attemptedModels.length, attemptedModels, fallbackReason: 'snapshot_all_approved_models_unavailable' });
}

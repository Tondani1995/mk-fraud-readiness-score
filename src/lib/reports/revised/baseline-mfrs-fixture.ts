import graphJson from '@/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json' with { type: 'json' };
import { resolveAdaptivePath, type AdaptiveControlResponses, type AdaptiveGraph } from '@/lib/adaptive/engine';
import { calculateAdaptiveReadinessScore } from '@/lib/scoring/adaptive-scoring';
import { officialResponseLabelsFixture } from '@/lib/reports/evidence-model/__fixtures__/official-response-labels';
import type { AssembledReportData, QuestionTraceRecord } from '@/lib/reports/types';

/**
 * TEST FIXTURE ONLY. The "before" side of the report comparison: what the existing MFRS assessment and the existing,
 * unchanged report engines produce for a fictional organisation. The organisation's answers to the 68 MFRS V1.2
 * questions are supplied by the caller (from the same fictional organisation definition as its staged assessment);
 * the score, domain results, traces and cap events are calculated here by the existing adaptive calculator, exactly as
 * the customer path would. Nothing is written anywhere, no order or payment exists, and no provider is called.
 */
export const MFRS_V12_CODE = 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION';
const GRAPH = graphJson as unknown as AdaptiveGraph & { domains: { domainCode: string; name: string; weightPct: number; sortOrder: number }[] };

export type BaselineQuestion = { questionCode: string; domainCode: string; prompt: string; isCritical: boolean; isHardGate: boolean };

export function mfrsBaselineQuestions(): BaselineQuestion[] {
  return (GRAPH.questions as any[]).map((q) => ({ questionCode: q.questionCode, domainCode: q.domainCode, prompt: q.prompt, isCritical: !!q.isCritical, isHardGate: !!q.isHardGate }));
}

export function buildMfrsBaselineFixture(input: {
  organisationName: string;
  assessmentReference: string;
  generatedAt: string;
  gatewayAnswers: Record<string, string>;
  /** The organisation's answer: a maturity level 0 to 5, or 'unknown'. */
  responseFor: (question: BaselineQuestion) => number | 'unknown';
}): AssembledReportData {
  const methodology = {
    domains: GRAPH.domains.map((domain) => ({
      id: `fixture-${domain.domainCode}`, domainCode: domain.domainCode, name: domain.name, weightPct: domain.weightPct, domainType: 'control' as const, isCore: Boolean((domain as any).isCore), sortOrder: domain.sortOrder,
      questions: (GRAPH.questions as any[]).filter((q) => q.domainCode === domain.domainCode).map((q, index) => ({
        id: q.questionId, questionCode: q.questionCode, domainCode: q.domainCode, domainName: domain.name, prompt: q.prompt, helpText: null,
        weight: q.weight, isCritical: q.isCritical, isHardGate: q.isHardGate, nAAllowed: false, nARuleKey: null, triggerKey: null, sortOrder: index
      }))
    })),
    responseScale: [],
    exposureFactors: []
  };
  const path = resolveAdaptivePath({ graph: GRAPH, gatewayAnswers: input.gatewayAnswers });
  const byId = new Map((GRAPH.questions as any[]).map((q) => [q.questionId, q]));
  const controlResponses: AdaptiveControlResponses = {};
  for (const node of path.activeNodes.filter((n) => n.kind !== 'gateway')) {
    const q = byId.get(node.kind === 'oversight' ? (node as any).replacementFor : node.nodeId);
    if (!q) continue;
    const value = input.responseFor({ questionCode: q.questionCode, domainCode: q.domainCode, prompt: q.prompt, isCritical: !!q.isCritical, isHardGate: !!q.isHardGate });
    controlResponses[node.nodeId] = value === 'unknown' ? { responseState: 'unknown', responseValue: null } : { responseState: 'maturity', responseValue: value };
  }
  const result = calculateAdaptiveReadinessScore({ graph: GRAPH, methodology: methodology as any, gatewayAnswers: input.gatewayAnswers, controlResponses });
  const domainName = new Map(GRAPH.domains.map((d) => [d.domainCode, d.name]));
  const questionTraces: QuestionTraceRecord[] = result.questionTraces.map((t) => {
    const q = (GRAPH.questions as any[]).find((x) => x.questionCode === t.questionCode);
    return {
      questionCode: t.questionCode, domainCode: q?.domainCode ?? '', domainName: domainName.get(q?.domainCode) ?? '', prompt: q?.prompt ?? t.questionCode,
      responseValue: t.responseValue, isCritical: !!q?.isCritical, isHardGate: !!q?.isHardGate, isCriticalGap: t.isCriticalGap, isMajorGap: t.isMajorGap,
      normalisedScore: t.normalisedScore, applicable: t.applicable, triggeredRules: t.triggeredRules
    };
  });
  const gaps = questionTraces.filter((t) => t.isCriticalGap || t.isMajorGap).map(({ normalisedScore: _n, applicable: _a, triggeredRules: _t, ...g }) => g);
  const capEvents = result.maturityCapEvents.map((c) => {
    const q = c.relatedQuestionId ? byId.get(c.relatedQuestionId) : null;
    const dc = q?.domainCode ?? (c.relatedDomainId ? String(c.relatedDomainId).replace('fixture-', '') : null);
    return { ruleCode: c.ruleCode, capTo: c.capTo, reason: c.reason, relatedQuestionCode: q?.questionCode ?? null, relatedQuestionPrompt: q?.prompt ?? null, relatedDomainCode: dc, relatedDomainName: dc ? domainName.get(dc) ?? null : null };
  });
  const s = result.summary;
  return {
    orderId: null, orderReference: null, orderAssessmentId: `fixture-${input.assessmentReference}`, assessmentId: `fixture-${input.assessmentReference}`, organisationId: 'fixture-organisation',
    currentScoreRunId: `fixture-run-${input.assessmentReference}`, orderVerifiedAt: null, orderVerifiedBy: null,
    paymentVerification: null as any,
    organisationName: input.organisationName, respondentName: 'Fictional respondent', customerEmail: 'fictional@example.test',
    assessmentReference: input.assessmentReference, reportReference: `RPT-${input.assessmentReference}`, generatedAt: input.generatedAt,
    packageName: 'Fictional comparison fixture', productCode: null, orderStatus: null, amountCents: null, currency: null, productPriceCents: null, productCurrency: null,
    requiresPaymentVerification: null, deliveryMode: null, productActive: null,
    scoreRun: {
      id: `fixture-run-${input.assessmentReference}`, assessmentId: `fixture-${input.assessmentReference}`, methodologyVersionId: MFRS_V12_CODE, ...({ methodologyVersionCode: MFRS_V12_CODE } as object),
      status: 'completed', lockedAt: null, inputHash: result.inputHash, overallScore: s.overallScore, calculatedMaturity: s.calculatedMaturity, finalMaturity: s.finalMaturity,
      exposureScore: null, exposureBand: null, coveragePct: s.coveragePct, nARatePct: s.nARatePct, criticalGapCount: s.criticalGapCount, majorGapCount: s.majorGapCount,
      capApplied: s.capApplied, capReason: s.capReason, capEffect: s.capEffect, adaptiveResultStatus: result.resultStatus, adaptiveMetrics: result.metrics as any
    },
    domainResults: result.domainResults.map((d) => ({ domainCode: d.domainCode, domainName: d.domainName, weightPct: d.domainWeightPct, rawScore: d.rawScore, weightedContribution: d.weightedContribution, coveragePct: d.coveragePct, criticalGapCount: d.criticalGapCount })),
    exposureAnswers: [],
    questionTraces,
    criticalMajorGaps: gaps,
    officialResponseLabels: officialResponseLabelsFixture as any,
    maturityCapEvents: capEvents,
    recommendationRules: [],
    expectedDomainResultCount: result.domainResults.length, actualDomainResultCount: result.domainResults.length,
    expectedQuestionTraceCount: questionTraces.length, actualQuestionTraceCount: questionTraces.length,
    adaptiveScope: result.metrics as any,
    adaptiveGatewayAnswers: { ...input.gatewayAnswers }
  };
}

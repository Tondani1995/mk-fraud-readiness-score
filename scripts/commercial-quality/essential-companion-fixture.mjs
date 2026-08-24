#!/usr/bin/env node
/**
 * Provider-free Vhutshilo Essential fixture for companion-register tests and visual QA.
 *
 * The response vector is resolved from the frozen V1.2 fixture and scored by the real adaptive
 * engine. No score, finding, action or workbook row is hardcoded here; this module only lifts the
 * scorer output into the persisted AssembledReportData shape used by the production model.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAdaptivePath } from '../../src/lib/adaptive/engine.ts';
import {
  VHUTSHILO_V12_GATEWAY_MAP,
  VHUTSHILO_V12_EXPECTED_RESULT,
  VHUTSHILO_V12_FIXTURE_RECOVERY,
  VHUTSHILO_V12_GRAPH_VERSION,
  vhutshiloV12Methodology,
  vhutshiloV12ResponseValue
} from '../../src/lib/adaptive/fixtures/vhutshilo-v12.ts';
import { calculateAdaptiveReadinessScore } from '../../src/lib/scoring/adaptive-scoring.ts';
import { MFRS_V12_METHODOLOGY_ID } from '../../src/lib/reports/evidence-model/question-playbooks.ts';
import { officialResponseLabelsFixture } from '../../src/lib/reports/evidence-model/__fixtures__/official-response-labels.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { adaptEssentialEvidenceModel } from '../../src/lib/reports/essential-presentation-adaptation.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';

const graph = JSON.parse(fs.readFileSync(path.resolve('src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json'), 'utf8'));

function buildScore() {
  const resolved = resolveAdaptivePath({ graph, gatewayAnswers: VHUTSHILO_V12_GATEWAY_MAP });
  const active = resolved.activeNodes.filter((node) => node.kind !== 'gateway');
  const controlResponses = Object.fromEntries(active.map((node) => [
    node.nodeId,
    { responseState: 'maturity', responseValue: vhutshiloV12ResponseValue(node.nodeId, node.replacementFor, node.domainCode) }
  ]));
  const scored = calculateAdaptiveReadinessScore({
    graph,
    methodology: vhutshiloV12Methodology(graph),
    gatewayAnswers: VHUTSHILO_V12_GATEWAY_MAP,
    controlResponses,
    integritySignals: []
  });
  assert.equal(Number(scored.summary.overallScore), VHUTSHILO_V12_EXPECTED_RESULT.overallScore);
  assert.equal(scored.summary.finalMaturity, VHUTSHILO_V12_EXPECTED_RESULT.maturity);
  return { resolved, active, controlResponses, scored };
}
function domainName(domainCode) {
  return graph.domains.find((domain) => domain.domainCode === domainCode)?.name ?? domainCode;
}

function assembledFixture() {
  const { scored } = buildScore();
  const questionTraces = scored.metrics.questionTraces.map((trace) => ({
    questionCode: trace.questionCode,
    domainCode: trace.domainCode,
    domainName: domainName(trace.domainCode),
    prompt: trace.prompt,
    responseValue: trace.responseValue,
    normalisedScore: trace.normalisedScore,
    applicable: trace.applicable,
    isCritical: trace.isCritical,
    isHardGate: trace.isHardGate,
    isCriticalGap: trace.isCriticalGap,
    isMajorGap: trace.isMajorGap,
    triggeredRules: trace.triggeredRules
  }));
  const domainResults = scored.domainResults.map((domain) => ({
    domainCode: domain.domainCode,
    domainName: domain.domainName,
    weightPct: domain.domainWeightPct,
    rawScore: domain.rawScore,
    weightedContribution: domain.weightedContribution,
    coveragePct: domain.coveragePct,
    criticalGapCount: domain.criticalGapCount
  }));
  const criticalMajorGaps = questionTraces
    .filter((trace) => trace.isCriticalGap || trace.isMajorGap)
    .map(({ questionCode, domainCode, domainName: name, prompt, responseValue, isCritical, isHardGate, isCriticalGap, isMajorGap }) => ({
      questionCode, domainCode, domainName: name, prompt, responseValue, isCritical, isHardGate, isCriticalGap, isMajorGap
    }));
  const maturityCapEvents = scored.maturityCapEvents.map((event) => {
    const question = graph.questions.find((candidate) => candidate.questionId === event.relatedQuestionId);
    const relatedDomainCode = event.relatedDomainId
      ? graph.domains.find((domain) => domain.domainId === event.relatedDomainId)?.domainCode ?? null
      : question?.domainCode ?? null;
    return {
      ruleCode: event.ruleCode,
      capTo: event.capTo,
      reason: event.reason,
      relatedQuestionCode: question?.questionCode ?? null,
      relatedQuestionPrompt: question?.prompt ?? null,
      relatedDomainCode,
      relatedDomainName: relatedDomainCode ? domainName(relatedDomainCode) : null
    };
  });

  return {
    orderId: '11111111-1111-4111-8111-111111111003',
    orderReference: VHUTSHILO_V12_FIXTURE_RECOVERY.orderReference,
    orderAssessmentId: '22222222-2222-4222-8222-222222222003',
    assessmentId: '22222222-2222-4222-8222-222222222003',
    organisationId: '33333333-3333-4333-8333-333333333003',
    currentScoreRunId: '44444444-4444-4444-8444-444444444003',
    orderVerifiedAt: '2026-08-23T12:00:00.000Z',
    orderVerifiedBy: '55555555-5555-4555-8555-555555555003',
    paymentVerification: { legacyOrderVerification: true },
    organisationName: VHUTSHILO_V12_FIXTURE_RECOVERY.organisationName,
    respondentName: 'Vhutshilo Foods management',
    customerEmail: 'vhutshilo-fixture@example.test',
    assessmentReference: VHUTSHILO_V12_FIXTURE_RECOVERY.assessmentReference,
    reportReference: 'RPT-MKFRS-V12-ESS-VHUTSHILO-V1',
    generatedAt: '2026-08-23T12:00:00.000Z',
    packageName: 'Essential',
    productCode: 'essential_self_assessment',
    orderStatus: 'payment_received',
    amountCents: 750000,
    currency: 'ZAR',
    productPriceCents: 750000,
    productCurrency: 'ZAR',
    requiresPaymentVerification: true,
    deliveryMode: 'mk_controlled_pdf',
    productActive: true,
    scoreRun: {
      id: '44444444-4444-4444-8444-444444444003',
      assessmentId: '22222222-2222-4222-8222-222222222003',
      methodologyVersionId: MFRS_V12_METHODOLOGY_ID,
      status: 'completed',
      lockedAt: '2026-08-23T12:00:00.000Z',
      inputHash: scored.inputHash,
      overallScore: scored.summary.overallScore,
      calculatedMaturity: scored.summary.calculatedMaturity,
      finalMaturity: scored.summary.finalMaturity,
      exposureScore: scored.summary.exposureScore,
      exposureBand: scored.summary.exposureBand,
      coveragePct: scored.summary.coveragePct,
      nARatePct: scored.summary.nARatePct,
      criticalGapCount: scored.summary.criticalGapCount,
      majorGapCount: scored.summary.majorGapCount,
      capApplied: scored.summary.capApplied,
      capReason: scored.summary.capReason,
      adaptiveResultStatus: scored.resultStatus,
      adaptiveMetrics: scored.metrics
    },
    domainResults,
    exposureAnswers: [],
    questionTraces,
    criticalMajorGaps,
    officialResponseLabels: officialResponseLabelsFixture,
    maturityCapEvents,
    recommendationRules: [],
    expectedDomainResultCount: 10,
    actualDomainResultCount: domainResults.length,
    expectedQuestionTraceCount: questionTraces.length,
    actualQuestionTraceCount: questionTraces.length,
    adaptiveScope: scored.metrics,
    adaptiveGatewayAnswers: VHUTSHILO_V12_GATEWAY_MAP
  };
}

export function buildVhutshiloEssentialFixture() {
  const data = assembledFixture();
  const model = buildAdvisoryEvidenceModel(data);
  const adaptedModel = adaptEssentialEvidenceModel(
    model,
    data.adaptiveGatewayAnswers,
    [],
    VHUTSHILO_V12_GRAPH_VERSION
  );
  const projection = buildEssentialProjection(data, adaptedModel);
  return { data, model, adaptedModel, projection, graph };
}

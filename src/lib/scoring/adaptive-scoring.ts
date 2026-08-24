import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { loadAssessmentMethodology } from '@/lib/respondent/assessment-methodology';
import {
  isSupportedAdaptiveGraph,
  resolveAdaptivePath,
  type AdaptiveControlResponses,
  type AdaptiveGatewayAnswers,
  type AdaptiveGraph,
  type AdaptiveResolvedPath,
  type ResolvedAdaptiveNode
} from '@/lib/adaptive/engine';
import { assertAdaptivePreviewEnvironment } from '@/lib/adaptive/server';
import type { MaturityBand } from '@/lib/types/domain';
import { getMaturityBand, MATURITY_RANK } from './maturity-band';

export type AdaptiveResultStatus = 'NORMAL' | 'PROVISIONAL' | 'INSUFFICIENT_VISIBILITY';

export type AdaptiveVisibilityGap = {
  id: string;
  questionCode: string;
  domainCode: string;
  prompt: string;
  statement: string;
  whyVisibilityMatters: string;
  evidenceNeeded: string;
  likelyEvidenceOwner: string;
  recommendedVerificationAction: string;
  priority: 'High' | 'Medium';
  targetTiming: '30 days' | '60 days';
};

export type AdaptiveResultMetrics = {
  resultStatus: AdaptiveResultStatus;
  graphVersion: string;
  graphFingerprint: string;
  applicableCount: number;
  applicableWeight: number;
  excludedCount: number;
  excludedWeight: number;
  redirectedCount: number;
  redirectedWeight: number;
  invalidatedCount: number;
  invalidatedWeight: number;
  profileOnlyCount: number;
  unknownCount: number;
  unknownWeight: number;
  unansweredApplicableCount: number;
  unansweredApplicableWeight: number;
  assessmentCoveragePct: number;
  controlVisibilityPct: number;
  /** Percentage of applicable control weight supported by a known maturity response. */
  exposureAssessed: boolean;
  visibilityGaps: AdaptiveVisibilityGap[];
  materialExclusionSharePct: number;
  unknownSharePct: number;
  scoreComparabilityStatement: string;
  limitationReasons: string[];
  excludedQuestionCodes: string[];
  redirectedQuestionCodes: string[];
  invalidatedQuestionCodes: string[];
  unknownQuestionCodes: string[];
  questionTraces: Array<{
    questionCode: string;
    domainCode: string;
    prompt: string;
    responseValue: number | null;
    normalisedScore: number | null;
    applicable: boolean;
    isCritical: boolean;
    isHardGate: boolean;
    isCriticalGap: boolean;
    isMajorGap: boolean;
    controlObjective?: string;
    evidenceReference?: string;
    triggeredRules: string[];
  }>;
};

type AdaptiveMethodology = Awaited<ReturnType<typeof loadAssessmentMethodology>>;

export type AdaptiveScoringResult = {
  summary: {
    overallScore: number | null;
    calculatedMaturity: MaturityBand | null;
    finalMaturity: MaturityBand | null;
    exposureScore: null;
    exposureBand: null;
    coveragePct: number;
    nARatePct: number;
    criticalGapCount: number;
    majorGapCount: number;
    capApplied: boolean;
    capReason: string | null;
    flags: string[];
  };
  resultStatus: AdaptiveResultStatus;
  metrics: AdaptiveResultMetrics;
  domainResults: Array<{
    domainId: string;
    domainCode: string;
    domainName: string;
    domainWeightPct: number;
    rawScore: number | null;
    weightedContribution: number | null;
    coveragePct: number;
    criticalGapCount: number;
    flags: string[];
  }>;
  questionTraces: Array<{
    questionId: string;
    questionCode: string;
    responseValue: number | null;
    normalisedScore: number | null;
    questionWeight: number;
    applicable: boolean;
    numeratorContribution: number;
    denominatorContribution: number;
    isCriticalGap: boolean;
    isMajorGap: boolean;
    triggeredRules: string[];
  }>;
  maturityCapEvents: Array<{
    ruleCode: string;
    capTo: MaturityBand;
    reason: string;
    relatedQuestionId?: string | null;
    relatedDomainId?: string | null;
  }>;
  inputHash: string;
};

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

const maturityForScore = getMaturityBand;



function applyCap(current: MaturityBand, capTo: MaturityBand) {
  return MATURITY_RANK[capTo] < MATURITY_RANK[current] ? capTo : current;
}

function stableHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nodeQuestionCode(node: ResolvedAdaptiveNode, graph: AdaptiveGraph) {
  if (node.kind === 'oversight') return graph.questions.find((question) => question.questionId === node.replacementFor)?.questionCode ?? node.nodeId;
  return graph.questions.find((question) => question.questionId === node.nodeId)?.questionCode ?? node.nodeId;
}

function nodeForScoring(path: AdaptiveResolvedPath, graph: AdaptiveGraph, questionId: string) {
  const base = path.nodes.find((node) => node.nodeId === questionId);
  if (!base) return null;
  if (base.state === 'redirected') {
    return path.nodes.find((node) => node.kind === 'oversight' && node.replacementFor === questionId) ?? base;
  }
  return base;
}

export function calculateAdaptiveReadinessScore(input: {
  graph: AdaptiveGraph;
  methodology: AdaptiveMethodology;
  gatewayAnswers: AdaptiveGatewayAnswers;
  controlResponses: AdaptiveControlResponses;
  invalidatedQuestionIds?: string[];
  integritySignals?: Array<{ signalId: string; blocking: boolean }>;
}): AdaptiveScoringResult {
  const invalidated = new Set(input.invalidatedQuestionIds ?? []);
  const path = resolveAdaptivePath({ graph: input.graph, gatewayAnswers: input.gatewayAnswers, controlResponses: input.controlResponses });
  const questionByCode = new Map(input.methodology.domains.flatMap((domain) => domain.questions).map((question) => [question.questionCode, question]));
  const domainByCode = new Map(input.methodology.domains.map((domain) => [domain.domainCode, domain]));
  const flags = new Set<string>();
  const traces: AdaptiveScoringResult['questionTraces'] = [];
  const reportTraces: AdaptiveResultMetrics['questionTraces'] = [];
  const excludedCodes: string[] = [];
  const redirectedCodes: string[] = [];
  const invalidatedCodes: string[] = [];
  const unknownCodes: string[] = [];
  let applicableCount = 0;
  let applicableWeight = 0;
  let excludedCount = 0;
  let excludedWeight = 0;
  let redirectedCount = 0;
  let redirectedWeight = 0;
  let invalidatedWeight = 0;
  let unknownCount = 0;
  let unknownWeight = 0;
  let unansweredApplicableCount = 0;
  let unansweredApplicableWeight = 0;
  let criticalGapCount = 0;
  let majorGapCount = 0;
  const domainAccumulators = new Map<string, { numerator: number; denominator: number; completedWeight: number; knownWeight: number; critical: number }>();
  const totalControlWeight = input.graph.questions.reduce((sum, question) => sum + question.weight, 0);

  for (const question of input.graph.questions) {
    const code = question.questionCode;
    const baseNode = path.nodes.find((node) => node.nodeId === question.questionId);
    const node = nodeForScoring(path, input.graph, question.questionId);
    const profileState = baseNode?.state ?? 'invalidated';
    const domain = domainByCode.get(question.domainCode);
    const methodologyQuestion = questionByCode.get(code);
    if (!domain || !node || !methodologyQuestion) continue;
    const accumulator = domainAccumulators.get(question.domainCode) ?? { numerator: 0, denominator: 0, completedWeight: 0, knownWeight: 0, critical: 0 };
    const response = node.response ?? null;
    const isInvalidated = invalidated.has(question.questionId) && profileState !== 'active' && profileState !== 'redirected';
    const isRedirected = profileState === 'redirected';
    const isExcluded = profileState === 'excluded';

    if (isInvalidated) {
      invalidatedCodes.push(code);
      invalidatedWeight += question.weight;
      reportTraces.push({ questionCode: code, domainCode: question.domainCode, prompt: node.prompt, responseValue: null, normalisedScore: null, applicable: false, isCritical: question.isCritical, isHardGate: question.isHardGate, isCriticalGap: false, isMajorGap: false, controlObjective: question.controlObjective ?? undefined, evidenceReference: question.evidenceReference ?? undefined, triggeredRules: ['invalidated_by_upstream_gateway'] });
      traces.push({ questionId: methodologyQuestion.id, questionCode: code, responseValue: null, normalisedScore: null, questionWeight: question.weight, applicable: false, numeratorContribution: 0, denominatorContribution: 0, isCriticalGap: false, isMajorGap: false, triggeredRules: ['invalidated_by_upstream_gateway'] });
      domainAccumulators.set(question.domainCode, accumulator);
      continue;
    }
    if (isExcluded) {
      excludedCount += 1;
      excludedWeight += question.weight;
      excludedCodes.push(code);
      reportTraces.push({ questionCode: code, domainCode: question.domainCode, prompt: question.prompt, responseValue: null, normalisedScore: null, applicable: false, isCritical: question.isCritical, isHardGate: question.isHardGate, isCriticalGap: false, isMajorGap: false, controlObjective: question.controlObjective ?? undefined, evidenceReference: question.evidenceReference ?? undefined, triggeredRules: ['valid_gateway_exclusion'] });
      traces.push({ questionId: methodologyQuestion.id, questionCode: code, responseValue: null, normalisedScore: null, questionWeight: question.weight, applicable: false, numeratorContribution: 0, denominatorContribution: 0, isCriticalGap: false, isMajorGap: false, triggeredRules: ['valid_gateway_exclusion'] });
      domainAccumulators.set(question.domainCode, accumulator);
      continue;
    }

    const weight = Number(node.weight || question.weight);
    const value = response?.responseState === 'maturity' ? response.responseValue : null;
    const unknown = response?.responseState === 'unknown';
    const unanswered = !response;
    const normalisedScore = value === null ? null : round((value / 5) * 100);
    const isCriticalGap = value !== null && value <= 2 && question.isCritical;
    const isMajorGap = value !== null && value <= 1 && question.isHardGate;
    const triggeredRules: string[] = [];
    if (isRedirected) { redirectedCount += 1; redirectedWeight += weight; redirectedCodes.push(code); triggeredRules.push('redirected_to_oversight'); }
    if (unknown) { unknownCount += 1; unknownWeight += weight; unknownCodes.push(code); triggeredRules.push('unknown_response_excluded_from_score_denominator'); }
    if (unanswered) { unansweredApplicableCount += 1; unansweredApplicableWeight += weight; flags.add('unanswered_applicable'); triggeredRules.push('unanswered_applicable'); }
    if (isCriticalGap) { criticalGapCount += 1; accumulator.critical += 1; triggeredRules.push('critical_gap_response_lte_2'); }
    if (isMajorGap) { majorGapCount += 1; triggeredRules.push('major_hard_gate_gap_response_lte_1'); }
    if (question.isHardGate && value === 2) triggeredRules.push('hard_gate_gap_response_eq_2');
    applicableCount += 1; applicableWeight += weight;
    if (value !== null) {
      accumulator.denominator += weight;
      accumulator.numerator += normalisedScore! * weight;
      accumulator.knownWeight += weight;
    }
    if (value !== null) accumulator.completedWeight += weight;
    reportTraces.push({ questionCode: code, domainCode: question.domainCode, prompt: node.prompt, responseValue: value, normalisedScore, applicable: true, isCritical: question.isCritical, isHardGate: question.isHardGate, isCriticalGap, isMajorGap, controlObjective: question.controlObjective ?? undefined, evidenceReference: question.evidenceReference ?? undefined, triggeredRules });
    traces.push({ questionId: methodologyQuestion.id, questionCode: code, responseValue: value, normalisedScore, questionWeight: weight, applicable: true, numeratorContribution: value === null ? 0 : round(normalisedScore! * weight, 4), denominatorContribution: value === null ? 0 : weight, isCriticalGap, isMajorGap, triggeredRules });
    domainAccumulators.set(question.domainCode, accumulator);
  }

  const domainResults = input.methodology.domains.map((domain) => {
    const accumulator = domainAccumulators.get(domain.domainCode) ?? { numerator: 0, denominator: 0, completedWeight: 0, knownWeight: 0, critical: 0 };
    const rawScore = accumulator.denominator > 0 ? round(accumulator.numerator / accumulator.denominator) : null;
    return {
      domainId: domain.id, domainCode: domain.domainCode, domainName: domain.name, domainWeightPct: domain.weightPct,
      rawScore, weightedContribution: rawScore === null ? null : round(rawScore * domain.weightPct / 100, 4),
      coveragePct: accumulator.denominator > 0 ? round(accumulator.completedWeight / accumulator.denominator * 100) : 0,
      criticalGapCount: accumulator.critical,
      flags: rawScore === null ? ['whole_domain_exclusion'] : []
    };
  });

  const scoredDomains = domainResults.filter((domain) => domain.rawScore !== null);
  const totalScoredDomainWeight = scoredDomains.reduce((sum, domain) => sum + domain.domainWeightPct, 0);
  const overallScore = totalScoredDomainWeight > 0
    ? round(scoredDomains.reduce((sum, domain) => sum + Number(domain.rawScore) * domain.domainWeightPct, 0) / totalScoredDomainWeight)
    : null;
  const coveragePct = applicableCount > 0 ? round((applicableCount - unansweredApplicableCount) / applicableCount * 100) : 0;
  const unknownSharePct = applicableWeight > 0 ? round(unknownWeight / applicableWeight * 100) : 0;
  const materialExclusionSharePct = totalControlWeight > 0 ? round((excludedWeight + invalidatedWeight) / totalControlWeight * 100) : 100;
  const knownWeight = [...domainAccumulators.values()].reduce((sum, accumulator) => sum + accumulator.knownWeight, 0);
  const controlVisibilityPct = applicableWeight > 0 ? round(knownWeight / applicableWeight * 100) : 0;
  const limitationReasons: string[] = [];
  if (input.integritySignals?.some((signal) => signal.blocking)) limitationReasons.push('The submitted assessment contains a blocking integrity condition.');
  if (coveragePct < 70) limitationReasons.push('Applicable controls were not sufficiently answered.');
  if (applicableCount === 0) limitationReasons.push('No applicable control areas remained in scope.');
  if (materialExclusionSharePct >= 40) limitationReasons.push('A material share of the control set was outside the assessed scope.');
  if (unknownSharePct >= 30) limitationReasons.push('Unknown responses reached 30% or more of applicable control weight; the control position cannot be confirmed.');
  const resultStatus: AdaptiveResultStatus = limitationReasons.length > 0
    ? 'INSUFFICIENT_VISIBILITY'
    : (unknownSharePct >= 20 || excludedCount > 0 || redirectedCount > 0 || (input.integritySignals?.length ?? 0) > 0 || coveragePct < 90 ? 'PROVISIONAL' : 'NORMAL');
  const scoreAllowed = resultStatus !== 'INSUFFICIENT_VISIBILITY' && overallScore !== null;
  let calculatedMaturity = scoreAllowed ? maturityForScore(overallScore!) : null;
  let finalMaturity = calculatedMaturity;
  const maturityCapEvents: AdaptiveScoringResult['maturityCapEvents'] = [];
  const hardGateMajor = traces.find((trace) => trace.isMajorGap);
  const hardGateTwo = traces.find((trace) => trace.triggeredRules.includes('hard_gate_gap_response_eq_2'));
  const coreBelow40 = domainResults.find((domain) => domain.rawScore !== null && input.methodology.domains.find((d) => d.domainCode === domain.domainCode)?.isCore && domain.rawScore < 40);
  const coreBelow60 = domainResults.find((domain) => domain.rawScore !== null && input.methodology.domains.find((d) => d.domainCode === domain.domainCode)?.isCore && domain.rawScore < 60);
  if (finalMaturity && hardGateMajor) { finalMaturity = applyCap(finalMaturity, 'Developing'); maturityCapEvents.push({ ruleCode: 'any_hard_gate_critical_control_lte_1', capTo: 'Developing', reason: 'One or more hard-gate critical controls scored 0 or 1.', relatedQuestionId: hardGateMajor.questionId }); }
  if (finalMaturity && hardGateTwo) { finalMaturity = applyCap(finalMaturity, 'Structured'); maturityCapEvents.push({ ruleCode: 'any_hard_gate_critical_control_eq_2', capTo: 'Structured', reason: 'One or more hard-gate critical controls scored 2.', relatedQuestionId: hardGateTwo.questionId }); }
  if (finalMaturity && criticalGapCount >= 3) { finalMaturity = applyCap(finalMaturity, 'Developing'); maturityCapEvents.push({ ruleCode: 'three_or_more_critical_controls_lte_2', capTo: 'Developing', reason: 'Three or more critical controls scored 0, 1 or 2.' }); }
  if (finalMaturity && coreBelow40) { finalMaturity = applyCap(finalMaturity, 'Developing'); maturityCapEvents.push({ ruleCode: 'any_core_domain_below_40', capTo: 'Developing', reason: `Core domain ${coreBelow40.domainCode} scored below 40.`, relatedDomainId: coreBelow40.domainId }); }
  if (finalMaturity && coreBelow60) { finalMaturity = applyCap(finalMaturity, 'Structured'); maturityCapEvents.push({ ruleCode: 'any_core_domain_below_60', capTo: 'Structured', reason: `Core domain ${coreBelow60.domainCode} scored below 60.`, relatedDomainId: coreBelow60.domainId }); }
  const flagsList = [...flags, ...(input.integritySignals ?? []).map((signal) => signal.signalId)];
  const metrics: AdaptiveResultMetrics = {
    resultStatus, graphVersion: input.graph.graphVersion, graphFingerprint: input.graph.graphFingerprint,
    applicableCount, applicableWeight: round(applicableWeight), excludedCount, excludedWeight: round(excludedWeight),
    redirectedCount, redirectedWeight: round(redirectedWeight), invalidatedCount: invalidatedCodes.length, invalidatedWeight: round(invalidatedWeight),
    profileOnlyCount: path.profileOnlyNodes.length, unknownCount, unknownWeight: round(unknownWeight),
    unansweredApplicableCount, unansweredApplicableWeight: round(unansweredApplicableWeight), assessmentCoveragePct: coveragePct,
    controlVisibilityPct, materialExclusionSharePct, unknownSharePct, exposureAssessed: false,
    visibilityGaps: reportTraces.filter((trace) => trace.applicable && trace.responseValue === null && trace.triggeredRules.includes('unknown_response_excluded_from_score_denominator')).map((trace) => ({
      id: `VIS-${trace.questionCode}`,
      questionCode: trace.questionCode,
      domainCode: trace.domainCode,
      prompt: trace.prompt,
      statement: 'The control position could not be confirmed from the response.',
      whyVisibilityMatters: trace.controlObjective ? `Independent evidence is needed to confirm whether the control objective is operating: ${trace.controlObjective}` : 'A known response is not available, so the operating control position cannot be interpreted reliably.',
      evidenceNeeded: trace.evidenceReference ? `Evidence mapped to ${trace.evidenceReference}, including the complete in-scope population and operating records.` : 'The complete in-scope population, operating records and the owner-approved evidence used to support this control response.',
      likelyEvidenceOwner: 'Control owner / process owner to be confirmed during evidence review.',
      recommendedVerificationAction: 'Obtain and independently verify the control evidence before relying on the result.',
      priority: unknownSharePct >= 30 ? 'High' : 'Medium',
      targetTiming: unknownSharePct >= 30 ? '30 days' : '60 days'
    })),
    scoreComparabilityStatement: resultStatus === 'NORMAL'
      ? 'Comparable with other assessments using the same approved methodology where the assessed scope is materially similar.'
      : resultStatus === 'PROVISIONAL'
        ? 'Use as a directional result only; differences in scope or uncertainty may limit comparison with other assessments.'
        : 'A numeric Fraud Readiness Score is withheld because the submitted assessment did not provide enough visibility for a reliable result.',
    limitationReasons, excludedQuestionCodes: excludedCodes, redirectedQuestionCodes: redirectedCodes,
    invalidatedQuestionCodes: invalidatedCodes, unknownQuestionCodes: unknownCodes, questionTraces: reportTraces
  };
  return {
    summary: {
      overallScore: scoreAllowed ? overallScore : null, calculatedMaturity: scoreAllowed ? calculatedMaturity : null, finalMaturity: scoreAllowed ? finalMaturity : null,
      exposureScore: null, exposureBand: null, coveragePct, nARatePct: unknownSharePct, criticalGapCount, majorGapCount,
      capApplied: Boolean(scoreAllowed && finalMaturity !== calculatedMaturity), capReason: maturityCapEvents.length ? maturityCapEvents.map((event) => event.reason).join(' ') : null,
      flags: flagsList
    },
    resultStatus, metrics, domainResults, questionTraces: traces, maturityCapEvents,
    inputHash: stableHash({ graph: input.graph.graphFingerprint, gateways: input.gatewayAnswers, controls: input.controlResponses, invalidated: [...invalidated].sort(), signals: input.integritySignals ?? [] })
  };
}

export async function scoreAdaptiveSubmittedAssessment(assessmentReference: string, options: { runType?: 'initial' | 'admin_recalc' | 'correction_recalc'; createdByAdminId?: string | null } = {}) {
  assertAdaptivePreviewEnvironment();
  const db = createSupabaseServiceClient() as any;
  const { data: assessment, error: assessmentError } = await db.from('assessments')
    .select('id,assessment_reference,assessment_mode,methodology_version_id,status,current_score_run_id,graph_version_id,graph_version_snapshot,graph_fingerprint_snapshot')
    .eq('assessment_reference', assessmentReference).maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment) return { ok: false as const, status: 404, errors: ['assessment_not_found'] };
  if (assessment.assessment_mode !== 'adaptive') return { ok: false as const, status: 409, errors: ['adaptive_assessment_required'] };
  if (!['submitted', 'scored', 'snapshot_available', 'report_requested'].includes(assessment.status)) return { ok: false as const, status: 409, errors: [`assessment_status_not_scorable:${assessment.status}`] };
  const runType = options.runType ?? 'initial';
  if (runType === 'initial' && assessment.current_score_run_id) return { ok: false as const, status: 409, errors: ['assessment_already_has_current_score_run'] };
  const [{ data: graphRow, error: graphError }, { data: gateways, error: gatewaysError }, { data: controls, error: controlsError }, { data: history, error: historyError }, { data: signals, error: signalsError }] = await Promise.all([
    db.from('adaptive_graph_versions').select('id,compiled_graph_json,graph_version,graph_fingerprint').eq('id', assessment.graph_version_id).maybeSingle(),
    db.from('adaptive_gateway_answers').select('question_id,response_value').eq('assessment_id', assessment.id).eq('graph_version_id', assessment.graph_version_id),
    db.from('adaptive_control_responses').select('question_id,response_state,response_value').eq('assessment_id', assessment.id).eq('graph_version_id', assessment.graph_version_id),
    db.from('assessment_answer_history').select('question_id,event_type').eq('assessment_id', assessment.id).eq('graph_version_id', assessment.graph_version_id),
    db.from('assessment_integrity_signals').select('signal_id,blocking').eq('assessment_id', assessment.id).eq('graph_version_id', assessment.graph_version_id)
  ]);
  if (graphError || gatewaysError || controlsError || historyError || signalsError || !graphRow) throw graphError ?? gatewaysError ?? controlsError ?? historyError ?? signalsError ?? new Error('adaptive_graph_not_found');
  if (!isSupportedAdaptiveGraph(assessment.graph_version_snapshot, assessment.graph_fingerprint_snapshot)
    || graphRow.graph_version !== assessment.graph_version_snapshot
    || graphRow.graph_fingerprint !== assessment.graph_fingerprint_snapshot) throw new Error('adaptive_graph_pin_invalid');
  const methodology = await loadAssessmentMethodology(assessment.methodology_version_id);
  const result = calculateAdaptiveReadinessScore({
    graph: graphRow.compiled_graph_json as AdaptiveGraph,
    methodology,
    gatewayAnswers: Object.fromEntries((gateways ?? []).map((row: any) => [row.question_id, row.response_value])),
    controlResponses: Object.fromEntries((controls ?? []).map((row: any) => [row.question_id, { responseState: row.response_state, responseValue: row.response_value }])),
    invalidatedQuestionIds: (history ?? []).filter((row: any) => row.event_type === 'invalidation').map((row: any) => row.question_id),
    integritySignals: signals ?? []
  });
  const { data, error } = await db.rpc('complete_adaptive_score_run_atomic', {
    p_assessment_id: assessment.id, p_methodology_version_id: assessment.methodology_version_id, p_graph_version_id: assessment.graph_version_id,
    p_graph_version_snapshot: assessment.graph_version_snapshot, p_graph_fingerprint_snapshot: assessment.graph_fingerprint_snapshot,
    p_run_type: runType, p_input_hash: result.inputHash, p_created_by_user_id: options.createdByAdminId ?? null,
    p_result_status: result.resultStatus,
    p_summary: {
      overall_score: result.summary.overallScore,
      calculated_maturity: result.summary.calculatedMaturity,
      final_maturity: result.summary.finalMaturity,
      exposure_score: result.summary.exposureScore,
      exposure_band: result.summary.exposureBand,
      coverage_pct: result.summary.coveragePct,
      n_a_rate_pct: result.summary.nARatePct,
      critical_gap_count: result.summary.criticalGapCount,
      major_gap_count: result.summary.majorGapCount,
      cap_applied: result.summary.capApplied,
      cap_reason: result.summary.capReason
    },
    p_metrics: result.metrics,
    p_domain_results: result.domainResults.map((domain) => ({
      domain_id: domain.domainId,
      raw_score: domain.rawScore,
      weighted_contribution: domain.weightedContribution,
      coverage_pct: domain.coveragePct,
      critical_gap_count: domain.criticalGapCount,
      flags: domain.flags
    })),
    p_question_traces: result.questionTraces.map((trace) => ({
      question_id: trace.questionId,
      response_value: trace.responseValue,
      normalised_score: trace.normalisedScore,
      question_weight: trace.questionWeight,
      applicable: trace.applicable,
      numerator_contribution: trace.numeratorContribution,
      denominator_contribution: trace.denominatorContribution,
      is_critical_gap: trace.isCriticalGap,
      is_major_gap: trace.isMajorGap,
      triggered_rules: trace.triggeredRules
    })),
    p_cap_events: result.maturityCapEvents.map((event) => ({
      rule_code: event.ruleCode,
      cap_to: event.capTo,
      reason: event.reason,
      related_question_id: event.relatedQuestionId,
      related_domain_id: event.relatedDomainId
    }))
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.score_run_id) throw new Error('Adaptive score RPC did not return a score run.');
  return { ok: true as const, assessmentReference, scoreRunId: row.score_run_id, runNumber: Number(row.run_number), result };
}

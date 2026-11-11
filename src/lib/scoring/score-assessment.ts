import crypto from 'crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { loadAssessmentMethodology } from '@/lib/respondent/assessment-methodology';
import { calculateFraudReadinessScore, type ScoringResult } from '@/lib/scoring/scoring-engine';
import type { ScoreRunType, SavedAssessmentAnswer, SavedExposureAnswer } from '@/lib/types/domain';

type ScoreAssessmentOptions = {
  runType?: ScoreRunType;
  createdByAdminId?: string | null;
};

type LoadedAssessment = {
  id: string;
  assessment_reference: string;
  methodology_version_id: string;
  status: string;
  current_score_run_id: string | null;
  submitted_at: string | null;
  locked_at: string | null;
};

type ScoringAnswer = SavedAssessmentAnswer & { answerId: string | null };

type AtomicScoreRunResponse = {
  score_run_id: string;
  run_number: number;
};

function stableHash(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function sortByCode<T extends { questionCode?: string; factorCode?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(a.questionCode ?? a.factorCode).localeCompare(String(b.questionCode ?? b.factorCode)));
}

function buildInputHash(input: {
  assessmentId: string;
  methodologyVersionId: string;
  answers: ScoringAnswer[];
  exposureAnswers: SavedExposureAnswer[];
}): string {
  return stableHash({
    assessmentId: input.assessmentId,
    methodologyVersionId: input.methodologyVersionId,
    answers: sortByCode(input.answers).map((answer) => ({
      questionId: answer.questionId,
      questionCode: answer.questionCode,
      responseValue: answer.responseValue,
      isNotApplicable: answer.isNotApplicable,
      nAReason: answer.nAReason?.trim() || null
    })),
    exposureAnswers: sortByCode(input.exposureAnswers).map((answer) => ({
      exposureFactorId: answer.exposureFactorId,
      factorCode: answer.factorCode,
      selectedValue: answer.selectedValue,
      pointsAwarded: answer.pointsAwarded
    }))
  });
}

async function loadAssessmentForScoring(assessmentReference: string): Promise<LoadedAssessment | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('assessments')
    .select('id,assessment_reference,methodology_version_id,status,current_score_run_id,submitted_at,locked_at')
    .eq('assessment_reference', assessmentReference)
    .maybeSingle();

  if (error) throw error;
  return data as LoadedAssessment | null;
}

async function loadScoringAnswers(assessmentId: string) {
  const service = createSupabaseServiceClient();

  const [{ data: answers, error: answersError }, { data: exposureAnswers, error: exposureError }] = await Promise.all([
    service
      .from('assessment_answers')
      .select('id,question_id,questions(question_code),response_value,is_not_applicable,n_a_reason')
      .eq('assessment_id', assessmentId),
    service
      .from('exposure_answers')
      .select('exposure_factor_id,exposure_factors(factor_code),raw_value_json,points_awarded')
      .eq('assessment_id', assessmentId)
  ]);

  if (answersError) throw answersError;
  if (exposureError) throw exposureError;

  const mappedAnswers: ScoringAnswer[] = (answers ?? []).map((answer: any) => ({
    answerId: answer.id,
    questionId: answer.question_id,
    questionCode: answer.questions?.question_code ?? '',
    responseValue: answer.response_value,
    isNotApplicable: answer.is_not_applicable,
    nAReason: answer.n_a_reason
  }));

  const mappedExposureAnswers: SavedExposureAnswer[] = (exposureAnswers ?? []).map((answer: any) => ({
    exposureFactorId: answer.exposure_factor_id,
    factorCode: answer.exposure_factors?.factor_code ?? '',
    selectedValue: answer.raw_value_json?.selectedValue ?? null,
    selectedLabel: answer.raw_value_json?.selectedLabel ?? null,
    pointsAwarded: Number(answer.points_awarded ?? 0)
  }));

  return { answers: mappedAnswers, exposureAnswers: mappedExposureAnswers };
}

function buildAtomicPayload(result: ScoringResult) {
  return {
    summary: {
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
      cap_reason: result.summary.capReason,
      flags: result.summary.flags
    },
    domainResults: result.domainResults.map((domain) => ({
      domain_id: domain.domainId,
      raw_score: domain.rawScore,
      weighted_contribution: domain.weightedContribution,
      coverage_pct: domain.coveragePct,
      critical_gap_count: domain.criticalGapCount,
      flags: domain.flags
    })),
    questionTraces: result.questionTraces.map((trace) => ({
      question_id: trace.questionId,
      answer_id: trace.answerId ?? null,
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
    capEvents: result.maturityCapEvents.map((event) => ({
      rule_code: event.ruleCode,
      cap_to: event.capTo,
      reason: event.reason,
      related_question_id: event.relatedQuestionId ?? null,
      related_domain_id: event.relatedDomainId ?? null
    }))
  };
}

async function persistScoreRunAtomically(input: {
  assessment: LoadedAssessment;
  result: ScoringResult;
  inputHash: string;
  runType: ScoreRunType;
  createdByAdminId?: string | null;
}): Promise<AtomicScoreRunResponse> {
  const service = createSupabaseServiceClient();
  const payload = buildAtomicPayload(input.result);

  const { data, error } = await service.rpc('complete_score_run_atomic', {
    p_assessment_id: input.assessment.id,
    p_methodology_version_id: input.assessment.methodology_version_id,
    p_run_type: input.runType,
    p_input_hash: input.inputHash,
    p_created_by_user_id: input.createdByAdminId ?? null,
    p_summary: payload.summary,
    p_domain_results: payload.domainResults,
    p_question_traces: payload.questionTraces,
    p_cap_events: payload.capEvents
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.score_run_id || !row?.run_number) {
    throw new Error('Atomic score RPC did not return score_run_id and run_number.');
  }

  return {
    score_run_id: row.score_run_id,
    run_number: Number(row.run_number)
  };
}

export async function scoreSubmittedAssessment(assessmentReference: string, options: ScoreAssessmentOptions = {}) {
  const runType = options.runType ?? 'initial';
  const assessment = await loadAssessmentForScoring(assessmentReference);

  if (!assessment) return { ok: false as const, status: 404, errors: ['assessment_not_found'] };
  if (!['submitted', 'scored'].includes(assessment.status)) {
    return { ok: false as const, status: 409, errors: [`assessment_status_not_scorable:${assessment.status}`] };
  }

  if (runType === 'initial' && assessment.current_score_run_id) {
    return { ok: false as const, status: 409, errors: ['assessment_already_has_current_score_run'] };
  }

  const [{ domains }, { answers, exposureAnswers }] = await Promise.all([
    loadAssessmentMethodology(assessment.methodology_version_id),
    loadScoringAnswers(assessment.id)
  ]);

  const result = calculateFraudReadinessScore({ domains, answers, exposureAnswers });
  if (result.summary.status !== 'scorable') {
    return { ok: false as const, status: 422, errors: ['assessment_not_scorable'], result };
  }

  const inputHash = buildInputHash({
    assessmentId: assessment.id,
    methodologyVersionId: assessment.methodology_version_id,
    answers,
    exposureAnswers
  });

  const persisted = await persistScoreRunAtomically({
    assessment,
    result,
    inputHash,
    runType,
    createdByAdminId: options.createdByAdminId ?? null
  });

  return {
    ok: true as const,
    assessmentReference,
    scoreRunId: persisted.score_run_id,
    runNumber: persisted.run_number,
    result
  };
}

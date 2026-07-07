import { validateResumeToken } from '@/lib/respondent/tokens';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { loadAssessmentAnswers, loadAssessmentMethodology, calculateAssessmentProgress } from '@/lib/respondent/assessment-methodology';
import { evaluateNAEligibility, type ExposureSelectionMap } from '@/lib/respondent/na-rules';

export type SaveAssessmentPayload = {
  assessmentReference: string;
  token: string;
  answers?: Array<{
    questionId: string;
    responseValue: number | null;
    isNotApplicable: boolean;
    nAReason?: string | null;
  }>;
  exposureAnswers?: Array<{
    exposureFactorId: string;
    selectedValue: string;
    selectedLabel: string;
    pointsAwarded: number;
  }>;
};

export function validateAnswerPayload(payload: SaveAssessmentPayload): string[] {
  const errors: string[] = [];
  if (!payload.assessmentReference) errors.push('Assessment reference is required.');
  if (!payload.token) errors.push('Resume token is required.');

  for (const answer of payload.answers ?? []) {
    if (!answer.questionId) errors.push('Question ID is required for each answer.');

    if (answer.isNotApplicable) {
      if (answer.responseValue !== null) errors.push('N/A answers must not include a numeric response.');
      // Draft autosave may persist an incomplete N/A reason, but submit will not accept it.
      continue;
    }

    // A null non-N/A answer is treated as a draft clear/delete, not a completed answer.
    if (answer.responseValue === null) continue;

    if (!Number.isInteger(answer.responseValue) || answer.responseValue < 0 || answer.responseValue > 5) {
      errors.push('Each scored answer must be a whole number between 0 and 5.');
    }
  }

  for (const exposureAnswer of payload.exposureAnswers ?? []) {
    if (!exposureAnswer.exposureFactorId) errors.push('Exposure factor ID is required.');
    if (!exposureAnswer.selectedValue) errors.push('Exposure answer selection is required.');
    if (!Number.isFinite(exposureAnswer.pointsAwarded) || exposureAnswer.pointsAwarded < 0) errors.push('Exposure points must be a valid non-negative number.');
  }

  return [...new Set(errors)];
}

function buildMergedExposureSelectionMap(input: {
  exposureFactors: Awaited<ReturnType<typeof loadAssessmentMethodology>>['exposureFactors'];
  savedExposureAnswers: Awaited<ReturnType<typeof loadAssessmentAnswers>>['exposureAnswers'];
  incomingExposureAnswers: NonNullable<SaveAssessmentPayload['exposureAnswers']>;
}): ExposureSelectionMap {
  const factorCodeById = new Map(input.exposureFactors.map((factor) => [factor.id, factor.factorCode]));
  const selection: ExposureSelectionMap = {};

  for (const saved of input.savedExposureAnswers) {
    selection[saved.factorCode] = saved.selectedValue;
  }

  for (const incoming of input.incomingExposureAnswers) {
    const factorCode = factorCodeById.get(incoming.exposureFactorId);
    if (factorCode) selection[factorCode] = incoming.selectedValue;
  }

  return selection;
}

export async function saveAssessmentDraft(payload: SaveAssessmentPayload) {
  const validationErrors = validateAnswerPayload(payload);
  if (validationErrors.length) return { ok: false as const, status: 400, errors: validationErrors };

  const tokenValidation = await validateResumeToken({
    assessmentReference: payload.assessmentReference,
    rawToken: payload.token,
    consume: false
  });

  if (!tokenValidation.ok) return { ok: false as const, status: 403, errors: [tokenValidation.reason] };

  const service = createSupabaseServiceClient();
  const assessment = tokenValidation.assessment;
  if (assessment.status !== 'draft' || assessment.locked_at || assessment.submitted_at) {
    return { ok: false as const, status: 403, errors: ['assessment_locked'] };
  }

  const { domains, exposureFactors } = await loadAssessmentMethodology(assessment.methodology_version_id);
  const currentBeforeSave = await loadAssessmentAnswers(assessment.id);
  const questions = domains.flatMap((domain) => domain.questions);
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const exposureFactorsById = new Map(exposureFactors.map((factor) => [factor.id, factor]));
  const exposureSelectionMap = buildMergedExposureSelectionMap({
    exposureFactors,
    savedExposureAnswers: currentBeforeSave.exposureAnswers,
    incomingExposureAnswers: payload.exposureAnswers ?? []
  });

  const rowsToUpsert = [];
  const questionIdsToClear: string[] = [];

  for (const answer of payload.answers ?? []) {
    const question = questionsById.get(answer.questionId);
    if (!question) {
      return { ok: false as const, status: 400, errors: [`Unknown or inactive question: ${answer.questionId}`] };
    }

    if (answer.isNotApplicable) {
      const eligibility = evaluateNAEligibility(question, exposureSelectionMap);
      if (!eligibility.allowed) {
        return { ok: false as const, status: 400, errors: [`N/A is not allowed for ${question.questionCode}: ${eligibility.reason}`] };
      }

      rowsToUpsert.push({
        assessment_id: assessment.id,
        question_id: answer.questionId,
        response_value: null,
        is_not_applicable: true,
        n_a_reason: answer.nAReason?.trim() || null,
        updated_at: new Date().toISOString()
      });
      continue;
    }

    if (answer.responseValue === null) {
      questionIdsToClear.push(answer.questionId);
      continue;
    }

    rowsToUpsert.push({
      assessment_id: assessment.id,
      question_id: answer.questionId,
      response_value: answer.responseValue,
      is_not_applicable: false,
      n_a_reason: null,
      updated_at: new Date().toISOString()
    });
  }

  if (questionIdsToClear.length) {
    const { error } = await service
      .from('assessment_answers')
      .delete()
      .eq('assessment_id', assessment.id)
      .in('question_id', questionIdsToClear);

    if (error) return { ok: false as const, status: 500, errors: [error.message] };
  }

  if (rowsToUpsert.length) {
    const { error } = await service
      .from('assessment_answers')
      .upsert(rowsToUpsert, { onConflict: 'assessment_id,question_id' });

    if (error) return { ok: false as const, status: 500, errors: [error.message] };
  }

  const exposureRowsToUpsert = [];
  for (const exposureAnswer of payload.exposureAnswers ?? []) {
    const factor = exposureFactorsById.get(exposureAnswer.exposureFactorId);
    if (!factor) {
      return { ok: false as const, status: 400, errors: [`Unknown exposure factor: ${exposureAnswer.exposureFactorId}`] };
    }

    const option = factor.options.find((item) => item.value === exposureAnswer.selectedValue);
    if (!option) {
      return { ok: false as const, status: 400, errors: [`Invalid exposure option for ${factor.factorCode}.`] };
    }

    if (Number(option.points) !== Number(exposureAnswer.pointsAwarded)) {
      return { ok: false as const, status: 400, errors: [`Exposure points do not match approved option for ${factor.factorCode}.`] };
    }

    exposureRowsToUpsert.push({
      assessment_id: assessment.id,
      exposure_factor_id: exposureAnswer.exposureFactorId,
      raw_value_json: {
        selectedValue: option.value,
        selectedLabel: option.label
      },
      points_awarded: option.points,
      updated_at: new Date().toISOString()
    });
  }

  if (exposureRowsToUpsert.length) {
    const { error } = await service
      .from('exposure_answers')
      .upsert(exposureRowsToUpsert, { onConflict: 'assessment_id,exposure_factor_id' });

    if (error) return { ok: false as const, status: 500, errors: [error.message] };
  }

  const current = await loadAssessmentAnswers(assessment.id);
  const progress = calculateAssessmentProgress({
    domains,
    exposureFactors,
    answers: current.answers,
    exposureAnswers: current.exposureAnswers
  });

  await service.from('audit_logs').insert({
    actor_type: 'respondent_token',
    assessment_id: assessment.id,
    entity_table: 'assessment_answers',
    entity_id: assessment.id,
    action: 'assessment_draft_saved',
    after_json: {
      assessment_reference: payload.assessmentReference,
      answers_saved: rowsToUpsert.length,
      answers_cleared: questionIdsToClear.length,
      exposure_answers_saved: exposureRowsToUpsert.length,
      progress_pct: progress.overallPct
    }
  });

  return { ok: true as const, progress };
}

export async function submitAssessment(payload: { assessmentReference: string; token: string }) {
  const tokenValidation = await validateResumeToken({
    assessmentReference: payload.assessmentReference,
    rawToken: payload.token,
    consume: false
  });

  if (!tokenValidation.ok) return { ok: false as const, status: 403, errors: [tokenValidation.reason] };

  const service = createSupabaseServiceClient();
  const assessment = tokenValidation.assessment;
  if (assessment.status !== 'draft' || assessment.locked_at || assessment.submitted_at) {
    return { ok: false as const, status: 403, errors: ['assessment_locked'] };
  }

  const { domains, exposureFactors } = await loadAssessmentMethodology(assessment.methodology_version_id);
  const current = await loadAssessmentAnswers(assessment.id);
  const progress = calculateAssessmentProgress({
    domains,
    exposureFactors,
    answers: current.answers,
    exposureAnswers: current.exposureAnswers
  });

  const exposureSelectionMap: ExposureSelectionMap = Object.fromEntries(
    current.exposureAnswers.map((answer) => [answer.factorCode, answer.selectedValue])
  );

  const answerByQuestionId = new Map(current.answers.map((answer) => [answer.questionId, answer]));
  const errors: string[] = [];

  if (progress.answeredExposureFactors < progress.totalExposureFactors) {
    errors.push(`Complete the exposure profile (${progress.answeredExposureFactors}/${progress.totalExposureFactors}).`);
  }

  for (const domain of domains) {
    const missingQuestions: string[] = [];
    for (const question of domain.questions) {
      const answer = answerByQuestionId.get(question.id);
      if (!answer) {
        missingQuestions.push(question.questionCode);
        continue;
      }

      if (answer.isNotApplicable) {
        const eligibility = evaluateNAEligibility(question, exposureSelectionMap);
        if (!eligibility.allowed) {
          errors.push(`${question.questionCode} cannot be submitted as N/A: ${eligibility.reason}`);
        }
        if (!answer.nAReason || answer.nAReason.trim().length < 5) {
          errors.push(`${question.questionCode} requires an N/A reason of at least 5 characters.`);
        }
        continue;
      }

      const responseValue = answer.responseValue;
      if (responseValue === null || !Number.isInteger(responseValue) || responseValue < 0 || responseValue > 5) {
        errors.push(`${question.questionCode} requires a scored response from 0 to 5.`);
      }
    }

    if (missingQuestions.length) {
      errors.push(`Complete ${domain.domainCode}: ${missingQuestions.join(', ')}.`);
    }
  }

  if (errors.length) return { ok: false as const, status: 400, errors: [...new Set(errors)], progress };

  const now = new Date().toISOString();
  const { error } = await service
    .from('assessments')
    .update({
      status: 'submitted',
      submitted_at: now,
      locked_at: now
    })
    .eq('id', assessment.id)
    .eq('status', 'draft')
    .is('locked_at', null)
    .is('submitted_at', null);

  if (error) return { ok: false as const, status: 500, errors: [error.message] };

  await Promise.all([
    service
      .from('assessment_tokens')
      .update({ revoked_at: now })
      .eq('assessment_id', assessment.id)
      .eq('token_type', 'resume')
      .is('revoked_at', null),
    service.from('audit_logs').insert({
      actor_type: 'respondent_token',
      assessment_id: assessment.id,
      entity_table: 'assessments',
      entity_id: assessment.id,
      action: 'assessment_submitted_phase5_no_scoring',
      after_json: {
        assessment_reference: payload.assessmentReference,
        methodology_version_id: assessment.methodology_version_id,
        progress_pct: progress.overallPct,
        scoring_triggered: false
      }
    })
  ]);

  return {
    ok: true as const,
    assessmentReference: payload.assessmentReference,
    status: 'submitted',
    submittedAt: now,
    progress
  };
}

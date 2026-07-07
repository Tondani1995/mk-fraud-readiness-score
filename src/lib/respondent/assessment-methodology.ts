import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type {
  AssessmentProgress,
  ExposureFactor,
  ExposureFactorOption,
  MethodologyDomain,
  MethodologyQuestion,
  ResponseScaleOption,
  SavedAssessmentAnswer,
  SavedExposureAnswer
} from '@/lib/types/domain';

type RawDomain = {
  id: string;
  domain_code: string;
  name: string;
  weight_pct: number | string;
  domain_type: string;
  is_core: boolean;
  sort_order: number;
};

type RawQuestion = {
  id: string;
  question_code: string;
  domain_id: string;
  prompt: string;
  help_text: string | null;
  weight: number | string;
  is_critical: boolean;
  is_hard_gate: boolean;
  n_a_allowed: boolean;
  n_a_rule_key: string | null;
  trigger_key: string | null;
  sort_order: number;
};

type RawResponseScale = {
  response_value: number;
  label: string;
  operational_meaning: string | null;
  normalised_score: number | string;
  display_order: number;
};

type RawExposureFactor = {
  id: string;
  factor_code: string;
  name: string;
  max_points: number | string;
  input_type: string;
  options_json: { options?: ExposureFactorOption[] } | null;
  sort_order: number;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

export async function loadAssessmentMethodology(methodologyVersionId: string) {
  const service = createSupabaseServiceClient();

  const [{ data: scale, error: scaleError }, { data: domains, error: domainsError }, { data: questions, error: questionsError }, { data: exposureFactors, error: exposureError }] =
    await Promise.all([
      service
        .from('response_scale')
        .select('response_value,label,operational_meaning,normalised_score,display_order')
        .eq('methodology_version_id', methodologyVersionId)
        .order('display_order', { ascending: true }),
      service
        .from('domains')
        .select('id,domain_code,name,weight_pct,domain_type,is_core,sort_order')
        .eq('methodology_version_id', methodologyVersionId)
        .order('sort_order', { ascending: true }),
      service
        .from('questions')
        .select('id,question_code,domain_id,prompt,help_text,weight,is_critical,is_hard_gate,n_a_allowed,n_a_rule_key,trigger_key,sort_order')
        .eq('methodology_version_id', methodologyVersionId)
        .eq('active', true)
        .order('sort_order', { ascending: true }),
      service
        .from('exposure_factors')
        .select('id,factor_code,name,max_points,input_type,options_json,sort_order')
        .eq('methodology_version_id', methodologyVersionId)
        .order('sort_order', { ascending: true })
    ]);

  if (scaleError) throw scaleError;
  if (domainsError) throw domainsError;
  if (questionsError) throw questionsError;
  if (exposureError) throw exposureError;

  const rawDomains = (domains ?? []) as RawDomain[];
  const rawQuestions = (questions ?? []) as RawQuestion[];

  const questionsByDomain = new Map<string, MethodologyQuestion[]>();
  const domainCodeById = new Map<string, { code: string; name: string }>();

  rawDomains.forEach((domain) => {
    domainCodeById.set(domain.id, { code: domain.domain_code, name: domain.name });
    questionsByDomain.set(domain.id, []);
  });

  rawQuestions.forEach((question) => {
    const domain = domainCodeById.get(question.domain_id);
    if (!domain) return;

    const mappedQuestion: MethodologyQuestion = {
      id: question.id,
      questionCode: question.question_code,
      domainCode: domain.code,
      domainName: domain.name,
      prompt: question.prompt,
      helpText: question.help_text,
      weight: toNumber(question.weight),
      isCritical: question.is_critical,
      isHardGate: question.is_hard_gate,
      nAAllowed: question.n_a_allowed,
      nARuleKey: question.n_a_rule_key,
      triggerKey: question.trigger_key,
      sortOrder: question.sort_order
    };

    questionsByDomain.get(question.domain_id)?.push(mappedQuestion);
  });

  const mappedDomains: MethodologyDomain[] = rawDomains.map((domain) => ({
    id: domain.id,
    domainCode: domain.domain_code,
    name: domain.name,
    weightPct: toNumber(domain.weight_pct),
    domainType: domain.domain_type,
    isCore: domain.is_core,
    sortOrder: domain.sort_order,
    questions: questionsByDomain.get(domain.id) ?? []
  }));

  const mappedScale: ResponseScaleOption[] = ((scale ?? []) as RawResponseScale[]).map((option) => ({
    responseValue: option.response_value,
    label: option.label,
    operationalMeaning: option.operational_meaning,
    normalisedScore: toNumber(option.normalised_score)
  }));

  const mappedExposureFactors: ExposureFactor[] = ((exposureFactors ?? []) as RawExposureFactor[]).map((factor) => ({
    id: factor.id,
    factorCode: factor.factor_code,
    name: factor.name,
    maxPoints: toNumber(factor.max_points),
    inputType: factor.input_type,
    options: Array.isArray(factor.options_json?.options) ? factor.options_json.options : [],
    sortOrder: factor.sort_order
  }));

  return {
    domains: mappedDomains,
    responseScale: mappedScale,
    exposureFactors: mappedExposureFactors
  };
}

export async function loadAssessmentAnswers(assessmentId: string) {
  const service = createSupabaseServiceClient();

  const [{ data: answers, error: answersError }, { data: exposureAnswers, error: exposureAnswersError }] = await Promise.all([
    service
      .from('assessment_answers')
      .select('question_id,questions(question_code),response_value,is_not_applicable,n_a_reason')
      .eq('assessment_id', assessmentId),
    service
      .from('exposure_answers')
      .select('exposure_factor_id,exposure_factors(factor_code),raw_value_json,points_awarded')
      .eq('assessment_id', assessmentId)
  ]);

  if (answersError) throw answersError;
  if (exposureAnswersError) throw exposureAnswersError;

  const mappedAnswers: SavedAssessmentAnswer[] = (answers ?? []).map((answer: any) => ({
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
    pointsAwarded: toNumber(answer.points_awarded)
  }));

  return { answers: mappedAnswers, exposureAnswers: mappedExposureAnswers };
}

export function calculateAssessmentProgress(input: {
  domains: MethodologyDomain[];
  answers: SavedAssessmentAnswer[];
  exposureFactors: ExposureFactor[];
  exposureAnswers: SavedExposureAnswer[];
}): AssessmentProgress {
  const completedQuestionIds = new Set(
    input.answers
      .filter((answer) => {
        if (answer.isNotApplicable) return (answer.nAReason?.trim().length ?? 0) >= 5;
        return typeof answer.responseValue === 'number';
      })
      .map((answer) => answer.questionId)
  );

  const completedExposureIds = new Set(
    input.exposureAnswers
      .filter((answer) => Boolean(answer.selectedValue))
      .map((answer) => answer.exposureFactorId)
  );

  const totalQuestions = input.domains.reduce((sum, domain) => sum + domain.questions.length, 0);
  const answeredQuestions = completedQuestionIds.size;
  const totalExposureFactors = input.exposureFactors.length;
  const answeredExposureFactors = completedExposureIds.size;
  const totalItems = totalQuestions + totalExposureFactors;
  const answeredItems = answeredQuestions + answeredExposureFactors;

  return {
    totalQuestions,
    answeredQuestions,
    totalExposureFactors,
    answeredExposureFactors,
    overallPct: totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0,
    domainProgress: input.domains.map((domain) => {
      const answered = domain.questions.filter((question) => completedQuestionIds.has(question.id)).length;
      const total = domain.questions.length;
      return {
        domainCode: domain.domainCode,
        name: domain.name,
        answeredQuestions: answered,
        totalQuestions: total,
        pct: total > 0 ? Math.round((answered / total) * 100) : 0
      };
    })
  };
}

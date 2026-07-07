import type {
  ExposureBand,
  MaturityBand,
  MethodologyDomain,
  MethodologyQuestion,
  SavedAssessmentAnswer,
  SavedExposureAnswer
} from '@/lib/types/domain';

export type ScoreRunSummary = {
  overallScore: number | null;
  calculatedMaturity: MaturityBand | null;
  finalMaturity: MaturityBand | null;
  exposureScore: number;
  exposureBand: ExposureBand;
  coveragePct: number;
  nARatePct: number;
  criticalGapCount: number;
  majorGapCount: number;
  capApplied: boolean;
  capReason: string | null;
  status: 'scorable' | 'incomplete';
  flags: string[];
};

export type DomainScoreTrace = {
  domainId: string;
  domainCode: string;
  domainName: string;
  domainWeightPct: number;
  isCore: boolean;
  rawScore: number | null;
  weightedContribution: number | null;
  coveragePct: number;
  criticalGapCount: number;
  flags: string[];
};

export type QuestionScoreTrace = {
  questionId: string;
  questionCode: string;
  domainCode: string;
  answerId?: string | null;
  responseValue: number | null;
  normalisedScore: number | null;
  questionWeight: number;
  applicable: boolean;
  numeratorContribution: number;
  denominatorContribution: number;
  isCriticalGap: boolean;
  isMajorGap: boolean;
  triggeredRules: string[];
};

export type MaturityCapEventTrace = {
  ruleCode: string;
  capTo: MaturityBand;
  reason: string;
  relatedQuestionId?: string | null;
  relatedDomainId?: string | null;
};

export type ScoringResult = {
  summary: ScoreRunSummary;
  domainResults: DomainScoreTrace[];
  questionTraces: QuestionScoreTrace[];
  maturityCapEvents: MaturityCapEventTrace[];
};

type AnswerWithOptionalId = SavedAssessmentAnswer & { answerId?: string | null };

type ScoringInput = {
  domains: MethodologyDomain[];
  answers: AnswerWithOptionalId[];
  exposureAnswers: SavedExposureAnswer[];
};

const MATURITY_RANK: Record<MaturityBand, number> = {
  Reactive: 0,
  Developing: 1,
  Structured: 2,
  Strategic: 3
};

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normaliseResponse(responseValue: number): number {
  return round((responseValue / 5) * 100, 2);
}

function maturityForScore(score: number): MaturityBand {
  if (score < 40) return 'Reactive';
  if (score < 60) return 'Developing';
  if (score < 80) return 'Structured';
  return 'Strategic';
}

function exposureBandForScore(score: number): ExposureBand {
  if (score <= 25) return 'Low';
  if (score <= 50) return 'Moderate';
  if (score <= 75) return 'High';
  return 'Severe';
}

function stricterMaturity(current: MaturityBand, cap: MaturityBand): MaturityBand {
  return MATURITY_RANK[cap] < MATURITY_RANK[current] ? cap : current;
}

function applyCap(input: {
  currentFinal: MaturityBand;
  events: MaturityCapEventTrace[];
  ruleCode: string;
  capTo: MaturityBand;
  reason: string;
  relatedQuestionId?: string | null;
  relatedDomainId?: string | null;
}): MaturityBand {
  input.events.push({
    ruleCode: input.ruleCode,
    capTo: input.capTo,
    reason: input.reason,
    relatedQuestionId: input.relatedQuestionId ?? null,
    relatedDomainId: input.relatedDomainId ?? null
  });
  return stricterMaturity(input.currentFinal, input.capTo);
}

function buildQuestionList(domains: MethodologyDomain[]): MethodologyQuestion[] {
  return domains.flatMap((domain) => domain.questions);
}

export function calculateFraudReadinessScore(input: ScoringInput): ScoringResult {
  const questions = buildQuestionList(input.domains);
  const answersByQuestionId = new Map(input.answers.map((answer) => [answer.questionId, answer]));
  const questionTraces: QuestionScoreTrace[] = [];
  const domainResults: DomainScoreTrace[] = [];
  const maturityCapEvents: MaturityCapEventTrace[] = [];
  const flags = new Set<string>();

  let completedCount = 0;
  let nACount = 0;
  let criticalGapCount = 0;
  let majorGapCount = 0;

  for (const domain of input.domains) {
    let numerator = 0;
    let denominator = 0;
    let completedInDomain = 0;
    let criticalGapsInDomain = 0;
    const domainFlags = new Set<string>();

    for (const question of domain.questions) {
      const answer = answersByQuestionId.get(question.id);
      const triggeredRules: string[] = [];

      if (!answer) {
        triggeredRules.push('missing_answer');
        flags.add('missing_answer');
        domainFlags.add('missing_answer');
        questionTraces.push({
          questionId: question.id,
          questionCode: question.questionCode,
          domainCode: domain.domainCode,
          answerId: null,
          responseValue: null,
          normalisedScore: null,
          questionWeight: question.weight,
          applicable: true,
          numeratorContribution: 0,
          denominatorContribution: question.weight,
          isCriticalGap: false,
          isMajorGap: false,
          triggeredRules
        });
        continue;
      }

      if (answer.isNotApplicable) {
        completedCount += 1;
        completedInDomain += 1;
        nACount += 1;
        triggeredRules.push('valid_not_applicable_excluded_from_score');
        questionTraces.push({
          questionId: question.id,
          questionCode: question.questionCode,
          domainCode: domain.domainCode,
          answerId: answer.answerId ?? null,
          responseValue: null,
          normalisedScore: null,
          questionWeight: question.weight,
          applicable: false,
          numeratorContribution: 0,
          denominatorContribution: 0,
          isCriticalGap: false,
          isMajorGap: false,
          triggeredRules
        });
        continue;
      }

      const responseValue = answer.responseValue;
      if (responseValue === null || !Number.isInteger(responseValue) || responseValue < 0 || responseValue > 5) {
        triggeredRules.push('invalid_response');
        flags.add('invalid_response');
        domainFlags.add('invalid_response');
        questionTraces.push({
          questionId: question.id,
          questionCode: question.questionCode,
          domainCode: domain.domainCode,
          answerId: answer.answerId ?? null,
          responseValue,
          normalisedScore: null,
          questionWeight: question.weight,
          applicable: true,
          numeratorContribution: 0,
          denominatorContribution: question.weight,
          isCriticalGap: false,
          isMajorGap: false,
          triggeredRules
        });
        continue;
      }

      completedCount += 1;
      completedInDomain += 1;
      const normalisedScore = normaliseResponse(responseValue);
      const numeratorContribution = normalisedScore * question.weight;
      const denominatorContribution = question.weight;
      numerator += numeratorContribution;
      denominator += denominatorContribution;

      const isCriticalGap = question.isCritical && responseValue <= 2;
      const isMajorGap = question.isHardGate && responseValue <= 1;

      if (isCriticalGap) {
        criticalGapCount += 1;
        criticalGapsInDomain += 1;
        triggeredRules.push('critical_gap_response_lte_2');
      }

      if (isMajorGap) {
        majorGapCount += 1;
        triggeredRules.push('major_hard_gate_gap_response_lte_1');
      }

      if (question.isHardGate && responseValue === 2) {
        triggeredRules.push('hard_gate_gap_response_eq_2');
      }

      questionTraces.push({
        questionId: question.id,
        questionCode: question.questionCode,
        domainCode: domain.domainCode,
        answerId: answer.answerId ?? null,
        responseValue,
        normalisedScore,
        questionWeight: question.weight,
        applicable: true,
        numeratorContribution: round(numeratorContribution, 4),
        denominatorContribution: round(denominatorContribution, 4),
        isCriticalGap,
        isMajorGap,
        triggeredRules
      });
    }

    const domainCoveragePct = domain.questions.length > 0 ? round((completedInDomain / domain.questions.length) * 100, 2) : 0;
    const rawScore = denominator > 0 ? round(numerator / denominator, 2) : null;

    if (domainCoveragePct < 70) domainFlags.add('domain_coverage_below_70');
    if (rawScore !== null && domain.isCore && rawScore < 40) domainFlags.add('core_domain_below_40');
    if (rawScore !== null && domain.isCore && rawScore < 60) domainFlags.add('core_domain_below_60');

    domainResults.push({
      domainId: domain.id,
      domainCode: domain.domainCode,
      domainName: domain.name,
      domainWeightPct: domain.weightPct,
      isCore: domain.isCore,
      rawScore,
      weightedContribution: rawScore === null ? null : round(rawScore * (domain.weightPct / 100), 4),
      coveragePct: domainCoveragePct,
      criticalGapCount: criticalGapsInDomain,
      flags: [...domainFlags]
    });
  }

  const totalQuestions = questions.length;
  const coveragePct = totalQuestions > 0 ? round((completedCount / totalQuestions) * 100, 2) : 0;
  const nARatePct = totalQuestions > 0 ? round((nACount / totalQuestions) * 100, 2) : 0;
  const exposureScore = round(input.exposureAnswers.reduce((sum, answer) => sum + Number(answer.pointsAwarded ?? 0), 0), 2);
  const exposureBand = exposureBandForScore(exposureScore);

  if (coveragePct < 80) flags.add('assessment_coverage_below_80');
  if (coveragePct >= 80 && coveragePct < 90) flags.add('assessment_coverage_80_89_provisional');
  if (nARatePct > 20) flags.add('n_a_rate_above_20_admin_review');

  if (coveragePct < 80 || flags.has('missing_answer') || flags.has('invalid_response')) {
    return {
      summary: {
        overallScore: null,
        calculatedMaturity: null,
        finalMaturity: null,
        exposureScore,
        exposureBand,
        coveragePct,
        nARatePct,
        criticalGapCount,
        majorGapCount,
        capApplied: false,
        capReason: 'Assessment is incomplete or contains invalid responses.',
        status: 'incomplete',
        flags: [...flags]
      },
      domainResults,
      questionTraces,
      maturityCapEvents
    };
  }

  const scoredDomains = domainResults.filter((domain) => domain.rawScore !== null);
  const totalDomainWeight = scoredDomains.reduce((sum, domain) => sum + domain.domainWeightPct, 0);
  const overallScore = totalDomainWeight > 0
    ? round(scoredDomains.reduce((sum, domain) => sum + Number(domain.rawScore) * domain.domainWeightPct, 0) / totalDomainWeight, 2)
    : null;

  if (overallScore === null) {
    flags.add('no_scorable_domains');
    return {
      summary: {
        overallScore: null,
        calculatedMaturity: null,
        finalMaturity: null,
        exposureScore,
        exposureBand,
        coveragePct,
        nARatePct,
        criticalGapCount,
        majorGapCount,
        capApplied: false,
        capReason: 'No scorable domains remain after applicability exclusions.',
        status: 'incomplete',
        flags: [...flags]
      },
      domainResults,
      questionTraces,
      maturityCapEvents
    };
  }

  const calculatedMaturity = maturityForScore(overallScore);
  let finalMaturity = calculatedMaturity;

  const hardGateMajorQuestions = questionTraces.filter((trace) => trace.triggeredRules.includes('major_hard_gate_gap_response_lte_1'));
  if (hardGateMajorQuestions.length > 0) {
    finalMaturity = applyCap({
      currentFinal: finalMaturity,
      events: maturityCapEvents,
      ruleCode: 'any_hard_gate_critical_control_lte_1',
      capTo: 'Developing',
      reason: 'One or more hard-gate critical controls scored 0 or 1.',
      relatedQuestionId: hardGateMajorQuestions[0].questionId
    });
  }

  const hardGateScoreTwoQuestions = questionTraces.filter((trace) => trace.triggeredRules.includes('hard_gate_gap_response_eq_2'));
  if (hardGateScoreTwoQuestions.length > 0) {
    finalMaturity = applyCap({
      currentFinal: finalMaturity,
      events: maturityCapEvents,
      ruleCode: 'any_hard_gate_critical_control_eq_2',
      capTo: 'Structured',
      reason: 'One or more hard-gate critical controls scored 2.',
      relatedQuestionId: hardGateScoreTwoQuestions[0].questionId
    });
  }

  if (criticalGapCount >= 3) {
    finalMaturity = applyCap({
      currentFinal: finalMaturity,
      events: maturityCapEvents,
      ruleCode: 'three_or_more_critical_controls_lte_2',
      capTo: 'Developing',
      reason: 'Three or more critical controls scored 0, 1 or 2.'
    });
  }

  const coreDomainBelow40 = domainResults.find((domain) => domain.isCore && domain.rawScore !== null && domain.rawScore < 40);
  if (coreDomainBelow40) {
    finalMaturity = applyCap({
      currentFinal: finalMaturity,
      events: maturityCapEvents,
      ruleCode: 'any_core_domain_below_40',
      capTo: 'Developing',
      reason: `Core domain ${coreDomainBelow40.domainCode} scored below 40.`,
      relatedDomainId: coreDomainBelow40.domainId
    });
  }

  const coreDomainBelow60 = domainResults.find((domain) => domain.isCore && domain.rawScore !== null && domain.rawScore < 60);
  if (coreDomainBelow60) {
    finalMaturity = applyCap({
      currentFinal: finalMaturity,
      events: maturityCapEvents,
      ruleCode: 'any_core_domain_below_60',
      capTo: 'Structured',
      reason: `Core domain ${coreDomainBelow60.domainCode} scored below 60.`,
      relatedDomainId: coreDomainBelow60.domainId
    });
  }

  const capApplied = finalMaturity !== calculatedMaturity;
  const capReason = capApplied ? maturityCapEvents.map((event) => event.reason).join(' ') : null;

  return {
    summary: {
      overallScore,
      calculatedMaturity,
      finalMaturity,
      exposureScore,
      exposureBand,
      coveragePct,
      nARatePct,
      criticalGapCount,
      majorGapCount,
      capApplied,
      capReason,
      status: 'scorable',
      flags: [...flags]
    },
    domainResults,
    questionTraces,
    maturityCapEvents
  };
}

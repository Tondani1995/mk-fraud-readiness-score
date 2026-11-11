import { calculateFraudReadinessScore } from './scoring-engine';

/**
 * Methodology-version dispatch.
 *
 * Every score run is calculated by the calculator of its own methodology family, and only that one:
 *   mfrs-fixed      the fixed MFRS question set (`calculateFraudReadinessScore`). `score-assessment.ts` is protected by
 *                   the integrity guard and still calls the calculator directly; routing it through this dispatch is a
 *                   one-line change held for MK's integrity exception (docs/readiness-review/patches/), with parity
 *                   proven against results pinned at 3f933ac;
 *   mfrs-adaptive   the adaptive MFRS graph, scored inside `scoreAdaptiveSubmittedAssessment` against the graph and
 *                   methodology version the assessment is pinned to (unchanged; it never reaches revised code);
 *   revised-review  the revised assessment (review engine bank 1.3). No calculator is approved, so dispatch refuses it.
 *
 * Historical MFRS runs keep their own methodology version and calculator. Nothing here changes a weight, band, cap or
 * threshold, and the revised family stays inactive until MK approves a method and its release gates are met.
 */
export type MethodologyFamily = 'mfrs-fixed' | 'mfrs-adaptive' | 'revised-review';

export const REVISED_METHODOLOGY_STATUS = {
  active: false,
  reason: 'No revised scoring method is approved by MK. The revised family is registered so that it can never fall through to an MFRS calculator, and it refuses to score.'
} as const;

export class RevisedMethodologyInactive extends Error {}

/** The family a run belongs to: a review-engine ruleset means the revised assessment; an adaptive graph pin means MFRS adaptive. */
export function methodologyFamilyFor(input: { reviewRuleset?: { engine?: { build?: string } } | null; graphVersionId?: string | null }): MethodologyFamily {
  if (input.reviewRuleset) return 'revised-review';
  return input.graphVersionId ? 'mfrs-adaptive' : 'mfrs-fixed';
}

type FixedInput = Parameters<typeof calculateFraudReadinessScore>[0];

export function dispatchFixedScoring(family: MethodologyFamily, input: FixedInput) {
  if (family === 'revised-review') throw new RevisedMethodologyInactive(REVISED_METHODOLOGY_STATUS.reason);
  if (family !== 'mfrs-fixed') throw new Error(`The ${family} family is not scored through the fixed MFRS path.`);
  return calculateFraudReadinessScore(input);
}

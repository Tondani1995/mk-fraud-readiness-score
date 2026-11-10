import REVIEW, { type EngineInstance } from './vendor/review-engine-build-1.5.cjs';
import bank from './data/bank-v1.3.json' with { type: 'json' };
import coverage from './data/coverage-map-v1.3.json' with { type: 'json' };
import { READINESS_REVIEW_CONTRACT } from './contract';

export type { EngineInstance, EngineQuestion, EngineStep } from './vendor/review-engine-build-1.5.cjs';

/**
 * A controllable clock. The engine stamps every record with `now()`. During replay the clock is set to each stored
 * action's own time, so a rebuilt session carries exactly the timestamps of the original one.
 */
export type ReviewClock = { now: string };

export function createReviewEngine(clock: ReviewClock): EngineInstance {
  return REVIEW.create(bank, coverage, {
    ceiling: READINESS_REVIEW_CONTRACT.respondentScreenLimit,
    followups: 2,
    now: () => clock.now
  });
}

export const REVIEW_BANK = bank as unknown as {
  bankVersion: string;
  profile: { modules: { questions: { id: string; text: string; options: [string, string][] }[] }[] };
  domains: { id: string; name: string; covers?: string; bank: { modules: { id: string; name: string; purpose?: string; owner?: string; questions: { id: string }[] }[] } }[];
};

export const REVIEW_COVERAGE = coverage as unknown as {
  scenarios: { id: string; name: string; tier: number; domain: string; how?: string; why?: string }[];
};

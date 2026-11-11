import REVIEW, { type EngineInstance } from './vendor/review-engine-build-1.5.cjs';
import bank from './data/bank-v1.3.json' with { type: 'json' };
import coverage from './data/coverage-map-v1.3.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { READINESS_REVIEW_CONTRACT } from './contract';

export type { EngineInstance, EngineQuestion, EngineStep } from './vendor/review-engine-build-1.5.cjs';

/**
 * A controllable clock. The engine stamps every record with `now()`. During replay the clock is set to each stored
 * action's own time, so a rebuilt session carries exactly the timestamps of the original one.
 */
export type ReviewClock = { now: string };

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Digests of the bank and coverage map this build actually loaded, compared with the contract once per process. */
export const LOADED_RULESET = {
  bankVersion: (bank as { bankVersion?: string }).bankVersion ?? null,
  bankDigest: digest(bank),
  coverageVersion: (coverage as { version?: string }).version ?? null,
  coverageDigest: digest(coverage)
};

/** Null when the loaded data is the data the contract declares; otherwise why the review track must not run. */
export function loadedRulesetProblem(): string | null {
  const c = READINESS_REVIEW_CONTRACT;
  if (LOADED_RULESET.bankDigest !== c.bank.digest || LOADED_RULESET.bankVersion !== c.bank.version) return 'The loaded question bank does not match the declared contract.';
  if (LOADED_RULESET.coverageDigest !== c.coverage.digest || LOADED_RULESET.coverageVersion !== c.coverage.version) return 'The loaded coverage map does not match the declared contract.';
  return null;
}

/** The engine's own vocabulary: every practice class it records, and the classes it treats as a reported gap. */
export const REVIEW_PRACTICE_CLASSES: readonly string[] = REVIEW.CLASSES;
export const REVIEW_ISSUE_CLASSES: readonly string[] = REVIEW.ISSUE;

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

import REVIEW, { type EngineInstance } from './vendor/review-engine-build-1.5.cjs';
import REVIEW16, { type StagedEngineInstance } from './vendor/review-engine-build-1.6.cjs';
import bank from './data/bank-v1.3.json' with { type: 'json' };
import coverage from './data/coverage-map-v1.3.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { READINESS_REVIEW_CONTRACT } from './contract';

export type { EngineInstance, EngineQuestion, EngineStep } from './vendor/review-engine-build-1.5.cjs';
export type { StagedEngineInstance, DepthCandidate, DepthSelection } from './vendor/review-engine-build-1.6.cjs';

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

/** Build 1.5 unless a session is bound to build 1.6 (staged completion, fictional harness only). */
export function createReviewEngine(clock: ReviewClock, build: string = '1.5'): EngineInstance {
  if (build === READINESS_REVIEW_CONTRACT.stagedBuild.engine.build) return REVIEW16.create(bank, coverage, { now: () => clock.now });
  if (build !== READINESS_REVIEW_CONTRACT.engine.build) throw new Error(`No review engine build ${build}`);
  return REVIEW.create(bank, coverage, {
    ceiling: READINESS_REVIEW_CONTRACT.respondentScreenLimit,
    followups: 2,
    now: () => clock.now
  });
}

export function isStagedEngine(e: EngineInstance): e is StagedEngineInstance {
  return (e as Partial<StagedEngineInstance>).build === '1.6';
}

export const REVIEW_BANK = bank as unknown as {
  bankVersion: string;
  profile: { modules: { questions: { id: string; text: string; options: [string, string][] }[] }[] };
  domains: { id: string; name: string; covers?: string; bank: { modules: { id: string; name: string; purpose?: string; owner?: string; questions: { id: string }[] }[] } }[];
};

export const REVIEW_COVERAGE = coverage as unknown as {
  scenarios: { id: string; name: string; tier: number; domain: string; how?: string; why?: string }[];
};

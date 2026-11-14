import type { RevisedReport } from './evidence-model';
import { scenarioAccount } from './position';

/**
 * The MK Fraud Readiness score (owner decision DR-02, 14 November 2026). A percentage from 0 to 100, on the
 * organisation's own answers, across the fraud scenarios that apply to it:
 *
 *   (1) unknown and unanswered core answers are left out: scenarios whose core answers are outstanding, or that the
 *       interview did not reach, are not counted;
 *   (2) scenarios whose applicability is still outstanding do not count, and nor do scenarios the method does not ask
 *       about at the organisation's size (they do not apply);
 *   (3) a scenario whose core controls are all reported in place earns full credit; with a related practice reported
 *       weaker it earns three-quarters; where the answers are contradicted it earns half; a core control reported as a
 *       gap earns nothing.
 *
 * Contradicted means every scenario the shared account describes as "the answers raise a question or cannot both be
 * right": a direct contradiction, a control that lacks an input it needs, and a question to clarify. They are grouped
 * because the report presents them as one category; the credit for each is one constant below.
 *
 * The score is never a readiness label: no band, level or pass mark is attached to it, and no report says an
 * organisation is ready (DR-02 point 5).
 */
export const REVISED_SCORE_VERSION = 'mk-fraud-readiness-score-1.0';

export const SCORE_CREDIT = {
  confirmed: 1,
  qualified: 0.75,
  contradiction: 0.5,
  dependency: 0.5,
  clarify: 0.5,
  gap: 0
} as const;

export type RevisedScore = {
  version: string;
  /** Whole-number percentage, 0 to 100. */
  percent: number;
  /** Unrounded, for the audit record. */
  exact: number;
  /** Scenarios that apply (the account's applicable count). */
  applicable: number;
  /** Scenarios counted in the score: those with every core answer known. */
  counted: number;
  /** Scenarios that apply but are not counted: core answers outstanding, or not reached in the interview. */
  notCounted: number;
  /** Questions outstanding (the Fact Pack's N-OUTSTANDING). */
  outstandingQuestions: number;
  credit: number;
  byKind: Record<keyof typeof SCORE_CREDIT, number>;
};

/** The score, or null when no scenario can be counted (no score can be stated, so no report is produced). */
export function revisedScore(r: RevisedReport): RevisedScore | null {
  const acct = scenarioAccount(r);
  if (!acct.balanced) throw new Error('scenario_account_unbalanced');
  const k = r.summary.byKind as Record<string, number>;
  const byKind = Object.fromEntries((Object.keys(SCORE_CREDIT) as (keyof typeof SCORE_CREDIT)[]).map((kind) => [kind, k[kind] ?? 0])) as RevisedScore['byKind'];
  const counted = Object.values(byKind).reduce((n, v) => n + v, 0);
  // The counted scenarios are exactly the account's reported-in-place and gap scenarios; anything else is a defect.
  if (counted !== acct.reportedInPlace + acct.gap) throw new Error('score_partition_mismatch');
  if (counted === 0) return null;
  const credit = (Object.keys(SCORE_CREDIT) as (keyof typeof SCORE_CREDIT)[]).reduce((n, kind) => n + byKind[kind] * SCORE_CREDIT[kind], 0);
  const exact = (100 * credit) / counted;
  return {
    version: REVISED_SCORE_VERSION, percent: Math.round(exact), exact: Number(exact.toFixed(4)),
    applicable: acct.applicable, counted, notCounted: acct.outstanding + acct.notReached,
    outstandingQuestions: r.outstanding.length, credit, byKind
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The agreed conclusion wording (DR-02 point 7), filled for one organisation. */
export function scoreConclusion(organisation: string, s: RevisedScore): { heading: string; paragraph: string; outstanding: string | null } {
  const heading = `Where ${organisation} stands and what to address next`;
  const paragraph = `On its own answers, ${organisation} scores ${s.percent}% under the MK Fraud Readiness method, across the ${plural(s.applicable, 'fraud scenario that applies', 'fraud scenarios that apply')} to it. `
    + 'The score shows how far the core controls the organisation reports in place cover those scenarios. '
    + 'It is not a finding that the organisation is protected against fraud, and it does not confirm that any control operates as described, because nothing in this assessment was tested. '
    + 'The responses this report sets out first are where the score can move most directly.';
  // The agreed sentence names unanswered questions and the scenarios they hold back. Where scenarios are held back only
  // because the interview did not reach them, no question is unanswered, so the sentence names the reason instead.
  let outstanding: string | null = null;
  if (s.notCounted > 0 && s.outstandingQuestions > 0) {
    outstanding = `${plural(s.outstandingQuestions, 'question was', 'questions were')} not answered, so ${plural(s.notCounted, 'scenario is', 'scenarios are')} not yet counted; the score may change once they are settled.`;
  } else if (s.notCounted > 0) {
    outstanding = `${plural(s.notCounted, 'scenario was', 'scenarios were')} not reached in the interview, so ${s.notCounted === 1 ? 'it is' : 'they are'} not yet counted; the score may change once ${s.notCounted === 1 ? 'it is' : 'they are'} answered.`;
  }
  return { heading, paragraph, outstanding };
}

/**
 * The position statements of a scored report: the score replaces the fixture result, and the conclusion cell states
 * that no readiness label is issued. The inconsistencies and interpretation statements are unchanged.
 */
export function scoredPosition<T extends { key: string; label: string; value: string; text: string }>(statements: T[], s: RevisedScore): T[] {
  return statements.map((p) => {
    if (p.key === 'calculated') {
      return { ...p, label: 'Score', value: `${s.percent}%`,
        text: `Under the MK Fraud Readiness method, on the organisation's own answers, across the ${plural(s.counted, 'scenario', 'scenarios')} whose core answers are known${s.notCounted ? `; ${plural(s.notCounted, 'further scenario is', 'further scenarios are')} not yet counted` : ''}. It shows how far the core controls reported in place cover those scenarios. Nothing in this assessment was tested.` };
    }
    if (p.key === 'conclusion') {
      return { ...p, label: 'Readiness conclusion', value: 'No readiness label',
        text: 'MK does not label an organisation ready, and sets no band or pass mark. The score is not a finding that the organisation is protected against fraud, and it does not confirm that any control operates as described.' };
    }
    return p;
  });
}

/**
 * Coverage for sale and release (owner decision DR-04, 14 November 2026): a report can be sold and released with
 * answers outstanding only when at least half of the assessment is covered, measured on the same base as the score:
 * the applicable scenarios counted (every core answer known) out of the scenarios that apply.
 */
export const REPORT_COVERAGE_MINIMUM = 0.5;
export type ReportCoverage = { counted: number; applicable: number; share: number; meets: boolean };
export function reportCoverage(s: RevisedScore | null, applicableWhenUnscored = 0): ReportCoverage {
  const counted = s?.counted ?? 0;
  const applicable = s?.applicable ?? applicableWhenUnscored;
  const share = applicable > 0 ? counted / applicable : 0;
  return { counted, applicable, share: Number(share.toFixed(4)), meets: applicable > 0 && share >= REPORT_COVERAGE_MINIMUM };
}

/** The customer-facing reason a paid report cannot yet be requested. */
export function coverageShortfallMessage(c: ReportCoverage): string {
  return c.counted === 0
    ? 'A paid report needs complete answers for at least half of the fraud scenarios that apply, and none has complete answers yet. Answer the outstanding questions, then request the report again.'
    : `A paid report needs complete answers for at least half of the fraud scenarios that apply. ${c.counted} of ${c.applicable} have them now. Answer the outstanding questions, then request the report again.`;
}

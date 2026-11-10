/**
 * Versioned contract for the Fraud Readiness review track.
 *
 * The review track is separate from the scored adaptive assessment under src/lib/adaptive and src/lib/scoring. It
 * never produces a score, maturity band, confidence label or inferred control state. One ruleset decides what the
 * organisation reported, what is in scope, what is waiting for whom and what remains open: the vendored readiness
 * engine. Everything a person sees (interview, Snapshot, owner packages, reviewer workspace, management view, export
 * and API) is derived from that engine's report through src/lib/readiness-review/view-model.ts.
 *
 * Change control: any change to the engine, bank or coverage map changes a hash below, and the contract tests in
 * scripts/readiness-review-contract-tests.mjs fail until this file is updated deliberately. Any change to the shape of
 * an action, a view model or the export increments `version` and is recorded in docs/readiness-review/DATA-CONTRACT.md.
 */
export const READINESS_REVIEW_CONTRACT = {
  name: 'mk-readiness-review',
  /** Data contract for actions, view models and the export. */
  version: '1.2.0',
  actionSchema: 'mk-readiness-review/actions/1',
  engine: {
    build: '1.5',
    file: 'vendor/review-engine-build-1.5.cjs',
    sha256: '7f8ca08f2626108919ef97d664d6b752fe91ae686fdd44639d1e79be5d9395ba',
    /** Build 1.5 is additive to the independently rechecked build 1.4 engine. */
    derivedFrom: { build: '1.4', sha256: '6d374561cd709f873c7649b5ac637b68aa07d88c79940032f3dfda36b8f8e740' }
  },
  bank: {
    version: '1.3-review',
    file: 'data/bank-v1.3.json',
    sha256: '95abc50e743f428e5829c042abc1823c517075b77204ffdf0e538aa5fe5f4419'
  },
  coverage: {
    file: 'data/coverage-map-v1.3.json',
    sha256: '9081b069f1f15dfea35afe001da69d8636345492810b36b56b30624a302c77a7'
  },
  /** Maximum respondent screens, including the profile. Owner answers and corrections do not count. */
  respondentScreenLimit: 95,
  approval: 'Not approved by MK. Scenario tiers, answer mappings, exclusions, owner functions, completion conditions and legal wording are proposals.'
} as const;

export type ReadinessReviewContract = typeof READINESS_REVIEW_CONTRACT;

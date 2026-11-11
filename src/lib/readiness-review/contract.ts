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
  version: '1.3.0',
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
    sha256: '95abc50e743f428e5829c042abc1823c517075b77204ffdf0e538aa5fe5f4419',
    /** SHA-256 of the bank as loaded (JSON.stringify of the imported object); checked when the service starts. */
    digest: '80eac8fc77fbc1e90e563c374e2d458918f55f24037eaaa588b4cbb8b8ef21c0'
  },
  coverage: {
    version: '1.3-review',
    file: 'data/coverage-map-v1.3.json',
    sha256: '9081b069f1f15dfea35afe001da69d8636345492810b36b56b30624a302c77a7',
    digest: 'c47f7b42cefa157c851f720273f156d419bf78da6f04a70b8542956c5e2d29e8'
  },
  /**
   * Contract versions whose records carry their own ruleset identity and that this build can replay unchanged. A record
   * from any other contract version is refused rather than reinterpreted.
   */
  recordContracts: ['1.3.0'],
  /**
   * Records written under contracts 1.0.0 to 1.2.0 did not store bank or coverage hashes. Each of those versions was only
   * ever released with the ruleset below, so such a record is read as bound to it, and only while this build runs exactly
   * that ruleset. The export says which reader was used.
   */
  historicalRecordContracts: {
    versions: ['1.0.0', '1.1.0', '1.2.0'],
    engineSha256: '7f8ca08f2626108919ef97d664d6b752fe91ae686fdd44639d1e79be5d9395ba',
    bankVersion: '1.3-review',
    bankSha256: '95abc50e743f428e5829c042abc1823c517075b77204ffdf0e538aa5fe5f4419',
    coverageSha256: '9081b069f1f15dfea35afe001da69d8636345492810b36b56b30624a302c77a7'
  },
  /** Maximum respondent screens, including the profile, for build 1.5 sessions. Owner answers and corrections do not count. */
  respondentScreenLimit: 95,
  /**
   * Build 1.6, staged completion: no respondent screen limit; core, breadth and accountable-function packages; a
   * consistency check; depth selection; owners may decline. Selected per session in the fictional harness only
   * (MK_READINESS_REVIEW_ENGINE=1.6), never by default, and it produces no score. Its records carry contract 1.4.0 and
   * action schema 2; build 1.5 records keep contract 1.3.0 and replay exactly as before.
   */
  stagedBuild: {
    contractVersion: '1.4.0',
    actionSchema: 'mk-readiness-review/actions/2',
    engine: {
      build: '1.6',
      file: 'vendor/review-engine-build-1.6.cjs',
      sha256: '1d6faa73b10ad9505cf6852af63c4fceb91d37cbff8da0c03fba626a4f59e5c4',
      composes: { build: '1.5', sha256: '7f8ca08f2626108919ef97d664d6b752fe91ae686fdd44639d1e79be5d9395ba' }
    },
    approval: 'Not approved by MK. Stages, the consistency check, depth selection and decline handling are proposals; build 1.6 produces no score and is inactive for customers.'
  },
  approval: 'Not approved by MK. Scenario tiers, answer mappings, exclusions, owner functions, completion conditions and legal wording are proposals.'
} as const;

export type ReadinessReviewContract = typeof READINESS_REVIEW_CONTRACT;

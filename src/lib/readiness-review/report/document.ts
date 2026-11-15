/**
 * The management report document (contract `mk-readiness-management-report`, draft 0.2.0): the typed output of the
 * standard report engine. See docs/readiness-review/REPORT-ENGINE-DESIGN.md (revision 3).
 *
 * The standard report is the automated, self-reported pathway: it rests only on the organisation's own responses, the
 * engine's adaptive routing and the method's own content. MK does not review evidence or verify responses in this
 * pathway; evidence review, verification and specialist conclusions belong to the separately scoped Advisory package,
 * whose records the standard report never cites (see advisory-record.ts).
 *
 * Every statement and register item cites claims from the claims ledger, and every claim points into the report input
 * (contract mk-readiness-report-input 1.2.x). Nothing in a document may be traced to anything else.
 */

export const REPORT_DOCUMENT_CONTRACT = { name: 'mk-readiness-management-report', version: '0.2.0' } as const;

/** The report input versions this engine reads. */
export const SUPPORTED_INPUT = { name: 'mk-readiness-report-input', versions: /^1\.2\.\d+$/ } as const;

/** The only pathway this document contract describes. */
export const STANDARD_PATHWAY = 'standard-self-reported' as const;

export type Layer = 'executive' | 'analysis' | 'register' | 'annex';

/**
 * The kind of knowledge a statement rests on. The report never upgrades a kind: a gap indicated by the responses is
 * never described as verified, reported practice never as evidenced, and nothing unresolved or outside the scope as a
 * weakness. There is no evidence, conclusion or reviewer kind: those belong to the Advisory record.
 */
export type Kind =
  | 'indicated-gap'
  | 'reported-practice'
  | 'recorded-fact'
  | 'records-said'
  | 'method-practice'
  | 'unresolved'
  | 'coverage'
  | 'outside-scope'
  | 'scenario'
  | 'withheld'
  | 'method'
  | 'decision';

export const STANDARD_KINDS: readonly Kind[] = ['indicated-gap', 'reported-practice', 'recorded-fact', 'records-said', 'method-practice', 'unresolved', 'coverage', 'outside-scope', 'scenario', 'withheld', 'method', 'decision'];

/** What a statement rests on: the organisation's responses, the engine's record and routing, or the method itself. */
export type Basis = 'self-reported' | 'record' | 'method';

/** A value placed in a template slot, read from one field of one claim. A field ending in [] joins a list with "; ". */
export type Slot = { name: string; claim: string; field: string | null; value: string | number | null };

/** A count placed in a template slot: the number of the cited items, always with its universe. */
export type CountSlot = { name: string; counts: string; items: string[]; value: number; universe: { name: string; label: string; items: string[]; value: number } | null };

export type Statement = {
  id: string;
  layer: Layer;
  section: string;
  rule: string;
  template: string;
  text: string;
  kind: Kind;
  basis: Basis;
  slots: Slot[];
  counts: CountSlot[];
  qualifiers: string[];
  claims: string[];
  subjects: { controls: string[]; scenarios: string[]; area: string | null; function: string | null };
};

/** Information-gathering register: a sequence for collecting information, never a ranking of risk. */
export type InformationRequest = {
  id: string;
  sequence: number;
  sequenceMeaning: string;
  function: string | null;
  control: string;
  scenarios: string[];
  provenance: string;
  statement: string;
  claims: string[];
};

/** A gap indicated by the organisation's responses, listed for management consideration. Never ranked. */
export type ReportedIssue = {
  id: string;
  control: string;
  area: string;
  scenarios: string[];
  answerVersion: number;
  corrected: boolean;
  ranked: false;
  status: 'for management consideration';
  statement: string;
  claims: string[];
};

/**
 * A recommended action for one reported issue: the practice as the draft method describes it in place, quoted, or an
 * explicit statement that a specific action is withheld because the method gives nothing to quote. Never ranked, never
 * an evidence request, never the engine's own remediation wording.
 */
export type RecommendedAction = {
  id: string;
  issue: string;
  control: string;
  area: string;
  source: 'draft-method-in-place' | 'withheld';
  ranked: false;
  status: 'for management consideration';
  statement: string;
  claims: string[];
};

/** Decisions management must take. States the decision; never recommends an answer. */
export type ManagementDecision = {
  id: string;
  decision: 'assign-owners' | 'consider-actions' | 'confirm-assumptions';
  owner: 'management';
  statement: string;
  claims: string[];
};

/** The coverage categories. Each control falls in exactly one; none is merged with another. */
export const COVERAGE_CATEGORIES = [
  { category: 'reported', states: ['reported'] },
  { category: 'reused', states: ['reused'] },
  { category: 'fact', states: ['fact'] },
  { category: 'waiting', states: ['waiting', 'waiting-scope'] },
  { category: 'unconfirmed', states: ['unconfirmed'] },
  { category: 'scope-unconfirmed', states: ['scope-unconfirmed'] },
  { category: 'prerequisite', states: ['prerequisite'] },
  { category: 'excluded', states: ['outofscope', 'proportion', 'precluded'] },
  { category: 'assumed', states: ['assumed'] },
  { category: 'retired', states: ['retired'] }
] as const;
export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number]['category'];

export function coverageCategoryOf(state: string): CoverageCategory | null {
  return COVERAGE_CATEGORIES.find((c) => (c.states as readonly string[]).includes(state))?.category ?? null;
}

export type CoverageRow = { category: CoverageCategory; states: string[]; controls: string[]; statement: string };

export type AnnexControlRow = {
  id: string;
  area: string;
  key: string | null;
  state: string;
  stateLabel: string;
  coverage: CoverageCategory;
  kind: Kind;
  currentVersion: number | null;
  source: string | null;
  sourceLabel: string | null;
  recordsSaid: string | null;
  claims: string[];
};

export type AnnexAnswerRow = {
  control: string;
  version: number;
  value: unknown;
  label: string;
  via: string;
  source: string | null;
  sourceLabel: string;
  by: string | null;
  at: string;
  current: boolean;
  claim: string;
};

export type AnnexScenarioRow = { id: string; area: string; name: string; tier: number; tierMeaning: string; status: string; statusLabel: string; confirming: string[]; deciding: string[]; claim: string };

export type ValidationResult = { id: string; name: string; passed: boolean; failures: string[] };

export type ReleaseClassification = 'internal-interim' | 'releasable';

/** A release criterion of the standard pathway. None depends on evidence review, reviewer records or reviewer identity. */
export type ReleaseCriterion = { id: StandardReleaseCriterion; met: boolean; ref: string; note: string };
export const STANDARD_RELEASE_CRITERIA = ['interview-ended', 'real-record', 'method-approved', 'copy-approved', 'commercial-path', 'terms-and-privacy', 'staging-isolation', 'authenticated-access'] as const;
export type StandardReleaseCriterion = (typeof STANDARD_RELEASE_CRITERIA)[number];

export type ReportDocument = {
  contract: { name: string; version: string };
  pathway: typeof STANDARD_PATHWAY;
  draft: { copyVersion: string; copyApproved: boolean; fictionalOnly: true; note: string };
  lineage: {
    inputContract: string;
    inputVersion: string;
    inputDigest: string;
    logDigest: string;
    actionCount: number;
    sessionId: string;
    asOf: string;
    ledgerDigest: string;
    ledgerVersion: string;
    engine: { name: string; version: string };
  };
  status: {
    basis: { selfReported: true; evidenceReviewedByMK: false; responsesVerifiedByMK: false };
    methodApproval: string;
    scoring: { status: 'withheld'; reason: string };
    interview: { status: string; stopReason: string | null };
    release: { classification: ReleaseClassification; marking: string; criteria: ReleaseCriterion[] };
  };
  statements: Statement[];
  layers: {
    executive: { status: string[]; indicated: string[]; coverage: string[]; actions: string[]; withheld: string[]; decisions: string[] };
    analysis: {
      areas: { area: string; name: string; statements: string[] }[];
      scenarios: { area: string; name: string; statements: string[] }[];
      coverage: { routing: string; rows: CoverageRow[] };
    };
    register: {
      informationGathering: { sequenceStatement: string; items: InformationRequest[] };
      reportedIssues: { statement: string; ranked: false; items: ReportedIssue[] };
      recommendedActions: { statement: string; ranked: false; items: RecommendedAction[] };
      decisions: { items: ManagementDecision[] };
    };
    annex: { controls: AnnexControlRow[]; answerHistory: AnnexAnswerRow[]; scenarios: AnnexScenarioRow[]; lineageStatement: string; methodStatement: string };
  };
};

export const INTERIM_MARKING = 'Internal interim draft. Not for release.';
export const SEQUENCE_MEANING = 'Information-gathering order: by accountable function, then the method\'s scenario tier, then question order. Not a ranking of fraud risk or materiality.';
export const TIER_MEANING = 'Method tier: a proposal of the draft method (B4) that sets only the order of information gathering. Not a ranking of fraud risk or materiality.';

/** The executive sections, in order. Each executive statement belongs to exactly one. */
export const EXECUTIVE_SECTIONS = ['status', 'indicated', 'coverage', 'actions', 'withheld', 'decisions'] as const;

/** Every statement id the executive brief refers to, section by section. */
export function executiveStatementIds(doc: ReportDocument) {
  const e = doc.layers.executive;
  return EXECUTIVE_SECTIONS.flatMap((s) => e[s] ?? []);
}

/** Presentation limits of the executive brief: placeholders for MK (D2). */
export const EXECUTIVE_LIMITS = { statements: 36, controls: 0 } as const;

/** Count names the executive brief may use. Any other count belongs in the analysis or the annex. */
export const EXECUTIVE_COUNTS = ['exposed', 'asked', 'total', 'unassigned', 'scenarios', 'gapScenarios', 'practiceScenarios', 'openScenarios', 'excludedScenarios', 'issues', 'withAction', 'withheldActions', 'screens', 'limit', 'reported', 'reused', 'fact', 'waiting', 'unconfirmed', 'scopeUnconfirmed', 'prerequisite', 'excluded', 'assumed', 'retired', 'waitingScope'] as const;

/** The judgements the standard report must explicitly withhold. */
export const REQUIRED_WITHHELD = ['R-WITHHELD-OVERALL', 'R-WITHHELD-PRIORITY', 'R-WITHHELD-REMEDIATION', 'R-WITHHELD-VERIFICATION', 'R-WITHHELD-SCORING', 'R-WITHHELD-UNASKED'] as const;

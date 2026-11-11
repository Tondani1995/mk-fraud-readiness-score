/**
 * The management report document (contract `mk-readiness-management-report`, draft 0.1.0): the typed output of the
 * report engine. Phase 1 defines the contract, the input gate, the claims ledger and the validation checks; it does not
 * generate customer reports. See docs/readiness-review/REPORT-ENGINE-DESIGN.md.
 *
 * Every statement and register item cites claims from the claims ledger, and every claim points into the report input
 * (contract mk-readiness-report-input 1.1.x). Nothing in a document may be traced to anything else.
 */

export const REPORT_DOCUMENT_CONTRACT = { name: 'mk-readiness-management-report', version: '0.1.0' } as const;

/** The report input versions this engine reads. */
export const SUPPORTED_INPUT = { name: 'mk-readiness-report-input', versions: /^1\.1\.\d+$/ } as const;

export type Layer = 'executive' | 'analysis' | 'register' | 'annex';

/**
 * The kind of knowledge a statement rests on. The report never upgrades a kind: reported practice is never described
 * as evidenced, evidence never as a conclusion, and nothing unresolved or outside the scope as a weakness.
 */
export type Kind =
  | 'reported-exposure'
  | 'reported-practice'
  | 'recorded-fact'
  | 'evidence'
  | 'conclusion'
  | 'reviewer-follow-up'
  | 'unresolved'
  | 'outside-scope'
  | 'coverage'
  | 'method'
  | 'decision';

/**
 * Evidence levels, lowest first. `independently-validated` exists so that the checks can refuse it: the current
 * method has no state for independent validation, so no claim can carry it and no statement may claim it.
 */
export const EVIDENCE_LEVELS = ['none-recorded', 'said-to-exist', 'requested', 'recorded', 'reviewed', 'independently-validated'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

/** Who recorded a reviewer's evidence review or conclusion. Identity is unverified until reviewers sign in (B3). */
export type Attribution = { by: string | null; at: string | null; forVersion: number | null; identityVerified: boolean; identityNote: string };

/** A value placed in a template slot, read from one field of one claim. */
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
  evidenceLevel?: EvidenceLevel;
  attribution?: Attribution;
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

/** Remediation recommendations: as put forward by the method for a reported gap; never ranked. */
export type RemediationItem = {
  id: string;
  source: 'method-action';
  control: string;
  area: string;
  scenario: string | null;
  function: string | null;
  kind: Kind;
  ranked: false;
  status: 'for management consideration';
  statement: string;
  claims: string[];
};

/** A reviewer's follow-up, quoted as recorded and attributed. Not classified as remediation or information gathering. */
export type ReviewerFollowUp = { id: string; control: string; area: string; statement: string; attribution: Attribution; claims: string[] };

/** Decisions management must take for the review to proceed. States the decision; never recommends an answer. */
export type ManagementDecision = {
  id: string;
  decision: 'assign-owners' | 'evidence-for-reported-practice' | 'confirm-assumptions' | 'review-completion';
  owner: 'management';
  statement: string;
  claims: string[];
};

export type AnnexControlRow = {
  id: string;
  area: string;
  key: string | null;
  state: string;
  stateLabel: string;
  kind: Kind;
  currentVersion: number | null;
  source: string | null;
  sourceLabel: string | null;
  evidenceLevel: EvidenceLevel;
  conclusion: string | null;
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

export type AnnexEvidenceRow = {
  control: string;
  record: 'evidence' | 'review';
  state: string | null;
  conclusion: string | null;
  evidenceLevel: EvidenceLevel | null;
  current: boolean;
  attribution: Attribution;
  basis: string | null;
  followUp: string | null;
  limitation: string | null;
  claim: string;
};

export type ValidationResult = { id: string; name: string; passed: boolean; failures: string[] };

export type ReleaseClassification = 'internal-interim' | 'releasable';

export type ReportDocument = {
  contract: { name: string; version: string };
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
    reviewComplete: boolean;
    why: string;
    methodApproval: string;
    scoring: { status: 'withheld'; reason: string };
    reviewerIdentity: { verified: boolean; reason: string };
    release: { classification: ReleaseClassification; marking: string; reasons: string[] };
  };
  statements: Statement[];
  layers: {
    executive: {
      status: string[];
      /** The position in five parts, kept apart. */
      position: { reportedExposure: string[]; reviewedEvidence: string[]; reviewerConclusions: string[]; unresolved: string[]; outsideScope: string[] };
      canConclude: string[];
      unestablished: string[];
      decisions: string[];
    };
    analysis: { areas: { area: string; name: string; statements: string[] }[]; scenarios: { note: string } };
    register: {
      informationGathering: { sequenceStatement: string; items: InformationRequest[] };
      remediation: { unrankedStatement: string; ranked: false; items: RemediationItem[] };
      reviewerFollowUps: { statement: string; items: ReviewerFollowUp[] };
      decisions: { items: ManagementDecision[] };
    };
    annex: { controls: AnnexControlRow[]; answerHistory: AnnexAnswerRow[]; evidence: AnnexEvidenceRow[]; lineageStatement: string };
  };
};

export const INTERIM_MARKING = 'Internal interim draft. Not for release.';
export const SEQUENCE_MEANING = 'Information-gathering order: by accountable function, then the method\'s scenario tier, then question order. Not a ranking of fraud risk or materiality.';

/** Every statement id the executive brief refers to. */
export function executiveStatementIds(doc: ReportDocument) {
  const e = doc.layers.executive;
  return [...e.status, ...e.position.reportedExposure, ...e.position.reviewedEvidence, ...e.position.reviewerConclusions, ...e.position.unresolved, ...e.position.outsideScope, ...e.canConclude, ...e.unestablished, ...e.decisions];
}

/** The most controls the executive brief may name, and the most one executive statement may name. */
export const EXECUTIVE_CONTROL_LIMIT = { total: 10, perStatement: 3 } as const;

/** Count names the executive brief may use. Any other count belongs in the analysis or the annex. */
export const EXECUTIVE_COUNTS = ['exposed', 'asked', 'reviewed', 'withoutEvidence', 'open', 'unassigned', 'total', 'undecided', 'scenarios', 'notAsked', 'excluded', 'actions'] as const;

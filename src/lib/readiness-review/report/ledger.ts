import { canonicalDigest, canonicalJson } from '../canonical';
import type { ReportInput } from '../report-input';

/**
 * The claims ledger: every fact a report may use, taken from the report input and nothing else. Each claim has a
 * stable id, the JSON pointer of the place in the input it comes from, the fields it copies, and the copied value, so
 * that any claim can be checked against the input at any time (claimHolds).
 *
 * Every claim belongs to a pathway. `standard` claims are the organisation's own responses, the engine's routing and
 * the method's content: the only material the standard (self-reported) report may use. `advisory` claims are evidence
 * records, reviewer records and the reviewer-based review status: they belong to the separately scoped Advisory
 * capability, are kept in the ledger so that nothing is lost, and must never be cited by the standard report.
 */
export const LEDGER_VERSION = '0.2.0';

export type Pathway = 'standard' | 'advisory';

export type ClaimType =
  // standard: the record, the method and the organisation's own responses
  | 'contract'
  | 'lineage'
  | 'organisation'
  | 'interview'
  | 'method.approval'
  | 'method.scoring'
  | 'method.content'
  | 'control'
  | 'answer'
  | 'records-said'
  | 'waiting'
  | 'scope'
  | 'gap'
  | 'waiting-item'
  | 'action'
  | 'plan'
  | 'scenario'
  | 'assumption'
  // advisory: evidence and reviewer records, and the reviewer-based review status
  | 'advisory.review-status'
  | 'advisory.evidence-states'
  | 'evidence'
  | 'review'
  | 'earlier-evidence'
  | 'earlier-review';

export const ADVISORY_TYPES: readonly ClaimType[] = ['advisory.review-status', 'advisory.evidence-states', 'evidence', 'review', 'earlier-evidence', 'earlier-review'];

/** Evidence levels, lowest first. Used only by the Advisory record; the standard report states none above "said to exist". */
export const EVIDENCE_LEVELS = ['none-recorded', 'said-to-exist', 'requested', 'recorded', 'reviewed', 'independently-validated'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

/** Who recorded an Advisory evidence review or conclusion. Identity is unverified until reviewers sign in (B3). */
export type Attribution = { by: string | null; at: string | null; forVersion: number | null; identityVerified: boolean; identityNote: string };

export type Claim = {
  id: string;
  type: ClaimType;
  pathway: Pathway;
  pointer: string;
  /** The fields of the object at the pointer that the claim copies; null copies the whole value. */
  fields: string[] | null;
  value: any;
  subject: { control?: string; scenario?: string; area?: string };
  evidenceLevel?: EvidenceLevel;
  outcome?: string;
  attribution?: Attribution;
};

export type Ledger = { version: string; claims: Claim[]; byId: Map<string, Claim>; digest: string };

const IDENTITY_NOTE = 'The report input carries no verified reviewer identity; reviewers do not yet sign in (B3).';

/** Evidence level and outcome of an Advisory evidence record, from its state alone. */
export function evidenceLevelOf(state: string): { level: EvidenceLevel; outcome: string } {
  if (state === 'reviewed-sufficient' || state === 'insufficient' || state === 'contradicted') return { level: 'reviewed', outcome: state };
  if (state === 'supplied') return { level: 'recorded', outcome: state };
  if (state === 'requested' || state === 'unavailable') return { level: 'requested', outcome: state };
  return { level: 'none-recorded', outcome: state };
}

export function resolvePointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  let node: any = root;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

function project(value: any, fields: string[] | null) {
  if (fields === null) return value;
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(fields.map((f) => [f, value[f] === undefined ? null : value[f]]));
}

/** Whether a claim still holds: the input, at the claim's pointer, has exactly the claimed value. */
export function claimHolds(input: unknown, claim: Claim) {
  const at = resolvePointer(input, claim.pointer);
  return at !== undefined && canonicalJson(project(at, claim.fields)) === canonicalJson(claim.value);
}

function attributionOf(record: any): Attribution {
  return { by: record?.by ?? null, at: record?.at ?? null, forVersion: record?.forVersion ?? null, identityVerified: false, identityNote: IDENTITY_NOTE };
}

export function buildLedger(input: ReportInput): Ledger {
  const claims: Claim[] = [];
  const add = (c: Omit<Claim, 'value' | 'pathway'> & { value?: any }) => {
    const value = c.value !== undefined ? c.value : project(resolvePointer(input, c.pointer), c.fields);
    claims.push({ ...c, pathway: ADVISORY_TYPES.includes(c.type) ? 'advisory' : 'standard', value } as Claim);
  };

  add({ id: 'contract', type: 'contract', pointer: '/contract', fields: null, subject: {} });
  add({ id: 'lineage', type: 'lineage', pointer: '/lineage', fields: ['sessionId', 'asOf', 'actionCount', 'logDigest', 'recordContractVersion', 'rulesetReader'], subject: {} });
  add({ id: 'organisation', type: 'organisation', pointer: '/organisation', fields: null, subject: {} });
  // The interview as the organisation experienced it. The reviewer-based review status is an Advisory claim.
  add({ id: 'interview', type: 'interview', pointer: '/interview', fields: ['status', 'stopReason', 'respondentScreens', 'respondentScreenLimit', 'ownerScreens', 'corrections', 'followUpSent'], subject: {} });
  add({ id: 'method.approval', type: 'method.approval', pointer: '/method/approval', fields: null, subject: {} });
  add({ id: 'method.scoring', type: 'method.scoring', pointer: '/method/scoring', fields: null, subject: {} });
  add({ id: 'advisory.review-status', type: 'advisory.review-status', pointer: '/method/completeness', fields: null, subject: {} });
  add({ id: 'advisory.interview-review', type: 'advisory.review-status', pointer: '/interview', fields: ['review'], subject: {} });
  add({ id: 'advisory.evidence-states', type: 'advisory.evidence-states', pointer: '/method/vocabulary/evidenceStates', fields: null, subject: {} });

  input.domains.forEach((domain: any, d: number) => {
    domain.controls.forEach((control: any, c: number) => {
      const base = `/domains/${d}/controls/${c}`;
      const subject = { control: control.id, area: domain.id, ...(control.scenario ? { scenario: control.scenario.id } : {}) };
      add({ id: `control:${control.id}`, type: 'control', pointer: base, fields: ['id', 'key', 'text', 'state', 'stateLabel', 'class', 'issue', 'domain', 'scenario', 'format'], subject });
      if (control.method) add({ id: `method:${control.id}`, type: 'method.content', pointer: `${base}/method`, fields: null, subject });
      control.history.forEach((h: any, k: number) => add({ id: `answer:${control.id}:v${h.version}`, type: 'answer', pointer: `${base}/history/${k}`, fields: null, subject }));
      if (control.answer) {
        add({ id: `answer:${control.id}:v${control.answer.version}`, type: 'answer', pointer: `${base}/answer`, fields: null, subject });
        const said = control.answer.detail?.evidenceAvailable;
        // The respondent's own statement that a record could be shown: self-reported, never seen by MK.
        if (said === 'yes' || said === 'partly') add({ id: `records-said:${control.id}`, type: 'records-said', pointer: `${base}/answer/detail/evidenceAvailable`, fields: null, subject, outcome: said });
      }
      if (control.evidence) {
        const { level, outcome } = evidenceLevelOf(control.evidence.state);
        add({ id: `evidence:${control.id}`, type: 'evidence', pointer: `${base}/evidence`, fields: null, subject, evidenceLevel: level, outcome, attribution: attributionOf(control.evidence) });
      }
      if (control.review) add({ id: `review:${control.id}`, type: 'review', pointer: `${base}/review`, fields: null, subject, outcome: control.review.conclusion ?? 'no-conclusion', attribution: attributionOf(control.review) });
      if (control.waiting) add({ id: `waiting:${control.id}`, type: 'waiting', pointer: `${base}/waiting`, fields: null, subject });
      if (control.scope) add({ id: `scope:${control.id}`, type: 'scope', pointer: `${base}/scope`, fields: null, subject });
    });
  });

  input.findings.reviewerFindings.forEach((f: any, k: number) => {
    if (f.earlier?.evidence) {
      const { level, outcome } = evidenceLevelOf(f.earlier.evidence.state);
      add({ id: `earlier-evidence:${f.id}`, type: 'earlier-evidence', pointer: `/findings/reviewerFindings/${k}/earlier/evidence`, fields: null, subject: { control: f.id }, evidenceLevel: level, outcome, attribution: attributionOf(f.earlier.evidence) });
    }
    if (f.earlier?.review) add({ id: `earlier-review:${f.id}`, type: 'earlier-review', pointer: `/findings/reviewerFindings/${k}/earlier/review`, fields: null, subject: { control: f.id }, outcome: f.earlier.review.conclusion ?? 'no-conclusion', attribution: attributionOf(f.earlier.review) });
  });
  input.findings.reportedGaps.forEach((g: any, k: number) => add({ id: `gap:${g.id}`, type: 'gap', pointer: `/findings/reportedGaps/${k}`, fields: null, subject: { control: g.id, ...(g.scenario ? { scenario: g.scenario } : {}) } }));
  input.openWork.waiting.forEach((w: any, k: number) => add({ id: `waiting-item:${w.id}`, type: 'waiting-item', pointer: `/openWork/waiting/${k}`, fields: null, subject: { control: w.id } }));
  input.openWork.actions.forEach((a: any, k: number) => add({ id: `action:${a.type}:${a.id}:${k}`, type: 'action', pointer: `/openWork/actions/${k}`, fields: null, subject: { control: a.id } }));
  input.openWork.followUpPlan.forEach((p: any, k: number) => add({ id: `plan:${p.scenario}`, type: 'plan', pointer: `/openWork/followUpPlan/${k}`, fields: null, subject: { scenario: p.scenario } }));
  input.scenarios.forEach((s: any, k: number) => add({ id: `scenario:${s.id}`, type: 'scenario', pointer: `/scenarios/${k}`, fields: ['id', 'name', 'tier', 'domain', 'status', 'statusLabel', 'established', 'undecided', 'confirmations'], subject: { scenario: s.id, area: s.domain } }));
  input.openWork.assumptions.forEach((a: any, k: number) => add({ id: `assumption:${a.id}`, type: 'assumption', pointer: `/openWork/assumptions/${k}`, fields: null, subject: { control: a.id } }));

  const byId = new Map(claims.map((c) => [c.id, c]));
  if (byId.size !== claims.length) throw new Error('The claims ledger has a repeated claim id.');
  return { version: LEDGER_VERSION, claims, byId, digest: canonicalDigest(claims) };
}

/** The ledger as the standard report sees it: the standard claims only. Used to prove the standard report never needs more. */
export function standardLedger(ledger: Ledger): Ledger {
  const claims = ledger.claims.filter((c) => c.pathway === 'standard');
  return { version: ledger.version, claims, byId: new Map(claims.map((c) => [c.id, c])), digest: canonicalDigest(claims) };
}

import { canonicalJson } from '../canonical';
import type { ReportInput } from '../report-input';
import { claimHolds, type Attribution, type Claim, type Ledger } from './ledger';
import { fieldOf } from './shared';
import { render, type CopyTable } from './copy';

/**
 * The Advisory record: the evidence-review and reviewer functionality already built, preserved as a separate capability
 * of the separately scoped and priced Advisory package. It is NOT part of the standard (self-reported) report, the
 * standard report never cites it, and neither generating nor releasing a standard report depends on it.
 *
 * It lists every evidence and reviewer record with its attribution. A record made under a reviewer account whose
 * identity is not verified is never worded as an MK finding: it says who recorded it and that the identity is not
 * verified, and the checks below refuse authoritative wording for it whatever disclaimer appears elsewhere.
 *
 * Fictional records only. Not connected to any route, page, service or commercial product.
 */
export const ADVISORY_RECORD_CONTRACT = { name: 'mk-readiness-advisory-record', version: '0.1.0' } as const;

export const ADVISORY_COPY: CopyTable = {
  version: '0.1.0-draft',
  approved: false,
  templates: {
    'advisory.status': 'Advisory record. Evidence review, verification and specialist conclusions belong to the separately scoped Advisory package. This record is not part of the standard assessment report, and the standard report does not depend on it.',
    'advisory.evidence.unverified.current': 'For “{key}”, recorded under a reviewer account whose identity is not verified ({by}, {at}), against answer version {forVersion}: “{label}”. Recorded basis: “{basis}”. This is not an MK finding.',
    'advisory.evidence.unverified.earlier': 'For “{key}”, an earlier record made against answer version {forVersion}, which is no longer the current answer, under a reviewer account whose identity is not verified ({by}, {at}): “{label}”. Recorded basis: “{basis}”. This is not an MK finding.',
    'advisory.review.unverified.current': 'For “{key}”, recorded under a reviewer account whose identity is not verified ({by}, {at}), against answer version {forVersion}: “{label}”. Recorded basis: “{basis}”. This is not an MK finding.',
    'advisory.review.unverified.current.none': 'For “{key}”, a review recorded under a reviewer account whose identity is not verified ({by}, {at}) has no conclusion yet: the review is incomplete. This is not an MK finding.',
    'advisory.review.unverified.earlier': 'For “{key}”, an earlier record made against answer version {forVersion}, which is no longer the current answer, under a reviewer account whose identity is not verified ({by}, {at}): “{label}”. Recorded basis: “{basis}”. This is not an MK finding.',
    'advisory.review.unverified.earlier.none': 'For “{key}”, an earlier review, made against an answer that is no longer current, under a reviewer account whose identity is not verified ({by}, {at}), has no conclusion. This is not an MK finding.',
    'advisory.followup.unverified': 'For “{key}”, follow-up recorded under a reviewer account whose identity is not verified ({by}, {at}): “{followUp}”.',
    'advisory.limitation.unverified': 'For “{key}”, limitation recorded under a reviewer account whose identity is not verified ({by}, {at}): “{limitation}”.',
    // Authoritative wording exists only for records made under a verified MK reviewer identity, which no record has
    // until reviewers sign in (B3). The checks refuse it for any record that is not verified.
    'advisory.evidence.verified.current': 'For “{key}”, MK reviewer {by} recorded on {at}, against answer version {forVersion}: “{label}”. Recorded basis: “{basis}”.',
    'advisory.review.verified.current': 'For “{key}”, MK reviewer {by} recorded on {at}, against answer version {forVersion}: “{label}”. Recorded basis: “{basis}”.'
  }
};

export type AdvisorySlot = { name: string; claim: string; field: string | null; value: string | number | null };
export type AdvisoryEntry = {
  id: string;
  control: string;
  record: 'evidence' | 'review' | 'follow-up' | 'limitation';
  current: boolean;
  authority: 'verified-mk-reviewer' | 'unverified-account';
  template: string;
  text: string;
  slots: AdvisorySlot[];
  attribution: Attribution;
  claim: string;
};
export type AdvisoryRecord = {
  contract: { name: string; version: string };
  pathway: 'advisory';
  package: 'Advisory (separately scoped and priced)';
  standardReportDependency: false;
  draft: { copyVersion: string; copyApproved: boolean; fictionalOnly: true };
  lineage: { inputDigest: string; ledgerDigest: string };
  statusStatement: string;
  entries: AdvisoryEntry[];
};

const RECORD_TYPES = ['evidence', 'review', 'earlier-evidence', 'earlier-review'];

export function buildAdvisoryRecord(input: ReportInput, ledger: Ledger, gate: { digest: string }, copy: CopyTable = ADVISORY_COPY): AdvisoryRecord {
  if ((input as any).organisation?.fictional !== true) throw new Error('The Advisory record is built from fictional records only in this phase.');
  const order = new Map((input as any).domains.flatMap((d: any) => d.controls).map((c: any, i: number) => [c.id, i]));
  const records = ledger.claims.filter((c) => RECORD_TYPES.includes(c.type)).sort((a, b) => (order.get(a.subject.control!) as number) - (order.get(b.subject.control!) as number) || RECORD_TYPES.indexOf(a.type) - RECORD_TYPES.indexOf(b.type));
  const entries: AdvisoryEntry[] = [];
  const entry = (c: Claim, record: AdvisoryEntry['record'], template: string, names: [string, string | null, string][]) => {
    const slots: AdvisorySlot[] = names.map(([name, field, claimId]) => {
      const source = ledger.byId.get(claimId)!;
      return { name, claim: claimId, field, value: fieldOf(source.value, field) ?? null };
    });
    const values = Object.fromEntries(slots.map((s) => [s.name, s.value]));
    entries.push({ id: `advisory-${entries.length + 1}`, control: c.subject.control!, record, current: !!c.value.current, authority: c.attribution!.identityVerified ? 'verified-mk-reviewer' : 'unverified-account', template, text: render(copy.templates[template], values), slots, attribution: c.attribution!, claim: c.id });
  };
  for (const c of records) {
    const cid = c.subject.control!;
    const verified = c.attribution!.identityVerified ? 'verified' : 'unverified';
    const when = c.value.current ? 'current' : 'earlier';
    const kind = c.type.endsWith('evidence') ? 'evidence' : 'review';
    const none = kind === 'review' && !c.value.conclusion ? '.none' : '';
    const template = `advisory.${kind}.${verified}.${when}${none}`;
    const key: [string, string | null, string] = ['key', 'key', `control:${cid}`];
    const common: [string, string | null, string][] = [key, ['by', 'by', c.id], ['at', 'at', c.id]];
    entry(c, kind, template, none ? common : [...common, ['forVersion', 'forVersion', c.id], ['label', 'label', c.id], ['basis', 'basis', c.id]]);
    if (kind === 'review' && c.value.current && c.value.followUp) entry(c, 'follow-up', `advisory.followup.${verified}`, [...common, ['followUp', 'followUp', c.id]]);
    if (kind === 'review' && c.value.current && c.value.limitation) entry(c, 'limitation', `advisory.limitation.${verified}`, [...common, ['limitation', 'limitation', c.id]]);
  }
  return {
    contract: { ...ADVISORY_RECORD_CONTRACT },
    pathway: 'advisory',
    package: 'Advisory (separately scoped and priced)',
    standardReportDependency: false,
    draft: { copyVersion: copy.version, copyApproved: copy.approved, fictionalOnly: true },
    lineage: { inputDigest: gate.digest, ledgerDigest: ledger.digest },
    statusStatement: copy.templates['advisory.status'],
    entries
  };
}

// ------------------------------------------------------------------------------------------------ checks A01 to A06

export const ADVISORY_CHECKS: [string, string][] = [
  ['A01', 'Attribution as recorded'],
  ['A02', 'No authority without a verified identity'],
  ['A03', 'Earlier records shown as earlier'],
  ['A04', 'Reviewer words quoted verbatim'],
  ['A05', 'Kept apart from the standard report'],
  ['A06', 'Every Advisory record once']
];

/** Authoritative wording: an MK finding, review or conclusion. Allowed only for a record under a verified MK reviewer identity. */
const AUTHORITY = /\bMK (reviewed|found|concluded|confirmed|verified|assessed|determined)\b|\bMK reviewer\b|\bMK('s)? (finding|conclusion|review)\b|\bauthori[sz]ed reviewer\b/i;
/** The one sentence an unverified entry may use that names an MK finding: its negation. Pinned here, not in the copy. */
const AUTHORITY_NEGATION = 'This is not an MK finding.';

function ownWords(e: { text: string; slots: { value: string | number | null }[] }) {
  let text = e.text;
  for (const v of e.slots.map((s) => (s.value === null ? '' : String(s.value))).filter((v) => v.length).sort((a, b) => b.length - a.length)) text = text.split(v).join(' ');
  return text;
}

export function validateAdvisoryRecord(record: AdvisoryRecord, input: ReportInput, ledger: Ledger, copy: CopyTable = ADVISORY_COPY) {
  const fail: Record<string, string[]> = Object.fromEntries(ADVISORY_CHECKS.map(([id]) => [id, []]));
  const note = (id: string, m: string) => fail[id].push(m);
  for (const e of record.entries) {
    const c = ledger.byId.get(e.claim);
    // A01 attribution as recorded
    if (!c || !RECORD_TYPES.includes(c.type)) note('A01', `${e.id}: cites ${e.claim}, which is not an Advisory evidence or reviewer record`);
    else {
      if (!claimHolds(input, c)) note('A01', `${e.id}: ${e.claim} does not hold against the input`);
      if (canonicalJson(e.attribution) !== canonicalJson(c.attribution)) note('A01', `${e.id}: attribution differs from the record`);
      if ((e.authority === 'verified-mk-reviewer') !== (c.attribution?.identityVerified === true)) note('A01', `${e.id}: authority ${e.authority} is not what the record's identity supports`);
    }
    // A02 no authority without a verified identity: judged entry by entry, so no disclaimer elsewhere can excuse it.
    const verified = c?.attribution?.identityVerified === true;
    if (!verified) {
      if (!e.template.includes('.unverified')) note('A02', `${e.id}: an unverified record uses the template ${e.template}`);
      if (AUTHORITY.test(ownWords(e).split(AUTHORITY_NEGATION).join(' '))) note('A02', `${e.id}: authoritative wording for a record whose reviewer identity is not verified`);
      if ((e.record === 'evidence' || e.record === 'review') && !e.text.includes(AUTHORITY_NEGATION)) note('A02', `${e.id}: an unverified record does not say it is not an MK finding`);
    }
    // A03 earlier records shown as earlier
    if (c && !!c.value.current !== e.current) note('A03', `${e.id}: shown as ${e.current ? 'current' : 'earlier'}, recorded as ${c.value.current ? 'current' : 'not current'}`);
    if (c && !c.value.current && !e.template.includes('.earlier')) note('A03', `${e.id}: a record that is no longer current is not worded as an earlier record`);
    // A04 verbatim
    const template = copy.templates[e.template];
    if (template === undefined) note('A04', `${e.id}: template ${e.template} is not in the Advisory copy`);
    for (const s of e.slots) {
      const source = ledger.byId.get(s.claim);
      if (!source || (fieldOf(source.value, s.field) ?? null) !== s.value) note('A04', `${e.id}: {${s.name}} is not the recorded value of ${s.claim}`);
    }
    if (template !== undefined) {
      try {
        if (render(template, Object.fromEntries(e.slots.map((s) => [s.name, s.value]))) !== e.text) note('A04', `${e.id}: the text is not its template filled from the record`);
      } catch (error) {
        note('A04', `${e.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  // A05 kept apart
  if (record.pathway !== 'advisory' || record.standardReportDependency !== false || record.package !== 'Advisory (separately scoped and priced)') note('A05', 'the record is not marked as the separate Advisory capability');
  if (record.statusStatement !== copy.templates['advisory.status']) note('A05', 'the Advisory status statement is missing or changed');
  // A06 every Advisory record once
  const seen = new Map<string, number>();
  for (const e of record.entries.filter((x) => x.record === 'evidence' || x.record === 'review')) seen.set(e.claim, (seen.get(e.claim) ?? 0) + 1);
  for (const c of ledger.claims.filter((x) => RECORD_TYPES.includes(x.type))) if (seen.get(c.id) !== 1) note('A06', `${c.id} appears ${seen.get(c.id) ?? 0} times`);
  const results = ADVISORY_CHECKS.map(([id, name]) => ({ id, name, passed: fail[id].length === 0, failures: fail[id].slice(0, 12) }));
  return { passed: results.every((r) => r.passed), results };
}

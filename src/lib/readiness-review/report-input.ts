import type { EngineInstance } from './engine';
import { REVIEW_BANK, REVIEW_ISSUE_CLASSES, REVIEW_PRACTICE_CLASSES } from './engine';
import { READINESS_REVIEW_CONTRACT } from './contract';
import { CONCLUSION_LABEL, CONTROL_STATE_LABEL, EVIDENCE_LABEL, REPORTED_LABEL, SCENARIO_STATUS_LABEL } from './labels';
import { canonicalDigest } from './canonical';
import type { AnswerValue, LiveSession, RecordedRuleset } from './session';
import { reportFor, waitingProvenance, type WaitingProvenance } from './view-model';

/**
 * The input a report engine consumes (report input contract 1.0.0). It is built only by replaying a stored answer log
 * through the review engine the log was recorded under, so it is a pure function of the log: the same log always gives
 * the same input, byte for byte, and its digest identifies it. Nothing here is stored as truth; the log is.
 *
 * It keeps apart what the method keeps apart: scope (does a control apply, and who decided), reported practice (what
 * someone said, in which version, through which channel), uncertainty (what is waiting and why), evidence (what MK
 * reviewed, against which answer version) and review judgement (an authorised reviewer's conclusion). It carries no
 * score, band, rating, confidence or prediction: the method withholds them until MK approves a supported method, and a
 * report engine must not derive them from this input.
 */
export const REPORT_INPUT_CONTRACT = { name: 'mk-readiness-report-input', version: '1.1.0' } as const;

export type AnswerVersion = {
  version: number;
  value: AnswerValue;
  label: string;
  /** Practice class the engine assigned (full, partial, designed, absent, noinstance, na), or null for facts and unknowns. */
  class: string | null;
  at: string;
  /** Channel as the engine records it: respondent (including corrections), owner, or assumptions. */
  via: string;
  /**
   * How this version was given, from the engine's own answer log: respondent-answer, respondent-correction,
   * owner-answer, or activities-screen. Added in 1.1.0; null only if the engine's log has no entry for it.
   */
  source: AnswerSource | null;
  /** Who answered: "Respondent" or the accountable function. */
  by: string | null;
  /** The role the answer was asked of, when an accountable function answered. */
  role: string | null;
  /** The respondent's optional detail, in the engine's own terms. */
  detail: { reach?: string; tested?: string; evidenceAvailable?: string; note?: string } | null;
};

export type AnswerSource = 'respondent-answer' | 'respondent-correction' | 'owner-answer' | 'activities-screen';

export type ReviewRecordRef = {
  state?: string;
  conclusion?: string | null;
  label: string;
  by: string | null;
  at: string | null;
  basis: string | null;
  followUp?: string;
  limitation?: string;
  /** The answer version this record was made against, and the answer it saw then. */
  forVersion: number | null;
  forValue: AnswerValue | null;
  current: boolean;
};

export type ControlRecord = {
  id: string;
  key: string | null;
  text: string;
  type: string;
  format: string | null;
  domain: { id: string; name: string };
  module: { id: string; name: string } | null;
  scenario: { id: string; name: string; tier: number } | null;
  /** The control's role in its scenario (confirm, related, scope, route), and the objectives it serves. */
  role: string | null;
  objectives: string[];
  /** The engine's state for this control, with its canonical wording. */
  state: string;
  stateLabel: string;
  class: string | null;
  issue: boolean;
  answer: AnswerVersion | null;
  /** Earlier answer versions, oldest first. */
  history: AnswerVersion[];
  waiting: { owner: string | null; function: string | null; provenance: WaitingProvenance } | null;
  scope: { decidedBy: string | null; decidedByKey: string | null; basis: string | null } | null;
  reused: { from: string; why: string } | null;
  subPractices: { id: string; label: string; class: string }[] | null;
  evidence: ReviewRecordRef | null;
  review: ReviewRecordRef | null;
  reReview: { reason: string; sinceVersion: number | null } | null;
};

export type ReportInput = ReturnType<typeof buildReportInput>;

const DETAIL_KEYS: [string, 'reach' | 'tested' | 'evidenceAvailable' | 'note'][] = [
  ['reach', 'reach'],
  ['tested', 'tested'],
  ['ev', 'evidenceAvailable'],
  ['note', 'note']
];

function moduleIndex() {
  const index = new Map<string, { id: string; name: string }>();
  for (const d of (REVIEW_BANK as any).domains) for (const m of d.bank.modules) for (const q of m.questions) index.set(q.id, { id: m.id, name: m.name });
  return index;
}

/**
 * How each answer version of each question was given. The engine pairs every answer record with one entry in its own
 * log (S.log), in order, except the activities screen, which records facts with a single entry for the screen.
 */
function answerSources(e: EngineInstance) {
  const out = new Map<string, AnswerSource[]>();
  for (const entry of (e.S.log ?? []) as any[]) {
    if (typeof entry.q !== 'string' || entry.q.startsWith('__')) continue;
    const source: AnswerSource = entry.kind === 'correction' ? 'respondent-correction' : entry.via === 'owner' ? 'owner-answer' : 'respondent-answer';
    const list = out.get(entry.q) ?? [];
    list.push(source);
    out.set(entry.q, list);
  }
  return out;
}

function versionSources(rec: any, logged: AnswerSource[] | undefined) {
  const byVersion = new Map<number, AnswerSource | null>();
  const queue = [...(logged ?? [])];
  for (const v of [...(rec?.hist ?? []), rec].filter(Boolean).sort((a: any, b: any) => a.ver - b.ver)) {
    byVersion.set(v.ver, v.via === 'assumptions' ? 'activities-screen' : queue.shift() ?? null);
  }
  return byVersion;
}

function answerVersion(e: EngineInstance, qid: string, a: any, source: AnswerSource | null = null): AnswerVersion {
  const q = e.QI[qid];
  const detail: AnswerVersion['detail'] = {};
  for (const [from, to] of DETAIL_KEYS) if (a[from] !== undefined && a[from] !== null && a[from] !== '') detail[to] = a[from];
  return {
    version: a.ver,
    value: a.v,
    label: q ? e.labelOf(q, a.v) : String(a.v),
    class: a.cls ?? null,
    at: a.at,
    via: a.via,
    source,
    by: a.by ?? null,
    role: a.role ?? null,
    detail: Object.keys(detail).length ? detail : null
  };
}

function reviewRef(rec: any, kind: 'evidence' | 'review'): ReviewRecordRef | null {
  if (!rec) return null;
  const base = { by: rec.by ?? null, at: rec.at ?? null, basis: rec.basis ?? null, forVersion: rec.forVer ?? null, forValue: rec.forValue ?? null, current: !!rec.current };
  if (kind === 'evidence') return { ...base, state: rec.state, label: EVIDENCE_LABEL[rec.state] ?? rec.state };
  return { ...base, conclusion: rec.conclusion ?? null, label: rec.conclusion ? CONCLUSION_LABEL[rec.conclusion] ?? rec.conclusion : 'No conclusion yet', followUp: rec.followUp ?? '', limitation: rec.limitation ?? '' };
}

function controlRecord(e: EngineInstance, report: any, modules: Map<string, { id: string; name: string }>, sources: Map<string, AnswerSource[]>, domain: { id: string; name: string }, row: any): ControlRecord {
  const sc = row.scenario ? report.scenarios.find((s: any) => s.id === row.scenario) : null;
  const rec = e.S.ans[row.id];
  const given = versionSources(rec, sources.get(row.id));
  const current = rec && !rec.stale ? answerVersion(e, row.id, rec, given.get(rec.ver) ?? null) : null;
  const history = rec ? [...(rec.hist ?? [])].map((h: any) => answerVersion(e, row.id, h, given.get(h.ver) ?? null)).sort((a, b) => a.version - b.version) : [];
  const waiting = row.state === 'waiting' || row.state === 'waiting-scope';
  const owner = row.owner ?? null;
  const scoped = ['outofscope', 'proportion', 'precluded', 'retired', 'scope-unconfirmed', 'prerequisite', 'waiting-scope', 'assumed', 'unconfirmed'].includes(row.state) && (row.by !== undefined || row.basis !== undefined);
  return {
    id: row.id,
    key: row.key ?? null,
    text: String(row.text ?? '').replace(/\s+/g, ' ').trim(),
    type: row.type,
    format: row.format ?? null,
    domain,
    module: modules.get(row.id) ?? null,
    scenario: sc ? { id: sc.id, name: sc.name, tier: sc.tier } : null,
    role: row.role ?? null,
    objectives: row.objectives ?? [],
    state: row.state,
    stateLabel: row.state === 'reported' ? REPORTED_LABEL[row.cls] ?? row.cls : CONTROL_STATE_LABEL[row.state] ?? row.state,
    class: row.cls ?? null,
    issue: !!row.issue,
    answer: current,
    history,
    waiting: waiting ? { owner, function: owner ? e.functionOf(owner) : null, provenance: waitingProvenance(e, report, row) } : null,
    scope: scoped ? { decidedBy: row.by ?? null, decidedByKey: row.by ? e.QI[row.by]?.key ?? null : null, basis: row.basis ?? null } : null,
    reused: row.state === 'reused' ? { from: row.from, why: row.why } : null,
    subPractices: row.subs ?? null,
    evidence: reviewRef(row.evidence, 'evidence'),
    review: reviewRef(row.review, 'review'),
    reReview: row.reReview ? { reason: row.reReview.reason, sinceVersion: row.reReview.since ?? null } : null
  };
}

export function buildReportInput(live: LiveSession) {
  const e = live.engine;
  const report = reportFor(live);
  const modules = moduleIndex();
  const sources = answerSources(e);
  const actions = live.record.actions;
  const domains = report.domains.map((d: any) => {
    const domain = { id: d.id, name: d.name };
    const controls: ControlRecord[] = d.rows.map((row: any) => controlRecord(e, report, modules, sources, domain, row));
    return { id: d.id, name: d.name, counts: { ...d.counts } as Record<string, number>, controls };
  });
  const byId = new Map<string, ControlRecord>(domains.flatMap((d: any) => d.controls.map((c: ControlRecord) => [c.id, c] as const)));
  const tierOf = (id: string) => byId.get(id)?.scenario?.tier ?? null;
  const ruleset: RecordedRuleset = live.ruleset;

  return {
    contract: { ...REPORT_INPUT_CONTRACT },
    lineage: {
      sessionId: live.record.sessionId,
      createdAt: live.record.createdAt,
      recordContractVersion: live.record.contractVersion,
      ruleset,
      rulesetReader: live.rulesetReader,
      actionCount: actions.length,
      firstActionAt: actions[0]?.at ?? null,
      lastActionAt: actions.at(-1)?.at ?? null,
      /** SHA-256 of the canonical JSON of the stored answer log: the exact log this input was built from. */
      logDigest: canonicalDigest(actions),
      asOf: live.asOf,
      engineReportVersion: report.version
    },
    method: {
      approval: READINESS_REVIEW_CONTRACT.approval,
      scoring: { status: 'withheld' as const, reason: 'The review method produces no score, band, rating, confidence or prediction. They are withheld until MK approves a supported method, and must not be derived from this input.' },
      completeness: { complete: report.status.complete as boolean, why: report.status.completeWhy as string },
      vocabulary: {
        practiceClasses: [...REVIEW_PRACTICE_CLASSES],
        issueClasses: [...REVIEW_ISSUE_CLASSES],
        evidenceStates: [...e.EV_STATES],
        conclusions: [...e.CONCLUSIONS],
        controlStates: { ...CONTROL_STATE_LABEL, ...Object.fromEntries(Object.entries(REPORTED_LABEL).map(([k, v]) => [`reported:${k}`, v])) },
        scenarioStatuses: { ...SCENARIO_STATUS_LABEL }
      }
    },
    organisation: { label: live.record.organisationLabel, fictional: live.record.fictional },
    interview: {
      status: report.status.interview as string,
      stopReason: (report.status.stopReason ?? null) as string | null,
      respondentScreens: report.status.respondentScreens as number,
      respondentScreenLimit: READINESS_REVIEW_CONTRACT.respondentScreenLimit,
      ownerScreens: report.status.ownerScreens as number,
      corrections: report.status.corrections as number,
      followUpSent: !!report.status.followUpSent,
      review: report.status.review as string,
      asked: { total: report.asked.total as number, byKind: { ...report.asked.byKind } as Record<string, number> }
    },
    profile: report.profile.map((p: any) => {
      const rec = e.S.ans[p.id];
      return { id: p.id, key: e.QI[p.id]?.key ?? null, question: String(p.text).replace(/\s+/g, ' ').trim(), label: p.label as string, value: (rec?.v ?? null) as AnswerValue | null, at: (rec?.at ?? null) as string | null, via: (rec?.via ?? null) as string | null };
    }),
    domains,
    scenarios: report.scenarios.map((s: any) => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      domain: s.domain,
      status: s.status,
      statusLabel: SCENARIO_STATUS_LABEL[s.status] ?? s.status,
      established: s.established ?? null,
      undecided: (s.undecidedRoutes ?? []).map((u: any) => ({ facts: [...u.facts], state: u.state, questions: [...(u.questions ?? [])] })),
      confirmations: s.confirmations.map((c: any) => ({ id: c.id, state: c.state, class: c.cls ?? null }))
    })),
    findings: {
      reportedGaps: report.issues.map((r: any) => ({ id: r.id, key: r.key, class: r.cls, scenario: r.scenario ?? null, tier: tierOf(r.id) })),
      reviewerFindings: report.reviewerFindings.map((f: any) => ({ id: f.id, key: f.key, respondentAnswer: f.respondent, evidence: reviewRef(f.evidence, 'evidence'), review: reviewRef(f.review, 'review'), followUp: f.followUp, earlier: { evidence: reviewRef(f.earlier?.evidence, 'evidence'), review: reviewRef(f.earlier?.review, 'review') } })),
      reviewerTasks: report.reviewerTasks.map((t: any) => ({ id: t.id, key: t.key, text: t.text, conclusion: t.conclusion ?? null, by: t.by ?? null, at: t.at ?? null, forVersion: t.forVer ?? null })),
      reReview: report.reReview.map((r: any) => ({ id: r.id, key: r.key, reason: r.reason, earlierFollowUp: r.earlierFollowUp ?? null })),
      stale: report.stale.map((s: any) => ({ id: s.id, reason: s.reason }))
    },
    openWork: {
      waiting: report.waiting.map((r: any) => ({ id: r.id, key: r.key, state: r.state, owner: byId.get(r.id)?.waiting?.owner ?? null, function: byId.get(r.id)?.waiting?.function ?? null, provenance: byId.get(r.id)!.waiting!.provenance })),
      unresolvedMaterialScenarios: report.unresolvedMaterial.map((s: any) => s.id),
      ownerQueue: report.ownerQueue.map((o: any) => ({ id: o.id, key: o.key ?? null, owner: o.owner, function: o.fn, openedBy: o.from })),
      followUpPlan: report.followUpPlan.map((p: any) => ({ scenario: p.id, name: p.name, tier: p.tier, status: p.status, owner: p.owner, function: p.fn, questions: [...p.questions], factsNeeded: [...p.factsNeeded] })),
      ownerPackages: Object.entries(report.ownerPackages ?? {}).map(([fn, n]) => ({ function: fn, questions: n as number })),
      assumptions: report.assumptions.map((a: any) => ({ id: a.id, text: a.text })),
      precluded: Object.entries(report.precluded ?? {}).map(([by, ids]) => ({ by, byKey: e.QI[by]?.key ?? null, controls: [...(ids as string[])] })),
      actions: report.actions.map((a: any) => ({ type: a.type, id: a.id, text: a.text, tier: a.tier ?? null }))
    }
  };
}

/** The digest that identifies a report input; a report run records it so the report can be traced to its exact input. */
export function reportInputDigest(input: ReportInput) {
  return canonicalDigest(input);
}

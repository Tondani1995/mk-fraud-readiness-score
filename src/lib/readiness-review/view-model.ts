/**
 * The single adapter between the readiness engine and every output: interview, Snapshot, owner packages, reviewer
 * workspace, management view, API and export. Every field below is either copied from the engine's report or a
 * grouping of report fields with its rule stated next to it. No output computes its own interpretation; pages, API
 * routes and the export all call these functions, and the contract tests check that they agree.
 */
import { isStagedEngine, type EngineInstance, type EngineQuestion, type EngineStep } from './engine';
import { READINESS_REVIEW_CONTRACT } from './contract';
import type { LiveSession, StoredAction } from './session';
import { ownerFunctionSlug } from './session';
import {
  CONCLUSION_LABEL,
  CONTROL_STATE_LABEL,
  EVIDENCE_CLAIM_LABEL,
  EVIDENCE_LABEL,
  PHASE_LABEL,
  REACH_LABEL,
  REPORTED_LABEL,
  SCENARIO_STATUS_LABEL,
  STOP_LABEL,
  TESTED_LABEL
} from './labels';

const LIMIT = READINESS_REVIEW_CONTRACT.respondentScreenLimit;

// ---------------------------------------------------------------------------------------------------------- report

/** The engine report for the session's current action count, computed once and reused. */
export function reportFor(live: LiveSession): any {
  const seq = live.record.actions.length;
  if (live.reportCache?.seq === seq) return live.reportCache.report;
  live.clock.now = live.asOf;
  const report = live.engine.report();
  live.reportCache = { seq, report };
  return report;
}

// ---------------------------------------------------------------------------------------------------------- steps

export type ChoiceView = { value: string; label: string; meaning?: string; uncertain?: boolean; exclusive?: boolean; outcome: string | null };

export type StepView = {
  q: string;
  kind: string;
  phase: string;
  areaId: string | null;
  areaName: string;
  moduleName: string | null;
  modulePurpose: string | null;
  showAreaIntroduction: boolean;
  text: string;
  help: string | null;
  why: string;
  format: 'single' | 'multi';
  choices: ChoiceView[];
  /** Optional detail the respondent may add after choosing, by the engine's class for that answer. */
  detailFor: { reach: string[]; tested: string[]; ev: string[] };
  suggestedOwner: string | null;
  suggestedFunction: string | null;
  provenance: string | null;
};

function plain(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

const UNKNOWN_MEANING = 'The question goes to the person who would know. Nothing is assumed in the meantime.';

export function choicesFor(e: EngineInstance, q: EngineQuestion): ChoiceView[] {
  const options = q.options ?? [];
  const out: ChoiceView[] = [];
  const outcome = (value: string) => (q.id === '__assumptions__' ? null : e.classOf(q, value));
  if (q.format === 'anchored') {
    options.forEach(([value, label]) => {
      if (/^[0-5]$/.test(value)) out.push({ value, label, meaning: q.levels?.[Number(value)], outcome: outcome(value) });
    });
    options.forEach(([value]) => {
      if (value === 'noevent') out.push({ value, label: 'No such case has arisen yet', meaning: 'The practice is set out but no case has tested it.', outcome: outcome(value) });
    });
  } else {
    options.forEach(([value, label]) => {
      if (value === 'unknown') return;
      out.push({ value, label, exclusive: value === 'none', outcome: outcome(value) });
    });
    const hasNa = Object.values(q.practiceMap ?? {}).includes('na') || options.some(([value]) => value === 'na');
    if (q.naLabel && !hasNa) out.push({ value: 'na', label: q.naLabel, outcome: 'na' });
  }
  if (q.id !== '__assumptions__') out.push({ value: 'unknown', label: "I don't know", meaning: UNKNOWN_MEANING, uncertain: true, exclusive: true, outcome: 'unknown' });
  return out;
}

function respondentAnswerLog(live: LiveSession) {
  return live.record.actions.filter((a): a is Extract<StoredAction, { type: 'respondent.answer' }> => a.type === 'respondent.answer');
}

export function stepView(live: LiveSession, step: EngineStep, channel: 'respondent' | 'owner'): StepView {
  const e = live.engine;
  const q = step.q;
  const section = e.MOD[q.id];
  const areaId = step.domain;
  const priorInArea = channel === 'respondent' && areaId ? respondentAnswerLog(live).some((a) => e.DOM[a.q] === areaId) : true;
  const choices = choicesFor(e, q);
  const practice = q.type === 'practice';
  const owner = section?.owner ?? (q.id.startsWith('PR-') ? 'A senior manager' : null);
  return {
    q: q.id,
    kind: step.kind,
    phase: PHASE_LABEL[step.kind] ?? 'Interview',
    areaId,
    areaName: step.domainName,
    moduleName: section?.name ?? null,
    modulePurpose: section?.purpose ?? null,
    showAreaIntroduction: channel === 'respondent' && !!areaId && !priorInArea,
    text: plain(q.text),
    help: q.help ? plain(String(q.help)) : null,
    why: step.reason ? plain(step.reason) : '',
    format: q.format === 'multi' ? 'multi' : 'single',
    choices,
    // Rule: where it falls short is asked for answers the engine classes as partial; whether it was tested and whether
    // a record could be shown are asked on essential confirmations reported in place or partly in place.
    detailFor: {
      reach: practice ? choices.filter((c) => c.outcome === 'partial').map((c) => c.value) : [],
      tested: practice && step.kind === 'confirm' ? choices.filter((c) => c.outcome === 'full' || c.outcome === 'partial').map((c) => c.value) : [],
      ev: practice && step.kind === 'confirm' ? choices.filter((c) => c.outcome === 'full' || c.outcome === 'partial' || c.outcome === 'noinstance').map((c) => c.value) : []
    },
    suggestedOwner: owner,
    suggestedFunction: owner ? e.functionOf(owner) : null,
    provenance: channel === 'owner' ? (step.reason ? plain(step.reason) : null) : null
  };
}

// ---------------------------------------------------------------------------------------------------------- status

export type StatusView = {
  interview: 'in progress' | 'ended';
  stopReason: string;
  stopLabel: string | null;
  screensUsed: number;
  /** Build 1.5 only: the respondent screen limit. Null for staged sessions, which have no limit. */
  limit: number | null;
  /** Share of the respondent screen limit used (build 1.5). It is not a measure of completeness or readiness. */
  pctOfLimit: number | null;
  /** Build 1.6 only: completion by stage, outstanding information and function progress. */
  stages: StageProgressView | null;
  ownerAnswers: number;
  corrections: number;
  followUpSent: boolean;
  /**
   * The standard assessment's status, as four separate statements: whether the interview is completed, where the
   * function packages stand, whether the information is sufficient (nothing outstanding) and whether a commercial report
   * is eligible. Completion is defined by the self-reported assessment and its outstanding information only. Evidence
   * review and reviewer conclusions are MK Advisory work and are never a condition of completing this assessment.
   */
  assessment: AssessmentStatusView;
  /** Records made through the separate Advisory evidence-review service, if any. Kept and shown apart; not a completion step. */
  advisory: { records: number; label: string };
};

export type StatusFacet = { key: 'interview' | 'packages' | 'information' | 'eligibility'; label: string; state: string; detail: string; settled: boolean | null };
export type AssessmentStatusView = {
  facets: StatusFacet[];
  /** Information still outstanding. Declined, unanswered and "I don't know" are each counted here and never treated as resolved. */
  outstanding: { notReached: number; withFunctions: number; declined: number; unknownToFunction: number; total: number };
};

export type StageCountView = { answered: number; withFunctions: number; declined: number; unknownToFunction: number; open: number; applicableSoFar: number; complete: boolean; pct: number };

export type StageProgressView = {
  current: 'core' | 'breadth' | 'packages' | 'complete';
  currentLabel: string;
  core: StageCountView;
  breadth: StageCountView;
  functions: { fn: string; open: number; answered: number; declined: number; unknownToFunction: number; areas: string[] }[];
  /** Information still outstanding: with a function, declined by one (with its reason) or not known by the function. */
  outstanding: { withFunctions: number; declined: number; unknownToFunction: number; packagesOpen: number; declinedItems: { q: string; title: string; fn: string; reason: string }[] };
  consistency: { eligible: number; selected: number; answered: number; untested: number; counts: Record<string, number>; limitation: string };
  workload: { actor: string; screens: number }[];
  note: string;
};

const STAGE_LABEL: Record<StageProgressView['current'], string> = {
  core: 'Core: the confirmations every assessment needs',
  breadth: 'Breadth: the remaining confirmations that apply',
  packages: 'Function packages: questions for accountable functions',
  complete: 'Every applicable confirmation has been reached: answered, with a function or listed as outstanding'
};

/** Stage progress for a build 1.6 session, derived only from the engine's own report. */
export function stageProgressView(report: any): StageProgressView | null {
  const st = report.staged;
  if (!st) return null;
  const s = st.stages;
  // Reached so far: answered, with a function, declined or not known by the function. Never a measure of readiness.
  const count = (x: any): StageCountView => {
    const declined = x.declined ?? 0;
    const unknownToFunction = x.unknownToFunction ?? 0;
    const reached = x.answered + x.withFunctions + declined + unknownToFunction;
    return { ...x, declined, unknownToFunction, pct: x.applicableSoFar ? Math.round((reached / x.applicableSoFar) * 100) : 100 };
  };
  const fns = (s.packages.functions as any[]).filter((f) => f.open || f.answered || f.declined.length || f.unknownByOwner || f.areas.length);
  const titles = new Map<string, string>((report.domains as any[]).flatMap((d) => d.rows).map((r: any) => [r.id, r.key ?? r.id]));
  const areaNames = new Map<string, string>((report.domains as any[]).map((d) => [d.id, d.name]));
  return {
    current: s.current,
    currentLabel: STAGE_LABEL[s.current as StageProgressView['current']],
    core: count(s.core),
    breadth: count(s.breadth),
    functions: fns.map((f) => ({ fn: f.fn, open: f.open, answered: f.answered, declined: f.declined.length, unknownToFunction: f.unknownByOwner, areas: (f.areas as string[]).map((d) => areaNames.get(d) ?? d) })),
    outstanding: {
      withFunctions: s.breadth.withFunctions,
      declined: fns.reduce((a, f) => a + f.declined.length, 0),
      unknownToFunction: fns.reduce((a, f) => a + f.unknownByOwner, 0),
      packagesOpen: s.packages.open,
      declinedItems: fns.flatMap((f) => f.declined.map((d: { id: string; reason: string }) => ({ q: d.id, title: titles.get(d.id) ?? d.id, fn: f.fn, reason: d.reason }))).slice(0, 50)
    },
    consistency: { eligible: st.consistency.eligible, selected: st.consistency.selected, answered: st.consistency.answered, untested: st.consistency.untested, counts: st.consistency.counts, limitation: st.consistency.limitation },
    workload: Object.entries(st.workload as Record<string, number>).map(([actor, screens]) => ({ actor: actor === 'respondent' ? 'Respondent' : actor, screens })),
    note: s.note
  };
}

const SCENARIO_UNSETTLED = ['unconfirmed', 'waiting', 'scope-unconfirmed', 'route-unconfirmed', 'route-incomplete'];

/** The four status statements for the standard assessment. Nothing here depends on an MK reviewer or on evidence. */
export function assessmentStatusView(report: any, stages: StageProgressView | null): AssessmentStatusView {
  const s = report.status;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  let notReached: number, withFunctions: number, declined: number, unknownToFunction: number;
  let interviewDone: boolean, interviewDetail: string, packages: StatusFacet;
  if (stages) {
    // Staged: the interview is completed when the respondent has reached every applicable confirmation.
    notReached = stages.breadth.open;
    withFunctions = stages.breadth.withFunctions + stages.outstanding.packagesOpen;
    declined = stages.outstanding.declined;
    unknownToFunction = stages.outstanding.unknownToFunction;
    interviewDone = stages.breadth.complete || s.interview === 'ended';
    interviewDetail = interviewDone
      ? `The respondent has reached every confirmation that applies so far (${s.respondentScreens} questions answered). A later answer or correction can bring more into scope and reopen it.`
      : `${stages.currentLabel}. ${stages.breadth.pct}% of the confirmations that apply so far have been reached.`;
    const st = report.staged.stages.packages;
    const answered = stages.functions.reduce((a, f) => a + f.answered, 0);
    packages = {
      key: 'packages', label: 'Function packages',
      state: st.open > 0 ? 'Open' : st.sent > 0 ? 'Returned' : withFunctions > 0 ? 'Not yet sent' : 'None needed',
      detail: st.sent > 0 || st.open > 0
        ? `${plural(st.sent, 'send', 'sends')} so far; ${plural(st.open, 'question is', 'questions are')} still open, ${answered} answered, ${declined} declined and ${unknownToFunction} answered "I don't know" by the function.`
        : withFunctions > 0 ? `${plural(withFunctions, 'question is', 'questions are')} with accountable functions and can be sent once the core stage is complete.` : 'No question needs an accountable function.',
      settled: st.open === 0
    };
  } else {
    // Build 1.5: the same rows as the staged stage measure, so both builds count questions, not scenarios. A
    // confirmation in an applicable scenario that is not answered or with a function is not reached; a scenario whose
    // deciding fact is not established counts once.
    const seen = new Set<string>();
    notReached = 0;
    for (const sc of report.scenarios as any[]) {
      if (sc.status === 'outofscope') continue;
      if (!sc.confirmations.length) { if (SCENARIO_UNSETTLED.includes(sc.status) && sc.status !== 'waiting') notReached++; continue; }
      for (const c of sc.confirmations) { if (seen.has(c.id)) continue; seen.add(c.id); if (!['reported', 'reused', 'na', 'waiting'].includes(c.state)) notReached++; }
    }
    withFunctions = report.waiting.length;
    declined = 0;
    unknownToFunction = 0;
    interviewDone = s.interview === 'ended';
    interviewDetail = interviewDone
      ? `${STOP_LABEL[s.stopReason] ?? 'Ended'}. ${s.respondentScreens} of ${LIMIT} respondent screens used.${notReached ? ` ${plural(notReached, 'scenario was', 'scenarios were')} not settled when it ended.` : ''}`
      : `In progress: ${s.respondentScreens} of ${LIMIT} respondent screens used.`;
    packages = {
      key: 'packages', label: 'Function packages',
      state: s.followUpSent ? (withFunctions ? 'Open' : 'Returned') : withFunctions ? 'Not yet sent' : 'None needed',
      detail: withFunctions ? `${plural(withFunctions, 'question is', 'questions are')} with accountable functions.` : 'No question is with an accountable function.',
      settled: withFunctions === 0
    };
  }
  const total = notReached + withFunctions + declined + unknownToFunction;
  const parts = [
    notReached ? `${notReached} not yet reached` : '', withFunctions ? `${withFunctions} with a function` : '', declined ? `${declined} declined by a function` : '',
    unknownToFunction ? `${unknownToFunction} not known by the function` : ''
  ].filter(Boolean);
  return {
    outstanding: { notReached, withFunctions, declined, unknownToFunction, total },
    facets: [
      { key: 'interview', label: 'Interview', state: interviewDone ? 'Completed' : 'In progress', detail: interviewDetail, settled: interviewDone },
      packages,
      {
        key: 'information', label: 'Information', state: total === 0 ? 'Nothing outstanding' : `${total} outstanding`,
        detail: total === 0
          ? 'Every applicable question has an answer from the respondent or an accountable function. Answers are self-reported.'
          : `${parts.join('; ')}. A declined question, an unanswered question and an "I don't know" stay outstanding until someone answers; none is treated as in place or as missing.`,
        settled: total === 0
      },
      {
        key: 'eligibility', label: 'Report eligibility', state: 'Not determined by this assessment',
        detail: 'Whether a paid report can be issued, and with how much information outstanding, is an MK commercial rule that has not been set. This assessment records the information; it makes no order, report or delivery available.',
        settled: null
      }
    ]
  };
}

export function statusView(report: any): StatusView {
  const s = report.status;
  const staged = !!report.staged;
  const stages = stageProgressView(report);
  return {
    interview: s.interview,
    stopReason: s.stopReason || '',
    stopLabel: s.stopReason ? STOP_LABEL[s.stopReason] ?? null : null,
    screensUsed: s.respondentScreens,
    limit: staged ? null : LIMIT,
    pctOfLimit: staged ? null : Math.min(100, Math.round((s.respondentScreens / LIMIT) * 100)),
    stages,
    ownerAnswers: s.ownerScreens,
    corrections: s.corrections,
    followUpSent: !!s.followUpSent,
    assessment: assessmentStatusView(report, stages),
    advisory: {
      records: (report.reviews?.length ?? 0) + (report.evidence?.length ?? 0) + report.reviewerFindings.length + report.reviewerTasks.length + report.reReview.length,
      label: s.review === 'not started' ? 'No Advisory evidence-review records' : 'Advisory evidence-review records exist for this session'
    }
  };
}

// ---------------------------------------------------------------------------------------------------------- respondent

export type RespondentView = {
  organisationLabel: string;
  asOf: string;
  status: StatusView;
  step: StepView | null;
  lastSaved: { q: string; text: string; label: string; unknownArea: { domain: string; areaName: string; owner: string; fn: string } | null } | null;
  /**
   * Build 1.6 only: on the first question of an area, the offer to hand the whole area to its accountable function before
   * answering anything in it. The area's questions keep one task each; they stay outstanding until the function answers.
   */
  areaHandoff: { domain: string; areaName: string; owner: string; fn: string } | null;
  /** Answers the respondent gave, oldest first. Choices are included so Back can show and change a saved answer. */
  history: { q: string; text: string; label: string; areaName: string; changeable: boolean; value: string | string[]; format: 'single' | 'multi'; choices: ChoiceView[] }[];
  /**
   * The review areas in interview order, for orientation only (contract 1.2.0). `answered` counts the respondent's own
   * answers in the area; `sentTo` names the function the rest of the area was sent to. Nothing here measures
   * completeness or readiness: the interview can end before an area is reached, and what was not reached stays open.
   */
  areas: { id: string; name: string; answered: number; sentTo: string | null; current: boolean }[];
  canResume: boolean;
  seq: number;
};

export function respondentView(live: LiveSession): RespondentView {
  const e = live.engine;
  const report = reportFor(live);
  const answers = respondentAnswerLog(live);
  const seen = new Set<string>();
  const history: RespondentView['history'] = [];
  for (const a of answers) {
    if (a.q === '__assumptions__' || seen.has(a.q)) continue;
    seen.add(a.q);
    const rec = e.S.ans[a.q];
    const q = e.QI[a.q];
    if (!rec || !q) continue;
    history.push({ q: a.q, text: plain(q.text), label: e.labelOf(q, rec.v), areaName: e.DOM[a.q] ? e.DNAME[e.DOM[a.q]] : 'About the organisation', changeable: rec.via === 'respondent' && !rec.stale, value: rec.v, format: q.format === 'multi' ? 'multi' : 'single', choices: choicesFor(e, q) });
  }
  const last = answers.at(-1);
  const lastQ = last && last.q !== '__assumptions__' ? e.QI[last.q] : null;
  const lastRec = last ? e.S.ans[last.q] : null;
  // Rule: after "I don't know" on a question inside an area, offer to send the rest of that area to the area's
  // suggested owner, unless the area is already assigned or the interview has ended.
  const lastDomain = lastQ ? e.DOM[lastQ.id] : null;
  const lastUnknown = !!lastRec && [].concat(lastRec.v).includes('unknown' as never);
  const areaOwner = lastDomain ? (e.MOD[lastQ!.id]?.owner ?? null) : null;
  const unknownArea = lastUnknown && lastDomain && areaOwner && !e.S.domainAssign[lastDomain] && !e.S.ended
    ? { domain: lastDomain, areaName: e.DNAME[lastDomain], owner: areaOwner, fn: e.functionOf(areaOwner) }
    : null;
  // Rule (build 1.6): at the first question of an area not already handed over, offer the whole area to the function
  // that owns it. Earlier delegation is a choice, never a default; the core confirmations in a handed-over area count as
  // with a function, so the respondent's own stage can still complete.
  const step = live.respondentStep;
  const stepDomain = step ? e.DOM[step.q.id] : null;
  const firstInArea = !!step && !!stepDomain && !history.some((h) => e.DOM[h.q] === stepDomain);
  const stepOwner = stepDomain ? (e.MOD[step!.q.id]?.owner ?? null) : null;
  const areaHandoff = isStagedEngine(e) && firstInArea && stepOwner && !e.S.domainAssign[stepDomain!] && !e.S.ended && !unknownArea
    ? { domain: stepDomain!, areaName: e.DNAME[stepDomain!], owner: stepOwner, fn: e.functionOf(stepOwner) }
    : null;
  const answeredByArea = new Map<string, number>();
  for (const h of history) {
    const d = e.DOM[h.q];
    if (d) answeredByArea.set(d, (answeredByArea.get(d) ?? 0) + 1);
  }
  const currentArea = live.respondentStep?.domain ?? null;
  const areas = e.DOMS.map((d) => ({
    id: d,
    name: e.DNAME[d],
    answered: answeredByArea.get(d) ?? 0,
    sentTo: e.S.domainAssign[d] ? e.functionOf(e.S.domainAssign[d].owner) : null,
    current: d === currentArea
  }));
  return {
    organisationLabel: live.record.organisationLabel,
    asOf: live.asOf,
    status: statusView(report),
    step: live.respondentStep ? stepView(live, live.respondentStep, 'respondent') : null,
    lastSaved: lastQ && lastRec ? { q: lastQ.id, text: plain(lastQ.text), label: e.labelOf(lastQ, lastRec.v), unknownArea } : last?.q === '__assumptions__' ? { q: '__assumptions__', text: 'Less common activities', label: 'Recorded', unknownArea: null } : null,
    areaHandoff,
    history,
    areas,
    canResume: e.S.ended && e.S.stopReason === 'respondent',
    seq: live.record.actions.length
  };
}

// ---------------------------------------------------------------------------------------------------------- shared items

type Row = any;

function areaName(e: EngineInstance, id: string) {
  return e.DOM[id] ? e.DNAME[e.DOM[id]] : 'About the organisation';
}

function scenarioOf(report: any, row: Row) {
  return row.scenario ? report.scenarios.find((s: any) => s.id === row.scenario) ?? null : null;
}

function answerDetail(row: Row) {
  const a = row.answer ?? {};
  return [a.reach && REACH_LABEL[a.reach], a.note && `Respondent's note: ${a.note}`, a.tested && TESTED_LABEL[a.tested], a.ev && EVIDENCE_CLAIM_LABEL[a.ev]].filter(Boolean) as string[];
}

export type ControlItem = {
  id: string;
  area: string;
  title: string;
  text: string;
  answer: string | null;
  state: string;
  stateLabel: string;
  scenario: { id: string; name: string; tier: number } | null;
  detail: string[];
  evidence: { state: string; label: string; current: boolean; forVer: number | null } | null;
  review: { conclusion: string | null; label: string; current: boolean; forVer: number | null; followUp: string } | null;
  ownerFunction: string | null;
};

function controlItem(e: EngineInstance, report: any, row: Row): ControlItem {
  const sc = scenarioOf(report, row);
  const owner = row.owner ?? e.MOD[row.id]?.owner ?? null;
  return {
    id: row.id,
    area: areaName(e, row.id),
    title: row.key ?? row.id,
    text: plain(row.text ?? ''),
    answer: row.label ?? null,
    state: row.state === 'reported' ? row.cls : row.state,
    stateLabel: row.state === 'reported' ? REPORTED_LABEL[row.cls] ?? row.cls : row.assignment?.status === 'declined' ? 'Declined by the function it was sent to; outstanding' : CONTROL_STATE_LABEL[row.state] ?? row.state,
    scenario: sc ? { id: sc.id, name: sc.name, tier: sc.tier } : null,
    detail: answerDetail(row),
    evidence: row.evidence ? { state: row.evidence.state, label: EVIDENCE_LABEL[row.evidence.state] ?? row.evidence.state, current: !!row.evidence.current, forVer: row.evidence.forVer ?? null } : null,
    review: row.review ? { conclusion: row.review.conclusion ?? null, label: row.review.conclusion ? CONCLUSION_LABEL[row.review.conclusion] : 'No conclusion yet', current: !!row.review.current, forVer: row.review.forVer ?? null, followUp: row.review.followUp ?? '' } : null,
    ownerFunction: owner ? e.functionOf(owner) : null
  };
}

export type WaitingSource = 'respondent-unknown' | 'owner-unknown' | 'area' | 'not-reached' | 'owner-opened' | 'scope-waiting' | 'assigned' | 'declined';
export type WaitingProvenance = { kind: WaitingSource; label: string };

export const WAITING_SOURCE_LABEL: Record<WaitingSource, string> = {
  'respondent-unknown': 'The respondent answered “I don’t know”',
  'owner-unknown': 'An accountable function answered “I don’t know”',
  area: 'Sent with the rest of its area by the respondent',
  'not-reached': 'Not reached in the interview; sent as a second-stage follow-up',
  'owner-opened': 'Opened by an accountable function’s answer',
  'scope-waiting': 'Whether it applies depends on a fact that is waiting for an owner',
  assigned: 'Sent to an accountable function',
  declined: 'Declined by the accountable function it was sent to'
};

/** Count lines under the Snapshot's waiting section: "<n> <summary>". */
export const WAITING_SOURCE_SUMMARY: Record<WaitingSource, string> = {
  'respondent-unknown': 'answered “I don’t know” by the respondent',
  'owner-unknown': 'answered “I don’t know” by an accountable function',
  area: 'sent with the rest of their area by the respondent',
  'not-reached': 'not reached in the interview and sent as second-stage follow-up',
  'owner-opened': 'opened by an accountable function’s answer',
  'scope-waiting': 'apply only if a fact still with an owner holds',
  assigned: 'sent to an accountable function for another recorded reason',
  declined: 'declined by the accountable function they were sent to (build 1.6)'
};

const isUnknownValue = (v: unknown) => v === 'unknown' || (Array.isArray(v) && v.length === 1 && v[0] === 'unknown');

/**
 * Why a question is waiting, taken from what was recorded rather than assumed (contract 1.3.0). The order follows the
 * engine's own row logic: a live "I don't know" answer, then a scope fact waiting for an owner, then a confirmation an
 * owner's answer opened, then a second-stage follow-up the interview did not reach, then an area the respondent sent.
 * Anything else that was assigned says only that it was sent, with the engine's recorded reason.
 */
export function waitingProvenance(e: EngineInstance, report: any, row: Row): WaitingProvenance {
  const rec = e.S.ans[row.id];
  // Build 1.6: a declined question stays outstanding with the function's reason, whatever first sent it there.
  if (row.assignment?.status === 'declined') return { kind: 'declined', label: `Declined by ${row.assignment.fn ?? 'an accountable function'}${row.assignment.declineReason ? `: ${plain(String(row.assignment.declineReason))}` : ''}` };
  if (rec && !rec.stale && isUnknownValue(rec.v)) {
    if (rec.via === 'owner' || rec.via === 'owner-followup') return { kind: 'owner-unknown', label: `${rec.by && rec.by !== 'Respondent' ? rec.by : 'An accountable function'} answered “I don’t know”` };
    return { kind: 'respondent-unknown', label: rec.via === 'correction' ? 'The respondent changed the answer to “I don’t know”' : WAITING_SOURCE_LABEL['respondent-unknown'] };
  }
  if (row.state === 'waiting-scope') {
    const by = row.by ? e.QI[row.by]?.key ?? row.by : null;
    return { kind: 'scope-waiting', label: by ? `Whether it applies depends on “${by}”, which is waiting for an owner` : WAITING_SOURCE_LABEL['scope-waiting'] };
  }
  if (row.ownerFollowup) {
    const from = row.ownerFollowup.from;
    return { kind: 'owner-opened', label: `Opened by the accountable function’s answer on “${e.QI[from]?.key ?? from}”` };
  }
  if (row.assignment?.origin === 'follow-up') {
    // The scenario it follows up is shown on its own line beside the reason.
    return { kind: 'not-reached', label: WAITING_SOURCE_LABEL['not-reached'] };
  }
  if (row.bulk) return { kind: 'area', label: WAITING_SOURCE_LABEL.area };
  return { kind: 'assigned', label: row.assignment?.why ? `Sent to an accountable function (${plain(String(row.assignment.why))})` : WAITING_SOURCE_LABEL.assigned };
}

function allRows(report: any): Row[] {
  return report.domains.flatMap((d: any) => d.rows);
}

/**
 * Evidence still to be reviewed. Rule: a control reported in place, partly in place or set out but untested, where
 * the control is an essential confirmation of a tier-1 scenario or the respondent said a record could be shown, and
 * there is no current evidence record that MK has reviewed (reviewed and sufficient, insufficient or contradicted).
 */
export function evidenceToReview(report: any): Row[] {
  const tier1 = new Set<string>(report.scenarios.filter((s: any) => s.tier === 1).flatMap((s: any) => s.confirmations.map((c: any) => c.id)));
  const reviewed = ['reviewed-sufficient', 'insufficient', 'contradicted'];
  return allRows(report).filter((r: Row) => r.state === 'reported' && ['full', 'partial', 'noinstance'].includes(r.cls)
    && (tier1.has(r.id) || ['yes', 'partly'].includes(r.answer?.ev))
    && !(r.evidence?.current && reviewed.includes(r.evidence.state)));
}

function scenarioItem(e: EngineInstance, report: any, s: any) {
  const plan = report.followUpPlan.find((p: any) => p.id === s.id);
  const facts = (s.undecidedRoutes ?? []).flatMap((u: any) => u.facts);
  return {
    id: s.id,
    name: s.name,
    tier: s.tier as number,
    status: s.status as string,
    whyOpen: SCENARIO_STATUS_LABEL[s.status] ?? s.status,
    established: s.established ? SCENARIO_STATUS_LABEL[s.established] : null,
    decidingFacts: facts.map((id: string) => ({ id, title: e.QI[id]?.key ?? id })),
    accountableFunction: plan?.fn ?? null,
    suggestedRole: plan?.owner ?? null
  };
}

export type CountView = { key: string; label: string; value: number; definition: string; denominator: string | null };

// ---------------------------------------------------------------------------------------------------------- snapshot

const DEPTH_KIND_LABEL: Record<string, string> = {
  coverage: 'Only question on an objective no confirmation covers',
  diagnostic: 'Which parts of a partly reported control are in place',
  'follow-up': 'What else is in place where a gap was reported',
  gate: 'A fact that decides whether further questions apply'
};

export type StagedSendView = {
  canSend: boolean;
  sends: number;
  recommended: string[];
  candidates: { id: string; title: string; fn: string; kind: string; scenario: string }[];
};

/** Build 1.6: what the organisation can send to accountable functions now. Candidates are capped for display. */
function stagedSendView(e: EngineInstance, report: any): StagedSendView | null {
  if (!isStagedEngine(e)) return null;
  const candidates = e.depthCandidates();
  const recommended = e.selectDepth().map((c) => c.id);
  const show = [...recommended, ...candidates.map((c) => c.id).filter((id) => !recommended.includes(id))].slice(0, 80);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const scenarioName = new Map<string, string>((report.scenarios as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  return {
    canSend: e.stages().core.complete,
    sends: (e.S as any).v16?.sends?.length ?? 0,
    recommended,
    candidates: show.map((id) => {
      const c = byId.get(id)!;
      return { id, title: e.QI[id]?.key ?? id, fn: c.fn, kind: DEPTH_KIND_LABEL[c.kind] ?? c.kind, scenario: scenarioName.get(c.scenario) ?? c.scenario };
    })
  };
}

export function snapshotView(live: LiveSession) {
  const e = live.engine;
  const report = reportFor(live);
  const rows = allRows(report);
  const reported = rows.filter((r: Row) => r.state === 'reported');
  const inPlace = reported.filter((r: Row) => r.cls === 'full');
  const material = report.scenarios.filter((s: any) => s.tier <= 2 && !['outofscope'].includes(s.status));
  const tier1Confirmations = new Set<string>(report.scenarios.filter((s: any) => s.tier === 1 && s.status !== 'outofscope').flatMap((s: any) => s.confirmations.filter((c: any) => c.state === 'reported').map((c: any) => c.id)));
  const evidence = evidenceToReview(report);
  const waitingItems = report.waiting.map((r: Row) => {
    const provenance = waitingProvenance(e, report, r);
    return { ...controlItem(e, report, r), provenance, via: provenance.label };
  });
  const waitingBySource = (Object.keys(WAITING_SOURCE_LABEL) as WaitingSource[])
    .map((kind) => ({ kind, label: WAITING_SOURCE_SUMMARY[kind], count: waitingItems.filter((w: { provenance: WaitingProvenance }) => w.provenance.kind === kind).length }))
    .filter((x) => x.count > 0);
  const statusOutstanding = assessmentStatusView(report, stageProgressView(report)).outstanding;
  const counts: CountView[] = [
    { key: 'reported-gaps', label: 'Reported gaps', value: report.issues.length, definition: 'Controls the respondent reported as not in place, partly in place, or set out but not yet working. These are self-reported and have not been verified.', denominator: `of ${reported.length} controls with a reported answer` },
    { key: 'waiting', label: 'Waiting for an owner', value: report.waiting.length, definition: 'Questions that now sit with an accountable function: answered “I don’t know”, sent with the rest of an area, not reached in the interview and sent as second-stage follow-up, opened by an owner’s answer, or applicable only if a fact still with an owner holds. Each item says which.', denominator: null },
    { key: 'open-scenarios', label: 'Material scenarios still open', value: report.unresolvedMaterial.length, definition: 'Tier 1 and tier 2 failure scenarios that apply or may apply, where the deciding fact or control is not yet established. Tiers are a proposed priority for asking, not a risk rating.', denominator: `of ${material.length} material scenarios that apply or may apply` },
    { key: 'outstanding', label: 'Information outstanding', value: statusOutstanding.total, definition: 'Questions asked and not yet answered: waiting for an accountable function, declined by a function, answered “I don’t know” by the function, or confirmations not yet reached. None is treated as in place or as missing.', denominator: null }
  ];
  return {
    organisationLabel: live.record.organisationLabel,
    asOf: live.asOf,
    status: statusView(report),
    staged: stagedSendView(e, report),
    counts,
    reportedGaps: report.issues.map((r: Row) => controlItem(e, report, r)),
    waiting: waitingItems,
    waitingBySource,
    openScenarios: report.unresolvedMaterial.map((s: any) => scenarioItem(e, report, s)),
    evidenceToReview: evidence.map((r: Row) => controlItem(e, report, r)),
    reportedInPlace: inPlace.map((r: Row) => controlItem(e, report, r)),
    assumptions: report.assumptions.map((a: any) => ({ id: a.id, text: plain(a.text) })),
    ownerPackages: Object.entries(report.ownerPackages as Record<string, number>).map(([fn, count]) => ({ fn, slug: ownerFunctionSlug(fn), count })),
    precluded: Object.entries(report.precluded as Record<string, string[]>).map(([by, ids]) => ({ by, byTitle: e.QI[by]?.key ?? by, items: ids.map((id) => ({ id, title: e.QI[id]?.key ?? id })) })),
    profile: report.profile.map((p: any) => ({ id: p.id, text: plain(p.text), label: p.label })),
    seq: live.record.actions.length
  };
}

// ---------------------------------------------------------------------------------------------------------- owners

export function ownerView(live: LiveSession, fn: string) {
  const e = live.engine;
  const report = reportFor(live);
  const step = live.ownerSteps[fn];
  const answered = live.record.actions.filter((a) => a.type === 'owner.answer' && a.fn === fn).length;
  const assignments = (report.assignments as any[]).filter((a) => e.functionOf(a.owner) === fn);
  return {
    organisationLabel: live.record.organisationLabel,
    asOf: live.asOf,
    fn,
    slug: ownerFunctionSlug(fn),
    status: statusView(report),
    step: step ? stepView(live, step, 'owner') : null,
    waitingCount: (report.ownerPackages as Record<string, number>)[fn] ?? 0,
    answeredCount: answered,
    items: assignments.map((a) => ({ id: a.qid, title: e.QI[a.qid]?.key ?? a.qid, status: a.status, suggestedRole: a.owner, origin: a.origin === 'follow-up' ? `Follow-up for ${a.scenario}` : a.why ?? '', declineReason: a.declineReason ?? null })),
    /** Build 1.6: this function's own progress, including areas delegated to it. */
    progress: stageProgressView(report)?.functions.find((f) => f.fn === fn) ?? { fn, open: 0, answered: 0, declined: 0, unknownToFunction: 0, areas: [] },
    canDecline: !!report.staged,
    seq: live.record.actions.length
  };
}

// ---------------------------------------------------------------------------------------------------------- reviewer

export function reviewerView(live: LiveSession) {
  const e = live.engine;
  const report = reportFor(live);
  const rows = allRows(report).filter((r: Row) => r.state === 'reported' || r.state === 'na');
  const evidence = new Set(evidenceToReview(report).map((r: Row) => r.id));
  const findings = new Set((report.reviewerFindings as any[]).map((f) => f.id));
  const tasks = new Set((report.reviewerTasks as any[]).map((t) => t.id));
  const reReview = new Set((report.reReview as any[]).map((r) => r.id));
  const evidenceFull = Object.fromEntries((report.evidence as any[]).map((x) => [x.id, x]));
  const reviewFull = Object.fromEntries((report.reviews as any[]).map((x) => [x.id, x]));
  const controls = rows.map((r: Row) => {
    const q = e.QI[r.id];
    const rec = e.S.ans[r.id];
    const base = controlItem(e, report, r);
    const ev = evidenceFull[r.id];
    const rv = reviewFull[r.id];
    return {
      ...base,
      queues: { evidence: evidence.has(r.id), finding: findings.has(r.id), task: tasks.has(r.id), reReview: reReview.has(r.id) },
      answerVersion: rec?.ver ?? null,
      answeredBy: rec?.via === 'owner' ? `${rec.by} (owner)` : 'Respondent',
      answeredAt: rec?.at ?? null,
      answerHistory: (rec?.hist ?? []).map((h: any) => ({ version: h.ver, label: q ? e.labelOf(q, h.v) : String(h.v), at: h.at, by: h.via === 'owner' ? `${h.by} (owner)` : 'Respondent' })),
      reReviewReason: r.reReview?.reason ?? null,
      evidenceRecord: ev ? { state: ev.state, label: EVIDENCE_LABEL[ev.state], basis: ev.basis, by: ev.by, at: ev.at, forVer: ev.forVer, current: ev.current } : null,
      evidenceHistory: (ev?.hist ?? []).map((h: any) => ({ state: h.state, label: EVIDENCE_LABEL[h.state], basis: h.basis, by: h.by, at: h.at, forVer: h.forVer, forValue: q ? e.labelOf(q, h.forValue) : h.forValue })),
      reviewRecord: rv ? { conclusion: rv.conclusion, label: rv.conclusion ? CONCLUSION_LABEL[rv.conclusion] : 'No conclusion yet', basis: rv.basis, followUp: rv.followUp, limitation: rv.limitation ?? '', by: rv.by, at: rv.at, forVer: rv.forVer, current: rv.current } : null,
      reviewHistory: (rv?.hist ?? []).map((h: any) => ({ conclusion: h.conclusion, label: h.conclusion ? CONCLUSION_LABEL[h.conclusion] : 'No conclusion yet', basis: h.basis, followUp: h.followUp, limitation: h.limitation ?? '', by: h.by, at: h.at, forVer: h.forVer, forValue: q ? e.labelOf(q, h.forValue) : h.forValue }))
    };
  });
  return {
    organisationLabel: live.record.organisationLabel,
    asOf: live.asOf,
    status: statusView(report),
    counts: { all: controls.length, evidence: evidence.size, findings: findings.size, tasks: tasks.size, reReview: reReview.size },
    controls,
    findings: (report.reviewerFindings as any[]).map((f) => ({ id: f.id, title: f.key, respondent: f.respondent, evidence: f.evidence ? EVIDENCE_LABEL[f.evidence.state] : null, conclusion: f.review?.conclusion ? CONCLUSION_LABEL[f.review.conclusion] : null, followUp: f.followUp, earlier: f.earlier })),
    tasks: (report.reviewerTasks as any[]).map((t) => ({ id: t.id, title: t.key, text: t.text, conclusion: t.conclusion ? CONCLUSION_LABEL[t.conclusion] : 'No conclusion yet', forVer: t.forVer })),
    reReview: (report.reReview as any[]).map((r) => ({ id: r.id, title: r.key, reason: r.reason, earlierFollowUp: r.earlierFollowUp })),
    evidenceStates: e.EV_STATES.map((value) => ({ value, label: EVIDENCE_LABEL[value] })),
    conclusions: e.CONCLUSIONS.map((value) => ({ value, label: CONCLUSION_LABEL[value] })),
    seq: live.record.actions.length
  };
}

// ---------------------------------------------------------------------------------------------------------- management

/**
 * Who acts next. Rule: each engine action is attributed by its subject. A control goes to the accountable function
 * of its section owner; an owner wait goes to the function of the named owner; a scenario goes to the function the
 * follow-up plan names; reviewer findings, tasks, re-review and evidence requests go to the MK reviewer; activities
 * assumed not to apply go to the organisation's respondent to confirm.
 */
function actorFor(e: EngineInstance, report: any, action: any): string {
  if (['reviewer', 're-review', 'evidence'].includes(action.type)) return 'MK reviewer';
  if (action.type === 'assumption') return 'Respondent';
  if (action.type === 'owner' || action.type === 'owner-followup') {
    const row = allRows(report).find((r: Row) => r.id === action.id);
    if (row?.owner) return e.functionOf(row.owner);
    const area = report.domainAssignments?.[action.id];
    if (area?.owner) return e.functionOf(area.owner);
  }
  if (action.type === 'confirm' || action.type === 'scope') {
    const plan = report.followUpPlan.find((p: any) => p.id === action.id);
    if (plan) return plan.fn;
  }
  const owner = e.MOD[action.id]?.owner;
  return owner ? e.functionOf(owner) : 'Executive and governance';
}

export function managementView(live: LiveSession) {
  const e = live.engine;
  const report = reportFor(live);
  const snapshot = snapshotView(live);
  const groups = new Map<string, { actor: string; actions: { type: string; id: string; text: string }[] }>();
  for (const action of report.actions as any[]) {
    const actor = actorFor(e, report, action);
    if (!groups.has(actor)) groups.set(actor, { actor, actions: [] });
    groups.get(actor)!.actions.push({ type: action.type, id: action.id, text: plain(action.text) });
  }
  // MK reviewer actions belong to the separate Advisory service: they are kept, but never listed as standard work.
  const order = ['Respondent', ...e.FUNCTIONS];
  const whoActsNext = [...groups.values()].filter((g) => g.actor !== 'MK reviewer').sort((a, b) => order.indexOf(a.actor) - order.indexOf(b.actor));
  const advisoryActions = groups.get('MK reviewer')?.actions ?? [];
  const needsAnswerByFunction = new Map<string, { fn: string; slug: string; items: { id: string; title: string; why: string }[] }>();
  const addAnswer = (fn: string, id: string, title: string, why: string) => {
    if (!needsAnswerByFunction.has(fn)) needsAnswerByFunction.set(fn, { fn, slug: ownerFunctionSlug(fn), items: [] });
    needsAnswerByFunction.get(fn)!.items.push({ id, title, why });
  };
  snapshot.waiting.forEach((w: any) => addAnswer(w.ownerFunction ?? 'Executive and governance', w.id, w.title, w.via));
  snapshot.openScenarios.forEach((s: any) => addAnswer(s.accountableFunction ?? 'Executive and governance', s.id, s.name, s.whyOpen));
  return {
    organisationLabel: live.record.organisationLabel,
    asOf: live.asOf,
    status: snapshot.status,
    staged: snapshot.staged,
    counts: snapshot.counts,
    needsAnswer: [...needsAnswerByFunction.values()].sort((a, b) => e.FUNCTIONS.indexOf(a.fn) - e.FUNCTIONS.indexOf(b.fn)),
    needsRemediation: { reportedGaps: snapshot.reportedGaps },
    whoActsNext,
    /** The standard assessment's status: interview, function packages, information and report eligibility. */
    completion: snapshot.status.assessment.facets,
    /**
     * The separate MK Advisory evidence-review service. Its records are kept in full (and in the export and the reviewer
     * workspace); they are shown apart and are not a condition of completing the standard assessment.
     */
    advisory: {
      records: snapshot.status.advisory.records,
      candidates: snapshot.evidenceToReview,
      reviewerFindings: (report.reviewerFindings as any[]).map((f) => ({ id: f.id, title: f.key, area: areaName(e, f.id), respondent: f.respondent, evidence: f.evidence ? EVIDENCE_LABEL[f.evidence.state] : null, conclusion: f.review?.conclusion ? CONCLUSION_LABEL[f.review.conclusion] : null, followUp: f.followUp })),
      tasks: report.reviewerTasks.length, reReview: report.reReview.length, actions: advisoryActions
    },
    ownerPackages: snapshot.ownerPackages,
    seq: live.record.actions.length
  };
}

// ---------------------------------------------------------------------------------------------------------- export

export function exportView(live: LiveSession) {
  const report = reportFor(live);
  return {
    // The export format is this build's contract; the ruleset is the one the session was recorded under and validated against.
    contract: { name: READINESS_REVIEW_CONTRACT.name, version: READINESS_REVIEW_CONTRACT.version, actionSchema: READINESS_REVIEW_CONTRACT.actionSchema },
    ruleset: { recorded: live.ruleset, reader: live.rulesetReader },
    engine: live.ruleset.engine,
    bank: live.ruleset.bank,
    coverage: live.ruleset.coverage,
    approval: READINESS_REVIEW_CONTRACT.approval,
    session: { sessionId: live.record.sessionId, organisationLabel: live.record.organisationLabel, fictional: live.record.fictional, createdAt: live.record.createdAt, asOf: live.asOf, actions: live.record.actions.length },
    report,
    views: { snapshot: snapshotView(live), management: managementView(live) }
  };
}

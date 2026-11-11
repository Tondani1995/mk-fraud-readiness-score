/**
 * Actions, replay and validation for a review session. Pure: no input or output, no clock other than the stored one.
 *
 * A session is an append-only log of actions. The engine's own state (answers, assignments, evidence, reviews,
 * history) is rebuilt by replaying the log through the vendored engine, so the log is the record and the engine is
 * the only interpreter. Calls that change engine state while choosing the next question (`next` and `nextOwner`) are
 * recorded as explicit "serve" actions. That makes a rebuilt session identical to the live one, including its
 * timestamps, and lets every respondent or owner answer be checked against the exact question that was shown.
 */
import { createReviewEngine, isStagedEngine, loadedRulesetProblem, type DepthSelection, type EngineInstance, type EngineStep, type ReviewClock } from './engine';
import { READINESS_REVIEW_CONTRACT } from './contract';

export const REVIEW_ACTORS = ['respondent', 'owner', 'organisation', 'reviewer', 'system'] as const;
export type ReviewActor = (typeof REVIEW_ACTORS)[number];

export type AnswerValue = string | string[];
export type AnswerDetail = {
  reach?: 'units' | 'cases' | 'provider';
  note?: string;
  tested?: 'yes' | 'no' | 'unsure';
  ev?: 'yes' | 'partly' | 'no';
};

export type ReviewAction =
  | { type: 'respondent.serve'; q: string | null }
  | { type: 'respondent.answer'; q: string; value: AnswerValue; detail?: AnswerDetail }
  | { type: 'respondent.assignArea'; domain: string; owner: string }
  | { type: 'respondent.correct'; q: string; value: AnswerValue }
  | { type: 'respondent.stop' }
  | { type: 'respondent.resume' }
  | { type: 'owner.serve'; fn: string; q: string | null }
  | { type: 'owner.answer'; fn: string; q: string; value: AnswerValue }
  /** Build 1.6 only: an accountable function declines a question assigned to it; it stays outstanding with the reason. */
  | { type: 'owner.decline'; fn: string; q: string; reason: string }
  /** Build 1.6 accepts a depth selection: none, the recommended selection (default) or chosen candidate ids. */
  | { type: 'organisation.sendToOwners'; depth?: DepthSelection }
  | { type: 'reviewer.evidence'; q: string; state: string; basis: string }
  | { type: 'reviewer.review'; q: string; conclusion: string | null; basis: string; followUp: string; limitation: string };

export type StoredAction = ReviewAction & { id: string; seq: number; at: string; actor: ReviewActor };

export type SessionTokens = {
  respondent: string;
  management: string;
  reviewer: string;
  links: string;
  owners: Record<string, string>;
};

/** The complete ruleset a session was recorded under (contract 1.3.0). Stored once, never changed. */
export type RecordedRuleset = {
  contract: { name: string; version: string; actionSchema: string };
  engine: { build: string; sha256: string };
  bank: { version: string; sha256: string; digest: string | null };
  coverage: { version: string | null; sha256: string; digest: string | null };
};

export type SessionRecord = {
  sessionId: string;
  createdAt: string;
  contractVersion: string;
  engineSha256: string;
  bankVersion: string;
  /** Absent only on records written under contracts 1.0.0 to 1.2.0; see validateRecordRuleset. */
  ruleset?: RecordedRuleset;
  organisationLabel: string;
  /** Every session in this candidate is fictional; the harness refuses to store anything else. */
  fictional: true;
  tokens: SessionTokens;
  actions: StoredAction[];
};

export type LiveSession = {
  record: SessionRecord;
  /** The validated ruleset this session is bound to, and how it was established. */
  ruleset: RecordedRuleset;
  rulesetReader: 'recorded' | 'historical-1.0-1.2';
  engine: EngineInstance;
  clock: ReviewClock;
  /** undefined: not yet served; null: nothing left for the respondent; otherwise the question on screen. */
  respondentStep: EngineStep | null | undefined;
  ownerSteps: Record<string, EngineStep | null | undefined>;
  asOf: string;
  reportCache?: { seq: number; report: any };
};

export class ReplayError extends Error {}
/** The data this build loaded is not the data its contract declares; nothing should be replayed or written. */
export class RulesetIntegrityError extends Error {}

export function currentRuleset(build: string = '1.5'): RecordedRuleset {
  const c = READINESS_REVIEW_CONTRACT;
  const staged = build === c.stagedBuild.engine.build;
  if (!staged && build !== c.engine.build) throw new Error(`No review engine build ${build}`);
  return {
    contract: staged ? { name: c.name, version: c.stagedBuild.contractVersion, actionSchema: c.stagedBuild.actionSchema } : { name: c.name, version: c.version, actionSchema: c.actionSchema },
    engine: staged ? { build: c.stagedBuild.engine.build, sha256: c.stagedBuild.engine.sha256 } : { build: c.engine.build, sha256: c.engine.sha256 },
    bank: { version: c.bank.version, sha256: c.bank.sha256, digest: c.bank.digest },
    coverage: { version: c.coverage.version, sha256: c.coverage.sha256, digest: c.coverage.digest }
  };
}

/** A new, empty session record bound to this build's complete ruleset. */
export function newSessionRecord(input: { sessionId: string; createdAt: string; organisationLabel: string; tokens: SessionTokens; build?: '1.5' | '1.6' }): SessionRecord {
  const ruleset = currentRuleset(input.build ?? '1.5');
  return {
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    contractVersion: ruleset.contract.version,
    engineSha256: ruleset.engine.sha256,
    bankVersion: ruleset.bank.version,
    ruleset,
    organisationLabel: input.organisationLabel,
    fictional: true,
    tokens: input.tokens,
    actions: []
  };
}

/**
 * Establishes the exact ruleset a stored record was made under and refuses it unless this build runs that ruleset.
 * Nothing is migrated or relabelled: a record either replays under its own ruleset or is refused with the reason.
 */
export function validateRecordRuleset(record: SessionRecord): { ruleset: RecordedRuleset; reader: LiveSession['rulesetReader'] } {
  const problem = loadedRulesetProblem();
  if (problem) throw new RulesetIntegrityError(problem);
  const now = currentRuleset();
  const c = READINESS_REVIEW_CONTRACT;
  const refuse = (why: string) => {
    throw new ReplayError(`Session ${record.sessionId} cannot be replayed by this build: ${why}`);
  };
  if (record.ruleset && record.ruleset.engine?.build === c.stagedBuild.engine.build) {
    // A build 1.6 record: replayed only by this exact staged build over the same bank and coverage map.
    const r = record.ruleset;
    const s = c.stagedBuild;
    if (r.contract?.name !== c.name || r.contract.version !== s.contractVersion || r.contract.actionSchema !== s.actionSchema) refuse(`it was recorded under staged contract ${r.contract?.version} with ${r.contract?.actionSchema}.`);
    if (r.engine.sha256 !== s.engine.sha256) refuse(`it was recorded with staged engine ${String(r.engine.sha256).slice(0, 12)}; this build runs ${s.engine.sha256.slice(0, 12)}.`);
    if (r.bank?.sha256 !== now.bank.sha256 || r.bank?.digest !== now.bank.digest || r.bank?.version !== now.bank.version) refuse(`it was recorded with question bank ${r.bank?.version} (${String(r.bank?.sha256).slice(0, 12)}).`);
    if (r.coverage?.sha256 !== now.coverage.sha256 || r.coverage?.digest !== now.coverage.digest) refuse(`it was recorded with coverage map ${String(r.coverage?.sha256).slice(0, 12)}.`);
    if (record.contractVersion !== r.contract.version || record.engineSha256 !== r.engine.sha256 || record.bankVersion !== r.bank.version) refuse('its summary fields disagree with its recorded ruleset.');
    return { ruleset: r, reader: 'recorded' };
  }
  if (record.ruleset) {
    const r = record.ruleset;
    if (r.contract?.name !== c.name) refuse(`it belongs to contract "${r.contract?.name}".`);
    if (!(c.recordContracts as readonly string[]).includes(r.contract.version)) refuse(`it was recorded under contract ${r.contract.version}, which this build does not read.`);
    if (r.contract.actionSchema !== c.actionSchema) refuse(`its actions use schema ${r.contract.actionSchema}.`);
    if (r.engine?.sha256 !== now.engine.sha256) refuse(`it was recorded with engine ${String(r.engine?.sha256).slice(0, 12)}; this build runs ${now.engine.sha256.slice(0, 12)}.`);
    if (r.bank?.sha256 !== now.bank.sha256 || r.bank?.digest !== now.bank.digest || r.bank?.version !== now.bank.version) refuse(`it was recorded with question bank ${r.bank?.version} (${String(r.bank?.sha256).slice(0, 12)}); this build runs ${now.bank.version} (${now.bank.sha256.slice(0, 12)}).`);
    if (r.coverage?.sha256 !== now.coverage.sha256 || r.coverage?.digest !== now.coverage.digest) refuse(`it was recorded with coverage map ${String(r.coverage?.sha256).slice(0, 12)}; this build runs ${now.coverage.sha256.slice(0, 12)}.`);
    if (record.contractVersion !== r.contract.version || record.engineSha256 !== r.engine.sha256 || record.bankVersion !== r.bank.version) refuse('its summary fields disagree with its recorded ruleset.');
    return { ruleset: r, reader: 'recorded' };
  }
  const h = c.historicalRecordContracts;
  if (!(h.versions as readonly string[]).includes(record.contractVersion)) refuse(`it was recorded under contract ${record.contractVersion} without a ruleset identity.`);
  if (record.engineSha256 !== h.engineSha256 || record.bankVersion !== h.bankVersion) refuse(`it names engine ${String(record.engineSha256).slice(0, 12)} and bank ${record.bankVersion}, which contract ${record.contractVersion} was never released with.`);
  if (now.engine.sha256 !== h.engineSha256 || now.bank.sha256 !== h.bankSha256 || now.coverage.sha256 !== h.coverageSha256) refuse(`contract ${record.contractVersion} records are bound to the 1.3-review bank and coverage map, which this build does not run.`);
  return {
    ruleset: {
      contract: { name: c.name, version: record.contractVersion, actionSchema: c.actionSchema },
      engine: { build: c.engine.build, sha256: h.engineSha256 },
      bank: { version: h.bankVersion, sha256: h.bankSha256, digest: null },
      coverage: { version: null, sha256: h.coverageSha256, digest: null }
    },
    reader: 'historical-1.0-1.2'
  };
}
export type RejectionCode = 'stale_question' | 'invalid_value' | 'not_allowed' | 'unknown_question' | 'invalid_input';
export class ActionRejected extends Error {
  code: RejectionCode;
  constructor(code: RejectionCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ACTIVE_ASSIGNMENT = ['assigned', 'accepted', 'overdue', 'owner-unknown'];
const RESPONDENT_ACTIONS = new Set(['respondent.answer', 'respondent.correct', 'respondent.assignArea', 'respondent.stop', 'respondent.resume']);
const HARNESS_REVIEWER = 'MK reviewer (fictional harness)';

export function ownerFunctionSlug(fn: string) {
  return fn.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
}

function stepId(step: EngineStep | null | undefined) {
  return step ? step.q.id : null;
}

/** Applies one stored action to the engine. Used by replay and, after validation, by live commits. */
function applyStored(live: LiveSession, a: StoredAction) {
  const e = live.engine;
  live.clock.now = a.at;
  switch (a.type) {
    case 'respondent.serve': {
      const step = e.next({ respondentOnly: true });
      if (stepId(step) !== a.q) throw new ReplayError(`Replay diverged at #${a.seq}: expected ${a.q}, engine served ${stepId(step)}`);
      live.respondentStep = step;
      return;
    }
    case 'respondent.answer': {
      const step = live.respondentStep;
      if (!step || step.q.id !== a.q) throw new ReplayError(`Replay diverged at #${a.seq}: answer for ${a.q} without that question on screen`);
      e.answer(step.q, a.value, step.kind, { by: 'Respondent', ...(a.detail ?? {}) });
      live.respondentStep = undefined;
      return;
    }
    case 'respondent.assignArea':
      e.assignDomain(a.domain, a.owner);
      live.respondentStep = undefined;
      return;
    case 'respondent.correct':
      e.correct(a.q, a.value, { by: 'Respondent', note: 'Changed by the respondent' });
      live.respondentStep = undefined;
      return;
    case 'respondent.stop':
      e.stop();
      live.respondentStep = undefined;
      return;
    case 'respondent.resume':
      e.resume();
      live.respondentStep = undefined;
      return;
    case 'owner.serve': {
      const step = e.nextOwner(a.fn);
      if (stepId(step) !== a.q) throw new ReplayError(`Replay diverged at #${a.seq}: owner ${a.fn} expected ${a.q}, engine served ${stepId(step)}`);
      live.ownerSteps[a.fn] = step;
      return;
    }
    case 'owner.answer': {
      const step = live.ownerSteps[a.fn];
      if (!step || step.q.id !== a.q) throw new ReplayError(`Replay diverged at #${a.seq}: owner answer for ${a.q} without that question on screen`);
      e.ownerReturn(a.q, a.value, { by: a.fn, role: step.suggested ?? null });
      live.ownerSteps[a.fn] = undefined;
      return;
    }
    case 'owner.decline': {
      if (!isStagedEngine(e)) throw new ReplayError(`Replay diverged at #${a.seq}: owner.decline in a build ${live.ruleset.engine.build} session`);
      e.ownerDecline(a.q, a.fn, a.reason);
      live.ownerSteps[a.fn] = undefined;
      return;
    }
    case 'organisation.sendToOwners':
      if (isStagedEngine(e)) e.planFollowUp({ by: 'The organisation', depth: a.depth ?? 'recommended' });
      else e.planFollowUp({ by: 'The organisation' });
      return;
    case 'reviewer.evidence':
      e.setEvidence(a.q, a.state, { by: HARNESS_REVIEWER, basis: a.basis });
      return;
    case 'reviewer.review':
      e.setReview(a.q, a.conclusion, { by: HARNESS_REVIEWER, basis: a.basis, followUp: a.followUp, limitation: a.limitation });
      return;
  }
}

export function replay(record: SessionRecord): LiveSession {
  // A session is replayed only under the exact ruleset it was recorded with; it is never silently reinterpreted.
  const { ruleset, reader } = validateRecordRuleset(record);
  const clock: ReviewClock = { now: record.createdAt };
  const live: LiveSession = { record, ruleset, rulesetReader: reader, engine: createReviewEngine(clock, ruleset.engine.build), clock, respondentStep: undefined, ownerSteps: {}, asOf: record.createdAt };
  for (const a of record.actions) applyStored(live, a);
  live.asOf = record.actions.at(-1)?.at ?? record.createdAt;
  return live;
}

function respondentStepValid(e: EngineInstance, step: EngineStep | null | undefined) {
  if (!step) return false;
  const q = step.q;
  if (q.id === '__assumptions__') return (q.facts ?? []).some((id) => !e.S.ans[id]);
  const ans = e.S.ans[q.id];
  if (ans && !ans.stale) return false;
  const assignment = e.S.assign[q.id];
  if (assignment && ACTIVE_ASSIGNMENT.includes(assignment.status)) return false;
  if (e.DOM[q.id] && e.S.domainAssign[e.DOM[q.id]]) return false;
  return !['outofscope', 'proportion', 'precluded', 'retired'].includes(e.scope(q).st);
}

function ownerStepValid(e: EngineInstance, step: EngineStep | null | undefined) {
  if (!step) return false;
  const ans = e.S.ans[step.q.id];
  if (ans && !ans.stale && ans.v !== 'unknown') return false;
  return !['outofscope', 'proportion', 'precluded', 'retired'].includes(e.scope(step.q).st);
}

function ownerFingerprint(e: EngineInstance) {
  const statuses = Object.values(e.S.assign as Record<string, { status: string }>).map((a) => a.status).join(',');
  return `${Object.keys(e.S.assign).length}|${e.S.followUp?.extended ?? 0}|${statuses}`;
}

type Draft = { live: LiveSession; at: string; seq: number; out: StoredAction[]; newId: () => string };

function draft(live: LiveSession, at: string, newId: () => string): Draft {
  return { live, at, seq: live.record.actions.length, out: [], newId };
}

function push(d: Draft, action: ReviewAction, actor: ReviewActor) {
  const stored = { ...action, id: d.newId(), seq: d.seq++, at: d.at, actor } as StoredAction;
  applyStored(d.live, stored);
  d.out.push(stored);
  d.live.asOf = d.at;
  return stored;
}

/** Asks the engine for the respondent's next question and records the call, because next() itself changes state. */
function serveRespondent(d: Draft) {
  d.live.clock.now = d.at;
  const step = d.live.engine.next({ respondentOnly: true });
  d.live.respondentStep = step;
  d.out.push({ type: 'respondent.serve', q: stepId(step), id: d.newId(), seq: d.seq++, at: d.at, actor: 'system' } as StoredAction);
  d.live.asOf = d.at;
}

/**
 * Serves an accountable function's next question when none is on screen or the one on screen no longer applies.
 * nextOwner() can assign questions to the function (when its package is extended), so any call that changed state or
 * changed the question on screen is recorded. A call that changed nothing is a pure read and is not recorded.
 */
function serveOwner(d: Draft, fn: string, force = false) {
  const e = d.live.engine;
  const current = d.live.ownerSteps[fn];
  if (!force && current && ownerStepValid(e, current)) return;
  const before = ownerFingerprint(e);
  d.live.clock.now = d.at;
  const step = e.nextOwner(fn);
  const changed = force || current === undefined || before !== ownerFingerprint(e) || stepId(step) !== stepId(current ?? null);
  d.live.ownerSteps[fn] = step;
  if (!changed) return;
  d.out.push({ type: 'owner.serve', fn, q: stepId(step), id: d.newId(), seq: d.seq++, at: d.at, actor: 'system' } as StoredAction);
  d.live.asOf = d.at;
}

/** Called when an owner opens their package. Returns the serve actions to append (often none). */
export function ensureOwnerServed(live: LiveSession, fn: string, at: string, newId: () => string): StoredAction[] {
  if (!live.engine.FUNCTIONS.includes(fn)) throw new ActionRejected('invalid_input', 'Unknown accountable function');
  const d = draft(live, at, newId);
  serveOwner(d, fn);
  return d.out;
}

/** Called when the respondent opens the interview. Re-serves only if the question on screen no longer applies. */
export function ensureRespondentServed(live: LiveSession, at: string, newId: () => string): StoredAction[] {
  const d = draft(live, at, newId);
  const e = live.engine;
  const current = live.respondentStep;
  if (current === undefined || (current === null && !e.S.ended) || (current && !respondentStepValid(e, current))) serveRespondent(d);
  return d.out;
}

function sanitiseText(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function sanitiseDetail(detail: AnswerDetail | undefined): AnswerDetail | undefined {
  if (!detail) return undefined;
  const out: AnswerDetail = {};
  if (detail.reach && ['units', 'cases', 'provider'].includes(detail.reach)) out.reach = detail.reach;
  if (detail.tested && ['yes', 'no', 'unsure'].includes(detail.tested)) out.tested = detail.tested;
  if (detail.ev && ['yes', 'partly', 'no'].includes(detail.ev)) out.ev = detail.ev;
  const note = sanitiseText(detail.note, 500);
  if (note) out.note = note;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validates an incoming action against the live session and applies it, followed by any serve the engine needs.
 * Returns the actions to append. The live session is mutated, so a caller that fails to persist must discard it.
 */
export function commit(live: LiveSession, input: ReviewAction, actor: ReviewActor, at: string, newId: () => string): StoredAction[] {
  const e = live.engine;
  const d = draft(live, at, newId);
  const normalise = (qid: string, value: unknown, q = e.QI[qid]) => {
    if (!q) throw new ActionRejected('unknown_question', `Unknown question ${qid}`);
    try {
      return e.normalise(q, value) as AnswerValue;
    } catch (error) {
      throw new ActionRejected('invalid_value', error instanceof Error ? error.message : 'Invalid answer');
    }
  };
  const answered = (qid: string) => {
    const a = e.S.ans[qid];
    if (!a || a.stale) throw new ActionRejected('not_allowed', `${qid} has no current answer to review`);
    if (a.v === 'unknown') throw new ActionRejected('not_allowed', `${qid} is waiting for an owner; there is no answer to review`);
  };

  switch (input.type) {
    case 'respondent.answer': {
      const step = live.respondentStep;
      if (!step || step.q.id !== input.q) throw new ActionRejected('stale_question', 'This question is no longer the one waiting for an answer. The current question has been reloaded.');
      const value = normalise(input.q, input.value, step.q);
      push(d, { type: 'respondent.answer', q: input.q, value, detail: sanitiseDetail(input.detail) }, 'respondent');
      break;
    }
    case 'respondent.assignArea': {
      if (!e.DOMS.includes(input.domain)) throw new ActionRejected('invalid_input', 'Unknown area');
      const owner = sanitiseText(input.owner, 120);
      if (!owner) throw new ActionRejected('invalid_input', 'An owner is required');
      push(d, { type: 'respondent.assignArea', domain: input.domain, owner }, 'respondent');
      break;
    }
    case 'respondent.correct': {
      const prev = e.S.ans[input.q];
      if (!prev || prev.via === 'owner' || prev.via === 'assumptions') throw new ActionRejected('not_allowed', 'Only an answer the respondent gave can be changed here.');
      push(d, { type: 'respondent.correct', q: input.q, value: normalise(input.q, input.value) }, 'respondent');
      break;
    }
    case 'respondent.stop':
      if (e.S.ended) throw new ActionRejected('not_allowed', 'The interview has already ended.');
      push(d, { type: 'respondent.stop' }, 'respondent');
      break;
    case 'respondent.resume':
      if (!e.S.ended || e.S.stopReason !== 'respondent') throw new ActionRejected('not_allowed', 'Only an interview the respondent stopped can be resumed.');
      push(d, { type: 'respondent.resume' }, 'respondent');
      break;
    case 'owner.answer': {
      if (!e.FUNCTIONS.includes(input.fn)) throw new ActionRejected('invalid_input', 'Unknown accountable function');
      const step = live.ownerSteps[input.fn];
      if (!step || step.q.id !== input.q) throw new ActionRejected('stale_question', 'This question is no longer the one waiting for this function. The current question has been reloaded.');
      push(d, { type: 'owner.answer', fn: input.fn, q: input.q, value: normalise(input.q, input.value, step.q) }, 'owner');
      break;
    }
    case 'organisation.sendToOwners':
      if (isStagedEngine(e)) {
        // Build 1.6: packages can be sent once the core stage is complete, and sent again as answers change; a question
        // already with a function is never assigned twice.
        if (!e.stages().core.complete) throw new ActionRejected('not_allowed', 'Packages are sent to accountable functions once the core stage is complete.');
        const depth = input.depth ?? 'recommended';
        if (Array.isArray(depth)) {
          const candidates = new Set(e.depthCandidates().map((c) => c.id));
          if (depth.length > 200 || depth.some((id) => typeof id !== 'string' || !candidates.has(id))) throw new ActionRejected('invalid_input', 'The selection includes a question that is not a current candidate.');
        } else if (depth !== 'none' && depth !== 'recommended') throw new ActionRejected('invalid_input', 'Unknown selection');
        push(d, { type: 'organisation.sendToOwners', depth }, 'organisation');
        break;
      }
      if (!e.S.ended) throw new ActionRejected('not_allowed', 'Open questions are sent to accountable functions after the interview has ended.');
      if (e.S.followUp) throw new ActionRejected('not_allowed', 'Open questions have already been sent to accountable functions.');
      push(d, { type: 'organisation.sendToOwners' }, 'organisation');
      break;
    case 'owner.decline': {
      if (!isStagedEngine(e)) throw new ActionRejected('not_allowed', 'Declining a question is available only in staged sessions.');
      if (!e.FUNCTIONS.includes(input.fn)) throw new ActionRejected('invalid_input', 'Unknown accountable function');
      const a = e.S.assign[input.q];
      const assignedHere = !!a && a.fn === input.fn && ['assigned', 'accepted', 'overdue'].includes(a.status);
      // A delegated-area question has no assignment until it is answered or declined; it can be declined while on screen.
      const onScreen = !a && live.ownerSteps[input.fn]?.q.id === input.q;
      if (!assignedHere && !onScreen) throw new ActionRejected('not_allowed', 'Only a question assigned to this function, or the one on its screen, can be declined.');
      const reason = sanitiseText(input.reason, 300);
      if (!reason) throw new ActionRejected('invalid_input', 'A reason is required');
      push(d, { type: 'owner.decline', fn: input.fn, q: input.q, reason }, 'owner');
      break;
    }
    case 'reviewer.evidence': {
      answered(input.q);
      if (!e.EV_STATES.includes(input.state)) throw new ActionRejected('invalid_input', 'Unknown evidence state');
      push(d, { type: 'reviewer.evidence', q: input.q, state: input.state, basis: sanitiseText(input.basis, 1000) }, 'reviewer');
      break;
    }
    case 'reviewer.review': {
      answered(input.q);
      const conclusion = input.conclusion || null;
      if (conclusion && !e.CONCLUSIONS.includes(conclusion)) throw new ActionRejected('invalid_input', 'Unknown conclusion');
      const followUp = sanitiseText(input.followUp, 1000);
      if (!conclusion && !followUp) throw new ActionRejected('invalid_input', 'Record a conclusion or a follow-up.');
      push(d, { type: 'reviewer.review', q: input.q, conclusion, basis: sanitiseText(input.basis, 1000), followUp, limitation: sanitiseText(input.limitation, 1000) }, 'reviewer');
      break;
    }
    default:
      throw new ActionRejected('invalid_input', 'This action cannot be submitted.');
  }

  // Serves that keep the respondent's and the owner's screens consistent with the engine.
  if (RESPONDENT_ACTIONS.has(input.type)) serveRespondent(d);
  else if (input.type === 'owner.answer' || input.type === 'owner.decline' || input.type === 'organisation.sendToOwners') {
    const current = live.respondentStep;
    if ((current === null && !e.S.ended) || (current && !respondentStepValid(e, current))) serveRespondent(d);
    if (input.type === 'owner.answer' || input.type === 'owner.decline') serveOwner(d, input.fn, true);
  }
  live.asOf = at;
  return d.out;
}

/** The initial actions of a new session: the first respondent serve. */
export function initialActions(live: LiveSession, at: string, newId: () => string): StoredAction[] {
  const d = draft(live, at, newId);
  serveRespondent(d);
  return d.out;
}

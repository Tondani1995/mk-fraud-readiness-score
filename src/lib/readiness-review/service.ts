import { randomBytes, randomUUID } from 'node:crypto';
import { READINESS_REVIEW_CONTRACT } from './contract';
import { reviewEngineBuild, reviewHarnessStatus } from './harness';
import {
  ActionRejected,
  commit,
  ensureOwnerServed,
  ensureRespondentServed,
  initialActions,
  newSessionRecord,
  ownerFunctionSlug,
  replay,
  type LiveSession,
  type ReviewAction,
  type ReviewActor,
  type SessionRecord,
  type StoredAction
} from './session';
import { FileReviewStore, StoreConflict, StoreOutcomeUnknown, type ReviewStore, type TokenEntry } from './store';
import { reviewDatabaseConfig, reviewStoreKind } from './database-config';
import { DatabaseReviewStore } from './database-store';
import { exportView, managementView, ownerView, respondentView, reviewerView, snapshotView } from './view-model';
import { createReviewEngine } from './engine';

/**
 * Server-side orchestration for the review track: one store, one cached live session per session, and a queue per
 * session so that writes are applied one at a time. Every read and write goes through the same view-model functions.
 */

export class HarnessUnavailable extends Error {}
export class TokenNotFound extends Error {}
export class SaveConflict extends Error {
  current: unknown;
  constructor(current: unknown) {
    super('The session was updated elsewhere.');
    this.current = current;
  }
}
export class SaveFailed extends Error {}

type Globals = { store?: ReviewStore; cache: Map<string, LiveSession>; queues: Map<string, Promise<unknown>> };
const globals: Globals = ((globalThis as any).__mkReadinessReview ??= { cache: new Map(), queues: new Map() });

function store(): ReviewStore {
  if (!reviewHarnessStatus().enabled) throw new HarnessUnavailable('The review track is not available in this environment.');
  if (!globals.store) globals.store = reviewStoreKind() === 'database' ? DatabaseReviewStore.connect(reviewDatabaseConfig()) : new FileReviewStore();
  return globals.store;
}

function token() {
  return randomBytes(18).toString('base64url');
}

async function serial<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const previous = globals.queues.get(sessionId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  globals.queues.set(sessionId, run.catch(() => undefined));
  return run;
}

async function liveFor(sessionId: string): Promise<LiveSession> {
  const cached = globals.cache.get(sessionId);
  if (cached) {
    // Another server process may have appended to a shared store since this one cached the session.
    if (!store().shared) return cached;
    const stored = await store().actionCount(sessionId);
    if (stored === cached.record.actions.length) return cached;
    globals.cache.delete(sessionId);
    if (stored === null) throw new TokenNotFound('Session not found');
  }
  const record = await store().load(sessionId);
  if (!record) throw new TokenNotFound('Session not found');
  const live = replay(record);
  globals.cache.set(sessionId, live);
  return live;
}

async function resolve(tokenValue: string): Promise<TokenEntry> {
  const entry = await store().findToken(tokenValue);
  if (!entry) throw new TokenNotFound('This link is not recognised.');
  return entry;
}

async function persist(live: LiveSession, actions: StoredAction[], expectedLength: number) {
  if (!actions.length) return;
  try {
    await store().append(live.record.sessionId, expectedLength, actions);
    live.record = { ...live.record, actions: live.record.actions.concat(actions) };
  } catch (error) {
    // The cached engine already includes these actions; drop it so the next request rebuilds from the stored log.
    globals.cache.delete(live.record.sessionId);
    // A conflict, and a save the store could not confirm either way, are reported as they are, never as "nothing saved".
    if (error instanceof StoreConflict || error instanceof StoreOutcomeUnknown) throw error;
    throw new SaveFailed(error instanceof Error ? error.message : 'Save failed');
  }
}

export type CreatedSession = { sessionId: string; tokens: SessionRecord['tokens'] };

export async function createSession(organisationLabel: string): Promise<CreatedSession> {
  const label = organisationLabel.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Fictional organisation';
  const sessionId = randomUUID().replace(/-/g, '');
  const at = new Date().toISOString();
  const functions = createReviewEngine({ now: at }).FUNCTIONS;
  const record: SessionRecord = newSessionRecord({
    build: reviewEngineBuild(),
    sessionId,
    createdAt: at,
    organisationLabel: label,
    tokens: { respondent: token(), management: token(), reviewer: token(), links: token(), owners: Object.fromEntries(functions.map((fn) => [fn, token()])) }
  });
  const live = replay(record);
  const first = initialActions(live, at, () => randomUUID());
  record.actions = first;
  live.record = record;
  // Returns only once the record and every role link are stored; a failure stores nothing and is reported as such.
  await store().create(record);
  globals.cache.set(sessionId, live);
  return { sessionId, tokens: record.tokens };
}

export type RoleView =
  | { role: 'respondent'; view: ReturnType<typeof respondentView> }
  | { role: 'owner'; view: ReturnType<typeof ownerView> }
  | { role: 'reviewer'; view: ReturnType<typeof reviewerView> }
  | { role: 'management'; view: ReturnType<typeof managementView> }
  | { role: 'links'; view: { organisationLabel: string; sessionId: string; tokens: SessionRecord['tokens']; functions: { fn: string; slug: string; token: string }[] } };

export async function viewFor(tokenValue: string): Promise<RoleView> {
  const entry = await resolve(tokenValue);
  return serial(entry.sessionId, async () => {
    const live = await liveFor(entry.sessionId);
    const at = new Date().toISOString();
    if (entry.role === 'respondent') {
      const expected = live.record.actions.length;
      await persist(live, ensureRespondentServed(live, at, () => randomUUID()), expected);
      return { role: 'respondent', view: respondentView(live) };
    }
    if (entry.role === 'owner') {
      const expected = live.record.actions.length;
      await persist(live, ensureOwnerServed(live, entry.fn!, at, () => randomUUID()), expected);
      return { role: 'owner', view: ownerView(live, entry.fn!) };
    }
    if (entry.role === 'reviewer') return { role: 'reviewer', view: reviewerView(live) };
    if (entry.role === 'management') return { role: 'management', view: managementView(live) };
    return { role: 'links', view: { organisationLabel: live.record.organisationLabel, sessionId: live.record.sessionId, tokens: live.record.tokens, functions: Object.entries(live.record.tokens.owners).map(([fn, t]) => ({ fn, slug: ownerFunctionSlug(fn), token: t })) } };
  });
}

/** The organisation-facing Snapshot, available to the respondent and to management. */
export async function snapshotFor(tokenValue: string) {
  const entry = await resolve(tokenValue);
  if (!['respondent', 'management'].includes(entry.role)) throw new TokenNotFound('This link does not open a Snapshot.');
  return serial(entry.sessionId, async () => {
    const live = await liveFor(entry.sessionId);
    return { role: entry.role, view: snapshotView(live), tokens: entry.role === 'respondent' ? { management: live.record.tokens.management } : null };
  });
}

/**
 * B5: the live session behind a respondent or management link, read under the session's write queue so the log
 * position returned is the one the caller binds. Owner, reviewer and links roles cannot bind a session to an order.
 */
export async function sessionForCommercialBinding(tokenValue: string) {
  const entry = await resolve(tokenValue);
  if (!['respondent', 'management'].includes(entry.role)) throw new TokenNotFound('This link cannot request a paid report.');
  return serial(entry.sessionId, async () => {
    const live = await liveFor(entry.sessionId);
    return { role: entry.role, live, actionCount: live.record.actions.length };
  });
}

/**
 * B5: a session replayed from the stored log, bypassing the cache, for report generation. The report is always built
 * from what the store holds, never from a process's memory.
 */
export async function replayStoredSession(sessionId: string, actionCount?: number): Promise<LiveSession> {
  const record = await store().load(sessionId);
  if (!record) throw new TokenNotFound('Session not found');
  if (actionCount === undefined) return replay(record);
  // The log as it stood at a recorded position: a report bound at that position is rebuilt from exactly those actions.
  if (record.actions.length < actionCount) throw new TokenNotFound('The stored log is shorter than the bound position.');
  return replay({ ...record, actions: record.actions.slice(0, actionCount) });
}

export async function exportFor(tokenValue: string) {
  const entry = await resolve(tokenValue);
  if (entry.role === 'owner' || entry.role === 'links') throw new TokenNotFound('This link does not include the export.');
  return serial(entry.sessionId, async () => exportView(await liveFor(entry.sessionId)));
}

const ALLOWED: Record<TokenEntry['role'], ReviewAction['type'][]> = {
  respondent: ['respondent.answer', 'respondent.assignArea', 'respondent.correct', 'respondent.stop', 'respondent.resume', 'organisation.sendToOwners'],
  management: ['organisation.sendToOwners'],
  owner: ['owner.answer', 'owner.decline'],
  reviewer: ['reviewer.evidence', 'reviewer.review'],
  links: []
};

const ACTOR: Record<TokenEntry['role'], ReviewActor> = { respondent: 'respondent', management: 'organisation', owner: 'owner', reviewer: 'reviewer', links: 'system' };

export type Submission = { actionId: string; expectedSeq: number; action: ReviewAction; simulateFailure?: boolean };

export async function submit(tokenValue: string, submission: Submission) {
  const entry = await resolve(tokenValue);
  if (!ALLOWED[entry.role].includes(submission.action.type)) throw new ActionRejected('not_allowed', 'This link cannot make that change.');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(submission.actionId)) throw new ActionRejected('invalid_input', 'Invalid action reference');
  // An accountable-function link always acts as its own function, whatever the submission names.
  const action = entry.role === 'owner' && (submission.action.type === 'owner.answer' || submission.action.type === 'owner.decline') ? { ...submission.action, fn: entry.fn! } : submission.action;
  return serial(entry.sessionId, async () => {
    let live = await liveFor(entry.sessionId);
    // A retried submission that was already stored returns the current state instead of applying twice.
    if (live.record.actions.some((a) => a.id === submission.actionId)) return { duplicate: true, seq: live.record.actions.length };
    if (submission.expectedSeq !== live.record.actions.length) throw new SaveConflict({ seq: live.record.actions.length });
    if (submission.simulateFailure) throw new SaveFailed('Simulated save failure (fictional harness fault injection).');
    const expected = live.record.actions.length;
    let first = true;
    let actions: StoredAction[];
    try {
      actions = commit(live, action, ACTOR[entry.role], new Date().toISOString(), () => {
        if (first) {
          first = false;
          return submission.actionId;
        }
        return randomUUID();
      });
    } catch (error) {
      // Validation rejects before anything is applied, but the cached engine is rebuilt from the stored log in any case.
      globals.cache.delete(entry.sessionId);
      throw error;
    }
    try {
      await persist(live, actions, expected);
    } catch (error) {
      if (error instanceof StoreConflict) {
        live = await liveFor(entry.sessionId);
        throw new SaveConflict({ seq: live.record.actions.length });
      }
      throw error;
    }
    return { duplicate: false, seq: live.record.actions.length };
  });
}

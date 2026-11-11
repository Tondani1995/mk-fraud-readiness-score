import { createClient } from '@supabase/supabase-js';
import { canonicalDigest, sha256Hex } from './canonical';
import type { ReviewDatabaseConfig } from './database-config';
import type { SessionRecord, StoredAction } from './session';
import { StoreConflict, StoreOutcomeUnknown, StoreUnavailable, type ReviewStore, type TokenEntry } from './store';

/**
 * The review store on a Supabase (Postgres) database: supabase/migrations/20261111100000_readiness_review_store.sql.
 * The same contract as the file harness: a session is created whole or not at all, and actions are appended only if
 * the stored log still has the expected length. The database enforces both in one transaction per call, so it holds
 * across any number of server processes. Every call goes through a function that only service_role may execute.
 *
 * A database error means the call changed nothing. A lost response is different: the write may have happened. In
 * that case the store reads the log back and reports what is actually stored, and only says it does not know when it
 * cannot read it back either.
 */

type RpcError = { code?: string; message: string } | null;
export type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }> };

/** Raised by the database: the call ran and changed nothing. */
class DatabaseRefused extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type ReportRunRecord = {
  sessionId: string;
  inputContract: string;
  inputVersion: string;
  inputDigest: string;
  logDigest: string;
  actionCount: number;
  reportEngine: string;
  reportEngineVersion: string;
  status: 'generated' | 'failed';
  output?: unknown;
  outputDigest?: string;
  failure?: string;
  createdBy: string;
};

const ROLES = ['respondent', 'management', 'reviewer', 'links'] as const;

/** Every role link of a record, by the SHA-256 of its token. */
export function linkRows(record: SessionRecord) {
  const t = record.tokens;
  const rows: { tokenSha256: string; role: TokenEntry['role']; fn?: string }[] = ROLES.map((role) => ({ tokenSha256: sha256Hex(t[role]), role }));
  for (const [fn, token] of Object.entries(t.owners)) rows.push({ tokenSha256: sha256Hex(token), role: 'owner', fn });
  return rows;
}

export class DatabaseReviewStore implements ReviewStore {
  readonly shared = true;
  private client: RpcClient;
  constructor(client: RpcClient) {
    this.client = client;
  }

  static connect(config: ReviewDatabaseConfig) {
    const client = createClient(config.url, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-client-info': 'mk-readiness-review-store' } }
    });
    return new DatabaseReviewStore(client as unknown as RpcClient);
  }

  /** Runs a store function. Throws DatabaseRefused when the database answered with an error, anything else when it did not answer. */
  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) {
      if (error.code && /^([0-9A-Z]{5}|PGRST\d+)$/.test(error.code)) throw new DatabaseRefused(error.code, error.message);
      throw new Error(error.message || 'The review database did not answer');
    }
    return data as T;
  }

  async create(record: SessionRecord) {
    const session = {
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      contractVersion: record.contractVersion,
      engineSha256: record.engineSha256,
      bankVersion: record.bankVersion,
      organisationLabel: record.organisationLabel,
      fictional: record.fictional,
      tokens: record.tokens
    };
    try {
      await this.call('review_create_session', {
        p_session: session,
        p_ruleset: record.ruleset ?? null,
        p_ruleset_key: record.ruleset ? canonicalDigest(record.ruleset) : null,
        p_links: linkRows(record),
        p_actions: record.actions
      });
    } catch (error) {
      if (error instanceof DatabaseRefused) {
        if (error.code === '23505') throw new StoreUnavailable('A generated link or reference matched an existing one. Nothing was created; try again.');
        throw new StoreUnavailable('The review could not be started because the database refused the record. Nothing was created.');
      }
      // No answer: find out whether the session was stored before saying anything.
      const stored = await this.load(record.sessionId).catch(() => undefined);
      if (stored === undefined) throw new StoreOutcomeUnknown('The database did not confirm whether the review was started. Open the start page again before trying again.');
      if (stored && stored.actions.length === record.actions.length && stored.actions.every((a, i) => a.id === record.actions[i].id)) return;
      if (stored) throw new StoreUnavailable('A session with this reference already exists. Nothing was created; try again.');
      throw new StoreUnavailable('The review could not be started because it could not be stored. Nothing was created.');
    }
  }

  async load(sessionId: string) {
    try {
      return (await this.call<SessionRecord | null>('review_load_session', { p_session_id: sessionId })) ?? null;
    } catch {
      throw new StoreUnavailable('This review could not be read. Nothing was changed.');
    }
  }

  async findToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    try {
      return (await this.call<TokenEntry | null>('review_find_link', { p_token_sha256: sha256Hex(token) })) ?? null;
    } catch {
      throw new StoreUnavailable('The review links could not be read. Nothing was changed.');
    }
  }

  async append(sessionId: string, expectedLength: number, actions: StoredAction[]) {
    try {
      return await this.call<number>('review_append_actions', { p_session_id: sessionId, p_expected_length: expectedLength, p_actions: actions });
    } catch (error) {
      if (error instanceof DatabaseRefused) {
        // A repeated action id means the log already holds this action: the session moved on, as with a sequence conflict.
        if (error.code === 'RV409' || error.code === '23505') throw new StoreConflict('The session changed before this save.');
        if (error.code === 'RV404') throw new StoreUnavailable('This review is no longer stored. Nothing was recorded.');
        throw new StoreUnavailable('The database refused this save. Nothing was recorded.');
      }
      // No answer: read the log back and report what is actually stored.
      const stored = await this.load(sessionId).catch(() => undefined);
      if (stored === undefined || stored === null) throw new StoreOutcomeUnknown('The database did not confirm whether this was saved. Reload to see what was recorded before trying again.');
      const ours = stored.actions.slice(expectedLength, expectedLength + actions.length);
      if (ours.length === actions.length && ours.every((a, i) => a.id === actions[i].id)) return stored.actions.length;
      if (stored.actions.length !== expectedLength) throw new StoreConflict('The session changed before this save.');
      throw new StoreUnavailable('The answer could not be saved. Nothing was recorded.');
    }
  }

  async actionCount(sessionId: string) {
    try {
      return (await this.call<number | null>('review_action_count', { p_session_id: sessionId })) ?? null;
    } catch {
      throw new StoreUnavailable('This review could not be read. Nothing was changed.');
    }
  }

  /** Records which report engine produced what from which input; returns the run id. */
  async recordReportRun(run: ReportRunRecord) {
    try {
      return await this.call<string>('review_record_report_run', { p_run: run });
    } catch (error) {
      if (error instanceof DatabaseRefused) throw new StoreUnavailable(`The report run was not recorded: ${error.message}.`);
      throw new StoreOutcomeUnknown('The database did not confirm whether the report run was recorded.');
    }
  }

  async reportRuns(sessionId: string) {
    return (await this.call<unknown[]>('review_report_runs', { p_session_id: sessionId })) ?? [];
  }

  /** Retention: removes a session with its links, log and report runs. */
  async purge(sessionId: string) {
    return !!(await this.call<boolean>('review_purge_session', { p_session_id: sessionId }));
  }
}

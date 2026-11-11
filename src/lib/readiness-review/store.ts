import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SessionRecord, StoredAction } from './session';
import { reviewHarnessDirectory } from './harness';

/**
 * Storage for review sessions. Two implementations: the fictional local file harness (this file) and the database
 * store (database-store.ts), which keeps the same append-only, sequence-checked contract in transactional storage on
 * an isolated project. Neither provides authenticated roles or tenancy; links stand in for sign-in (B3).
 */
export interface ReviewStore {
  /** True when other server processes may write to the same store, so a cached session must be checked before use. */
  readonly shared: boolean;
  /** Stores the record and indexes every role link, or stores nothing and throws. */
  create(record: SessionRecord): Promise<void>;
  load(sessionId: string): Promise<SessionRecord | null>;
  findToken(token: string): Promise<TokenEntry | null>;
  /** Appends actions only if the stored log still has `expectedLength` actions; returns the new length. */
  append(sessionId: string, expectedLength: number, actions: StoredAction[]): Promise<number>;
  /** The stored log length, or null if the session is not stored. */
  actionCount(sessionId: string): Promise<number | null>;
}

export type TokenEntry = { sessionId: string; role: 'respondent' | 'management' | 'reviewer' | 'links' | 'owner'; fn?: string };

export class StoreConflict extends Error {}
/** Storage could not be read or written safely. The message says what was and was not changed. */
export class StoreUnavailable extends Error {}
/** The store did not confirm whether a write happened, and checking afterwards was not possible either. */
export class StoreOutcomeUnknown extends StoreUnavailable {}

/** Test-only fault injection for the file harness; never set by the service. */
export type StoreFaults = { failIndexWrite?: boolean; failSessionWrite?: boolean };

type ErrnoError = NodeJS.ErrnoException;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Writes through a uniquely named temporary file and a rename, so a reader sees the old or the new file, never half of one. */
async function writeAtomic(file: string, body: string) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, body, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temp, file);
  } catch (error) {
    await fs.unlink(temp).catch(() => undefined);
    throw error;
  }
}

/** One queue per lock name in this process; shared across module copies through globalThis. */
const processLocks: Map<string, Promise<unknown>> = ((globalThis as any).__mkReadinessReviewStoreLocks ??= new Map());

async function inProcessQueue<T>(name: string, work: () => Promise<T>): Promise<T> {
  const previous = processLocks.get(name) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  processLocks.set(name, run.catch(() => undefined));
  return run;
}

/**
 * A lock file shared by every process using the same harness directory. A lock older than `staleMs` is treated as
 * left behind by a process that stopped. Callers already hold the in-process queue for the same name.
 */
async function withLockFile<T>(lockPath: string, work: () => Promise<T>, staleMs = 30_000, waitMs = 10_000): Promise<T> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}`);
      await handle.close();
      break;
    } catch (error) {
      if ((error as ErrnoError).code !== 'EEXIST') throw new StoreUnavailable('The review storage could not be locked. Nothing was changed.');
      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > staleMs) {
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() > deadline) throw new StoreUnavailable('The review storage is busy. Nothing was changed; try again.');
      await sleep(5 + Math.floor(Math.random() * 20));
    }
  }
  try {
    return await work();
  } finally {
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

function tokenEntries(record: SessionRecord): Record<string, TokenEntry> {
  const t = record.tokens;
  const entries: Record<string, TokenEntry> = {
    [t.respondent]: { sessionId: record.sessionId, role: 'respondent' },
    [t.management]: { sessionId: record.sessionId, role: 'management' },
    [t.reviewer]: { sessionId: record.sessionId, role: 'reviewer' },
    [t.links]: { sessionId: record.sessionId, role: 'links' }
  };
  for (const [fn, token] of Object.entries(t.owners)) entries[token] = { sessionId: record.sessionId, role: 'owner', fn };
  return entries;
}

export class FileReviewStore implements ReviewStore {
  /** One server process per harness directory is the supported set-up; the lock file guards against more. */
  readonly shared = false;
  private root: string;
  private faults: StoreFaults;
  constructor(root = reviewHarnessDirectory(), faults: StoreFaults = {}) {
    this.root = root;
    this.faults = faults;
  }

  private sessionFile(sessionId: string) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) throw new Error('Invalid session reference');
    return path.join(this.root, 'sessions', `${sessionId}.json`);
  }

  private indexFile() {
    return path.join(this.root, 'tokens.json');
  }

  /** The index of role links. Missing means empty; anything unreadable or damaged is reported, never treated as empty. */
  private async readIndex(): Promise<Record<string, TokenEntry>> {
    let text: string;
    try {
      text = await fs.readFile(this.indexFile(), 'utf8');
    } catch (error) {
      if ((error as ErrnoError).code === 'ENOENT') return {};
      throw new StoreUnavailable('The review links could not be read. Nothing was changed.');
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return parsed as Record<string, TokenEntry>;
    } catch {
      throw new StoreUnavailable('The stored review links are damaged. Nothing was changed.');
    }
  }

  private locked<T>(name: string, lockFile: string, work: () => Promise<T>) {
    return inProcessQueue(`${this.root}:${name}`, () => withLockFile(lockFile, work));
  }

  async create(record: SessionRecord) {
    await fs.mkdir(path.join(this.root, 'sessions'), { recursive: true });
    const sessionFile = this.sessionFile(record.sessionId);
    // The whole read, check and write of the shared index is one transaction, in this process and across processes.
    await this.locked('index', `${this.indexFile()}.lock`, async () => {
      const index = await this.readIndex();
      const entries = tokenEntries(record);
      if (Object.keys(entries).some((t) => index[t])) throw new StoreUnavailable('A generated link matched an existing one. Nothing was created; try again.');
      const exists = await fs.stat(sessionFile).then(() => true, () => false);
      if (exists) throw new StoreUnavailable('A session with this reference already exists. Nothing was created; try again.');
      try {
        if (this.faults.failSessionWrite) throw new Error('Injected session write failure');
        await writeAtomic(sessionFile, JSON.stringify(record));
      } catch {
        throw new StoreUnavailable('The review could not be started because it could not be stored. Nothing was created.');
      }
      try {
        if (this.faults.failIndexWrite) throw new Error('Injected index write failure');
        await writeAtomic(this.indexFile(), JSON.stringify({ ...index, ...entries }));
      } catch {
        // Without its links the session cannot be reached, so it is removed rather than left behind.
        await fs.unlink(sessionFile).catch(() => undefined);
        throw new StoreUnavailable('The review could not be started because its links could not be stored. Nothing was created.');
      }
    });
  }

  async load(sessionId: string) {
    let text: string;
    try {
      text = await fs.readFile(this.sessionFile(sessionId), 'utf8');
    } catch (error) {
      if ((error as ErrnoError).code === 'ENOENT') return null;
      throw new StoreUnavailable('This review could not be read. Nothing was changed.');
    }
    try {
      return JSON.parse(text) as SessionRecord;
    } catch {
      throw new StoreUnavailable('This review is stored in a damaged form. Nothing was changed.');
    }
  }

  async findToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    return (await this.readIndex())[token] ?? null;
  }

  async append(sessionId: string, expectedLength: number, actions: StoredAction[]) {
    const file = this.sessionFile(sessionId);
    return this.locked(`session:${sessionId}`, `${file}.lock`, async () => {
      const record = await this.load(sessionId);
      if (!record) throw new StoreUnavailable('This review is no longer stored. Nothing was recorded.');
      if (record.actions.length !== expectedLength) throw new StoreConflict('The session changed before this save.');
      const next = { ...record, actions: record.actions.concat(actions) };
      await writeAtomic(file, JSON.stringify(next));
      return next.actions.length;
    });
  }

  async actionCount(sessionId: string) {
    return (await this.load(sessionId))?.actions.length ?? null;
  }
}

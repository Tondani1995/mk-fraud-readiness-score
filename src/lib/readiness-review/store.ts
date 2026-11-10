import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SessionRecord, StoredAction } from './session';
import { reviewHarnessDirectory } from './harness';

/**
 * Storage for review sessions. The only implementation in this candidate is the fictional local file harness. A
 * production implementation needs durable storage, authenticated roles, tenancy, retention and audit, none of which
 * this provides. The interface is kept small so that replacement is a separate, reviewable change.
 */
export interface ReviewStore {
  create(record: SessionRecord): Promise<void>;
  load(sessionId: string): Promise<SessionRecord | null>;
  findToken(token: string): Promise<TokenEntry | null>;
  /** Appends actions only if the stored log still has `expectedLength` actions. */
  append(sessionId: string, expectedLength: number, actions: StoredAction[]): Promise<SessionRecord>;
}

export type TokenEntry = { sessionId: string; role: 'respondent' | 'management' | 'reviewer' | 'links' | 'owner'; fn?: string };

export class StoreConflict extends Error {}

async function writeAtomic(file: string, body: string) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, body, 'utf8');
  await fs.rename(temp, file);
}

export class FileReviewStore implements ReviewStore {
  private root: string;
  constructor(root = reviewHarnessDirectory()) {
    this.root = root;
  }

  private sessionFile(sessionId: string) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) throw new Error('Invalid session reference');
    return path.join(this.root, 'sessions', `${sessionId}.json`);
  }

  private indexFile() {
    return path.join(this.root, 'tokens.json');
  }

  private async readIndex(): Promise<Record<string, TokenEntry>> {
    try {
      return JSON.parse(await fs.readFile(this.indexFile(), 'utf8'));
    } catch {
      return {};
    }
  }

  async create(record: SessionRecord) {
    await fs.mkdir(path.join(this.root, 'sessions'), { recursive: true });
    await writeAtomic(this.sessionFile(record.sessionId), JSON.stringify(record));
    const index = await this.readIndex();
    const t = record.tokens;
    index[t.respondent] = { sessionId: record.sessionId, role: 'respondent' };
    index[t.management] = { sessionId: record.sessionId, role: 'management' };
    index[t.reviewer] = { sessionId: record.sessionId, role: 'reviewer' };
    index[t.links] = { sessionId: record.sessionId, role: 'links' };
    for (const [fn, token] of Object.entries(t.owners)) index[token] = { sessionId: record.sessionId, role: 'owner', fn };
    await writeAtomic(this.indexFile(), JSON.stringify(index));
  }

  async load(sessionId: string) {
    try {
      return JSON.parse(await fs.readFile(this.sessionFile(sessionId), 'utf8')) as SessionRecord;
    } catch {
      return null;
    }
  }

  async findToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    return (await this.readIndex())[token] ?? null;
  }

  async append(sessionId: string, expectedLength: number, actions: StoredAction[]) {
    const record = await this.load(sessionId);
    if (!record) throw new Error('Session not found');
    if (record.actions.length !== expectedLength) throw new StoreConflict('The session changed before this save.');
    const next = { ...record, actions: record.actions.concat(actions) };
    await writeAtomic(this.sessionFile(sessionId), JSON.stringify(next));
    return next;
  }
}

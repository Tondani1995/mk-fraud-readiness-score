import crypto from 'node:crypto';

/**
 * Generation checkpoints and the audit package (independent review of the corrective pass, findings F1 and F2).
 *
 *   drafted    a first draft that failed validation, kept so a retry can repair it without writing it again;
 *   validated  the validated manuscript with its full audit package (manuscript with paragraph references, Fact Pack,
 *              Story Plan, writer brief, validation, model, usage and versions, bound input identity). Written BEFORE
 *              anything is composed, stored or finalised: if it cannot be written, no report is produced;
 *   linked     the finalised report it became. If this write is lost after the report is committed, the report stands
 *              and the audit package is already stored; `reconcileAudits` links it later from the attempt record,
 *              with no AI call and no new report.
 *
 * Writes are idempotent per attempt and stage and retried a bounded number of times, so a lost response is repaired by
 * the retry; a different payload for the same attempt and stage is a conflict, never overwritten.
 */
export const CHECKPOINT_VERSION = 'revised-checkpoints-1.0';

export type ResumeMeta = { provider: string | null; model: string | null; firstPass: { pass: boolean; blocking: number; words: number | null } };
export type StoredCheckpoint = { attemptId: string; stage: 'drafted' | 'validated' | 'linked'; factPackDigest: string | null; manuscript: string | null; reportId: string | null; resumeMeta: ResumeMeta | null; createdAt: string };
export type CheckpointScope = { orderReference: string; inputDigest: string; attemptId: string };

export class CheckpointUnavailable extends Error {
  readonly detail: Record<string, unknown>;
  constructor(message: string, detail: Record<string, unknown> = {}) { super(message); this.name = 'CheckpointUnavailable'; this.detail = detail; }
}

const sha = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function recordCheckpoint(db: any, scope: CheckpointScope, cp: { stage: 'drafted' | 'validated' | 'linked'; factPackDigest?: string | null; manuscript?: string | null; auditPackage?: Record<string, unknown> | null; reportId?: string | null }, options: { attempts?: number; backoffMs?: number } = {}) {
  const body = { stage: cp.stage, factPackDigest: cp.factPackDigest ?? null, manuscript: cp.manuscript ?? null, auditPackage: cp.auditPackage ?? null, reportId: cp.reportId ?? null };
  const payloadDigest = sha(body);
  const attempts = options.attempts ?? 3;
  let last: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await db.rpc('review_record_generation_checkpoint', { p: { ...scope, ...body, payloadDigest } });
      if (error) throw new Error(String(error.message ?? 'error'));
      if (!data || data.recorded !== true || typeof data.matches !== 'boolean') throw new Error('malformed checkpoint response');
      if (!data.matches) throw new CheckpointUnavailable('A different checkpoint is already stored for this attempt and stage.', { conflict: true, stage: cp.stage });
      return { payloadDigest, duplicate: data.duplicate === true };
    } catch (error) {
      if (error instanceof CheckpointUnavailable) throw error;
      last = error;
      if (i < attempts - 1) await sleep((options.backoffMs ?? 150) * (i + 1));
    }
  }
  throw new CheckpointUnavailable('The checkpoint could not be stored.', { stage: cp.stage, error: last instanceof Error ? last.message.slice(0, 200) : 'unknown' });
}

/** The order's checkpoints on its bound input. Unreadable or malformed history is an error, never an empty history. */
export async function loadCheckpoints(db: any, scope: Omit<CheckpointScope, 'attemptId'>): Promise<StoredCheckpoint[]> {
  let data: unknown;
  try {
    const out = await db.rpc('review_generation_checkpoints', { p_order: scope.orderReference, p_input_digest: scope.inputDigest });
    if (out?.error) throw new Error(String(out.error.message ?? 'error'));
    data = out?.data;
  } catch (error) {
    throw new CheckpointUnavailable('The generation history could not be read.', { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
  }
  if (!Array.isArray(data)) throw new CheckpointUnavailable('The generation history is malformed.', { malformed: true });
  for (const c of data as any[]) {
    if (!c || typeof c.attemptId !== 'string' || !['drafted', 'validated', 'linked'].includes(c.stage)) throw new CheckpointUnavailable('The generation history is malformed.', { malformed: true });
    if (c.stage !== 'linked' && (typeof c.manuscript !== 'string' || typeof c.factPackDigest !== 'string')) throw new CheckpointUnavailable('The generation history is incomplete.', { incomplete: true, attemptId: c.attemptId });
  }
  return data as StoredCheckpoint[];
}

/**
 * Where a retry starts: the latest validated manuscript that never became a report (compose, no AI call), otherwise the
 * latest draft whose attempt never validated (repair, one call). Only checkpoints made on the same Fact Pack qualify.
 */
export function resumeFrom(checkpoints: StoredCheckpoint[], factPackDigest: string) {
  const linked = new Set(checkpoints.filter((c) => c.stage === 'linked').map((c) => c.attemptId));
  const validated = new Set(checkpoints.filter((c) => c.stage === 'validated').map((c) => c.attemptId));
  const usable = (c: StoredCheckpoint) => c.factPackDigest === factPackDigest && !linked.has(c.attemptId) && c.resumeMeta;
  const v = checkpoints.find((c) => c.stage === 'validated' && usable(c));
  if (v) return { stage: 'compose' as const, fromAttempt: v.attemptId, manuscript: v.manuscript!, meta: v.resumeMeta! };
  const d = checkpoints.find((c) => c.stage === 'drafted' && usable(c) && !validated.has(c.attemptId));
  if (d) return { stage: 'repair' as const, fromAttempt: d.attemptId, manuscript: d.manuscript!, meta: d.resumeMeta! };
  return null;
}

/**
 * Operator recovery without an AI call: every validated audit package of the order whose attempt produced a report but
 * whose link was not recorded is linked now. Packages whose attempt produced no report stay as resume points.
 */
export async function reconcileAudits(db: any, orderReference: string, inputDigest: string) {
  const { data, error } = await db.rpc('review_unlinked_generation_audits', { p_order: orderReference });
  if (error || !Array.isArray(data)) throw new CheckpointUnavailable('Unlinked audit packages could not be listed.', { error: error?.message ?? 'malformed' });
  const linked: { attemptId: string; reportId: string }[] = [];
  const resumable: string[] = [];
  for (const u of data as { attemptId: string; inputDigest: string }[]) {
    const { data: attempt, error: attemptError } = await db.from('manual_report_generation_attempts').select('status,output_report_id').eq('id', u.attemptId).maybeSingle();
    if (attemptError) throw new CheckpointUnavailable('The generation attempt could not be read.', { attemptId: u.attemptId });
    if (attempt?.output_report_id) {
      await recordCheckpoint(db, { orderReference, inputDigest: u.inputDigest ?? inputDigest, attemptId: u.attemptId }, { stage: 'linked', reportId: attempt.output_report_id });
      linked.push({ attemptId: u.attemptId, reportId: attempt.output_report_id });
    } else resumable.push(u.attemptId);
  }
  return { linked, resumable };
}

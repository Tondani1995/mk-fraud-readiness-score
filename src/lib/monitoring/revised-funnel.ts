/**
 * The revised Fraud Readiness funnel (20 November 2026), read from the review store, its commercial bindings, orders
 * and report checkpoints through one service-role-only aggregate (review_monitor_funnel_v2). Customer figures exclude
 * fictional and synthetic sessions and MK's own internal check sessions, which are counted separately.
 *
 * A failed or missing read is "unavailable", never zero. Report fulfilment for revised reports is manual and leaves no
 * record (DR-13), so it is always "not recorded" here, never a count.
 */
export const REVISED_FUNNEL_FIELDS = [
  'customerSessionsStarted',
  'internalSessionsStarted',
  'customerRespondentActiveSessions',
  'customerRespondentAnswers',
  'customerRespondentCorrections',
  'customerInterviewsCompleted',
  'customerSnapshotNarrativesAi',
  'customerSnapshotNarrativesFallback',
  'customerAssessmentsBound',
  'customerOrdersRecorded',
  'customerOrdersAwaitingPayment',
  'customerPaymentsReceived',
  'customerReportsGenerated',
  'customerPaidOrdersWithoutReport',
  'reportGenerationCallsNotSucceeded'
] as const;

export type RevisedFunnel = Record<(typeof REVISED_FUNNEL_FIELDS)[number], number>;

export type RevisedFunnelRead =
  | { status: 'available'; metrics: RevisedFunnel; fulfilment: 'not_recorded' }
  | { status: 'unavailable'; metrics: null; fulfilment: 'not_recorded' };

/** Validates the aggregate strictly: anything missing, negative or non-integer makes the whole read unavailable. */
export function parseRevisedFunnel(data: unknown): RevisedFunnel | null {
  const row = data as Record<string, unknown> | null;
  if (!row || row.version !== 2) return null;
  const metrics = {} as RevisedFunnel;
  for (const field of REVISED_FUNNEL_FIELDS) {
    const raw = row[field];
    const value = typeof raw === 'number' ? raw : Number.NaN;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    metrics[field] = value;
  }
  return metrics;
}

export async function readRevisedFunnel(db: { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }, since: string): Promise<RevisedFunnelRead> {
  try {
    const { data, error } = await db.rpc('review_monitor_funnel_v2', { p_since: since });
    const metrics = error ? null : parseRevisedFunnel(data);
    return metrics ? { status: 'available', metrics, fulfilment: 'not_recorded' } : { status: 'unavailable', metrics: null, fulfilment: 'not_recorded' };
  } catch {
    return { status: 'unavailable', metrics: null, fulfilment: 'not_recorded' };
  }
}

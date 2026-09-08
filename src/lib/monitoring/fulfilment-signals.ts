import type { MonitorAlertCandidate } from './production-monitor';

/**
 * Read-only fulfilment and queue monitoring signals.
 *
 * Every threshold below is derived from observed Production behaviour rather than assumed, and
 * every source is a table the live pipeline actually writes. `report_generation_runs`,
 * `report_ai_attempts`, `report_fulfilments` and `report_generation_claims` are deliberately NOT
 * used: they are empty in Production, so a monitor built on them would be permanently silent.
 *
 * The authoritative generation record is `manual_report_generation_attempts`, whose observed
 * status vocabulary is GENERATION_FAILED / REPORT_READY / DELIVERY_QUEUED.
 *
 * Nothing here changes report generation, payment, fulfilment or notification behaviour.
 */

export const FULFILMENT_THRESHOLDS = Object.freeze({
  /**
   * Paid orders are fulfilled through an admin-triggered pipeline (`manual_fulfilment_pending`).
   * Generation itself completes in ~1-2 minutes once requested, but the request step is human, so
   * the grace has to cover human turnaround rather than machine latency. 72h sits above observed
   * routine turnaround while still bounding a genuinely forgotten paid obligation.
   */
  paidOrderGraceHours: 72,
  /**
   * Observed attempt duration: max 2.1 min (REPORT_READY), 2.3 min (GENERATION_FAILED),
   * 4.4 min (DELIVERY_QUEUED), with zero attempts ever left started-but-not-completed.
   * 30 minutes is ~7x the slowest observed attempt, so an ordinary slow run cannot trip it.
   */
  stuckGenerationMinutes: 30,
  /** Observed retry_count reaches 6-7 against max_attempts 5. One ordinary retry must never page. */
  retryAlertThreshold: 3,
  /** Queue worker/reconciliation cadence is well under an hour; 6h marks a genuinely stuck send. */
  staleQueuedEmailHours: 6,
  clientErrorWindowMinutes: 60,
  /**
   * Observed Production browser_javascript baseline is 3 events in 7 days (~0.43/day). A 10-in-60m
   * trigger would need ~23 days of normal volume inside one hour and would effectively never fire,
   * so the signal is set at 5 - still ~12 days of normal volume in an hour, unambiguously a spike,
   * while remaining reachable.
   */
  clientErrorThreshold: 5
});

/** Order states that represent a paid, report-entitled commercial obligation. */
export const PAID_ORDER_STATUSES: readonly string[] = ['payment_received', 'verified'];
/** Order states where the commercial obligation is legitimately closed. */
export const CLOSED_ORDER_STATUSES: readonly string[] = ['cancelled', 'refunded', 'rejected', 'expired'];
/** Email ledger states that are genuine failures regardless of historical casing. */
export const EMAIL_FAILURE_STATUSES: readonly string[] = ['send_failed', 'reconciliation_required'];
/** Generation attempt states. */
export const ATTEMPT_FAILED = 'generation_failed';
export const ATTEMPT_READY = 'report_ready';
/** A report row that satisfies the customer's entitlement. */
export const READY_REPORT_STATUS = 'generated';

export type OrderRow = {
  id: string;
  status?: string | null;
  product_name?: string | null;
  created_at?: string | null;
  assessment_id?: string | null;
};

export type ReportRow = { order_id?: string | null; status?: string | null };

export type AttemptRow = {
  order_id?: string | null;
  status?: string | null;
  retry_count?: number | null;
  max_attempts?: number | null;
  requested_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type EmailRow = { id?: string | null; status?: string | null; created_at?: string | null };

export type ClientErrorRow = { occurred_at?: string | null; route?: string | null };

export type FulfilmentInput = {
  orders: OrderRow[];
  reports: ReportRow[];
  attempts: AttemptRow[];
  emails: EmailRow[];
  clientErrors: ClientErrorRow[];
  syntheticAssessmentIds: Set<string>;
  now: Date;
};

export type FulfilmentMetrics = {
  comprehensiveGenerationFailures: number;
  paidOrdersWithoutReport: number;
  stuckGenerations: number;
  excessiveRetryGenerations: number;
  notificationFailures: number;
  staleQueuedNotifications: number;
  freshQueuedNotifications: number;
  clientErrorSpike: number;
  clientErrorTopRoute: string | null;
};

function normalise(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function ageMinutes(from: string | null | undefined, now: Date): number {
  if (!from) return Number.POSITIVE_INFINITY;
  const at = new Date(from).getTime();
  return Number.isFinite(at) ? (now.getTime() - at) / 60_000 : Number.POSITIVE_INFINITY;
}

/** True when the order is a live, paid, report-entitled commercial obligation. */
export function isEntitledPaidOrder(order: OrderRow, syntheticAssessmentIds: Set<string>): boolean {
  const status = normalise(order.status);
  if (!PAID_ORDER_STATUSES.includes(status)) return false;
  if (CLOSED_ORDER_STATUSES.includes(status)) return false;
  if (order.assessment_id && syntheticAssessmentIds.has(order.assessment_id)) return false;
  return true;
}

export function evaluateFulfilmentSignals(
  input: FulfilmentInput,
  thresholds = FULFILMENT_THRESHOLDS
): FulfilmentMetrics {
  const { now, syntheticAssessmentIds } = input;

  const readyOrderIds = new Set(
    input.reports
      .filter((report) => normalise(report.status) === READY_REPORT_STATUS && report.order_id)
      .map((report) => report.order_id as string)
  );

  const entitled = input.orders.filter((order) => isEntitledPaidOrder(order, syntheticAssessmentIds));

  // Signal B - a paid, entitled order still without its report beyond the grace period.
  const paidOrdersWithoutReport = entitled.filter(
    (order) =>
      !readyOrderIds.has(order.id) &&
      ageMinutes(order.created_at, now) > thresholds.paidOrderGraceHours * 60
  ).length;

  const entitledIds = new Set(entitled.map((order) => order.id));
  const comprehensiveIds = new Set(
    entitled.filter((order) => normalise(order.product_name) === 'comprehensive').map((order) => order.id)
  );

  // Signal A - a genuine failed generation attempt against a paid Comprehensive obligation that is
  // still unfulfilled. A failure that was later superseded by a ready report is not an incident.
  const comprehensiveGenerationFailures = input.attempts.filter(
    (attempt) =>
      normalise(attempt.status) === ATTEMPT_FAILED &&
      attempt.order_id != null &&
      comprehensiveIds.has(attempt.order_id) &&
      !readyOrderIds.has(attempt.order_id)
  ).length;

  // Signal C - generation started but never completed, or retried past an actionable threshold.
  const stuckGenerations = input.attempts.filter(
    (attempt) =>
      attempt.started_at != null &&
      attempt.completed_at == null &&
      ageMinutes(attempt.started_at, now) > thresholds.stuckGenerationMinutes
  ).length;

  const excessiveRetryGenerations = input.attempts.filter(
    (attempt) =>
      Number(attempt.retry_count ?? 0) >= thresholds.retryAlertThreshold &&
      attempt.order_id != null &&
      entitledIds.has(attempt.order_id) &&
      !readyOrderIds.has(attempt.order_id)
  ).length;

  // Signal D - case-insensitive so the historical queued/QUEUED split cannot hide a stuck send.
  // A freshly queued email is normal and must not alert.
  let notificationFailures = 0;
  let staleQueuedNotifications = 0;
  let freshQueuedNotifications = 0;
  for (const email of input.emails) {
    const status = normalise(email.status);
    if (EMAIL_FAILURE_STATUSES.includes(status)) {
      notificationFailures += 1;
      continue;
    }
    if (status === 'queued') {
      if (ageMinutes(email.created_at, now) > thresholds.staleQueuedEmailHours * 60) staleQueuedNotifications += 1;
      else freshQueuedNotifications += 1;
    }
  }

  // Signal E - bounded client-error spike, kept entirely separate from API failure counting.
  const windowStart = now.getTime() - thresholds.clientErrorWindowMinutes * 60_000;
  const recentClientErrors = input.clientErrors.filter((row) => {
    const at = row.occurred_at ? new Date(row.occurred_at).getTime() : NaN;
    return Number.isFinite(at) && at >= windowStart;
  });
  const routeCounts = new Map<string, number>();
  for (const row of recentClientErrors) {
    const route = typeof row.route === 'string' && row.route ? row.route : '/unknown';
    routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
  }
  let clientErrorTopRoute: string | null = null;
  let topCount = 0;
  for (const [route, count] of routeCounts) {
    if (count > topCount) {
      topCount = count;
      clientErrorTopRoute = route;
    }
  }

  return {
    comprehensiveGenerationFailures,
    paidOrdersWithoutReport,
    stuckGenerations,
    excessiveRetryGenerations,
    notificationFailures,
    staleQueuedNotifications,
    freshQueuedNotifications,
    clientErrorSpike: recentClientErrors.length,
    clientErrorTopRoute
  };
}

/**
 * Alert details carry counts and an already-sanitised route only. No customer, order, assessment or
 * report identifier is ever placed in a monitoring alert.
 */
export function candidatesForFulfilment(
  metrics: FulfilmentMetrics,
  deploymentSha: string | null,
  thresholds = FULFILMENT_THRESHOLDS
): MonitorAlertCandidate[] {
  const candidates: MonitorAlertCandidate[] = [];

  if (metrics.comprehensiveGenerationFailures > 0) {
    candidates.push({
      alertKey: 'fulfilment:comprehensive_generation_failed',
      priority: 'P1',
      category: 'comprehensive_generation_failed',
      stage: 'report_generation',
      errorCategory: 'comprehensive_generation_failure',
      deploymentSha,
      detail: { count: metrics.comprehensiveGenerationFailures }
    });
  }

  if (metrics.paidOrdersWithoutReport > 0) {
    candidates.push({
      alertKey: 'fulfilment:paid_order_without_report',
      priority: 'P1',
      category: 'paid_order_without_report',
      stage: 'fulfilment',
      errorCategory: 'paid_order_unfulfilled',
      deploymentSha,
      detail: { count: metrics.paidOrdersWithoutReport, grace_hours: thresholds.paidOrderGraceHours }
    });
  }

  if (metrics.stuckGenerations > 0) {
    candidates.push({
      alertKey: 'fulfilment:generation_stuck',
      priority: 'P2',
      category: 'generation_stuck',
      stage: 'report_generation',
      errorCategory: 'generation_started_not_completed',
      deploymentSha,
      detail: { count: metrics.stuckGenerations, threshold_minutes: thresholds.stuckGenerationMinutes }
    });
  }

  if (metrics.excessiveRetryGenerations > 0) {
    candidates.push({
      alertKey: 'fulfilment:generation_retry_exhaustion',
      priority: 'P2',
      category: 'generation_retry_exhaustion',
      stage: 'report_generation',
      errorCategory: 'generation_retry_threshold_crossed',
      deploymentSha,
      detail: { count: metrics.excessiveRetryGenerations, threshold: thresholds.retryAlertThreshold }
    });
  }

  if (metrics.staleQueuedNotifications > 0) {
    candidates.push({
      alertKey: 'fulfilment:notification_queue_stalled',
      priority: 'P2',
      category: 'notification_queue_stalled',
      stage: 'notification',
      errorCategory: 'notification_queued_beyond_threshold',
      deploymentSha,
      detail: { count: metrics.staleQueuedNotifications, threshold_hours: thresholds.staleQueuedEmailHours }
    });
  }

  if (metrics.clientErrorSpike >= thresholds.clientErrorThreshold) {
    candidates.push({
      alertKey: 'fulfilment:client_error_spike',
      priority: 'P3',
      category: 'client_error_spike',
      route: metrics.clientErrorTopRoute,
      stage: 'browser_javascript',
      errorCategory: 'client_error_rate_exceeded',
      deploymentSha,
      detail: {
        count: metrics.clientErrorSpike,
        window_minutes: thresholds.clientErrorWindowMinutes,
        threshold: thresholds.clientErrorThreshold
      }
    });
  }

  return candidates;
}

/** Reads only. No write, no provider call, no customer-visible effect. */
export async function readFulfilmentSignalInput(db: any, now: Date): Promise<FulfilmentInput> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const clientErrorSince = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const [orders, reports, attempts, emails, clientErrors, synthetic] = await Promise.all([
    db.from('orders').select('id,status,product_name,created_at,assessment_id').limit(5000),
    db.from('reports').select('order_id,status').limit(10000),
    db
      .from('manual_report_generation_attempts')
      .select('order_id,status,retry_count,max_attempts,requested_at,started_at,completed_at')
      .gte('requested_at', since)
      .limit(10000),
    db.from('email_events').select('id,status,created_at').gte('created_at', since).not('notification_type', 'is', null).limit(10000),
    db
      .from('production_monitor_events')
      .select('occurred_at,route')
      .eq('environment', 'production')
      .eq('stage', 'browser_javascript')
      .eq('outcome', 'fail')
      .gte('occurred_at', clientErrorSince)
      .limit(5000),
    db.from('assessments').select('id').or('monitoring_synthetic.eq.true,synthetic_demonstration.eq.true').limit(10000)
  ]);

  return {
    orders: (orders?.data ?? []) as OrderRow[],
    reports: (reports?.data ?? []) as ReportRow[],
    attempts: (attempts?.data ?? []) as AttemptRow[],
    emails: (emails?.data ?? []) as EmailRow[],
    clientErrors: (clientErrors?.data ?? []) as ClientErrorRow[],
    syntheticAssessmentIds: new Set(((synthetic?.data ?? []) as any[]).map((row) => row.id)),
    now
  };
}

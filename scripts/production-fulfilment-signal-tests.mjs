import assert from 'node:assert/strict';

import {
  candidatesForFulfilment,
  evaluateFulfilmentSignals,
  isEntitledPaidOrder,
  FULFILMENT_THRESHOLDS,
  PAID_ORDER_STATUSES,
  CLOSED_ORDER_STATUSES
} from '../src/lib/monitoring/fulfilment-signals.ts';
import { alertNotificationDecision, recoveryNotificationAllowed } from '../src/lib/monitoring/production-monitor.ts';
import { monitorAdaptiveStalledLeads } from '../src/lib/notifications/internal-assessment-notifications.ts';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();

function baseInput(overrides = {}) {
  return {
    orders: [],
    reports: [],
    attempts: [],
    emails: [],
    clientErrors: [],
    syntheticAssessmentIds: new Set(),
    now: NOW,
    ...overrides
  };
}

/* ---------------- zero state ---------------- */
{
  const metrics = evaluateFulfilmentSignals(baseInput());
  assert.equal(metrics.comprehensiveGenerationFailures, 0);
  assert.equal(metrics.paidOrdersWithoutReport, 0);
  assert.equal(metrics.stuckGenerations, 0);
  assert.equal(metrics.excessiveRetryGenerations, 0);
  assert.equal(metrics.staleQueuedNotifications, 0);
  assert.equal(metrics.clientErrorSpike, 0);
  assert.deepEqual(candidatesForFulfilment(metrics, null), [], 'zero state must raise no candidates');
}

/* ---------------- Signal A: Comprehensive generation failure ---------------- */
{
  const orders = [{ id: 'o1', status: 'payment_received', product_name: 'Comprehensive', created_at: hoursAgo(1) }];
  const attempts = [{ order_id: 'o1', status: 'GENERATION_FAILED', retry_count: 1, started_at: hoursAgo(1), completed_at: hoursAgo(1) }];

  const failing = evaluateFulfilmentSignals(baseInput({ orders, attempts }));
  assert.equal(failing.comprehensiveGenerationFailures, 1);
  const c = candidatesForFulfilment(failing, null).find((x) => x.alertKey === 'fulfilment:comprehensive_generation_failed');
  assert.ok(c, 'Comprehensive failure must raise a candidate');
  assert.equal(c.priority, 'P1', 'paid customer fulfilment failure is P1');

  // Recovery: a ready report supersedes the failure.
  const recovered = evaluateFulfilmentSignals(
    baseInput({ orders, attempts, reports: [{ order_id: 'o1', status: 'generated' }] })
  );
  assert.equal(recovered.comprehensiveGenerationFailures, 0, 'ready report must clear the failure');
  assert.equal(
    candidatesForFulfilment(recovered, null).some((x) => x.alertKey === 'fulfilment:comprehensive_generation_failed'),
    false
  );

  // Essential failures must not raise the Comprehensive signal.
  const essential = evaluateFulfilmentSignals(
    baseInput({ orders: [{ ...orders[0], product_name: 'Essential' }], attempts })
  );
  assert.equal(essential.comprehensiveGenerationFailures, 0, 'Essential must not trip the Comprehensive signal');
}

/* ---------------- Signal B: paid order without report ---------------- */
{
  const grace = FULFILMENT_THRESHOLDS.paidOrderGraceHours;

  // Below threshold - inside grace, no alert.
  const fresh = evaluateFulfilmentSignals(
    baseInput({ orders: [{ id: 'o1', status: 'payment_received', product_name: 'Essential', created_at: hoursAgo(grace - 1) }] })
  );
  assert.equal(fresh.paidOrdersWithoutReport, 0, 'inside grace must not alert');

  // Threshold crossed.
  const stale = evaluateFulfilmentSignals(
    baseInput({ orders: [{ id: 'o1', status: 'payment_received', product_name: 'Essential', created_at: hoursAgo(grace + 1) }] })
  );
  assert.equal(stale.paidOrdersWithoutReport, 1);
  const b = candidatesForFulfilment(stale, null).find((x) => x.alertKey === 'fulfilment:paid_order_without_report');
  assert.equal(b.priority, 'P1');

  // Recovery: report delivered.
  const done = evaluateFulfilmentSignals(
    baseInput({
      orders: [{ id: 'o1', status: 'payment_received', product_name: 'Essential', created_at: hoursAgo(grace + 1) }],
      reports: [{ order_id: 'o1', status: 'generated' }]
    })
  );
  assert.equal(done.paidOrdersWithoutReport, 0);

  // Legitimate exclusions: closed commercial states.
  for (const status of CLOSED_ORDER_STATUSES) {
    const closed = evaluateFulfilmentSignals(
      baseInput({ orders: [{ id: 'o1', status, product_name: 'Essential', created_at: hoursAgo(grace + 10) }] })
    );
    assert.equal(closed.paidOrdersWithoutReport, 0, `${status} order must be excluded`);
  }

  // Unpaid orders are not an obligation.
  const unpaid = evaluateFulfilmentSignals(
    baseInput({ orders: [{ id: 'o1', status: 'awaiting_payment', product_name: 'Essential', created_at: hoursAgo(grace + 10) }] })
  );
  assert.equal(unpaid.paidOrdersWithoutReport, 0);

  // Synthetic/non-commercial records excluded; commercial records included.
  const syntheticOrder = { id: 'o1', status: 'payment_received', product_name: 'Essential', created_at: hoursAgo(grace + 5), assessment_id: 'a-synth' };
  assert.equal(isEntitledPaidOrder(syntheticOrder, new Set(['a-synth'])), false, 'synthetic order excluded');
  assert.equal(isEntitledPaidOrder(syntheticOrder, new Set()), true, 'commercial order included');
  const synth = evaluateFulfilmentSignals(
    baseInput({ orders: [syntheticOrder], syntheticAssessmentIds: new Set(['a-synth']) })
  );
  assert.equal(synth.paidOrdersWithoutReport, 0);

  // The obligation clock starts at payment verification, not order creation. An order created
  // long ago but only just paid is inside grace.
  const latePayment = evaluateFulfilmentSignals(
    baseInput({ orders: [{ id: 'o1', status: 'payment_received', product_name: 'Essential', created_at: hoursAgo(grace + 200), verified_at: hoursAgo(1) }] })
  );
  assert.equal(latePayment.paidOrdersWithoutReport, 0, 'grace must run from verified_at, not created_at');

  // And an order paid long ago still alerts even if created_at is recent.
  const oldPayment = evaluateFulfilmentSignals(
    baseInput({ orders: [{ id: 'o1', status: 'payment_received', product_name: 'Essential', created_at: hoursAgo(1), verified_at: hoursAgo(grace + 10) }] })
  );
  assert.equal(oldPayment.paidOrdersWithoutReport, 1);

  // Calibration guard: grace must sit above the observed p95 (156h) of legitimate fulfilment.
  assert.ok(grace > 156, `grace ${grace}h must exceed observed legitimate p95 of 156h`);

  // Paid states are exactly the entitled set.
  assert.deepEqual([...PAID_ORDER_STATUSES], ['payment_received', 'verified']);
}

/* ---------------- Signal C: stuck / repeated generation ---------------- */
{
  const stuckMin = FULFILMENT_THRESHOLDS.stuckGenerationMinutes;

  // Below: recently started, still running.
  const running = evaluateFulfilmentSignals(
    baseInput({ attempts: [{ order_id: 'o1', status: 'REPORT_READY', started_at: minutesAgo(stuckMin - 5), completed_at: null }] })
  );
  assert.equal(running.stuckGenerations, 0, 'a normally running attempt must not alert');

  // Threshold crossed.
  const stuck = evaluateFulfilmentSignals(
    baseInput({ attempts: [{ order_id: 'o1', status: 'REPORT_READY', started_at: minutesAgo(stuckMin + 5), completed_at: null }] })
  );
  assert.equal(stuck.stuckGenerations, 1);
  assert.equal(candidatesForFulfilment(stuck, null).find((x) => x.alertKey === 'fulfilment:generation_stuck').priority, 'P2');

  // Completed attempts are never stuck.
  const complete = evaluateFulfilmentSignals(
    baseInput({ attempts: [{ order_id: 'o1', status: 'REPORT_READY', started_at: minutesAgo(600), completed_at: minutesAgo(598) }] })
  );
  assert.equal(complete.stuckGenerations, 0);

  // One ordinary retry must never page.
  const orders = [{ id: 'o1', status: 'payment_received', product_name: 'Essential', created_at: hoursAgo(1) }];
  const oneRetry = evaluateFulfilmentSignals(
    baseInput({ orders, attempts: [{ order_id: 'o1', status: 'GENERATION_FAILED', retry_count: 1 }] })
  );
  assert.equal(oneRetry.excessiveRetryGenerations, 0, 'a single retry is not an incident');

  const manyRetries = evaluateFulfilmentSignals(
    baseInput({ orders, attempts: [{ order_id: 'o1', status: 'GENERATION_FAILED', retry_count: FULFILMENT_THRESHOLDS.retryAlertThreshold }] })
  );
  assert.equal(manyRetries.excessiveRetryGenerations, 1);

  // Recovery: retries no longer matter once the report exists.
  const retriedThenReady = evaluateFulfilmentSignals(
    baseInput({ orders, attempts: [{ order_id: 'o1', status: 'REPORT_READY', retry_count: 6 }], reports: [{ order_id: 'o1', status: 'generated' }] })
  );
  assert.equal(retriedThenReady.excessiveRetryGenerations, 0);
}

/* ---------------- Signal D: notification queue ---------------- */
{
  const staleH = FULFILMENT_THRESHOLDS.staleQueuedEmailHours;

  // Freshly queued is normal, in either casing.
  const fresh = evaluateFulfilmentSignals(
    baseInput({ emails: [{ id: 'e1', status: 'queued', created_at: hoursAgo(1) }, { id: 'e2', status: 'QUEUED', created_at: hoursAgo(1) }] })
  );
  assert.equal(fresh.freshQueuedNotifications, 2);
  assert.equal(fresh.staleQueuedNotifications, 0, 'fresh queue entries must not alert');
  assert.equal(candidatesForFulfilment(fresh, null).length, 0);

  // Stale in both casings - proves the queued/QUEUED blind spot is closed.
  const stale = evaluateFulfilmentSignals(
    baseInput({ emails: [{ id: 'e1', status: 'queued', created_at: hoursAgo(staleH + 1) }, { id: 'e2', status: 'QUEUED', created_at: hoursAgo(staleH + 1) }] })
  );
  assert.equal(stale.staleQueuedNotifications, 2, 'case-insensitive stale detection');
  assert.equal(candidatesForFulfilment(stale, null).find((x) => x.alertKey === 'fulfilment:notification_queue_stalled').priority, 'P2');

  // Failure states counted regardless of casing.
  const failed = evaluateFulfilmentSignals(
    baseInput({ emails: [{ id: 'e1', status: 'SEND_FAILED', created_at: hoursAgo(1) }, { id: 'e2', status: 'reconciliation_required', created_at: hoursAgo(1) }] })
  );
  assert.equal(failed.notificationFailures, 2);

  // Sent emails are not a signal.
  const sent = evaluateFulfilmentSignals(baseInput({ emails: [{ id: 'e1', status: 'sent', created_at: hoursAgo(99) }] }));
  assert.equal(sent.staleQueuedNotifications, 0);
  assert.equal(sent.notificationFailures, 0);
}

/* ---------------- Signal E: browser JS spike ---------------- */
{
  const threshold = FULFILMENT_THRESHOLDS.clientErrorThreshold;
  const mk = (n, min = 5, route = '/fraud-readiness') => Array.from({ length: n }, () => ({ occurred_at: minutesAgo(min), route }));

  // Below threshold - isolated noise must not page.
  const below = evaluateFulfilmentSignals(baseInput({ clientErrors: mk(threshold - 1) }));
  assert.equal(below.clientErrorSpike, threshold - 1);
  assert.equal(candidatesForFulfilment(below, null).length, 0, 'below threshold must not alert');

  // At threshold.
  const at = evaluateFulfilmentSignals(baseInput({ clientErrors: mk(threshold) }));
  const e = candidatesForFulfilment(at, null).find((x) => x.alertKey === 'fulfilment:client_error_spike');
  assert.ok(e, 'threshold must raise the client error candidate');
  assert.equal(e.priority, 'P3', 'client noise must never page as P1/P2');
  assert.equal(e.route, '/fraud-readiness', 'noisy route identified');

  // Outside the window does not count (recovery).
  const outside = evaluateFulfilmentSignals(baseInput({ clientErrors: mk(threshold, FULFILMENT_THRESHOLDS.clientErrorWindowMinutes + 30) }));
  assert.equal(outside.clientErrorSpike, 0, 'window must roll off');
  assert.equal(candidatesForFulfilment(outside, null).length, 0);
}

/* ---------------- PII sanitisation ---------------- */
{
  const metrics = evaluateFulfilmentSignals(
    baseInput({
      orders: [{ id: 'order-uuid', status: 'payment_received', product_name: 'Comprehensive', created_at: hoursAgo(200), assessment_id: 'assessment-uuid' }],
      attempts: [{ order_id: 'order-uuid', status: 'GENERATION_FAILED', retry_count: 5, started_at: minutesAgo(400), completed_at: null }],
      emails: [{ id: 'email-uuid', status: 'queued', created_at: hoursAgo(48) }],
      clientErrors: Array.from({ length: 9 }, () => ({ occurred_at: minutesAgo(5), route: '/score/start' }))
    })
  );
  const candidates = candidatesForFulfilment(metrics, 'a'.repeat(40));
  assert.ok(candidates.length >= 4, 'combined conditions raise multiple candidates');
  const serialised = JSON.stringify(candidates);
  for (const forbidden of ['order-uuid', 'assessment-uuid', 'email-uuid', '@', 'Comprehensive']) {
    assert.equal(serialised.includes(forbidden), false, `alert detail must not carry ${forbidden}`);
  }
  for (const candidate of candidates) {
    for (const value of Object.values(candidate.detail ?? {})) {
      assert.equal(typeof value, 'number', 'alert detail values must be numeric counts/thresholds only');
    }
  }
}

/* ---------------- incident dedupe + reopen lifecycle ---------------- */
{
  const now = NOW;
  // Repeated monitor runs against the same unchanged count must not send another email.
  assert.equal(
    alertNotificationDecision({ existing: { status: 'open', last_notified_at: minutesAgo(5), detail_json: { count: 2 } }, now, priority: 'P2', underlyingCount: 2 }),
    'suppress',
    'duplicate monitor runs must not spam email'
  );
  // A genuine increase re-notifies.
  assert.equal(
    alertNotificationDecision({ existing: { status: 'open', last_notified_at: minutesAgo(5), detail_json: { count: 2 } }, now, priority: 'P2', underlyingCount: 3 }),
    'send_reminder'
  );
  // Reopen after resolution starts a fresh lifecycle (migration 20260907200707).
  assert.equal(
    alertNotificationDecision({ existing: { status: 'resolved', last_notified_at: minutesAgo(5), detail_json: { count: 9 } }, now, priority: 'P1', underlyingCount: 1 }),
    'send_initial',
    'a reopened incident must notify immediately'
  );
  // Recovery is allowed once per incident.
  assert.equal(recoveryNotificationAllowed({ status: 'open', last_notified_at: minutesAgo(60), last_recovery_notified_at: null }), true);
  assert.equal(recoveryNotificationAllowed({ status: 'open', last_notified_at: minutesAgo(60), last_recovery_notified_at: minutesAgo(30) }), false);
}

/* ---------------- synthetic stalled-lead isolation ---------------- */
{
  // Records the filters applied to the authoritative stalled-lead selection.
  const applied = [];
  const assessmentsQuery = {
    select() { return this; },
    eq(col, val) { applied.push(['eq', col, val]); return this; },
    not(col, op, val) { applied.push(['not', col, op, val]); return this; },
    async limit() { return { data: [], error: null }; }
  };
  const db = {
    from(table) {
      if (table === 'app_settings') {
        return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { value_json: { enabled: true, inactivity_hours: 24 } }, error: null }; } };
      }
      if (table === 'assessments') return assessmentsQuery;
      return { select() { return this; }, eq() { return this; }, in() { return this; }, async limit() { return { data: [], error: null }; } };
    },
    async rpc() { return { data: null, error: null }; }
  };

  let emailsSent = 0;
  const result = await monitorAdaptiveStalledLeads(
    { adminUrlFor: (reference) => `https://example.invalid/admin/${reference}` },
    { db, now: () => NOW, sendEmail: async () => { emailsSent += 1; return { ok: true, mode: 'live' }; } }
  );

  assert.equal(emailsSent, 0, 'no email may be sent during tests');
  assert.ok(result.ok, 'stalled lead monitor still runs');

  const hasNot = (col) => applied.some(([kind, c, op, val]) => kind === 'not' && c === col && op === 'is' && val === true);
  assert.ok(hasNot('monitoring_synthetic'), 'monitoring_synthetic must be excluded at the authoritative selection');
  assert.ok(hasNot('synthetic_demonstration'), 'synthetic_demonstration must be excluded at the authoritative selection');

  // Existing selection semantics must be unchanged: still draft + adaptive only.
  assert.ok(applied.some(([k, c, v]) => k === 'eq' && c === 'status' && v === 'draft'), 'genuine abandoned draft leads remain eligible');
  assert.ok(applied.some(([k, c, v]) => k === 'eq' && c === 'assessment_mode' && v === 'adaptive'), 'lead timing/mode rules unchanged');
}

console.log('production fulfilment signal tests passed');

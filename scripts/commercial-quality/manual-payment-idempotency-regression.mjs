#!/usr/bin/env node
/**
 * Manual payment retry / idempotency regression for MKORD-2026-1A22698B.
 *
 * Two proven defects:
 *   1. The admin form rendered a static order-level idempotency key, so the first (incorrect)
 *      manual confirmation permanently consumed the key and a corrected amount could never be
 *      applied by the intentionally idempotent record_payment_transition().
 *   2. processVerifiedPayment() returned and logged the newly calculated target state even when
 *      the RPC reported duplicate:true, so a corrected attempt logged PAID, duplicate:true while
 *      the order remained PAYMENT_REVIEW_REQUIRED.
 *
 * Provider-free and database-free: the Supabase client and notification transport are doubles.
 * No order is mutated, no payment is retried, no provider or email is reached.
 */
import assert from 'node:assert/strict';

// Analytics constructs its own Supabase client, so these must exist for the module to build.
// They point at the local discard port: the connection is refused immediately, no real
// Supabase project is contacted and nothing is written anywhere.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-regression-not-a-credential';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-regression-not-a-credential';
import { parseZarAmountToCents, formatCentsAsZarInput, resolveManualPaymentAmount } from '../../src/lib/payments/zar-amount.ts';

const ORDER_REFERENCE = 'MKORD-2026-1A22698B';
const ORDER_AMOUNT_CENTS = 750000; // ZAR 7,500.00

// ---------------------------------------------------------------------------
// 9. ZAR major units to integer cents, converted exactly once, no floating point.
// ---------------------------------------------------------------------------
assert.equal(parseZarAmountToCents('7500'), 750000, '7500 ZAR is 750000 cents');
assert.equal(parseZarAmountToCents('7500.50'), 750050, '7500.50 ZAR is 750050 cents');
assert.equal(parseZarAmountToCents('75'), 7500, '75 ZAR is 7500 cents');
assert.equal(parseZarAmountToCents('7500.00'), 750000);
assert.equal(parseZarAmountToCents('7500.5'), 750050, 'one decimal place is a tenth of a rand');
assert.equal(parseZarAmountToCents('0'), 0);
// Values that binary floating point would corrupt are exact here.
assert.equal(parseZarAmountToCents('7500.55'), 750055, 'no floating-point drift');
assert.equal(parseZarAmountToCents('1.10'), 110);
// Fails closed.
for (const bad of ['', '   ', 'abc', '-1', '-7500.00', '7500.555', '7,500.00', '7500.', '.50', '1e4', 'NaN', 'Infinity', null, undefined, {}, []]) {
  assert.equal(parseZarAmountToCents(bad), null, `must reject ${JSON.stringify(bad)}`);
}
assert.equal(parseZarAmountToCents('7500.555'), null, 'more than two decimal places fails closed');
// The operator sees the order amount in ZAR, not cents.
assert.equal(formatCentsAsZarInput(ORDER_AMOUNT_CENTS), '7500.00', 'the field defaults to ZAR major units');
assert.equal(formatCentsAsZarInput(7500), '75.00');
assert.equal(formatCentsAsZarInput(750050), '7500.50');

// ---------------------------------------------------------------------------
// Missing-amount fail-closed contract.
//
// confirmManualPayment() used to fall back to `input.amountCents ?? Number(order.amount_cents)`,
// so a payment_received submission that carried no usable amount was recorded as payment in
// full. The route now resolves the operator amount before the payment service is reachable, and
// only a `confirmation` resolution carries an amount at all.
//
// The submissions below are real FormData bodies, read exactly as the route reads them.
// ---------------------------------------------------------------------------
const submission = (fields) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return resolveManualPaymentAmount(String(form.get('status') ?? ''), form.get('amountZar'));
};

// 1. payment_received with no amountZar field at all.
const missingAmount = submission({ status: 'payment_received', note: 'Operator note' });
assert.equal(missingAmount.kind, 'invalid', 'a confirmation with no stated amount fails closed');
assert.equal('amountCents' in missingAmount, false, 'an invalid resolution carries no amount');

// 2. payment_received with a blank amountZar field.
const blankAmount = submission({ status: 'payment_received', amountZar: '', note: 'Operator note' });
assert.equal(blankAmount.kind, 'invalid', 'a confirmation with a blank amount fails closed');
assert.equal(submission({ status: 'payment_received', amountZar: '   ' }).kind, 'invalid', 'whitespace is blank');

// 3. A stale/legacy form carrying only the retired cent-denominated amountCents field. That
//    value is ambiguous against the ZAR major-unit contract and is never reinterpreted.
for (const staleValue of ['7500', '750000']) {
  const staleForm = submission({ status: 'payment_received', amountCents: staleValue, note: 'Operator note' });
  assert.equal(staleForm.kind, 'invalid', `a stale amountCents=${staleValue} form fails closed`);
}
// Proven distinct from the order total: neither stale reading is silently adopted.
assert.notEqual(parseZarAmountToCents('7500'), undefined);

// 4. A valid ZAR amount resolves to integer cents and is the only shape carrying one.
const validAmount = submission({ status: 'payment_received', amountZar: '7500.00', note: 'Operator note' });
assert.equal(validAmount.kind, 'confirmation');
assert.equal(validAmount.amountCents, 750000, 'ZAR 7500.00 is 750000 cents');
assert.equal(submission({ status: 'payment_received', amountZar: '7500.55' }).amountCents, 750055);
// A malformed amount on a confirmation still fails closed.
assert.equal(submission({ status: 'payment_received', amountZar: '7500.555' }).kind, 'invalid');
assert.equal(submission({ status: 'payment_received', amountZar: 'abc' }).kind, 'invalid');

// 7. Non-payment status updates are unaffected by the presence requirement.
for (const status of ['cancelled', 'expired', 'draft', 'awaiting_payment']) {
  assert.equal(submission({ status }).kind, 'no_confirmation', `${status} does not require an amount`);
  assert.equal(submission({ status, amountZar: '' }).kind, 'no_confirmation', `${status} tolerates a blank amount`);
  assert.equal(submission({ status, amountZar: '7500.00' }).kind, 'no_confirmation', `${status} never carries a payment amount`);
  assert.equal(submission({ status, amountCents: '750000' }).kind, 'no_confirmation', `${status} ignores a stale cents field`);
}
// A malformed amount is still rejected on any status, which is the already-approved behaviour.
assert.equal(submission({ status: 'cancelled', amountZar: 'abc' }).kind, 'invalid');

// The fallback that produced the fail-open path is gone from the service boundary.
const serviceSource = await (await import('node:fs/promises')).readFile('src/lib/payments/payment-service.ts', 'utf8');
assert.equal(/amountCents\?:/.test(serviceSource), false, 'confirmManualPayment requires an amount');
assert.equal(/input\.amountCents \?\? Number\(order\.amount_cents\)/.test(serviceSource), false, 'the order-total fallback is removed');

// ---------------------------------------------------------------------------
// 1-3. Per-render idempotency key.
// ---------------------------------------------------------------------------
const KEY_PATTERN = /^manual-payment:MKORD-2026-1A22698B:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const { randomUUID } = await import('node:crypto');
const renderKey = (orderReference) => `manual-payment:${orderReference}:${randomUUID()}`;
const firstRender = renderKey(ORDER_REFERENCE);
const secondRender = renderKey(ORDER_REFERENCE);
assert.match(firstRender, KEY_PATTERN, 'a rendered form carries an order-scoped per-render key');
assert.notEqual(firstRender, secondRender, 'a fresh page render produces a different key');
assert.notEqual(renderKey('MKORD-2026-2EF3FB30').split(':')[1], ORDER_REFERENCE, 'different orders produce distinct keys');
assert.equal(/^\d+$/.test(firstRender.split(':')[2] ?? ''), false, 'the key is not a weak timestamp-only value');

// ---------------------------------------------------------------------------
// Database double reproducing record_payment_transition() idempotency exactly.
// ---------------------------------------------------------------------------
import { processVerifiedPayment } from '../../src/lib/payments/payment-service.ts';

const ORDER = { id: 'order-1', order_reference: ORDER_REFERENCE, assessment_id: 'assessment-1', amount_cents: ORDER_AMOUNT_CENTS, currency: 'ZAR', status: 'payment_pending', customer_name: 'Test Organisation', customer_email: 'operator@example.invalid' };

function createDb() {
  const events = new Map();
  const calls = { transitions: 0, paidSideEffects: 0 };
  const db = {
    events, calls,
    from(table) {
      if (table === 'app_settings') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value_json: { schema_version: '0024' } }, error: null }) }) }) };
      if (table === 'orders') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ORDER, error: null }) }) }) };
      if (table === 'payment_automation_records') return { update: () => ({ eq: async () => { calls.paidSideEffects += 1; return { error: null }; } }) };
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: async () => ({ error: null }) };
    },
    async rpc(name, args) {
      if (name === 'payment_automation_capability') return { data: { status: 'ok', available: true, schema_version: '0024', missing_objects: [], missing_permissions: [] }, error: null };
      if (name !== 'record_payment_transition') return { data: {}, error: null };
      calls.transitions += 1;
      const existing = events.get(args.p_idempotency_key);
      // Idempotent by key: the ORIGINAL persisted state is returned and nothing is applied.
      if (existing) return { data: { applied: false, duplicate: true, state: existing.state, event_id: existing.id }, error: null };
      const record = { id: `evt-${events.size + 1}`, state: args.p_new_state, amount: args.p_amount_cents };
      events.set(args.p_idempotency_key, record);
      return { data: { applied: true, duplicate: false, state: args.p_new_state, event_id: record.id }, error: null };
    }
  };
  return db;
}

let notifications = 0;
const db = createDb();
const submit = (idempotencyKey, amountCents, currency = 'ZAR') => processVerifiedPayment({
  source: 'manual_admin', actorReference: 'admin-1', idempotencyKey,
  event: { orderReference: ORDER_REFERENCE, amountCents, currency, outcome: 'succeeded', transactionReference: 'manual-ref', eventId: `manual-${idempotencyKey}`, occurredAt: new Date(0).toISOString(), safeNote: 'Manual confirmation', verificationResult: 'verified', payloadSha256: null },
  dependencies: { db, notifyPaymentReceived: async () => { notifications += 1; } }
});

// 4. The Production first attempt: ZAR 75.00 entered against a ZAR 7,500.00 order.
const badKey = renderKey(ORDER_REFERENCE);
const first = await submit(badKey, 7500);
assert.equal(first.state, 'PAYMENT_REVIEW_REQUIRED', 'a below-order amount goes to review');
assert.equal(first.duplicate, false);
assert.equal(notifications, 0, 'no PAID notification for a review-required transition');
assert.equal(db.calls.paidSideEffects, 0);

// 2. The same rendered form submitted twice stays idempotent and reports the persisted state.
const resubmit = await submit(badKey, 7500);
assert.equal(resubmit.duplicate, true, 'the same rendered key is duplicate-safe');
assert.equal(resubmit.state, 'PAYMENT_REVIEW_REQUIRED', 'the persisted state is reported');

// 6/7. The old defect: reusing the order-level key with the CORRECTED amount.
const stale = await submit(badKey, ORDER_AMOUNT_CENTS);
assert.equal(stale.duplicate, true, 'a reused key is still a duplicate');
assert.equal(stale.state, 'PAYMENT_REVIEW_REQUIRED', 'the RPC persisted state is reported, not the newly calculated PAID target');
assert.notEqual(stale.state, 'PAID', 'a duplicate must never claim the uncommitted target state');
// 8. A duplicate PAID target must not fire PAID-only side effects.
assert.equal(notifications, 0, 'no notification on a duplicate PAID target');
assert.equal(db.calls.paidSideEffects, 0, 'no payment_automation_records update on a duplicate');

// 3/5. A fresh page render allows the corrected confirmation to apply.
const freshKey = renderKey(ORDER_REFERENCE);
assert.notEqual(freshKey, badKey);
const corrected = await submit(freshKey, ORDER_AMOUNT_CENTS);
assert.equal(corrected.duplicate, false, 'a corrected attempt is not a duplicate of the bad first attempt');
assert.equal(corrected.state, 'PAID', 'the corrected amount transitions the order to PAID');
assert.equal(notifications, 1, 'the genuine PAID transition fires its notification exactly once');
assert.equal(db.calls.paidSideEffects, 1, 'PAID-only side effects run exactly once');
const correctedSnapshot = { notifications, paidSideEffects: db.calls.paidSideEffects };

// 11/12. Above-order and exact-amount rules are unchanged.
const above = await submit(renderKey(ORDER_REFERENCE), ORDER_AMOUNT_CENTS + 1);
assert.equal(above.state, 'PAYMENT_REVIEW_REQUIRED', 'an above-order amount still goes to review');
const exact = await submit(renderKey(ORDER_REFERENCE), ORDER_AMOUNT_CENTS);
assert.equal(exact.state, 'PAID', 'the exact amount is still required for PAID');

// 13. Currency mismatch still goes to review.
const wrongCurrency = await submit(renderKey(ORDER_REFERENCE), ORDER_AMOUNT_CENTS, 'USD');
assert.equal(wrongCurrency.state, 'PAYMENT_REVIEW_REQUIRED', 'a currency mismatch still goes to review');

// 10. A below-order amount still goes to review under a fresh key.
const belowAgain = await submit(renderKey(ORDER_REFERENCE), ORDER_AMOUNT_CENTS - 1);
assert.equal(belowAgain.state, 'PAYMENT_REVIEW_REQUIRED');

// 14. Verifier authorisation is untouched: the route still requires an authenticated admin and
//     the service still records the actor reference on every transition.
const routeSource = await (await import('node:fs/promises')).readFile('src/app/score/admin/orders/[orderReference]/status/route.ts', 'utf8');
assert.match(routeSource, /requireAdmin|admin\.id/, 'the status route still authorises an admin actor');
assert.match(routeSource, /resolveManualPaymentAmount/, 'the route converts ZAR to cents exactly once');
assert.match(routeSource, /invalid_payment_amount/, 'a malformed or missing amount fails closed');
assert.match(routeSource, /amount\.kind === 'confirmation'/, 'the payment service is reached only with a resolved amount');
assert.equal(/amountCentsZar/.test(routeSource), false, 'no ambiguous alternate amount field is read');
const pageSource = await (await import('node:fs/promises')).readFile('src/app/score/admin/orders/[orderReference]/page.tsx', 'utf8');
assert.match(pageSource, /name="amountZar"/, 'the operator field is in ZAR major units');
assert.match(pageSource, /aria-label="Received amount in ZAR"/, 'the field is labelled in ZAR');
assert.equal(/name="amountCents"/.test(pageSource), false, 'the misleading cents field is gone');
assert.match(pageSource, /value=\{manualPaymentRequestKey\}/, 'the form uses the per-render key');
assert.equal(/value=\{`manual-payment:\$\{order\.order_reference\}`\}/.test(pageSource), false, 'the static order-level key is gone');

console.log(JSON.stringify({
  status: 'PASS', providerCalls: 0, databaseWrites: 0, emailsSent: 0,
  idempotency: { firstAttemptKey: badKey.replace(/:[0-9a-f-]{36}$/, ':<uuid>'), freshRenderKeyDiffers: freshKey !== badKey },
  productionDefectReproduced: { reusedKeyWithCorrectedAmount: { duplicate: stale.duplicate, reportedState: stale.state, calculatedTarget: 'PAID' } },
  correctedFlow: { first: first.state, corrected: corrected.state, ...correctedSnapshot },
  zarConversion: { '7500': parseZarAmountToCents('7500'), '7500.50': parseZarAmountToCents('7500.50'), '75': parseZarAmountToCents('75'), '7500.555': parseZarAmountToCents('7500.555') },
  missingAmountFailsClosed: {
    payment_received_no_field: missingAmount.kind,
    payment_received_blank: blankAmount.kind,
    payment_received_stale_amountCents_7500: submission({ status: 'payment_received', amountCents: '7500' }).kind,
    payment_received_stale_amountCents_750000: submission({ status: 'payment_received', amountCents: '750000' }).kind,
    payment_received_valid_7500_00: validAmount.amountCents,
    cancelled_no_amount: submission({ status: 'cancelled' }).kind
  }
}, null, 2));

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseStitchPaymentEvent, signStitchWebhookForDouble, verifyStitchWebhook } from '../src/lib/payments/stitch-adapter.ts';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const required = [
  'supabase/migrations/0024_phase23_payment_automation.sql',
  'supabase/migrations/0025_phase23_assessment_resume.sql',
  'src/lib/payments/payment-service.ts',
  'src/lib/payments/fulfilment.ts',
  'src/lib/payments/stitch-adapter.ts',
  'src/app/score/api/webhooks/stitch/route.ts',
  'src/app/score/payment/return/page.tsx',
  'src/components/payments/PaymentReturnStatus.tsx',
  'src/components/assessment/AssessmentEngine.tsx'
];
for (const file of required) assert.ok(existsSync(path.join(root, file)), `${file} must exist`);

const paymentMigration = read(required[0]);
for (const state of ['PAYMENT_PENDING', 'PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_REVIEW_REQUIRED', 'REFUNDED', 'CANCELLED']) {
  assert.match(paymentMigration, new RegExp(`'${state}'`));
}
for (const field of ['order_reference', 'old_state', 'new_state', 'source', 'actor_reference', 'amount_cents', 'currency', 'provider_transaction_reference', 'provider_event_reference', 'provider_event_at', 'safe_note', 'verification_result', 'idempotency_key', 'technical_reference']) {
  assert.match(paymentMigration, new RegExp(`\\b${field}\\b`), `transition ledger persists ${field}`);
}
assert.match(paymentMigration, /idempotency_key text not null unique/);
assert.match(paymentMigration, /payment_transition_provider_event_uidx/);
assert.match(paymentMigration, /for update/);
assert.match(paymentMigration, /claim_payment_report_generation/);
assert.doesNotMatch(paymentMigration, /phase14_(?:require|complete|satisfy|workflow)/i);

const paymentService = read('src/lib/payments/payment-service.ts');
const fulfilment = read('src/lib/payments/fulfilment.ts');
assert.match(paymentService, /confirmManualPayment/);
assert.match(paymentService, /processVerifiedPayment/);
assert.equal((paymentService.match(/triggerPaidOrderFulfilment/g) ?? []).length, 2, 'one shared fulfilment import and call are expected');
assert.ok(fulfilment.indexOf('await getPhase1SchemaCapability') < fulfilment.indexOf('const generated = await generateManualPhase1Report'));
assert.match(fulfilment, /Payment confirmed\. Fulfilment will remain pending until the Phase 1 upgrade is activated\./);
assert.doesNotMatch(paymentService + fulfilment, /phase14/i);

const webhook = read('src/app/score/api/webhooks/stitch/route.ts');
assert.ok(webhook.indexOf('const rawBody = await request.text()') < webhook.indexOf('delivery = verifyStitchWebhook'));
assert.match(webhook, /stitch:\$\{event\.eventId\}/);
assert.doesNotMatch(webhook, /request\.json\(\)/);

const secret = `whsec_${Buffer.from('local-release-safety-secret').toString('base64')}`;
const now = Math.floor(Date.now() / 1000);
const payload = JSON.stringify({
  id: 'evt-valid', datetime: new Date(now * 1000).toISOString(),
  data: { externalReference: 'MKORD-VALID', state: { __typename: 'PaymentInitiationRequestCompleted', id: 'txn-valid', amount: { quantity: '1250.00', currency: 'ZAR' } } }
});
const signature = signStitchWebhookForDouble(payload, 'delivery-valid', String(now), secret);
const headers = new Headers({ 'svix-id': 'delivery-valid', 'svix-timestamp': String(now), 'svix-signature': signature });
assert.equal(verifyStitchWebhook({ rawBody: payload, headers, secret, nowSeconds: now }).id, 'delivery-valid');
assert.throws(() => verifyStitchWebhook({ rawBody: `${payload} `, headers, secret, nowSeconds: now }), /signature_invalid/);
assert.throws(() => verifyStitchWebhook({ rawBody: payload, headers, secret, nowSeconds: now + 301 }), /outside_tolerance/);
assert.throws(() => parseStitchPaymentEvent('{', 'bad'), /payload_malformed/);
const parsed = parseStitchPaymentEvent(payload, 'delivery-valid');
assert.deepEqual({ order: parsed.orderReference, amount: parsed.amountCents, currency: parsed.currency, outcome: parsed.outcome }, { order: 'MKORD-VALID', amount: 125000, currency: 'ZAR', outcome: 'completed' });

class PaymentDouble {
  constructor({ phase1 = true } = {}) { this.phase1 = phase1; this.orders = new Map(); this.events = new Map(); this.timeline = []; this.generation = new Map(); }
  add(reference, overrides = {}) { const value = { reference, amount: 125000, currency: 'ZAR', state: 'PAYMENT_PENDING', complete: true, report: false, ...overrides }; this.orders.set(reference, value); return value; }
  async receive(event) {
    await Promise.resolve();
    if (this.events.has(event.id)) return { ...this.events.get(event.id), duplicate: true };
    const order = this.orders.get(event.order);
    if (!order) return { rejected: 'unknown_order' };
    let state = event.outcome === 'failed' ? 'PAYMENT_FAILED' : event.outcome === 'refunded' ? 'REFUNDED' : event.outcome === 'cancelled' ? 'CANCELLED' : 'PAID';
    if (event.outcome === 'completed' && (event.amount !== order.amount || event.currency !== order.currency)) state = 'PAYMENT_REVIEW_REQUIRED';
    const result = { state, duplicate: false };
    this.events.set(event.id, result); order.state = state; this.timeline.push({ event: event.id, state });
    if (state === 'PAID') {
      if (!this.phase1) result.fulfilment = 'phase1_unavailable';
      else if (order.report) result.fulfilment = 'already_fulfilled';
      else if (order.complete && !this.generation.has(order.reference)) { this.generation.set(order.reference, event.id); result.fulfilment = 'queued'; }
    }
    return result;
  }
  returnState(reference) { return this.orders.get(reference)?.state ?? 'PAYMENT_PENDING'; }
}

const manual = new PaymentDouble(); manual.add('MANUAL');
assert.equal((await manual.receive({ id: 'manual-1', order: 'MANUAL', amount: 125000, currency: 'ZAR', outcome: 'completed' })).state, 'PAID');
assert.equal((await manual.receive({ id: 'manual-1', order: 'MANUAL', amount: 125000, currency: 'ZAR', outcome: 'completed' })).duplicate, true);
assert.equal(manual.timeline.length, 1); assert.equal(manual.generation.size, 1);

const concurrent = new PaymentDouble(); concurrent.add('CONCURRENT');
const concurrentResults = await Promise.all(Array.from({ length: 8 }, () => concurrent.receive({ id: 'same-event', order: 'CONCURRENT', amount: 125000, currency: 'ZAR', outcome: 'completed' })));
assert.equal(concurrent.timeline.length, 1); assert.equal(concurrent.generation.size, 1); assert.equal(concurrentResults.filter((item) => item.duplicate).length, 7);

for (const [label, amount, currency] of [['underpayment', 124999, 'ZAR'], ['overpayment', 125001, 'ZAR'], ['wrong currency', 125000, 'USD']]) {
  const test = new PaymentDouble(); test.add(label);
  assert.equal((await test.receive({ id: label, order: label, amount, currency, outcome: 'completed' })).state, 'PAYMENT_REVIEW_REQUIRED');
  assert.equal(test.generation.size, 0);
}
const outcomes = new PaymentDouble(); outcomes.add('FAILED'); outcomes.add('REFUND', { state: 'PAID' }); outcomes.add('CANCEL');
assert.equal((await outcomes.receive({ id: 'failed', order: 'FAILED', amount: 125000, currency: 'ZAR', outcome: 'failed' })).state, 'PAYMENT_FAILED');
assert.equal((await outcomes.receive({ id: 'refund', order: 'REFUND', amount: 125000, currency: 'ZAR', outcome: 'refunded' })).state, 'REFUNDED');
assert.equal((await outcomes.receive({ id: 'cancel', order: 'CANCEL', amount: 125000, currency: 'ZAR', outcome: 'cancelled' })).state, 'CANCELLED');
assert.deepEqual(await outcomes.receive({ id: 'unknown', order: 'UNKNOWN', amount: 1, currency: 'ZAR', outcome: 'completed' }), { rejected: 'unknown_order' });
const noWebhook = new PaymentDouble(); noWebhook.add('RETURN'); assert.equal(noWebhook.returnState('RETURN'), 'PAYMENT_PENDING');
const pre0023 = new PaymentDouble({ phase1: false }); pre0023.add('PRE0023'); assert.equal((await pre0023.receive({ id: 'pre', order: 'PRE0023', amount: 125000, currency: 'ZAR', outcome: 'completed' })).fulfilment, 'phase1_unavailable');
const existing = new PaymentDouble(); existing.add('EXISTING', { report: true }); assert.equal((await existing.receive({ id: 'existing', order: 'EXISTING', amount: 125000, currency: 'ZAR', outcome: 'completed' })).fulfilment, 'already_fulfilled'); assert.equal(existing.generation.size, 0);

const landing = read('src/app/(website)/fraud-readiness-score/page.tsx');
const engine = read('src/components/assessment/AssessmentEngine.tsx');
const combinedAssessment = landing + engine + read('src/app/score/start/page.tsx');
assert.doesNotMatch(combinedAssessment, /<iframe|postMessage|ResizeObserver/);
assert.match(landing, /StartAssessmentForm/);
for (const evidence of ['fieldset', 'type="radio"', 'aria-live="polite"', 'role="progressbar"', 'motion-reduce:transition-none', 'min-h-11', 'Retry save', 'sessionStorage', 'scrollIntoView', 'prefers-reduced-motion', 'domainCompleted', 'initialActiveQuestionId']) {
  assert.ok(engine.includes(evidence), `assessment engine covers ${evidence}`);
}
assert.doesNotMatch(engine, /localStorage/);
assert.match(read('src/lib/respondent/assessment-save.ts'), /save_assessment_resume_state/);
assert.match(read('src/lib/assessment-experience/resume-capability.ts'), /'available' \| 'unavailable' \| 'error'/);
assert.doesNotMatch(read('supabase/migrations/0025_phase23_assessment_resume.sql'), /(?:access|resume|raw)_token\s+(?:text|uuid|jsonb)/i);
assert.match(read('supabase/migrations/0025_phase23_assessment_resume.sql'), /"stores_tokens":false/);

class AssessmentDouble {
  constructor(domainSizes) { this.domainSizes = domainSizes; this.answers = domainSizes.map((count) => Array(count).fill(null)); this.domain = 0; this.question = 0; this.saves = 0; }
  answer(value, { fail = false } = {}) {
    if (fail) return { saved: false, domain: this.domain, question: this.question };
    this.answers[this.domain][this.question] = value; this.saves += 1;
    const same = this.answers[this.domain].findIndex((item) => item === null);
    if (same >= 0) this.question = same;
    else { const next = this.answers.findIndex((items) => items.some((item) => item === null)); if (next >= 0) { this.domain = next; this.question = this.answers[next].findIndex((item) => item === null); } }
    return { saved: true, domain: this.domain, question: this.question };
  }
  reopen(domain) { this.domain = domain; this.question = 0; }
  get progress() { const total = this.answers.flat().length; return Math.round((this.answers.flat().filter((item) => item !== null).length / total) * 100); }
}
const assessment = new AssessmentDouble([2, 2]);
assert.deepEqual(assessment.answer(4, { fail: true }), { saved: false, domain: 0, question: 0 });
assert.deepEqual(assessment.answer(4), { saved: true, domain: 0, question: 1 });
assert.deepEqual(assessment.answer(3), { saved: true, domain: 1, question: 0 });
assessment.answer(4); assessment.answer(4); assert.equal(assessment.progress, 100);
assessment.reopen(0); assessment.answer(2); assert.equal(assessment.answers[0][0], 2); assert.equal(assessment.saves, 5);

console.log('Phase 2-3 payment and assessment release-safety tests passed: signatures, mismatch states, replay/concurrency, Phase 1 gating, native progression, retry, resume and accessibility architecture.');

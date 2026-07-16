import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
assert.ok(supabaseUrl && serviceRoleKey, 'Local Supabase URL and service role key are required.');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(new URL(supabaseUrl).hostname), 'Payment integration may only use loopback Supabase.');

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const nonce = crypto.randomUUID();
const { data: assessment, error: assessmentError } = await db.from('assessments')
  .select('id').in('status', ['scored', 'snapshot_available', 'report_requested', 'under_review', 'closed'])
  .not('current_score_run_id', 'is', null).order('created_at', { ascending: false }).limit(1).single();
assert.ifError(assessmentError);
const { data: product, error: productError } = await db.from('products').select('id').eq('active', true).limit(1).single();
assert.ifError(productError);

const orderReferences = [`MKORD-DB-WEBHOOK-${nonce}`, `MKORD-DB-MANUAL-${nonce}`];
const { error: orderError } = await db.from('orders').insert(orderReferences.map((orderReference) => ({
  order_reference: orderReference,
  assessment_id: assessment.id,
  product_id: product.id,
  status: 'awaiting_payment',
  amount_cents: 125000,
  currency: 'ZAR'
})));
assert.ifError(orderError);

async function proveSingleTransition(orderReference, source) {
  const eventReference = `${source}:${nonce}`;
  const parameters = {
    p_order_reference: orderReference,
    p_new_state: 'PAID',
    p_source: source,
    p_actor_reference: source === 'manual_admin' ? 'disposable-test-admin' : 'stitch-double',
    p_amount_cents: 125000,
    p_currency: 'ZAR',
    p_provider_transaction_reference: `txn:${nonce}`,
    p_provider_event_reference: eventReference,
    p_provider_event_at: new Date().toISOString(),
    p_safe_note: 'Disposable database concurrency verification.',
    p_verification_result: source === 'manual_admin' ? 'authorised_manual_confirmation' : 'svix_signature_valid',
    p_idempotency_key: `idempotency:${eventReference}`,
    p_technical_reference: `technical:${eventReference}`,
    p_payload_sha256: null
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => db.rpc('record_payment_transition', parameters)));
  for (const result of results) assert.ifError(result.error);
  assert.equal(results.filter((result) => result.data?.applied === true).length, 1, `${source} must apply once.`);
  assert.equal(results.filter((result) => result.data?.duplicate === true).length, 7, `${source} must replay seven calls.`);
  const { count: transitionCount, error: transitionError } = await db.from('payment_transition_events')
    .select('id', { count: 'exact', head: true }).eq('order_reference', orderReference);
  assert.ifError(transitionError);
  assert.equal(transitionCount, 1, `${source} must persist one payment transition.`);
  const { data: order } = await db.from('orders').select('id').eq('order_reference', orderReference).single();
  const { count: timelineCount, error: timelineError } = await db.from('order_events')
    .select('id', { count: 'exact', head: true }).eq('order_id', order.id).eq('event_type', 'payment_transition');
  assert.ifError(timelineError);
  assert.equal(timelineCount, 1, `${source} must persist one order timeline event.`);
}

try {
  await proveSingleTransition(orderReferences[0], 'stitch_webhook');
  await proveSingleTransition(orderReferences[1], 'manual_admin');

  const claimParameters = {
    p_order_reference: orderReferences[0],
    p_request_key: `payment:${nonce}`,
    p_technical_reference: `claim:${nonce}`
  };
  const claims = await Promise.all(Array.from({ length: 8 }, () => db.rpc('claim_payment_report_generation', claimParameters)));
  for (const claim of claims) assert.ifError(claim.error);
  assert.equal(claims.filter((claim) => claim.data?.claimed === true).length, 1, 'Concurrent fulfilment claims must create one attempt.');
  const { data: webhookOrder } = await db.from('orders').select('id').eq('order_reference', orderReferences[0]).single();
  const { count: attemptCount, error: attemptError } = await db.from('manual_report_generation_attempts')
    .select('id', { count: 'exact', head: true }).eq('order_id', webhookOrder.id);
  assert.ifError(attemptError);
  assert.equal(attemptCount, 1, 'One payment must create one generation request.');

  console.log(JSON.stringify({ ok: true, concurrentWebhookCalls: 8, concurrentManualCalls: 8, paymentTransitions: 2, generationAttempts: 1 }));
} finally {
  await db.from('orders').delete().in('order_reference', orderReferences);
}

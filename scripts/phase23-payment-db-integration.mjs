import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
assert.ok(supabaseUrl && serviceRoleKey, 'Local Supabase URL and service role key are required.');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(new URL(supabaseUrl).hostname), 'Payment integration may only use loopback Supabase.');

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const nonce = crypto.randomUUID();
let assessment = null;
let assessmentError = null;
let respondentEvidence = null;
if (process.env.PHASE23_RESPONDENT_EVIDENCE_PATH) {
  respondentEvidence = JSON.parse(await readFile(process.env.PHASE23_RESPONDENT_EVIDENCE_PATH, 'utf8'));
  assert.ok(respondentEvidence.assessmentId, 'Respondent evidence did not include an assessment ID.');
}
for (let attempt = 0; attempt < 10 && !assessment; attempt += 1) {
  const query = db.from('assessments').select('id,organisation_id,status,current_score_run_id');
  const result = respondentEvidence
    ? await query.eq('id', respondentEvidence.assessmentId).maybeSingle()
    : await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
  assessment = result.data;
  assessmentError = result.error;
  if (!assessment && !assessmentError) await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ifError(assessmentError);
assert.ok(assessment, `The respondent assessment ${respondentEvidence?.assessmentId ?? 'latest'} must be available after respondent integration.`);
assert.ok(['scored', 'snapshot_available', 'report_requested', 'under_review', 'closed'].includes(assessment.status), `Assessment is not in a completed status: ${assessment.status}`);
assert.ok(assessment.current_score_run_id, `Completed assessment ${assessment.id} has no current score run.`);
const { data: product, error: productError } = await db.from('products').select('id').eq('active', true).limit(1).single();
assert.ifError(productError);
let { data: verifier, error: verifierError } = await db.from('admin_profiles')
  .select('id').eq('status', 'active').in('role', ['platform_admin', 'finance_admin']).limit(1).maybeSingle();
assert.ifError(verifierError);
let createdVerifierUserId = null;
if (!verifier) {
  const email = `phase23-admin-${nonce}@example.test`;
  const { data: createdUser, error: createUserError } = await db.auth.admin.createUser({
    email,
    password: `Phase23-${nonce}-A9!`,
    email_confirm: true
  });
  assert.ifError(createUserError);
  assert.ok(createdUser.user?.id);
  createdVerifierUserId = createdUser.user.id;
  const { data: createdProfile, error: createProfileError } = await db.from('admin_profiles').insert({
    id: createdVerifierUserId,
    email,
    full_name: 'Phase 2-3 Disposable Verifier',
    role: 'platform_admin',
    status: 'active'
  }).select('id').single();
  assert.ifError(createProfileError);
  verifier = createdProfile;
}

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
    p_actor_reference: source === 'manual_admin' ? verifier.id : 'stitch-double',
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

async function proveInvalidManualEvidenceIsAtomic(orderReference) {
  const { error } = await db.rpc('record_payment_transition', {
    p_order_reference: orderReference,
    p_new_state: 'PAID',
    p_source: 'manual_admin',
    p_actor_reference: '00000000-0000-4000-8000-000000000000',
    p_amount_cents: 125000,
    p_currency: 'ZAR',
    p_provider_transaction_reference: null,
    p_provider_event_reference: `invalid:${nonce}`,
    p_provider_event_at: new Date().toISOString(),
    p_safe_note: 'Must be rejected before any payment side effect.',
    p_verification_result: 'authorised_manual_confirmation',
    p_idempotency_key: `invalid:${nonce}`,
    p_technical_reference: `invalid-technical:${nonce}`,
    p_payload_sha256: null
  });
  assert.ok(error, 'invalid manual verifier must be rejected');
  // 0024/0025 is deliberately tested before the later G29 payment-verification migration. The
  // reviewed 0024 function rejects this same invalid UUID at the orders FK boundary; the later
  // function gives the narrower payment_manual_verifier_invalid error. Both are fail-closed and
  // must leave the order and all payment side-effect tables untouched.
  assert.match(String(error.message), /payment_manual_verifier_invalid|orders_verified_by_fkey/);
  const { data: order } = await db.from('orders').select('id,status,verified_at,verified_by').eq('order_reference', orderReference).single();
  assert.equal(order.status, 'awaiting_payment');
  assert.equal(order.verified_at, null);
  assert.equal(order.verified_by, null);
  for (const table of ['payment_automation_records', 'payment_transition_events', 'order_events', 'manual_report_generation_attempts']) {
    const key = table === 'payment_transition_events' ? 'order_reference' : 'order_id';
    const value = table === 'payment_transition_events' ? orderReference : order.id;
    const column = table === 'payment_automation_records' ? 'order_id' : 'id';
    const { count, error: countError } = await db.from(table).select(column, { count: 'exact', head: true }).eq(key, value);
    assert.ifError(countError);
    assert.equal(count, 0, `${table} must remain untouched after invalid evidence`);
  }
}

try {
  await proveInvalidManualEvidenceIsAtomic(orderReferences[1]);
  await proveSingleTransition(orderReferences[0], 'stitch_webhook');
  await proveSingleTransition(orderReferences[1], 'manual_admin');

  const claimParameters = {
    p_order_reference: orderReferences[0],
    p_request_key: `payment:${nonce}`,
    p_technical_reference: `claim:${nonce}`
  };
  const claims = await Promise.all(Array.from({ length: 8 }, () => db.rpc('claim_payment_report_generation', claimParameters)));
  for (const claim of claims) assert.ifError(claim.error);
  // Release B queues the durable fulfilment attempt atomically with the payment transition.
  // These follow-up claims must therefore observe that one active attempt and create none.
  assert.equal(claims.filter((claim) => claim.data?.claimed === true).length, 0, 'Follow-up claims must not create a second attempt.');
  assert.equal(claims.filter((claim) => claim.data?.reason === 'already_active').length, 8, 'All follow-up claims must reuse the active attempt.');
  const { data: webhookOrder } = await db.from('orders').select('id').eq('order_reference', orderReferences[0]).single();
  const { count: attemptCount, error: attemptError } = await db.from('manual_report_generation_attempts')
    .select('id', { count: 'exact', head: true }).eq('order_id', webhookOrder.id);
  assert.ifError(attemptError);
  assert.equal(attemptCount, 1, 'One payment must create one generation request.');

  console.log(JSON.stringify({ ok: true, concurrentWebhookCalls: 8, concurrentManualCalls: 8, paymentTransitions: 2, generationAttempts: 1 }));
} finally {
  const { error: orderCleanupError } = await db.from('orders').delete().in('order_reference', orderReferences);
  assert.ifError(orderCleanupError);
  if (createdVerifierUserId) {
    await db.from('admin_profiles').delete().eq('id', createdVerifierUserId);
    const { error: deleteUserError } = await db.auth.admin.deleteUser(createdVerifierUserId);
    assert.ifError(deleteUserError);
  }
}

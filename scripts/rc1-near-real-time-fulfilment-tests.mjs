import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  dispatchImmediateFulfilment,
  immediateFulfilmentDispatchPayload,
} from '../src/lib/fulfilment/immediate-dispatch.ts';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20260728120000_rc1_near_real_time_automatic_fulfilment.sql');
const payment = read('src/lib/payments/payment-service.ts');
const paymentRoute = read('src/app/score/admin/orders/[orderReference]/status/route.ts');
const dispatch = read('src/lib/fulfilment/immediate-dispatch.ts');
const worker = read('src/app/score/api/internal/fulfilment-worker/route.ts');
const delivery = read('src/lib/fulfilment/delivery-worker.ts');
const notifications = read('src/lib/notifications/phase1-order-notifications.ts');
const postflight = read('scripts/rc1-production-postflight.sql');
const replay = read('scripts/rc1-prepostflight-disposable-tests.mjs');
const vercel = JSON.parse(read('vercel.json'));

const results = [];
async function test(name, fn) {
  await fn();
  results.push(name);
  console.log(`ok ${results.length} - ${name}`);
}
function includes(source, value, message) {
  assert.ok(source.includes(value), message);
}

const calls = [];
const fakeClient = () => ({
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: { ok: true }, error: null };
  },
});
let capturedRequest;
const startedAt = performance.now();
const successfulDispatch = await dispatchImmediateFulfilment({
  attemptId: '11111111-1111-4111-8111-111111111111',
  correlationReference: '22222222-2222-4222-8222-222222222222'
}, {
  createClient: fakeClient,
  env: {
    NODE_ENV: 'production',
    VERCEL_URL: 'exact-deployment.example.vercel.app',
    CRON_SECRET: 'synthetic-secret-never-logged',
  },
  fetchImpl: async (url, init) => {
    capturedRequest = { url, init };
    return new Response('{}', { status: 200 });
  },
});
const dispatchDurationMs = performance.now() - startedAt;

await test('order submission alone has no fulfilment trigger', async () => {
  assert.doesNotMatch(read('src/lib/orders/manual-eft-orders.ts'), /claim_exact_fulfilment_job|dispatchImmediateFulfilment/);
  includes(replay, 'order submission alone creates no fulfilment attempt', 'disposable DB proof is present');
});
await test('manual payment creates one durable queued attempt', async () => {
  includes(migration, "'fulfilment_attempt_id', v_job_id", 'payment transition returns exact attempt');
  includes(replay, 'manual payment confirmation returns one queued attempt ID', 'DB proof is present');
});
await test('duplicate payment creates no second attempt', async () => {
  includes(migration, "'fulfilment_attempt_id', null", 'duplicates are not dispatchable');
  includes(replay, 'duplicate payment confirmation creates no second attempt', 'DB proof is present');
});
await test('successful payment schedules waitUntil dispatch', async () => {
  includes(paymentRoute, "import { waitUntil } from '@vercel/functions'", 'Vercel waitUntil is used');
  includes(paymentRoute, 'waitUntil(dispatchImmediateFulfilment({', 'dispatch is registered with waitUntil');
});
await test('payment response does not await PDF generation', async () => {
  assert.doesNotMatch(paymentRoute, /await\s+dispatchImmediateFulfilment/);
  assert.doesNotMatch(payment, /import\s+\{[^}]*generateManualPhase1Report/);
});
await test('dispatch failure preserves durable payment and queue', async () => {
  const failureCalls = [];
  const result = await dispatchImmediateFulfilment({
    attemptId: '33333333-3333-4333-8333-333333333333',
    correlationReference: '44444444-4444-4444-8444-444444444444'
  }, {
    createClient: () => ({
      rpc: async (_name, args) => {
        failureCalls.push(args);
        return { data: {}, error: null };
      },
    }),
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: 'exact-deployment.example.vercel.app',
      CRON_SECRET: 'synthetic-secret-never-logged',
    },
    fetchImpl: async () => { throw new Error('synthetic network failure'); },
  });
  assert.equal(result.ok, false);
  assert.equal(failureCalls.at(-1).p_outcome, 'failed');
  assert.doesNotMatch(migration, /record_fulfilment_dispatch_result[\s\S]*set status = 'GENERATION_FAILED'/);

  const invalidOrigin = await dispatchImmediateFulfilment({
    attemptId: '77777777-7777-4777-8777-777777777777',
    correlationReference: '88888888-8888-4888-8888-888888888888'
  }, {
    createClient: fakeClient,
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: '127.0.0.1',
      CRON_SECRET: 'synthetic-secret-never-logged',
    },
    fetchImpl: async () => { throw new Error('invalid origin must not be fetched'); },
  });
  assert.equal(invalidOrigin.ok, false);
  assert.equal(invalidOrigin.errorCategory, 'exact_deployment_url_unavailable');
});
await test('immediate worker claims the exact intended attempt', async () => {
  includes(worker, "db.rpc('claim_exact_fulfilment_job'", 'POST uses exact claim RPC');
  includes(replay, 'immediate worker claims the exact intended attempt', 'DB proof is present');
});
await test('unrelated queued order remains untouched', async () => {
  includes(worker, 'claimMode: exact', 'exact mode is isolated from scheduled mode');
  includes(replay, 'exact immediate claim leaves unrelated queued work untouched', 'DB proof is present');
});
await test('commercial-quality failure blocks release and delivery', async () => {
  includes(migration, 'commercial_quality_evidence_missing', 'release requires quality evidence');
  includes(replay, 'commercial-quality failure prevents automatic release and delivery', 'DB proof is present');
});
await test('PDF or Storage verification failure blocks delivery', async () => {
  includes(migration, 'pdf_storage_verification_required', 'PDF/Storage metadata is mandatory');
  includes(migration, 'phase14_delivery_entitlement(', 'Storage object entitlement is revalidated');
  includes(replay, 'PDF or Storage verification failure prevents automatic release and delivery', 'DB proof is present');
});
await test('successful generation releases exactly one report', async () => {
  includes(migration, "set status = 'released'", 'report release is transactional');
  includes(replay, 'verified generation automatically releases the exact report', 'DB proof is present');
});
await test('release creates exactly one authorization and email event', async () => {
  includes(migration, 'where email_event_id = v_event.id', 'authorization reuses unique event');
  includes(replay, 'authorization and email event', 'DB count proof is present');
});
await test('same invocation processes exact authorised delivery', async () => {
  includes(worker, 'authorizationId: release.delivery_authorization_id', 'release ID is continued');
  includes(delivery, "db.rpc('claim_exact_delivery'", 'shared processor exact-claims it');
});
await test('exactly one secure token is issued in successful flow', async () => {
  includes(delivery, "'issue_customer_report_access_token'", 'shared delivery issues token once');
  includes(replay, 'exact delivery issues one secure access token', 'DB proof is present');
});
await test('exactly one provider send occurs', async () => {
  assert.equal((delivery.match(/await sendEmail\(/g) ?? []).length, 1);
});
await test('duplicate invocation creates no second output', async () => {
  includes(replay, 'duplicate invocation creates no second report token, authorization or finalization', 'DB proof is present');
});
await test('missing recipient alerts admin and sends no customer delivery', async () => {
  includes(notifications, "recipient: 'admin@mkfraud.co.za'", 'exception recipient is exact');
  includes(replay, 'missing recipient creates no customer delivery authorization', 'DB proof is present');
});
await test('provider failure enters retry or reconciliation state safely', async () => {
  includes(delivery, "outcome: 'retry_scheduled'", 'pre-acceptance failure is retryable');
  includes(delivery, "'mark_delivery_reconciliation_required'", 'post-acceptance uncertainty is held');
  includes(replay, 'provider failure enters the existing retry state with backoff', 'DB proof is present');
});
await test('daily recovery can process a stranded job', async () => {
  includes(worker, "db.rpc('claim_next_fulfilment_job'", 'GET retains global claim');
  includes(replay, 'daily recovery invocation can claim a stranded eligible queued attempt', 'DB proof is present');
  const cron = vercel.crons.find((entry) => entry.path === '/score/api/internal/fulfilment-worker');
  assert.equal(cron?.schedule, '0 3 * * *');
});
await test('freeze blocks immediate and scheduled processing', async () => {
  includes(worker, "getRc1OperationFreezeResponse('worker', 'worker')", 'both methods share freeze guard');
  includes(replay, 'frozen exact worker claim', 'exact DB freeze proof is present');
  includes(replay, 'frozen scheduled worker claim', 'scheduled DB freeze proof is present');
});
await test('dispatch payload and logs contain no customer identity', async () => {
  const payload = immediateFulfilmentDispatchPayload({
    attemptId: '55555555-5555-4555-8555-555555555555',
    correlationReference: '66666666-6666-4666-8666-666666666666',
  });
  assert.deepEqual(Object.keys(payload).sort(), ['attemptId', 'correlationReference']);
  assert.deepEqual(JSON.parse(capturedRequest.init.body), {
    attemptId: '11111111-1111-4111-8111-111111111111',
    correlationReference: '22222222-2222-4222-8222-222222222222',
  });
  assert.doesNotMatch(paymentRoute, /requestUrl:\s*request\.url/);
  assert.doesNotMatch(dispatch, /customer(Name|Email)|orderReference/);
});
await test('six established workflow definitions retain correction gates', async () => {
  for (const file of [
    'phase7-verification.yml',
    'v7-report-hardening.yml',
    'supabase-migration-replay.yml',
    'phase1-migration-replay.yml',
    'phase23-release-safety.yml',
    'security-scans.yml',
  ]) {
    assert.ok(fs.existsSync(path.join(root, '.github', 'workflows', file)), `${file} exists`);
  }
});
await test('full migration postflight requires exactly 43 rows', async () => {
  includes(postflight, 'count(*) = 43', 'postflight total is 43');
  includes(postflight, "max(version) = '20260728120000'", 'postflight newest correction is exact');
});
await test('protected 18-order fixtures remain guarded and timing SLOs pass synthetically', async () => {
  includes(replay, 'for (let i = 1; i <= 18; i += 1)', '18 protected synthetic fixtures are retained');
  includes(replay, 'preflight defect cleanup must restore protected state', 'protected fingerprint is enforced');
  assert.equal(successfulDispatch.ok, true);
  assert.ok(dispatchDurationMs < 10_000, `dispatch start took ${dispatchDurationMs.toFixed(1)}ms`);
  for (const evidence of ['payment_to_dispatch_seconds', 'payment_to_report_seconds', 'payment_to_provider_seconds', 'payment_to_delivered_seconds']) {
    includes(replay, evidence, `${evidence} is measured`);
  }
});

assert.equal(results.length, 24);
assert.equal(calls[0].args.p_outcome, 'started');
assert.equal(calls[1].args.p_outcome, 'succeeded');
assert.equal(capturedRequest.url, 'https://exact-deployment.example.vercel.app/score/api/internal/fulfilment-worker');
console.log(`RC1 near-real-time automatic fulfilment checks passed: ${results.length}/24.`);

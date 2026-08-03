import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  dispatchImmediateFulfilment,
  immediateFulfilmentDispatchPayload,
} from '../src/lib/fulfilment/immediate-dispatch.ts';
import {
  recordAutomaticFulfilmentExceptionAlert,
} from '../src/lib/notifications/phase1-order-notifications.ts';

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

const syntheticOrderId = '99999999-9999-4999-8999-999999999999';
const dispatchRequiredAction =
  'Immediate automatic fulfilment did not start. Confirm the queued order state and use the authorised recovery procedure. Do not mark payment again.';

function createDispatchFailureHarness(options = {}) {
  const state = {
    payment: 'PAID',
    order: 'payment_received',
    attempt: 'REPORT_QUEUED',
    reports: 0,
    authorizations: 0,
    accessTokens: 0,
    customerEmails: 0,
  };
  const rpcCalls = [];
  const fetchCalls = [];
  const operationalAlerts = new Map();
  const adminEmailEvents = new Map();
  const adminProviderAttempts = [];
  const db = {
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (
        name === 'record_fulfilment_dispatch_result'
        && args.p_outcome === 'started'
        && options.dispatchEvidenceStartFailure
      ) {
        return { data: null, error: { code: 'synthetic_start_failure' } };
      }
      if (name === 'record_fulfilment_dispatch_result') {
        return { data: { ok: true }, error: null };
      }
      if (name === 'record_automatic_fulfilment_exception') {
        if (options.exceptionEvidenceFailure) {
          throw new Error('synthetic frozen operational-alert gate');
        }
        const key = [
          args.p_attempt_id,
          args.p_stage,
          args.p_category,
        ].join(':');
        if (!operationalAlerts.has(key)) {
          operationalAlerts.set(key, { ...args });
        }
        return {
          data: {
            order_id: syntheticOrderId,
            report_id: null,
            attempt_id: args.p_attempt_id,
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const recordExceptionAlert = async (input) => {
    const key = [
      input.attemptId,
      input.stage,
      input.category,
    ].join(':');
    if (adminEmailEvents.has(key)) {
      return { ...adminEmailEvents.get(key), reused: true };
    }
    const event = {
      id: `admin-event-${adminEmailEvents.size + 1}`,
      recipient: 'admin@mkfraud.co.za',
      status: options.alertProviderFailure ? 'send_failed' : 'recorded_disabled',
      input,
    };
    adminEmailEvents.set(key, event);
    adminProviderAttempts.push({ recipient: event.recipient, key });
    if (options.alertProviderFailure) {
      throw new Error('synthetic provider detail must not escape');
    }
    return { ...event, reused: false };
  };
  const fetchImpl = async (url, init) => {
    fetchCalls.push({ url, init });
    if (options.networkFailure) {
      throw new Error('synthetic network detail must not escape');
    }
    return new Response('{}', { status: options.httpStatus ?? 200 });
  };
  return {
    state,
    rpcCalls,
    fetchCalls,
    operationalAlerts,
    adminEmailEvents,
    adminProviderAttempts,
    db,
    recordExceptionAlert,
    fetchImpl,
  };
}

async function runDispatchFailure(options, expectedCategory, expectedFetches) {
  const harness = createDispatchFailureHarness(options);
  const result = await dispatchImmediateFulfilment({
    attemptId: '33333333-3333-4333-8333-333333333333',
    correlationReference: '44444444-4444-4444-8444-444444444444'
  }, {
    createClient: () => harness.db,
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: 'exact-deployment.example.vercel.app',
      CRON_SECRET: 'synthetic-secret-never-logged',
      ...options.env,
    },
    fetchImpl: harness.fetchImpl,
    recordExceptionAlert: harness.recordExceptionAlert,
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, expectedCategory);
  assert.equal(harness.fetchCalls.length, expectedFetches);
  assert.equal(harness.operationalAlerts.size, 1);
  assert.equal(harness.adminEmailEvents.size, 1);
  assert.equal(harness.adminProviderAttempts.length, 1);
  assert.equal(harness.adminProviderAttempts[0].recipient, 'admin@mkfraud.co.za');
  assert.equal(harness.state.payment, 'PAID');
  assert.equal(harness.state.order, 'payment_received');
  assert.equal(harness.state.attempt, 'REPORT_QUEUED');
  assert.equal(harness.state.reports, 0);
  assert.equal(harness.state.authorizations, 0);
  assert.equal(harness.state.accessTokens, 0);
  assert.equal(harness.state.customerEmails, 0);
  const [alert] = harness.operationalAlerts.values();
  assert.equal(alert.p_stage, 'immediate_dispatch');
  assert.equal(alert.p_category, expectedCategory);
  assert.equal(alert.p_required_action, dispatchRequiredAction);
  return { harness, result };
}

function createNotificationStore() {
  const store = {
    orders: [{
      id: syntheticOrderId,
      order_reference: 'RC1-SYNTHETIC-DISPATCH',
    }],
    emailEvents: [],
    orderEvents: [],
  };
  const matching = (row, filters) =>
    Object.entries(filters).every(([key, value]) => row[key] === value);
  const db = {
    from(table) {
      const filters = {};
      const rows = table === 'orders'
        ? store.orders
        : table === 'email_events'
          ? store.emailEvents
          : store.orderEvents;
      const query = {
        select() {
          return query;
        },
        eq(column, value) {
          filters[column] = value;
          return query;
        },
        async maybeSingle() {
          return {
            data: rows.find((row) => matching(row, filters)) ?? null,
            error: null,
          };
        },
        insert(payload) {
          const row = {
            id: payload.id ?? crypto.randomUUID(),
            ...payload,
          };
          rows.push(row);
          const result = { data: row, error: null };
          const insertion = {
            select() {
              return insertion;
            },
            async single() {
              return result;
            },
            then(resolve, reject) {
              return Promise.resolve(result).then(resolve, reject);
            },
          };
          return insertion;
        },
        update(payload) {
          return {
            async eq(column, value) {
              for (const row of rows.filter((candidate) => candidate[column] === value)) {
                Object.assign(row, payload);
              }
              return { data: null, error: null };
            },
          };
        },
      };
      return query;
    },
  };
  return { store, db };
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
    VERCEL_AUTOMATION_BYPASS_SECRET: 'synthetic-bypass-never-logged',
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
await test('missing VERCEL_URL alerts once without reaching the worker', async () => {
  await runDispatchFailure(
    { env: { VERCEL_URL: undefined } },
    'exact_deployment_url_unavailable',
    0,
  );
});
await test('invalid VERCEL_URL alerts once without reaching the worker', async () => {
  await runDispatchFailure(
    { env: { VERCEL_URL: '127.0.0.1' } },
    'exact_deployment_url_unavailable',
    0,
  );
});
await test('missing CRON_SECRET alerts once without reaching the worker', async () => {
  await runDispatchFailure(
    { env: { CRON_SECRET: undefined } },
    'cron_secret_unavailable',
    0,
  );
});
await test('dispatch-evidence start failure alerts without changing payment or queue', async () => {
  await runDispatchFailure(
    { dispatchEvidenceStartFailure: true },
    'dispatch_evidence_start_failed',
    0,
  );
});
await test('network failure preserves payment and queue and alerts once', async () => {
  await runDispatchFailure(
    { networkFailure: true },
    'worker_dispatch_failed',
    1,
  );
  assert.doesNotMatch(migration, /record_fulfilment_dispatch_result[\s\S]*set status = 'GENERATION_FAILED'/);
});
await test('worker HTTP 4xx preserves the queue and alerts once', async () => {
  const { result } = await runDispatchFailure(
    { httpStatus: 400 },
    'worker_rejected_dispatch',
    1,
  );
  assert.equal(result.status, 400);
});
await test('worker HTTP 5xx preserves the queue and alerts once', async () => {
  const { result } = await runDispatchFailure(
    { httpStatus: 503 },
    'worker_rejected_dispatch',
    1,
  );
  assert.equal(result.status, 503);
});
await test('duplicate handling creates one alert and one admin event', async () => {
  const harness = createDispatchFailureHarness({ networkFailure: true });
  const input = {
    attemptId: '33333333-3333-4333-8333-333333333333',
    correlationReference: '44444444-4444-4444-8444-444444444444',
  };
  const dependencies = {
    createClient: () => harness.db,
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: 'exact-deployment.example.vercel.app',
      CRON_SECRET: 'synthetic-secret-never-logged',
    },
    fetchImpl: harness.fetchImpl,
    recordExceptionAlert: harness.recordExceptionAlert,
  };
  await dispatchImmediateFulfilment(input, dependencies);
  await dispatchImmediateFulfilment(input, dependencies);
  assert.equal(harness.operationalAlerts.size, 1);
  assert.equal(harness.adminEmailEvents.size, 1);
  assert.equal(harness.adminProviderAttempts.length, 1);
});
await test('alert-provider failure remains handled after alert persistence', async () => {
  const { harness, result } = await runDispatchFailure(
    { networkFailure: true, alertProviderFailure: true },
    'worker_dispatch_failed',
    1,
  );
  assert.equal(result.ok, false);
  assert.equal(harness.operationalAlerts.size, 1);
  assert.equal([...harness.adminEmailEvents.values()][0].status, 'send_failed');
});
await test('post-payment freeze race returns safely with queued state preserved', async () => {
  const harness = createDispatchFailureHarness({
    dispatchEvidenceStartFailure: true,
    exceptionEvidenceFailure: true,
  });
  const result = await dispatchImmediateFulfilment({
    attemptId: '33333333-3333-4333-8333-333333333333',
    correlationReference: '44444444-4444-4444-8444-444444444444',
  }, {
    createClient: () => harness.db,
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: 'exact-deployment.example.vercel.app',
      CRON_SECRET: 'synthetic-secret-never-logged',
    },
    fetchImpl: harness.fetchImpl,
    recordExceptionAlert: harness.recordExceptionAlert,
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'dispatch_evidence_start_failed');
  assert.equal(harness.state.payment, 'PAID');
  assert.equal(harness.state.order, 'payment_received');
  assert.equal(harness.state.attempt, 'REPORT_QUEUED');
  assert.equal(harness.operationalAlerts.size, 0);
  assert.equal(harness.adminEmailEvents.size, 0);
  assert.equal(harness.state.reports, 0);
  assert.equal(harness.state.authorizations, 0);
});
await test('successful dispatch creates no failure alert', async () => {
  const harness = createDispatchFailureHarness();
  const result = await dispatchImmediateFulfilment({
    attemptId: '33333333-3333-4333-8333-333333333333',
    correlationReference: '44444444-4444-4444-8444-444444444444',
  }, {
    createClient: () => harness.db,
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: 'exact-deployment.example.vercel.app',
      CRON_SECRET: 'synthetic-secret-never-logged',
    },
    fetchImpl: harness.fetchImpl,
    recordExceptionAlert: harness.recordExceptionAlert,
  });
  assert.equal(result.ok, true);
  assert.equal(harness.operationalAlerts.size, 0);
  assert.equal(harness.adminEmailEvents.size, 0);
});
await test('Preview automation bypass is sent only when configured', async () => {
  const withBypass = createDispatchFailureHarness();
  await dispatchImmediateFulfilment({
    attemptId: '33333333-3333-4333-8333-333333333333',
    correlationReference: '44444444-4444-4444-8444-444444444444',
  }, {
    createClient: () => withBypass.db,
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: 'exact-deployment.example.vercel.app',
      CRON_SECRET: 'synthetic-secret-never-logged',
      VERCEL_AUTOMATION_BYPASS_SECRET: 'synthetic-bypass-never-logged',
    },
    fetchImpl: withBypass.fetchImpl,
    recordExceptionAlert: withBypass.recordExceptionAlert,
  });
  assert.equal(
    withBypass.fetchCalls[0].init.headers['x-vercel-protection-bypass'],
    'synthetic-bypass-never-logged',
  );

  const withoutBypass = createDispatchFailureHarness();
  await dispatchImmediateFulfilment({
    attemptId: '33333333-3333-4333-8333-333333333333',
    correlationReference: '44444444-4444-4444-8444-444444444444',
  }, {
    createClient: () => withoutBypass.db,
    env: {
      NODE_ENV: 'production',
      VERCEL_URL: 'exact-deployment.example.vercel.app',
      CRON_SECRET: 'synthetic-secret-never-logged',
    },
    fetchImpl: withoutBypass.fetchImpl,
    recordExceptionAlert: withoutBypass.recordExceptionAlert,
  });
  assert.equal(
    withoutBypass.fetchCalls[0].init.headers['x-vercel-protection-bypass'],
    undefined,
  );
});
await test('notification service dedupes and safely records provider failure', async () => {
  const { store, db } = createNotificationStore();
  const sends = [];
  const input = {
    orderId: syntheticOrderId,
    reportId: null,
    attemptId: '33333333-3333-4333-8333-333333333333',
    authorizationId: null,
    category: 'worker_dispatch_failed',
    stage: 'immediate_dispatch',
    technicalReference: '44444444-4444-4444-8444-444444444444',
    requiredAction: dispatchRequiredAction,
  };
  const sendEmailImpl = async (message) => {
    sends.push(message);
    return { ok: true, mode: 'disabled', providerMessageId: null };
  };
  const first = await recordAutomaticFulfilmentExceptionAlert(input, {
    createClient: () => db,
    sendEmailImpl,
  });
  const duplicate = await recordAutomaticFulfilmentExceptionAlert(input, {
    createClient: () => db,
    sendEmailImpl,
  });
  assert.equal(first.reused, false);
  assert.equal(duplicate.reused, true);
  assert.equal(store.emailEvents.length, 1);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, 'admin@mkfraud.co.za');
  assert.match(sends[0].text, /Do not mark payment again\./);
  const recoveryUrlText = sends[0].text.match(/^Recover: (https?:\/\/\S+)$/m)?.[1];
  assert.ok(recoveryUrlText, 'notification contains one absolute HTTP(S) recovery URL');
  const recoveryUrl = new URL(recoveryUrlText);
  const encodedOrderReference = encodeURIComponent(store.orders[0].order_reference);
  const expectedRecoveryPath = `/score/admin/orders/${encodedOrderReference}`;
  assert.equal(recoveryUrl.pathname, expectedRecoveryPath);
  assert.equal(
    decodeURIComponent(recoveryUrl.pathname.slice('/score/admin/orders/'.length)),
    store.orders[0].order_reference,
  );
  assert.equal(
    new URL(expectedRecoveryPath, 'http://localhost:3000').pathname,
    expectedRecoveryPath,
  );
  assert.equal(
    new URL(expectedRecoveryPath, 'https://mkfraud.co.za').pathname,
    expectedRecoveryPath,
  );
  assert.ok(['http:', 'https:'].includes(recoveryUrl.protocol));
  assert.equal(recoveryUrl.username, '');
  assert.equal(recoveryUrl.password, '');
  assert.equal(recoveryUrl.search, '');
  assert.equal(recoveryUrl.hash, '');
  assert.doesNotMatch(
    recoveryUrl.href,
    /(?:access[_-]?token|signed[_-]?token|customer[_-]?(?:name|email)|[?&](?:email|token)=)/i,
  );
  assert.notEqual(recoveryUrl.pathname, '/score/api/internal/fulfilment-worker');
  assert.doesNotMatch(recoveryUrl.pathname, /^\/storage\/v1\/object(?:\/|$)/);
  assert.doesNotMatch(recoveryUrl.pathname, /^\/score\/report\/access(?:\/|$)/);
  assert.doesNotMatch(
    recoveryUrl.pathname,
    /^\/score\/(?:assessment|snapshot|orders?)(?:\/|$)/,
  );

  const providerFailure = await recordAutomaticFulfilmentExceptionAlert({
    ...input,
    category: 'worker_rejected_dispatch',
  }, {
    createClient: () => db,
    sendEmailImpl: async (message) => {
      sends.push(message);
      return {
        ok: false,
        mode: 'test',
        error: 'synthetic provider detail must not persist',
      };
    },
  });
  assert.equal(providerFailure.status, 'send_failed');
  assert.equal(store.emailEvents.length, 2);
  assert.equal(
    store.emailEvents[1].error_message,
    'The operational exception notification provider request failed.',
  );
  assert.doesNotMatch(
    JSON.stringify(store.emailEvents[1]),
    /synthetic provider detail must not persist/,
  );
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
  assert.equal(
    capturedRequest.init.headers['x-vercel-protection-bypass'],
    'synthetic-bypass-never-logged',
  );
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
await test('full migration postflight requires exactly 67 rows', async () => {
  includes(postflight, 'count(*) = 67', 'postflight total is 67');
  includes(postflight, "max(version) = '20260803200000'", 'postflight newest correction is exact');
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

assert.equal(results.length, 36);
assert.equal(calls[0].args.p_outcome, 'started');
assert.equal(calls[1].args.p_outcome, 'succeeded');
assert.equal(capturedRequest.url, 'https://exact-deployment.example.vercel.app/score/api/internal/fulfilment-worker');
console.log(`RC1 near-real-time automatic fulfilment checks passed: ${results.length}/36.`);

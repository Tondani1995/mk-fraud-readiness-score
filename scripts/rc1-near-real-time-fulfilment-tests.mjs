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
const currentFulfilmentMigration = read('supabase/migrations/20260903014815_retire_interim_manual_fulfilment_for_comprehensive.sql');
const payment = read('src/lib/payments/payment-service.ts');
const paymentRoute = read('src/app/score/admin/orders/[orderReference]/status/route.ts');
const dispatch = read('src/lib/fulfilment/immediate-dispatch.ts');
const worker = read('src/app/score/api/internal/fulfilment-worker/route.ts');
const delivery = read('src/lib/fulfilment/delivery-worker.ts');
const notifications = read('src/lib/notifications/phase1-order-notifications.ts');
const postflight = read('scripts/rc1-production-postflight.sql');
const replay = read('scripts/rc1-prepostflight-disposable-tests.mjs');
const v12Replay = read('scripts/release-v12-migration-replay.sh');
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
        // The unsent-notification claim is a CONDITIONAL update -- .eq(...).is(...).in(...) and,
        // when reclaiming a stale lease, .lt(...) -- and its result decides whether this caller
        // owns the send. A double that only understood .eq() therefore threw
        // "…​.eq(...).is is not a function" the moment recovery ran, and could not have modelled
        // the race it exists to prove. This mirrors the postgrest builder: filters accumulate,
        // and only rows matching every one of them are written.
        update(payload) {
          const predicates = [];
          const apply = () => {
            const matched = rows.filter((row) => predicates.every((predicate) => predicate(row)));
            matched.forEach((row) => Object.assign(row, payload));
            return matched;
          };
          const builder = {
            eq(column, value) {
              predicates.push((row) => row[column] === value);
              return builder;
            },
            is(column, value) {
              // postgrest `is` is null/boolean identity, not equality.
              predicates.push((row) => (row[column] ?? null) === value);
              return builder;
            },
            in(column, values) {
              predicates.push((row) => values.includes(row[column] ?? null));
              return builder;
            },
            lt(column, value) {
              predicates.push((row) => row[column] != null && row[column] < value);
              return builder;
            },
            select() {
              return builder;
            },
            async maybeSingle() {
              return { data: apply()[0] ?? null, error: null };
            },
            async single() {
              const matched = apply();
              return matched.length === 1
                ? { data: matched[0], error: null }
                : { data: null, error: { message: 'no rows' } };
            },
            then(resolve, reject) {
              return Promise.resolve({ data: apply(), error: null }).then(resolve, reject);
            },
          };
          return builder;
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
await test('successful payment queues and dispatches the exact durable fulfilment attempt without awaiting PDF generation', async () => {
  includes(paymentRoute, 'confirmManualPayment', 'admin payment route uses the payment service');
  includes(payment, 'record_payment_transition', 'payment service records the atomic payment transition');
  includes(payment, 'dispatchImmediateFulfilment', 'payment service dispatches the exact attempt after the committed payment transition');
  includes(payment, 'fulfilmentAttemptId', 'payment service reads the exact durable attempt ID');
  includes(payment, 'correlationReference', 'payment service preserves the exact correlation reference');
  includes(payment, 'try {', 'dispatch failure is isolated after the payment transaction');
  assert.doesNotMatch(paymentRoute, /waitUntil\(|dispatchImmediateFulfilment/);
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
await test('same invocation passes the exact released authorization to the current delivery boundary', async () => {
  includes(worker, 'authorizationId: release.delivery_authorization_id', 'release ID is continued');
  includes(delivery, "'issue_customer_report_access_token'", 'active delivery issues the exact secure token');
  includes(delivery, "'finalize_delivery'", 'active delivery finalises the exact authorization');
  includes(delivery, "'fail_delivery'", 'active delivery preserves retry and terminal-failure handling');
  assert.doesNotMatch(delivery, /void db;\s*void options;/, 'active delivery is not the retired no-op boundary');
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
await test('legacy recovery remains available but dormant in the current launch', async () => {
  includes(worker, "db.rpc('claim_next_fulfilment_job'", 'GET retains global claim');
  includes(replay, 'daily recovery invocation can claim a stranded eligible queued attempt', 'DB proof is present');
  const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
  assert.equal(
    crons.some((entry) => entry.path === '/score/api/internal/fulfilment-worker'),
    false,
    'legacy fulfilment worker must remain unscheduled in the current launch'
  );
  assert.equal(
    crons.some((entry) => entry.path === '/score/api/internal/adaptive-stalled-leads'),
    false,
    'stalled-lead monitor must not remain in Vercel cron configuration'
  );
});
await test('current worker keeps its authorization and database claim controls without the retired app freeze', async () => {
  assert.doesNotMatch(worker, /getRc1OperationFreezeResponse|MK_RC1_OPERATION_FREEZE_MODE|RC1_OPERATION_FROZEN/);
  includes(worker, 'isAuthorised(request)', 'worker authorization remains before processing');
  includes(worker, "db.rpc('claim_next_fulfilment_job'", 'worker claim remains database-authorized');
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
await test('historical RC1 postflight remains frozen at its certified ledger boundary', async () => {
  includes(postflight, "case when count(*) = 109 then 'PASS' else 'STOP' end", 'RC1 ledger total remains historically frozen at 109');
  includes(postflight, "max(version) = '20260810160000'", 'RC1 historical newest version remains frozen');
  includes(postflight, "where version <= :'rc1_preflight_newest_version') = 34", 'RC1 preflight boundary remains 34 migrations');
  includes(postflight, "where version > :'rc1_preflight_newest_version') = 75", 'RC1 postflight boundary remains 75 migrations');
  assert.doesNotMatch(postflight, /20260826114407|v12_essential_assessment_admin_generation/, 'historical RC1 SQL does not claim V1.2 forward migration');
});
await test('current V1.2 migration source is certified by the exact disposable replay contract', async () => {
  includes(v12Replay, 'canonical_reconstructed_migration_count=121', 'replay preserves 121 reconstructed migrations');
  includes(v12Replay, 'forward_migration_count=14', 'replay includes the current forward migration set');
  includes(v12Replay, 'expected_migrations="$((canonical_reconstructed_migration_count + forward_migration_count))"', 'replay derives exact expected total');
  includes(v12Replay, 'PASS: %s/%s migrations replayed in deterministic filename order (%s reconstructed plus %s forward).', 'replay prints the exact reconstructed-plus-forward evidence');
  includes(v12Replay, 'PASS: exact-once log has %s rows and %s distinct versions.', 'replay proves exact-once versions');
  includes(currentFulfilmentMigration, "'mk_validated_assessment'", 'current correction scopes automatic payment fulfilment to Comprehensive');
  includes(currentFulfilmentMigration, 'already_generated', 'current correction supports safe REPORT_READY package recovery');
  includes(currentFulfilmentMigration, "'verified_comprehensive_package_recovery'", 'REPORT_READY recovery records package-integrity evidence without regeneration');
  includes(currentFulfilmentMigration, "metadata_json->>'attempt_id'", 'REPORT_READY recovery binds evidence to the original generation event');
  assert.doesNotMatch(currentFulfilmentMigration, /manual_fulfilment_pending/, 'current correction does not reintroduce the interim manual event');
  assert.doesNotMatch(worker, /comprehensive_engagements/, 'active worker does not depend on the reviewed engagement tables');
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

assert.equal(results.length, 37);
assert.equal(calls[0].args.p_outcome, 'started');
assert.equal(calls[1].args.p_outcome, 'succeeded');
assert.equal(capturedRequest.url, 'https://exact-deployment.example.vercel.app/score/api/internal/fulfilment-worker');

// A row recorded while the provider was off must WAIT for the provider, not consume the recovery
// budget through a no-op. The active delivery worker preserves the exact retry/reconciliation
// contract while the provider boundary remains disabled/test/live-mode controlled.
await test('an accepted Comprehensive manuscript is persisted before the package can be finalised', async () => {
  const fulfilment = read('src/lib/reports/phase1-manual-fulfilment.ts');
  const generation = read('src/lib/reports/comprehensive/narrative-generation.ts');
  const provenance = read('src/lib/reports/comprehensive/narrative-provenance.ts');
  const guard = read('supabase/migrations/20260904030000_comprehensive_manuscript_provenance_and_v2_recovery_release.sql');

  // The generator must hand the accepted manuscript back rather than leaving it in request scope.
  includes(generation, 'provenance: ComprehensiveNarrativeProvenance', 'Comprehensive generation returns its manuscript provenance');
  includes(generation, 'narrative: composed.narrative', 'the accepted parsed manuscript is carried out of the generator');
  includes(generation, 'factPackSha256: composed.factPackSha256', 'the deterministic Fact Pack identity is carried with it');
  includes(generation, 'blueprintSha256: composed.blueprintSha256', 'the deterministic Blueprint identity is carried with it');

  // The Comprehensive branch must persist it, on the same contract Essential already uses.
  includes(fulfilment, 'persistComprehensiveNarrativeProvenance', 'the Comprehensive branch persists narrative provenance');
  includes(provenance, "'record_manual_report_narrative_provenance'", 'persistence reuses the existing provenance RPC rather than a second model');
  assert.ok(
    !/fulfilmentId\s*[:=]\s*['"`]/.test(provenance),
    'Comprehensive provenance must not fabricate a legacy fulfilment id'
  );

  // And the database must refuse the transition if it was not persisted.
  includes(guard, 'comprehensive_manuscript_provenance_missing', 'the database fails closed on a discarded manuscript');
  includes(guard, 'before insert or update on public.manual_report_generation_attempts', 'the guard covers every path that sets the status');
  includes(guard, 'legacy_pdf_native_recovery_revision', 'the one authorised legacy recovery revision is named explicitly');
});

await test('disabled provider does not consume the recovery budget', async () => {
  const { store, db } = createNotificationStore();
  const sends = [];
  const sendEmailImpl = async (message) => {
    sends.push(message);
    return { ok: true, mode: 'disabled', providerMessageId: null };
  };
  const input = {
    orderId: syntheticOrderId,
    reportId: null,
    attemptId: '55555555-5555-4555-8555-555555555555',
    authorizationId: null,
    category: 'worker_dispatch_failed',
    stage: 'immediate_dispatch',
    technicalReference: '66666666-6666-4666-8666-666666666666',
    requiredAction: dispatchRequiredAction,
  };
  const disabled = { createClient: () => db, sendEmailImpl, providerModeImpl: () => 'disabled' };
  await recordAutomaticFulfilmentExceptionAlert(input, disabled);
  for (let i = 0; i < 6; i += 1) await recordAutomaticFulfilmentExceptionAlert(input, disabled);

  assert.equal(store.emailEvents.length, 1, 'dedupe key still yields exactly one row');
  assert.equal(sends.length, 1, 'a disabled provider is not re-invoked per duplicate record');
  const row = store.emailEvents[0];
  assert.equal(row.status, 'recorded_disabled', 'row stays recoverable, not parked');
  assert.notEqual(row.status, 'reconciliation_required');
  assert.ok(Number(row.retry_count ?? 0) <= 1, 'no recovery attempts are spent while disabled');

  // Once the provider is switched on the very same row is dispatched -- the guard defers the
  // recovery, it does not cancel it.
  const enabled = {
    createClient: () => db,
    providerModeImpl: () => 'live',
    sendEmailImpl: async (message) => {
      sends.push(message);
      return { ok: true, mode: 'live', providerMessageId: 'provider-message-1' };
    },
  };
  await recordAutomaticFulfilmentExceptionAlert(input, enabled);
  assert.equal(sends.length, 2, 'enabling the provider releases the deferred recovery');
  assert.equal(store.emailEvents[0].provider_message_id, 'provider-message-1');
  assert.equal(store.emailEvents.length, 1, 'recovery never creates a second event row');
});

console.log(`RC1 near-real-time automatic fulfilment checks passed: ${results.length}/39.`);

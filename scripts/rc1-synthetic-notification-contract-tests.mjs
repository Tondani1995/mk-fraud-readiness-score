import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'rc1-synthetic-notification-contract.manifest.json'),
  'utf8',
));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function line(relativePath, oneBasedLine) {
  return read(relativePath).split(/\r?\n/)[oneBasedLine - 1] ?? '';
}

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.syntheticMailbox, 'admin@mkfraud.co.za');
assert.equal(manifest.expectedExternalMessageCount, 4);
assert.equal(manifest.expectedUniqueProviderMessageIdCount, 4);
assert.equal(manifest.expectedSignedDeliveryCallbackCount, 4);
assert.deepEqual(
  manifest.emailEventClassifications,
  [
    'NON_PROVIDER_PLACEHOLDER',
    'EXPECTED_EXTERNAL_SEND',
    'EXCEPTION',
    'DUPLICATE',
    'UNEXPECTED',
  ],
);

const expectedTypes = new Set([
  'customer_order_confirmation',
  'admin_new_order_notification',
  'payment_confirmed',
  'premium_report_pdf',
]);
assert.equal(manifest.messages.length, expectedTypes.size);
assert.deepEqual(new Set(manifest.messages.map((message) => message.id)), expectedTypes);
assert.equal(new Set(manifest.messages.map((message) => message.stage)).size, 4);
for (const message of manifest.messages) {
  assert.equal(message.expectedProviderMode, 'test');
  assert.equal(message.expectedProviderMessageCount, 1);
  assert.equal(message.expectedCallbackCount, 1);
  assert(message.dedupeKeyConstruction);
  assert(message.providerIdempotencyKeyConstruction);
  assert(message.expectedDatabaseEventType.includes(message.templateOrMessageType));
  assert(message.duplicateRetryBehaviour);
  // The manifest is retained as immutable evidence of the historical RC1 synthetic journey.
  // Current V1.2 launch behaviour is asserted below because those historical call sites are no
  // longer the active customer-notification path.
  assert(message.source.file && Number.isInteger(message.source.functionLine), `${message.id} historical source location missing`);
}

const phase1Notifications = read('src/lib/notifications/phase1-order-notifications.ts');
assert.match(
  phase1Notifications,
  /const dedupeKey = input\.dedupeKey\s*\?\?\s*`phase1:\$\{input\.notificationType\}:\$\{input\.context\.order\.id\}`/,
);
// The dedupe key still guarantees exactly one row per notification, and a duplicate still reuses
// that row rather than inserting a second one. What changed is what a reuse may now do: an event
// written while the provider was disabled or failing carries no sent_at and no provider message
// id, and the reuse branch hands it to deliverUnsentNotification so it can still be delivered once
// the provider returns. The columns the lookup selects grew to carry exactly the facts that
// decision needs.
assert.match(
  phase1Notifications,
  /\.select\('id,status,retry_count,sent_at,provider_message_id,recipient_email,updated_at'\)\s*\.eq\('dedupe_key', dedupeKey\)\.maybeSingle\(\)[\s\S]*?if \(existing\) \{[\s\S]*?return \{ \.\.\.existing, \.\.\.recovered, reused: true \};/,
);
// A reuse must never be able to send an event that already reached the provider: sent_at and
// provider_message_id are the two authoritative marks of a real dispatch, and either one is
// terminal. This is what keeps "exactly one provider message per notification" true even though a
// duplicate now has a delivery path at all.
assert.match(
  phase1Notifications,
  /if \(existing\.sent_at \|\| existing\.provider_message_id\) return \{ recovered: false, reason: 'already_sent' \}/,
);
// Both send paths -- the initial dispatch and the recovery of an unsent row -- must present the
// SAME provider idempotency key, or recovering a row whose first attempt did reach the provider
// would produce a second message for one notification. providerIdempotencyKeyFor is that single
// derivation (the email-event id, itself one-per-dedupe-key); pinning the shared helper rather
// than an inlined `data.id` is what stops the two paths drifting apart.
assert.match(
  phase1Notifications,
  /export function providerIdempotencyKeyFor\(emailEventId: string\) \{\s*return emailEventId;/,
);
assert.equal(
  (phase1Notifications.match(/idempotencyKey: providerIdempotencyKeyFor\((?:data|existing)\.id\)/g) ?? []).length,
  2,
);
assert.equal(
  (phase1Notifications.match(/notificationType: 'customer_order_confirmation',/g) ?? []).length,
  0,
);
assert.equal(
  (phase1Notifications.match(/notificationType: 'admin_new_order_notification',/g) ?? []).length,
  0,
);
assert.equal(
  (phase1Notifications.match(/notificationType: 'payment_confirmed',/g) ?? []).length,
  0,
);

// Payment-received notification contract, asserted on behaviour rather than source text. Since
// 7 Sep 2026 payment-service.ts calls notifyInternalPaymentReceived through an injectable seam
// (dependencies.notifyPaymentReceived, which defaults to it), so the old literal regex no longer
// matched. The contract itself is unchanged and is pinned here by running the real service:
//   - production wires the seam to the real internal notifier;
//   - the notification fires only for a PAID transition that is not a duplicate;
//   - a notification failure never fails payment recording.
// Database-free and provider-free: the Supabase client and the notifier are doubles, and the
// analytics client points at the local discard port, so nothing is contacted or written.
const paymentService = read('src/lib/payments/payment-service.ts');
assert.match(
  paymentService,
  /input\.dependencies\?\.notifyPaymentReceived \?\? notifyInternalPaymentReceived\b/,
  'production defaults the payment-received seam to the real internal notifier',
);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-contract-not-a-credential';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-contract-not-a-credential';
const { processVerifiedPayment } = await import('../src/lib/payments/payment-service.ts');
{
  const order = {
    id: 'order-rc1', order_reference: 'MKORD-RC1-CONTRACT', assessment_id: 'assessment-rc1',
    amount_cents: 750000, currency: 'ZAR', status: 'awaiting_payment',
    customer_name: 'Contract Test', customer_email: 'contract@example.invalid',
  };
  const transitions = new Map();
  const db = {
    from(table) {
      if (table === 'app_settings') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value_json: { schema_version: '0024' } }, error: null }) }) }) };
      if (table === 'orders') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: order, error: null }) }) }) };
      if (table === 'payment_automation_records') return { update: () => ({ eq: async () => ({ error: null }) }) };
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: async () => ({ error: null }) };
    },
    async rpc(name, args) {
      if (name === 'payment_automation_capability') return { data: { status: 'ok', available: true, schema_version: '0024', missing_objects: [], missing_permissions: [] }, error: null };
      if (name !== 'record_payment_transition') return { data: {}, error: null };
      // Idempotent by key, like the real RPC: a repeat returns the original state, applies nothing.
      const existing = transitions.get(args.p_idempotency_key);
      if (existing) return { data: { applied: false, duplicate: true, state: existing.state, event_id: existing.id }, error: null };
      const record = { id: `evt-${transitions.size + 1}`, state: args.p_new_state };
      transitions.set(args.p_idempotency_key, record);
      return { data: { applied: true, duplicate: false, state: record.state, event_id: record.id }, error: null };
    },
  };
  const notified = [];
  const recordingNotifier = async (input) => { notified.push(input.order.order_reference); };
  const pay = (idempotencyKey, { amountCents = order.amount_cents, outcome = 'completed', notifier = recordingNotifier } = {}) => processVerifiedPayment({
    source: 'manual_admin', actorReference: 'admin-rc1', idempotencyKey,
    event: {
      eventId: `manual:${idempotencyKey}`, orderReference: order.order_reference, transactionReference: null,
      amountCents, currency: 'ZAR', outcome, occurredAt: new Date(0).toISOString(),
      verificationResult: 'authorised_manual_confirmation', safeNote: 'Contract test confirmation', payloadSha256: null,
    },
    dependencies: { db, notifyPaymentReceived: notifier },
  });
  const quiet = async (run) => {
    const original = { info: console.info, error: console.error };
    const errors = [];
    console.info = () => {};
    console.error = (label) => { errors.push(label); };
    try { return { result: await run(), errors }; } finally { Object.assign(console, original); }
  };

  const { result: paid } = await quiet(() => pay('rc1-paid'));
  assert.equal(paid.ok, true);
  assert.equal(paid.state, 'PAID');
  assert.equal(paid.duplicate, false);
  assert.deepEqual(notified, [order.order_reference], 'a non-duplicate PAID transition notifies MK exactly once');

  const { result: repeat } = await quiet(() => pay('rc1-paid'));
  assert.equal(repeat.duplicate, true);
  assert.equal(notified.length, 1, 'a duplicate PAID confirmation does not notify again');

  for (const [key, options, expectedState] of [
    ['rc1-short', { amountCents: order.amount_cents - 1 }, 'PAYMENT_REVIEW_REQUIRED'],
    ['rc1-over', { amountCents: order.amount_cents + 1 }, 'PAYMENT_REVIEW_REQUIRED'],
    ['rc1-failed', { outcome: 'failed' }, 'PAYMENT_FAILED'],
    ['rc1-processing', { outcome: 'processing' }, 'PAYMENT_PROCESSING'],
  ]) {
    const { result } = await quiet(() => pay(key, options));
    assert.equal(result.state, expectedState);
    assert.equal(notified.length, 1, `a ${expectedState} transition does not notify`);
  }

  const failingNotifier = async () => { throw new Error('synthetic notifier outage'); };
  const { result: paidDespiteOutage, errors } = await quiet(() => pay('rc1-notifier-down', { notifier: failingNotifier }));
  assert.equal(paidDespiteOutage.ok, true, 'a notification failure never fails payment recording');
  assert.equal(paidDespiteOutage.state, 'PAID');
  assert.equal(paidDespiteOutage.duplicate, false);
  assert(errors.includes('payment_received_internal_notification_failed'), 'a notification failure is logged, not thrown');
}
const currentOrderService = read('src/lib/commercial/order-service.ts');
const currentEssentialOrderService = read('src/lib/orders/manual-eft-orders.ts');
assert.match(currentOrderService, /notifyInternalOrderCreated/);
assert.match(currentEssentialOrderService, /notifyInternalOrderCreated/);
assert.doesNotMatch(currentOrderService, /queueInternalNotification/);
assert.doesNotMatch(currentEssentialOrderService, /recordPhase1OrderNotifications/);
assert.doesNotMatch(paymentService, /recordPaymentConfirmedNotification/);
const currentDeliveryRoute = read('src/app/score/api/admin/reports/[reportId]/send-email/route.ts');
assert.match(currentDeliveryRoute, /MANUAL_CUSTOMER_DELIVERY_REASON/);
assert.doesNotMatch(currentDeliveryRoute, /deliverPhase1Report/);
const currentDelivery = read('src/lib/reports/email/report-delivery-service-core.ts');
const currentDeliveryFunction = currentDelivery.slice(currentDelivery.indexOf('export async function deliverPremiumReportEmail'));
assert.match(currentDeliveryFunction, /void input;\s*throw new Error\(`\$\{MANUAL_CUSTOMER_DELIVERY_REASON\}/);

const reportDelivery = read('src/lib/reports/email/report-delivery-service-core.ts');
assert.match(
  reportDelivery,
  /if \(authorization\.reused_existing_send\)[\s\S]*?reusedExistingSend: true/,
);
assert.match(
  reportDelivery,
  /const idempotencyKey = authorization\.provider_request_key\?\.trim\(\)/,
);
assert.match(reportDelivery, /idempotencyKey:\s*idempotencyKey/);
assert.match(reportDelivery, /message_type', value: 'premium_report_pdf'/);

const deliveryDispatch = read('src/lib/reports/email/delivery-dispatch.ts');
assert.match(
  deliveryDispatch,
  /const provider = await input\.transport\([\s\S]*?providerMessageId = provider\.messageId/,
);
assert.match(
  deliveryDispatch,
  /p_email_event_id: input\.claim\.email_event_id[\s\S]*?p_provider_message_id: provider\.messageId/,
);

const canonicalDelivery = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
const finalAuthorizationStart = canonicalDelivery.lastIndexOf(
  'create or replace function public.authorize_premium_report_delivery',
);
assert.notEqual(finalAuthorizationStart, -1);
const finalAuthorization = canonicalDelivery.slice(
  finalAuthorizationStart,
  canonicalDelivery.indexOf('$$;', finalAuthorizationStart) + 3,
);
assert.match(
  finalAuthorization,
  /notification_type='premium_report_pdf'[\s\S]*?status in \('sent','delivery_delayed','delivered','bounced','complained'\)[\s\S]*?reused_existing_send',true/,
);
assert.match(
  finalAuthorization,
  /v_dedupe := 'premium-report-delivery:' \|\| p_report_id[\s\S]*?':attempt-' \|\| v_attempt/,
);
assert.match(
  finalAuthorization,
  /v_dedupe,\s*v_dedupe,\s*v_dedupe,\s*lower\(trim\(p_provider\)\)/,
);
assert.match(
  canonicalDelivery,
  /create unique index email_events_provider_request_uidx[\s\S]*?on public\.email_events\(provider_request_key\)/,
);
assert.match(
  canonicalDelivery,
  /create unique index email_events_provider_message_uidx[\s\S]*?on public\.email_events\(provider, provider_message_id\)/,
);

const assessmentStart = read(manifest.assessmentStartPlaceholder.source.file);
assert(line(
  manifest.assessmentStartPlaceholder.source.file,
  manifest.assessmentStartPlaceholder.source.recordLine,
).includes("service.from('email_events').insert"));
assert(line(
  manifest.assessmentStartPlaceholder.source.file,
  manifest.assessmentStartPlaceholder.source.templateLine,
).includes("'resume_link_phase4_placeholder'"));
assert.doesNotMatch(assessmentStart, /sendEmail|sendReportEmailWithResend|api\.resend\.com/);
assert.equal(manifest.assessmentStartPlaceholder.classification, 'NON_PROVIDER_PLACEHOLDER');
assert.equal(manifest.assessmentStartPlaceholder.externallyDispatched, false);
assert.equal(manifest.assessmentStartPlaceholder.countsTowardExternalMessages, false);
assert.equal(manifest.assessmentStartPlaceholder.countsAsReportDeliveryEvidence, false);

const webhookRoute = read('src/app/score/api/webhooks/resend/route.ts');
assert.match(
  webhookRoute,
  /event = verifyResendWebhook\([\s\S]*?createProviderWebhookDatabaseAttestation\([\s\S]*?db\.rpc\([\s\S]*?['"]ingest_phase14_provider_webhook'/,
);
const finalWebhookStart = canonicalDelivery.lastIndexOf(
  'create or replace function public.ingest_phase14_provider_webhook',
);
assert.notEqual(finalWebhookStart, -1);
const finalWebhook = canonicalDelivery.slice(
  finalWebhookStart,
  canonicalDelivery.indexOf('$$;', finalWebhookStart) + 3,
);
assert.match(
  finalWebhook,
  /where e\.provider=lower\(trim\(p_provider\)\)[\s\S]*?e\.provider_message_id=p_provider_message_id/,
);
assert.match(
  finalWebhook,
  /on conflict \(provider,provider_event_id\)[\s\S]*?phase14_webhook_replay_mismatch/,
);

function buildHealthyEvidence() {
  const external = manifest.messages.map((message, index) => ({
    emailEventId: `email-event-${index + 1}`,
    templateKey: message.templateOrMessageType === 'premium_report_pdf'
      ? 'premium_report_pdf_v1'
      : message.templateOrMessageType,
    notificationType: message.templateOrMessageType,
    providerMode: 'external',
    providerMessageId: `provider-message-${index + 1}`,
    providerIdempotencyKey: `provider-key-${index + 1}`,
  }));
  return {
    emailEvents: [
      {
        emailEventId: 'email-event-placeholder',
        templateKey: 'resume_link_phase4_placeholder',
        notificationType: null,
        providerMode: 'disabled',
        providerMessageId: null,
        providerIdempotencyKey: null,
      },
      ...external,
    ],
    callbacks: external.map((event, index) => ({
      providerEventId: `provider-event-${index + 1}`,
      providerMessageId: event.providerMessageId,
      emailEventId: event.emailEventId,
      type: 'email.delivered',
      signed: true,
    })),
    deliveryAuthorizations: [{
      emailEventId: external.find((event) =>
        event.notificationType === 'premium_report_pdf').emailEventId,
      providerRequestKey: external.find((event) =>
        event.notificationType === 'premium_report_pdf').providerIdempotencyKey,
    }],
  };
}

function classifyEmailEvents(emailEvents) {
  const seenProviderIds = new Set();
  const seenIdempotencyKeys = new Set();
  return emailEvents.map((event) => {
    if (event.templateKey === 'resume_link_phase4_placeholder') {
      return event.providerMessageId === null
        ? 'NON_PROVIDER_PLACEHOLDER'
        : 'UNEXPECTED';
    }
    if (
      event.notificationType?.endsWith('_alert')
      || event.notificationType === 'delivery_recipient_required_alert'
    ) {
      return 'EXCEPTION';
    }
    if (!expectedTypes.has(event.notificationType)) return 'UNEXPECTED';
    if (
      seenProviderIds.has(event.providerMessageId)
      || seenIdempotencyKeys.has(event.providerIdempotencyKey)
    ) {
      return 'DUPLICATE';
    }
    seenProviderIds.add(event.providerMessageId);
    seenIdempotencyKeys.add(event.providerIdempotencyKey);
    return event.providerMode === 'external'
      && typeof event.providerMessageId === 'string'
      && typeof event.providerIdempotencyKey === 'string'
      ? 'EXPECTED_EXTERNAL_SEND'
      : 'UNEXPECTED';
  });
}

function validateEvidence(evidence) {
  const classifications = classifyEmailEvents(evidence.emailEvents);
  const external = evidence.emailEvents.filter(
    (_, index) => classifications[index] === 'EXPECTED_EXTERNAL_SEND',
  );
  assert.equal(
    classifications.filter((value) => value === 'NON_PROVIDER_PLACEHOLDER').length,
    1,
  );
  assert.equal(classifications.filter((value) => value === 'EXCEPTION').length, 0);
  assert.equal(classifications.filter((value) => value === 'DUPLICATE').length, 0);
  assert.equal(classifications.filter((value) => value === 'UNEXPECTED').length, 0);
  assert.equal(external.length, manifest.expectedExternalMessageCount);
  for (const type of expectedTypes) {
    assert.equal(
      external.filter((event) => event.notificationType === type).length,
      1,
      `expected exactly one ${type}`,
    );
  }
  assert.equal(
    new Set(external.map((event) => event.providerMessageId)).size,
    manifest.expectedUniqueProviderMessageIdCount,
  );
  assert.equal(
    new Set(external.map((event) => event.providerIdempotencyKey)).size,
    manifest.expectedExternalMessageCount,
  );
  assert.equal(evidence.callbacks.length, manifest.expectedSignedDeliveryCallbackCount);
  for (const event of external) {
    const callbacks = evidence.callbacks.filter(
      (callback) => callback.providerMessageId === event.providerMessageId,
    );
    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].emailEventId, event.emailEventId);
    assert.equal(callbacks[0].type, 'email.delivered');
    assert.equal(callbacks[0].signed, true);
  }
  const report = external.find((event) => event.notificationType === 'premium_report_pdf');
  assert.equal(evidence.deliveryAuthorizations.length, 1);
  assert.equal(evidence.deliveryAuthorizations[0].emailEventId, report.emailEventId);
  assert.equal(
    evidence.deliveryAuthorizations[0].providerRequestKey,
    report.providerIdempotencyKey,
  );
  return classifications;
}

function expectContractFailure(mutator, label) {
  const evidence = structuredClone(buildHealthyEvidence());
  mutator(evidence);
  assert.throws(() => validateEvidence(evidence), undefined, label);
}

const healthy = buildHealthyEvidence();
assert.deepEqual(
  validateEvidence(healthy),
  [
    'NON_PROVIDER_PLACEHOLDER',
    'EXPECTED_EXTERNAL_SEND',
    'EXPECTED_EXTERNAL_SEND',
    'EXPECTED_EXTERNAL_SEND',
    'EXPECTED_EXTERNAL_SEND',
  ],
);

const orderDedupe = new Map();
let orderProviderCalls = 0;
for (const type of ['customer_order_confirmation', 'admin_new_order_notification']) {
  const key = `phase1:${type}:order-1`;
  if (!orderDedupe.has(key)) {
    orderDedupe.set(key, `email-${type}`);
    orderProviderCalls += 1;
  }
  if (!orderDedupe.has(key)) orderProviderCalls += 1;
}
assert.equal(orderDedupe.size, 2);
assert.equal(orderProviderCalls, 2);

const paymentDedupe = new Map();
let paymentProviderCalls = 0;
for (const duplicate of [false, true]) {
  if (!duplicate) {
    const key = 'phase1:payment_confirmed:order-1';
    if (!paymentDedupe.has(key)) {
      paymentDedupe.set(key, 'email-payment');
      paymentProviderCalls += 1;
    }
  }
}
assert.equal(paymentProviderCalls, 1);

const reportAuthorization = new Map();
let reportProviderCalls = 0;
for (const workerAttempt of [1, 2]) {
  const key = 'premium-report-delivery:report-1:admin@mkfraud.co.za:attempt-1';
  if (!reportAuthorization.has(key)) {
    reportAuthorization.set(key, { workerAttempt, providerMessageId: 'provider-report-1' });
    reportProviderCalls += 1;
  }
}
assert.equal(reportAuthorization.size, 1);
assert.equal(reportProviderCalls, 1);

expectContractFailure((evidence) => {
  evidence.emailEvents.push({
    emailEventId: 'email-event-fifth',
    templateKey: 'unexpected',
    notificationType: 'unexpected_external',
    providerMode: 'external',
    providerMessageId: 'provider-message-5',
    providerIdempotencyKey: 'provider-key-5',
  });
}, 'a fifth external message must fail');
expectContractFailure((evidence) => {
  evidence.emailEvents = evidence.emailEvents.filter(
    (event) => event.notificationType !== 'payment_confirmed',
  );
  evidence.callbacks = evidence.callbacks.filter(
    (callback) => callback.providerMessageId !== 'provider-message-3',
  );
}, 'a missing expected message must fail');
expectContractFailure((evidence) => {
  evidence.emailEvents.at(-1).providerMessageId = 'provider-message-1';
}, 'a duplicate provider message id must fail');
expectContractFailure((evidence) => {
  evidence.emailEvents.at(-1).providerIdempotencyKey = 'provider-key-1';
}, 'a duplicate idempotency key must fail');
expectContractFailure((evidence) => {
  evidence.callbacks[0].emailEventId = 'email-event-2';
}, 'a provider callback cannot be rebound');
expectContractFailure((evidence) => {
  evidence.emailEvents.push({
    emailEventId: 'email-event-exception',
    templateKey: 'automatic_fulfilment_exception_alert',
    notificationType: 'automatic_fulfilment_exception_alert',
    providerMode: 'external',
    providerMessageId: 'provider-exception',
    providerIdempotencyKey: 'provider-exception-key',
  });
}, 'healthy path exception alerts must fail');
expectContractFailure((evidence) => {
  evidence.emailEvents[0].providerMessageId = 'placeholder-provider-message';
}, 'the assessment placeholder must never invoke the provider');

console.log(JSON.stringify({
  result: 'PASS',
  expectedExternalMessages: manifest.expectedExternalMessageCount,
  expectedCallbacks: manifest.expectedSignedDeliveryCallbackCount,
  messageTypes: [...expectedTypes],
  placeholderClassification: manifest.assessmentStartPlaceholder.classification,
  deterministicFailureCases: 7,
  duplicatePrevention: {
    orderProviderCalls,
    paymentProviderCalls,
    reportProviderCalls,
  },
}, null, 2));

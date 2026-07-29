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
  assert(
    line(message.source.file, message.source.functionLine).includes(
      message.sourceFunction === 'recordPhase1OrderNotifications'
        ? 'recordPhase1OrderNotifications'
        : message.sourceFunction,
    ),
    `${message.id} function source line drifted`,
  );
}
assert(line(
  manifest.messages[0].source.file,
  manifest.messages[0].source.messageLine,
).includes('const customer = await recordNotification'));
assert(line(
  manifest.messages[1].source.file,
  manifest.messages[1].source.messageLine,
).includes('const admin = await recordNotification'));
assert(line(
  manifest.messages[2].source.file,
  manifest.messages[2].source.messageLine,
).includes('return recordNotification'));
assert(line(
  manifest.messages[3].source.file,
  manifest.messages[3].source.messageLine,
).includes('const dispatch = await executeClaimedReportDelivery'));

const phase1Notifications = read('src/lib/notifications/phase1-order-notifications.ts');
assert.match(
  phase1Notifications,
  /const dedupeKey = input\.dedupeKey\s*\?\?\s*`phase1:\$\{input\.notificationType\}:\$\{input\.context\.order\.id\}`/,
);
assert.match(
  phase1Notifications,
  /\.select\('id,status,retry_count'\)\.eq\('dedupe_key', dedupeKey\)\.maybeSingle\(\)[\s\S]*?if \(existing\) return \{ \.\.\.existing, reused: true \}/,
);
assert.match(phase1Notifications, /idempotencyKey: data\.id/);
assert.equal(
  (phase1Notifications.match(/notificationType: 'customer_order_confirmation',/g) ?? []).length,
  1,
);
assert.equal(
  (phase1Notifications.match(/notificationType: 'admin_new_order_notification',/g) ?? []).length,
  1,
);
assert.equal(
  (phase1Notifications.match(/notificationType: 'payment_confirmed',/g) ?? []).length,
  1,
);

const paymentService = read('src/lib/payments/payment-service.ts');
assert.match(
  paymentService,
  /if \(target\.state === 'PAID' && !data\.duplicate\)[\s\S]*?recordPaymentConfirmedNotification/,
);

const reportDelivery = read('src/lib/reports/email/report-delivery-service-core.ts');
assert.match(
  reportDelivery,
  /if \(authorization\.reused_existing_send\)[\s\S]*?reusedExistingSend: true/,
);
assert.match(
  reportDelivery,
  /const idempotencyKey = authorization\.provider_request_key\?\.trim\(\)/,
);
assert.match(reportDelivery, /idempotencyKey,/);
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
  /event = verifyResendWebhook\([\s\S]*?createProviderWebhookDatabaseAttestation\([\s\S]*?db\.rpc\('ingest_phase14_provider_webhook'/,
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

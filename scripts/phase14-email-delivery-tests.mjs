import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadWebhookModule() {
  const source = read('src/lib/reports/email/resend-webhook.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((specifier) => {
    if (specifier === 'node:crypto') return crypto;
    throw new Error(`Unexpected dependency: ${specifier}`);
  }, module, module.exports);
  return module.exports;
}

function loadPureModule(relativePath, dependencies = {}) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((specifier) => {
    if (specifier in dependencies) return dependencies[specifier];
    throw new Error(`Unexpected dependency: ${specifier}`);
  }, module, module.exports);
  return module.exports;
}

const migration18 = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
assert.match(migration18, /provider_event_id text/i);
assert.match(migration18, /email_events_provider_event_uidx/i);
assert.match(migration18, /email_events_report_status_idx/i);
assert.match(migration18, /attempt_number integer not null default 1/i);

const migration19 = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
assert.match(migration19, /create table if not exists public\.email_provider_events/i);
assert.match(migration19, /email_provider_events_provider_event_unique/i);
assert.match(migration19, /processed_at timestamptz/i);
assert.match(migration19, /processing_error text/i);
assert.match(migration19, /email_provider_events_unprocessed_idx/i);
assert.match(migration19, /enable row level security/i);
assert.match(migration19, /revoke all.*anon, authenticated/i);

const migration21 = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
for (const pattern of [
  /provider_request_key text/i,
  /send_lease_expires_at timestamptz/i,
  /provider_acceptance_uncertain/i,
  /reconciliation_required/i,
  /recover_stale_premium_report_email_sends/i,
  /apply_email_provider_event_atomic/i,
  /assert_premium_report_delivery_entitlement/i,
  /pg_advisory_xact_lock/i
]) assert.match(migration21, pattern);

const transport = read('src/lib/reports/email/resend-transport.ts');
assert.match(transport, /https:\/\/api\.resend\.com\/emails/);
assert.match(transport, /'Idempotency-Key'/);
assert.match(transport, /attachments/);
assert.match(transport, /contentBase64/);
assert.match(transport, /RESEND_API_KEY/);

const deliveryWrapper = read('src/lib/reports/email/report-delivery.ts');
assert.match(deliveryWrapper, /report-delivery-service/);
const delivery = read('src/lib/reports/email/report-delivery-service-core.ts');
const dispatch = read('src/lib/reports/email/delivery-dispatch.ts');
assert.match(delivery, /flags\.testRecipientOverride/);
assert.match(delivery, /overridePermitted/);
assert.match(delivery, /manualDeliveryEnabled/);
assert.match(dispatch, /fail_premium_report_delivery_before_dispatch/);
assert.match(delivery, /authorize_premium_report_delivery/);
assert.match(delivery, /claim_premium_report_delivery/);
assert.match(dispatch, /mark_premium_report_delivery_dispatch_started/);
assert.match(dispatch, /finalize_premium_report_delivery/);
assert.match(delivery, /resend is prohibited/);
assert.match(dispatch, /MAX_ATTACHMENT_BYTES/);
assert.match(dispatch, /\.download\(input\.report\.storage_path\)/);
assert.match(dispatch, /actualChecksum !== input\.report\.checksum/);
assert.match(dispatch, /pdfBuffer\.toString\('base64'\)/);
assert.match(delivery, /reusedExistingSend:\s*true/);
assert.match(delivery, /reconcilePremiumReportEmail/);
assert.doesNotMatch(delivery, /public.*storage/i);

const workflow = read('src/workflows/premium-report-fulfilment.ts');
assert.equal((workflow.match(/'use step'/g) ?? []).length, 5, 'Workflow must expose capability claim, generation, validation and conditional email as durable steps.');
assert.match(workflow, /claimWorkerCapabilityStep/);
assert.match(workflow, /deliverReportEmailIfEnabledStep/);
assert.match(workflow, /flags\.autoEmailEnabled/);
assert.match(workflow, /premium_report_auto_email_disabled/);

const manualRoute = read('src/app/score/api/admin/reports/[reportId]/send-email/route.ts');
assert.match(manualRoute, /getAdminSession/);
assert.match(manualRoute, /platform_admin/);
assert.match(manualRoute, /approver/);
assert.doesNotMatch(manualRoute, /forceResend/);
assert.doesNotMatch(manualRoute, /authorize_bounce_retry/);
assert.doesNotMatch(manualRoute, /send_bounce_retry/);
assert.doesNotMatch(manualRoute, /contactVerificationId/);
assert.doesNotMatch(manualRoute, /correctedRecipientEvidence/);
assert.match(manualRoute, /deliverPhase1Report/);
assert.doesNotMatch(manualRoute, /recipientOverride/);
const phase1Delivery = read('src/lib/reports/phase1-manual-delivery.ts');
assert.match(phase1Delivery, /PHASE1_DELIVERY_MODE/);
assert.match(phase1Delivery, /providerSendAttempted: false/);
assert.doesNotMatch(phase1Delivery, /resend\.emails\.send/);

const webhookRoute = read('src/app/score/api/webhooks/resend/route.ts');
assert.match(webhookRoute, /readLimitedWebhookBody/);
assert.match(webhookRoute, /svix-id/);
assert.match(webhookRoute, /svix-timestamp/);
assert.match(webhookRoute, /svix-signature/);
assert.match(webhookRoute, /ingest_phase14_provider_webhook/);
assert.match(webhookRoute, /createProviderWebhookDatabaseAttestation/);
assert.doesNotMatch(webhookRoute, /\.from\('email_events'\)/);

const {
  stateAfterDispatchFailure,
  mayStartProviderSend,
  stateAfterExpiredSendLease
} = loadPureModule('src/lib/reports/email/delivery-state.ts');
assert.equal(stateAfterDispatchFailure({ dispatchStarted: false, providerMessageId: null }), 'failed_before_provider');
assert.equal(stateAfterDispatchFailure({ dispatchStarted: true, providerMessageId: null }), 'reconciliation_required');
assert.equal(stateAfterDispatchFailure({ dispatchStarted: true, providerMessageId: 'accepted-id' }), 'provider_acceptance_uncertain');
assert.equal(stateAfterExpiredSendLease('sending'), 'reconciliation_required');
assert.equal(mayStartProviderSend('reconciliation_required', 'bounce_retry'), false, 'Bounce retry must not bypass unresolved provider acceptance.');
assert.equal(mayStartProviderSend('provider_acceptance_uncertain', 'bounce_retry'), false, 'Lost provider response must not create a duplicate send.');
assert.equal(mayStartProviderSend('complained', 'bounce_retry'), false, 'Complaints are permanently non-retriable.');
assert.equal(mayStartProviderSend('bounced', 'bounce_retry'), true, 'Only a bounced delivery may consume bounce-retry authority.');
assert.equal(mayStartProviderSend('failed_before_provider', 'none'), true);
// H3: src/lib/reports/email/delivery-entitlement.ts (validatePremiumReportDeliveryEntitlement)
// was removed -- it was a dead, never-called, strictly weaker duplicate of the authoritative
// SQL entitlement check (public.phase14_delivery_entitlement, wired into both
// authorize_premium_report_delivery and worker_authorize_premium_report_delivery before any
// email_event/authorization row is created). See scripts/phase14-delivery-entitlement-wiring-
// tests.mjs for the static proof that the dead file is gone and both delivery entry points call
// the authoritative check, plus a real-Postgres behavioural proof of the check itself.

const {
  verifyResendWebhook,
  mapResendEventStatus,
  validateResendEventCreatedAt,
  readLimitedWebhookBody,
  webhookPayloadFingerprint
} = loadWebhookModule();
const secretBytes = Buffer.from('phase14-webhook-test-secret');
const secret = `whsec_${secretBytes.toString('base64')}`;
const eventId = 'msg_phase14_test';
const timestamp = '1783872000';
const payload = JSON.stringify({
  type: 'email.delivered',
  created_at: '2026-07-12T16:00:00.000Z',
  data: { email_id: 'email_phase14_test' }
});
const signature = crypto
  .createHmac('sha256', secretBytes)
  .update(`${eventId}.${timestamp}.${payload}`)
  .digest('base64');

const verified = verifyResendWebhook({
  payload,
  id: eventId,
  timestamp,
  signature: `v1,${signature}`,
  secret,
  nowMs: Number(timestamp) * 1000
});
assert.equal(verified.type, 'email.delivered');
assert.equal(verified.data.email_id, 'email_phase14_test');
assert.throws(() => verifyResendWebhook({
  payload,
  id: eventId,
  timestamp,
  signature: 'v1,invalid',
  secret,
  nowMs: Number(timestamp) * 1000
}), /invalid/i);
assert.throws(() => verifyResendWebhook({
  payload,
  id: eventId,
  timestamp,
  signature: `v1,${signature}`,
  secret,
  nowMs: (Number(timestamp) + 301) * 1000
}), /replay window/i);
assert.equal(mapResendEventStatus('email.delivered'), 'delivered');
assert.equal(mapResendEventStatus('email.failed'), 'delivery_failed');
assert.equal(mapResendEventStatus('email.opened'), null);
assert.equal(webhookPayloadFingerprint(payload).length, 64);
assert.throws(() => validateResendEventCreatedAt({
  eventCreatedAt: new Date(Number(timestamp) * 1000 + 11 * 60 * 1000).toISOString(),
  verifiedSvixTimestamp: timestamp,
  receiptTimeMs: Number(timestamp) * 1000
}), /future/i);
assert.throws(() => validateResendEventCreatedAt({
  eventCreatedAt: new Date(Number(timestamp) * 1000 - 8 * 24 * 60 * 60 * 1000).toISOString(),
  verifiedSvixTimestamp: timestamp,
  receiptTimeMs: Number(timestamp) * 1000
}), /old/i);
await assert.rejects(
  readLimitedWebhookBody(new Request('https://example.invalid', {
    method: 'POST',
    headers: { 'content-length': String(65 * 1024) },
    body: 'x'
  })),
  /limit/i
);

console.log('Phase 14 PDF email delivery, retry recovery, test-recipient isolation and replay-safe webhook tests passed.');

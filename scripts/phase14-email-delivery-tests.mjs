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

const migration18 = read('supabase/migrations/0018_phase14_pdf_email_delivery.sql');
assert.match(migration18, /provider_event_id text/i);
assert.match(migration18, /email_events_provider_event_uidx/i);
assert.match(migration18, /email_events_report_status_idx/i);
assert.match(migration18, /attempt_number integer not null default 1/i);

const migration19 = read('supabase/migrations/0019_phase14_email_delivery_state_hardening.sql');
assert.match(migration19, /create table if not exists public\.email_provider_events/i);
assert.match(migration19, /email_provider_events_provider_event_unique/i);
assert.match(migration19, /processed_at timestamptz/i);
assert.match(migration19, /processing_error text/i);
assert.match(migration19, /email_provider_events_unprocessed_idx/i);
assert.match(migration19, /enable row level security/i);
assert.match(migration19, /revoke all.*anon, authenticated/i);

const migration21 = read('supabase/migrations/0021_phase14_adversarial_remediation.sql');
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
assert.match(delivery, /premium-report-delivery:\$\{report\.id\}:\$\{recipient\}/);
assert.match(delivery, /flags\.testRecipientOverride/);
assert.match(delivery, /overridePermitted/);
assert.match(delivery, /manualDeliveryEnabled/);
assert.match(delivery, /email_test_sent/);
assert.match(delivery, /customer release unchanged/);
assert.match(delivery, /failed_before_provider/);
assert.match(delivery, /requires provider reconciliation before any resend/);
assert.match(delivery, /\.eq\('status', 'queued'\)/);
assert.match(delivery, /provider_acceptance_uncertain/);
assert.match(delivery, /MAX_ATTACHMENT_BYTES/);
assert.match(delivery, /\.download\(report\.storage_path\)/);
assert.match(delivery, /actualChecksum !== report\.checksum/);
assert.match(delivery, /pdfBuffer\.toString\('base64'\)/);
assert.match(delivery, /reusedExistingSend:\s*true/);
assert.match(delivery, /status:\s*'released'/);
assert.match(delivery, /reconcilePremiumReportEmail/);
assert.doesNotMatch(delivery, /public.*storage/i);

const workflow = read('src/workflows/premium-report-fulfilment.ts');
assert.equal((workflow.match(/'use step'/g) ?? []).length, 4, 'Workflow must expose generation, validation and conditional email as durable steps.');
assert.match(workflow, /deliverReportEmailIfEnabledStep/);
assert.match(workflow, /flags\.autoEmailEnabled/);
assert.match(workflow, /premium_report_auto_email_disabled/);

const manualRoute = read('src/app/api/admin/reports/[reportId]/send-email/route.ts');
assert.match(manualRoute, /getAdminSession/);
assert.match(manualRoute, /platform_admin/);
assert.match(manualRoute, /approver/);
assert.match(manualRoute, /forceResend/);
assert.match(manualRoute, /deliverPremiumReportEmail/);
assert.doesNotMatch(manualRoute, /recipientOverride/);

const webhookRoute = read('src/app/api/webhooks/resend/route.ts');
assert.match(webhookRoute, /await request\.text\(\)/);
assert.match(webhookRoute, /svix-id/);
assert.match(webhookRoute, /svix-timestamp/);
assert.match(webhookRoute, /svix-signature/);
assert.match(webhookRoute, /apply_email_provider_event_atomic/);
assert.doesNotMatch(webhookRoute, /\.from\('email_events'\)/);

const reportEntitlement = loadPureModule('src/lib/reports/report-entitlement.ts');
const {
  stateAfterDispatchFailure,
  mayStartProviderSend,
  stateAfterExpiredSendLease
} = loadPureModule('src/lib/reports/email/delivery-state.ts');
assert.equal(stateAfterDispatchFailure({ dispatchStarted: false, providerMessageId: null }), 'failed_before_provider');
assert.equal(stateAfterDispatchFailure({ dispatchStarted: true, providerMessageId: null }), 'reconciliation_required');
assert.equal(stateAfterDispatchFailure({ dispatchStarted: true, providerMessageId: 'accepted-id' }), 'provider_acceptance_uncertain');
assert.equal(stateAfterExpiredSendLease('sending'), 'reconciliation_required');
assert.equal(mayStartProviderSend('reconciliation_required', true), false, 'Force resend must not bypass unresolved provider acceptance.');
assert.equal(mayStartProviderSend('provider_acceptance_uncertain', true), false, 'Lost provider response must not create a duplicate send.');
assert.equal(mayStartProviderSend('failed_before_provider', false), true);
const {
  validatePremiumReportDeliveryEntitlement,
  ReportDeliveryEntitlementError
} = loadPureModule('src/lib/reports/email/delivery-entitlement.ts', {
  '../report-entitlement': reportEntitlement
});
const deliveryContext = {
  reportType: 'essential_self_assessment', reportStatus: 'generated', isCurrentReport: true,
  storageBucket: 'generated-reports', storagePath: 'A/report.pdf', checksum: 'b'.repeat(64),
  productCode: 'essential_self_assessment', productActive: true, productPriceCents: 500000,
  productCurrency: 'ZAR', requiresPaymentVerification: true, deliveryMode: 'mk_controlled_pdf',
  orderStatus: 'payment_received', orderAmountCents: 500000, orderCurrency: 'ZAR',
  verifiedAt: '2026-07-14T00:00:00.000Z', verifiedBy: 'admin',
  orderAssessmentId: 'assessment', reportAssessmentId: 'assessment', scoreAssessmentId: 'assessment',
  currentScoreRunId: 'score', reportScoreRunId: 'score', scoreStatus: 'completed',
  scoreLockedAt: '2026-07-14T00:00:00.000Z', scoreInputHash: 'a'.repeat(64),
  customerRecipient: 'customer@example.com', recipient: 'customer@example.com',
  allowNonProductionTestOverride: false
};
assert.equal(validatePremiumReportDeliveryEntitlement(deliveryContext), true);
for (const [label, patch, reason] of [
  ['superseded report', { reportStatus: 'superseded', isCurrentReport: false }, 'report_not_current'],
  ['voided report', { reportStatus: 'voided' }, 'report_not_current'],
  ['unverified order', { verifiedAt: null }, 'manual_verification_missing'],
  ['unlocked score', { scoreLockedAt: null }, 'score_not_final'],
  ['wrong recipient', { recipient: 'attacker@example.com' }, 'recipient_override_forbidden'],
  ['bad checksum', { checksum: 'bad' }, 'storage_metadata_invalid']
]) {
  assert.throws(
    () => validatePremiumReportDeliveryEntitlement({ ...deliveryContext, ...patch }),
    (error) => error instanceof ReportDeliveryEntitlementError && error.reason === reason,
    label
  );
}

const { verifyResendWebhook, mapResendEventStatus } = loadWebhookModule();
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

console.log('Phase 14 PDF email delivery, retry recovery, test-recipient isolation and replay-safe webhook tests passed.');

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

const transport = read('src/lib/reports/email/resend-transport.ts');
assert.match(transport, /https:\/\/api\.resend\.com\/emails/);
assert.match(transport, /'Idempotency-Key'/);
assert.match(transport, /attachments/);
assert.match(transport, /contentBase64/);
assert.match(transport, /RESEND_API_KEY/);

const delivery = read('src/lib/reports/email/report-delivery.ts');
assert.match(delivery, /premium-report-delivery:\$\{report\.id\}:\$\{recipient\}/);
assert.match(delivery, /flags\.testRecipientOverride/);
assert.match(delivery, /const testDelivery = recipient !== customerRecipient/);
assert.match(delivery, /email_test_sent/);
assert.match(delivery, /customer release was not changed/);
assert.match(delivery, /existing\.status === 'failed' && !existing\.provider_message_id/);
assert.match(delivery, /Premium report email retry was claimed by another worker/);
assert.match(delivery, /\.eq\('status', 'queued'\)/);
assert.match(delivery, /Provider accepted the message, but post-send persistence needs reconciliation/);
assert.match(delivery, /MAX_ATTACHMENT_BYTES/);
assert.match(delivery, /\.download\(report\.storage_path\)/);
assert.match(delivery, /pdfBuffer\.toString\('base64'\)/);
assert.match(delivery, /reusedExistingSend:\s*true/);
assert.match(delivery, /status:\s*'released'/);
assert.match(delivery, /current_step:\s*'email_sent'/);
assert.match(delivery, /premium_report_email_resent/);
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

const webhookRoute = read('src/app/api/webhooks/resend/route.ts');
assert.match(webhookRoute, /await request\.text\(\)/);
assert.match(webhookRoute, /svix-id/);
assert.match(webhookRoute, /svix-timestamp/);
assert.match(webhookRoute, /svix-signature/);
assert.match(webhookRoute, /email_provider_events/);
assert.match(webhookRoute, /processed_at/);
assert.match(webhookRoute, /staleEvent/);
assert.match(webhookRoute, /terminalRegression/);
assert.match(webhookRoute, /provider_message_id/);
assert.match(webhookRoute, /provider_event_id/);

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
assert.equal(mapResendEventStatus('email.failed'), 'failed');
assert.equal(mapResendEventStatus('email.opened'), null);

console.log('Phase 14 PDF email delivery, retry recovery, test-recipient isolation and replay-safe webhook tests passed.');

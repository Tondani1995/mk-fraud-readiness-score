import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  RESEND_WEBHOOK_MAX_BODY_BYTES,
  ResendWebhookBodyTooLargeError,
  readLimitedWebhookBody,
  validateResendEventCreatedAt,
  verifyResendWebhook,
  webhookPayloadFingerprint
} from '../src/lib/reports/email/resend-webhook.ts';

const nowMs = Date.parse('2026-07-14T12:00:00Z');
const timestamp = String(Math.floor(nowMs / 1000));
const key = Buffer.from('phase14-isolated-webhook-key');
const secret = `whsec_${key.toString('base64')}`;
const payload = JSON.stringify({
  type: 'email.delivered',
  created_at: '2026-07-14T11:59:30Z',
  data: { email_id: 'provider-message-test' }
});
const id = 'provider-event-test';
const signature = crypto.createHmac('sha256', key)
  .update(`${id}.${timestamp}.${payload}`)
  .digest('base64');

assert.equal(verifyResendWebhook({
  payload, id, timestamp, signature: `v1,${signature}`, secret, nowMs
}).type, 'email.delivered', 'valid isolated signature must verify');

assert.throws(() => validateResendEventCreatedAt({
  eventCreatedAt: '2026-07-14T12:11:00Z',
  verifiedSvixTimestamp: timestamp,
  receiptTimeMs: nowMs
}), /far in the future/);
assert.throws(() => validateResendEventCreatedAt({
  eventCreatedAt: '2026-07-07T11:59:59Z',
  verifiedSvixTimestamp: timestamp,
  receiptTimeMs: nowMs
}), /excessively old/);

await assert.rejects(readLimitedWebhookBody(new Request('https://example.invalid/webhook', {
  method: 'POST',
  headers: { 'content-length': String(RESEND_WEBHOOK_MAX_BODY_BYTES + 1) },
  body: 'small'
})), ResendWebhookBodyTooLargeError);

const oversizedStream = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(RESEND_WEBHOOK_MAX_BODY_BYTES));
    controller.enqueue(new Uint8Array(1));
    controller.close();
  }
});
await assert.rejects(readLimitedWebhookBody(new Request('https://example.invalid/webhook', {
  method: 'POST', body: oversizedStream, duplex: 'half'
})), ResendWebhookBodyTooLargeError);

assert.notEqual(webhookPayloadFingerprint(payload), webhookPayloadFingerprint(`${payload} `),
  'conflicting duplicate bodies must have different fingerprints');

console.log('phase14_webhook_adversarial_tests_passed');

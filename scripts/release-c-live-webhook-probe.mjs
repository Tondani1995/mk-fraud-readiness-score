// Release C controlled Resend Preview verification — synthetic webhook probe.
//
// Sends a real, correctly-signed HTTP POST to a LIVE deployment's webhook route
// (/score/api/webhooks/resend), exercising permanent bounce / transient bounce / complaint /
// replay / out-of-order handling WITHOUT ever contacting a real mailbox or causing a real bounce
// against the sending domain's reputation. This is the same signing logic already proven locally
// this work cycle (see docs/safe-launch/09-release-evidence.md, "Provider webhook
// re-verification" and the closure-cycle entries). The probe locally constructs the Resend/Svix
// HTTP signature, sends the request to the deployed webhook route, and lets that deployed route
// exercise the application's real database-attestation path server-side. The probe does not
// directly call the database-attestation helpers.
//
// Run from a machine that has the REAL RESEND_WEBHOOK_SECRET and
// PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET values available as local environment variables --
// never hardcode them here, never commit them, never paste them into chat.
//
// Usage:
//   TARGET_URL="https://<preview-alias>.vercel.app" \
//   RESEND_WEBHOOK_SECRET="whsec_..." \
//   PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET="..." \
//   PROVIDER_MESSAGE_ID="<a real provider message id from step 3 of the runbook>" \
//   EVENT_TYPE="email.bounced" \
//   BOUNCE_TYPE="" \
//   npx tsx scripts/release-c-live-webhook-probe.mjs
//
// EVENT_TYPE: one of email.delivered / email.bounced / email.complained / email.sent /
// email.delivery_delayed. BOUNCE_TYPE (optional, only meaningful with EVENT_TYPE=email.bounced):
// set to "Transient" to exercise the temporary-bounce path instead of the permanent one.
// Set REPLAY=1 to resend the exact same signed request twice in a row (proves idempotency).

import crypto from 'node:crypto';

const targetUrl = process.env.TARGET_URL;
const providerMessageId = process.env.PROVIDER_MESSAGE_ID;
const eventType = process.env.EVENT_TYPE || 'email.delivered';
const bounceType = process.env.BOUNCE_TYPE || '';
const doReplay = process.env.REPLAY === '1';

if (!targetUrl || !providerMessageId) {
  console.error('TARGET_URL and PROVIDER_MESSAGE_ID are required. See this file\'s header comment for usage.');
  process.exit(1);
}
if (!process.env.RESEND_WEBHOOK_SECRET || !process.env.PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET) {
  console.error('RESEND_WEBHOOK_SECRET and PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET must be set in your local shell -- never hardcoded here.');
  process.exit(1);
}

function signSvix({ id, timestampSeconds, payload, secret }) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signedContent = `${id}.${timestampSeconds}.${payload}`;
  return `v1,${crypto.createHmac('sha256', key).update(signedContent).digest('base64')}`;
}

async function send(providerEventId, reusePayload) {
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const data = { email_id: providerMessageId, tags: [] };
  if (bounceType) data.bounce = { type: bounceType, message: 'controlled preview verification probe' };
  const payload = reusePayload ?? JSON.stringify({ type: eventType, created_at: createdAt, data });
  const timestampSeconds = Math.floor(nowMs / 1000);
  const signature = signSvix({ id: providerEventId, timestampSeconds, payload, secret: process.env.RESEND_WEBHOOK_SECRET });

  const response = await fetch(`${targetUrl.replace(/\/$/, '')}/score/api/webhooks/resend`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': providerEventId,
      'svix-timestamp': String(timestampSeconds),
      'svix-signature': signature
    },
    body: payload
  });
  const body = await response.json().catch(() => null);
  console.log(`  -> HTTP ${response.status}`, JSON.stringify(body));
  return { response, payload };
}

console.log(`Probing ${targetUrl}/score/api/webhooks/resend with event_type=${eventType}${bounceType ? ` bounce_type=${bounceType}` : ''}`);
const providerEventId = crypto.randomUUID();
const first = await send(providerEventId);
if (doReplay) {
  console.log('Replaying the identical event id (expect an idempotent, non-duplicating response)...');
  await send(providerEventId, first.payload);
}
console.log('\nDone. Check the corresponding order\'s admin page / email_events row to confirm the expected state transition.');

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const routeBase = process.env.PHASE14_TEST_APP_URL ?? 'http://127.0.0.1:3000/score';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
if (!supabaseUrl || !serviceKey || !webhookSecret?.startsWith('whsec_')) {
  throw new Error('Local Supabase URL, service key and test webhook secret are required.');
}

const id = `evt_phase14_route_db_${Date.now()}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const payload = JSON.stringify({
  type: 'email.delivered',
  created_at: new Date().toISOString(),
  data: { email_id: 'phase14-route-db-unknown-message' }
});
const signature = crypto.createHmac('sha256', Buffer.from(webhookSecret.slice(6), 'base64'))
  .update(`${id}.${timestamp}.${payload}`).digest('base64');
const request = () => fetch(`${routeBase}/api/webhooks/resend`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`
  },
  body: payload
});
const response = await request();
const body = await response.json();
assert.equal(response.status, 200, JSON.stringify(body));
assert.equal(body.ok, true);
assert.ok(body.result?.attestation_id, 'route must return the database attestation identity');

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const { data: attestation, error: attestationError } = await db
  .rpc('get_phase14_provider_attestation', { p_attestation_id: body.result.attestation_id });
if (attestationError) throw attestationError;
assert.equal(attestation.attestation_source, 'webhook');
assert.equal(attestation.provider, 'resend');
assert.equal(attestation.provider_event_id, id);
assert.equal(attestation.provider_message_id, 'phase14-route-db-unknown-message');
assert.equal(attestation.provider_state, 'email.delivered');
assert.match(attestation.payload_sha256, /^[0-9a-f]{64}$/);

const replayResponse = await request();
const replayBody = await replayResponse.json();
assert.equal(replayResponse.status, 200, JSON.stringify(replayBody));
assert.equal(replayBody.result?.attestation_id, body.result.attestation_id,
  'an exact signed provider-event replay must resolve to the immutable original attestation');

console.log('phase14_webhook_route_db_test_passed');

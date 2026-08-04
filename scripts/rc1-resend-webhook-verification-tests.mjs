/**
 * RC1 Resend webhook verification reason codes and signed fixtures.
 *
 * During RC1 staging certification, genuine email.delivered callbacks were delivered by Resend and
 * rejected by this endpoint with an opaque `400 invalid_webhook` and no log line at all. The
 * endpoint was reachable, past Vercel protection and past the freeze gate, so the failure was
 * necessarily inside verification -- but nothing recorded whether it was a signing-secret
 * mismatch, a replay-window rejection or a malformed body, and Vercel runtime log retention had
 * already expired by the time it was investigated.
 *
 * These tests build real Svix-style signatures locally (no network, no credentials, no provider
 * account) so every rejection path is deterministic and attributable to a specific safe reason.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  ResendWebhookVerificationError,
  isResendWebhookVerificationError,
  isSupportedResendEventType,
  mapResendEventStatus,
  validateResendEventCreatedAt,
  verifyResendWebhook
} from '../src/lib/reports/email/resend-webhook.ts';

const root = process.cwd();
const route = fs.readFileSync(path.join(root, 'src', 'app', 'score', 'api', 'webhooks', 'resend', 'route.ts'), 'utf8');
const ingest0017 = fs.readFileSync(path.join(root, 'supabase', 'migrations', '0017_phase14_canonical_disabled_foundation.sql'), 'utf8');
const ingest0028 = fs.readFileSync(path.join(root, 'supabase', 'migrations', '0028_phase14_attestation_canonicalisation_hardening.sql'), 'utf8');

let failures = 0;
let total = 0;
function test(name, fn) {
  total += 1;
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${error.message.split('\n').slice(0, 6).join('\n    ')}`);
  }
}

// ---------------------------------------------------------------------------
// Deterministic local fixture generator (never a real provider secret).
// ---------------------------------------------------------------------------
const TEST_SECRET = `whsec_${Buffer.from('rc1-local-fixture-secret-000001').toString('base64')}`;
const OTHER_SECRET = `whsec_${Buffer.from('rc1-local-fixture-secret-000002').toString('base64')}`;

function sign({ secret = TEST_SECRET, id = 'msg_rc1_fixture_0001', timestampSeconds, payload }) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key)
    .update(`${id}.${timestampSeconds}.${payload}`)
    .digest('base64');
  return { id, timestamp: String(timestampSeconds), signature: `v1,${signature}`, payload, secret };
}

function deliveredPayload(overrides = {}) {
  return JSON.stringify({
    type: 'email.delivered',
    created_at: new Date(overrides.createdAtMs ?? Date.now()).toISOString(),
    data: { email_id: overrides.emailId ?? 'a1b2c3d4-0000-4000-8000-000000000001', tags: [] }
  });
}

const NOW_MS = Date.UTC(2026, 6, 30, 12, 0, 0);
const nowSeconds = Math.floor(NOW_MS / 1000);

console.log('RC1 -- Resend webhook verification reason codes');

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
test('C1. a valid signed email.delivered callback verifies and parses', () => {
  const payload = deliveredPayload({ createdAtMs: NOW_MS });
  const fixture = sign({ timestampSeconds: nowSeconds, payload });
  const event = verifyResendWebhook({ ...fixture, nowMs: NOW_MS });
  assert.equal(event.type, 'email.delivered');
  assert.equal(event.data.email_id, 'a1b2c3d4-0000-4000-8000-000000000001');
  const createdAt = validateResendEventCreatedAt({
    eventCreatedAt: event.created_at,
    verifiedSvixTimestamp: fixture.timestamp,
    receiptTimeMs: NOW_MS
  });
  assert.equal(typeof createdAt, 'string');
  assert.equal(isSupportedResendEventType(event.type), true);
});

// ---------------------------------------------------------------------------
// Rejection paths -- each must be attributable to one safe reason
// ---------------------------------------------------------------------------
function expectReason(reason, fn) {
  assert.throws(fn, (error) => {
    assert.ok(isResendWebhookVerificationError(error), `expected a verification error, got ${error?.name}`);
    assert.equal(error.reason, reason, `expected reason "${reason}", got "${error.reason}"`);
    return true;
  });
}

test('C2. an altered body fails as signature_mismatch, not as a parse error', () => {
  const payload = deliveredPayload({ createdAtMs: NOW_MS });
  const fixture = sign({ timestampSeconds: nowSeconds, payload });
  const tampered = payload.replace('a1b2c3d4-0000-4000-8000-000000000001', 'a1b2c3d4-0000-4000-8000-00000000dead');
  assert.notEqual(tampered, payload, 'fixture tampering did not change the body');
  expectReason('signature_mismatch', () => verifyResendWebhook({ ...fixture, payload: tampered, nowMs: NOW_MS }));
});

test('C3. a signature produced with the wrong secret fails as signature_mismatch', () => {
  const payload = deliveredPayload({ createdAtMs: NOW_MS });
  const wrong = sign({ secret: OTHER_SECRET, timestampSeconds: nowSeconds, payload });
  expectReason('signature_mismatch', () => verifyResendWebhook({ ...wrong, secret: TEST_SECRET, nowMs: NOW_MS }));
});

test('C4. a stale signed timestamp fails as timestamp_out_of_tolerance with a signed delta', () => {
  const payload = deliveredPayload({ createdAtMs: NOW_MS });
  const staleSeconds = nowSeconds - 3600;
  const fixture = sign({ timestampSeconds: staleSeconds, payload });
  assert.throws(() => verifyResendWebhook({ ...fixture, nowMs: NOW_MS }), (error) => {
    assert.equal(error.reason, 'timestamp_out_of_tolerance');
    assert.equal(error.timestampDeltaSeconds, 3600, 'delta must be reported for operator triage');
    return true;
  });
});

test('C5. missing signature headers are distinguished from a bad signature', () => {
  const payload = deliveredPayload({ createdAtMs: NOW_MS });
  const fixture = sign({ timestampSeconds: nowSeconds, payload });
  expectReason('missing_signature_headers', () => verifyResendWebhook({ ...fixture, signature: null, nowMs: NOW_MS }));
  expectReason('missing_signature_headers', () => verifyResendWebhook({ ...fixture, id: null, nowMs: NOW_MS }));
  expectReason('missing_signature_headers', () => verifyResendWebhook({ ...fixture, timestamp: null, nowMs: NOW_MS }));
});

test('C6. an empty or unusable signature header is malformed_signature, not a mismatch', () => {
  const payload = deliveredPayload({ createdAtMs: NOW_MS });
  const fixture = sign({ timestampSeconds: nowSeconds, payload });
  expectReason('malformed_signature', () => verifyResendWebhook({ ...fixture, signature: '   ', nowMs: NOW_MS }));
});

test('C7. an unconfigured secret is its own reason and never a signature failure', () => {
  const payload = deliveredPayload({ createdAtMs: NOW_MS });
  const fixture = sign({ timestampSeconds: nowSeconds, payload });
  expectReason('secret_not_configured', () => verifyResendWebhook({ ...fixture, secret: 'not-a-whsec-value', nowMs: NOW_MS }));
});

test('C8. a correctly signed but non-JSON body fails as malformed_json', () => {
  const payload = 'this is not json';
  const fixture = sign({ timestampSeconds: nowSeconds, payload });
  expectReason('malformed_json', () => verifyResendWebhook({ ...fixture, nowMs: NOW_MS }));
});

test('C9. a correctly signed JSON body with no event type fails as missing_event_type', () => {
  const payload = JSON.stringify({ created_at: new Date(NOW_MS).toISOString(), data: {} });
  const fixture = sign({ timestampSeconds: nowSeconds, payload });
  expectReason('missing_event_type', () => verifyResendWebhook({ ...fixture, nowMs: NOW_MS }));
});

test('C10. event created_at outside tolerance is reported separately from the signed timestamp', () => {
  const svixTimestamp = String(nowSeconds);
  assert.throws(() => validateResendEventCreatedAt({
    eventCreatedAt: new Date(NOW_MS + 86_400_000).toISOString(),
    verifiedSvixTimestamp: svixTimestamp,
    receiptTimeMs: NOW_MS
  }), (error) => (assert.equal(error.reason, 'event_timestamp_future'), true));

  assert.throws(() => validateResendEventCreatedAt({
    eventCreatedAt: new Date(NOW_MS - 86_400_000 * 30).toISOString(),
    verifiedSvixTimestamp: svixTimestamp,
    receiptTimeMs: NOW_MS
  }), (error) => (assert.equal(error.reason, 'event_timestamp_stale'), true));

  assert.throws(() => validateResendEventCreatedAt({
    eventCreatedAt: 'not-a-date',
    verifiedSvixTimestamp: svixTimestamp,
    receiptTimeMs: NOW_MS
  }), (error) => (assert.equal(error.reason, 'event_timestamp_invalid'), true));
});

// ---------------------------------------------------------------------------
// Event-type contract
// ---------------------------------------------------------------------------
test('C11. supported event types match the accepted delivery contract exactly', () => {
  for (const supported of ['email.delivered', 'email.sent', 'email.bounced', 'email.failed', 'email.suppressed', 'email.complained', 'email.delivery_delayed']) {
    assert.equal(isSupportedResendEventType(supported), true, `${supported} must remain supported`);
    assert.notEqual(mapResendEventStatus(supported), null);
  }
  for (const unsupported of ['email.clicked', 'email.opened', 'email.scheduled', 'email.received', 'contact.created']) {
    assert.equal(isSupportedResendEventType(unsupported), false, `${unsupported} must not be ingested`);
  }
});

test('C12. unsupported event types are acknowledged and not retried or ingested', () => {
  assert.match(route, /if \(!isSupportedResendEventType\(event\.type\)\)/);
  assert.match(route, /reason: 'unsupported_event_type'/);
  // Acknowledged with 200 so the provider stops retrying, and returned before the ingest RPC.
  assert.match(route, /ok: true, ignored: 'unsupported_event_type'/);
  const beforeIngest = route.split('ingest_phase14_provider_webhook')[0];
  assert.ok(beforeIngest.includes('unsupported_event_type'), 'the type gate must precede ingestion');
});

// ---------------------------------------------------------------------------
// Log safety
// ---------------------------------------------------------------------------
test('C13. rejection logging emits only safe closed-vocabulary fields', () => {
  // The helper's own parameter type is an object literal, so slicing at the first "\n}" would stop
  // before the body. Cut at the next top-level declaration instead.
  const helper = route.split('function logResendWebhookRejection')[1].split('\nexport ')[0];
  for (const allowed of ['reason', 'providerEventId', 'timestampDeltaSeconds', 'eventType', 'deploymentId', 'commitSha']) {
    assert.ok(helper.includes(allowed), `safe field ${allowed} missing from the rejection log`);
  }
  for (const forbidden of [/secret/i, /signature/i, /payload/i, /\bbody\b/i, /email_id/i, /recipient/i, /token/i, /authorization/i]) {
    assert.doesNotMatch(helper, forbidden, `rejection log must never include ${forbidden}`);
  }
});

test('C14. every rejection path in the route is attributable to a reason code', () => {
  for (const reason of [
    'database_attestation_failed',
    'provider_message_binding_failed',
    'security_gate_unsatisfied',
    'unsupported_event_type'
  ]) {
    assert.ok(route.includes(`'${reason}'`), `route does not classify ${reason}`);
  }
  // The verification catch classifies from the typed error rather than guessing.
  assert.match(route, /isResendWebhookVerificationError\(error\) \? error\.reason : 'verification_failed'/);
});

// ---------------------------------------------------------------------------
// Database-side idempotency and rebinding, asserted against the accepted contract
// ---------------------------------------------------------------------------
test('C15. a duplicate provider event is idempotent by unique constraint, not by chance', () => {
  assert.match(ingest0017, /constraint email_provider_events_provider_event_unique unique \(provider, provider_event_id\)/i);
  assert.match(ingest0017, /jsonb_build_object\('duplicate', true, 'conflict', false, 'state_updated', false\)/);
  // A concurrent loser is treated as the same idempotent replay rather than a hard error.
  assert.match(ingest0028, /'duplicate',true,'conflict',false,'state_updated',false,'concurrent',true/);
});

test('C16. re-presenting an event id with different content is refused as a conflict', () => {
  assert.match(ingest0017, /jsonb_build_object\('duplicate', true, 'conflict', true, 'state_updated', false\)/);
  assert.match(ingest0028, /already bound|bound to a different/i);
});

test('C17. the verification error type is recognisable across bundler chunk boundaries', () => {
  const error = new ResendWebhookVerificationError('signature_mismatch', 'x', 12);
  assert.equal(isResendWebhookVerificationError(error), true);
  assert.equal(isResendWebhookVerificationError({ reason: 'signature_mismatch' }), true, 'structural contract must hold across chunks');
  assert.equal(isResendWebhookVerificationError(new Error('plain')), false);
  assert.equal(isResendWebhookVerificationError(null), false);
});

console.log('');
console.log(`rc1-resend-webhook-verification: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

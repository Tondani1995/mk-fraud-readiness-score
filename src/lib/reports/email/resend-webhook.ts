import crypto from 'node:crypto';

export type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    [key: string]: unknown;
  };
};

export const RESEND_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;
export const RESEND_WEBHOOK_MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const RESEND_WEBHOOK_MAX_EVENT_FUTURE_MS = 10 * 60 * 1000;

export class ResendWebhookBodyTooLargeError extends Error {}

export async function readLimitedWebhookBody(request: Request, maxBytes = RESEND_WEBHOOK_MAX_BODY_BYTES) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ResendWebhookBodyTooLargeError('Webhook request body exceeds the configured limit.');
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResendWebhookBodyTooLargeError('Webhook request body exceeds the configured limit.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

export function validateResendEventCreatedAt(input: {
  eventCreatedAt?: string;
  verifiedSvixTimestamp: string | null;
  receiptTimeMs?: number;
}) {
  const receiptTimeMs = input.receiptTimeMs ?? Date.now();
  const svixTimeMs = Number(input.verifiedSvixTimestamp) * 1000;
  const eventTimeMs = Date.parse(input.eventCreatedAt ?? '');
  if (!Number.isFinite(svixTimeMs) || !Number.isFinite(eventTimeMs)) {
    throw new Error('Webhook event timestamp is invalid.');
  }
  const upperBound = Math.min(receiptTimeMs, svixTimeMs) + RESEND_WEBHOOK_MAX_EVENT_FUTURE_MS;
  const lowerBound = Math.max(receiptTimeMs, svixTimeMs) - RESEND_WEBHOOK_MAX_EVENT_AGE_MS;
  if (eventTimeMs > upperBound) throw new Error('Webhook event timestamp is unreasonably far in the future.');
  if (eventTimeMs < lowerBound) throw new Error('Webhook event timestamp is excessively old.');
  return new Date(eventTimeMs).toISOString();
}

export function webhookPayloadFingerprint(payload: string) {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function createProviderWebhookDatabaseAttestation(input: {
  provider: string;
  providerEventId: string;
  providerMessageId: string | null;
  eventType: string;
  eventCreatedAt: string;
  payloadSha256: string;
  attestedAtEpoch?: number;
  nonce?: string;
}) {
  const secret = process.env.PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET?.trim();
  if (!secret) throw new Error('The provider webhook database-attestation secret is not configured.');
  const attestedAtEpoch = input.attestedAtEpoch ?? Math.floor(Date.now() / 1000);
  const nonce = input.nonce ?? crypto.randomUUID();
  const canonical = [
    'webhook', input.provider.toLowerCase().trim(), input.providerEventId,
    input.providerMessageId ?? '', input.eventType, input.eventCreatedAt,
    input.payloadSha256, String(attestedAtEpoch), nonce
  ].join('|');
  return {
    attestedAtEpoch,
    nonce,
    hmac: crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')
  };
}

export function createProviderLookupDatabaseAttestation(input: {
  provider: string; providerRequestKey: string; authorizationId: string; emailEventId: string;
  providerMessageId: string | null;
  providerState: string; payloadSha256: string; attestedAtEpoch?: number; nonce?: string;
}) {
  const secret = process.env.PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET?.trim();
  if (!secret) throw new Error('The provider lookup database-attestation secret is not configured.');
  const attestedAtEpoch = input.attestedAtEpoch ?? Math.floor(Date.now() / 1000);
  const nonce = input.nonce ?? crypto.randomUUID();
  const canonical = ['provider_lookup', input.provider.toLowerCase().trim(),
    input.providerRequestKey, input.authorizationId, input.emailEventId,
    input.providerMessageId ?? '', input.providerState,
    input.payloadSha256, String(attestedAtEpoch), nonce].join('|');
  return { attestedAtEpoch, nonce,
    hmac: crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex') };
}

function safeEqualBase64(expected: string, actual: string) {
  try {
    const expectedBuffer = Buffer.from(expected, 'base64');
    const actualBuffer = Buffer.from(actual, 'base64');
    return expectedBuffer.length === actualBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}

export function verifyResendWebhook(input: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret?: string | null;
  nowMs?: number;
}): ResendWebhookPayload {
  const secret = input.secret?.trim() || process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret || !secret.startsWith('whsec_')) throw new Error('Resend webhook secret is not configured.');
  if (!input.id || !input.timestamp || !input.signature) throw new Error('Required webhook signature headers are missing.');

  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    throw new Error('Webhook timestamp is outside the accepted replay window.');
  }

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signedContent = `${input.id}.${input.timestamp}.${input.payload}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const signatures = input.signature
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.startsWith('v1,') ? item.slice(3) : item);

  if (!signatures.some((signature) => safeEqualBase64(expected, signature))) {
    throw new Error('Webhook signature is invalid.');
  }

  const parsed = JSON.parse(input.payload) as ResendWebhookPayload;
  if (!parsed || typeof parsed.type !== 'string') {
    throw new Error('Webhook payload does not contain an event type.');
  }
  return parsed;
}

export function mapResendEventStatus(type: string) {
  switch (type) {
    case 'email.delivered': return 'delivered';
    case 'email.bounced': return 'bounced';
    case 'email.failed': return 'delivery_failed';
    case 'email.suppressed': return 'suppressed';
    case 'email.complained': return 'complained';
    case 'email.delivery_delayed': return 'delivery_delayed';
    case 'email.sent': return 'sent';
    default: return null;
  }
}

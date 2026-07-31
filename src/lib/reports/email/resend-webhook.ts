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
    throw new ResendWebhookVerificationError('event_timestamp_invalid', 'Webhook event timestamp is invalid.');
  }
  const upperBound = Math.min(receiptTimeMs, svixTimeMs) + RESEND_WEBHOOK_MAX_EVENT_FUTURE_MS;
  const lowerBound = Math.max(receiptTimeMs, svixTimeMs) - RESEND_WEBHOOK_MAX_EVENT_AGE_MS;
  const deltaSeconds = Math.round((receiptTimeMs - eventTimeMs) / 1000);
  if (eventTimeMs > upperBound) {
    throw new ResendWebhookVerificationError(
      'event_timestamp_future', 'Webhook event timestamp is unreasonably far in the future.', deltaSeconds
    );
  }
  if (eventTimeMs < lowerBound) {
    throw new ResendWebhookVerificationError(
      'event_timestamp_stale', 'Webhook event timestamp is excessively old.', deltaSeconds
    );
  }
  return new Date(eventTimeMs).toISOString();
}

export function webhookPayloadFingerprint(payload: string) {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

// M10: canonicalisation for HMAC-attested inputs previously joined raw fields with '|', which is
// ambiguous -- a field value that itself contains '|' can shift the apparent boundary between two
// logical fields, letting two different logical inputs canonicalise (and therefore HMAC) to the
// same string. Length-prefixing each field ("<byteLength>:<value>", concatenated with no
// separator) makes the encoding unambiguous regardless of what characters appear inside a field:
// the byte length is read off before the value, so there is never a decoding choice to make.
// Versioned via a fixed 'v1|<namespace>|' prefix so a future format change cannot silently
// re-canonicalise old inputs to a matching string either. This MUST be changed in lockstep with
// the matching SQL-side canonical-string construction (phase14_private.canonical_attestation_field,
// added by migration 0028) -- the two sides independently compute the same string and compare
// HMACs, so any divergence between them breaks all webhook/provider-lookup verification.
const CANONICAL_ATTESTATION_ENCODING_VERSION = 'v1';

function canonicalAttestationField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `${Buffer.byteLength(text, 'utf8')}:${text}`;
}

export function buildCanonicalAttestationString(namespace: string, fields: Array<string | number | null | undefined>): string {
  return `${CANONICAL_ATTESTATION_ENCODING_VERSION}|${namespace}|${fields.map(canonicalAttestationField).join('')}`;
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
  const canonical = buildCanonicalAttestationString('webhook', [
    input.provider.toLowerCase().trim(), input.providerEventId,
    input.providerMessageId ?? '', input.eventType, input.eventCreatedAt,
    input.payloadSha256, attestedAtEpoch, nonce
  ]);
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
  const canonical = buildCanonicalAttestationString('provider_lookup', [
    input.provider.toLowerCase().trim(),
    input.providerRequestKey, input.authorizationId, input.emailEventId,
    input.providerMessageId ?? '', input.providerState,
    input.payloadSha256, attestedAtEpoch, nonce
  ]);
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

/**
 * Closed vocabulary of webhook rejection reasons.
 *
 * RC1: every verification failure previously threw a bare Error, and the route collapsed all of
 * them into a single `400 invalid_webhook` with no logging. When genuine Resend `email.delivered`
 * callbacks began failing in staging it was impossible to tell a signing-secret mismatch from a
 * replay-window rejection or a malformed body without the provider's own retry UI. These codes are
 * safe to log: they are a fixed enumeration and carry no secret, signature, body or recipient.
 */
export type ResendWebhookRejectionReason =
  | 'secret_not_configured'
  | 'missing_signature_headers'
  | 'malformed_signature'
  | 'signature_mismatch'
  | 'timestamp_out_of_tolerance'
  | 'malformed_json'
  | 'missing_event_type'
  | 'event_timestamp_invalid'
  | 'event_timestamp_future'
  | 'event_timestamp_stale';

export class ResendWebhookVerificationError extends Error {
  readonly reason: ResendWebhookRejectionReason;
  /** Signed clock skew in seconds, when it could be computed. Never a wall-clock or identity. */
  readonly timestampDeltaSeconds: number | null;

  constructor(reason: ResendWebhookRejectionReason, message: string, timestampDeltaSeconds: number | null = null) {
    super(message);
    this.name = 'ResendWebhookVerificationError';
    this.reason = reason;
    this.timestampDeltaSeconds = timestampDeltaSeconds;
  }
}

/** Recognises the reason contract across bundler chunk boundaries, like the quality-gate error. */
export function isResendWebhookVerificationError(error: unknown): error is ResendWebhookVerificationError {
  return !!error
    && typeof error === 'object'
    && typeof (error as ResendWebhookVerificationError).reason === 'string';
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
  if (!secret || !secret.startsWith('whsec_')) {
    throw new ResendWebhookVerificationError('secret_not_configured', 'Resend webhook secret is not configured.');
  }
  if (!input.id || !input.timestamp || !input.signature) {
    throw new ResendWebhookVerificationError('missing_signature_headers', 'Required webhook signature headers are missing.');
  }

  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const delta = Number.isFinite(timestampSeconds) ? nowSeconds - timestampSeconds : null;
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    throw new ResendWebhookVerificationError(
      'timestamp_out_of_tolerance',
      'Webhook timestamp is outside the accepted replay window.',
      delta
    );
  }

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signedContent = `${input.id}.${input.timestamp}.${input.payload}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const candidates = input.signature
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.startsWith('v1,') ? item.slice(3) : item);

  // A header that carries no usable candidate at all is a different operational problem from a
  // well-formed signature that does not match the configured secret, and the two need different
  // remediation (fix the sender or proxy, versus rotate or re-sync the secret).
  if (candidates.length === 0) {
    throw new ResendWebhookVerificationError('malformed_signature', 'Webhook signature is invalid.', delta);
  }
  if (!candidates.some((signature) => safeEqualBase64(expected, signature))) {
    throw new ResendWebhookVerificationError('signature_mismatch', 'Webhook signature is invalid.', delta);
  }

  let parsed: ResendWebhookPayload;
  try {
    parsed = JSON.parse(input.payload) as ResendWebhookPayload;
  } catch {
    throw new ResendWebhookVerificationError('malformed_json', 'Webhook payload is not valid JSON.', delta);
  }
  if (!parsed || typeof parsed.type !== 'string') {
    throw new ResendWebhookVerificationError('missing_event_type', 'Webhook payload does not contain an event type.', delta);
  }
  return parsed;
}

/**
 * Whether the accepted delivery contract knows how to act on this provider event type.
 *
 * Derived from mapResendEventStatus() rather than a second hardcoded list, so the edge check and
 * the status mapping can never drift apart. Types outside this set (email.clicked, email.opened,
 * email.scheduled and similar) carry no delivery meaning for Release C; ingesting them created
 * provider-event rows that bound to nothing, which is exactly the contamination that corrupted the
 * RC1 callback count when an endpoint was subscribed to more than the contract requires.
 */
export function isSupportedResendEventType(type: string): boolean {
  return mapResendEventStatus(type) !== null;
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

import crypto from 'node:crypto';
import type { NormalisedPaymentEvent } from './types';

export type StitchSessionInput = { orderReference: string; amountCents: number; currency: string; returnUrl: string };
export type StitchSession = { reference: string; redirectUrl: string; mode: 'double' };
export type StitchStatus = { state: 'pending' | 'completed' | 'failed' | 'cancelled'; transactionReference: string | null };

export interface StitchPaymentProvider {
  readonly mode: 'disabled' | 'double';
  createSession(input: StitchSessionInput): Promise<StitchSession>;
  lookupStatus(providerReference: string): Promise<StitchStatus>;
}

class DisabledStitchProvider implements StitchPaymentProvider {
  readonly mode = 'disabled' as const;
  async createSession(): Promise<StitchSession> { throw new Error('stitch_provider_disabled'); }
  async lookupStatus(): Promise<StitchStatus> { return { state: 'pending', transactionReference: null }; }
}

export class StitchPaymentDouble implements StitchPaymentProvider {
  readonly mode = 'double' as const;
  async createSession(input: StitchSessionInput): Promise<StitchSession> {
    const reference = `stitch-double-${crypto.randomUUID()}`;
    const url = new URL(input.returnUrl);
    url.searchParams.set('order_reference', input.orderReference);
    return { reference, redirectUrl: url.toString(), mode: 'double' };
  }
  async lookupStatus(): Promise<StitchStatus> { return { state: 'pending', transactionReference: null }; }
}

export function getStitchPaymentProvider(): StitchPaymentProvider {
  return process.env.PAYMENT_PROVIDER_MODE === 'double' ? new StitchPaymentDouble() : new DisabledStitchProvider();
}

type WebhookHeaders = { id: string; timestamp: string; signature: string };

function headerValue(headers: Headers, name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? '';
}

export function verifyStitchWebhook(input: {
  rawBody: string;
  headers: Headers;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): WebhookHeaders {
  const id = headerValue(input.headers, 'svix-id');
  const timestamp = headerValue(input.headers, 'svix-timestamp');
  const signatureHeader = headerValue(input.headers, 'svix-signature');
  if (!id || !timestamp || !signatureHeader || !input.secret.startsWith('whsec_')) throw new Error('stitch_signature_headers_invalid');
  const timestampSeconds = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(now - timestampSeconds) > (input.toleranceSeconds ?? 300)) {
    throw new Error('stitch_webhook_timestamp_outside_tolerance');
  }
  const secretBytes = Buffer.from(input.secret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${input.rawBody}`).digest();
  const candidates = signatureHeader.split(/\s+/).filter(Boolean).flatMap((part) => {
    const [version, encoded] = part.split(',', 2);
    if (version !== 'v1' || !encoded) return [];
    try { return [Buffer.from(encoded, 'base64')]; } catch { return []; }
  });
  if (!candidates.some((candidate) => candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected))) {
    throw new Error('stitch_signature_invalid');
  }
  return { id, timestamp, signature: signatureHeader };
}

function decimalToCents(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, decimal = ''] = text.split('.');
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
}

export function parseStitchPaymentEvent(rawBody: string, deliveryId: string): NormalisedPaymentEvent {
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { throw new Error('stitch_payload_malformed'); }
  const node = payload?.data?.client?.paymentInitiationRequests?.node ?? payload?.data;
  if (!node || typeof node !== 'object') throw new Error('stitch_payload_shape_invalid');
  const stateName = String(node.state?.__typename ?? node.paymentConfirmation?.__typename ?? node.status ?? '');
  const outcome: NormalisedPaymentEvent['outcome'] =
    ['PaymentInitiationRequestCompleted', 'PaymentReceived', 'SUCCESS'].includes(stateName) ? 'completed'
      : ['PaymentInitiationRequestCancelled', 'PaymentInitiationRequestExpired', 'CANCELLED'].includes(stateName) ? 'cancelled'
        : ['TransactionFailure', 'FAILED', 'ERROR'].includes(stateName) ? 'failed'
          : ['RefundCompleted', 'REFUNDED'].includes(stateName) ? 'refunded'
            : stateName === 'PaymentUnsettled' ? 'review' : 'processing';
  const amount = node.state?.amount ?? node.amount ?? payload?.amount;
  const orderReference = String(node.externalReference ?? payload?.externalReference ?? '').trim();
  if (!orderReference) throw new Error('stitch_order_reference_missing');
  const occurredAt = String(payload?.datetime ?? node.updatedAt ?? node.updated ?? new Date().toISOString());
  if (Number.isNaN(Date.parse(occurredAt))) throw new Error('stitch_event_timestamp_invalid');
  return {
    eventId: String(payload?.id ?? deliveryId),
    orderReference,
    transactionReference: String(node.state?.id ?? node.id ?? payload?.transactionReference ?? '') || null,
    amountCents: decimalToCents(amount?.quantity ?? node.quantity),
    currency: String(amount?.currency ?? node.currency ?? '').toUpperCase() || null,
    outcome,
    occurredAt,
    verificationResult: 'svix_signature_valid',
    safeNote: outcome === 'completed' ? 'Stitch reported a completed payment.' : `Stitch reported payment state ${outcome}.`,
    payloadSha256: crypto.createHash('sha256').update(rawBody).digest('hex')
  };
}

export function signStitchWebhookForDouble(rawBody: string, id: string, timestamp: string, secret: string) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return `v1,${crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;
}

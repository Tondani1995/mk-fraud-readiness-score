import { NextResponse } from 'next/server';
import { checkRateLimits } from '@/lib/security/rate-limit';
import {
  ResendWebhookBodyTooLargeError,
  isResendWebhookVerificationError,
  readLimitedWebhookBody,
  validateResendEventCreatedAt,
  verifyResendWebhook
} from '@/lib/reports/email/resend-webhook';
import { marketingStore } from '@/lib/marketing/marketing-store';
import { applyMarketingWebhookEvent } from '@/lib/marketing/marketing-webhook';
import { classifyResendEvent } from '@/lib/marketing/resend-event-routing';
import { marketingWebhookSecret } from '@/lib/marketing/runtime';
import { POST as fraudReadinessResendWebhook } from '@/app/score/api/webhooks/resend/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The one Resend webhook endpoint MK needs on the Free plan (Option A: one external endpoint,
 * logically isolated internal handlers).
 *
 * 1. Body cap, Svix HMAC signature (5-minute replay window) and event-timestamp sanity are checked
 *    once, with the endpoint's own secret. Nothing unverified reaches either handler.
 * 2. The event is classified (resend-event-routing.ts) and handed to exactly one handler.
 * 3. Marketing events: applied at most once via the marketing svix-id ledger.
 * 4. Transactional events: forwarded byte-for-byte, with the original Svix headers, to the
 *    existing Fraud Readiness route, which re-runs its own freeze gate, rate limit, signature check,
 *    replay window, database attestation and idempotency exactly as today. This only happens when
 *    MK_RESEND_SHARED_WEBHOOK_TRANSACTIONAL=enabled AND RESEND_WEBHOOK_SECRET equals this endpoint's
 *    secret; otherwise transactional events are acknowledged and dropped, which is the current
 *    production behaviour (the Fraud Readiness webhook is disabled by the RC1 runbook).
 */
export async function POST(request: Request) {
  const secret = marketingWebhookSecret();
  const pepper = process.env.MK_MARKETING_HASH_PEPPER?.trim();
  if (!secret || !pepper) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });

  const rateLimit = await checkRateLimits([{ key: 'resend_events_webhook:global', maxHits: 600, windowSeconds: 60 }]);
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });

  const receiptTimeMs = Date.now();
  let payload: string;
  try {
    payload = await readLimitedWebhookBody(request);
  } catch (error) {
    const tooLarge = error instanceof ResendWebhookBodyTooLargeError;
    return NextResponse.json({ ok: false, error: tooLarge ? 'payload_too_large' : 'invalid_webhook' }, { status: tooLarge ? 413 : 400 });
  }

  const providerEventId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  let event;
  let occurredAt: string;
  try {
    event = verifyResendWebhook({ payload, id: providerEventId, timestamp: svixTimestamp, signature: svixSignature, secret, nowMs: receiptTimeMs });
    occurredAt = validateResendEventCreatedAt({ eventCreatedAt: event.created_at, verifiedSvixTimestamp: svixTimestamp, receiptTimeMs });
  } catch (error) {
    console.error('resend_events_webhook_rejected', { reason: isResendWebhookVerificationError(error) ? error.reason : 'verification_failed' });
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }

  const route = classifyResendEvent(event as { type?: unknown; data?: Record<string, unknown> });

  if (route === 'ignore') return NextResponse.json({ ok: true, route, outcome: 'ignored' });

  if (route === 'transactional') {
    const sharedSecretMatches = process.env.RESEND_WEBHOOK_SECRET?.trim() === secret;
    if (process.env.MK_RESEND_SHARED_WEBHOOK_TRANSACTIONAL?.trim() !== 'enabled' || !sharedSecretMatches) {
      return NextResponse.json({ ok: true, route, outcome: 'transactional_not_routed' });
    }
    const forwarded = new Request(new URL('/score/api/webhooks/resend', request.url), {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') ?? 'application/json',
        'svix-id': providerEventId ?? '',
        'svix-timestamp': svixTimestamp ?? '',
        'svix-signature': svixSignature ?? ''
      },
      body: payload
    });
    return fraudReadinessResendWebhook(forwarded);
  }

  try {
    const result = await applyMarketingWebhookEvent({
      store: marketingStore(),
      pepper,
      signalsTopicId: process.env.MK_SIGNALS_RESEND_TOPIC_ID?.trim() || null,
      providerEventId: providerEventId!,
      payload,
      event: event as { type: string; data?: Record<string, unknown> },
      occurredAt
    });
    return NextResponse.json({ ok: true, route, outcome: result.outcome });
  } catch (error) {
    console.error('resend_events_webhook_marketing_failed', { message: error instanceof Error ? error.message.slice(0, 120) : 'unknown' });
    return NextResponse.json({ ok: false, error: 'apply_failed' }, { status: 500 });
  }
}

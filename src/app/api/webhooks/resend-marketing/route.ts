import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { checkRateLimits } from '@/lib/security/rate-limit';
import {
  ResendWebhookBodyTooLargeError,
  isResendWebhookVerificationError,
  readLimitedWebhookBody,
  validateResendEventCreatedAt,
  verifyResendWebhook
} from '@/lib/reports/email/resend-webhook';
import { newsletterEmailHash } from '@/lib/marketing/email-address';
import { marketingStore } from '@/lib/marketing/marketing-store';
import { marketingWebhookSecret } from '@/lib/marketing/runtime';
import { mapResendMarketingEvent } from '@/lib/marketing/subscription-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dedicated MK Fraud Signals webhook. It shares only the stateless Svix verification helpers with
 * the Fraud Readiness webhook; it has its own secret, its own route and its own ledger, and it
 * ignores every non-broadcast email event so report-delivery state is never touched.
 *
 * Controls: body cap, Svix HMAC signature with a 5-minute replay window, event timestamp sanity,
 * at-most-once application keyed on svix-id (duplicates acknowledged with 200), global volume
 * ceiling. Responses never echo payload content.
 */
export async function POST(request: Request) {
  const secret = marketingWebhookSecret();
  const pepper = process.env.MK_MARKETING_HASH_PEPPER?.trim();
  if (!secret || !pepper) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });

  const rateLimit = await checkRateLimits([{ key: 'resend_marketing_webhook:global', maxHits: 600, windowSeconds: 60 }]);
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });

  const receiptTimeMs = Date.now();
  let payload: string;
  try {
    payload = await readLimitedWebhookBody(request);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof ResendWebhookBodyTooLargeError ? 'payload_too_large' : 'invalid_webhook' }, { status: error instanceof ResendWebhookBodyTooLargeError ? 413 : 400 });
  }

  const providerEventId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  let event;
  let occurredAt: string;
  try {
    event = verifyResendWebhook({ payload, id: providerEventId, timestamp: svixTimestamp, signature: request.headers.get('svix-signature'), secret, nowMs: receiptTimeMs });
    occurredAt = validateResendEventCreatedAt({ eventCreatedAt: event.created_at, verifiedSvixTimestamp: svixTimestamp, receiptTimeMs });
  } catch (error) {
    console.error('resend_marketing_webhook_rejected', { reason: isResendWebhookVerificationError(error) ? error.reason : 'verification_failed' });
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }

  const effect = mapResendMarketingEvent(event as { type?: unknown; data?: Record<string, unknown> }, process.env.MK_SIGNALS_RESEND_TOPIC_ID?.trim() || null);
  const effectName = effect.kind === 'engagement' ? `engagement_${effect.engagement}` : effect.kind;
  const email = 'email' in effect ? effect.email : null;

  try {
    const result = await marketingStore().applyProviderEffect({
      p_provider_event_id: providerEventId!,
      p_event_type: event.type,
      p_payload_sha256: createHash('sha256').update(payload, 'utf8').digest('hex'),
      p_email_hash: email ? newsletterEmailHash(email, pepper) : null,
      p_effect: effectName,
      p_occurred_at: occurredAt,
      p_detail: effect.kind === 'provider_suppression' ? { origin: effect.origin } : effect.kind === 'ignored' ? { reason: effect.reason } : {}
    });
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    // 500 makes Resend retry with backoff; the svix-id ledger makes the retry idempotent.
    console.error('resend_marketing_webhook_apply_failed', { message: error instanceof Error ? error.message.slice(0, 120) : 'unknown' });
    return NextResponse.json({ ok: false, error: 'apply_failed' }, { status: 500 });
  }
}

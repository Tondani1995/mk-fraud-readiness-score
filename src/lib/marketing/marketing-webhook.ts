import { createHash } from 'node:crypto';
import { newsletterEmailHash } from '@/lib/marketing/email-address';
import type { MarketingStore } from '@/lib/marketing/marketing-store';
import { mapResendMarketingEvent } from '@/lib/marketing/subscription-state';

/**
 * Apply one verified marketing event. At most once per svix-id (database ledger); a duplicate
 * delivery returns outcome "duplicate". Throws on storage failure so the caller answers 500 and
 * Resend retries with backoff.
 */
export async function applyMarketingWebhookEvent(input: {
  store: MarketingStore;
  pepper: string;
  signalsTopicId: string | null;
  providerEventId: string;
  payload: string;
  event: { type: string; data?: Record<string, unknown> };
  occurredAt: string;
}): Promise<{ outcome: string }> {
  const effect = mapResendMarketingEvent(input.event, input.signalsTopicId);
  const effectName = effect.kind === 'engagement' ? `engagement_${effect.engagement}` : effect.kind;
  const email = 'email' in effect ? effect.email : null;
  const result = await input.store.applyProviderEffect({
    p_provider_event_id: input.providerEventId,
    p_event_type: input.event.type,
    p_payload_sha256: createHash('sha256').update(input.payload, 'utf8').digest('hex'),
    p_email_hash: email ? newsletterEmailHash(email, input.pepper) : null,
    p_effect: effectName,
    p_occurred_at: input.occurredAt,
    p_detail: effect.kind === 'provider_suppression' ? { origin: effect.origin } : effect.kind === 'ignored' ? { reason: effect.reason } : {}
  });
  return { outcome: result.outcome };
}

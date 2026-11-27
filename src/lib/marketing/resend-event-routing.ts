/**
 * Routing for the single shared Resend webhook endpoint (Resend Free allows one endpoint).
 *
 * Every verified event goes to exactly one logical handler:
 *   marketing      contact.*, contact.topics.*, suppression.*, topic.*, every email.* event that
 *                  belongs to a broadcast, and email.* events for newsletter confirmation emails
 *                  (tagged mk_stream=newsletter_confirmation);
 *   transactional  every other email.* event (Fraud Readiness report delivery and internal
 *                  notifications), handed to the existing Fraud Readiness webhook route unchanged;
 *   ignore         domain.*, inbox.*, anything unknown.
 *
 * The two handlers never see each other's events, so a failure in one cannot block, duplicate or
 * corrupt the other: Resend retries only the event whose handler returned an error, and each
 * handler keeps its own idempotency ledger.
 */

export type ResendEventRoute = 'marketing' | 'transactional' | 'ignore';

type RawEvent = { type?: unknown; data?: Record<string, unknown> | null };

export const NEWSLETTER_CONFIRMATION_STREAM = 'newsletter_confirmation';

function tagValue(data: Record<string, unknown>, name: string): string | null {
  const tags = data.tags;
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
    const value = (tags as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : null;
  }
  if (Array.isArray(tags)) {
    const hit = tags.find((tag) => tag && typeof tag === 'object' && (tag as Record<string, unknown>).name === name) as Record<string, unknown> | undefined;
    return typeof hit?.value === 'string' ? hit.value : null;
  }
  return null;
}

export function classifyResendEvent(event: RawEvent): ResendEventRoute {
  const type = typeof event.type === 'string' ? event.type : '';
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  if (type.startsWith('contact.') || type.startsWith('suppression.') || type.startsWith('topic.')) return 'marketing';
  if (type.startsWith('email.')) {
    if (typeof data.broadcast_id === 'string' && data.broadcast_id.length > 0) return 'marketing';
    if (tagValue(data, 'mk_stream') === NEWSLETTER_CONFIRMATION_STREAM) return 'marketing';
    return 'transactional';
  }
  return 'ignore';
}

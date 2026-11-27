import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIpHashKey } from '@/lib/security/rate-limit';
import { honeypotTripped } from '@/lib/enquiries/validation';
import { isNewsletterSource, sanitiseSourcePath } from '@/lib/marketing/consent';
import { normaliseNewsletterEmail, newsletterEmailHash } from '@/lib/marketing/email-address';
import { GENERIC_SUBSCRIBE_RESPONSE, requestNewsletterSubscription } from '@/lib/marketing/newsletter-service';
import { clientIp, newsletterDepsFromEnv } from '@/lib/marketing/runtime';
import { MarketingRecipientNotAllowedError } from '@/lib/marketing/resend-marketing';
import { sanitiseCampaignAttribution } from '@/lib/website/acquisition-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MK Fraud Signals subscription request (step 1 of double opt-in).
 *
 * Voluntary and unbundled: this endpoint is only ever called by the newsletter form, never by an
 * assessment, enquiry or purchase flow. The person must tick the consent box; the server rejects a
 * request without `consent: true`. Every accepted request returns the same generic message,
 * whether the address is new, already subscribed, suppressed or held, so the form cannot be used
 * to discover who is on the list.
 */
export async function POST(request: Request) {
  const deps = newsletterDepsFromEnv();
  if (!deps) {
    return NextResponse.json({ ok: false, error: 'newsletter_unavailable' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  if (honeypotTripped(body)) {
    return NextResponse.json({ ok: true, message: GENERIC_SUBSCRIBE_RESPONSE });
  }

  const email = normaliseNewsletterEmail(body.email);
  if (!email) return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 400 });
  if (!isNewsletterSource(body.source)) return NextResponse.json({ ok: false, error: 'invalid_source' }, { status: 400 });

  // Volumetric controls: per IP, per address, and a global daily cap on confirmation emails so the
  // newsletter can never exhaust the shared Resend Free transactional allowance (100/day) that
  // Fraud Readiness notifications depend on.
  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'newsletter_subscribe'), maxHits: 5, windowSeconds: 60 * 60 },
    { key: `newsletter_subscribe:email:${newsletterEmailHash(email, deps.pepper)}`, maxHits: 3, windowSeconds: 24 * 60 * 60 },
    { key: 'newsletter_subscribe:global_daily', maxHits: Number(process.env.MK_NEWSLETTER_DAILY_CONFIRMATION_CAP ?? 40), windowSeconds: 24 * 60 * 60 }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  try {
    await requestNewsletterSubscription(deps, {
      email,
      source: body.source,
      sourcePath: sanitiseSourcePath(body.sourcePath),
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      attribution: Object.fromEntries(
        Object.entries(sanitiseCampaignAttribution(body.attribution)).filter(([key]) => key.startsWith('utm_'))
      ) as Record<string, string>
    });
    return NextResponse.json({ ok: true, message: GENERIC_SUBSCRIBE_RESPONSE });
  } catch (error) {
    if (error instanceof MarketingRecipientNotAllowedError) {
      // Test mode: a non-allowlisted address gets the same generic answer and no email.
      return NextResponse.json({ ok: true, message: GENERIC_SUBSCRIBE_RESPONSE });
    }
    console.error('newsletter_subscribe_failed', { message: error instanceof Error ? error.message.slice(0, 120) : 'unknown' });
    return NextResponse.json({ ok: false, error: 'temporarily_unavailable' }, { status: 500 });
  }
}

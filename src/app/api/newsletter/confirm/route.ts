import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIpHashKey } from '@/lib/security/rate-limit';
import { confirmNewsletterSubscription } from '@/lib/marketing/newsletter-service';
import { clientIp, newsletterDepsFromEnv } from '@/lib/marketing/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Double opt-in step 2. POST only: the emailed link opens a page with a button, so a mail
 * provider's link scanner that fetches the URL cannot confirm a subscription on the person's
 * behalf.
 */
export async function POST(request: Request) {
  const deps = newsletterDepsFromEnv();
  if (!deps) return NextResponse.json({ ok: false, outcome: 'unavailable' }, { status: 503 });

  let token: unknown;
  try {
    token = ((await request.json()) as Record<string, unknown>)?.token;
  } catch {
    return NextResponse.json({ ok: false, outcome: 'invalid' }, { status: 400 });
  }
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return NextResponse.json({ ok: false, outcome: 'invalid' }, { status: 400 });
  }

  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'newsletter_confirm'), maxHits: 20, windowSeconds: 60 * 60 }
  ]);
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, outcome: 'rate_limited' }, { status: 429 });

  try {
    const result = await confirmNewsletterSubscription(deps, { rawToken: token, ip: clientIp(request), userAgent: request.headers.get('user-agent') });
    // 'confirmed' and 'held' look the same to the person: both recorded their consent.
    const accepted = result.outcome === 'confirmed' || result.outcome === 'held' || result.outcome === 'already_subscribed';
    return NextResponse.json({ ok: accepted, outcome: accepted ? 'confirmed' : result.outcome });
  } catch (error) {
    console.error('newsletter_confirm_failed', { message: error instanceof Error ? error.message.slice(0, 120) : 'unknown' });
    return NextResponse.json({ ok: false, outcome: 'temporarily_unavailable' }, { status: 500 });
  }
}

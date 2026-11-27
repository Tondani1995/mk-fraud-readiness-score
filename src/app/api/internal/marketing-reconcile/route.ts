import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { reconcileNewsletterBatch } from '@/lib/marketing/newsletter-service';
import { newsletterDepsFromEnv } from '@/lib/marketing/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const header = request.headers.get('authorization') ?? '';
  if (!expected || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Proportionate reconciliation for gaps in webhook coverage: re-screens Attio restrictions for
 * everyone who would receive email, re-reads Resend state, pushes withdrawals outward, holds any
 * person whose systems disagree. Run before every broadcast and on a schedule (every 6 hours).
 * Also returns the audience snapshot used for broadcast audience verification.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const deps = newsletterDepsFromEnv();
  if (!deps) return NextResponse.json({ ok: false, error: 'newsletter_unavailable' }, { status: 503 });
  const passes: Array<Awaited<ReturnType<typeof reconcileNewsletterBatch>>> = [];
  for (let pass = 0; pass < 4; pass += 1) {
    const result = await reconcileNewsletterBatch(deps, 25);
    passes.push(result);
    if (result.examined < 25) break;
  }
  const snapshot = await deps.store.audienceSnapshot();
  return NextResponse.json({ ok: true, passes, snapshot });
}

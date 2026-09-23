import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIpHashKey } from '@/lib/security/rate-limit';
import { recordCalendlyCommercialEvent } from '@/lib/website/calendly-ledger';

const CALENDLY_RESOURCE_RE = /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9_-]+(?:\/invitees\/[A-Za-z0-9_-]+)?$/;

function calendlyResource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 500);
  return CALENDLY_RESOURCE_RE.test(trimmed) ? trimmed : null;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: 'origin_not_allowed' }, { status: 403 });
  }

  const rateLimit = await checkRateLimits([{
    key: getClientIpHashKey(request, 'calendly_booking_event'),
    maxHits: 20,
    windowSeconds: 60 * 60,
  }]);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const eventUri = calendlyResource(body.eventUri);
  const inviteeUri = calendlyResource(body.inviteeUri);
  if (!eventUri && !inviteeUri) {
    return NextResponse.json({ ok: false, error: 'missing_booking_identifier' }, { status: 400 });
  }

  try {
    const status = await recordCalendlyCommercialEvent({ eventUri, inviteeUri, attribution: body.attribution });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error('Calendly commercial event insert failed', {
      code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json({ ok: false, error: 'booking_record_failed' }, { status: 500 });
  }
}

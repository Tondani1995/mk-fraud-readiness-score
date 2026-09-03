import { NextResponse } from 'next/server';
import { recordProductionMonitorEvent } from '@/lib/monitoring/production-monitor';
import { sanitiseClientErrorPayload } from '@/lib/monitoring/privacy';
import { getClientIpHashKey, checkRateLimits } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * First-party browser error intake. It stores only a vetted error name/category and a scrubbed
 * pathname; no message, stack, query string, assessment reference, or browser identity is sent.
 */
export async function POST(request: Request) {
  const limit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'production_client_error'), maxHits: 30, windowSeconds: 60 }
  ]);
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const payload = sanitiseClientErrorPayload(body);
  if (!payload) return NextResponse.json({ ok: false }, { status: 400 });
  const syntheticPreviewTest = process.env.VERCEL_ENV === 'preview'
    && new URL(request.url).searchParams.get('mk_sentry_client_test') === '1';

  await recordProductionMonitorEvent({
    stage: 'browser_javascript',
    outcome: 'fail',
    route: payload.route,
    httpStatus: null,
    errorCategory: payload.errorCategory,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA,
    synthetic: syntheticPreviewTest,
    details: { exception_class: payload.errorName }
  });
  return NextResponse.json({ ok: true });
}

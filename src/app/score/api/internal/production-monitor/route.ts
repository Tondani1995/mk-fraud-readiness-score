import { NextResponse } from 'next/server';
import { PRODUCTION_MONITOR_PATH } from '@/lib/monitoring/contracts';
import { runProductionMonitor } from '@/lib/monitoring/production-monitor';
import { verifyReadinessRequest } from '@/lib/monitoring/signatures';
import type { ReadinessFailureInjection } from '@/lib/monitoring/production-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Signed internal runner. It is intentionally separate from the read-only readiness endpoint:
 * this route writes the durable heartbeat/incident ledger and sends only allowlisted internal
 * incident notifications.
 */
const FAILURE_INJECTIONS = new Set<ReadinessFailureInjection>([
  'adaptive_sha_mismatch',
  'database_failure',
  'public_route_failure',
  'stale_heartbeat'
]);

async function handle(request: Request) {
  // The existing hourly Supabase pg_cron job already has a protected Vercel secret. Reusing that
  // internal scheduler credential keeps this additive monitor from requiring a second scheduler
  // secret; a dedicated MK_PRODUCTION_MONITOR_SECRET may be supplied later for another runner.
  const secret = process.env.MK_PRODUCTION_MONITOR_SECRET?.trim()
    || process.env.MK_STALLED_LEAD_CRON_SECRET?.trim();
  if (!verifyReadinessRequest(request, secret, PRODUCTION_MONITOR_PATH)) {
    return NextResponse.json({ ok: false, status: 'UNAUTHORISED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const origin = request.headers.get('x-forwarded-host')
    ? `${request.headers.get('x-forwarded-proto') ?? 'https'}://${request.headers.get('x-forwarded-host')}`
    : new URL(request.url).origin;
  const daily = new URL(request.url).searchParams.get('daily') === '1'
    || request.headers.get('x-mk-monitor-mode') === 'daily';
  const requestedInjection = new URL(request.url).searchParams.get('inject');
  const failureInjection = process.env.VERCEL_ENV === 'preview'
    && process.env.MK_MONITORING_FAILURE_INJECTION === 'enabled'
    && requestedInjection
    && FAILURE_INJECTIONS.has(requestedInjection as ReadinessFailureInjection)
    ? requestedInjection as ReadinessFailureInjection
    : undefined;
  const result = await runProductionMonitor({ origin, daily, failureInjection });
  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    checked_at: new Date().toISOString(),
    candidate_count: result.candidateCount ?? 0,
    emails_sent: result.emailsSent ?? 0,
    recovered: result.recovered ?? 0
  }, {
    status: result.status === 'INCIDENT' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export const GET = handle;
export const POST = handle;

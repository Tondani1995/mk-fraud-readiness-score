import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { verifyReadinessRequest } from '@/lib/monitoring/signatures';
import { scrubSentryEvent, sentryServerEnvironment } from '@/lib/monitoring/sentry';

const TEST_PATH = '/score/api/internal/sentry-test-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Preview-only, signed Sentry certification route. It is not a Production failure injection. */
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ ok: false }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const secret = process.env.MK_PRODUCTION_MONITOR_SECRET;
  if (!verifyReadinessRequest(request, secret, TEST_PATH)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!Sentry.getClient()) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
      environment: sentryServerEnvironment(),
      sendDefaultPii: false,
      tracesSampleRate: 0,
      enableLogs: false,
      beforeSend: scrubSentryEvent
    });
  }

  const sentryClientInitialized = Boolean(Sentry.getClient());
  const eventId = Sentry.captureException(new Error('MK Preview controlled server error'), {
    tags: { mk_controlled_test: 'true', error_category: 'sentry_server_controlled' }
  });
  const flushed = await Sentry.flush(2000);
  return NextResponse.json(
    {
      ok: false,
      error: 'controlled_preview_error',
      sentry: {
        client_initialized: sentryClientInitialized,
        event_queued: Boolean(eventId),
        flushed
      }
    },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

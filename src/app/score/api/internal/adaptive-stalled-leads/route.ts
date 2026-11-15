import { createMonitorDatabase, monitorDatabaseError, STALLED_LEAD_MONITOR_BUDGET_MS } from '@/lib/monitoring/database';
import { NextResponse } from 'next/server';
import { monitorAdaptiveStalledLeads } from '@/lib/notifications/internal-assessment-notifications';
import { monitorReviewStalledLeads } from '@/lib/readiness-review/review-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorised(request: Request) {
  const cronSecret = process.env.MK_STALLED_LEAD_CRON_SECRET?.trim();
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
  try {
    const result = await monitorAdaptiveStalledLeads({
      adminUrlFor: (assessmentReference) => `${configuredBaseUrl.replace(/\/$/, '')}/score/admin/assessments/${encodeURIComponent(assessmentReference)}`
    }, { db: createMonitorDatabase({ budgetMs: STALLED_LEAD_MONITOR_BUDGET_MS }) });
    // The revised review's stalled reviews ride on the same hourly job; a failure there never hides the adaptive result.
    const review = await monitorReviewStalledLeads().catch((error) => {
      console.error('review_stalled_lead_monitor_failed', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
      return { inspected: 0, notified: 0, failed: true };
    });
    return NextResponse.json({ ...result, review });
  } catch (error) {
    console.error('adaptive_stalled_lead_monitor_failed', {
      errorCategory: 'stalled_lead_monitor_failed',
      ...monitorDatabaseError(error)
    });
    return NextResponse.json({ ok: false, error: 'stalled_lead_monitor_failed' }, { status: 500 });
  }
}

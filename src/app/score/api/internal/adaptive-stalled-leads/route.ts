import { createMonitorDatabase, monitorDatabaseError, STALLED_LEAD_MONITOR_BUDGET_MS } from '@/lib/monitoring/database';
import { NextResponse } from 'next/server';
import { loadStalledLeadControl, monitorAdaptiveStalledLeads } from '@/lib/notifications/internal-assessment-notifications';
import { monitorReviewStalledLeads } from '@/lib/readiness-review/review-notifications';
import { recordStalledLeadMonitorHeartbeat } from '@/lib/monitoring/stalled-lead-heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorised(request: Request) {
  const cronSecret = process.env.MK_STALLED_LEAD_CRON_SECRET?.trim();
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

/**
 * The stalled-lead job for both Fraud Readiness flows, run every 15 minutes by pg_cron. Both passes apply the one stored
 * control (120 minutes of genuine inactivity by default). The run records a heartbeat so the production monitor can
 * report a stopped or failing job to MK's technical mailbox.
 */
export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const startedAt = new Date();
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
  const db = createMonitorDatabase({ budgetMs: STALLED_LEAD_MONITOR_BUDGET_MS });
  try {
    const control = await loadStalledLeadControl(db);
    const result = await monitorAdaptiveStalledLeads({
      control,
      adminUrlFor: (assessmentReference) => `${configuredBaseUrl.replace(/\/$/, '')}/score/admin/assessments/${encodeURIComponent(assessmentReference)}`
    }, { db });
    // A failure in the review pass never hides the adaptive result, but it is reported and recorded.
    const review = await monitorReviewStalledLeads(control).catch((error) => {
      console.error('review_stalled_lead_monitor_failed', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
      return { inspected: 0, notified: 0, failed: 1, error: 'review_pass_failed' as const };
    });
    const degraded = Boolean((result as any).failed) || Boolean((review as any).failed);
    await recordStalledLeadMonitorHeartbeat(db, { startedAt, status: degraded ? 'degraded' : 'healthy', adaptive: result, review });
    return NextResponse.json({ ...result, review });
  } catch (error) {
    console.error('adaptive_stalled_lead_monitor_failed', {
      errorCategory: 'stalled_lead_monitor_failed',
      ...monitorDatabaseError(error)
    });
    await recordStalledLeadMonitorHeartbeat(db, { startedAt, status: 'failed' });
    return NextResponse.json({ ok: false, error: 'stalled_lead_monitor_failed' }, { status: 500 });
  }
}

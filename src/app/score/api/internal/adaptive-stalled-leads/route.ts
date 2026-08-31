import { NextResponse } from 'next/server';
import { monitorAdaptiveStalledLeads } from '@/lib/notifications/internal-assessment-notifications';

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
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('adaptive_stalled_lead_monitor_failed', {
      errorCategory: 'stalled_lead_monitor_failed',
      reason: error instanceof Error ? error.message : 'unknown'
    });
    return NextResponse.json({ ok: false, error: 'stalled_lead_monitor_failed' }, { status: 500 });
  }
}

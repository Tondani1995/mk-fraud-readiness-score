import { NextResponse } from 'next/server';
import { createMonitorDatabase, STALLED_LEAD_MONITOR_BUDGET_MS } from '@/lib/monitoring/database';
import { loadStalledLeadControl } from '@/lib/notifications/internal-assessment-notifications';
import { recoverStalledReviews } from '@/lib/readiness-review/review-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorised(request: Request) {
  const cronSecret = process.env.MK_STALLED_LEAD_CRON_SECRET?.trim();
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Owner-approved recovery of review stalled notifications that the automatic pass leaves alone. A dry run (the default)
 * returns the register; sending needs the named session ids and the exact confirmation "SEND <count>". Each notification
 * uses the same dedupe key as the automatic pass, so a repeated call never sends twice.
 */
export async function POST(request: Request) {
  if (!isAuthorised(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await request.json().catch(() => null) as { sessionIds?: unknown; execute?: unknown; confirm?: unknown } | null;
  const sessionIds = Array.isArray(body?.sessionIds) ? body!.sessionIds.map(String).filter((id) => SESSION_ID.test(id)) : [];
  if (!sessionIds.length || sessionIds.length > 25) {
    return NextResponse.json({ ok: false, error: 'name between 1 and 25 review session ids' }, { status: 400 });
  }
  const execute = body?.execute === true;
  if (execute && body?.confirm !== `SEND ${sessionIds.length}`) {
    return NextResponse.json({ ok: false, error: `to send, confirm with "SEND ${sessionIds.length}"` }, { status: 400 });
  }
  try {
    const control = await loadStalledLeadControl(createMonitorDatabase({ budgetMs: STALLED_LEAD_MONITOR_BUDGET_MS }));
    const result = await recoverStalledReviews(control, { sessionIds, execute });
    console.info('review_stalled_recovery', { executed: execute, outcomes: result.entries.map((e) => e.outcome) });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('review_stalled_recovery_failed', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
    return NextResponse.json({ ok: false, error: 'review_stalled_recovery_failed' }, { status: 500 });
  }
}

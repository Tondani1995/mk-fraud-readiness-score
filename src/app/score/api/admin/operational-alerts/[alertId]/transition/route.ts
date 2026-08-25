import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TARGET_STATUSES = new Set(['open', 'acknowledged', 'resolved']);

// Mutation is narrower than read access: platform_admin and reviewer only. approver and
// read_only_admin can see this route return 403 (via requireAdmin) but the database's own
// phase14_require_actor check inside transition_phase14_operational_alert is the authoritative
// enforcement -- this app-layer check exists for a fast, clear error, not as the only gate.
export async function POST(request: Request, props: { params: Promise<{ alertId: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('operational_alert');
  if (frozen) return frozen;

  await requireAdmin(['platform_admin', 'reviewer']);
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }

  const alertId = params.alertId;
  if (!alertId || !/^[0-9a-f-]{36}$/i.test(alertId)) {
    return NextResponse.json({ ok: false, error: 'A valid alertId is required.' }, { status: 400 });
  }

  let body: { targetStatus?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const targetStatus = body.targetStatus?.trim();
  const reason = body.reason?.trim();
  if (!targetStatus || !VALID_TARGET_STATUSES.has(targetStatus)) {
    return NextResponse.json({ ok: false, error: 'A valid targetStatus is required.' }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: 'A reason is required and is recorded in audit_logs.' }, { status: 400 });
  }

  const db = createSupabaseAuthenticatedServerClient(accessToken);
  const { data, error } = await db.rpc('transition_phase14_operational_alert', {
    p_alert_id: alertId,
    p_target_status: targetStatus,
    p_reason: reason
  });

  if (error) {
    // Capability absence (Release D's migration not applied to the connected database) surfaces
    // here as a PostgREST "function not found" error if the page's own capability check somehow
    // let a request through anyway (e.g. a stale client). Map it to the same clear, non-raw
    // message the page shows proactively, rather than passing a Postgres/PostgREST error string
    // straight to the operator.
    if (error.message?.includes('Could not find the function') || error.code === 'PGRST202') {
      return NextResponse.json({
        ok: false,
        error: 'Lifecycle actions require the integrated Release D migration, which this environment does not have yet.'
      }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, alert: data }, { headers: { 'Cache-Control': 'no-store' } });
}

import { NextResponse } from 'next/server';
import { canManageFinance, getAdminSession } from '@/lib/auth/admin-route';
import { recoverFulfilmentJob } from '@/lib/fulfilment/fulfilment-service';

// Release B admin recovery: force-recover a stuck REPORT_GENERATING job (admin override of
// the automatic recover_expired_fulfilment_leases() sweep, for a specific attempt, before its
// lease has necessarily expired). canManageFinance() matches recover_fulfilment_job()'s
// internal role check exactly (platform_admin/finance_admin).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { orderReference: string } }) {
  const admin = await getAdminSession();
  if (!admin || !canManageFinance(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to manage fulfilment recovery.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const attemptId = String(body.attemptId ?? '');
  if (!attemptId) {
    return NextResponse.json({ ok: false, reason: 'attempt_required', message: 'A fulfilment attempt id is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await recoverFulfilmentJob(attemptId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, data: result.data, orderReference: params.orderReference }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { DELIVERY_RETRY_ROLES, retryDelivery } from '@/lib/reports/delivery-recovery-service';

// Release C admin recovery: retry a failed_terminal/reconciliation_required delivery.
// DELIVERY_RETRY_ROLES matches retry_delivery()'s internal role check exactly.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { orderReference: string } }) {
  const admin = await getAdminSession();
  if (!admin || !DELIVERY_RETRY_ROLES.includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to retry report delivery.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const authorizationId = String(body.authorizationId ?? '');
  if (!authorizationId) {
    return NextResponse.json({ ok: false, reason: 'authorization_required', message: 'A delivery authorization id is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await retryDelivery(authorizationId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, data: result.data, orderReference: params.orderReference }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

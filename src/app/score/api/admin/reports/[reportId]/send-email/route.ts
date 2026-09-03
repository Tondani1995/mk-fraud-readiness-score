import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { MANUAL_CUSTOMER_DELIVERY_MESSAGE, MANUAL_CUSTOMER_DELIVERY_REASON } from '@/lib/commercial/manual-fulfilment-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ reportId: string }> }) {
  void request;
  const params = await props.params;
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Authentication is required.' }, { status: 401 });
  if (!['platform_admin', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Your role cannot initiate report delivery.' }, { status: 403 });
  }
  void params;
  return NextResponse.json({
    ok: false,
    reason: MANUAL_CUSTOMER_DELIVERY_REASON,
    message: MANUAL_CUSTOMER_DELIVERY_MESSAGE
  }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
}

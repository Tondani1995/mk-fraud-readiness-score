import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { ACCESS_TOKEN_ROLES, reissueAccessToken } from '@/lib/reports/delivery-recovery-service';

// Release C admin recovery: reissue a customer's secure report access link and resend the
// report-ready email with it. ACCESS_TOKEN_ROLES matches
// reissue_customer_report_access_token()'s internal role check exactly.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { orderReference: string } }) {
  const admin = await getAdminSession();
  if (!admin || !ACCESS_TOKEN_ROLES.includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to manage customer report access links.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const reportId = String(body.reportId ?? '');
  const reason = String(body.reason ?? '');
  const overrideSuppression = body.overrideSuppression === true;
  if (!reportId) {
    return NextResponse.json({ ok: false, reason: 'report_required', message: 'A report id is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const db = createSupabaseServiceClient() as any;
  const { data: order, error } = await db.from('orders')
    .select('id,order_reference,customer_name,customer_email')
    .eq('order_reference', params.orderReference).maybeSingle();
  if (error || !order) {
    return NextResponse.json({ ok: false, reason: 'order_not_found', message: 'Order not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!order.customer_email) {
    return NextResponse.json({ ok: false, reason: 'recipient_missing', message: 'This order has no customer email on file.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await reissueAccessToken({
    orderId: order.id,
    reportId,
    orderReference: order.order_reference,
    recipientEmail: order.customer_email,
    customerName: order.customer_name ?? null,
    reason,
    overrideSuppression
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, data: result.data, orderReference: params.orderReference }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

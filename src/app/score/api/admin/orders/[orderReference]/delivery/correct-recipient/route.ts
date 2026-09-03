import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { ACCESS_TOKEN_ROLES, correctDeliveryRecipientAndQueue } from '@/lib/reports/delivery-recovery-service';

// Release C closure: resolves a 'recipient_required' delivery exception. ACCESS_TOKEN_ROLES
// matches correct_delivery_recipient_and_queue()'s internal role check exactly.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const admin = await getAdminSession();
  if (!admin || !ACCESS_TOKEN_ROLES.includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to correct a delivery recipient.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const newRecipientEmail = String(body.newRecipientEmail ?? '');
  const reason = String(body.reason ?? '');
  if (!newRecipientEmail) {
    return NextResponse.json({ ok: false, reason: 'recipient_required', message: 'A corrected email address is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const db = createSupabaseServiceClient() as any;
  const { data: order, error } = await db.from('orders').select('id').eq('order_reference', params.orderReference).maybeSingle();
  if (error || !order) {
    return NextResponse.json({ ok: false, reason: 'order_not_found', message: 'Order not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await correctDeliveryRecipientAndQueue({ orderId: order.id, newRecipientEmail, reason });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, data: result.data, orderReference: params.orderReference }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

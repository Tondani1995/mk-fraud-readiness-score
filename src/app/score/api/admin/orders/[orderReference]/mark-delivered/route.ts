import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Records that MK emailed the report to the customer.
 *
 * This sends nothing. Under the approved launch model the operator sends the email
 * themselves and then records it here; the provider resend control is separate and is
 * deliberately left alone. Every eligibility rule -- payment confirmed, a verified
 * stored report, a recipient on file -- and the idempotency guarantee live in the RPC,
 * so a repeated click returns the original delivery instead of creating a second one.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ orderReference: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  if (!['platform_admin', 'reviewer', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
  }

  const { orderReference } = await context.params;
  const db = createSupabaseServiceClient() as any;
  const { data, error } = await db.rpc('record_manual_report_delivery', {
    p_order_reference: orderReference,
    p_actor: admin.id
  });

  if (error) {
    const reason = String(error.message ?? '').match(/manual_delivery_[a-z_]+/)?.[0] ?? 'delivery_record_failed';
    const message = {
      manual_delivery_order_not_paid: 'Delivery can only be recorded once payment is confirmed.',
      manual_delivery_report_not_ready: 'Delivery can only be recorded once a verified report exists.',
      manual_delivery_recipient_missing: 'This order has no delivery recipient on file.',
      manual_delivery_permission_denied: 'You are not authorised to record delivery.'
    }[reason] ?? 'The delivery could not be recorded.';
    console.error('manual_delivery_record', { orderReference, reason });
    return NextResponse.json({ ok: false, reason, message }, { status: reason === 'manual_delivery_permission_denied' ? 403 : 409 });
  }

  return NextResponse.json({
    ok: true,
    alreadyDelivered: data?.recorded === false,
    deliveredAt: data?.delivery?.delivered_at ?? null,
    recipient: data?.delivery?.recipient_email ?? null,
    message: data?.recorded === false
      ? 'This report was already recorded as delivered.'
      : 'Delivery recorded.'
  });
}

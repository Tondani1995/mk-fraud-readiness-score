import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

function reasonFrom(message: string) {
  return message.match(/phase1_[a-z_]+/)?.[0] ?? 'delivery_record_failed';
}

function responseFor(reason: string): [string, number] {
  return ({
    phase1_order_not_found: ['Order not found.', 404],
    phase1_delivery_permission_denied: ['You are not authorised to record delivery.', 403],
    phase1_report_record_missing: ['A generated report could not be found for this order.', 409],
    phase1_report_order_mismatch: ['The report does not belong to this order.', 409],
    phase1_report_not_ready: ['Delivery can only be recorded once a verified report exists.', 409],
    phase1_delivery_recipient_missing: ['This order has no delivery recipient on file.', 409],
    phase1_delivery_attempt_not_active: ['The delivery record changed before it could be completed. Retry once.', 409]
  } as Record<string, [string, number]>)[reason] ?? ['The delivery could not be recorded.', 409];
}

/** Records an operator-sent manual customer email. This endpoint never sends email. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ orderReference: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  if (!['platform_admin', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to record delivery.' }, { status: 403 });
  }

  const { orderReference } = await context.params;
  const db = createSupabaseServiceClient() as any;
  const { data: order, error: orderError } = await db.from('orders')
    .select('id,status')
    .eq('order_reference', orderReference)
    .maybeSingle();
  if (orderError || !order) {
    return NextResponse.json({ ok: false, reason: 'phase1_order_not_found', message: 'Order not found.' }, { status: 404 });
  }
  if (order.status !== 'payment_received') {
    return NextResponse.json({ ok: false, reason: 'manual_delivery_order_not_paid', message: 'Delivery can only be recorded once payment is confirmed.' }, { status: 409 });
  }

  const { data: report, error: reportError } = await db.from('reports')
    .select('id,storage_status,storage_bucket,storage_path,checksum,version_number')
    .eq('order_id', order.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportError || !report || report.storage_status !== 'VERIFIED' || !report.storage_bucket || !report.storage_path || !report.checksum) {
    return NextResponse.json({ ok: false, reason: 'manual_delivery_report_not_ready', message: 'Delivery can only be recorded once a verified report exists.' }, { status: 409 });
  }

  const technicalReference = crypto.randomUUID();
  const requestKey = `operator-manual-delivery:${report.id}`;
  const { data: claim, error: claimError } = await db.rpc('claim_manual_report_delivery', {
    p_report_id: report.id,
    p_order_reference: orderReference,
    p_requested_by: admin.id,
    p_request_key: requestKey,
    p_provider_mode: 'disabled',
    p_technical_reference: technicalReference
  });
  if (claimError || !claim?.attempt) {
    const reason = reasonFrom(String(claimError?.message ?? ''));
    const [message, status] = responseFor(reason);
    return NextResponse.json({ ok: false, reason, message, technicalReference }, { status });
  }

  if (claim.reason === 'already_delivered' || (claim.reason === 'idempotent_replay' && claim.attempt.status === 'DELIVERED')) {
    return NextResponse.json({
      ok: true,
      alreadyDelivered: true,
      deliveredAt: claim.attempt.completed_at ?? null,
      recipient: claim.attempt.recipient_email ?? null,
      message: 'This report was already recorded as delivered.'
    });
  }

  const { data: completed, error: completeError } = await db.rpc('complete_manual_report_delivery', {
    p_attempt_id: String(claim.attempt.id),
    p_status: 'DELIVERED',
    p_error_category: null,
    p_safe_message: null
  });
  if (completeError || !completed?.attempt) {
    const reason = reasonFrom(String(completeError?.message ?? ''));
    const [message, status] = responseFor(reason);
    return NextResponse.json({ ok: false, reason, message, technicalReference }, { status });
  }

  return NextResponse.json({
    ok: true,
    alreadyDelivered: false,
    deliveredAt: completed.attempt.completed_at ?? null,
    recipient: completed.attempt.recipient_email ?? null,
    message: 'Delivery recorded.'
  });
}

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPaymentAutomationCapability } from '@/lib/payments/payment-capability';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { orderReference: string } }) {
  const capability = await getPaymentAutomationCapability();
  if (capability.status !== 'available') return NextResponse.json({ ok: false, message: capability.message }, { status: 503 });
  const token = cookies().get('mk_payment_return')?.value;
  if (!token) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const db = createSupabaseServiceClient() as any;
  const { data: session } = await db.from('payment_sessions').select('order_id,expires_at,orders!inner(order_reference)')
    .eq('return_token_hash', hash).gt('expires_at', new Date().toISOString()).maybeSingle();
  const orderReference = Array.isArray(session?.orders) ? session.orders[0]?.order_reference : session?.orders?.order_reference;
  if (!session || orderReference !== params.orderReference) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { data: payment } = await db.from('payment_automation_records')
    .select('state,received_amount_cents,currency,verification_result,review_reason,fulfilment_trigger_result,last_event_at')
    .eq('order_id', session.order_id).maybeSingle();
  return NextResponse.json({ ok: true, payment: payment ?? { state: 'PAYMENT_PENDING', fulfilment_trigger_result: 'NOT_REQUESTED' } }, { headers: { 'Cache-Control': 'no-store' } });
}

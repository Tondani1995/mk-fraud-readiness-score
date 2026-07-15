import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { canManageFinance, getAdminSession } from '@/lib/auth/admin-route';
import { updateAdminOrderStatus, type ManualOrderStatus } from '@/lib/orders/manual-eft-orders';
import { getPaymentAutomationCapability } from '@/lib/payments/payment-capability';
import { confirmManualPayment } from '@/lib/payments/payment-service';
import { getPhase1SchemaCapability } from '@/lib/reports/phase1-schema-capability';
import crypto from 'node:crypto';

const allowedStatuses = ['draft', 'awaiting_payment', 'payment_received', 'cancelled', 'expired'];

export async function POST(request: Request, { params }: { params: { orderReference: string } }) {
  const admin = await getAdminSession();
  const detailUrl = new URL(`/score/admin/orders/${params.orderReference}`, request.url);

  if (!admin || !canManageFinance(admin.role)) {
    return NextResponse.redirect(new URL('/score/admin/login?error=forbidden', request.url));
  }

  const form = await request.formData();
  const status = String(form.get('status') ?? '') as ManualOrderStatus;
  const note = String(form.get('note') ?? '');

  if (!allowedStatuses.includes(status)) {
    detailUrl.searchParams.set('error', 'unsupported_status');
    return NextResponse.redirect(detailUrl);
  }

  const paymentCapability = await getPaymentAutomationCapability();
  let result: { ok: boolean; error?: string; message?: string };
  if (status === 'payment_received' && paymentCapability.status === 'available') {
    const payment = await confirmManualPayment({
      orderReference: params.orderReference,
      adminId: admin.id,
      note,
      amountCents: form.get('amountCents') ? Number(form.get('amountCents')) : undefined,
      currency: String(form.get('currency') ?? 'ZAR'),
      idempotencyKey: String(form.get('idempotencyKey') ?? request.headers.get('x-idempotency-key') ?? crypto.randomUUID())
    });
    result = { ok: payment.ok, error: payment.ok ? undefined : payment.message, message: payment.message };
  } else {
    const legacy = await updateAdminOrderStatus({ orderReference: params.orderReference, nextStatus: status, note, admin });
    result = legacy;
    if (legacy.ok && status === 'payment_received') {
      const phase1 = await getPhase1SchemaCapability();
      result.message = phase1.status === 'available'
        ? 'Payment confirmed. Payment automation remains unavailable until its separately approved database upgrade.'
        : 'Payment confirmed. Fulfilment will remain pending until the Phase 1 upgrade is activated.';
    }
  }

  if (!result.ok) detailUrl.searchParams.set('error', result.error ?? 'status_update_failed');
  else {
    revalidatePath('/score/admin/orders');
    revalidatePath(`/score/admin/orders/${params.orderReference}`);
    detailUrl.searchParams.set('updated', String(Date.now()));
    if (result.message) detailUrl.searchParams.set('message', result.message.slice(0, 240));
  }

  return NextResponse.redirect(detailUrl);
}

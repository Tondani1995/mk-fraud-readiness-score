import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { canManageFinance, getAdminSession } from '@/lib/auth/admin-route';
import { updateAdminOrderStatus, type ManualOrderStatus } from '@/lib/orders/manual-eft-orders';
import { getPremiumReportAutomationFlags } from '@/lib/reports/automation/feature-flags';
import { queuePremiumReportFulfilment } from '@/lib/reports/automation/fulfilment';

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

  const result = await updateAdminOrderStatus({
    orderReference: params.orderReference,
    nextStatus: status,
    note,
    admin
  });

  if (!result.ok) detailUrl.searchParams.set('error', result.error ?? 'status_update_failed');
  else {
    if (status === 'payment_received') {
      const flags = await getPremiumReportAutomationFlags();
      if (flags.autoFulfilmentEnabled) {
        const fulfilment = await queuePremiumReportFulfilment({
          orderReference: params.orderReference,
          triggerSource: 'payment_confirmation',
          requestedByAdminUserId: admin.id
        });
        if (fulfilment.ok) {
          detailUrl.searchParams.set('fulfilment', fulfilment.created ? 'queued' : 'already_queued');
        } else {
          detailUrl.searchParams.set('fulfilment_error', fulfilment.reason);
        }
      }
    }

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${params.orderReference}`);
    detailUrl.searchParams.set('updated', String(Date.now()));
  }

  return NextResponse.redirect(detailUrl);
}

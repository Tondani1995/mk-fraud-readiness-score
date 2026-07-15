import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { canManageFinance, getAdminSession } from '@/lib/auth/admin-route';
import { updateAdminOrderStatus, type ManualOrderStatus } from '@/lib/orders/manual-eft-orders';
import { getPremiumReportAutomationFlags } from '@/lib/reports/automation/feature-flags';
import { queuePremiumReportFulfilment } from '@/lib/reports/automation/fulfilment';
import { startPremiumReportWorkflow } from '@/lib/reports/automation/workflow-start';
import {
  authorizePhase14WorkerOperation,
  Phase14AuthorizationError
} from '@/lib/reports/phase14-security';

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
          if (!fulfilment.created) {
            detailUrl.searchParams.set('fulfilment', 'already_queued');
          } else {
            try {
              const generationAuthorization = await authorizePhase14WorkerOperation({
                capabilityType: 'automatic_generation',
                operationKey: `premium-report-generation:${fulfilment.fulfilment.id}`,
                orderId: fulfilment.context.orderId,
                assessmentId: fulfilment.context.assessmentId,
                scoreRunId: fulfilment.context.scoreRunId,
                fulfilmentId: fulfilment.fulfilment.id,
                reason: `Automatic premium-report fulfilment approved after payment confirmation ${params.orderReference}.`
              });
              const deliveryAuthorization = flags.autoEmailEnabled
                ? await authorizePhase14WorkerOperation({
                    capabilityType: 'automatic_delivery',
                    operationKey: `premium-report-delivery:${fulfilment.fulfilment.id}`,
                    orderId: fulfilment.context.orderId,
                    assessmentId: fulfilment.context.assessmentId,
                    scoreRunId: fulfilment.context.scoreRunId,
                    fulfilmentId: fulfilment.fulfilment.id,
                    recipient: fulfilment.context.recipient,
                    reason: `Automatic premium-report delivery approved after payment confirmation ${params.orderReference}.`
                  })
                : null;
              const workflow = await startPremiumReportWorkflow({
                fulfilmentId: fulfilment.fulfilment.id,
                generationAuthorization,
                deliveryCapabilityId: deliveryAuthorization?.capabilityId ?? null
              });
              if (workflow.ok) {
                detailUrl.searchParams.set('fulfilment', workflow.started ? 'workflow_started' : 'queued');
                if (workflow.runId) detailUrl.searchParams.set('workflow_run', workflow.runId);
              } else {
                detailUrl.searchParams.set('fulfilment_error', 'workflow_start_failed');
              }
            } catch (error) {
              detailUrl.searchParams.set(
                'fulfilment_error',
                error instanceof Phase14AuthorizationError ? error.reason : 'worker_capability_authorization_failed'
              );
            }
          }
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

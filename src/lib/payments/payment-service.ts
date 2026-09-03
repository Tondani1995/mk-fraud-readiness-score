import crypto from 'node:crypto';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { dispatchImmediateFulfilment } from '@/lib/fulfilment/immediate-dispatch';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { notifyInternalPaymentReceived } from '@/lib/notifications/internal-order-notifications';
import { getPaymentAutomationCapability } from './payment-capability';
import type { NormalisedPaymentEvent, PaymentSource, PaymentState, PaymentTransitionResult } from './types';

// Payment confirmation remains one atomic database transition. For Comprehensive, the same
// transaction returns the exact durable attempt ID and this service then invokes the existing
// exact-deployment worker dispatcher after commit. A dispatch failure is operational evidence,
// not a payment failure: the committed attempt remains recoverable by the worker/recovery path.
// Essential remains outside this branch because its payment transition does not queue a
// Comprehensive fulfilment attempt.
function fulfilmentFromTransition(result: Record<string, unknown> | null | undefined): PaymentTransitionResult['fulfilment'] {
  const queued = String(result?.fulfilment ?? '');
  if (queued === 'QUEUED') return 'queued';
  if (queued === 'ALREADY_ACTIVE') return 'already_active';
  return 'not_requested';
}

function targetState(event: NormalisedPaymentEvent, expectedAmount: number, expectedCurrency: string, requireTransactionReference: boolean): { state: PaymentState; reason: string } {
  if (event.outcome === 'failed') return { state: 'PAYMENT_FAILED', reason: 'Provider reported payment failure.' };
  if (event.outcome === 'cancelled') return { state: 'CANCELLED', reason: 'Payment was cancelled or expired.' };
  if (event.outcome === 'refunded') return { state: 'REFUNDED', reason: 'Provider reported a completed refund or reversal.' };
  if (event.outcome === 'processing') return { state: 'PAYMENT_PROCESSING', reason: 'Payment is awaiting a final provider result.' };
  if (event.outcome === 'review') return { state: 'PAYMENT_REVIEW_REQUIRED', reason: 'Provider result requires manual review.' };
  if (requireTransactionReference && !event.transactionReference) return { state: 'PAYMENT_REVIEW_REQUIRED', reason: 'Provider transaction reference is missing.' };
  if (event.currency !== expectedCurrency.toUpperCase()) return { state: 'PAYMENT_REVIEW_REQUIRED', reason: 'Payment currency does not match the order.' };
  if (event.amountCents === null || event.amountCents < expectedAmount) return { state: 'PAYMENT_REVIEW_REQUIRED', reason: 'Payment amount is below the order amount.' };
  if (event.amountCents > expectedAmount) return { state: 'PAYMENT_REVIEW_REQUIRED', reason: 'Payment amount is above the order amount.' };
  return { state: 'PAID', reason: 'Payment amount, currency, reference and final status were verified.' };
}

export async function processVerifiedPayment(input: {
  source: PaymentSource;
  actorReference: string | null;
  idempotencyKey: string;
  event: NormalisedPaymentEvent;
}): Promise<PaymentTransitionResult> {
  const db = createSupabaseServiceClient() as any;
  const technicalReference = crypto.randomUUID();
  const capability = await getPaymentAutomationCapability(db);
  if (capability.status !== 'available') {
    return { ok: false, duplicate: false, state: 'PAYMENT_PENDING', fulfilment: 'not_requested', message: capability.message!, technicalReference };
  }
  const { data: order, error: orderError } = await db.from('orders')
    .select('id,order_reference,assessment_id,amount_cents,currency,status,customer_name,customer_email')
    .eq('order_reference', input.event.orderReference).maybeSingle();
  if (orderError || !order) {
    await db.rpc('record_unmatched_payment_event', {
      p_provider_event_reference: input.event.eventId,
      p_order_reference: input.event.orderReference,
      p_source: input.source,
      p_reason: 'unknown_order',
      p_payload_sha256: input.event.payloadSha256 ?? null,
      p_technical_reference: technicalReference
    });
    return { ok: false, duplicate: false, state: 'PAYMENT_REVIEW_REQUIRED', fulfilment: 'not_requested', message: 'The payment reference could not be matched to an order.', technicalReference };
  }
  const target = targetState(input.event, Number(order.amount_cents), String(order.currency), input.source === 'stitch_webhook');
  const safeNote = target.state === 'PAID' && input.event.safeNote.trim() ? input.event.safeNote.trim() : target.reason;
  const { data, error } = await db.rpc('record_payment_transition', {
    p_order_reference: order.order_reference,
    p_new_state: target.state,
    p_source: input.source,
    p_actor_reference: input.actorReference,
    p_amount_cents: input.event.amountCents,
    p_currency: input.event.currency ?? order.currency,
    p_provider_transaction_reference: input.event.transactionReference,
    p_provider_event_reference: input.event.eventId,
    p_provider_event_at: input.event.occurredAt,
    p_safe_note: safeNote,
    p_verification_result: input.event.verificationResult,
    p_idempotency_key: input.idempotencyKey,
    p_technical_reference: technicalReference,
    p_payload_sha256: input.event.payloadSha256 ?? null
  });
  if (error || !data) {
    console.error('payment_transition', { technicalReference, orderReference: order.order_reference, outcome: 'error', code: error?.code ?? null });
    return { ok: false, duplicate: false, state: 'PAYMENT_REVIEW_REQUIRED', fulfilment: 'not_requested', message: 'Payment could not be recorded safely. The order requires review.', technicalReference };
  }
  let fulfilment: PaymentTransitionResult['fulfilment'] = 'not_requested';
  let fulfilmentAttemptId: string | undefined;
  let message = target.reason;
  if (target.state === 'PAID' && !data.duplicate) {
    fulfilment = fulfilmentFromTransition(data as Record<string, unknown>);
    if (fulfilment === 'queued') message = 'Payment confirmed. MK will now prepare the selected Comprehensive package.';
    else if (fulfilment === 'already_active') message = 'Payment confirmed. Preparation of the selected Comprehensive package is already in progress.';
    fulfilmentAttemptId = fulfilment === 'queued'
      && typeof data.fulfilment_attempt_id === 'string'
      ? data.fulfilment_attempt_id
      : undefined;
    if (fulfilmentAttemptId) {
      try {
        const dispatch = await dispatchImmediateFulfilment({
          attemptId: fulfilmentAttemptId,
          correlationReference: technicalReference
        });
        if (!dispatch.ok) {
          console.error('comprehensive_fulfilment_dispatch_failed_after_payment', {
            technicalReference,
            orderReference: order.order_reference,
            attemptId: fulfilmentAttemptId,
            errorCategory: dispatch.errorCategory
          });
        }
      } catch (dispatchError) {
        console.error('comprehensive_fulfilment_dispatch_exception_after_payment', {
          technicalReference,
          orderReference: order.order_reference,
          attemptId: fulfilmentAttemptId,
          errorCategory: 'dispatch_exception',
          message: dispatchError instanceof Error ? dispatchError.message : String(dispatchError)
        });
      }
    }
    await db.from('payment_automation_records').update({
      fulfilment_trigger_result: fulfilment === 'queued' ? 'QUEUED'
        : fulfilment === 'already_active' ? 'ALREADY_ACTIVE' : 'NOT_REQUESTED',
      updated_at: new Date().toISOString()
    }).eq('order_id', order.id);
    // Fire-and-forget: a notification failure must never fail payment recording itself. The
    // payment transition above already committed, and this notification is internal-only.
    await notifyInternalPaymentReceived({
      assessmentId: order.assessment_id,
      order,
      source: input.source,
      verifiedAtIso: new Date().toISOString()
    }).catch((notificationError: unknown) => {
      console.error('payment_received_internal_notification_failed', {
        technicalReference, orderReference: order.order_reference,
        message: notificationError instanceof Error ? notificationError.message : String(notificationError)
      });
    });
  }
  await trackAssessmentEvent({
    eventType: 'payment_marked_received', assessmentId: order.assessment_id, orderId: order.id,
    metadata: { source: input.source, payment_state: target.state, duplicate: data.duplicate === true, fulfilment }
  });
  console.info('payment_transition', { orderReference: order.order_reference, state: target.state, source: input.source, duplicate: data.duplicate === true, fulfilment, technicalReference });
  return {
    ok: true,
    duplicate: data.duplicate === true,
    state: target.state,
    eventId: data.event_id,
    fulfilmentAttemptId,
    fulfilment,
    message,
    technicalReference
  };
}

export async function confirmManualPayment(input: {
  orderReference: string;
  adminId: string;
  note: string;
  amountCents?: number;
  currency?: string;
  idempotencyKey: string;
}) {
  const db = createSupabaseServiceClient() as any;
  const { data: order } = await db.from('orders').select('amount_cents,currency,status').eq('order_reference', input.orderReference).maybeSingle();
  if (!order) return { ok: false as const, message: 'Order not found.' };
  if (!['awaiting_payment', 'payment_received'].includes(order.status)) return { ok: false as const, message: 'This order is not eligible for payment confirmation.' };
  if (input.note.trim().length < 5) return { ok: false as const, message: 'A payment confirmation note of at least 5 characters is required.' };
  const eventId = `manual:${input.idempotencyKey}`;
  return processVerifiedPayment({
    source: 'manual_admin', actorReference: input.adminId, idempotencyKey: input.idempotencyKey,
    event: {
      eventId, orderReference: input.orderReference, transactionReference: null,
      amountCents: input.amountCents ?? Number(order.amount_cents), currency: (input.currency ?? order.currency).toUpperCase(),
      outcome: 'completed', occurredAt: new Date().toISOString(), verificationResult: 'authorised_manual_confirmation', safeNote: input.note.trim()
    }
  });
}

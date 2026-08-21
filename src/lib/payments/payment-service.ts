import crypto from 'node:crypto';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { recordPaymentConfirmedNotification } from '@/lib/notifications/phase1-order-notifications';
import { getPaymentAutomationCapability } from './payment-capability';
import type { NormalisedPaymentEvent, PaymentSource, PaymentState, PaymentTransitionResult } from './types';

// Interim customer fulfilment is deliberately manual. The database payment transition records
// verified payment and does not create a generation job; an authorised MK operator later starts
// report preparation from the admin fulfilment controls and records manual delivery separately.
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
  let message = target.reason;
  if (target.state === 'PAID' && !data.duplicate) {
    fulfilment = fulfilmentFromTransition(data as Record<string, unknown>);
    if (fulfilment === 'queued') message = 'Payment confirmed. An operator must prepare the purchased report before delivery.';
    else if (fulfilment === 'already_active') message = 'Payment confirmed. An operator will complete the purchased report preparation and delivery.';
    else message = 'Payment confirmed. An MK operator will prepare and quality-check the purchased report, then email it manually and mark the order delivered.';
    await db.from('payment_automation_records').update({
      fulfilment_trigger_result: fulfilment === 'queued' ? 'QUEUED'
        : fulfilment === 'already_active' ? 'ALREADY_ACTIVE' : 'NOT_REQUESTED',
      updated_at: new Date().toISOString()
    }).eq('order_id', order.id);
    // Fire-and-forget: a notification failure must never fail payment recording itself -- the
    // payment transition above already committed. recordPaymentConfirmedNotification throws on
    // DB errors (see phase1-order-notifications.ts), so this is caught explicitly rather than
    // relying on the caller.
    await recordPaymentConfirmedNotification({
      orderId: order.id,
      orderReference: order.order_reference,
      assessmentId: order.assessment_id,
      amountCents: Number(order.amount_cents),
      currency: String(order.currency ?? 'ZAR'),
      customerName: order.customer_name ?? null,
      customerEmail: order.customer_email ?? null,
      verifiedAtIso: new Date().toISOString()
    }).catch((notificationError: unknown) => {
      console.error('payment_confirmed_notification_failed', {
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
  const fulfilmentAttemptId = fulfilment === 'queued'
    && typeof data.fulfilment_attempt_id === 'string'
    ? data.fulfilment_attempt_id
    : undefined;
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

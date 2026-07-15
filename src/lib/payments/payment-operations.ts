import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPaymentAutomationCapability, type PaymentAutomationCapability } from './payment-capability';

export const PAYMENT_QUEUE_LABELS = {
  payment_pending: 'Payment Pending',
  payment_processing: 'Payment Processing',
  payment_failed: 'Payment Failed',
  payment_review_required: 'Payment Review Required',
  paid_fulfilment_pending: 'Paid but Fulfilment Pending',
  paid_fulfilment_queued: 'Paid and Fulfilment Queued'
} as const;
export type PaymentQueueKey = keyof typeof PAYMENT_QUEUE_LABELS;

function fallbackState(orderStatus: string) {
  if (orderStatus === 'payment_received') return 'PAID';
  if (orderStatus === 'cancelled' || orderStatus === 'expired') return 'CANCELLED';
  return 'PAYMENT_PENDING';
}

export async function getPaymentOrderOperations(orderId: string, orderStatus: string, checked?: PaymentAutomationCapability) {
  const db = createSupabaseServiceClient() as any;
  const capability = checked ?? await getPaymentAutomationCapability(db);
  if (capability.status !== 'available') return { capability, record: { state: fallbackState(orderStatus), fulfilment_trigger_result: 'NOT_REQUESTED' }, events: [] };
  const [record, events] = await Promise.all([
    db.from('payment_automation_records').select('*').eq('order_id', orderId).maybeSingle(),
    db.from('payment_transition_events').select('id,old_state,new_state,source,actor_reference,amount_cents,currency,provider_transaction_reference,provider_event_reference,provider_event_at,safe_note,verification_result,processing_result,technical_reference,created_at').eq('order_id', orderId).order('created_at', { ascending: false })
  ]);
  return { capability, record: record.data ?? { state: fallbackState(orderStatus), fulfilment_trigger_result: 'NOT_REQUESTED' }, events: events.data ?? [] };
}

export async function annotateOrdersWithPaymentState(orders: any[]) {
  const db = createSupabaseServiceClient() as any;
  const capability = await getPaymentAutomationCapability(db);
  if (capability.status !== 'available' || !orders.length) return { capability, orders: orders.map((order) => ({ ...order, paymentState: fallbackState(order.status), paymentFulfilment: 'NOT_REQUESTED', paymentQueues: [] as PaymentQueueKey[] })) };
  const { data, error } = await db.from('payment_automation_records').select('order_id,state,fulfilment_trigger_result,review_reason,last_event_at').in('order_id', orders.map((order) => order.id));
  if (error) return { capability: { status: 'error', schemaVersion: '0024', message: 'Payment automation capability could not be verified.' } as PaymentAutomationCapability, orders };
  const byOrder = new Map((data ?? []).map((row: any) => [row.order_id, row]));
  return { capability, orders: orders.map((order) => {
    const payment: any = byOrder.get(order.id) ?? { state: fallbackState(order.status), fulfilment_trigger_result: 'NOT_REQUESTED' };
    const queues = new Set<PaymentQueueKey>();
    if (payment.state === 'PAYMENT_PENDING') queues.add('payment_pending');
    if (payment.state === 'PAYMENT_PROCESSING') queues.add('payment_processing');
    if (payment.state === 'PAYMENT_FAILED') queues.add('payment_failed');
    if (payment.state === 'PAYMENT_REVIEW_REQUIRED') queues.add('payment_review_required');
    if (payment.state === 'PAID' && ['NOT_REQUESTED','PHASE1_UNAVAILABLE','FAILED'].includes(payment.fulfilment_trigger_result)) queues.add('paid_fulfilment_pending');
    if (payment.state === 'PAID' && ['QUEUED','ALREADY_ACTIVE','ALREADY_FULFILLED'].includes(payment.fulfilment_trigger_result)) queues.add('paid_fulfilment_queued');
    return { ...order, paymentState: payment.state, paymentFulfilment: payment.fulfilment_trigger_result, paymentReviewReason: payment.review_reason, paymentQueues: [...queues] };
  }) };
}

export function paymentQueueCounts(orders: Array<{ paymentQueues?: PaymentQueueKey[] }>) {
  return Object.fromEntries((Object.keys(PAYMENT_QUEUE_LABELS) as PaymentQueueKey[]).map((key) => [key, orders.filter((order) => order.paymentQueues?.includes(key)).length])) as Record<PaymentQueueKey, number>;
}

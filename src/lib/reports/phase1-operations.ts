import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const PHASE1_QUEUE_LABELS = {
  immediate_attention: 'Requires Immediate Attention',
  new_orders: 'New Orders',
  paid_no_report: 'Paid but No Report',
  generation_queued: 'Generation Queued',
  generation_in_progress: 'Generation In Progress',
  generation_failed: 'Report Generation Failed',
  report_ready: 'Report Ready',
  ready_not_delivered: 'Report Ready but Not Delivered',
  delivery_pending: 'Delivery Pending',
  delivery_failed: 'Delivery Failed',
  delivered: 'Delivered'
} as const;

export type Phase1QueueKey = keyof typeof PHASE1_QUEUE_LABELS;

function latestBy<T extends { order_id: string; created_at: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) if (!map.has(row.order_id)) map.set(row.order_id, row);
  return map;
}

export async function getPhase1OrderOperations(orderId: string) {
  const db = createSupabaseServiceClient() as any;
  const [generationResult, deliveryResult, notificationResult] = await Promise.all([
    db.from('manual_report_generation_attempts')
      .select('id,request_id,order_id,report_version,trigger_source,requested_by,requested_at,started_at,completed_at,status,retry_count,error_category,safe_operational_error,technical_reference,output_report_id,created_at,updated_at')
      .eq('order_id', orderId).order('created_at', { ascending: false }),
    db.from('manual_report_delivery_attempts')
      .select('id,request_id,order_id,report_id,requested_by,requested_at,started_at,completed_at,status,retry_count,provider_mode,error_category,safe_operational_error,technical_reference,email_event_id,created_at,updated_at')
      .eq('order_id', orderId).order('created_at', { ascending: false }),
    db.from('email_events')
      .select('id,notification_type,recipient_email,status,provider_mode,retry_count,error_message,created_at,updated_at')
      .eq('order_id', orderId).order('created_at', { ascending: false })
  ]);
  return {
    schemaAvailable: !generationResult.error && !deliveryResult.error,
    generationHistory: generationResult.data ?? [],
    latestGeneration: generationResult.data?.[0] ?? null,
    deliveryHistory: deliveryResult.data ?? [],
    latestDelivery: deliveryResult.data?.[0] ?? null,
    notifications: notificationResult.data ?? []
  };
}

export async function annotateOrdersWithPhase1State(orders: any[]) {
  if (!orders.length) return [];
  const db = createSupabaseServiceClient() as any;
  const orderIds = orders.map((order) => order.id);
  const chunks = Array.from({ length: Math.ceil(orderIds.length / 200) }, (_, index) => orderIds.slice(index * 200, (index + 1) * 200));
  const results = await Promise.all(chunks.map(async (ids) => Promise.all([
    db.from('reports').select('id,order_id,status,storage_bucket,storage_path,storage_status,version_number,generated_at')
      .in('order_id', ids).order('version_number', { ascending: false }),
    db.from('manual_report_generation_attempts').select('order_id,status,safe_operational_error,created_at')
      .in('order_id', ids).order('created_at', { ascending: false }),
    db.from('manual_report_delivery_attempts').select('order_id,status,safe_operational_error,created_at')
      .in('order_id', ids).order('created_at', { ascending: false })
  ])));
  const reportRows = results.flatMap((result) => result[0].data ?? []);
  const generationRows = results.flatMap((result) => result[1].data ?? []);
  const deliveryRows = results.flatMap((result) => result[2].data ?? []);
  const reportByOrder = latestBy(reportRows.map((row: any) => ({ ...row, created_at: row.generated_at ?? '' })));
  const generationByOrder = latestBy(generationRows);
  const deliveryByOrder = latestBy(deliveryRows);

  return orders.map((order) => {
    const report: any = reportByOrder.get(order.id) ?? null;
    const generation: any = generationByOrder.get(order.id) ?? null;
    const delivery: any = deliveryByOrder.get(order.id) ?? null;
    const ready = Boolean(report?.storage_status === 'VERIFIED' && report?.storage_bucket && report?.storage_path && !['voided'].includes(report?.status));
    const generationState = generation?.status ?? (ready ? 'REPORT_READY' : 'NOT_REQUESTED');
    const deliveryState = delivery?.status ?? (ready ? 'NOT_READY' : 'NOT_READY');
    const generationStuck = ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(generationState)
      && Date.now() - new Date(generation?.created_at ?? 0).getTime() > 15 * 60 * 1_000;
    const deliveryStuck = ['DELIVERY_PENDING', 'DELIVERING'].includes(deliveryState)
      && Date.now() - new Date(delivery?.created_at ?? 0).getTime() > 60 * 60 * 1_000;
    const queues = new Set<Phase1QueueKey>();
    if (order.status === 'awaiting_payment' || order.status === 'draft') queues.add('new_orders');
    if (order.status === 'payment_received' && !ready) queues.add('paid_no_report');
    if (generationState === 'REPORT_QUEUED') queues.add('generation_queued');
    if (generationState === 'REPORT_GENERATING') queues.add('generation_in_progress');
    if (generationState === 'GENERATION_FAILED') queues.add('generation_failed');
    if (ready) queues.add('report_ready');
    if (ready && deliveryState !== 'DELIVERED') queues.add('ready_not_delivered');
    if (['DELIVERY_PENDING', 'DELIVERING'].includes(deliveryState)) queues.add('delivery_pending');
    if (deliveryState === 'DELIVERY_FAILED') queues.add('delivery_failed');
    if (deliveryState === 'DELIVERED') queues.add('delivered');
    if (queues.has('paid_no_report') || queues.has('generation_failed') || queues.has('ready_not_delivered') || queues.has('delivery_failed') || generationStuck || deliveryStuck) {
      queues.add('immediate_attention');
    }
    return {
      ...order,
      report,
      generation,
      delivery,
      generationState,
      deliveryState,
      stuckReason: generationStuck ? 'Generation attempt is older than 15 minutes.' : deliveryStuck ? 'Delivery attempt is older than 60 minutes.' : null,
      queues: [...queues]
    };
  });
}

export function queueCounts(orders: Array<{ queues: Phase1QueueKey[] }>) {
  return Object.fromEntries(
    (Object.keys(PHASE1_QUEUE_LABELS) as Phase1QueueKey[]).map((key) => [key, orders.filter((order) => order.queues.includes(key)).length])
  ) as Record<Phase1QueueKey, number>;
}

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { logCapabilityQueryFailure, type DiagnosticContext, type QueryFailureDiagnostic } from './capability-diagnostics';
import {
  getPhase1SchemaCapability,
  PHASE1_SCHEMA_ERROR_MESSAGE,
  type Phase1SchemaCapability
} from './phase1-schema-capability';

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

// Real (Release C) delivery status vocabulary, from report_delivery_authorizations_status_check
// (supabase/migrations/20260724170000_release_c_email_secure_delivery.sql). Distinct from
// manual_report_delivery_attempts' DELIVERY_PENDING/DELIVERING/DELIVERY_FAILED/DELIVERED, which
// getPhase1OrderOperations below still reads unchanged -- that table drives the separate,
// still-live legacy/provider-double admin delivery action (FulfilmentActions' "Initiate/Retry
// Delivery" button, via src/lib/reports/phase1-manual-delivery.ts), not real customer delivery.
// Exported (not just used locally) so delivery-recovery-service.ts's getOrderDeliveryState can
// classify the order-detail page's authoritative delivery status with the exact same rules this
// function uses for the admin orders list -- one shared classification, not two that could drift.
export const DELIVERY_IN_FLIGHT_STATUSES = ['queued', 'claimed', 'dispatching', 'retry_scheduled'];
// 'bounced'/'complained' are added here even though they're not values of
// report_delivery_authorizations.status itself (they live on the linked email_events row --
// see the deliveryState override below) -- a bounce/complaint always means "needs attention",
// the same bucket a terminal authorization failure already means.
export const DELIVERY_ATTENTION_STATUSES = ['failed_terminal', 'reconciliation_required', 'revoked', 'bounced', 'complained'];

// Maps an already bounce/complaint-resolved delivery status (see the deliveryState override in
// annotateOrdersWithPhase1State below, and mapAuthorization in delivery-recovery-service.ts,
// which apply the identical override) onto the same four buckets the admin orders list queues
// use. Shared by both the list (this file) and the order-detail page's primary summary
// (delivery-recovery-service.ts's getOrderDeliveryState), so the two views can't disagree about
// what a given status means.
export function classifyDeliveryBucket(status: string | null | undefined): 'not_ready' | 'delivery_pending' | 'delivered' | 'delivery_failed' {
  if (!status) return 'not_ready';
  if (DELIVERY_IN_FLIGHT_STATUSES.includes(status)) return 'delivery_pending';
  if (status === 'finalized') return 'delivered';
  if (DELIVERY_ATTENTION_STATUSES.includes(status)) return 'delivery_failed';
  return 'not_ready';
}

function latestBy<T extends { order_id: string; created_at: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) if (!map.has(row.order_id)) map.set(row.order_id, row);
  return map;
}

function withoutPhase1State(orders: any[]) {
  return orders.map((order) => ({
    ...order,
    report: null,
    generation: null,
    delivery: null,
    generationState: 'NOT_REQUESTED',
    deliveryState: 'NOT_READY',
    stuckReason: null,
    queues: order.status === 'awaiting_payment' || order.status === 'draft' ? ['new_orders'] : []
  }));
}

export async function getPhase1OrderOperations(
  orderId: string,
  checkedCapability?: Phase1SchemaCapability,
  context?: DiagnosticContext
) {
  const db = createSupabaseServiceClient() as any;
  const capability = checkedCapability ?? await getPhase1SchemaCapability(db, context);
  if (capability.status !== 'available') {
    return {
      capability,
      schemaAvailable: false,
      failedQueries: capability.failedQuery ? [capability.failedQuery] : [],
      generationHistory: [], latestGeneration: null,
      deliveryHistory: [], latestDelivery: null,
      notifications: []
    };
  }
  const [generationResult, deliveryResult, notificationResult] = await Promise.all([
    db.from('manual_report_generation_attempts')
      .select('id,request_id,order_id,report_version,trigger_source,requested_by,requested_at,started_at,completed_at,status,retry_count,max_attempts,next_attempt_at,lease_owner,lease_expires_at,error_category,safe_operational_error,technical_reference,output_report_id,quality_reviewed_by,quality_reviewed_at,quality_review_decision,quality_review_reason,regenerated_from_attempt_id,delivery_queued_at,created_at,updated_at')
      .eq('order_id', orderId).order('created_at', { ascending: false }),
    db.from('manual_report_delivery_attempts')
      .select('id,request_id,order_id,report_id,requested_by,requested_at,started_at,completed_at,status,retry_count,provider_mode,error_category,safe_operational_error,technical_reference,email_event_id,created_at,updated_at')
      .eq('order_id', orderId).order('created_at', { ascending: false }),
    db.from('email_events')
      .select('id,notification_type,recipient_email,status,provider_mode,retry_count,error_message,created_at,updated_at')
      .eq('order_id', orderId).order('created_at', { ascending: false })
  ]);

  const failedQueries: QueryFailureDiagnostic[] = [];
  const generationFailure = logCapabilityQueryFailure('manual_report_generation_attempts', generationResult.error, context);
  if (generationFailure) failedQueries.push(generationFailure);
  const deliveryFailure = logCapabilityQueryFailure('manual_report_delivery_attempts', deliveryResult.error, context);
  if (deliveryFailure) failedQueries.push(deliveryFailure);
  const notificationFailure = logCapabilityQueryFailure('email_events', notificationResult.error, context);
  if (notificationFailure) failedQueries.push(notificationFailure);

  return {
    capability,
    schemaAvailable: failedQueries.length === 0,
    failedQueries,
    generationHistory: generationResult.data ?? [],
    latestGeneration: generationResult.data?.[0] ?? null,
    deliveryHistory: deliveryResult.data ?? [],
    latestDelivery: deliveryResult.data?.[0] ?? null,
    notifications: notificationResult.data ?? []
  };
}

export async function annotateOrdersWithPhase1State(orders: any[], checkedCapability?: Phase1SchemaCapability) {
  const db = createSupabaseServiceClient() as any;
  const capability = checkedCapability ?? await getPhase1SchemaCapability(db);
  if (capability.status !== 'available' || !orders.length) {
    return { capability, orders: withoutPhase1State(orders) };
  }
  const orderIds = orders.map((order) => order.id);
  const chunks = Array.from({ length: Math.ceil(orderIds.length / 200) }, (_, index) => orderIds.slice(index * 200, (index + 1) * 200));
  const results = await Promise.all(chunks.map(async (ids) => Promise.all([
    db.from('reports').select('id,order_id,status,storage_bucket,storage_path,storage_status,version_number,generated_at')
      .in('order_id', ids).order('version_number', { ascending: false }),
    db.from('manual_report_generation_attempts').select('order_id,status,safe_operational_error,created_at')
      .in('order_id', ids).order('created_at', { ascending: false }),
    // email_events(status) embeds the linked send's provider-reported outcome (via the
    // report_delivery_authorizations_email_event_id_fkey relationship) -- finalize_delivery()
    // only ever sets the authorization itself to 'finalized' at send time; a later bounce or
    // complaint webhook (apply_email_provider_event_atomic()) only ever updates email_events.
    // Without this join, a bounced/complained order would keep showing as 'delivered' forever.
    db.from('report_delivery_authorizations').select('order_id,status,authorised_at,email_events(status,provider_mode)')
      .in('order_id', ids).order('authorised_at', { ascending: false })
  ])));
  const queryError = results.flatMap((result) => result).find((result) => result.error)?.error;
  if (queryError) {
    console.error('phase1_order_annotations', { outcome: 'error', code: queryError.code ?? null });
    return {
      capability: { status: 'error', schemaVersion: '0023', message: PHASE1_SCHEMA_ERROR_MESSAGE } as Phase1SchemaCapability,
      orders: withoutPhase1State(orders)
    };
  }
  const reportRows = results.flatMap((result) => result[0].data ?? []);
  const generationRows = results.flatMap((result) => result[1].data ?? []);
  const deliveryRows = results.flatMap((result) => result[2].data ?? []);
  const reportByOrder = latestBy(reportRows.map((row: any) => ({ ...row, created_at: row.generated_at ?? '' })));
  const generationByOrder = latestBy(generationRows);
  const deliveryByOrder = latestBy(deliveryRows.map((row: any) => ({ ...row, created_at: row.authorised_at ?? '' })));

  const annotated = orders.map((order) => {
    const report: any = reportByOrder.get(order.id) ?? null;
    const generation: any = generationByOrder.get(order.id) ?? null;
    const delivery: any = deliveryByOrder.get(order.id) ?? null;
    const ready = Boolean(report?.storage_status === 'VERIFIED' && report?.storage_bucket && report?.storage_path && !['voided'].includes(report?.status));
    const generationState = generation?.status ?? (ready ? 'REPORT_READY' : 'NOT_REQUESTED');
    // A bounce/complaint always overrides the authorization's own status for display purposes --
    // a 'finalized' authorization only means the provider accepted the request, not that the
    // customer actually received it. See the query comment above for why this can't be read off
    // report_delivery_authorizations.status alone.
    const emailOutcome = delivery?.email_events?.status;
    const deliveryState = emailOutcome === 'bounced' || emailOutcome === 'complained' ? emailOutcome : (delivery?.status ?? 'NOT_READY');
    const generationStuck = ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(generationState)
      && Date.now() - new Date(generation?.created_at ?? 0).getTime() > 15 * 60 * 1_000;
    const deliveryStuck = DELIVERY_IN_FLIGHT_STATUSES.includes(deliveryState)
      && Date.now() - new Date(delivery?.created_at ?? 0).getTime() > 60 * 60 * 1_000;
    const queues = new Set<Phase1QueueKey>();
    if (order.status === 'awaiting_payment' || order.status === 'draft') queues.add('new_orders');
    if (order.status === 'payment_received' && !ready) queues.add('paid_no_report');
    if (generationState === 'REPORT_QUEUED') queues.add('generation_queued');
    if (generationState === 'REPORT_GENERATING') queues.add('generation_in_progress');
    if (generationState === 'GENERATION_FAILED') queues.add('generation_failed');
    if (ready) queues.add('report_ready');
    if (ready && deliveryState !== 'finalized') queues.add('ready_not_delivered');
    if (DELIVERY_IN_FLIGHT_STATUSES.includes(deliveryState)) queues.add('delivery_pending');
    if (DELIVERY_ATTENTION_STATUSES.includes(deliveryState)) queues.add('delivery_failed');
    if (deliveryState === 'finalized') queues.add('delivered');
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
      stuckReason: generationStuck ? 'Generation attempt is older than 15 minutes.' : deliveryStuck ? 'Delivery authorisation is older than 60 minutes.' : null,
      queues: [...queues]
    };
  });
  return { capability, orders: annotated };
}

export function queueCounts(orders: Array<{ queues: Phase1QueueKey[] }>) {
  return Object.fromEntries(
    (Object.keys(PHASE1_QUEUE_LABELS) as Phase1QueueKey[]).map((key) => [key, orders.filter((order) => order.queues.includes(key)).length])
  ) as Record<Phase1QueueKey, number>;
}

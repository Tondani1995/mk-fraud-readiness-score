import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData, ReportAssemblyError } from '../assemble-report-data';
import type {
  PremiumReportFulfilmentStatus,
  PremiumReportGenerationMode,
  PremiumReportTriggerSource
} from './types';

const ACTIVE_STATUSES: PremiumReportFulfilmentStatus[] = [
  'queued',
  'assembling',
  'generating',
  'validating',
  'rendering',
  'storing',
  'ready_for_delivery'
];

export type QueuePremiumReportFulfilmentResult =
  | { ok: true; created: boolean; fulfilment: any }
  | { ok: false; reason: string; message: string };

export function buildPremiumReportFulfilmentKey(orderId: string, scoreRunId: string) {
  return `premium-report:${orderId}:${scoreRunId}`;
}

export async function queuePremiumReportFulfilment(input: {
  orderReference: string;
  triggerSource: PremiumReportTriggerSource;
  requestedByAdminUserId?: string | null;
}): Promise<QueuePremiumReportFulfilmentResult> {
  let assembled;
  try {
    assembled = await assembleReportData(input.orderReference);
  } catch (error) {
    if (error instanceof ReportAssemblyError) {
      return { ok: false, reason: error.reason, message: error.message };
    }
    const message = error instanceof Error ? error.message : 'Report evidence could not be assembled.';
    return { ok: false, reason: 'assembly_failed', message };
  }

  if (assembled.productCode !== 'essential_self_assessment') {
    return {
      ok: false,
      reason: 'product_not_automated',
      message: 'Only the R5,000 Essential Self-Assessment Report may enter automated fulfilment.'
    };
  }

  const db = createSupabaseServiceClient() as any;
  const idempotencyKey = buildPremiumReportFulfilmentKey(assembled.orderId, assembled.scoreRun.id);

  const { data: existing, error: existingError } = await db
    .from('report_fulfilments')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingError) {
    return { ok: false, reason: 'fulfilment_store_unavailable', message: existingError.message };
  }
  if (existing) return { ok: true, created: false, fulfilment: existing };

  const { data: inserted, error: insertError } = await db
    .from('report_fulfilments')
    .insert({
      order_id: assembled.orderId,
      assessment_id: assembled.scoreRun.assessmentId,
      score_run_id: assembled.scoreRun.id,
      idempotency_key: idempotencyKey,
      trigger_source: input.triggerSource,
      status: 'queued',
      current_step: 'claim_fulfilment',
      requested_by_admin_user_id: input.requestedByAdminUserId ?? null
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    const { data: racedExisting } = await db
      .from('report_fulfilments')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (racedExisting) return { ok: true, created: false, fulfilment: racedExisting };
    return {
      ok: false,
      reason: 'fulfilment_create_failed',
      message: insertError?.message ?? 'Fulfilment could not be created.'
    };
  }

  await Promise.all([
    db.from('order_events').insert({
      order_id: assembled.orderId,
      event_type: 'premium_report_fulfilment_queued',
      note: 'Autonomous premium-report fulfilment queued.',
      actor_admin_user_id: input.requestedByAdminUserId ?? null,
      metadata_json: {
        fulfilment_id: inserted.id,
        trigger_source: input.triggerSource,
        idempotency_key: idempotencyKey,
        automatic_email_pending_phase14b: true
      }
    }),
    db.from('audit_logs').insert({
      actor_type: input.requestedByAdminUserId ? 'admin' : 'system',
      actor_user_id: input.requestedByAdminUserId ?? null,
      assessment_id: assembled.scoreRun.assessmentId,
      entity_table: 'report_fulfilments',
      entity_id: inserted.id,
      action: 'premium_report_fulfilment_queued',
      after_json: {
        order_reference: input.orderReference,
        trigger_source: input.triggerSource,
        score_run_id: assembled.scoreRun.id
      }
    })
  ]);

  return { ok: true, created: true, fulfilment: inserted };
}

export async function updatePremiumReportFulfilment(input: {
  fulfilmentId: string;
  status: PremiumReportFulfilmentStatus;
  currentStep: string;
  generationMode?: PremiumReportGenerationMode | null;
  reportId?: string | null;
  incrementAttempt?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const db = createSupabaseServiceClient() as any;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    current_step: input.currentStep,
    generation_mode: input.generationMode ?? null,
    report_id: input.reportId ?? null,
    last_error_code: input.errorCode ?? null,
    last_error_message: input.errorMessage ?? null,
    started_at: input.status === 'assembling' ? now : undefined,
    completed_at: input.status === 'completed' ? now : undefined,
    failed_at: input.status === 'failed' ? now : undefined
  };

  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  if (input.incrementAttempt) {
    const { data: current, error: currentError } = await db
      .from('report_fulfilments')
      .select('attempt_count')
      .eq('id', input.fulfilmentId)
      .single();
    if (currentError) throw currentError;
    patch.attempt_count = Number(current.attempt_count ?? 0) + 1;
  }

  const { data, error } = await db
    .from('report_fulfilments')
    .update(patch)
    .eq('id', input.fulfilmentId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getActivePremiumReportFulfilment(orderId: string) {
  const db = createSupabaseServiceClient() as any;
  const { data, error } = await db
    .from('report_fulfilments')
    .select('*')
    .eq('order_id', orderId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

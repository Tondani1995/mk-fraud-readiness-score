import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData, ReportAssemblyError } from '../assemble-report-data';
import { ReportEntitlementError, validatePremiumReportGenerationEntitlement } from '../report-entitlement';
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

const REUSE_READ_DELAYS_MS = [0, 75, 150, 300, 600];

export type QueuePremiumReportFulfilmentResult =
  | {
      ok: true;
      created: boolean;
      fulfilment: any;
      context: {
        orderId: string;
        assessmentId: string;
        scoreRunId: string;
        recipient: string;
      };
    }
  | { ok: false; reason: string; message: string };

export function buildPremiumReportFulfilmentKey(orderId: string, scoreRunId: string) {
  return `premium-report:${orderId}:${scoreRunId}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findReusableFulfilment(input: {
  db: any;
  idempotencyKey: string;
  orderId: string;
}) {
  let lastError: Error | null = null;

  for (const waitMs of REUSE_READ_DELAYS_MS) {
    if (waitMs > 0) await delay(waitMs);

    const { data: keyed, error: keyedError } = await input.db
      .from('report_fulfilments')
      .select('*')
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();

    if (keyed) return keyed;
    if (keyedError) lastError = new Error(keyedError.message);

    const { data: active, error: activeError } = await input.db
      .from('report_fulfilments')
      .select('*')
      .eq('order_id', input.orderId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active?.idempotency_key === input.idempotencyKey) return active;
    if (activeError) lastError = new Error(activeError.message);
  }

  if (lastError) throw lastError;
  return null;
}

export async function queuePremiumReportFulfilment(input: {
  orderReference: string;
  triggerSource: PremiumReportTriggerSource;
  requestedByAdminUserId?: string | null;
}): Promise<QueuePremiumReportFulfilmentResult> {
  let assembled;
  try {
    assembled = await assembleReportData(input.orderReference);
    validatePremiumReportGenerationEntitlement(assembled);
  } catch (error) {
    if (error instanceof ReportAssemblyError || error instanceof ReportEntitlementError) {
      return { ok: false, reason: error.reason, message: error.message };
    }
    const message = error instanceof Error ? error.message : 'Report evidence could not be assembled.';
    return { ok: false, reason: 'assembly_failed', message };
  }

  const db = createSupabaseServiceClient() as any;
  const idempotencyKey = buildPremiumReportFulfilmentKey(assembled.orderId, assembled.scoreRun.id);

  try {
    const existing = await findReusableFulfilment({
      db,
      idempotencyKey,
      orderId: assembled.orderId
    });
    if (existing) return {
      ok: true,
      created: false,
      fulfilment: existing,
      context: {
        orderId: assembled.orderId,
        assessmentId: assembled.assessmentId,
        scoreRunId: assembled.scoreRun.id,
        recipient: assembled.customerEmail
      }
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'fulfilment_store_unavailable',
      message: error instanceof Error ? error.message : 'Fulfilment lookup failed.'
    };
  }

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
    try {
      const racedExisting = await findReusableFulfilment({
        db,
        idempotencyKey,
        orderId: assembled.orderId
      });
      if (racedExisting) {
        return {
          ok: true,
          created: false,
          fulfilment: racedExisting,
          context: {
            orderId: assembled.orderId,
            assessmentId: assembled.assessmentId,
            scoreRunId: assembled.scoreRun.id,
            recipient: assembled.customerEmail
          }
        };
      }
    } catch (reuseError) {
      return {
        ok: false,
        reason: 'fulfilment_store_unavailable',
        message: reuseError instanceof Error ? reuseError.message : 'Fulfilment reuse lookup failed.'
      };
    }

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

  return {
    ok: true,
    created: true,
    fulfilment: inserted,
    context: {
      orderId: assembled.orderId,
      assessmentId: assembled.assessmentId,
      scoreRunId: assembled.scoreRun.id,
      recipient: assembled.customerEmail
    }
  };
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
    current_step: input.currentStep
  };

  if ('generationMode' in input) patch.generation_mode = input.generationMode ?? null;
  if ('reportId' in input) patch.report_id = input.reportId ?? null;
  if ('errorCode' in input) patch.last_error_code = input.errorCode ?? null;
  if ('errorMessage' in input) patch.last_error_message = input.errorMessage ?? null;
  if (input.status === 'assembling') patch.started_at = now;
  if (input.status === 'completed') patch.completed_at = now;
  if (input.status === 'failed') patch.failed_at = now;

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

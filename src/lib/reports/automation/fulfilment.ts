import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createPhase14PrivilegedClient } from '../phase14-security';
import { executePhase14WorkerStep, type Phase14WorkerLease } from '../phase14-security';
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

  const db = createPhase14PrivilegedClient();
  const { data, error } = await db.rpc('queue_premium_report_fulfilment', {
    p_order_reference: input.orderReference,
    p_trigger_source: input.triggerSource
  });
  if (error || !data) return {
    ok: false,
    reason: 'fulfilment_create_failed',
    message: error?.message ?? 'Fulfilment could not be queued.'
  };
  return {
    ok: true,
    created: Boolean(data.created),
    fulfilment: data.fulfilment,
    context: {
      orderId: data.context.order_id,
      assessmentId: data.context.assessment_id,
      scoreRunId: data.context.score_run_id,
      recipient: data.context.recipient
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
  workerLease?: Phase14WorkerLease;
}) {
  const db = input.workerLease
    ? createSupabaseServiceClient() as any
    : createPhase14PrivilegedClient();
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

  if (input.incrementAttempt && !input.workerLease) {
    const { data: current, error: currentError } = await db
      .from('report_fulfilments')
      .select('attempt_count')
      .eq('id', input.fulfilmentId)
      .single();
    if (currentError) throw currentError;
    patch.attempt_count = Number(current.attempt_count ?? 0) + 1;
  }

  if (input.workerLease) {
    return executePhase14WorkerStep(input.workerLease, 'transition_premium_report_fulfilment', {
      fulfilment_id: input.fulfilmentId,
      status: input.status,
      current_step: input.currentStep,
      generation_mode: input.generationMode ?? null,
      report_id: input.reportId ?? null,
      increment_attempt: input.incrementAttempt ?? false,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null
    });
  }
  const { data, error } = await db.rpc('transition_premium_report_fulfilment', {
    p_capability_id: null,
    p_fulfilment_id: input.fulfilmentId,
    p_status: input.status,
    p_current_step: input.currentStep,
    p_generation_mode: input.generationMode ?? null,
    p_report_id: input.reportId ?? null,
    p_increment_attempt: input.incrementAttempt ?? false,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null
  });
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

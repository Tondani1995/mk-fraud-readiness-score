import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPhase1SchemaCapability, PHASE1_SCHEMA_UNAVAILABLE_MESSAGE } from './phase1-schema-capability';

export class Phase1DeliveryError extends Error {
  constructor(
    public readonly reason: string,
    message: string,
    public readonly status: number,
    public readonly technicalReference: string
  ) {
    super(message);
    this.name = 'Phase1DeliveryError';
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown delivery error');
}

function providerMode(): 'disabled' | 'double' {
  return process.env.PHASE1_DELIVERY_MODE === 'double' ? 'double' : 'disabled';
}

function mapDeliveryError(error: unknown, technicalReference: string) {
  const message = messageOf(error);
  if (message.includes('permission_denied')) return new Phase1DeliveryError('permission_denied', 'You are not authorised to deliver reports.', 403, technicalReference);
  if (message.includes('report_record_missing')) return new Phase1DeliveryError('report_record_missing', 'The report record does not exist.', 404, technicalReference);
  if (message.includes('report_order_mismatch')) return new Phase1DeliveryError('report_order_mismatch', 'The report does not belong to this order.', 409, technicalReference);
  if (message.includes('report_not_ready')) return new Phase1DeliveryError('report_not_ready', 'Delivery requires a verified ready report.', 409, technicalReference);
  if (message.includes('recipient_missing')) return new Phase1DeliveryError('recipient_missing', 'The order does not have a delivery email address.', 409, technicalReference);
  if (/claim_manual_report_delivery|manual_report_delivery_attempts|function .* does not exist|schema cache/i.test(message)) {
    return new Phase1DeliveryError('phase1_schema_unavailable', PHASE1_SCHEMA_UNAVAILABLE_MESSAGE, 503, technicalReference);
  }
  return new Phase1DeliveryError('delivery_failed', 'The delivery request failed. Retry using the technical reference.', 500, technicalReference);
}

export async function deliverPhase1Report(input: {
  reportId: string;
  orderReference: string;
  requestedBy: string;
  requestKey: string;
}) {
  const technicalReference = crypto.randomUUID();
  const mode = providerMode();
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    throw new Phase1DeliveryError('phase1_schema_unavailable', capability.message!, 503, technicalReference);
  }
  const { data: report, error: reportError } = await db.from('reports')
    .select('id,order_id,storage_bucket,storage_path,storage_status,checksum,file_size_bytes')
    .eq('id', input.reportId).maybeSingle();
  if (reportError || !report) throw new Phase1DeliveryError('report_record_missing', 'The report record does not exist.', 404, technicalReference);
  if (report.storage_status !== 'VERIFIED' || !report.storage_bucket || !report.storage_path || !report.checksum) {
    throw new Phase1DeliveryError('report_not_ready', 'Delivery requires a verified ready report.', 409, technicalReference);
  }
  const { data: object, error: objectError } = await db.storage.from(report.storage_bucket).download(report.storage_path);
  if (objectError || !object) {
    const { error: stateError } = await db.from('reports').update({ storage_status: 'MISSING' }).eq('id', report.id);
    if (stateError) console.error('phase1_delivery_storage_state', { technicalReference, reportId: report.id, state: 'MISSING', errorCategory: 'state_update_failed' });
    throw new Phase1DeliveryError('stored_file_missing', 'The report record exists, but the stored PDF is missing.', 404, technicalReference);
  }
  const bytes = Buffer.from(await object.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!bytes.length || checksum !== report.checksum || (report.file_size_bytes && bytes.length !== Number(report.file_size_bytes))) {
    throw new Phase1DeliveryError('integrity_failed', 'The stored PDF failed its integrity check.', 409, technicalReference);
  }

  const { data: claim, error: claimError } = await db.rpc('claim_manual_report_delivery', {
    p_report_id: input.reportId,
    p_order_reference: input.orderReference,
    p_requested_by: input.requestedBy,
    p_request_key: input.requestKey.trim().slice(0, 200),
    p_provider_mode: mode,
    p_technical_reference: technicalReference
  });
  if (claimError || !claim) throw mapDeliveryError(claimError ?? new Error('Empty delivery claim response.'), technicalReference);
  if (!claim.claimed) {
    if (claim.reason === 'already_active') {
      throw new Phase1DeliveryError('delivery_already_active', 'Report delivery is already in progress for this report.', 409, technicalReference);
    }
    if (claim.reason === 'idempotent_replay') {
      return {
        attemptId: claim.attempt.id,
        status: claim.attempt.status,
        reusedExistingAttempt: true,
        message: `This delivery request is already ${String(claim.attempt.status).toLowerCase().replace(/_/g, ' ')}.`,
        technicalReference
      };
    }
    if (claim.reason === 'already_delivered') {
      return {
        attemptId: claim.attempt.id,
        status: 'DELIVERED',
        reusedExistingAttempt: true,
        message: 'This report already has a successful delivery record. No duplicate delivery was created.',
        technicalReference
      };
    }
  }

  const attemptId = String(claim.attempt.id);
  if (mode === 'disabled') {
    console.info('phase1_manual_delivery', {
      requestId: claim.attempt.request_id,
      technicalReference,
      orderId: claim.attempt.order_id,
      reportId: input.reportId,
      attemptId,
      status: 'DELIVERY_PENDING',
      providerMode: 'disabled',
      providerSendAttempted: false
    });
    return {
      attemptId,
      status: 'DELIVERY_PENDING',
      message: 'Delivery request recorded. Provider delivery is explicitly disabled; no email was sent.',
      technicalReference
    };
  }

  const shouldFail = process.env.PHASE1_DELIVERY_DOUBLE_RESULT === 'failure';
  const terminalStatus = shouldFail ? 'DELIVERY_FAILED' : 'DELIVERED';
  const { data: completed, error: completeError } = await db.rpc('complete_manual_report_delivery', {
    p_attempt_id: attemptId,
    p_status: terminalStatus,
    p_error_category: shouldFail ? 'provider_double_failure' : null,
    p_safe_message: shouldFail ? 'The delivery provider double returned a controlled failure.' : null
  });
  if (completeError || !completed?.attempt) throw mapDeliveryError(completeError ?? new Error('Delivery completion returned no result.'), technicalReference);
  console.info('phase1_manual_delivery', {
    requestId: claim.attempt.request_id,
    technicalReference,
    orderId: claim.attempt.order_id,
    reportId: input.reportId,
    attemptId,
    status: terminalStatus,
    providerMode: 'double',
    providerSendAttempted: false,
    retryCount: claim.attempt.retry_count
  });
  if (shouldFail) {
    throw new Phase1DeliveryError('delivery_failed', 'The delivery provider double returned a controlled failure.', 502, technicalReference);
  }
  return {
    attemptId,
    status: 'DELIVERED',
    message: 'The provider double recorded a successful delivery. No real email was sent.',
    technicalReference
  };
}

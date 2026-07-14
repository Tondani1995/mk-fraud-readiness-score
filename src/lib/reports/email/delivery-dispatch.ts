import crypto from 'node:crypto';
import type { ReportEmailTransport } from './resend-transport';
import type { Phase14WorkerLease } from '../phase14-security';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type DeliveryDispatchClaim = {
  authorization_id: string;
  lease_token: string;
  email_event_id: string;
  report_checksum: string;
};

export async function executeClaimedReportDelivery(input: {
  db: any;
  rpcDb: any;
  workerLease?: Phase14WorkerLease;
  report: { id: string; storage_bucket: string; storage_path: string; checksum: string };
  claim: DeliveryDispatchClaim;
  transport: ReportEmailTransport;
  transportInput: Parameters<ReportEmailTransport>[0];
}) {
  let dispatchStarted = false;
  let providerMessageId: string | null = null;
  try {
    const { data: pdf, error: downloadError } = await input.db.storage
      .from(input.report.storage_bucket)
      .download(input.report.storage_path);
    if (downloadError || !pdf) {
      throw new Error(`Report attachment download failed: ${downloadError?.message ?? 'object missing'}`);
    }
    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    if (!pdfBuffer.length || pdfBuffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error('Report attachment size is invalid for email.');
    }
    const actualChecksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    if (actualChecksum !== input.claim.report_checksum || actualChecksum !== input.report.checksum) {
      const { error: alertError } = await input.db.from('phase14_operational_alerts').upsert({
        alert_key: `email-checksum-mismatch:${input.report.id}:${input.claim.report_checksum}`,
        severity: 'critical',
        category: 'report_email_checksum_mismatch',
        report_id: input.report.id,
        email_event_id: input.claim.email_event_id,
        detail_json: { expected_checksum: input.claim.report_checksum, actual_checksum: actualChecksum }
      }, { onConflict: 'alert_key', ignoreDuplicates: true });
      if (alertError) {
        throw new AggregateError(
          [new Error('Report attachment checksum mismatch.'), alertError],
          'Report checksum alert could not be persisted.'
        );
      }
      throw new Error('Report attachment checksum mismatch.');
    }

    const { error: boundaryError } = await input.rpcDb.rpc(
      input.workerLease
        ? 'worker_mark_premium_report_delivery_dispatch_started'
        : 'mark_premium_report_delivery_dispatch_started',
      input.workerLease
        ? {
            p_capability_id: input.workerLease.capabilityId,
            p_capability_lease_token: input.workerLease.leaseToken,
            p_authorization_id: input.claim.authorization_id,
            p_delivery_lease_token: input.claim.lease_token
          }
        : {
            p_authorization_id: input.claim.authorization_id,
            p_lease_token: input.claim.lease_token
          }
    );
    if (boundaryError) throw boundaryError;
    dispatchStarted = true;

    const provider = await input.transport({
      ...input.transportInput,
      attachment: {
        ...input.transportInput.attachment,
        contentBase64: pdfBuffer.toString('base64')
      }
    });
    providerMessageId = provider.messageId;
    const { data: finalized, error: finalizationError } = await input.rpcDb.rpc(
      input.workerLease
        ? 'worker_finalize_premium_report_delivery'
        : 'finalize_premium_report_delivery',
      input.workerLease
        ? {
            p_capability_id: input.workerLease.capabilityId,
            p_capability_lease_token: input.workerLease.leaseToken,
            p_authorization_id: input.claim.authorization_id,
            p_email_event_id: input.claim.email_event_id,
            p_provider_message_id: provider.messageId
          }
        : {
            p_authorization_id: input.claim.authorization_id,
            p_email_event_id: input.claim.email_event_id,
            p_provider_message_id: provider.messageId
          }
    );
    if (finalizationError || !finalized || finalized.finalized !== true) {
      await markReconciliationRequired(
        input.rpcDb,
        input.claim.authorization_id,
        provider.messageId,
        `Provider accepted the request but atomic finalization failed: ${finalizationError?.message ?? finalized?.reason ?? 'no result'}`,
        input.workerLease
      );
      throw new Error('Provider acceptance is durable but delivery finalization requires reconciliation.');
    }
    return { providerMessageId, finalized };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dispatchStarted) {
      const { error: failureStateError } = await input.rpcDb.rpc(
        input.workerLease
          ? 'worker_fail_premium_report_delivery_before_dispatch'
          : 'fail_premium_report_delivery_before_dispatch',
        input.workerLease
          ? {
              p_capability_id: input.workerLease.capabilityId,
              p_capability_lease_token: input.workerLease.leaseToken,
              p_authorization_id: input.claim.authorization_id,
              p_delivery_lease_token: input.claim.lease_token,
              p_reason: message
            }
          : {
              p_authorization_id: input.claim.authorization_id,
              p_lease_token: input.claim.lease_token,
              p_reason: message
            }
      );
      if (failureStateError) {
        throw new AggregateError([error, failureStateError], 'Delivery failure state could not be persisted.');
      }
    } else if (!providerMessageId) {
      await markReconciliationRequired(
        input.rpcDb,
        input.claim.authorization_id,
        null,
        message,
        input.workerLease
      );
    }
    throw error;
  }
}

export async function markReconciliationRequired(
  db: any,
  authorizationId: string,
  providerMessageId: string | null,
  reason: string,
  workerLease?: Phase14WorkerLease
) {
  const { error } = await db.rpc(
    workerLease
      ? 'worker_mark_premium_report_delivery_reconciliation_required'
      : 'mark_premium_report_delivery_reconciliation_required',
    workerLease
      ? {
          p_capability_id: workerLease.capabilityId,
          p_capability_lease_token: workerLease.leaseToken,
          p_authorization_id: authorizationId,
          p_provider_message_id: providerMessageId,
          p_reason: reason
        }
      : {
          p_authorization_id: authorizationId,
          p_provider_message_id: providerMessageId,
          p_reason: reason
        }
  );
  if (error) throw new Error(`Delivery reconciliation state could not be persisted: ${error.message}`);
}

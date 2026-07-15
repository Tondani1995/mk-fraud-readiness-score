import crypto from 'node:crypto';
import type { ReportEmailTransport } from './resend-transport';
import type { Phase14WorkerLease } from '../phase14-security';
import { executePhase14WorkerStep } from '../phase14-security';

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
      const { error: alertError } = await input.db.rpc('record_phase14_operational_alert', {
        p_alert_key: `email-checksum-mismatch:${input.report.id}:${input.claim.report_checksum}`,
        p_severity: 'critical', p_category: 'report_email_checksum_mismatch',
        p_report_id: input.report.id, p_email_event_id: input.claim.email_event_id,
        p_detail_json: { expected_checksum: input.claim.report_checksum, actual_checksum: actualChecksum }
      });
      if (alertError) {
        throw new AggregateError(
          [new Error('Report attachment checksum mismatch.'), alertError],
          'Report checksum alert could not be persisted.'
        );
      }
      throw new Error('Report attachment checksum mismatch.');
    }

    const { error: boundaryError } = input.workerLease
      ? await (async () => {
          try {
            await executePhase14WorkerStep(
              input.workerLease!,
              'worker_mark_premium_report_delivery_dispatch_started',
              {
                authorization_id: input.claim.authorization_id,
                delivery_lease_token: input.claim.lease_token
              }
            );
            return { error: null };
          } catch (caught) {
            return { error: caught };
          }
        })()
      : await input.rpcDb.rpc('mark_premium_report_delivery_dispatch_started', {
            p_authorization_id: input.claim.authorization_id,
            p_lease_token: input.claim.lease_token
          });
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
    const { data: finalized, error: finalizationError } = input.workerLease
      ? await (async () => {
          try {
            return {
              data: await executePhase14WorkerStep(
                input.workerLease!,
                'worker_finalize_premium_report_delivery',
                {
                  authorization_id: input.claim.authorization_id,
                  email_event_id: input.claim.email_event_id,
                  provider_message_id: provider.messageId
                }
              ),
              error: null
            };
          } catch (caught) {
            return { data: null, error: caught };
          }
        })()
      : await input.rpcDb.rpc('finalize_premium_report_delivery', {
            p_authorization_id: input.claim.authorization_id,
            p_email_event_id: input.claim.email_event_id,
            p_provider_message_id: provider.messageId
          });
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
      const { error: failureStateError } = input.workerLease
        ? await (async () => {
            try {
              await executePhase14WorkerStep(
                input.workerLease!,
                'worker_fail_premium_report_delivery_before_dispatch',
                {
                  authorization_id: input.claim.authorization_id,
                  delivery_lease_token: input.claim.lease_token,
                  reason: message
                }
              );
              return { error: null };
            } catch (caught) {
              return { error: caught };
            }
          })()
        : await input.rpcDb.rpc('fail_premium_report_delivery_before_dispatch', {
              p_authorization_id: input.claim.authorization_id,
              p_lease_token: input.claim.lease_token,
              p_reason: message
            });
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
  const { error } = workerLease
    ? await (async () => {
        try {
          await executePhase14WorkerStep(
            workerLease,
            'worker_mark_premium_report_delivery_reconciliation_required',
            { authorization_id: authorizationId, provider_message_id: providerMessageId, reason }
          );
          return { error: null };
        } catch (caught) {
          return { error: caught };
        }
      })()
    : await db.rpc('mark_premium_report_delivery_reconciliation_required', {
          p_authorization_id: authorizationId,
          p_provider_message_id: providerMessageId,
          p_reason: reason
        });
  if (error) throw new Error(`Delivery reconciliation state could not be persisted: ${error.message}`);
}

import crypto from 'node:crypto';
import type { ReportEmailTransport } from './resend-transport';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type DeliveryDispatchClaim = {
  authorization_id: string;
  lease_token: string;
  email_event_id: string;
  report_checksum: string;
};

export async function executeClaimedReportDelivery(input: {
  db: any;
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
      await input.db.from('phase14_operational_alerts').upsert({
        alert_key: `email-checksum-mismatch:${input.report.id}:${input.claim.report_checksum}`,
        severity: 'critical',
        category: 'report_email_checksum_mismatch',
        report_id: input.report.id,
        email_event_id: input.claim.email_event_id,
        detail_json: { expected_checksum: input.claim.report_checksum, actual_checksum: actualChecksum }
      }, { onConflict: 'alert_key', ignoreDuplicates: true }).catch(() => null);
      throw new Error('Report attachment checksum mismatch.');
    }

    const { error: boundaryError } = await input.db.rpc('mark_premium_report_delivery_dispatch_started', {
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
    const { data: finalized, error: finalizationError } = await input.db.rpc(
      'finalize_premium_report_delivery',
      {
        p_authorization_id: input.claim.authorization_id,
        p_email_event_id: input.claim.email_event_id,
        p_provider_message_id: provider.messageId
      }
    );
    if (finalizationError || !finalized) {
      await markReconciliationRequired(
        input.db,
        input.claim.authorization_id,
        provider.messageId,
        `Provider accepted the request but atomic finalization failed: ${finalizationError?.message ?? 'no result'}`
      );
      throw new Error('Provider acceptance is durable but delivery finalization requires reconciliation.');
    }
    return { providerMessageId, finalized };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dispatchStarted) {
      await input.db.rpc('fail_premium_report_delivery_before_dispatch', {
        p_authorization_id: input.claim.authorization_id,
        p_lease_token: input.claim.lease_token,
        p_reason: message
      }).catch(() => null);
    } else if (!providerMessageId) {
      await markReconciliationRequired(input.db, input.claim.authorization_id, null, message);
    }
    throw error;
  }
}

export async function markReconciliationRequired(
  db: any,
  authorizationId: string,
  providerMessageId: string | null,
  reason: string
) {
  const { error } = await db.rpc('mark_premium_report_delivery_reconciliation_required', {
    p_authorization_id: authorizationId,
    p_provider_message_id: providerMessageId,
    p_reason: reason
  });
  if (error) throw new Error(`Delivery reconciliation state could not be persisted: ${error.message}`);
}

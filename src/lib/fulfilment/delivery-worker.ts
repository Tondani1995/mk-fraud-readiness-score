import crypto from 'node:crypto';
import { getNumberEnv } from '@/lib/env/server';
import { sendEmail } from '@/lib/notifications/email-provider';
import { buildReportReadyMessage } from '@/lib/notifications/message-templates';
import { recordAutomaticFulfilmentExceptionAlert } from '@/lib/notifications/phase1-order-notifications';

const DEFAULT_LEASE_SECONDS = 300;

type ClaimedAuthorization = {
  id: string;
  report_id: string;
  order_id: string;
  recipient_email: string;
  email_event_id: string;
  lease_token: string;
};

export type DeliveryWorkerResult =
  | { claimed: false; outcome: 'not_claimed' }
  | {
      claimed: true;
      authorizationId: string;
      outcome: 'delivered';
      mode: 'disabled' | 'test' | 'live';
    }
  | {
      claimed: true;
      authorizationId: string;
      outcome: 'retry_scheduled' | 'failed_terminal' | 'reconciliation_required';
    }
  | {
      claimed: false;
      outcome: 'claim_failed';
      errorCode: string | null;
    };

class DeliveryProcessingError extends Error {
  constructor(readonly category: string, readonly safeMessage: string) {
    super(category);
  }
}

async function recordAndNotifyException(db: any, input: {
  authorization: ClaimedAuthorization;
  category: string;
  stage: string;
  technicalReference: string;
  requiredAction: string;
}) {
  const { data, error } = await db.rpc('record_automatic_fulfilment_exception', {
    p_attempt_id: null,
    p_authorization_id: input.authorization.id,
    p_stage: input.stage,
    p_category: input.category,
    p_technical_reference: input.technicalReference,
    p_required_action: input.requiredAction
  });
  if (error || !data?.order_id) {
    console.error('delivery_worker', {
      outcome: 'exception_evidence_failed',
      authorizationId: input.authorization.id,
      errorCategory: 'exception_evidence_persistence_failed'
    });
    return;
  }
  await recordAutomaticFulfilmentExceptionAlert({
    orderId: data.order_id,
    reportId: data.report_id ?? input.authorization.report_id,
    attemptId: null,
    authorizationId: input.authorization.id,
    category: input.category,
    stage: input.stage,
    technicalReference: input.technicalReference,
    requiredAction: input.requiredAction
  }).catch(() => {
    console.error('delivery_worker', {
      outcome: 'exception_notification_failed',
      authorizationId: input.authorization.id,
      errorCategory: 'exception_notification_failed'
    });
  });
}

export async function processOneDelivery(db: any, options: {
  authorizationId?: string;
  expectedOrderId?: string;
  leaseSeconds?: number;
} = {}): Promise<DeliveryWorkerResult> {
  const leaseOwner = `delivery-worker:${crypto.randomUUID()}`;
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const exact = Boolean(options.authorizationId);
  if (exact && !options.expectedOrderId) {
    return { claimed: false, outcome: 'claim_failed', errorCode: 'exact_order_required' };
  }

  const claim = exact
    ? db.rpc('claim_exact_delivery', {
        p_authorization_id: options.authorizationId,
        p_expected_order_id: options.expectedOrderId,
        p_lease_owner: leaseOwner,
        p_lease_seconds: leaseSeconds
      })
    : db.rpc('claim_next_delivery', {
        p_lease_owner: leaseOwner,
        p_lease_seconds: leaseSeconds
      });
  const { data: claimed, error: claimError } = await claim;
  if (claimError) {
    console.error('delivery_worker', {
      outcome: 'claim_failed',
      claimMode: exact ? 'exact' : 'scheduled',
      errorCode: claimError.code ?? null
    });
    return {
      claimed: false,
      outcome: 'claim_failed',
      errorCode: claimError.code ?? null
    };
  }
  const authorization = claimed as ClaimedAuthorization | null;
  if (!authorization) return { claimed: false, outcome: 'not_claimed' };

  const technicalReference = crypto.randomUUID();
  let providerAccepted = false;
  let providerMessageId: string | null = null;
  try {
    const { data: report, error: reportError } = await db
      .from('reports')
      .select('id,report_reference,order_id')
      .eq('id', authorization.report_id)
      .maybeSingle();
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('order_reference,customer_name')
      .eq('id', authorization.order_id)
      .maybeSingle();
    if (reportError || !report || orderError || !order) {
      throw new DeliveryProcessingError(
        'delivery_binding_lookup_failed',
        'The report delivery binding could not be verified.'
      );
    }

    const ttlSeconds = getNumberEnv(
      'CUSTOMER_REPORT_ACCESS_TOKEN_TTL_SECONDS',
      7 * 24 * 60 * 60
    );
    const { data: tokenResult, error: tokenError } = await db.rpc(
      'issue_customer_report_access_token',
      {
        p_order_id: authorization.order_id,
        p_report_id: authorization.report_id,
        p_recipient_email: authorization.recipient_email,
        p_ttl_seconds: ttlSeconds
      }
    );
    if (tokenError || !tokenResult?.token) {
      throw new DeliveryProcessingError(
        'delivery_access_token_issuance_failed',
        'A secure customer-access token could not be issued.'
      );
    }

    const { error: dispatchError } = await db.rpc(
      'mark_delivery_dispatch_started',
      {
        p_authorization_id: authorization.id,
        p_lease_token: authorization.lease_token
      }
    );
    if (dispatchError) {
      throw new DeliveryProcessingError(
        'delivery_dispatch_mark_failed',
        'The delivery provider request could not be started safely.'
      );
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://mkfraud.co.za'
    ).replace(/\/$/, '');
    const accessUrl =
      `${appUrl}/score/report/access/${encodeURIComponent(tokenResult.token)}`;
    const message = buildReportReadyMessage({
      customerName: order.customer_name ?? null,
      orderReference: order.order_reference,
      accessUrl,
      expiresAtIso: tokenResult.expires_at
    });

    const fromAddress =
      process.env.MK_REPORT_EMAIL_FROM?.trim()
      || 'MK Fraud Insights <hello@mkfraud.co.za>';
    const replyTo = process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || null;
    const sendResult = await sendEmail({
      audience: 'customer_report_ready',
      from: fromAddress,
      to: authorization.recipient_email,
      replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text,
      idempotencyKey: authorization.email_event_id
    });
    if (!sendResult.ok) {
      throw new DeliveryProcessingError(
        'provider_send_failed',
        'The report-ready email provider request failed.'
      );
    }
    providerAccepted = true;
    providerMessageId =
      sendResult.providerMessageId ?? `disabled:${technicalReference}`;

    const { error: finalizeError } = await db.rpc('finalize_delivery', {
      p_authorization_id: authorization.id,
      p_lease_token: authorization.lease_token,
      p_provider_message_id: providerMessageId,
      p_provider_mode: sendResult.mode,
      p_test_delivery: sendResult.mode === 'test'
    });
    if (finalizeError) {
      const { error: reconcileError } = await db.rpc(
        'mark_delivery_reconciliation_required',
        {
          p_authorization_id: authorization.id,
          p_lease_token: authorization.lease_token,
          p_provider_message_id: providerMessageId,
          p_technical_reference: technicalReference
        }
      );
      if (reconcileError) {
        console.error('delivery_worker', {
          outcome: 'reconciliation_persistence_failed',
          authorizationId: authorization.id,
          technicalReference,
          errorCategory: 'delivery_reconciliation_persistence_failed'
        });
      }
      await recordAndNotifyException(db, {
        authorization,
        category: 'delivery_reconciliation_required',
        stage: 'delivery_finalization',
        technicalReference,
        requiredAction:
          'Reconcile provider acceptance before any retry or resend.'
      });
      return {
        claimed: true,
        authorizationId: authorization.id,
        outcome: 'reconciliation_required'
      };
    }

    console.info('delivery_worker', {
      outcome: 'delivered',
      authorizationId: authorization.id,
      mode: sendResult.mode
    });
    return {
      claimed: true,
      authorizationId: authorization.id,
      outcome: 'delivered',
      mode: sendResult.mode
    };
  } catch (error) {
    const mapped = error instanceof DeliveryProcessingError
      ? error
      : new DeliveryProcessingError(
          'delivery_processing_failed',
          'Report delivery failed. The delivery worker will retry automatically.'
        );
    console.error('delivery_worker', {
      outcome: 'delivery_failed',
      authorizationId: authorization.id,
      technicalReference,
      errorCategory: mapped.category,
      providerAccepted
    });

    if (providerAccepted && providerMessageId) {
      return {
        claimed: true,
        authorizationId: authorization.id,
        outcome: 'reconciliation_required'
      };
    }

    const { data: failed, error: failError } = await db.rpc('fail_delivery', {
      p_authorization_id: authorization.id,
      p_lease_token: authorization.lease_token,
      p_error_category: mapped.category,
      p_safe_operational_error: mapped.safeMessage,
      p_technical_reference: technicalReference
    });
    if (failError) {
      console.error('delivery_worker', {
        outcome: 'fail_persistence_failed',
        authorizationId: authorization.id,
        errorCategory: 'delivery_failure_persistence_failed'
      });
    }
    const outcome = failed?.status === 'failed_terminal'
      ? 'failed_terminal'
      : 'retry_scheduled';
    if (outcome === 'failed_terminal') {
      await recordAndNotifyException(db, {
        authorization,
        category: mapped.category,
        stage: 'delivery_provider_dispatch',
        technicalReference,
        requiredAction:
          'Review the terminal delivery failure and choose an authorised retry or recipient correction.'
      });
    }
    return {
      claimed: true,
      authorizationId: authorization.id,
      outcome
    };
  }
}

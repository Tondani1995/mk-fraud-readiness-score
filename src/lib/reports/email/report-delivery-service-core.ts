import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPremiumReportAutomationFlags } from '../automation/feature-flags';
import {
  requirePhase14Action,
  requirePhase14WorkerAction,
  type Phase14WorkerLease
} from '../phase14-security';
import {
  reconcileReportEmailWithResend,
  sendReportEmailWithResend,
  type ReportEmailReconciler,
  type ReportEmailTransport
} from './resend-transport';
import { executeClaimedReportDelivery, markReconciliationRequired } from './delivery-dispatch';

export type ReportDeliveryActor = {
  actorType: 'system' | 'admin';
  userId?: string | null;
  action: 'automatic_email' | 'admin_send' | 'admin_resend';
};

export type DeliverPremiumReportEmailInput = {
  reportId: string;
  actor: ReportDeliveryActor;
  bounceRetry?: { remediationId: string };
  recipientOverride?: string | null;
  allowNonProductionTestOverride?: boolean;
  workerLease?: Phase14WorkerLease;
  transport?: ReportEmailTransport;
};

export type DeliverPremiumReportEmailResult = {
  emailEventId: string;
  providerMessageId: string | null;
  recipient: string;
  reusedExistingSend: boolean;
  status: string;
  testDelivery: boolean;
};

type DeliveryAuthorization = {
  reused_existing_send: boolean;
  authorization_id?: string;
  email_event_id: string;
  provider_message_id?: string | null;
  provider_request_key?: string;
  recipient: string;
  status: string;
  test_delivery: boolean;
};

type ClaimedDelivery = {
  claimed: boolean;
  authorization_id: string;
  lease_token: string;
  email_event_id: string;
  report_id: string;
  recipient: string;
  provider: string;
  test_delivery: boolean;
  report_checksum: string;
  status?: string;
  reason?: string;
};

function email(value: unknown) {
  const normalised = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised) ? normalised : null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function messageCopy(reportReference: string, customerName: string | null, organisationName: string | null) {
  const name = customerName?.trim() || 'there';
  const organisation = organisationName?.trim() ? ` for ${organisationName.trim()}` : '';
  const disclaimer = 'This report reflects the submitted assessment and deterministic MK Fraud Readiness methodology. It is not a certification, guarantee or legal conclusion.';
  return {
    subject: `Your MK Fraud Readiness Report${organisation}`,
    text: `Hi ${name},\n\nYour premium report (${reportReference}) is attached.\n\n${disclaimer}\n\nRegards,\nMK Fraud Insights`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Your premium report <strong>${escapeHtml(reportReference)}</strong> is attached.</p><p>${escapeHtml(disclaimer)}</p><p>Regards,<br><strong>MK Fraud Insights</strong></p>`
  };
}

async function loadReport(db: any, reportId: string) {
  const { data, error } = await db.from('reports').select(`
    id,report_reference,storage_bucket,storage_path,checksum,
    orders:order_id(customer_email,customer_name,organisation_name)
  `).eq('id', reportId).maybeSingle();
  if (error || !data) throw error ?? new Error(`Report ${reportId} was not found.`);
  return data as any;
}

export async function deliverPremiumReportEmail(input: DeliverPremiumReportEmailInput): Promise<DeliverPremiumReportEmailResult> {
  const flags = await getPremiumReportAutomationFlags();
  if (input.actor.action === 'automatic_email' && !flags.autoEmailEnabled) {
    throw new Error('Automatic premium-report email is disabled.');
  }
  if (input.actor.action !== 'automatic_email' && !flags.manualDeliveryEnabled) {
    throw new Error('Manual premium-report delivery policy is disabled.');
  }
  if (input.actor.actorType === 'system' && !input.workerLease) {
    throw new Error('Automatic premium-report email requires a durable worker capability lease.');
  }
  if (input.workerLease && (input.bounceRetry || input.recipientOverride)) {
    throw new Error('Automatic delivery capabilities cannot retry a bounce or override the recipient.');
  }

  const action = input.bounceRetry ? 'email_resend' : 'email_delivery';
  const { client: privilegedDb } = input.workerLease
    ? await requirePhase14WorkerAction(input.workerLease, action)
    : await requirePhase14Action(action);
  const db = createSupabaseServiceClient() as any;
  const report = await loadReport(db, input.reportId);
  const order: any = one(report.orders);
  const customerRecipient = email(order?.customer_email);
  if (!customerRecipient) throw new Error('The customer delivery address is invalid.');
  const overridePermitted = process.env.NODE_ENV !== 'production'
    && flags.testRecipientOverrideEnabled
    && input.allowNonProductionTestOverride === true;
  if (input.recipientOverride && !overridePermitted) {
    throw new Error('Recipient overrides require explicitly enabled non-production test mode.');
  }
  const recipient = email(overridePermitted
    ? input.recipientOverride ?? flags.testRecipientOverride ?? customerRecipient
    : customerRecipient);
  if (!recipient) throw new Error('The resolved report recipient is invalid.');

  const { data: authorizationData, error: authorizationError } = await privilegedDb.rpc(
    input.workerLease
      ? 'worker_authorize_premium_report_delivery'
      : 'authorize_premium_report_delivery',
    input.workerLease
      ? {
          p_capability_id: input.workerLease.capabilityId,
          p_capability_lease_token: input.workerLease.leaseToken,
          p_report_id: input.reportId,
          p_recipient: recipient,
          p_provider: 'resend'
        }
      : {
          p_report_id: input.reportId,
          p_recipient: recipient,
          p_delivery_mode: input.bounceRetry ? 'bounce_retry' : 'initial',
          p_allow_test_override: overridePermitted,
          p_provider: 'resend',
          p_bounce_remediation_id: input.bounceRetry?.remediationId ?? null
        }
  );
  if (authorizationError || !authorizationData) {
    throw authorizationError ?? new Error('Delivery authorization was not created.');
  }
  const authorization = authorizationData as DeliveryAuthorization;
  if (authorization.reused_existing_send) {
    return {
      emailEventId: authorization.email_event_id,
      providerMessageId: authorization.provider_message_id ?? null,
      recipient: authorization.recipient,
      reusedExistingSend: true,
      status: authorization.status,
      testDelivery: authorization.test_delivery
    };
  }
  if (!authorization.authorization_id) throw new Error('Delivery authorization identity is missing.');

  const { data: claimData, error: claimError } = await privilegedDb.rpc(
    input.workerLease ? 'worker_claim_premium_report_delivery' : 'claim_premium_report_delivery',
    input.workerLease
      ? {
          p_capability_id: input.workerLease.capabilityId,
          p_capability_lease_token: input.workerLease.leaseToken,
          p_authorization_id: authorization.authorization_id
        }
      : { p_authorization_id: authorization.authorization_id }
  );
  if (claimError || !claimData) throw claimError ?? new Error('Delivery authorization claim returned no result.');
  const claim = claimData as ClaimedDelivery;
  if (!claim.claimed) throw new Error(`Delivery authorization was ${claim.status ?? 'not claimed'}: ${claim.reason ?? 'ineligible'}.`);

  const copy = messageCopy(report.report_reference, order?.customer_name ?? null, order?.organisation_name ?? null);
  const dispatch = await executeClaimedReportDelivery({
    db,
    rpcDb: privilegedDb,
    workerLease: input.workerLease,
    report,
    claim,
    transport: input.transport ?? sendReportEmailWithResend,
    transportInput: {
      from: process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>',
      to: recipient,
      replyTo: process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || 'hello@mkfraud.co.za',
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
      attachment: {
        filename: `${report.report_reference}-MK-Fraud-Readiness-Report.pdf`,
        contentBase64: ''
      },
      idempotencyKey: authorization.provider_request_key!,
      tags: [
        { name: 'message_type', value: 'premium_report_pdf' },
        { name: 'report_id', value: report.id.replace(/-/g, '') }
      ]
    }
  });
  return {
    emailEventId: claim.email_event_id,
    providerMessageId: dispatch.providerMessageId,
    recipient,
    reusedExistingSend: false,
    status: 'sent',
    testDelivery: claim.test_delivery
  };
}

export async function authorizeBouncedReportRedelivery(input: {
  priorEmailEventId: string;
  reason: string;
  correctedRecipientEvidence: Record<string, unknown>;
}) {
  const { client } = await requirePhase14Action('email_resend');
  const hasEvidence = Object.values(input.correctedRecipientEvidence ?? {}).some((value) => (
    typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined
  ));
  if (!input.priorEmailEventId.trim() || !input.reason.trim()
      || !input.correctedRecipientEvidence
      || !hasEvidence) {
    throw new Error('A bounced email event, reason and corrected-recipient evidence are required.');
  }
  const { data, error } = await client.rpc('authorize_bounced_report_redelivery', {
    p_prior_email_event_id: input.priorEmailEventId,
    p_reason: input.reason,
    p_evidence: input.correctedRecipientEvidence
  });
  if (error || !data) throw error ?? new Error('Bounce remediation authorization was not created.');
  return { remediationId: data as string };
}

export async function reconcilePremiumReportEmail(input: {
  emailEventId: string;
  reconciler?: ReportEmailReconciler;
}) {
  const { client: privilegedDb } = await requirePhase14Action('provider_reconciliation');
  const db = createSupabaseServiceClient() as any;
  const { data: event, error } = await db.from('email_events')
    .select('id,status,provider_message_id,provider_request_key')
    .eq('id', input.emailEventId).maybeSingle();
  if (error || !event) throw error ?? new Error('Email event was not found.');
  if (!['provider_acceptance_uncertain', 'reconciliation_required'].includes(event.status)) {
    return { status: event.status, reconciled: false };
  }
  const { data: authorization, error: authorizationError } = await db
    .from('report_delivery_authorizations')
    .select('id,email_event_id')
    .eq('email_event_id', event.id)
    .maybeSingle();
  if (authorizationError || !authorization) {
    throw authorizationError ?? new Error('The email event has no durable delivery authorization.');
  }
  if (!event.provider_request_key) throw new Error('Email event has no durable provider request identity.');
  const result = await (input.reconciler ?? reconcileReportEmailWithResend)({
    providerMessageId: event.provider_message_id,
    providerRequestKey: event.provider_request_key
  });
  const providerMessageId = result.messageId ?? event.provider_message_id;
  if (result.state === 'accepted' && providerMessageId) {
    const { data: finalized, error: finalizationError } = await privilegedDb.rpc(
      'resolve_premium_report_delivery_reconciliation', {
      p_authorization_id: authorization.id,
      p_resolution: 'accepted',
      p_provider_message_id: providerMessageId,
      p_correlation_evidence: {
        provider_request_key: event.provider_request_key,
        verification_method: 'resend_api_lookup',
        provider_state: result.state,
        provider_detail: result.detail ?? null
      },
      p_operator_override: false,
      p_reason: 'Provider API lookup verified acceptance for the durable request key.'
    });
    if (finalizationError || !finalized || finalized.finalized === false) {
      await markReconciliationRequired(privilegedDb, authorization.id, providerMessageId,
        `Authoritative provider acceptance was found but finalization failed: ${finalizationError?.message ?? 'no result'}`);
      throw finalizationError ?? new Error('Accepted delivery finalization returned no result.');
    }
    return { status: 'sent', reconciled: true, provider: result, finalized };
  }

  const detail = result.state === 'not_found' && event.provider_message_id
    ? 'Provider lookup returned 404 for an event with a provider message ID; acceptance remains inconclusive and resend is prohibited.'
    : result.detail ?? 'Provider acceptance remains unresolved.';
  await markReconciliationRequired(privilegedDb, authorization.id, providerMessageId, detail);
  return { status: 'reconciliation_required', reconciled: false, resendProhibited: true, provider: result };
}

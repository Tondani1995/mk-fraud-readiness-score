import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPremiumReportAutomationFlags } from '../automation/feature-flags';
import { validatePremiumReportDeliveryEntitlement } from './delivery-entitlement';
import {
  ACCEPTED_EMAIL_STATUSES,
  UNRESOLVED_PROVIDER_STATUSES,
  stateAfterDispatchFailure
} from './delivery-state';
import {
  reconcileReportEmailWithResend,
  sendReportEmailWithResend,
  type ReportEmailReconciler,
  type ReportEmailTransport
} from './resend-transport';

export type ReportDeliveryActor = {
  actorType: 'system' | 'admin';
  userId?: string | null;
  action: 'automatic_email' | 'admin_send' | 'admin_resend';
};

export type DeliverPremiumReportEmailInput = {
  reportId: string;
  actor: ReportDeliveryActor;
  forceResend?: boolean;
  recipientOverride?: string | null;
  allowNonProductionTestOverride?: boolean;
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

type EmailEvent = {
  id: string;
  status: string;
  provider_message_id: string | null;
  provider_request_key: string | null;
  recipient_email: string;
  attempt_number: number;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const SEND_LEASE_MS = 10 * 60 * 1000;

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

async function getEvent(db: any, dedupeKey: string): Promise<EmailEvent | null> {
  const { data, error } = await db.from('email_events')
    .select('id,status,provider_message_id,provider_request_key,recipient_email,attempt_number')
    .eq('dedupe_key', dedupeKey).maybeSingle();
  if (error) throw error;
  return data as EmailEvent | null;
}

async function finaliseAccepted(db: any, input: {
  report: any;
  event: EmailEvent;
  recipient: string;
  actor: ReportDeliveryActor;
  testDelivery: boolean;
}) {
  const now = new Date().toISOString();
  if (!input.testDelivery) {
    const { error: entitlementError } = await db.rpc('assert_premium_report_delivery_entitlement', {
      p_report_id: input.report.id,
      p_recipient: input.recipient,
      p_allow_test_override: false
    });
    if (entitlementError) throw entitlementError;
    const { error: reportError } = await db.from('reports').update({ status: 'released', released_at: now })
      .eq('id', input.report.id).not('status', 'in', '(superseded,voided,draft)');
    if (reportError) throw reportError;
  }
  const { error: eventError } = await db.from('report_events').insert({
    report_id: input.report.id,
    event_type: input.testDelivery ? 'email_test_sent' : input.actor.action === 'admin_resend' ? 'email_resent' : 'email_sent',
    note: input.testDelivery ? 'Controlled non-production test delivery accepted; customer release unchanged.' : 'Premium report provider acceptance persisted.',
    metadata_json: {
      email_event_id: input.event.id,
      provider_message_id: input.event.provider_message_id,
      recipient: input.recipient,
      test_delivery: input.testDelivery
    }
  });
  if (eventError) throw eventError;
}

async function loadDeliveryContext(db: any, reportId: string) {
  const { data: report, error } = await db.from('reports').select(`
    id,report_reference,report_type,status,version_number,storage_bucket,storage_path,checksum,
    assessment_id,order_id,score_run_id,fulfilment_id,
    orders:order_id(id,assessment_id,status,amount_cents,currency,verified_at,verified_by,customer_email,customer_name,organisation_name,
      products:product_id(product_code,active,price_cents,currency,requires_payment_verification,delivery_mode)),
    score_runs:score_run_id(id,assessment_id,status,locked_at,input_hash),
    assessments:assessment_id(id,current_score_run_id)
  `).eq('id', reportId).maybeSingle();
  if (error || !report) throw error ?? new Error(`Report ${reportId} was not found.`);
  const { data: current, error: currentError } = await db.from('reports').select('id')
    .eq('assessment_id', report.assessment_id).eq('report_type', report.report_type)
    .not('status', 'in', '(draft,superseded,voided)').order('version_number', { ascending: false }).limit(1).maybeSingle();
  if (currentError) throw currentError;
  return { report, current };
}

export async function deliverPremiumReportEmail(input: DeliverPremiumReportEmailInput): Promise<DeliverPremiumReportEmailResult> {
  const db = createSupabaseServiceClient() as any;
  const flags = await getPremiumReportAutomationFlags();
  if (input.actor.action === 'automatic_email' && !flags.autoEmailEnabled) throw new Error('Automatic premium-report email is disabled.');
  if (input.actor.action !== 'automatic_email' && !flags.manualDeliveryEnabled) throw new Error('Manual premium-report delivery policy is disabled.');

  const { report, current } = await loadDeliveryContext(db, input.reportId);
  const order: any = one(report.orders);
  const product: any = one(order?.products);
  const score: any = one(report.score_runs);
  const assessment: any = one(report.assessments);
  const customerRecipient = email(order?.customer_email);
  const overridePermitted = process.env.NODE_ENV !== 'production'
    && flags.testRecipientOverrideEnabled
    && input.allowNonProductionTestOverride === true;
  if (input.recipientOverride && !overridePermitted) throw new Error('Recipient overrides require explicitly enabled non-production test mode.');
  const recipient = email(overridePermitted ? input.recipientOverride ?? flags.testRecipientOverride ?? customerRecipient : customerRecipient);

  validatePremiumReportDeliveryEntitlement({
    reportType: report.report_type,
    reportStatus: report.status,
    isCurrentReport: current?.id === report.id,
    storageBucket: report.storage_bucket,
    storagePath: report.storage_path,
    checksum: report.checksum,
    productCode: product?.product_code ?? null,
    productActive: product?.active === true,
    productPriceCents: product?.price_cents == null ? null : Number(product.price_cents),
    productCurrency: product?.currency ?? null,
    requiresPaymentVerification: product?.requires_payment_verification === true,
    deliveryMode: product?.delivery_mode ?? null,
    orderStatus: order?.status,
    orderAmountCents: order?.amount_cents == null ? null : Number(order.amount_cents),
    orderCurrency: order?.currency ?? null,
    verifiedAt: order?.verified_at ?? null,
    verifiedBy: order?.verified_by ?? null,
    orderAssessmentId: order?.assessment_id,
    reportAssessmentId: report.assessment_id,
    scoreAssessmentId: score?.assessment_id,
    currentScoreRunId: assessment?.current_score_run_id,
    reportScoreRunId: report.score_run_id,
    scoreStatus: score?.status,
    scoreLockedAt: score?.locked_at ?? null,
    scoreInputHash: score?.input_hash ?? null,
    customerRecipient,
    recipient,
    allowNonProductionTestOverride: overridePermitted
  });
  const { error: transactionalGuardError } = await db.rpc('assert_premium_report_delivery_entitlement', {
    p_report_id: report.id,
    p_recipient: recipient,
    p_allow_test_override: overridePermitted
  });
  if (transactionalGuardError) throw transactionalGuardError;
  const testDelivery = recipient !== customerRecipient;

  const { error: recoveryError } = await db.rpc('recover_stale_premium_report_email_sends');
  if (recoveryError) throw recoveryError;
  const { data: unresolved, error: unresolvedError } = await db.from('email_events').select('id,status')
    .eq('report_id', report.id).eq('recipient_email', recipient).in('status', UNRESOLVED_PROVIDER_STATUSES).limit(1).maybeSingle();
  if (unresolvedError) throw unresolvedError;
  if (unresolved) throw new Error(`Email event ${unresolved.id} requires provider reconciliation before any resend.`);

  const baseKey = `premium-report-delivery:${report.id}:${recipient}`;
  let attemptNumber = 1;
  let dedupeKey = baseKey;
  if (input.forceResend) {
    const { count, error: countError } = await db.from('email_events').select('id', { count: 'exact', head: true })
      .eq('report_id', report.id).eq('recipient_email', recipient).eq('notification_type', 'premium_report_pdf');
    if (countError) throw countError;
    attemptNumber = Number(count ?? 0) + 1;
    dedupeKey = `${baseKey}:resend-${attemptNumber}`;
  }

  let event = await getEvent(db, dedupeKey);
  if (event && ACCEPTED_EMAIL_STATUSES.has(event.status as any) && event.provider_message_id) {
    await finaliseAccepted(db, { report, event, recipient: recipient!, actor: input.actor, testDelivery });
    return { emailEventId: event.id, providerMessageId: event.provider_message_id, recipient: recipient!, reusedExistingSend: true, status: event.status, testDelivery };
  }
  if (event?.status === 'failed_before_provider') {
    const { data: reset, error: resetError } = await db.from('email_events').update({ status: 'queued', attempt_number: event.attempt_number + 1, error_message: null })
      .eq('id', event.id).eq('status', 'failed_before_provider').is('provider_message_id', null)
      .select('id,status,provider_message_id,provider_request_key,recipient_email,attempt_number').maybeSingle();
    if (resetError || !reset) throw resetError ?? new Error('Failed-before-provider event was claimed by another worker.');
    event = reset as EmailEvent;
  }
  if (!event) {
    const { data: inserted, error: insertError } = await db.from('email_events').insert({
      assessment_id: report.assessment_id,
      order_id: report.order_id,
      report_id: report.id,
      recipient_email: recipient,
      template_key: 'premium_report_pdf_v1',
      notification_type: 'premium_report_pdf',
      dedupe_key: dedupeKey,
      provider_request_key: dedupeKey,
      provider_idempotency_key: dedupeKey,
      status: 'queued',
      attempt_number: attemptNumber,
      metadata_json: { actor_action: input.actor.action, attachment_checksum: report.checksum, test_delivery: testDelivery }
    }).select('id,status,provider_message_id,provider_request_key,recipient_email,attempt_number').single();
    if (insertError || !inserted) {
      event = await getEvent(db, dedupeKey);
      if (!event) throw insertError ?? new Error('Email event could not be durably created before dispatch.');
    } else event = inserted as EmailEvent;
  }
  if (event.status !== 'queued') throw new Error(`Premium report email is already ${event.status}.`);

  const leaseToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db.from('email_events').update({
    status: 'sending',
    send_lease_token: leaseToken,
    send_lease_expires_at: new Date(Date.now() + SEND_LEASE_MS).toISOString(),
    delivery_updated_at: new Date().toISOString(),
    error_message: null
  }).eq('id', event.id).eq('status', 'queued')
    .select('id,status,provider_message_id,provider_request_key,recipient_email,attempt_number').maybeSingle();
  if (claimError || !claimed) throw claimError ?? new Error('Email send lease was claimed by another worker.');
  event = claimed as EmailEvent;

  let dispatchStarted = false;
  let providerMessageId: string | null = null;
  let providerStatePersisted = false;
  try {
    const { data: pdf, error: downloadError } = await db.storage.from(report.storage_bucket).download(report.storage_path);
    if (downloadError || !pdf) throw new Error(`Report attachment download failed: ${downloadError?.message ?? 'object missing'}`);
    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    if (!pdfBuffer.length || pdfBuffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Report attachment size is invalid for email.');
    const actualChecksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    if (actualChecksum !== report.checksum) throw new Error(`Report attachment checksum mismatch: expected ${report.checksum}, received ${actualChecksum}.`);

    const copy = messageCopy(report.report_reference, order?.customer_name ?? null, order?.organisation_name ?? null);
    dispatchStarted = true;
    const provider = await (input.transport ?? sendReportEmailWithResend)({
      from: process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>',
      to: recipient!,
      replyTo: process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || 'hello@mkfraud.co.za',
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
      attachment: { filename: `${report.report_reference}-MK-Fraud-Readiness-Report.pdf`, contentBase64: pdfBuffer.toString('base64') },
      idempotencyKey: event.provider_request_key!,
      tags: [{ name: 'message_type', value: 'premium_report_pdf' }, { name: 'report_id', value: report.id.replace(/-/g, '') }]
    });
    providerMessageId = provider.messageId;
    const sentAt = new Date().toISOString();
    const { data: persisted, error: persistError } = await db.from('email_events').update({
      status: 'sent', provider_message_id: provider.messageId, sent_at: sentAt,
      delivery_updated_at: sentAt, send_lease_token: null, send_lease_expires_at: null, error_message: null
    }).eq('id', event.id).eq('status', 'sending').eq('send_lease_token', leaseToken)
      .select('id,status,provider_message_id,provider_request_key,recipient_email,attempt_number').maybeSingle();
    if (persistError || !persisted) {
      const { data: uncertain, error: uncertainError } = await db.from('email_events').update({
        status: 'provider_acceptance_uncertain', provider_message_id: provider.messageId,
        reconciliation_required_at: sentAt, delivery_updated_at: sentAt,
        error_message: `Provider accepted but sent-state persistence failed: ${persistError?.message ?? 'compare-and-set lost'}`
      }).eq('id', event.id).eq('send_lease_token', leaseToken).select('id').maybeSingle();
      if (uncertainError || !uncertain) throw new Error(`Provider accepted, but sent-state and uncertainty recovery both failed: ${persistError?.message}; ${uncertainError?.message}`);
      providerStatePersisted = true;
      throw new Error('Provider acceptance is persisted as uncertain and requires reconciliation.');
    }
    providerStatePersisted = true;
    event = persisted as EmailEvent;
    await finaliseAccepted(db, { report, event, recipient: recipient!, actor: input.actor, testDelivery });
    return { emailEventId: event.id, providerMessageId, recipient: recipient!, reusedExistingSend: false, status: 'sent', testDelivery };
  } catch (error) {
    if (providerStatePersisted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const status = stateAfterDispatchFailure({ dispatchStarted, providerMessageId });
    const patch = dispatchStarted
      ? { status, provider_message_id: providerMessageId, reconciliation_required_at: new Date().toISOString(), error_message: message }
      : { status, error_message: message, send_lease_token: null, send_lease_expires_at: null };
    const { data: recovered, error: recoveryUpdateError } = await db.from('email_events').update(patch)
      .eq('id', event.id).eq('status', 'sending').eq('send_lease_token', leaseToken).select('id').maybeSingle();
    if (recoveryUpdateError || !recovered) {
      throw new Error(`Email delivery failed and durable recovery update failed: ${message}; ${recoveryUpdateError?.message ?? 'compare-and-set lost'}`);
    }
    throw error;
  }
}

export async function reconcilePremiumReportEmail(input: {
  emailEventId: string;
  reconciler?: ReportEmailReconciler;
}) {
  const db = createSupabaseServiceClient() as any;
  const { data: event, error } = await db.from('email_events')
    .select('id,status,provider_message_id,provider_request_key')
    .eq('id', input.emailEventId).maybeSingle();
  if (error || !event) throw error ?? new Error('Email event was not found.');
  if (!['provider_acceptance_uncertain', 'reconciliation_required'].includes(event.status)) {
    return { status: event.status, reconciled: false };
  }
  if (!event.provider_request_key) throw new Error('Email event has no durable provider request identity.');
  const result = await (input.reconciler ?? reconcileReportEmailWithResend)({
    providerMessageId: event.provider_message_id,
    providerRequestKey: event.provider_request_key
  });
  const now = new Date().toISOString();
  const nextStatus = result.state === 'accepted' ? 'sent'
    : result.state === 'not_found' ? 'failed_before_provider'
      : 'reconciliation_required';
  const { data: updated, error: updateError } = await db.from('email_events').update({
    status: nextStatus,
    provider_message_id: result.messageId ?? event.provider_message_id,
    reconciliation_attempted_at: now,
    reconciliation_result_json: result,
    delivery_updated_at: now,
    error_message: nextStatus === 'reconciliation_required' ? result.detail ?? 'Provider acceptance remains unresolved.' : null
  }).eq('id', event.id).in('status', ['provider_acceptance_uncertain', 'reconciliation_required'])
    .select('id,status,provider_message_id').maybeSingle();
  if (updateError || !updated) throw updateError ?? new Error('Reconciliation compare-and-set was lost.');
  return { ...updated, reconciled: true, provider: result };
}

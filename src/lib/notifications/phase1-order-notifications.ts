import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  getPhase1SchemaCapability,
  requirePhase1SchemaCapability
} from '@/lib/reports/phase1-schema-capability';
import { sendEmail as defaultSendEmail } from '@/lib/notifications/email-provider';
import {
  buildAdminNewOrderAlertMessage,
  buildInternalExceptionAlertMessage,
  buildOrderConfirmationMessage,
  buildPaymentConfirmedMessage
} from '@/lib/notifications/message-templates';

type NotificationContext = {
  assessment: any;
  organisation?: any | null;
  respondent?: any | null;
  dataRequest?: any | null;
  order: any;
  product: any;
  eftSnapshot: any;
};

type AutomaticExceptionAlertDependencies = {
  createClient?: typeof createSupabaseServiceClient;
  sendEmailImpl?: typeof defaultSendEmail;
};

function displayAmount(cents: number, currency: string) {
  return `${currency} ${(Number(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nextStep(productCode: string | null) {
  if (productCode === 'mk_validated_assessment') {
    return 'Payment confirmation is followed by consultant review and engagement planning. Consultant review and engagement steps remain outstanding.';
  }
  return 'MK Fraud Insights will confirm payment manually, generate the report, and record delivery as a separate controlled step.';
}

// Mirrors src/lib/orders/manual-eft-orders.ts's paymentReference() -- duplicated rather than
// imported, since that module imports recordPhase1OrderNotifications from this one and importing
// back would create a cycle.
function manualEftPaymentReference(orderReference: string) {
  return orderReference.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
}

function formatEftAccountSummary(eftSnapshot: any): string {
  const snapshot = eftSnapshot ?? {};
  if (snapshot.active !== true) {
    return 'MK Fraud Insights will send EFT payment instructions directly.';
  }
  const bankName = snapshot.bankName ?? snapshot.bank_name ?? 'Not configured';
  const accountHolder = snapshot.accountHolder ?? snapshot.account_holder ?? 'Not configured';
  const accountNumber = snapshot.accountNumber ?? snapshot.account_number ?? 'Not configured';
  const branchCode = snapshot.branchCode ?? snapshot.branch_code ?? 'Not configured';
  const accountType = snapshot.accountType ?? snapshot.account_type ?? null;
  const lines = [
    `Bank: ${bankName}`,
    `Account holder: ${accountHolder}`,
    `Account number: ${accountNumber}`,
    `Branch code: ${branchCode}`
  ];
  if (accountType) lines.push(`Account type: ${accountType}`);
  return lines.join('\n');
}

// An event is a delivery candidate only while it carries no proof of having reached the provider.
// sent_at and provider_message_id are the two authoritative marks of a real dispatch, so any row
// holding either is terminal and must never be sent again regardless of its status string.
const RECOVERABLE_UNSENT_STATUSES = new Set(['queued', 'recorded_disabled', 'send_failed']);

// A claim is a lease, not a lock. A sender that dies between claiming the row and calling the
// provider would otherwise strand the event in 'sending' forever. Reclaiming is only safe because
// the provider call is keyed by the email-event id (see providerIdempotencyKeyFor): a replay of an
// attempt that did reach Resend returns the original message rather than sending a second one.
const CLAIM_LEASE_MS = Number(process.env.MK_NOTIFICATION_CLAIM_LEASE_MS ?? 10 * 60 * 1000);
const MAX_RECOVERY_ATTEMPTS = Number(process.env.MK_NOTIFICATION_MAX_RECOVERY_ATTEMPTS ?? 5);

/**
 * The provider idempotency identifier for an event.
 *
 * Derived from the email-event id, which is itself one-per-dedupe-key, so every attempt at the
 * same notification presents the same key to Resend. resend-transport sends this as the
 * `Idempotency-Key` request header.
 */
export function providerIdempotencyKeyFor(emailEventId: string) {
  return emailEventId;
}

/**
 * Recipients permitted to receive provider mail.
 *
 * Enforcement is opt-in: with MK_EMAIL_RECIPIENT_ALLOWLIST unset the behaviour is unchanged, so
 * production delivery to real customers is unaffected. Certification and staging set it, which
 * makes an unapproved address a hard refusal at the last point before the provider is contacted.
 */
export function recipientAllowlist(): string[] | null {
  const raw = process.env.MK_EMAIL_RECIPIENT_ALLOWLIST?.trim();
  if (!raw) return null;
  const entries = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return entries.length ? entries : null;
}

export function isRecipientPermitted(recipient: string | null | undefined) {
  const address = recipient?.trim().toLowerCase() ?? '';
  if (!address) return false;
  const allowlist = recipientAllowlist();
  if (!allowlist) return true;
  return allowlist.includes(address);
}

/**
 * Deliver an email_events row that was recorded but never dispatched.
 *
 * Concurrency is serialised the same way the initial insert is -- by the database, not by a
 * read-then-write in application code. The claim is a conditional UPDATE that only matches while
 * the row is still unsent; the loser of a race updates zero rows and returns without sending, so
 * at most one provider call can ever be made per row.
 */
async function deliverUnsentNotification(db: any, existing: {
  id: string; status: string | null; retry_count: number | null;
  sent_at: string | null; provider_message_id: string | null; recipient_email: string | null;
  updated_at?: string | null;
}, input: {
  context: NotificationContext;
  notificationType: string;
  message: { subject: string; text: string; html: string };
  safeProviderFailure?: boolean;
}, dependencies: { sendEmailImpl?: typeof defaultSendEmail } = {}) {
  if (existing.sent_at || existing.provider_message_id) return { recovered: false, reason: 'already_sent' };
  if (!existing.recipient_email) return { recovered: false, reason: 'recipient_missing' };
  // Last gate before the provider is contacted, so it also covers stale-claim recovery.
  if (!isRecipientPermitted(existing.recipient_email)) return { recovered: false, reason: 'recipient_not_allowlisted' };

  const attempt = Number(existing.retry_count ?? 0) + 1;
  if (attempt > MAX_RECOVERY_ATTEMPTS) {
    // Fail closed rather than hammer the provider: park the row for human reconciliation.
    await db.from('email_events')
      .update({ status: 'reconciliation_required', error_message: 'Recovery attempt ceiling reached.', updated_at: new Date().toISOString() })
      .eq('id', existing.id).is('sent_at', null).is('provider_message_id', null);
    return { recovered: false, reason: 'attempt_ceiling_reached' };
  }

  // A 'sending' row is claimable only once its lease has expired. Statuses in the recoverable set
  // are claimable immediately; 'sending' is the in-flight state and must not be overtaken while a
  // live sender still holds it.
  const leaseCutoff = new Date(Date.now() - CLAIM_LEASE_MS).toISOString();
  const claimable = [...RECOVERABLE_UNSENT_STATUSES];
  const staleClaim = existing.status === 'sending'
    && (existing.updated_at ?? '') !== ''
    && existing.updated_at! < leaseCutoff;
  if (existing.status === 'sending' && !staleClaim) return { recovered: false, reason: 'claim_lease_active' };
  if (!RECOVERABLE_UNSENT_STATUSES.has(existing.status ?? '') && !staleClaim) return { recovered: false, reason: 'not_recoverable' };
  if (staleClaim) claimable.push('sending');

  const claimStamp = new Date().toISOString();
  let claim = db.from('email_events')
    .update({ status: 'sending', retry_count: attempt, updated_at: claimStamp })
    .eq('id', existing.id)
    .is('sent_at', null)
    .is('provider_message_id', null)
    .in('status', claimable);
  // Reclaiming a stale lease must lose to any sender that refreshed it since we read the row.
  if (staleClaim) claim = claim.lt('updated_at', leaseCutoff);
  const { data: claimed } = await claim.select('id').maybeSingle();
  if (!claimed) return { recovered: false, reason: 'claimed_by_another_attempt' };

  const fromAddress = process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>';
  const replyTo = process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || null;
  const sendEmail = dependencies.sendEmailImpl ?? defaultSendEmail;
  const sendResult = await sendEmail({
    from: fromAddress,
    to: existing.recipient_email,
    replyTo,
    subject: input.message.subject,
    html: input.message.html,
    text: input.message.text,
    idempotencyKey: providerIdempotencyKeyFor(existing.id)
  });

  const sentSuccessfully = sendResult.ok && sendResult.mode !== 'disabled';
  const finalStatus = !sendResult.ok ? 'send_failed' : sendResult.mode === 'disabled' ? 'recorded_disabled' : 'sent';
  await db.from('email_events').update({
    status: finalStatus,
    provider_mode: sendResult.mode === 'disabled' ? 'disabled' : 'external',
    provider_message_id: sentSuccessfully ? sendResult.providerMessageId : null,
    sent_at: sentSuccessfully ? new Date().toISOString() : null,
    error_message: sendResult.ok
      ? null
      : input.safeProviderFailure
        ? 'The operational exception notification provider request failed.'
        : sendResult.error,
    updated_at: new Date().toISOString()
  }).eq('id', existing.id);

  await db.from('order_events').insert({
    order_id: input.context.order.id,
    event_type: sentSuccessfully ? 'notification_recovered' : 'notification_failed',
    note: sentSuccessfully
      ? `${input.notificationType.replace(/_/g, ' ')} recovered and sent on attempt ${attempt}.`
      : `${input.notificationType.replace(/_/g, ' ')} recovery attempt ${attempt} did not dispatch; provider mode ${sendResult.mode}.`,
    metadata_json: {
      notification_type: input.notificationType,
      email_event_id: existing.id,
      recovery_attempt: attempt,
      provider_mode: sendResult.mode === 'disabled' ? 'disabled' : 'external',
      provider_send_attempted: sendResult.mode !== 'disabled',
      ...(sendResult.ok ? {} : { error_category: 'provider_send_failed' })
    }
  });

  return { recovered: sentSuccessfully, status: finalStatus, retry_count: attempt,
           reason: sentSuccessfully ? 'sent' : sendResult.mode === 'disabled' ? 'provider_disabled' : 'send_failed' };
}

// Insert the email_events row BEFORE calling sendEmail() -- the row's dedupe_key unique index
// (0012) is what actually serialises concurrent callers. Sending first and inserting after would
// let two concurrent requests both pass the earlier `existing` check and both dispatch a real
// email before either claimed the dedupe slot.
async function recordNotification(db: any, input: {
  context: NotificationContext;
  notificationType: 'customer_order_confirmation' | 'admin_new_order_notification' | 'payment_confirmed' | 'delivery_recipient_required_alert' | 'automatic_fulfilment_exception_alert';
  recipient: string | null;
  payload: Record<string, unknown>;
  message: { subject: string; text: string; html: string };
  dedupeKey?: string;
  safeProviderFailure?: boolean;
}, dependencies: { sendEmailImpl?: typeof defaultSendEmail } = {}) {
  const dedupeKey = input.dedupeKey
    ?? `phase1:${input.notificationType}:${input.context.order.id}`;
  const { data: existing, error: existingError } = await db.from('email_events')
    .select('id,status,retry_count,sent_at,provider_message_id,recipient_email,updated_at')
    .eq('dedupe_key', dedupeKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    // The dedupe key still guarantees exactly one row per notification. What it must not do is
    // strand that row: a provider that was disabled or failing when the row was written leaves an
    // event with no sent_at and no provider message id, and before this branch existed there was
    // no controlled way to deliver it once the provider came back.
    const recovered = await deliverUnsentNotification(db, existing, {
      context: input.context,
      notificationType: input.notificationType,
      message: input.message,
      safeProviderFailure: input.safeProviderFailure,
    }, dependencies);
    return { ...existing, ...recovered, reused: true };
  }
  if (!input.recipient || !isRecipientPermitted(input.recipient)) {
    await db.from('order_events').insert({
      order_id: input.context.order.id,
      event_type: 'notification_failed',
      note: `${input.notificationType} could not be recorded because the intended recipient was missing or not allowlisted.`,
      metadata_json: { notification_type: input.notificationType, provider_mode: 'disabled', error_category: input.recipient ? 'recipient_not_allowlisted' : 'recipient_missing' }
    });
    return { id: null, status: 'failed', reused: false };
  }
  const requestId = crypto.randomUUID();
  const { data, error } = await db.from('email_events').insert({
    assessment_id: input.context.assessment.id,
    order_id: input.context.order.id,
    data_request_id: input.context.dataRequest?.id ?? null,
    recipient_email: input.recipient,
    template_key: input.notificationType,
    notification_type: input.notificationType,
    dedupe_key: dedupeKey,
    status: 'queued',
    request_id: requestId,
    provider_mode: 'disabled',
    retry_count: 0,
    metadata_json: {
      ...input.payload,
      provider_send_attempted: false,
      request_id: requestId
    }
  }).select('id,status,retry_count').single();
  if (error || !data) {
    const { data: raced } = await db.from('email_events')
      .select('id,status,retry_count').eq('dedupe_key', dedupeKey).maybeSingle();
    if (raced) return { ...raced, reused: true };
    throw error ?? new Error('Notification record was not created.');
  }

  const fromAddress = process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>';
  const replyTo = process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || null;
  const sendEmail = dependencies.sendEmailImpl ?? defaultSendEmail;
  const sendResult = await sendEmail({
    from: fromAddress,
    to: input.recipient,
    replyTo,
    subject: input.message.subject,
    html: input.message.html,
    text: input.message.text,
    idempotencyKey: providerIdempotencyKeyFor(data.id)
  });

  const providerMode = sendResult.mode === 'disabled' ? 'disabled' : 'external';
  const finalStatus = !sendResult.ok ? 'send_failed' : sendResult.mode === 'disabled' ? 'recorded_disabled' : 'sent';
  const sentSuccessfully = sendResult.ok && sendResult.mode !== 'disabled';

  await db.from('email_events').update({
    status: finalStatus,
    provider_mode: providerMode,
    provider_message_id: sentSuccessfully ? sendResult.providerMessageId : null,
    sent_at: sentSuccessfully ? new Date().toISOString() : null,
    error_message: sendResult.ok
      ? null
      : input.safeProviderFailure
        ? 'The operational exception notification provider request failed.'
        : sendResult.error,
    updated_at: new Date().toISOString()
  }).eq('id', data.id);

  if (!sendResult.ok) {
    console.error('phase1_notification_send_failed', {
      notificationType: input.notificationType,
      emailEventId: data.id,
      mode: sendResult.mode,
      errorCategory: input.safeProviderFailure
        ? 'operational_exception_notification_send_failed'
        : sendResult.error
    });
  }

  await db.from('order_events').insert({
    order_id: input.context.order.id,
    event_type: sendResult.ok ? 'notification_recorded' : 'notification_failed',
    note: sendResult.ok
      ? `${input.notificationType.replace(/_/g, ' ')} recorded; provider mode ${sendResult.mode}.`
      : `${input.notificationType.replace(/_/g, ' ')} could not be sent: provider error.`,
    metadata_json: {
      notification_type: input.notificationType,
      email_event_id: data.id,
      provider_mode: providerMode,
      provider_send_attempted: sendResult.mode !== 'disabled',
      request_id: requestId,
      ...(sendResult.ok ? {} : { error_category: 'provider_send_failed' })
    }
  });

  return { id: data.id, status: finalStatus, retry_count: 0, reused: false };
}

export async function recordPhase1OrderNotifications(context: NotificationContext) {
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    return {
      skipped: true,
      reason: capability.status,
      message: capability.message
    };
  }
  const { data: score } = context.assessment.current_score_run_id
    ? await db.from('score_runs').select('overall_score,final_maturity').eq('id', context.assessment.current_score_run_id).maybeSingle()
    : { data: null };
  const contactEmail = context.eftSnapshot?.contactEmail ?? context.eftSnapshot?.contact_email ?? 'hello@mkfraud.co.za';
  const adminRecipient = process.env.MK_INTERNAL_LEADS_EMAIL?.trim()
    || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim()
    || contactEmail;
  const orderReference = context.order.order_reference;
  const organisationName = context.order.organisation_name ?? context.organisation?.legal_name ?? context.organisation?.trading_name ?? null;
  const customerName = context.order.customer_name ?? context.respondent?.full_name ?? null;
  const productName = context.order.product_name ?? context.product?.name ?? 'MK Fraud Readiness Report';
  const amountCents = Number(context.order.amount_cents ?? 0);
  const currency = context.order.currency ?? 'ZAR';
  const common = {
    order_reference: orderReference,
    organisation: organisationName,
    customer: customerName,
    product: productName,
    amount: displayAmount(amountCents, currency),
    payment_state: context.order.status,
    submission_timestamp: context.order.created_at ?? new Date().toISOString(),
    next_step: nextStep(context.product?.product_code ?? null),
    mk_contact: contactEmail
  };
  const customer = await recordNotification(db, {
    context,
    notificationType: 'customer_order_confirmation',
    recipient: context.order.customer_email ?? context.respondent?.email ?? null,
    payload: common,
    message: buildOrderConfirmationMessage({
      customerName,
      orderReference,
      productName,
      amountCents,
      currency,
      eftAccountSummary: formatEftAccountSummary(context.eftSnapshot),
      paymentReference: manualEftPaymentReference(orderReference)
    })
  });
  const admin = await recordNotification(db, {
    context,
    notificationType: 'admin_new_order_notification',
    recipient: adminRecipient,
    payload: {
      ...common,
      email: context.order.customer_email ?? context.respondent?.email ?? null,
      phone: context.respondent?.phone ?? null,
      industry: context.organisation?.industry ?? context.organisation?.sector ?? null,
      score: score?.overall_score ?? null,
      maturity: score?.final_maturity ?? null,
      admin_path: `/score/admin/orders/${encodeURIComponent(orderReference)}`
    },
    message: buildAdminNewOrderAlertMessage({
      orderReference,
      organisationName,
      customerName,
      productName,
      amountCents,
      currency
    })
  });
  return { customer, admin };
}

export type PaymentConfirmedNotificationInput = {
  orderId: string;
  orderReference: string;
  assessmentId: string | null;
  amountCents: number;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  verifiedAtIso: string;
};

export async function recordPaymentConfirmedNotification(input: PaymentConfirmedNotificationInput) {
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    return { skipped: true, reason: capability.status, message: capability.message };
  }
  return recordNotification(db, {
    context: {
      assessment: { id: input.assessmentId },
      organisation: null,
      respondent: null,
      dataRequest: null,
      order: { id: input.orderId },
      product: null,
      eftSnapshot: null
    },
    notificationType: 'payment_confirmed',
    recipient: input.customerEmail,
    payload: {
      order_reference: input.orderReference,
      amount: displayAmount(input.amountCents, input.currency),
      verified_at: input.verifiedAtIso
    },
    message: buildPaymentConfirmedMessage({
      customerName: input.customerName,
      orderReference: input.orderReference,
      amountCents: input.amountCents,
      currency: input.currency,
      verifiedAtIso: input.verifiedAtIso
    })
  });
}

// Release C closure: fires exactly once per order (dedupe_key is phase1:delivery_recipient_
// required_alert:<order_id>, same mechanism as every other notification in this file) when
// approve_quality_review() reports delivery_exception='recipient_required' -- reuses the
// existing, previously-dormant buildInternalExceptionAlertMessage() builder rather than adding a
// new one.
export async function recordDeliveryRecipientRequiredAlert(input: { orderId: string; reportId: string | null }) {
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    return { skipped: true, reason: capability.status, message: capability.message };
  }
  const { data: order } = await db.from('orders').select('id,order_reference,created_at').eq('id', input.orderId).maybeSingle();
  if (!order) return { skipped: true, reason: 'order_not_found', message: 'Order not found.' };
  const adminRecipient = process.env.MK_INTERNAL_LEADS_EMAIL?.trim()
    || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim()
    || null;
  const ageMs = Date.now() - new Date(order.created_at ?? Date.now()).getTime();
  const ageHours = Math.max(0, Math.round(ageMs / (60 * 60 * 1000)));

  return recordNotification(db, {
    context: {
      assessment: { id: null },
      organisation: null,
      respondent: null,
      dataRequest: null,
      order: { id: order.id },
      product: null,
      eftSnapshot: null
    },
    notificationType: 'delivery_recipient_required_alert',
    recipient: adminRecipient,
    payload: {
      order_reference: order.order_reference,
      report_id: input.reportId
    },
    message: buildInternalExceptionAlertMessage({
      orderReference: order.order_reference,
      failedStage: 'Report ready for delivery, but no customer email on file',
      ageDescription: `${ageHours} hour(s) since order creation`,
      technicalReference: input.reportId ?? order.id,
      recoveryPath: `/score/admin/orders/${encodeURIComponent(order.order_reference)}`
    })
  });
}

export type AutomaticFulfilmentExceptionAlertInput = {
  orderId: string;
  reportId: string | null;
  attemptId: string | null;
  authorizationId: string | null;
  category: string;
  stage: string;
  technicalReference: string;
  requiredAction: string;
};

export async function recordAutomaticFulfilmentExceptionAlert(
  input: AutomaticFulfilmentExceptionAlertInput,
  dependencies: AutomaticExceptionAlertDependencies = {}
) {
  const db = (dependencies.createClient ?? createSupabaseServiceClient)() as any;
  const { data: order } = await db
    .from('orders')
    .select('id,order_reference')
    .eq('id', input.orderId)
    .maybeSingle();
  if (!order) {
    return {
      skipped: true,
      reason: 'order_not_found',
      message: 'Order not found.'
    };
  }

  const safeIdentity = input.attemptId ?? input.authorizationId ?? input.orderId;
  return recordNotification(db, {
    context: {
      assessment: { id: null },
      organisation: null,
      respondent: null,
      dataRequest: null,
      order: { id: order.id },
      product: null,
      eftSnapshot: null
    },
    notificationType: 'automatic_fulfilment_exception_alert',
    recipient: 'admin@mkfraud.co.za',
    dedupeKey: [
      'phase1',
      'automatic_fulfilment_exception_alert',
      safeIdentity,
      input.stage,
      input.category
    ].join(':'),
    safeProviderFailure: true,
    payload: {
      order_reference: order.order_reference,
      report_id: input.reportId,
      attempt_id: input.attemptId,
      authorization_id: input.authorizationId,
      exception_category: input.category,
      stage: input.stage,
      technical_reference: input.technicalReference,
      required_action: input.requiredAction
    },
    message: buildInternalExceptionAlertMessage({
      orderReference: order.order_reference,
      failedStage: `${input.stage} — ${input.category}`,
      ageDescription: 'Immediate automatic-fulfilment exception',
      technicalReference: input.technicalReference,
      requiredAction: input.requiredAction,
      ownerHint: 'Tondani / admin@mkfraud.co.za',
      recoveryPath: `/score/admin/orders/${encodeURIComponent(order.order_reference)}`
    })
  }, dependencies);
}

export async function retryPhase1NotificationWithDouble(emailEventId: string, result: 'success' | 'failure') {
  const db = createSupabaseServiceClient() as any;
  await requirePhase1SchemaCapability(db);
  const { data: event, error } = await db.from('email_events')
    .select('id,retry_count,provider_mode').eq('id', emailEventId).maybeSingle();
  if (error || !event) throw error ?? new Error('Notification event not found.');
  const { data: updated, error: updateError } = await db.from('email_events').update({
    provider_mode: 'double',
    retry_count: Number(event.retry_count ?? 0) + 1,
    status: result === 'success' ? 'delivered_double' : 'failed',
    error_message: result === 'failure' ? 'The notification provider double returned a controlled failure.' : null,
    sent_at: result === 'success' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }).eq('id', emailEventId).select('id,status,retry_count').single();
  if (updateError || !updated) throw updateError ?? new Error('Notification retry was not recorded.');
  return updated;
}

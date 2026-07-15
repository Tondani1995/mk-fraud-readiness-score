import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

type NotificationContext = {
  assessment: any;
  organisation?: any | null;
  respondent?: any | null;
  dataRequest?: any | null;
  order: any;
  product: any;
  eftSnapshot: any;
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

async function recordNotification(db: any, input: {
  context: NotificationContext;
  notificationType: 'customer_order_confirmation' | 'admin_new_order_notification';
  recipient: string | null;
  payload: Record<string, unknown>;
}) {
  const dedupeKey = `phase1:${input.notificationType}:${input.context.order.id}`;
  const { data: existing, error: existingError } = await db.from('email_events')
    .select('id,status,retry_count').eq('dedupe_key', dedupeKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { ...existing, reused: true };
  if (!input.recipient) {
    await db.from('order_events').insert({
      order_id: input.context.order.id,
      event_type: 'notification_failed',
      note: `${input.notificationType} could not be recorded because the intended recipient was missing.`,
      metadata_json: { notification_type: input.notificationType, provider_mode: 'disabled', error_category: 'recipient_missing' }
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
    status: 'recorded_disabled',
    request_id: requestId,
    provider_mode: 'disabled',
    retry_count: 0,
    metadata_json: {
      ...input.payload,
      provider_mode: 'disabled',
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
  await db.from('order_events').insert({
    order_id: input.context.order.id,
    event_type: 'notification_recorded',
    note: `${input.notificationType.replace(/_/g, ' ')} recorded; provider delivery is disabled.`,
    metadata_json: {
      notification_type: input.notificationType,
      email_event_id: data.id,
      provider_mode: 'disabled',
      provider_send_attempted: false,
      request_id: requestId
    }
  });
  return { ...data, reused: false };
}

export async function recordPhase1OrderNotifications(context: NotificationContext) {
  const db = createSupabaseServiceClient() as any;
  const { data: score } = context.assessment.current_score_run_id
    ? await db.from('score_runs').select('overall_score,final_maturity').eq('id', context.assessment.current_score_run_id).maybeSingle()
    : { data: null };
  const contactEmail = context.eftSnapshot?.contactEmail ?? context.eftSnapshot?.contact_email ?? 'hello@mkfraud.co.za';
  const adminRecipient = process.env.MK_INTERNAL_LEADS_EMAIL?.trim()
    || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim()
    || contactEmail;
  const orderReference = context.order.order_reference;
  const common = {
    order_reference: orderReference,
    organisation: context.order.organisation_name ?? context.organisation?.legal_name ?? context.organisation?.trading_name,
    customer: context.order.customer_name ?? context.respondent?.full_name,
    product: context.order.product_name ?? context.product?.name,
    amount: displayAmount(context.order.amount_cents, context.order.currency ?? 'ZAR'),
    payment_state: context.order.status,
    submission_timestamp: context.order.created_at ?? new Date().toISOString(),
    next_step: nextStep(context.product?.product_code ?? null),
    mk_contact: contactEmail
  };
  const customer = await recordNotification(db, {
    context,
    notificationType: 'customer_order_confirmation',
    recipient: context.order.customer_email ?? context.respondent?.email ?? null,
    payload: common
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
    }
  });
  return { customer, admin };
}

export async function retryPhase1NotificationWithDouble(emailEventId: string, result: 'success' | 'failure') {
  const db = createSupabaseServiceClient() as any;
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

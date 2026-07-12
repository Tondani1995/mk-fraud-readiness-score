import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPremiumReportAutomationFlags } from '../automation/feature-flags';
import {
  sendReportEmailWithResend,
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

type EmailEventRow = {
  id: string;
  status: string;
  provider_message_id: string | null;
  recipient_email: string;
  attempt_number: number;
};

const ACCEPTED_STATUSES = new Set(['sent', 'delivered', 'delivery_delayed']);
const IN_PROGRESS_STATUSES = new Set(['queued', 'sending']);
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function htmlEscape(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] ?? character);
}

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
}

function normaliseEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function messageCopy(input: {
  customerName: string | null;
  organisationName: string | null;
  reportReference: string;
}) {
  const greetingName = input.customerName?.trim() || 'there';
  const organisation = input.organisationName?.trim();
  const organisationText = organisation ? ` for ${organisation}` : '';
  const subject = `Your MK Fraud Readiness Report${organisationText}`;
  const text = [
    `Hi ${greetingName},`,
    '',
    `Thank you for completing the MK Fraud Readiness Assessment${organisationText}.`,
    `Your premium report (${input.reportReference}) is attached as a PDF.`,
    '',
    'The report reflects the assessment responses and the MK Fraud Readiness methodology. It is intended to support prioritisation and does not constitute a certification, guarantee or legal conclusion.',
    '',
    'Regards,',
    'MK Fraud Insights',
    'www.mkfraud.co.za'
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933;max-width:640px">
      <p>Hi ${htmlEscape(greetingName)},</p>
      <p>Thank you for completing the MK Fraud Readiness Assessment${htmlEscape(organisationText)}.</p>
      <p>Your premium report <strong>${htmlEscape(input.reportReference)}</strong> is attached as a PDF.</p>
      <p>The report reflects the assessment responses and the MK Fraud Readiness methodology. It is intended to support prioritisation and does not constitute a certification, guarantee or legal conclusion.</p>
      <p>Regards,<br><strong>MK Fraud Insights</strong><br><a href="https://www.mkfraud.co.za">www.mkfraud.co.za</a></p>
    </div>`;
  return { subject, text, html };
}

async function insertAuditOnce(db: any, input: {
  actor: ReportDeliveryActor;
  assessmentId: string;
  emailEventId: string;
  action: string;
  afterJson: Record<string, unknown>;
}) {
  const { data: existing, error: lookupError } = await db
    .from('audit_logs')
    .select('id')
    .eq('entity_table', 'email_events')
    .eq('entity_id', input.emailEventId)
    .eq('action', input.action)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;

  const { error } = await db.from('audit_logs').insert({
    actor_type: input.actor.actorType,
    actor_user_id: input.actor.userId ?? null,
    assessment_id: input.assessmentId,
    entity_table: 'email_events',
    entity_id: input.emailEventId,
    action: input.action,
    after_json: input.afterJson
  });
  if (error) throw error;
}

async function insertReportEventOnce(db: any, input: {
  reportId: string;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  actorUserId?: string | null;
  note: string;
  metadata: Record<string, unknown>;
  emailEventId: string;
}) {
  const { data: existing, error: lookupError } = await db
    .from('report_events')
    .select('id')
    .eq('report_id', input.reportId)
    .eq('event_type', input.eventType)
    .contains('metadata_json', { email_event_id: input.emailEventId })
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;

  const { error } = await db.from('report_events').insert({
    report_id: input.reportId,
    event_type: input.eventType,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    actor_user_id: input.actorUserId ?? null,
    note: input.note,
    metadata_json: input.metadata
  });
  if (error) throw error;
}

async function finaliseAcceptedDelivery(db: any, input: {
  report: any;
  emailEvent: EmailEventRow;
  providerMessageId: string;
  provider: string;
  recipient: string;
  attemptNumber: number;
  testDelivery: boolean;
  actor: ReportDeliveryActor;
}) {
  const now = new Date().toISOString();
  const eventType = input.testDelivery
    ? 'email_test_sent'
    : input.actor.action === 'admin_resend' ? 'email_resent' : 'email_sent';
  const auditAction = input.testDelivery
    ? 'premium_report_test_email_sent'
    : input.actor.action === 'admin_resend' ? 'premium_report_email_resent' : 'premium_report_email_sent';

  if (!input.testDelivery) {
    const { error: reportUpdateError } = await db
      .from('reports')
      .update({ status: 'released', released_at: now })
      .eq('id', input.report.id);
    if (reportUpdateError) throw reportUpdateError;

    if (input.report.fulfilment_id) {
      const { error: fulfilmentError } = await db
        .from('report_fulfilments')
        .update({
          status: 'completed',
          current_step: 'email_sent',
          completed_at: now,
          failed_at: null,
          last_error_code: null,
          last_error_message: null
        })
        .eq('id', input.report.fulfilment_id);
      if (fulfilmentError) throw fulfilmentError;
    }
  }

  const metadata = {
    email_event_id: input.emailEvent.id,
    provider_message_id: input.providerMessageId,
    recipient: input.recipient,
    attempt_number: input.attemptNumber,
    test_delivery: input.testDelivery
  };

  await insertReportEventOnce(db, {
    reportId: input.report.id,
    eventType,
    fromStatus: input.report.status,
    toStatus: input.testDelivery ? input.report.status : 'released',
    actorUserId: input.actor.userId,
    note: input.testDelivery
      ? `Premium report PDF test delivery accepted by ${input.provider}; customer release was not changed.`
      : `Premium report PDF accepted by ${input.provider} for customer delivery.`,
    metadata,
    emailEventId: input.emailEvent.id
  });

  await insertAuditOnce(db, {
    actor: input.actor,
    assessmentId: input.report.assessment_id,
    emailEventId: input.emailEvent.id,
    action: auditAction,
    afterJson: {
      report_id: input.report.id,
      provider_message_id: input.providerMessageId,
      recipient: input.recipient,
      attempt_number: input.attemptNumber,
      test_delivery: input.testDelivery
    }
  });
}

async function getEventByDedupeKey(db: any, dedupeKey: string): Promise<EmailEventRow | null> {
  const { data, error } = await db
    .from('email_events')
    .select('id,status,provider_message_id,recipient_email,attempt_number')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deliverPremiumReportEmail(
  input: DeliverPremiumReportEmailInput
): Promise<DeliverPremiumReportEmailResult> {
  const db = createSupabaseServiceClient() as any;
  const flags = await getPremiumReportAutomationFlags();
  const transport = input.transport ?? sendReportEmailWithResend;

  const { data: report, error: reportError } = await db
    .from('reports')
    .select(`
      id,report_reference,status,storage_bucket,storage_path,checksum,assessment_id,order_id,fulfilment_id,
      orders:order_id(order_reference,customer_email,customer_name,organisation_name)
    `)
    .eq('id', input.reportId)
    .maybeSingle();

  if (reportError) throw reportError;
  if (!report) throw new Error(`Report ${input.reportId} was not found.`);
  if (!report.storage_bucket || !report.storage_path || !report.checksum) {
    throw new Error(`Report ${input.reportId} is not delivery-ready.`);
  }

  const order = Array.isArray(report.orders) ? report.orders[0] : report.orders;
  const customerRecipient = normaliseEmail(order?.customer_email);
  const recipient = normaliseEmail(
    input.recipientOverride ?? flags.testRecipientOverride ?? customerRecipient
  );
  if (!recipient) throw new Error('No valid premium-report delivery recipient is configured.');
  const testDelivery = recipient !== customerRecipient;

  const baseDedupeKey = `premium-report-delivery:${report.id}:${recipient}`;
  let dedupeKey = baseDedupeKey;
  let attemptNumber = 1;
  let emailEvent: EmailEventRow | null = null;

  if (input.forceResend) {
    const { count, error: countError } = await db
      .from('email_events')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', report.id)
      .eq('recipient_email', recipient)
      .eq('notification_type', 'premium_report_pdf');
    if (countError) throw countError;
    attemptNumber = Number(count ?? 0) + 1;
    dedupeKey = `${baseDedupeKey}:resend-${attemptNumber}`;
  } else {
    const existing = await getEventByDedupeKey(db, baseDedupeKey);
    if (existing && ACCEPTED_STATUSES.has(existing.status) && existing.provider_message_id) {
      await finaliseAcceptedDelivery(db, {
        report,
        emailEvent: existing,
        providerMessageId: existing.provider_message_id,
        provider: 'resend',
        recipient,
        attemptNumber: existing.attempt_number,
        testDelivery,
        actor: input.actor
      });
      return {
        emailEventId: existing.id,
        providerMessageId: existing.provider_message_id,
        recipient,
        reusedExistingSend: true,
        status: existing.status,
        testDelivery
      };
    }
    if (existing && IN_PROGRESS_STATUSES.has(existing.status)) {
      throw new Error(`Premium report email delivery is already ${existing.status}.`);
    }
    if (existing && existing.status === 'failed' && !existing.provider_message_id) {
      const nextAttempt = Number(existing.attempt_number ?? 1) + 1;
      const { data: reclaimed, error: reclaimError } = await db
        .from('email_events')
        .update({
          status: 'queued',
          attempt_number: nextAttempt,
          error_message: null,
          delivery_updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .eq('status', 'failed')
        .is('provider_message_id', null)
        .eq('attempt_number', existing.attempt_number)
        .select('id,status,provider_message_id,recipient_email,attempt_number')
        .maybeSingle();
      if (reclaimError) throw reclaimError;
      if (!reclaimed) throw new Error('Premium report email retry was claimed by another worker.');
      emailEvent = reclaimed;
      attemptNumber = nextAttempt;
    } else if (existing) {
      return {
        emailEventId: existing.id,
        providerMessageId: existing.provider_message_id,
        recipient,
        reusedExistingSend: true,
        status: existing.status,
        testDelivery
      };
    }
  }

  const eventMetadata = {
    actor_type: input.actor.actorType,
    actor_action: input.actor.action,
    report_reference: report.report_reference,
    order_reference: order?.order_reference ?? null,
    recipient_override_used: testDelivery,
    test_delivery: testDelivery,
    attachment_checksum: report.checksum
  };

  if (!emailEvent) {
    const { data: inserted, error: insertError } = await db
      .from('email_events')
      .insert({
        assessment_id: report.assessment_id,
        order_id: report.order_id,
        report_id: report.id,
        recipient_email: recipient,
        template_key: 'premium_report_pdf_v1',
        status: 'queued',
        notification_type: 'premium_report_pdf',
        dedupe_key: dedupeKey,
        attempt_number: attemptNumber,
        metadata_json: eventMetadata
      })
      .select('id,status,provider_message_id,recipient_email,attempt_number')
      .maybeSingle();

    if (insertError || !inserted) {
      const raced = await getEventByDedupeKey(db, dedupeKey);
      if (!raced) throw insertError ?? new Error('Email event could not be claimed.');
      if (ACCEPTED_STATUSES.has(raced.status) && raced.provider_message_id) {
        await finaliseAcceptedDelivery(db, {
          report,
          emailEvent: raced,
          providerMessageId: raced.provider_message_id,
          provider: 'resend',
          recipient,
          attemptNumber: raced.attempt_number,
          testDelivery,
          actor: input.actor
        });
        return {
          emailEventId: raced.id,
          providerMessageId: raced.provider_message_id,
          recipient,
          reusedExistingSend: true,
          status: raced.status,
          testDelivery
        };
      }
      throw new Error(`Premium report email delivery is already ${raced.status}.`);
    }
    emailEvent = inserted;
  }

  const { data: claimed, error: claimError } = await db
    .from('email_events')
    .update({ status: 'sending', error_message: null, delivery_updated_at: new Date().toISOString() })
    .eq('id', emailEvent.id)
    .eq('status', 'queued')
    .select('id,status,provider_message_id,recipient_email,attempt_number')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error('Premium report email delivery was claimed by another worker.');
  emailEvent = claimed;

  let providerMessageId: string | null = null;
  try {
    const { data: pdf, error: downloadError } = await db.storage
      .from(report.storage_bucket)
      .download(report.storage_path);
    if (downloadError || !pdf) throw new Error(`Report attachment download failed: ${downloadError?.message ?? 'no PDF returned'}`);

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    if (!pdfBuffer.length) throw new Error('Report attachment is empty.');
    if (pdfBuffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Report attachment exceeds the configured email size limit.');

    const copy = messageCopy({
      customerName: order?.customer_name ?? null,
      organisationName: order?.organisation_name ?? null,
      reportReference: report.report_reference
    });

    const provider = await transport({
      from: process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>',
      to: recipient,
      replyTo: process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || 'hello@mkfraud.co.za',
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
      attachment: {
        filename: safeFilename(`${report.report_reference}-MK-Fraud-Readiness-Report.pdf`),
        contentBase64: pdfBuffer.toString('base64')
      },
      idempotencyKey: dedupeKey.slice(0, 256),
      tags: [
        { name: 'message_type', value: 'premium_report_pdf' },
        { name: 'report_id', value: report.id.replace(/-/g, '') }
      ]
    });
    providerMessageId = provider.messageId;

    const sentAt = new Date().toISOString();
    const { error: eventUpdateError } = await db
      .from('email_events')
      .update({
        status: 'sent',
        provider_message_id: provider.messageId,
        sent_at: sentAt,
        delivery_updated_at: sentAt,
        error_message: null,
        metadata_json: { ...eventMetadata, provider: provider.provider }
      })
      .eq('id', emailEvent.id);
    if (eventUpdateError) throw eventUpdateError;

    await finaliseAcceptedDelivery(db, {
      report,
      emailEvent: { ...emailEvent, status: 'sent', provider_message_id: provider.messageId },
      providerMessageId: provider.messageId,
      provider: provider.provider,
      recipient,
      attemptNumber: emailEvent.attempt_number,
      testDelivery,
      actor: input.actor
    });

    return {
      emailEventId: emailEvent.id,
      providerMessageId: provider.messageId,
      recipient,
      reusedExistingSend: false,
      status: 'sent',
      testDelivery
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Email delivery failed.');
    const now = new Date().toISOString();

    if (providerMessageId) {
      await db.from('email_events').update({
        status: 'sent',
        provider_message_id: providerMessageId,
        sent_at: now,
        delivery_updated_at: now,
        error_message: `Provider accepted the message, but post-send persistence needs reconciliation: ${message}`
      }).eq('id', emailEvent.id);
    } else {
      await db.from('email_events').update({
        status: 'failed',
        error_message: message,
        delivery_updated_at: now
      }).eq('id', emailEvent.id);

      if (!testDelivery && input.actor.action === 'automatic_email' && report.fulfilment_id) {
        await db.from('report_fulfilments').update({
          status: 'failed',
          current_step: 'email_failed',
          last_error_code: 'email_delivery_failed',
          last_error_message: message,
          failed_at: now
        }).eq('id', report.fulfilment_id);
      }
    }
    throw error;
  }
}

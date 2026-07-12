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
};

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
  const recipient = normaliseEmail(
    input.recipientOverride ?? flags.testRecipientOverride ?? order?.customer_email
  );
  if (!recipient) throw new Error('No valid premium-report delivery recipient is configured.');

  const baseDedupeKey = `premium-report-delivery:${report.id}:${recipient}`;
  let dedupeKey = baseDedupeKey;
  let attemptNumber = 1;

  if (input.forceResend) {
    const { count, error: countError } = await db
      .from('email_events')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', report.id)
      .eq('notification_type', 'premium_report_pdf');
    if (countError) throw countError;
    attemptNumber = Number(count ?? 0) + 1;
    dedupeKey = `${baseDedupeKey}:resend-${attemptNumber}`;
  } else {
    const { data: existing, error: existingError } = await db
      .from('email_events')
      .select('id,status,provider_message_id,recipient_email')
      .eq('dedupe_key', baseDedupeKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && ['sending', 'sent', 'delivered'].includes(existing.status)) {
      return {
        emailEventId: existing.id,
        providerMessageId: existing.provider_message_id ?? null,
        recipient: existing.recipient_email,
        reusedExistingSend: true,
        status: existing.status
      };
    }
  }

  const eventInsert = {
    assessment_id: report.assessment_id,
    order_id: report.order_id,
    report_id: report.id,
    recipient_email: recipient,
    template_key: 'premium_report_pdf_v1',
    status: 'queued',
    notification_type: 'premium_report_pdf',
    dedupe_key: dedupeKey,
    attempt_number: attemptNumber,
    metadata_json: {
      actor_type: input.actor.actorType,
      actor_action: input.actor.action,
      report_reference: report.report_reference,
      order_reference: order?.order_reference ?? null,
      recipient_override_used: recipient !== normaliseEmail(order?.customer_email),
      attachment_checksum: report.checksum
    }
  };

  let { data: emailEvent, error: insertError } = await db
    .from('email_events')
    .insert(eventInsert)
    .select('id,status,provider_message_id,recipient_email')
    .single();

  if (insertError || !emailEvent) {
    const { data: raced, error: racedError } = await db
      .from('email_events')
      .select('id,status,provider_message_id,recipient_email')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();
    if (racedError || !raced) throw insertError ?? racedError ?? new Error('Email event could not be claimed.');
    if (!input.forceResend) {
      return {
        emailEventId: raced.id,
        providerMessageId: raced.provider_message_id ?? null,
        recipient: raced.recipient_email,
        reusedExistingSend: true,
        status: raced.status
      };
    }
    emailEvent = raced;
  }

  try {
    await db.from('email_events').update({ status: 'sending', error_message: null }).eq('id', emailEvent.id);

    const { data: pdf, error: downloadError } = await db.storage
      .from(report.storage_bucket)
      .download(report.storage_path);
    if (downloadError || !pdf) throw new Error(`Report attachment download failed: ${downloadError?.message ?? 'no PDF returned'}`);

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    if (!pdfBuffer.length) throw new Error('Report attachment is empty.');

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

    const sentAt = new Date().toISOString();
    await Promise.all([
      db.from('email_events').update({
        status: 'sent',
        provider_message_id: provider.messageId,
        sent_at: sentAt,
        delivery_updated_at: sentAt,
        metadata_json: {
          ...eventInsert.metadata_json,
          provider: provider.provider
        }
      }).eq('id', emailEvent.id),
      db.from('reports').update({ status: 'released', released_at: sentAt }).eq('id', report.id),
      report.fulfilment_id
        ? db.from('report_fulfilments').update({
          status: 'completed',
          current_step: 'email_sent',
          completed_at: sentAt,
          last_error_code: null,
          last_error_message: null
        }).eq('id', report.fulfilment_id)
        : Promise.resolve(),
      db.from('report_events').insert({
        report_id: report.id,
        event_type: input.forceResend ? 'email_resent' : 'email_sent',
        from_status: report.status,
        to_status: 'released',
        actor_user_id: input.actor.userId ?? null,
        note: `Premium report PDF accepted by ${provider.provider} for delivery.`,
        metadata_json: {
          email_event_id: emailEvent.id,
          provider_message_id: provider.messageId,
          recipient,
          attempt_number: attemptNumber
        }
      }),
      db.from('audit_logs').insert({
        actor_type: input.actor.actorType,
        actor_user_id: input.actor.userId ?? null,
        assessment_id: report.assessment_id,
        entity_table: 'email_events',
        entity_id: emailEvent.id,
        action: input.forceResend ? 'premium_report_email_resent' : 'premium_report_email_sent',
        after_json: {
          report_id: report.id,
          provider_message_id: provider.messageId,
          recipient,
          attempt_number: attemptNumber
        }
      })
    ]);

    return {
      emailEventId: emailEvent.id,
      providerMessageId: provider.messageId,
      recipient,
      reusedExistingSend: false,
      status: 'sent'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Email delivery failed.');
    await db.from('email_events').update({
      status: 'failed',
      error_message: message,
      delivery_updated_at: new Date().toISOString()
    }).eq('id', emailEvent.id);
    if (report.fulfilment_id) {
      await db.from('report_fulfilments').update({
        status: 'failed',
        current_step: 'email_failed',
        last_error_code: 'email_delivery_failed',
        last_error_message: message,
        failed_at: new Date().toISOString()
      }).eq('id', report.fulfilment_id);
    }
    throw error;
  }
}

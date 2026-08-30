import { sanitiseEventMetadata, trackAssessmentEvent, type AssessmentEventMetadata } from '@/lib/analytics/assessment-events';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export type InternalNotificationType =
  | 'assessment_completed'
  | 'eft_order_created'
  // Historical compatibility only: existing queued/sent rows carry these values. Current code
  // emits the tier-named events instead.
  | 'full_report_5000_selected'
  | 'personalised_report_50000_selected'
  | 'essential_selected'
  | 'comprehensive_selected'
  | 'advisory_enquiry_submitted'
  | 'comprehensive_order_created'
  | 'assessment_stalled_lead';

export type QueueInternalNotificationInput = {
  notificationType: InternalNotificationType;
  assessmentId: string;
  organisationId?: string | null;
  respondentId?: string | null;
  orderId?: string | null;
  dataRequestId?: string | null;
  reportId?: string | null;
  optionCode?: string | null;
  metadata?: AssessmentEventMetadata;
  recipientEmail?: string | null;
  dedupeKey?: string;
  strict?: boolean;
};

export type QueueInternalNotificationResult =
  | { ok: true; status: 'queued' | 'already_queued'; emailEventId?: string }
  | { ok: false; status: 'skipped_no_recipient' | 'failed'; error?: string };

export type InternalNotificationQueueDependencies = {
  /** Provider-free tests and assessment dispatch share the same already-created database client. */
  db?: any;
  trackAssessmentEventImpl?: typeof trackAssessmentEvent;
};

function configuredRecipient() {
  return process.env.MK_INTERNAL_LEADS_EMAIL?.trim() || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim() || null;
}

function segment(label: string, value?: string | null) {
  return `${label}:${value && value.trim() ? value.trim() : 'none'}`;
}

export function buildInternalNotificationDedupeKey(input: Pick<QueueInternalNotificationInput, 'notificationType' | 'assessmentId' | 'optionCode' | 'orderId' | 'dataRequestId' | 'reportId'>) {
  return [
    segment('internal_notification', input.notificationType),
    segment('assessment', input.assessmentId),
    segment('option', input.optionCode),
    segment('order', input.orderId),
    segment('data_request', input.dataRequestId),
    segment('report', input.reportId)
  ].join(':');
}

function templateKeyFor(notificationType: InternalNotificationType) {
  return `internal_${notificationType}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown notification queue error');
}

async function trackNotificationEvent(
  input: QueueInternalNotificationInput,
  eventType: 'internal_notification_queued' | 'internal_notification_failed',
  status: string,
  trackEvent: typeof trackAssessmentEvent
) {
  await trackEvent({
    eventType,
    assessmentId: input.assessmentId,
    organisationId: input.organisationId,
    respondentId: input.respondentId,
    orderId: input.orderId,
    dataRequestId: input.dataRequestId,
    reportId: input.reportId,
    optionCode: input.optionCode,
    metadata: {
      notification_type: input.notificationType,
      notification_status: status
    }
  });
}

export async function queueInternalNotification(
  input: QueueInternalNotificationInput,
  dependencies: InternalNotificationQueueDependencies = {}
): Promise<QueueInternalNotificationResult> {
  const recipient = input.recipientEmail?.trim() || configuredRecipient();
  if (!recipient) {
    return { ok: false, status: 'skipped_no_recipient', error: 'MK_INTERNAL_LEADS_EMAIL is not configured' };
  }

  const db = dependencies.db ?? (createSupabaseServiceClient() as any);
  const trackEvent = dependencies.trackAssessmentEventImpl ?? trackAssessmentEvent;
  const dedupeKey = input.dedupeKey ?? buildInternalNotificationDedupeKey(input);
  const metadata = sanitiseEventMetadata(input.metadata);

  try {
    const { data: existing, error: existingError } = await db
      .from('email_events')
      .select('id,status')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      await trackNotificationEvent(input, 'internal_notification_queued', 'already_queued', trackEvent);
      return { ok: true, status: 'already_queued', emailEventId: existing.id };
    }

    const { data: inserted, error: insertError } = await db
      .from('email_events')
      .insert({
        assessment_id: input.assessmentId,
        order_id: input.orderId ?? null,
        data_request_id: input.dataRequestId ?? null,
        report_id: input.reportId ?? null,
        recipient_email: recipient,
        template_key: templateKeyFor(input.notificationType),
        notification_type: input.notificationType,
        dedupe_key: dedupeKey,
        status: 'queued',
        metadata_json: {
          ...metadata,
          option_code: input.optionCode ?? null,
          phase: 'phase13_commercial_event_foundation',
          provider_send_attempted: false
        }
      })
      .select('id')
      .single();

    if (insertError) {
      const { data: racedExisting, error: racedSelectError } = await db
        .from('email_events')
        .select('id,status')
        .eq('dedupe_key', dedupeKey)
        .maybeSingle();
      if (racedSelectError || !racedExisting) throw insertError;
      await trackNotificationEvent(input, 'internal_notification_queued', 'already_queued', trackEvent);
      return { ok: true, status: 'already_queued', emailEventId: racedExisting.id };
    }

    await trackNotificationEvent(input, 'internal_notification_queued', 'queued', trackEvent);
    return { ok: true, status: 'queued', emailEventId: inserted?.id };
  } catch (error) {
    const message = errorMessage(error);
    console.error('Phase 13 internal notification queue failed', { notificationType: input.notificationType, message });
    await trackNotificationEvent(input, 'internal_notification_failed', 'failed', trackEvent).catch(() => null);
    if (input.strict) throw error;
    return { ok: false, status: 'failed', error: message };
  }
}

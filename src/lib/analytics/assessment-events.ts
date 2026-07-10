import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const ASSESSMENT_EVENT_TYPES = [
  'assessment_started',
  'assessment_submitted',
  'snapshot_viewed',
  'executive_summary_viewed',
  'report_options_opened',
  'report_option_selected',
  'full_report_5000_selected',
  'personalised_report_50000_selected',
  'eft_order_created',
  'payment_marked_received',
  'report_generated',
  'admin_report_downloaded',
  'report_emailed_to_customer',
  'internal_notification_queued',
  'internal_notification_sent',
  'internal_notification_failed'
] as const;

export type AssessmentEventType = typeof ASSESSMENT_EVENT_TYPES[number];

export type AssessmentEventMetadata = Record<string, unknown>;

export type TrackAssessmentEventInput = {
  eventType: AssessmentEventType;
  assessmentId: string;
  organisationId?: string | null;
  respondentId?: string | null;
  orderId?: string | null;
  dataRequestId?: string | null;
  reportId?: string | null;
  optionCode?: string | null;
  metadata?: AssessmentEventMetadata;
  strict?: boolean;
};

export type TrackAssessmentEventResult =
  | { ok: true; status: 'created' | 'updated'; eventId?: string }
  | { ok: false; status: 'failed' | 'skipped_missing_assessment'; error?: string };

const SAFE_METADATA_KEY_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

function segment(label: string, value?: string | null) {
  return `${label}:${value && value.trim() ? value.trim() : 'none'}`;
}

export function buildAssessmentEventDedupeKey(input: Pick<TrackAssessmentEventInput, 'assessmentId' | 'eventType' | 'optionCode' | 'orderId' | 'dataRequestId' | 'reportId'>) {
  return [
    segment('assessment', input.assessmentId),
    segment('event', input.eventType),
    segment('option', input.optionCode),
    segment('order', input.orderId),
    segment('data_request', input.dataRequestId),
    segment('report', input.reportId)
  ].join(':');
}

export function sanitiseEventMetadata(metadata?: AssessmentEventMetadata): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  if (!metadata || typeof metadata !== 'object') return safe;

  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEY_RE.test(key)) continue;
    if (value === null || typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'string') safe[key] = value.slice(0, 500);
  }

  return safe;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown event tracking error');
}

async function updateExistingEvent(db: any, existing: any, metadata: Record<string, string | number | boolean | null>) {
  const nextCount = Number(existing.event_count ?? 0) + 1;
  const mergedMetadata = {
    ...(existing.metadata_json && typeof existing.metadata_json === 'object' ? existing.metadata_json : {}),
    ...metadata
  };

  const { data, error } = await db
    .from('assessment_events')
    .update({
      event_count: nextCount,
      last_seen_at: new Date().toISOString(),
      metadata_json: mergedMetadata
    })
    .eq('id', existing.id)
    .select('id')
    .single();

  if (error) throw error;
  return data?.id as string | undefined;
}

export async function trackAssessmentEvent(input: TrackAssessmentEventInput): Promise<TrackAssessmentEventResult> {
  if (!input.assessmentId) {
    const result: TrackAssessmentEventResult = { ok: false, status: 'skipped_missing_assessment', error: 'assessmentId is required' };
    if (input.strict) throw new Error(result.error);
    return result;
  }

  const db = createSupabaseServiceClient() as any;
  const now = new Date().toISOString();
  const dedupeKey = buildAssessmentEventDedupeKey(input);
  const metadata = sanitiseEventMetadata(input.metadata);

  try {
    const { data: existing, error: selectError } = await db
      .from('assessment_events')
      .select('id,event_count,metadata_json')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (selectError) throw selectError;
    if (existing) {
      const eventId = await updateExistingEvent(db, existing, metadata);
      return { ok: true, status: 'updated', eventId };
    }

    const { data: inserted, error: insertError } = await db
      .from('assessment_events')
      .insert({
        assessment_id: input.assessmentId,
        organisation_id: input.organisationId ?? null,
        respondent_id: input.respondentId ?? null,
        order_id: input.orderId ?? null,
        data_request_id: input.dataRequestId ?? null,
        report_id: input.reportId ?? null,
        event_type: input.eventType,
        option_code: input.optionCode ?? null,
        dedupe_key: dedupeKey,
        metadata_json: metadata,
        first_seen_at: now,
        last_seen_at: now,
        event_count: 1
      })
      .select('id')
      .single();

    if (insertError) {
      const { data: racedExisting, error: racedSelectError } = await db
        .from('assessment_events')
        .select('id,event_count,metadata_json')
        .eq('dedupe_key', dedupeKey)
        .maybeSingle();
      if (racedSelectError || !racedExisting) throw insertError;
      const eventId = await updateExistingEvent(db, racedExisting, metadata);
      return { ok: true, status: 'updated', eventId };
    }

    return { ok: true, status: 'created', eventId: inserted?.id };
  } catch (error) {
    const message = errorMessage(error);
    console.error('Phase 13 assessment event tracking failed', { eventType: input.eventType, message });
    if (input.strict) throw error;
    return { ok: false, status: 'failed', error: message };
  }
}

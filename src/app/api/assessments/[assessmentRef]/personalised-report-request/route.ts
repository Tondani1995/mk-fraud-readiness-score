import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { COMMERCIAL_OPTION_CODES, commercialScoreBand } from '@/lib/snapshot/commercial-insights';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const ALLOWED_REASONS = new Set([
  'understand_control_weaknesses',
  'design_strengthen_programme',
  'respond_incident_audit_control',
  'prepare_governance_response',
  'review_policies_controls',
  'other'
]);

const ALLOWED_FOCUS_AREAS = new Set([
  'fraud_governance_oversight',
  'fraud_risk_identification_assessment',
  'operational_fraud_controls',
  'third_party_supplier_procurement_risk',
  'digital_identity_channel_fraud',
  'fraud_monitoring_detection',
  'incident_response_investigations',
  'fraud_culture_awareness',
  'other'
]);

const ALLOWED_CONTACT_METHODS = new Set(['email', 'phone', 'video_meeting']);
const ALLOWED_TIMEFRAMES = new Set(['within_one_week', 'within_two_weeks', 'within_one_month', 'exploring_options']);
const ACTIVE_STATUSES = ['received', 'open', 'in_review'];

function validateChoice(value: unknown, allowed: Set<string>, label: string, errors: string[]) {
  if (typeof value === 'string' && allowed.has(value)) return value;
  errors.push(`${label} must be one of the approved options.`);
  return null;
}

function validateFocusAreas(value: unknown, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push('At least one approved focus area is required.');
    return [];
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !ALLOWED_FOCUS_AREAS.has(item)) {
      errors.push('Focus areas must contain only approved options.');
      return [];
    }
    if (!seen.has(item)) {
      seen.add(item);
      cleaned.push(item);
    }
  }

  if (!cleaned.length) errors.push('At least one approved focus area is required.');
  return cleaned;
}

function cleanNote(value: unknown) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 800);
  return cleaned || null;
}

function makeRequestReference() {
  const year = new Date().getUTCFullYear();
  return `MKENQ-${year}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function selectActivePersonalisedRequest(db: any, assessmentId: string) {
  const { data, error } = await db
    .from('data_requests')
    .select('id,request_reference,status,created_at')
    .eq('assessment_id', assessmentId)
    .eq('request_type', 'personalised_report_50000')
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function updatePersonalisedRequest(db: any, existing: any, payload: Record<string, unknown>) {
  const { data, error } = await db
    .from('data_requests')
    .update({ ...payload, request_reference: existing.request_reference ?? makeRequestReference() })
    .eq('id', existing.id)
    .select('id,request_reference,status,created_at')
    .single();
  if (error) throw error;
  return data;
}

async function createOrUpdatePersonalisedRequest(input: {
  assessment: any;
  respondent: any | null;
  primaryReason: string;
  areasOfFocus: string[];
  preferredContactMethod: string;
  preferredConsultationTimeframe: string;
  notes: string | null;
}) {
  const db = createSupabaseServiceClient() as any;
  const existing = await selectActivePersonalisedRequest(db, input.assessment.id);

  const payload = {
    organisation_id: input.assessment.organisation_id,
    respondent_id: input.assessment.primary_respondent_id,
    requested_by_email: input.respondent?.email ?? null,
    primary_reason: input.primaryReason,
    areas_of_focus: input.areasOfFocus,
    preferred_contact_method: input.preferredContactMethod,
    preferred_consultation_timeframe: input.preferredConsultationTimeframe,
    consent_contact: true,
    notes: input.notes,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const data = await updatePersonalisedRequest(db, existing, payload);
    return { request: data, created: false };
  }

  const { data, error } = await db
    .from('data_requests')
    .insert({
      ...payload,
      assessment_id: input.assessment.id,
      request_type: 'personalised_report_50000',
      status: 'received',
      request_reference: makeRequestReference()
    })
    .select('id,request_reference,status,created_at')
    .single();

  if (!error) return { request: data, created: true };

  const racedExisting = await selectActivePersonalisedRequest(db, input.assessment.id);
  if (racedExisting) {
    const racedData = await updatePersonalisedRequest(db, racedExisting, payload);
    return { request: racedData, created: false };
  }

  throw error;
}

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!body?.snapshotToken) {
    return NextResponse.json({ ok: false, errors: ['Private snapshot link required.'] }, { status: 403 });
  }

  if (body?.consentContact !== true) {
    return NextResponse.json({ ok: false, errors: ['Consent is required before MK can follow up on a personalised report enquiry.'] }, { status: 400 });
  }

  const validationErrors: string[] = [];
  const primaryReason = validateChoice(body?.primaryReason, ALLOWED_REASONS, 'Primary reason', validationErrors);
  const areasOfFocus = validateFocusAreas(body?.areasOfFocus, validationErrors);
  const preferredContactMethod = validateChoice(body?.preferredContactMethod, ALLOWED_CONTACT_METHODS, 'Preferred contact method', validationErrors);
  const preferredConsultationTimeframe = validateChoice(body?.preferredConsultationTimeframe, ALLOWED_TIMEFRAMES, 'Preferred consultation timeframe', validationErrors);
  const notes = cleanNote(body?.notes);

  if (validationErrors.length || !primaryReason || !preferredContactMethod || !preferredConsultationTimeframe) {
    return NextResponse.json({ ok: false, errors: validationErrors }, { status: 400 });
  }

  const validation = await validateSnapshotToken({
    assessmentReference: params.assessmentRef,
    rawToken: body.snapshotToken,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    consume: false
  });

  if (!validation.ok) {
    return NextResponse.json({ ok: false, errors: ['Private snapshot link required.'] }, { status: 403 });
  }

  const assessment = validation.assessment;
  const snapshot = await loadFreeSnapshotByReference(assessment.assessment_reference, assessment.current_score_run_id);
  if (!snapshot) {
    return NextResponse.json({ ok: false, errors: ['Snapshot is not available.'] }, { status: 409 });
  }

  const db = createSupabaseServiceClient() as any;
  const { data: respondent } = assessment.primary_respondent_id
    ? await db.from('respondents').select('id,email,full_name').eq('id', assessment.primary_respondent_id).maybeSingle()
    : { data: null };

  try {
    const result = await createOrUpdatePersonalisedRequest({
      assessment,
      respondent,
      primaryReason,
      areasOfFocus,
      preferredContactMethod,
      preferredConsultationTimeframe,
      notes
    });

    const metadata = {
      assessment_reference: assessment.assessment_reference,
      request_reference: result.request.request_reference,
      source_section: 'personalised_report_enquiry',
      maturity_band: snapshot.finalMaturity,
      score_band: commercialScoreBand(snapshot.overallScore),
      critical_gap_indicator: snapshot.criticalGapCount > 0 || snapshot.capApplied,
      request_created: result.created
    };

    await Promise.all([
      trackAssessmentEvent({
        eventType: 'report_option_selected',
        assessmentId: assessment.id,
        organisationId: assessment.organisation_id,
        respondentId: assessment.primary_respondent_id,
        dataRequestId: result.request.id,
        optionCode: COMMERCIAL_OPTION_CODES.personalisedReport,
        metadata
      }),
      trackAssessmentEvent({
        eventType: 'personalised_report_50000_selected',
        assessmentId: assessment.id,
        organisationId: assessment.organisation_id,
        respondentId: assessment.primary_respondent_id,
        dataRequestId: result.request.id,
        optionCode: COMMERCIAL_OPTION_CODES.personalisedReport,
        metadata
      }),
      queueInternalNotification({
        notificationType: 'personalised_report_50000_selected',
        assessmentId: assessment.id,
        organisationId: assessment.organisation_id,
        respondentId: assessment.primary_respondent_id,
        dataRequestId: result.request.id,
        optionCode: COMMERCIAL_OPTION_CODES.personalisedReport,
        metadata
      }),
      db.from('audit_logs').insert({
        actor_type: 'respondent_token',
        assessment_id: assessment.id,
        entity_table: 'data_requests',
        entity_id: result.request.id,
        action: result.created ? 'personalised_report_enquiry_created' : 'personalised_report_enquiry_updated',
        after_json: {
          assessment_reference: assessment.assessment_reference,
          request_reference: result.request.request_reference,
          option_code: COMMERCIAL_OPTION_CODES.personalisedReport,
          payment_obligation: false,
          order_created: false,
          report_generation: false
        }
      })
    ]);

    return NextResponse.json({
      ok: true,
      requestReference: result.request.request_reference,
      status: result.request.status,
      message: 'MK Fraud Insights will review your assessment context and contact you to discuss the appropriate scope, information requirements, delivery approach and commercial proposal.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The personalised report enquiry could not be submitted.';
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500 });
  }
}

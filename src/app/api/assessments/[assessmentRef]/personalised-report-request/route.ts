import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { COMMERCIAL_OPTION_CODES, commercialScoreBand } from '@/lib/snapshot/commercial-insights';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const ALLOWED_REASONS = new Set([
  'board_or_executive_readout',
  'control_improvement_planning',
  'fraud_risk_review',
  'pre_audit_or_assurance',
  'other'
]);

const ALLOWED_FOCUS_AREAS = new Set([
  'governance',
  'people_and_culture',
  'process_controls',
  'technology_and_data',
  'detection_and_monitoring',
  'response_readiness',
  'third_party_risk'
]);

const ALLOWED_CONTACT_METHODS = new Set(['email', 'phone', 'video_call']);
const ALLOWED_TIMEFRAMES = new Set(['this_week', 'two_weeks', 'this_month', 'exploring']);
const ACTIVE_STATUSES = ['received', 'open', 'in_review'];

function cleanChoice(value: unknown, allowed: Set<string>, fallback: string) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

function cleanFocusAreas(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && ALLOWED_FOCUS_AREAS.has(item))
    .slice(0, 5);
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

async function createOrUpdatePersonalisedRequest(input: {
  assessment: any;
  organisation: any | null;
  respondent: any | null;
  primaryReason: string;
  areasOfFocus: string[];
  preferredContactMethod: string;
  preferredConsultationTimeframe: string;
  notes: string | null;
}) {
  const db = createSupabaseServiceClient() as any;

  const { data: existing, error: existingError } = await db
    .from('data_requests')
    .select('id,request_reference,status,created_at')
    .eq('assessment_id', input.assessment.id)
    .eq('request_type', 'personalised_report_50000')
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

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
    const { data, error } = await db
      .from('data_requests')
      .update({ ...payload, request_reference: existing.request_reference ?? makeRequestReference() })
      .eq('id', existing.id)
      .select('id,request_reference,status,created_at')
      .single();
    if (error) throw error;
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

  if (error) throw error;
  return { request: data, created: true };
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
  const [{ data: organisation }, { data: respondent }] = await Promise.all([
    db.from('organisations').select('legal_name,trading_name').eq('id', assessment.organisation_id).maybeSingle(),
    assessment.primary_respondent_id
      ? db.from('respondents').select('id,email,full_name').eq('id', assessment.primary_respondent_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const primaryReason = cleanChoice(body?.primaryReason, ALLOWED_REASONS, 'fraud_risk_review');
  const areasOfFocus = cleanFocusAreas(body?.areasOfFocus);
  const preferredContactMethod = cleanChoice(body?.preferredContactMethod, ALLOWED_CONTACT_METHODS, 'email');
  const preferredConsultationTimeframe = cleanChoice(body?.preferredConsultationTimeframe, ALLOWED_TIMEFRAMES, 'exploring');
  const notes = cleanNote(body?.notes);

  try {
    const result = await createOrUpdatePersonalisedRequest({
      assessment,
      organisation,
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
      message: 'Your personalised report enquiry has been received. MK Fraud Insights will review the assessment output and follow up with you directly.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The personalised report enquiry could not be submitted.';
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500 });
  }
}

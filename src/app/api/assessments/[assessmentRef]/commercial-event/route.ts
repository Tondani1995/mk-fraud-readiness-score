import { NextResponse } from 'next/server';
import { trackAssessmentEvent, type AssessmentEventType } from '@/lib/analytics/assessment-events';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { COMMERCIAL_OPTION_CODES, commercialScoreBand } from '@/lib/snapshot/commercial-insights';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';

const ALLOWED_EVENT_TYPES = new Set<AssessmentEventType>([
  'executive_summary_viewed',
  'report_options_opened',
  'report_option_selected',
  'full_report_5000_selected',
  'personalised_report_50000_selected'
]);

function cleanSourceSection(value: unknown) {
  if (typeof value !== 'string') return 'free_snapshot';
  return value.replace(/[^a-z0-9_.-]/gi, '').slice(0, 64) || 'free_snapshot';
}

function cleanOptionCode(value: unknown) {
  if (value === COMMERCIAL_OPTION_CODES.fullReport) return COMMERCIAL_OPTION_CODES.fullReport;
  if (value === COMMERCIAL_OPTION_CODES.personalisedReport) return COMMERCIAL_OPTION_CODES.personalisedReport;
  return null;
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

  const eventType = body?.eventType as AssessmentEventType;
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ ok: false, errors: ['Unsupported commercial event.'] }, { status: 400 });
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

  const optionCode = eventType === 'full_report_5000_selected'
    ? COMMERCIAL_OPTION_CODES.fullReport
    : eventType === 'personalised_report_50000_selected'
      ? COMMERCIAL_OPTION_CODES.personalisedReport
      : cleanOptionCode(body?.optionCode);

  if (eventType === 'report_option_selected' && !optionCode) {
    return NextResponse.json({ ok: false, errors: ['A supported report option is required.'] }, { status: 400 });
  }

  const metadata = {
    assessment_reference: assessment.assessment_reference,
    source_section: cleanSourceSection(body?.sourceSection),
    maturity_band: snapshot.finalMaturity,
    score_band: commercialScoreBand(snapshot.overallScore),
    critical_gap_indicator: snapshot.criticalGapCount > 0 || snapshot.capApplied
  };

  const tracked = await trackAssessmentEvent({
    eventType,
    assessmentId: assessment.id,
    organisationId: assessment.organisation_id,
    respondentId: assessment.primary_respondent_id,
    optionCode,
    metadata
  });

  if (eventType === 'full_report_5000_selected') {
    await queueInternalNotification({
      notificationType: 'full_report_5000_selected',
      assessmentId: assessment.id,
      organisationId: assessment.organisation_id,
      respondentId: assessment.primary_respondent_id,
      optionCode: COMMERCIAL_OPTION_CODES.fullReport,
      metadata
    });
  }

  if (eventType === 'personalised_report_50000_selected') {
    await queueInternalNotification({
      notificationType: 'personalised_report_50000_selected',
      assessmentId: assessment.id,
      organisationId: assessment.organisation_id,
      respondentId: assessment.primary_respondent_id,
      optionCode: COMMERCIAL_OPTION_CODES.personalisedReport,
      metadata
    });
  }

  return NextResponse.json({ ok: tracked.ok, status: tracked.status });
}

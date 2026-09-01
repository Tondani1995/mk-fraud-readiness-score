import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { trackAssessmentEvent, type AssessmentEventType } from '@/lib/analytics/assessment-events';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { COMMERCIAL_OPTION_CODES, commercialScoreBand } from '@/lib/snapshot/commercial-insights';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';

const ALLOWED_EVENT_TYPES = new Set<AssessmentEventType>([
  'executive_summary_viewed',
  'report_options_opened',
  'report_option_selected',
  'essential_selected',
  'comprehensive_selected',
  'advisory_selected'
]);

/**
 * Event names the already-deployed client may still send. They are accepted and translated to the
 * tier-named event so no analytics is lost during a rollout, but nothing is ever PERSISTED under
 * the legacy name from here.
 */
const LEGACY_EVENT_ALIASES: Record<string, AssessmentEventType> = {
  full_report_5000_selected: 'essential_selected'
};

/** Selection events that also notify MK internally. */
const SELECTION_EVENT_TIER: Partial<Record<AssessmentEventType, 'essential' | 'comprehensive'>> = {
  essential_selected: 'essential',
  comprehensive_selected: 'comprehensive'
};

function cleanSourceSection(value: unknown) {
  if (typeof value !== 'string') return 'free_snapshot';
  return value.replace(/[^a-z0-9_.-]/gi, '').slice(0, 64) || 'free_snapshot';
}

function cleanOptionCode(value: unknown) {
  if (value === COMMERCIAL_OPTION_CODES.essential || value === COMMERCIAL_OPTION_CODES.legacyFullReport) {
    return COMMERCIAL_OPTION_CODES.essential;
  }
  if (value === COMMERCIAL_OPTION_CODES.comprehensive) return COMMERCIAL_OPTION_CODES.comprehensive;
  if (value === COMMERCIAL_OPTION_CODES.advisory) return COMMERCIAL_OPTION_CODES.advisory;
  // The legacy personalised-report option belongs to the manual advisory enquiry flow, which this
  // route does not create orders for; it is still a valid selection to record.
  if (value === COMMERCIAL_OPTION_CODES.legacyPersonalisedReport) {
    return COMMERCIAL_OPTION_CODES.legacyPersonalisedReport;
  }
  return null;
}

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('assessment_write');
  if (frozen) return frozen;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!body?.snapshotToken) {
    return NextResponse.json({ ok: false, errors: ['Private snapshot link required.'] }, { status: 403 });
  }

  const requestedEventType = String(body?.eventType ?? '');
  const eventType = (LEGACY_EVENT_ALIASES[requestedEventType] ?? requestedEventType) as AssessmentEventType;
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

  const selectionTier = SELECTION_EVENT_TIER[eventType];
  const optionCode = selectionTier ?? cleanOptionCode(body?.optionCode);

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

  if (optionCode && (eventType === 'report_option_selected' || Boolean(selectionTier))) {
    await trackAssessmentEvent({
      eventType: 'product_selected',
      assessmentId: assessment.id,
      organisationId: assessment.organisation_id,
      respondentId: assessment.primary_respondent_id,
      optionCode,
      metadata
    });
  }

  if (selectionTier) {
    await queueInternalNotification({
      notificationType: selectionTier === 'comprehensive' ? 'comprehensive_selected' : 'essential_selected',
      assessmentId: assessment.id,
      organisationId: assessment.organisation_id,
      respondentId: assessment.primary_respondent_id,
      optionCode: selectionTier,
      metadata
    });
  }

  return NextResponse.json({ ok: tracked.ok, status: tracked.status });
}

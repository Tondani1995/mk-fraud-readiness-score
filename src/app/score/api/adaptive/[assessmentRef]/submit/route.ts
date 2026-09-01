import { after, NextResponse } from 'next/server';
import { submitAdaptiveAssessment } from '@/lib/adaptive/server';
import { createSnapshotTokenForAssessment } from '@/lib/respondent/tokens';
import { scoreAdaptiveSubmittedAssessment } from '@/lib/scoring/adaptive-scoring';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { notifyScoredAssessmentCompletion } from '@/lib/notifications/internal-assessment-notifications';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { recordProductionMonitorEvent } from '@/lib/monitoring/production-monitor';
import { safeErrorCategory } from '@/lib/monitoring/privacy';

async function safeTrack(input: Parameters<typeof trackAssessmentEvent>[0]) {
  try { await trackAssessmentEvent(input); } catch { /* observability is non-blocking */ }
}

async function safeMonitor(input: Parameters<typeof recordProductionMonitorEvent>[0]) {
  try { await recordProductionMonitorEvent(input); } catch { /* observability is non-blocking */ }
}

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 }); }
  if (!body?.token) return NextResponse.json({ ok: false, errors: ['adaptive_token_required'] }, { status: 403 });
  try {
    const result = await submitAdaptiveAssessment(params.assessmentRef, body.token, Number(body.expectedSaveSequence));
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    await safeTrack({
      eventType: 'snapshot_generation_started',
      assessmentId: result.assessmentId,
      organisationId: result.organisationId,
      respondentId: result.respondentId,
      metadata: { flow: 'adaptive', monitoring_synthetic: result.monitoringSynthetic }
    });
    const scored = await scoreAdaptiveSubmittedAssessment(params.assessmentRef, { runType: 'initial', createdByAdminId: null });
    if (!scored.ok) {
      await safeTrack({
        eventType: 'snapshot_generation_failed',
        assessmentId: result.assessmentId,
        organisationId: result.organisationId,
        respondentId: result.respondentId,
        metadata: { flow: 'adaptive', monitoring_synthetic: result.monitoringSynthetic, status: scored.status }
      });
      await safeMonitor({
        stage: 'snapshot_generation',
        outcome: 'fail',
        route: '/score/api/adaptive/[assessmentRef]/submit',
        httpStatus: scored.status,
        errorCategory: 'snapshot_generation_failure',
        deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA,
        synthetic: result.monitoringSynthetic
      });
      return NextResponse.json({ ok: false, errors: ['Assessment was submitted, but the readiness result could not be generated.'], scoringErrors: scored.errors }, { status: scored.status });
    }
    const snapshot = await loadFreeSnapshotByReference(params.assessmentRef, scored.scoreRunId);
    if (!snapshot) {
      await safeTrack({
        eventType: 'snapshot_generation_failed',
        assessmentId: result.assessmentId,
        organisationId: result.organisationId,
        respondentId: result.respondentId,
        metadata: { flow: 'adaptive', monitoring_synthetic: result.monitoringSynthetic, reason: 'snapshot_missing_after_score' }
      });
      await safeMonitor({
        stage: 'snapshot_generation',
        outcome: 'fail',
        route: '/score/api/adaptive/[assessmentRef]/submit',
        httpStatus: 500,
        errorCategory: 'snapshot_missing_after_score',
        deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA,
        synthetic: result.monitoringSynthetic
      });
      return NextResponse.json({ ok: false, errors: ['Assessment was scored, but the persisted result could not be loaded.'] }, { status: 500 });
    }
    await safeTrack({
      eventType: 'snapshot_generation_succeeded',
      assessmentId: result.assessmentId,
      organisationId: result.organisationId,
      respondentId: result.respondentId,
      metadata: { flow: 'adaptive', monitoring_synthetic: result.monitoringSynthetic, score_status: scored.result.resultStatus }
    });
    const completionNotificationInput = {
      assessmentReference: params.assessmentRef,
      scoreRunId: scored.scoreRunId,
      snapshotAvailable: true,
      adminUrl: new URL(`/score/admin/assessments/${encodeURIComponent(params.assessmentRef)}`, request.url).toString()
    };
    if (!result.monitoringSynthetic) {
      after(async () => {
        try {
          await notifyScoredAssessmentCompletion(completionNotificationInput);
        } catch (error) {
          console.error('assessment_completion_notification_failed', {
            assessmentReference: params.assessmentRef,
            scoreRunId: scored.scoreRunId,
            errorCategory: safeErrorCategory(error)
          });
        }
      });
    }
    const requestHeaders = new Headers(request.headers);
    const db = createSupabaseServiceClient();
    const { data: assessmentRow, error: assessmentError } = await db.from('assessments').select('id').eq('assessment_reference', params.assessmentRef).single();
    if (assessmentError || !assessmentRow) return NextResponse.json({ ok: false, errors: ['Assessment identity could not be loaded after scoring.'] }, { status: 500 });
    const snapshotToken = await createSnapshotTokenForAssessment({
      assessmentId: assessmentRow.id,
      assessmentReference: params.assessmentRef,
      ipAddress: requestHeaders.get('x-forwarded-for')
    });
    const origin = request.headers.get('x-forwarded-host') ? `${request.headers.get('x-forwarded-proto') ?? 'https'}://${request.headers.get('x-forwarded-host')}` : new URL(request.url).origin;
    const snapshotUrl = `${origin}/score/snapshot/${encodeURIComponent(params.assessmentRef)}?token=${encodeURIComponent(snapshotToken.rawToken)}`;
    return NextResponse.json({ ...result, status: 'scored', scoreRunId: scored.scoreRunId, runNumber: scored.runNumber, resultStatus: scored.result.resultStatus, snapshotTokenExpiresAt: snapshotToken.expiresAt, snapshotUrl, snapshot, completionNotification: { ok: true, status: 'scheduled_after_response' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adaptive_submit_failed';
    const knownClientError = message === 'adaptive_preview_only' || message === 'adaptive_staging_project_required' || message === 'adaptive_supabase_project_unresolved';
    const status = knownClientError ? 404 : message.includes('token') ? 403 : 500;
    const errorCategory = knownClientError ? message : safeErrorCategory(error);
    await safeMonitor({
      stage: 'adaptive_submit',
      outcome: 'fail',
      route: '/score/api/adaptive/[assessmentRef]/submit',
      httpStatus: status,
      errorCategory,
      deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA
    });
    return NextResponse.json({ ok: false, errors: [errorCategory] }, { status });
  }
}

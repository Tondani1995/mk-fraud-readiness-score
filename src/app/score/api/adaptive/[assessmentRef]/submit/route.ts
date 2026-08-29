import { after, NextResponse } from 'next/server';
import { submitAdaptiveAssessment } from '@/lib/adaptive/server';
import { createSnapshotTokenForAssessment } from '@/lib/respondent/tokens';
import { scoreAdaptiveSubmittedAssessment } from '@/lib/scoring/adaptive-scoring';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { notifyScoredAssessmentCompletion } from '@/lib/notifications/internal-assessment-notifications';

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 }); }
  if (!body?.token) return NextResponse.json({ ok: false, errors: ['adaptive_token_required'] }, { status: 403 });
  try {
    const result = await submitAdaptiveAssessment(params.assessmentRef, body.token, Number(body.expectedSaveSequence));
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    const scored = await scoreAdaptiveSubmittedAssessment(params.assessmentRef, { runType: 'initial', createdByAdminId: null });
    if (!scored.ok) return NextResponse.json({ ok: false, errors: ['Assessment was submitted, but the readiness result could not be generated.'], scoringErrors: scored.errors }, { status: scored.status });
    const snapshot = await loadFreeSnapshotByReference(params.assessmentRef, scored.scoreRunId);
    if (!snapshot) return NextResponse.json({ ok: false, errors: ['Assessment was scored, but the persisted result could not be loaded.'] }, { status: 500 });
    const completionNotificationInput = {
      assessmentReference: params.assessmentRef,
      scoreRunId: scored.scoreRunId,
      snapshotAvailable: true,
      adminUrl: new URL(`/score/admin/assessments/${encodeURIComponent(params.assessmentRef)}`, request.url).toString()
    };
    after(async () => {
      try {
        await notifyScoredAssessmentCompletion(completionNotificationInput);
      } catch (error) {
        console.error('assessment_completion_notification_failed', {
          assessmentReference: params.assessmentRef,
          scoreRunId: scored.scoreRunId,
          errorCategory: 'internal_notification_dispatch_failed',
          reason: error instanceof Error ? error.message : 'unknown'
        });
      }
    });
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
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === 'adaptive_preview_only' || message === 'adaptive_staging_project_required' || message === 'adaptive_supabase_project_unresolved' ? 404 : message.includes('token') ? 403 : 500 });
  }
}

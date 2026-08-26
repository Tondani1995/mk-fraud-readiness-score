import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { submitAssessment } from '@/lib/respondent/assessment-save';
import { createSnapshotTokenForAssessment } from '@/lib/respondent/tokens';
import { scoreSubmittedAssessment } from '@/lib/scoring/score-assessment';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { getOptionalServerEnv } from '@/lib/env/server';
import { notifyScoredAssessmentCompletion } from '@/lib/notifications/internal-assessment-notifications';

function normaliseScoreBase(value: string) {
  const cleaned = value.replace(/\/$/, '');
  return cleaned.endsWith('/score') ? cleaned : `${cleaned}/score`;
}

function publicScoreBaseUrlFor(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const requestUrl = new URL(request.url);
  const requestHost = forwardedHost ?? requestUrl.host;
  const requestOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;
  const requestScoreBase = normaliseScoreBase(requestOrigin);

  if (requestHost.endsWith('.vercel.app') || requestHost === 'localhost' || requestHost.startsWith('localhost:')) {
    return requestScoreBase;
  }

  const configured = getOptionalServerEnv('NEXT_PUBLIC_APP_URL', requestScoreBase);
  return normaliseScoreBase(configured);
}

function buildSnapshotUrl(request: Request, assessmentReference: string, rawToken: string) {
  const scoreBase = publicScoreBaseUrlFor(request).replace(/\/$/, '');
  const snapshotUrl = new URL(`${scoreBase}/snapshot/${encodeURIComponent(assessmentReference)}`);
  snapshotUrl.searchParams.set('token', rawToken);
  return snapshotUrl.toString();
}

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('assessment_submit');
  if (frozen) return frozen;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 });
  }

  const submitted = await submitAssessment({
    assessmentReference: params.assessmentRef,
    token: body?.token
  });

  if (!submitted.ok) {
    return NextResponse.json({ ok: false, errors: submitted.errors, progress: 'progress' in submitted ? submitted.progress : undefined }, { status: submitted.status });
  }

  const scored = await scoreSubmittedAssessment(submitted.assessmentReference, { runType: 'initial', createdByAdminId: null });
  if (!scored.ok) {
    return NextResponse.json({ ok: false, errors: ['Assessment was submitted, but the readiness score could not be generated.'], scoringErrors: scored.errors, assessmentReference: submitted.assessmentReference, progress: submitted.progress }, { status: scored.status });
  }

  const snapshot = await loadFreeSnapshotByReference(submitted.assessmentReference, scored.scoreRunId);
  if (!snapshot) {
    return NextResponse.json({ ok: false, errors: ['Assessment was scored, but the free snapshot could not be loaded from the persisted score run.'], assessmentReference: submitted.assessmentReference, scoreRunId: scored.scoreRunId, progress: submitted.progress }, { status: 500 });
  }

  const completionNotification = await notifyScoredAssessmentCompletion({
    assessmentReference: submitted.assessmentReference,
    scoreRunId: scored.scoreRunId,
    snapshotAvailable: true,
    adminUrl: new URL(`/score/admin/assessments/${encodeURIComponent(submitted.assessmentReference)}`, request.url).toString()
  }).catch((error) => {
    console.error('assessment_completion_notification_failed', {
      assessmentReference: submitted.assessmentReference,
      scoreRunId: scored.scoreRunId,
      errorCategory: 'internal_notification_dispatch_failed',
      reason: error instanceof Error ? error.message : 'unknown'
    });
    return { ok: false as const, status: 'notification_dispatch_failed' as const };
  });

  const requestHeaders = await headers();
  const snapshotToken = await createSnapshotTokenForAssessment({
    assessmentId: submitted.assessmentId,
    assessmentReference: submitted.assessmentReference,
    ipAddress: requestHeaders.get('x-forwarded-for')
  });
  const snapshotUrl = buildSnapshotUrl(request, submitted.assessmentReference, snapshotToken.rawToken);

  return NextResponse.json({
    ok: true,
    assessmentReference: submitted.assessmentReference,
    status: 'scored',
    submittedAt: submitted.submittedAt,
    progress: submitted.progress,
    scoreRunId: scored.scoreRunId,
    runNumber: scored.runNumber,
    snapshotTokenExpiresAt: snapshotToken.expiresAt,
    snapshotUrl,
    snapshot,
    completionNotification: {
      ok: completionNotification.ok,
      status: completionNotification.status
    }
  });
}

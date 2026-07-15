import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { submitAssessment } from '@/lib/respondent/assessment-save';
import { createSnapshotTokenForAssessment } from '@/lib/respondent/tokens';
import { scoreSubmittedAssessment } from '@/lib/scoring/score-assessment';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { getOptionalServerEnv } from '@/lib/env/server';

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

function buildSnapshotUrl(request: Request, assessmentReference: string, rawToken: string, embed?: string) {
  const scoreBase = publicScoreBaseUrlFor(request).replace(/\/$/, '');
  const snapshotUrl = new URL(`${scoreBase}/snapshot/${encodeURIComponent(assessmentReference)}`);
  snapshotUrl.searchParams.set('token', rawToken);
  if (embed === '1') snapshotUrl.searchParams.set('embed', '1');
  return snapshotUrl.toString();
}

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
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

  const requestHeaders = await headers();
  const snapshotToken = await createSnapshotTokenForAssessment({
    assessmentId: submitted.assessmentId,
    assessmentReference: submitted.assessmentReference,
    ipAddress: requestHeaders.get('x-forwarded-for')
  });
  const snapshotUrl = buildSnapshotUrl(request, submitted.assessmentReference, snapshotToken.rawToken, body?.embed);

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
    snapshot
  });
}

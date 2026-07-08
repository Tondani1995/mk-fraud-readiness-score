import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { submitAssessment } from '@/lib/respondent/assessment-save';
import { createSnapshotTokenForAssessment } from '@/lib/respondent/tokens';
import { scoreSubmittedAssessment } from '@/lib/scoring/score-assessment';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';

function buildSnapshotUrl(assessmentReference: string, rawToken: string, embed?: string) {
  const params = new URLSearchParams({ token: rawToken });
  if (embed === '1') params.set('embed', '1');
  return `/snapshot/${encodeURIComponent(assessmentReference)}?${params.toString()}`;
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

  const snapshotToken = await createSnapshotTokenForAssessment({
    assessmentId: submitted.assessmentId,
    assessmentReference: submitted.assessmentReference,
    ipAddress: headers().get('x-forwarded-for')
  });
  const snapshotUrl = buildSnapshotUrl(submitted.assessmentReference, snapshotToken.rawToken, body?.embed);

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

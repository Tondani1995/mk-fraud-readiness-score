import { NextResponse } from 'next/server';
import { submitAssessment } from '@/lib/respondent/assessment-save';
import { scoreSubmittedAssessment } from '@/lib/scoring/score-assessment';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';

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

  return NextResponse.json({
    ok: true,
    assessmentReference: submitted.assessmentReference,
    status: 'scored',
    submittedAt: submitted.submittedAt,
    progress: submitted.progress,
    scoreRunId: scored.scoreRunId,
    runNumber: scored.runNumber,
    snapshot
  });
}

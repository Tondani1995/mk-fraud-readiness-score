import { NextResponse } from 'next/server';
import { submitAssessment } from '@/lib/respondent/assessment-save';

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 });
  }

  const result = await submitAssessment({
    assessmentReference: params.assessmentRef,
    token: body?.token
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors, progress: 'progress' in result ? result.progress : undefined }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    assessmentReference: result.assessmentReference,
    status: result.status,
    submittedAt: result.submittedAt,
    progress: result.progress
  });
}

import { NextResponse } from 'next/server';
import { saveAssessmentDraft } from '@/lib/respondent/assessment-save';

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 });
  }

  const result = await saveAssessmentDraft({
    assessmentReference: params.assessmentRef,
    token: body?.token,
    answers: Array.isArray(body?.answers) ? body.answers : [],
    exposureAnswers: Array.isArray(body?.exposureAnswers) ? body.exposureAnswers : []
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors, progress: 'progress' in result ? result.progress : undefined }, { status: result.status });
  }

  return NextResponse.json({ ok: true, progress: result.progress });
}

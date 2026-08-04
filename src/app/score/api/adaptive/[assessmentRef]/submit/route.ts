import { NextResponse } from 'next/server';
import { submitAdaptiveAssessment } from '@/lib/adaptive/server';

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 }); }
  if (!body?.token) return NextResponse.json({ ok: false, errors: ['adaptive_token_required'] }, { status: 403 });
  try {
    const result = await submitAdaptiveAssessment(params.assessmentRef, body.token, Number(body.expectedSaveSequence));
    return NextResponse.json(result, { status: result.ok ? 200 : result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adaptive_submit_failed';
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === 'adaptive_preview_only' || message === 'adaptive_staging_project_required' ? 404 : message.includes('token') ? 403 : 500 });
  }
}

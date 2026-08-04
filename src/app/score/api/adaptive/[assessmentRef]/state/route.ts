import { NextResponse } from 'next/server';
import { getAdaptiveAssessmentState, saveAdaptiveAssessmentState } from '@/lib/adaptive/server';

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'adaptive_state_unavailable';
  const status = message === 'adaptive_preview_only' || message === 'adaptive_staging_project_required' ? 404 : message.includes('token') ? 403 : 500;
  return NextResponse.json({ ok: false, errors: [message] }, { status });
}

export async function GET(request: Request, { params }: { params: { assessmentRef: string } }) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ ok: false, errors: ['adaptive_token_required'] }, { status: 403 });
  try { return NextResponse.json({ ok: true, state: (await getAdaptiveAssessmentState(params.assessmentRef, token)).publicState }); } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 }); }
  if (!body?.token) return NextResponse.json({ ok: false, errors: ['adaptive_token_required'] }, { status: 403 });
  const result = await saveAdaptiveAssessmentState({
    assessmentReference: params.assessmentRef, token: body.token, expectedSaveSequence: Number(body.expectedSaveSequence),
    currentScreen: body.currentScreen, currentQuestionId: body.currentQuestionId ?? null,
    visitedQuestionIds: Array.isArray(body.visitedQuestionIds) ? body.visitedQuestionIds : [],
    gatewayAnswers: body.gatewayAnswers && typeof body.gatewayAnswers === 'object' ? body.gatewayAnswers : {},
    controlResponses: body.controlResponses && typeof body.controlResponses === 'object' ? body.controlResponses : {},
    confirmGatewayChange: body.confirmGatewayChange === true
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result);
}

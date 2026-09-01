import { NextResponse } from 'next/server';
import { getAdaptiveAssessmentState, saveAdaptiveAssessmentState } from '@/lib/adaptive/server';
import { recordProductionMonitorEvent } from '@/lib/monitoring/production-monitor';
import { isAuthorisedSyntheticMonitorRequest } from '@/lib/monitoring/signatures';
import { safeErrorCategory } from '@/lib/monitoring/privacy';

async function failure(error: unknown, request: Request, route: string) {
  const message = error instanceof Error ? error.message : 'adaptive_state_unavailable';
  try {
    await recordProductionMonitorEvent({
      stage: 'assessment_state',
      outcome: 'fail',
      route,
      httpStatus: 500,
      errorCategory: safeErrorCategory(error),
      deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA,
      synthetic: Boolean(isAuthorisedSyntheticMonitorRequest(request))
    });
  } catch {
    // Monitor persistence must never change the customer-facing failure path.
  }
  const status = message === 'adaptive_preview_only' || message === 'adaptive_staging_project_required' ? 404 : message.includes('token') ? 403 : 500;
  return NextResponse.json({ ok: false, errors: [message] }, { status });
}

export async function GET(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ ok: false, errors: ['adaptive_token_required'] }, { status: 403 });
  try { return NextResponse.json({ ok: true, state: (await getAdaptiveAssessmentState(params.assessmentRef, token)).publicState }); } catch (error) { return failure(error, request, '/score/api/adaptive/[assessmentRef]/state'); }
}

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 }); }
  if (!body?.token) return NextResponse.json({ ok: false, errors: ['adaptive_token_required'] }, { status: 403 });
  let result;
  try {
    result = await saveAdaptiveAssessmentState({
      assessmentReference: params.assessmentRef, token: body.token, expectedSaveSequence: Number(body.expectedSaveSequence),
      currentScreen: body.currentScreen, currentQuestionId: body.currentQuestionId ?? null,
      visitedQuestionIds: Array.isArray(body.visitedQuestionIds) ? body.visitedQuestionIds : [],
      gatewayAnswers: body.gatewayAnswers && typeof body.gatewayAnswers === 'object' ? body.gatewayAnswers : {},
      controlResponses: body.controlResponses && typeof body.controlResponses === 'object' ? body.controlResponses : {},
      confirmGatewayChange: body.confirmGatewayChange === true
    });
  } catch (error) {
    return failure(error, request, '/score/api/adaptive/[assessmentRef]/state');
  }
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result);
}

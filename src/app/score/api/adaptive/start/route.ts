import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { parseAdaptiveStartInput, startAdaptiveAssessment } from '@/lib/adaptive/server';
import { recordProductionMonitorEvent } from '@/lib/monitoring/production-monitor';
import { isAuthorisedSyntheticMonitorRequest } from '@/lib/monitoring/signatures';
import { safeErrorCategory } from '@/lib/monitoring/privacy';

const GENERIC_START_ERROR = 'We could not start your assessment right now. Please try again. If the problem continues, contact hello@mkfraud.co.za.';

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 }); }
  const parsed = parseAdaptiveStartInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });
  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'adaptive_assessment_start'), ...RATE_LIMITS.assessmentStartPerIp() },
    { key: `adaptive_assessment_start:email:${parsed.data.email}`, ...RATE_LIMITS.assessmentStartPerEmail() }
  ]);
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, errors: ['Too many assessments started recently. Please try again later.'] }, { status: 429 });
  const monitoringRunId = isAuthorisedSyntheticMonitorRequest(request);
  try {
    const result = await startAdaptiveAssessment(parsed.data, new URL(request.url).origin, { monitoringRunId });
    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('adaptive assessment start failed', { errorCategory: safeErrorCategory(error) });
    try {
      await recordProductionMonitorEvent({
        stage: 'assessment_start',
        outcome: 'fail',
        route: '/score/api/adaptive/start',
        httpStatus: 500,
        errorCategory: safeErrorCategory(error),
        deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA,
        synthetic: Boolean(monitoringRunId)
      });
    } catch {
      // Monitor persistence must never change the customer-facing failure path.
    }
    const internalMessage = error instanceof Error ? error.message : 'unknown_error';
    const environmentFailure = internalMessage === 'adaptive_preview_only' || internalMessage === 'adaptive_staging_project_required';
    return NextResponse.json({ ok: false, errors: [GENERIC_START_ERROR] }, { status: environmentFailure ? 404 : 500 });
  }
}

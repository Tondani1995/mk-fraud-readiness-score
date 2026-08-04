import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { parseAdaptiveStartInput, startAdaptiveAssessment } from '@/lib/adaptive/server';

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
  try {
    const result = await startAdaptiveAssessment(parsed.data, new URL(request.url).origin);
    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('adaptive assessment start failed', error);
    const message = error instanceof Error && error.message.startsWith('adaptive_') ? error.message : 'Adaptive assessment could not be started.';
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === 'adaptive_preview_only' || message === 'adaptive_staging_project_required' ? 404 : 500 });
  }
}

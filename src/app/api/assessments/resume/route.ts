import { NextResponse } from 'next/server';
import { validateResumeToken } from '@/lib/respondent/tokens';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function POST(request: Request) {
  let body: { assessmentReference?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }

  if (!body.assessmentReference || !body.token) {
    return NextResponse.json({ ok: false, reason: 'missing_reference_or_token' }, { status: 400 });
  }

  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'assessment_resume'), ...RATE_LIMITS.assessmentResumePerIp() },
    { key: `assessment_resume:ref:${body.assessmentReference}`, ...RATE_LIMITS.assessmentResumePerReference() }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
  }

  const result = await validateResumeToken({
    assessmentReference: body.assessmentReference,
    rawToken: body.token,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    assessment: {
      reference: result.assessment.assessment_reference,
      status: result.assessment.status,
      startedAt: result.assessment.started_at
    },
    organisation: result.organisation,
    respondent: result.respondent
  });
}

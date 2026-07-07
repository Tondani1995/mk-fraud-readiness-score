import { NextResponse } from 'next/server';
import { parseStartAssessmentInput } from '@/lib/respondent/validation';
import { startAccountlessAssessment } from '@/lib/respondent/start-assessment';
import { getOptionalServerEnv } from '@/lib/env/server';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';

function publicBaseUrlFor(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost && forwardedHost.includes('mkfraud.co.za')) {
    return `${forwardedProto}://${forwardedHost}/score`;
  }

  const url = new URL(request.url);
  const fallback = `${url.origin}/score`;
  return getOptionalServerEnv('NEXT_PUBLIC_APP_URL', fallback);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 });
  }

  const parsed = parseStartAssessmentInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });
  }

  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'assessment_start'), ...RATE_LIMITS.assessmentStartPerIp() },
    { key: `assessment_start:email:${parsed.data.email}`, ...RATE_LIMITS.assessmentStartPerEmail() }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, errors: ['Too many assessments started recently. Please try again later.'] }, { status: 429 });
  }

  try {
    const result = await startAccountlessAssessment(parsed.data, publicBaseUrlFor(request));
    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('assessments/start failed', error);
    const isDevSetupMessage = error instanceof Error && error.message.startsWith('No active methodology version found');
    const message = isDevSetupMessage ? error.message : 'Assessment could not be started. Please try again.';
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500 });
  }
}

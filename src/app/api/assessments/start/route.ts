import { NextResponse } from 'next/server';
import { parseStartAssessmentInput } from '@/lib/respondent/validation';
import { startAccountlessAssessment } from '@/lib/respondent/start-assessment';
import { getOptionalServerEnv } from '@/lib/env/server';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';

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
    const appBaseUrl = getOptionalServerEnv('NEXT_PUBLIC_APP_URL', new URL(request.url).origin);
    const result = await startAccountlessAssessment(parsed.data, appBaseUrl);
    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    // Log full detail server-side only. Do not return raw Supabase/Postgres error text to an
    // anonymous public endpoint - it can leak schema/constraint details. The one exception is
    // the deliberate "no active methodology version" dev-setup message, which is safe and
    // actionable to surface as-is.
    console.error('assessments/start failed', error);
    const isDevSetupMessage = error instanceof Error && error.message.startsWith('No active methodology version found');
    const message = isDevSetupMessage ? error.message : 'Assessment could not be started. Please try again.';
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500 });
  }
}

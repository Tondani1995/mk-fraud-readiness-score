import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies, getAdminRefreshTokenFromCookies, setAdminSessionCookies } from '@/lib/auth/session-cookies';
import { verifyMfaEnrollmentOrChallenge } from '@/lib/auth/mfa';
import { checkRateLimits, RATE_LIMITS } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await requireAdmin();

  const rateLimit = await checkRateLimits([
    { key: `admin_mfa_verify:admin:${admin.id}`, ...RATE_LIMITS.adminMfaVerifyPerAdmin() }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many verification attempts. Please wait and try again.' }, { status: 429 });
  }

  const accessToken = getAdminAccessTokenFromCookies();
  const refreshToken = getAdminRefreshTokenFromCookies();
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }

  let body: { factorId?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const factorId = body.factorId?.trim();
  const code = body.code?.trim();
  if (!factorId || !code || !/^[0-9]{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'A factor id and 6-digit code are required.' }, { status: 400 });
  }

  const result = await verifyMfaEnrollmentOrChallenge(accessToken, refreshToken, factorId, code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Verification issues a fresh aal2 session. Overwrite the stored cookies immediately, or the
  // browser keeps sending the old aal1 token and every AAL2-gated action still fails even though
  // MFA was just completed successfully.
  const response = NextResponse.json({ ok: true, aal: 'aal2' }, { headers: { 'Cache-Control': 'no-store' } });
  setAdminSessionCookies(response, {
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: result.expiresIn
  });
  return response;
}

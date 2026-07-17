import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies, getAdminRefreshTokenFromCookies } from '@/lib/auth/session-cookies';
import { listMfaFactors } from '@/lib/auth/mfa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  const accessToken = getAdminAccessTokenFromCookies();
  const refreshToken = getAdminRefreshTokenFromCookies();
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }

  const result = await listMfaFactors(accessToken, refreshToken);
  if (!result) {
    return NextResponse.json({ ok: false, error: 'Could not load MFA status.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    admin: { id: admin.id, role: admin.role },
    factors: result.factors,
    aal: result.aal
  }, { headers: { 'Cache-Control': 'no-store' } });
}

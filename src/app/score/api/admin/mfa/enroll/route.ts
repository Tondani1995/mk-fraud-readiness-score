import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies, getAdminRefreshTokenFromCookies } from '@/lib/auth/session-cookies';
import { beginMfaEnrollment } from '@/lib/auth/mfa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const admin = await requireAdmin();
  const accessToken = getAdminAccessTokenFromCookies();
  const refreshToken = getAdminRefreshTokenFromCookies();
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }

  const friendlyName = `mk-admin-${admin.email}-${Date.now()}`.slice(0, 100);
  const result = await beginMfaEnrollment(accessToken, refreshToken, friendlyName);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    factorId: result.factorId,
    qrCodeSvg: result.qrCodeSvg,
    secret: result.secret,
    otpauthUri: result.otpauthUri
  }, { headers: { 'Cache-Control': 'no-store' } });
}

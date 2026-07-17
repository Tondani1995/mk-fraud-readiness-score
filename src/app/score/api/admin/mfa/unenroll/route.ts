import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies, getAdminRefreshTokenFromCookies } from '@/lib/auth/session-cookies';
import { unenrollMfaFactor } from '@/lib/auth/mfa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  await requireAdmin();
  const accessToken = getAdminAccessTokenFromCookies();
  const refreshToken = getAdminRefreshTokenFromCookies();
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }

  let body: { factorId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const factorId = body.factorId?.trim();
  if (!factorId) {
    return NextResponse.json({ ok: false, error: 'A factor id is required.' }, { status: 400 });
  }

  const result = await unenrollMfaFactor(accessToken, refreshToken, factorId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

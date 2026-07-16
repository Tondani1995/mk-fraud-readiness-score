import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const ADMIN_ACCESS_COOKIE = 'mk_admin_access_token';
export const ADMIN_REFRESH_COOKIE = 'mk_admin_refresh_token';

const isProduction = process.env.NODE_ENV === 'production';

export function setAdminSessionCookies(response: NextResponse, session: { access_token: string; refresh_token?: string; expires_in?: number }) {
  response.cookies.set(ADMIN_ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: session.expires_in ?? 3600
  });

  if (session.refresh_token) {
    response.cookies.set(ADMIN_REFRESH_COOKIE, session.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });
  }
}

export function clearAdminSessionCookies(response: NextResponse) {
  response.cookies.set(ADMIN_ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  response.cookies.set(ADMIN_REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
}

export function getAdminAccessTokenFromCookies(): string | null {
  return cookies().get(ADMIN_ACCESS_COOKIE)?.value ?? null;
}

export function getAdminRefreshTokenFromCookies(): string | null {
  return cookies().get(ADMIN_REFRESH_COOKIE)?.value ?? null;
}

export function getAdminAccessTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? null;
}

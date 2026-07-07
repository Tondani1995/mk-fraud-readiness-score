import { NextResponse } from 'next/server';
import { clearAdminSessionCookies } from '@/lib/auth/session-cookies';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/admin/login', request.url), { status: 303 });
  clearAdminSessionCookies(response);
  return response;
}

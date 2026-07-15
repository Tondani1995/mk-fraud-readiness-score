import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const WEBSITE_ADMIN_COOKIE = 'mk_admin_token';

function websiteAdminLogin(request: NextRequest, nextPath: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', nextPath);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === '/score/api/readiness-runtime-check' || pathname === '/score/api/internal/uat-start-check') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return websiteAdminLogin(request, '/admin/insights');
    const token = request.cookies.get(WEBSITE_ADMIN_COOKIE)?.value;
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) return websiteAdminLogin(request, pathname);

    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.role !== 'admin') return websiteAdminLogin(request, '/admin/insights');
    } catch {
      return websiteAdminLogin(request, pathname);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/score/api/readiness-runtime-check', '/score/api/internal/uat-start-check']
};

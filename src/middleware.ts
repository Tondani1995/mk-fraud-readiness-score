import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/readiness-runtime-check' || request.nextUrl.pathname === '/api/internal/uat-start-check') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/readiness-runtime-check', '/api/internal/uat-start-check']
};

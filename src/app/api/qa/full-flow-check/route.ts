import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('run') !== 'mk-uat-full') return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, stage: 'route_created' });
}

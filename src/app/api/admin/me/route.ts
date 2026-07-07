import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, admin });
}

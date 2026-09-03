import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { ACCESS_TOKEN_ROLES, revokeAccessToken } from '@/lib/reports/delivery-recovery-service';

// Release C admin recovery: revoke a customer's secure report access link.
// ACCESS_TOKEN_ROLES matches revoke_customer_report_access_token()'s internal role check exactly.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const admin = await getAdminSession();
  if (!admin || !ACCESS_TOKEN_ROLES.includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to manage customer report access links.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const tokenId = String(body.tokenId ?? '');
  const reason = String(body.reason ?? '');
  if (!tokenId) {
    return NextResponse.json({ ok: false, reason: 'token_required', message: 'An access token id is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await revokeAccessToken(tokenId, reason);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, data: result.data, orderReference: params.orderReference }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

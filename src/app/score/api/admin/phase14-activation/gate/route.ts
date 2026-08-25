import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const frozen = await getRc1OperationFreezeResponse('activation_control');
  if (frozen) return frozen;

  await requireAdmin(['platform_admin']);
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }

  // Fast, friendly pre-check only. The real, authoritative AAL2 enforcement happens inside
  // set_phase14_security_gate_version -> phase14_require_actor in Postgres regardless of what
  // this check finds - this just avoids a round trip with a clearer error message.

  let body: { satisfiedVersion?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const satisfiedVersion = Number(body.satisfiedVersion);
  const reason = body.reason?.trim();
  if (!Number.isInteger(satisfiedVersion) || satisfiedVersion < 0 || !reason) {
    return NextResponse.json({ ok: false, error: 'A non-negative integer version and a reason are required.' }, { status: 400 });
  }

  const db = createSupabaseAuthenticatedServerClient(accessToken);
  const { data, error } = await db.rpc('set_phase14_security_gate_version', {
    p_satisfied_version: satisfiedVersion,
    p_reason: reason
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, gate: data }, { headers: { 'Cache-Control': 'no-store' } });
}

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { decodeAalClaimForDisplayOnly } from '@/lib/auth/mfa';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  await requireAdmin(['platform_admin']);
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }
  if (decodeAalClaimForDisplayOnly(accessToken) !== 'aal2') {
    return NextResponse.json({
      ok: false,
      error: 'phase14_aal2_required: your session is not MFA-verified. Step up on the Security page first.'
    }, { status: 403 });
  }

  let body: { provider?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const provider = body.provider?.trim();
  const enabled = body.enabled;
  if (!provider || typeof enabled !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'A provider and boolean enabled are required.' }, { status: 400 });
  }

  const db = createSupabaseAuthenticatedServerClient(accessToken);
  const { data, error } = await db.rpc('set_phase14_ai_route_policy', {
    p_provider: provider,
    p_enabled: enabled
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, route: data }, { headers: { 'Cache-Control': 'no-store' } });
}

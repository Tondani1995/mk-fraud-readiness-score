import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { decodeAalClaimForDisplayOnly } from '@/lib/auth/mfa';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mirrors update_phase14_feature_policy's own allow-list exactly (0017). Keeping this list here
// too, rather than relying solely on the database exception, gives a clean 400 instead of a raw
// Postgres error surfaced to the admin UI.
const VALID_SETTING_KEYS = new Set(['phase14_autonomous_report_engine', 'phase14_delivery_policy']);

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

  let body: { settingKey?: string; valueJson?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const settingKey = body.settingKey?.trim();
  if (!settingKey || !VALID_SETTING_KEYS.has(settingKey) || typeof body.valueJson !== 'object' || body.valueJson === null) {
    return NextResponse.json({ ok: false, error: 'A valid settingKey and object valueJson are required.' }, { status: 400 });
  }

  const db = createSupabaseAuthenticatedServerClient(accessToken);
  const { data, error } = await db.rpc('update_phase14_feature_policy', {
    p_setting_key: settingKey,
    p_value_json: body.valueJson
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, value: data }, { headers: { 'Cache-Control': 'no-store' } });
}

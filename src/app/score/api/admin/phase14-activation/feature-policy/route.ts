import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { decodeAalClaimForDisplayOnly } from '@/lib/auth/mfa';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_POLICY_KEYS = new Set([
  'manual_generation',
  'automatic_fulfilment',
  'ai_narrative',
  'automatic_email',
  'manual_delivery',
  'manual_download',
  'recipient_override',
  'provider_webhook_ingestion',
  'storage_cleanup'
]);

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

  let body: { policyKey?: string; enabled?: boolean; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const policyKey = body.policyKey?.trim();
  const enabled = body.enabled;
  const reason = body.reason?.trim();
  if (!policyKey || !VALID_POLICY_KEYS.has(policyKey) || typeof enabled !== 'boolean' || !reason) {
    return NextResponse.json({ ok: false, error: 'A valid policyKey, boolean enabled, and a reason are required.' }, { status: 400 });
  }

  const db = createSupabaseAuthenticatedServerClient(accessToken);
  const { data, error } = await db.rpc('set_phase14_feature_policy', {
    p_policy_key: policyKey,
    p_enabled: enabled,
    p_reason: reason
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policy: data }, { headers: { 'Cache-Control': 'no-store' } });
}

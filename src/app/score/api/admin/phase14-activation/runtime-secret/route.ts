import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mirrors set_phase14_runtime_secret's own allow-list exactly (0017, extended by
// 20260725090000). Kept here too so a bad secretKey gets a clean 400 instead of a raw Postgres
// exception surfaced to the admin UI -- the database check remains the authoritative one.
const VALID_SECRET_KEYS = new Set(['provider_webhook_db_hmac', 'provider_lookup_db_hmac']);
const MIN_SECRET_LENGTH = 32;

// This route never logs the request body, the secret value, or any error payload that could
// carry it. Next.js does not log route-handler bodies by default; this comment documents that
// the omission here is deliberate, not accidental, so a future edit doesn't casually add one.
export async function POST(request: Request) {
  await requireAdmin(['platform_admin']);
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: 'No active session.' }, { status: 401 });
  }

  // Fast, friendly pre-check only. The real, authoritative AAL2 + platform_admin enforcement
  // happens inside set_phase14_runtime_secret -> phase14_require_actor in Postgres regardless of
  // what this check finds -- see gate/route.ts for the same established pattern.

  let body: { secretKey?: string; secretValue?: string; confirmValue?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const secretKey = body.secretKey?.trim();
  const secretValue = body.secretValue ?? '';
  const confirmValue = body.confirmValue ?? '';
  const reason = body.reason?.trim();

  if (!secretKey || !VALID_SECRET_KEYS.has(secretKey)) {
    return NextResponse.json({ ok: false, error: 'A valid secretKey is required.' }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: 'A reason is required and is recorded in audit_logs.' }, { status: 400 });
  }
  if (secretValue.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ ok: false, error: `The secret value must be at least ${MIN_SECRET_LENGTH} characters.` }, { status: 400 });
  }
  if (secretValue !== confirmValue) {
    return NextResponse.json({ ok: false, error: 'The secret value and confirmation do not match.' }, { status: 400 });
  }

  const db = createSupabaseAuthenticatedServerClient(accessToken);
  const { data, error } = await db.rpc('set_phase14_runtime_secret', {
    p_secret_key: secretKey,
    p_secret_value: secretValue,
    p_reason: reason
  });

  if (error) {
    // error.message is a Postgres exception name (e.g. phase14_runtime_secret_too_short,
    // phase14_role_or_session_required:runtime_secret_rotation) -- it never contains the secret value, which
    // this route never passes to any logging or error-formatting path.
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // data is exactly { secret_key, rotated_at, fingerprint } -- the RPC itself never returns the
  // secret, so there is nothing further to strip here.
  return NextResponse.json({ ok: true, secret: data }, { headers: { 'Cache-Control': 'no-store' } });
}

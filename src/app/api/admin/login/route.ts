import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requireServerEnv } from '@/lib/env/server';
import { setAdminSessionCookies } from '@/lib/auth/session-cookies';
import { hashIpAddress, hashUserAgent } from '@/lib/security/hash';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: 'Email and password are required.' }, { status: 400 });
  }

  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'admin_login'), ...RATE_LIMITS.adminLoginPerIp() },
    { key: `admin_login:email:${email}`, ...RATE_LIMITS.adminLoginPerEmail() }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many login attempts. Please try again later.' }, { status: 429 });
  }

  const supabaseUrl = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password }),
    cache: 'no-store'
  });

  if (!authResponse.ok) {
    return NextResponse.json({ ok: false, error: 'Invalid admin credentials.' }, { status: 401 });
  }

  const session = await authResponse.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { id?: string; email?: string };
  };

  if (!session.user?.id || !session.access_token) {
    return NextResponse.json({ ok: false, error: 'Supabase did not return a valid session.' }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await service
    .from('admin_profiles')
    .select('id,email,full_name,role,status')
    .eq('id', session.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ ok: false, error: 'This user is not an active MK admin.' }, { status: 403 });
  }

  await service.from('audit_logs').insert({
    actor_type: 'admin',
    actor_user_id: profile.id,
    entity_table: 'admin_profiles',
    entity_id: profile.id,
    action: 'admin_login_success',
    after_json: { email: profile.email, role: profile.role },
    ip_hash: hashIpAddress(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null),
    user_agent_hash: hashUserAgent(request.headers.get('user-agent'))
  });

  const response = NextResponse.json({
    ok: true,
    admin: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role
    }
  });
  setAdminSessionCookies(response, session);
  return response;
}

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  ADMIN_ROLE_PRIORITY
} from '@/lib/auth/admin-route';
import { setAdminSessionCookies } from '@/lib/auth/session-cookies';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import type { AdminRole } from '@/lib/types/domain';
import {
  createSupabaseAnonServerClient,
  createSupabaseServiceClient
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_LOGIN_FAILURE = 'Unable to sign in with those credentials.';
const RATE_LIMIT_FAILURE = 'Unable to sign in right now. Please try again later.';
const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  status: string;
};

function failureResponse(status = 401, message = GENERIC_LOGIN_FAILURE) {
  return NextResponse.json({ ok: false, message }, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS
  });
}

function normalisedEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function emailRateLimitKey(email: string) {
  // Do not put the submitted email into a rate-limit key that could be surfaced by an error log.
  return `admin_login:email:${crypto.createHash('sha256').update(email, 'utf8').digest('hex')}`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failureResponse();
  }

  const submitted = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const email = normalisedEmail(submitted.email);
  const password = typeof submitted.password === 'string' ? submitted.password : '';
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return failureResponse();
  }

  let rateLimit: { allowed: boolean };
  try {
    rateLimit = await checkRateLimits([
      { key: getClientIpHashKey(request, 'admin_login'), ...RATE_LIMITS.adminLoginPerIp() },
      { key: emailRateLimitKey(email), ...RATE_LIMITS.adminLoginPerEmail() }
    ]);
  } catch {
    return failureResponse(500, RATE_LIMIT_FAILURE);
  }
  if (!rateLimit.allowed) return failureResponse(429, RATE_LIMIT_FAILURE);

  try {
    const anon = createSupabaseAnonServerClient();
    const { data: authData, error: authError } = await anon.auth.signInWithPassword({ email, password });
    const user = authData?.user;
    const session = authData?.session;
    const accessToken = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
    const expiresIn = typeof session?.expires_in === 'number' && Number.isFinite(session.expires_in) && session.expires_in > 0
      ? session.expires_in
      : null;
    const authEmail = normalisedEmail(user?.email);

    if (authError || !user?.id || !authEmail || !session || !accessToken || !expiresIn) {
      return failureResponse();
    }

    const service = createSupabaseServiceClient();
    const { data: profileData, error: profileError } = await service
      .from('admin_profiles')
      .select('id,email,full_name,role,status')
      .eq('id', user.id)
      .eq('status', 'active')
      .in('role', ADMIN_ROLE_PRIORITY)
      .maybeSingle();
    const profile = profileData as ProfileRecord | null;

    const profileRole = profile?.role;
    const profileEmail = normalisedEmail(profile?.email);
    const profileIsUsable = Boolean(
      !profileError
      && profile
      && profile.id === user.id
      && profile.status === 'active'
      && profileRole !== undefined
      && ADMIN_ROLE_PRIORITY.includes(profileRole)
      && profileEmail
      && profileEmail === authEmail
    );
    if (!profileIsUsable) return failureResponse();

    const response = NextResponse.json({ ok: true }, {
      status: 200,
      headers: PRIVATE_NO_STORE_HEADERS
    });
    setAdminSessionCookies(response, {
      access_token: accessToken,
      refresh_token: typeof session.refresh_token === 'string' && session.refresh_token.trim()
        ? session.refresh_token
        : undefined,
      expires_in: expiresIn
    });
    return response;
  } catch {
    // Authentication failures, profile failures and infrastructure failures stay generic. No
    // password, token, profile email or provider error is returned or logged by this route.
    return failureResponse(500, RATE_LIMIT_FAILURE);
  }
}

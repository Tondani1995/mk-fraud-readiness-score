import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from '@/lib/env/server';

export type MfaFactor = {
  id: string;
  factorType: string;
  friendlyName: string | null;
  status: 'verified' | 'unverified';
  createdAt: string;
};

export type AalStatus = {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  hasVerifiedFactor: boolean;
};

/**
 * Builds a Supabase client with a real, populated GoTrue session (not just a bearer-token
 * override). auth.mfa.enroll/challenge/verify/unenroll all read from the client's internal
 * session state via supabase-js's own session management, so a client built only with a
 * global Authorization header (see createSupabaseAuthenticatedServerClient) is not sufficient
 * for these calls - the session must be explicitly set.
 */
function createMfaClient(accessToken: string, refreshToken: string) {
  const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

/**
 * Decodes the `aal` claim directly from a Supabase Auth JWT, without any network call or
 * signature verification. This is a UX convenience only (fast, friendly error messages in the
 * admin UI) - it is never the source of authorization truth. The authoritative check always
 * happens server-side inside phase14_require_actor() in Postgres, which re-derives aal from the
 * verified session on every call. A forged or stale claim decoded here can, at worst, cause a
 * misleading UI hint; it cannot bypass any real permission, because nothing downstream trusts
 * this function's output for enforcement.
 */
export function decodeAalClaimForDisplayOnly(accessToken: string | null): 'aal1' | 'aal2' | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson) as { aal?: string; exp?: number };
    if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
    return payload.aal === 'aal2' ? 'aal2' : payload.aal === 'aal1' ? 'aal1' : null;
  } catch {
    return null;
  }
}

export async function listMfaFactors(accessToken: string, refreshToken: string): Promise<{
  factors: MfaFactor[];
  aal: AalStatus;
} | null> {
  const client = createMfaClient(accessToken, refreshToken);
  const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) return null;

  const [{ data: factorData, error: factorError }, { data: aalData, error: aalError }] = await Promise.all([
    client.auth.mfa.listFactors(),
    client.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (factorError || aalError) return null;

  const factors: MfaFactor[] = (factorData?.totp ?? []).map((f) => ({
    id: f.id,
    factorType: f.factor_type,
    friendlyName: f.friendly_name ?? null,
    status: f.status,
    createdAt: f.created_at
  }));

  function normalizeAal(value: string | null | undefined): 'aal1' | 'aal2' | null {
    return value === 'aal2' ? 'aal2' : value === 'aal1' ? 'aal1' : null;
  }

  return {
    factors,
    aal: {
      currentLevel: normalizeAal(aalData?.currentLevel),
      nextLevel: normalizeAal(aalData?.nextLevel),
      hasVerifiedFactor: factors.some((f) => f.status === 'verified')
    }
  };
}

export async function beginMfaEnrollment(accessToken: string, refreshToken: string, friendlyName: string) {
  const client = createMfaClient(accessToken, refreshToken);
  const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) return { ok: false as const, error: 'session_invalid' };

  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName
  });
  if (error || !data) return { ok: false as const, error: error?.message ?? 'enrollment_failed' };

  return {
    ok: true as const,
    factorId: data.id,
    qrCodeSvg: data.totp.qr_code,
    secret: data.totp.secret,
    otpauthUri: data.totp.uri
  };
}

export async function verifyMfaEnrollmentOrChallenge(
  accessToken: string,
  refreshToken: string,
  factorId: string,
  code: string
) {
  const client = createMfaClient(accessToken, refreshToken);
  const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) return { ok: false as const, error: 'session_invalid' };

  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) return { ok: false as const, error: challengeError?.message ?? 'challenge_failed' };

  const { data: verify, error: verifyError } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim()
  });
  if (verifyError || !verify) return { ok: false as const, error: verifyError?.message ?? 'invalid_code' };

  // A successful verify issues a brand new session whose JWT carries aal: 'aal2'. The caller
  // (the API route) is responsible for writing this new access/refresh token pair back into the
  // admin session cookies - without that step the browser would keep sending the old aal1 token
  // and every subsequent AAL2-gated action would still fail.
  return {
    ok: true as const,
    accessToken: verify.access_token,
    refreshToken: verify.refresh_token,
    expiresIn: verify.expires_in
  };
}

export async function unenrollMfaFactor(accessToken: string, refreshToken: string, factorId: string) {
  const client = createMfaClient(accessToken, refreshToken);
  const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) return { ok: false as const, error: 'session_invalid' };

  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

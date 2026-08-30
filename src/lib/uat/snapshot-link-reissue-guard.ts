import { createHash, timingSafeEqual } from 'node:crypto';

export const UAT_ASSESSMENT_REFERENCE = 'MKFRS-2026-3BCED59B03';
export const UAT_SUPABASE_PROJECT = 'penhenkzfrtmcxklodtu';
export const UAT_BRANCH = 'cx/v12-customer-experience-recovery-20260828';
export const UAT_BOUND_RELEASE_SHA = '6b659ed2b7235f5b0846b9894875ec9ded09794f';
export const UAT_SNAPSHOT_ORIGIN = 'https://mk-fraud-platform-7ipe3p8kf-tondanis-projects.vercel.app';

// Only the digest is committed. The corresponding 256-bit nonce is held by the one-shot runner
// long enough to make one HTTPS request and is never logged, persisted or returned by the route.
export const UAT_NONCE_SHA256 = '29df42cba16665f271b86c8bcf6ccf3e23678621868450c330cafb32c0c5bb0b';

export function supabaseProjectRef(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isUatPreviewBinding(input: {
  vercelEnv?: string;
  gitBranch?: string;
  publicSupabaseUrl?: string;
  serverSupabaseUrl?: string;
}) {
  return input.vercelEnv === 'preview'
    && input.gitBranch === UAT_BRANCH
    && supabaseProjectRef(input.publicSupabaseUrl) === UAT_SUPABASE_PROJECT
    && supabaseProjectRef(input.serverSupabaseUrl) === UAT_SUPABASE_PROJECT;
}

export function matchesUatNonce(nonce: string) {
  if (!nonce || nonce.length > 256) return false;
  const actual = createHash('sha256').update(nonce, 'utf8').digest();
  const expected = Buffer.from(UAT_NONCE_SHA256, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

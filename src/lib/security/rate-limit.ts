import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getNumberEnv } from '@/lib/env/server';

export type RateLimitCheck = {
  key: string;
  maxHits: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  key: string;
};

/**
 * Checks one or more rate-limit buckets and returns as soon as any of them is exceeded.
 * All checks still execute (each bucket's counter increments regardless), matching the
 * Blueprint's requirement to rate limit by IP hash, reference and email independently -
 * each dimension has its own budget rather than sharing one counter.
 */
export async function checkRateLimits(checks: RateLimitCheck[]): Promise<RateLimitResult> {
  const service = createSupabaseServiceClient();

  const results = await Promise.all(
    checks.map(async (check) => {
      const { data, error } = await service.rpc('check_rate_limit', {
        p_key: check.key,
        p_max_hits: check.maxHits,
        p_window_seconds: check.windowSeconds
      });

      if (error) {
        // Fail closed on unexpected errors would risk taking the whole app down if the
        // rate-limit table/function has an issue. Fail open (allow) but this is exactly
        // the kind of failure that should be visible - surface it to server logs.
        console.error('check_rate_limit RPC failed', { key: check.key, error });
        return { allowed: true, key: check.key };
      }

      return { allowed: data === true, key: check.key };
    })
  );

  const blocked = results.find((result) => !result.allowed);
  return blocked ?? { allowed: true, key: checks[0]?.key ?? '' };
}

type HeadersLike = { get(name: string): string | null };
type RequestLike = { headers: HeadersLike };

function hasHeaderGet(value: unknown): value is HeadersLike {
  return Boolean(value && typeof (value as HeadersLike).get === 'function');
}

function resolveHeadersSource(headersSource: Request | HeadersLike | RequestLike): HeadersLike | null {
  if (hasHeaderGet(headersSource)) return headersSource;

  const maybeRequest = headersSource as Partial<RequestLike>;
  if (hasHeaderGet(maybeRequest.headers)) return maybeRequest.headers;

  return null;
}

export function getClientIpHashKey(headersSource: Request | HeadersLike | RequestLike, prefix: string): string {
  const headers = resolveHeadersSource(headersSource);
  const forwardedFor = headers?.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  return `${prefix}:ip:${ip}`;
}

export const RATE_LIMITS = {
  adminLoginPerIp: () => ({ maxHits: getNumberEnv('RATE_LIMIT_ADMIN_LOGIN_PER_IP', 20), windowSeconds: 15 * 60 }),
  adminLoginPerEmail: () => ({ maxHits: getNumberEnv('RATE_LIMIT_ADMIN_LOGIN_PER_EMAIL', 10), windowSeconds: 15 * 60 }),
  assessmentStartPerIp: () => ({ maxHits: getNumberEnv('RATE_LIMIT_ASSESSMENT_START_PER_IP', 10), windowSeconds: 60 * 60 }),
  assessmentStartPerEmail: () => ({ maxHits: getNumberEnv('RATE_LIMIT_ASSESSMENT_START_PER_EMAIL', 5), windowSeconds: 60 * 60 }),
  assessmentResumePerIp: () => ({ maxHits: getNumberEnv('RATE_LIMIT_ASSESSMENT_RESUME_PER_IP', 30), windowSeconds: 15 * 60 }),
  assessmentResumePerReference: () => ({ maxHits: getNumberEnv('RATE_LIMIT_ASSESSMENT_RESUME_PER_REFERENCE', 20), windowSeconds: 15 * 60 }),
  // L5: deliberately NOT per-IP. Resend does not publish a fixed, stable set of
  // webhook-sending IP addresses this application can safely key a per-IP budget on, so a per-IP
  // limit here risks throttling legitimate delivery traffic without meaningfully stopping an
  // attacker who can rotate source IPs. Instead this is a single global volumetric ceiling across
  // all callers of the Resend webhook route -- a defense-in-depth backstop against unbounded
  // request volume, layered underneath (not instead of) the route's existing HMAC signature
  // verification, timestamp replay window and request-body size cap, which remain the primary
  // defenses and already reject the overwhelming majority of illegitimate traffic before this
  // budget is even consulted for cost. Sized generously (default 600/min = 10 req/s sustained)
  // relative to realistic Phase 14 launch volume; intended to be tightened once real production
  // traffic patterns are observed post-launch (see docs/v2/phase14-commercial-launch/
  // known-risks-and-launch-limitations.md, L5).
  resendWebhookGlobal: () => ({ maxHits: getNumberEnv('RATE_LIMIT_RESEND_WEBHOOK_GLOBAL_PER_MINUTE', 600), windowSeconds: 60 })
};

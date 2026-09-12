import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from '@/lib/env/server';

/** Never log database messages, bodies, identifiers, credentials, or query strings. */
export function monitorDatabaseError(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : '';
  const code = typeof value.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(value.code) ? value.code : null;
  return {
    code,
    reason: message.includes('gateway timeout') ? 'gateway_timeout'
      : message.includes('timeout') || message.includes('timed out') ? 'timeout'
        : message.includes('fetch') || message.includes('network') ? 'transport_failure'
          : code ? 'database_error' : 'unclassified_database_error'
  };
}

/** Only reads and explicitly idempotent monitor writes may be retried. */
export function monitorFetch(fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) : typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const safeWrite = method === 'POST' && (
      url.pathname === '/rest/v1/production_monitor_heartbeats'
      || url.pathname === '/rest/v1/production_monitor_notifications'
      || url.pathname === '/rest/v1/rpc/record_assessment_stalled_lead_alert'
    ) || method === 'PATCH' && url.pathname === '/rest/v1/production_monitor_notifications';
    const retryable = method === 'GET' || method === 'HEAD' || safeWrite;
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(input, init);
      if (!retryable || ![502, 503, 504].includes(response.status) || attempt >= 2) {
        if (!response.ok) console.error('monitor_database_request_failed', {
          status: response.status, method, attempts: attempt + 1,
          resource: /^\/rest\/v1\/(?:rpc\/)?[a-z_]+$/.test(url.pathname) ? url.pathname : '/unknown'
        });
        return response;
      }
      // A 504 can follow a committed write. Never retry counter increments or notification sends.
      await response.body?.cancel();
      await sleep(250 * (attempt + 1));
    }
  };
}

export function createMonitorDatabase() {
  return createClient(requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'), requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: monitorFetch() }
  });
}

export function monitorSelfHealth(previous: Record<string, any> | null, failed: boolean) {
  const failures = failed ? Number(previous?.self_failures ?? 0) + 1 : 0;
  const successes = failed ? 0 : Number(previous?.self_successes ?? 0) + 1;
  const active = failures >= 2 || previous?.self_active === true && successes < 2;
  return { self_failures: failures, self_successes: successes, self_active: active };
}

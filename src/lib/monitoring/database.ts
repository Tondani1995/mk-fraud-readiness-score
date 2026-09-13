import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from '@/lib/env/server';

/**
 * Monitoring database transport budget. One authoritative retry layer lives here:
 * - every attempt (headers AND body) is bounded by MONITOR_DATABASE_ATTEMPT_TIMEOUT_MS;
 * - retry-safe operations get at most one retry, other operations none;
 * - a client-wide budget and a consecutive-failure circuit stop a dead dependency from consuming
 *   the serverless window.
 * Final failures are returned as a synthetic non-retryable 504, never thrown, so postgrest-js's
 * own GET retry loop (thrown errors, 503, 520) never multiplies these attempts.
 */
export const MONITOR_DATABASE_ATTEMPT_TIMEOUT_MS = 8_000;
export const MONITOR_DATABASE_MAX_ATTEMPTS = 2;
export const MONITOR_DATABASE_RETRY_DELAY_MS = 250;
export const MONITOR_DATABASE_CIRCUIT_FAILURES = 3;
export const PRODUCTION_MONITOR_WORK_BUDGET_MS = 35_000;
export const PRODUCTION_MONITOR_TERMINAL_BUDGET_MS = 10_000;
export const PRODUCTION_READINESS_BUDGET_MS = 20_000;
export const STALLED_LEAD_MONITOR_BUDGET_MS = 40_000;

const RETRYABLE_STATUSES = new Set([502, 503, 504, 520]);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const DEPENDENCY_REASONS = new Set(['gateway_timeout', 'gateway_unavailable', 'timeout', 'transport_failure', 'budget_exhausted', 'circuit_open']);

export type MonitorFetchOptions = {
  attemptTimeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  /** Client-wide wall-clock budget, measured from client creation. */
  budgetMs?: number;
  circuitFailures?: number;
  clock?: () => number;
};

/** Never log database messages, bodies, identifiers, credentials, or query strings. */
export function monitorDatabaseError(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : '';
  const code = typeof value.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(value.code) ? value.code : null;
  const transport = message.match(/monitor_database_([a-z_]+)/)?.[1];
  return {
    code,
    reason: transport && DEPENDENCY_REASONS.has(transport) ? transport
      : message.includes('gateway timeout') ? 'gateway_timeout'
        : message.includes('timeout') || message.includes('timed out') ? 'timeout'
          : message.includes('fetch') || message.includes('network') ? 'transport_failure'
            : code ? 'database_error' : 'unclassified_database_error'
  };
}

/** A dependency outage is an unknown monitoring input, not evidence about customers or code. */
export function isMonitorDependencyFailure(error: unknown) {
  return DEPENDENCY_REASONS.has(monitorDatabaseError(error).reason);
}

type AttemptOutcome =
  | { kind: 'response'; response: Response }
  | { kind: 'failure'; reason: 'timeout' | 'transport_failure' }
  | { kind: 'caller_aborted'; error: unknown };

function abortError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');
}

async function attemptOnce(fetchImpl: typeof fetch, input: RequestInfo | URL, init: RequestInit | undefined, callerSignal: AbortSignal | null, timeoutMs: number): Promise<AttemptOutcome> {
  if (callerSignal?.aborted) return { kind: 'caller_aborted', error: abortError(callerSignal) };
  // Our own signal is always supplied: it bounds the socket and also keeps Next's GET dedupe layer
  // from teeing the body into a branch nobody reads (which made body.cancel() hang forever).
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop!: (outcome: AttemptOutcome) => void;
  const stopped = new Promise<AttemptOutcome>((resolve) => { stop = resolve; });
  const onCallerAbort = () => {
    controller.abort(callerSignal!.reason);
    stop({ kind: 'caller_aborted', error: abortError(callerSignal!) });
  };
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  timer = setTimeout(() => {
    controller.abort(new DOMException('monitor_database_timeout', 'TimeoutError'));
    stop({ kind: 'failure', reason: 'timeout' });
  }, Math.max(1, timeoutMs));
  const work = (async (): Promise<AttemptOutcome> => {
    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      // Buffer inside the bound so a stalled body cannot outlive the attempt timeout.
      const body = await response.arrayBuffer();
      return { kind: 'response', response: new Response(NULL_BODY_STATUSES.has(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers }) };
    } catch (error) {
      if (callerSignal?.aborted) return { kind: 'caller_aborted', error };
      return { kind: 'failure', reason: controller.signal.aborted ? 'timeout' : 'transport_failure' };
    }
  })();
  try {
    return await Promise.race([work, stopped]);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
    // An abandoned attempt must release its socket even if the implementation ignored the signal.
    if (!controller.signal.aborted) controller.abort();
  }
}

function transportFailureResponse(reason: string) {
  return new Response(JSON.stringify({ message: `monitor_database_${reason}`, code: '', details: null, hint: null }), {
    status: 504,
    statusText: 'Gateway Timeout',
    headers: { 'content-type': 'application/json', 'x-mk-monitor-transport': reason }
  });
}

/** Only reads and explicitly idempotent monitor writes may be retried. */
export function monitorFetch(
  fetchImpl: typeof fetch = fetch,
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  options: MonitorFetchOptions = {}
): typeof fetch {
  const clock = options.clock ?? Date.now;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? MONITOR_DATABASE_ATTEMPT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Math.min(MONITOR_DATABASE_MAX_ATTEMPTS, Math.floor(options.maxAttempts ?? MONITOR_DATABASE_MAX_ATTEMPTS)));
  const retryDelayMs = options.retryDelayMs ?? MONITOR_DATABASE_RETRY_DELAY_MS;
  const circuitFailures = options.circuitFailures ?? MONITOR_DATABASE_CIRCUIT_FAILURES;
  const deadline = options.budgetMs === undefined ? Number.POSITIVE_INFINITY : clock() + options.budgetMs;
  let consecutiveFailures = 0;

  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const safeWrite = method === 'POST' && (
      url.pathname === '/rest/v1/production_monitor_heartbeats'
      || url.pathname === '/rest/v1/production_monitor_notifications'
      || url.pathname === '/rest/v1/rpc/record_assessment_stalled_lead_alert'
    ) || method === 'PATCH' && url.pathname === '/rest/v1/production_monitor_notifications';
    // A 504 or timeout can follow a committed write. Never retry counter increments or notification sends.
    const retryable = method === 'GET' || method === 'HEAD' || safeWrite;
    const resource = /^\/rest\/v1\/(?:rpc\/)?[a-z_]+$/.test(url.pathname) ? url.pathname : '/unknown';
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
    let attempts = 0;
    let status: number | null = null;
    let reason = 'circuit_open';

    if (consecutiveFailures < circuitFailures) {
      for (;;) {
        const remaining = deadline - clock();
        if (remaining <= 0) { reason = 'budget_exhausted'; break; }
        attempts += 1;
        const outcome = await attemptOnce(fetchImpl, input, init, callerSignal, Math.min(attemptTimeoutMs, remaining));
        if (outcome.kind === 'caller_aborted') throw outcome.error;
        if (outcome.kind === 'response') {
          if (!RETRYABLE_STATUSES.has(outcome.response.status)) {
            consecutiveFailures = 0;
            if (!outcome.response.ok) console.error('monitor_database_request_failed', { status: outcome.response.status, reason: 'database_response', method, attempts, resource });
            return outcome.response;
          }
          status = outcome.response.status;
          reason = status === 504 ? 'gateway_timeout' : 'gateway_unavailable';
        } else {
          status = null;
          reason = outcome.reason;
        }
        if (!retryable || attempts >= maxAttempts) break;
        if (deadline - clock() <= retryDelayMs) { reason = 'budget_exhausted'; break; }
        await sleep(retryDelayMs);
      }
      consecutiveFailures += 1;
    }
    console.error('monitor_database_request_failed', { status, reason, method, attempts, resource });
    return transportFailureResponse(reason);
  };
}

export function createMonitorDatabase(options: MonitorFetchOptions & { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}) {
  const { fetchImpl, sleep, ...transport } = options;
  return createClient(requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'), requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: monitorFetch(fetchImpl ?? fetch, sleep, transport) }
  });
}

export function monitorSelfHealth(previous: Record<string, any> | null, failed: boolean) {
  const failures = failed ? Number(previous?.self_failures ?? 0) + 1 : 0;
  const successes = failed ? 0 : Number(previous?.self_successes ?? 0) + 1;
  const active = failures >= 2 || previous?.self_active === true && successes < 2;
  return { self_failures: failures, self_successes: successes, self_active: active };
}

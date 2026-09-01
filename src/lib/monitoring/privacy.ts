const SENSITIVE_KEY_RE = /(?:name|email|phone|mobile|organisation|organization|company|answer|response|token|cookie|authorization|password|secret|invoice|customer|respondent|address|notes|free.?text|content|prompt|input|output)/i;
const SAFE_ROUTE_RE = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,240}$/;
const SAFE_ERROR_NAME_RE = /^(?:Error|TypeError|ReferenceError|RangeError|SyntaxError|NetworkError|AbortError)$/;

export function sanitiseMonitoringRoute(value: unknown) {
  if (typeof value !== 'string') return '/unknown';
  let route = value.split('?')[0].split('#')[0];
  // Use URL-safe route placeholders so sanitisation never falls back to /unknown for a valid
  // dynamic application path.
  route = route.replace(/MKFRS-[A-Z0-9-]+/gi, ':assessment');
  route = route.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
  return SAFE_ROUTE_RE.test(route) ? route.slice(0, 240) : '/unknown';
}

export function sanitiseMonitoringValue(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || SENSITIVE_KEY_RE.test(trimmed)) return null;
  return trimmed.replace(/[\r\n\t]/g, ' ');
}

export function sanitiseMonitoringDetails(input: unknown): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return safe;

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(key) || !/^[A-Za-z0-9_.-]{1,64}$/.test(key)) continue;
    if (value === null || typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'string' && value.length <= 240 && !SENSITIVE_KEY_RE.test(value)) {
      safe[key] = value.replace(/[\r\n\t]/g, ' ');
    }
  }
  return safe;
}

export function safeErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('network') || message.includes('fetch')) return 'network_failure';
  if (message.includes('token') || message.includes('author')) return 'authorisation_failure';
  if (message.includes('database') || message.includes('supabase') || message.includes('postgres')) return 'database_failure';
  if (message.includes('adaptive') || message.includes('graph')) return 'adaptive_configuration_failure';
  if (message.includes('snapshot') || message.includes('score')) return 'snapshot_generation_failure';
  return 'unclassified_server_error';
}

export function sanitiseClientErrorPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const errorName = typeof record.name === 'string' && SAFE_ERROR_NAME_RE.test(record.name) ? record.name : 'Error';
  const route = sanitiseMonitoringRoute(record.route);
  const errorCategory = typeof record.errorCategory === 'string' && /^[a-z0-9_.-]{1,80}$/.test(record.errorCategory)
    ? record.errorCategory
    : 'uncaught_client_exception';
  return { errorName, route, errorCategory };
}

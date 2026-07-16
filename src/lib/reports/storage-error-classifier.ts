export type Phase14StorageResultClass =
  | 'object_present'
  | 'object_not_found'
  | 'authentication_failure'
  | 'authorization_failure'
  | 'rate_limited'
  | 'timeout'
  | 'network_failure'
  | 'provider_outage'
  | 'malformed_response'
  | 'checksum_read_failure'
  | 'unknown_provider_error'
  | 'delete_accepted';

// L7: the classification logic below was already fail-safe by construction --
// 'object_not_found' (the only class every caller treats as "deletion confirmed") requires a
// narrow, specific match (HTTP 404 AND one of a small set of exact provider codes/messages), and
// every other branch, including the catch-all default, resolves to a class every caller
// correctly treats as "not confirmed" rather than "confirmed absent". This wraps the whole
// function in a try/catch so that a genuinely malformed or exotic `error` value (a Proxy with a
// throwing property-access trap, a getter that throws, or any other shape that makes property
// access itself throw rather than merely return undefined) cannot let an exception escape past
// this classifier and crash the caller -- it now degrades to the same safe 'unknown_provider_error'
// default a merely-unrecognised (but non-throwing) error already receives, rather than a raw,
// unhandled exception propagating into whatever code called this function.
export function classifySupabaseStorageResult(error: unknown): Phase14StorageResultClass {
  try {
    if (!error) return 'object_present';
    const value = error as Record<string, unknown>;
    const status = Number(value.statusCode ?? value.status ?? 0);
    const code = String(value.code ?? value.error ?? '').trim();
    const message = String(value.message ?? '').trim();

    // Supabase Storage's documented object-missing response is HTTP 404.  A
    // message alone is never accepted unless it is the provider's exact object
    // missing response and is accompanied by 404.
    if (status === 404 && (
      ['404', 'not_found', 'NoSuchKey'].includes(code)
      || /^object not found$/i.test(message)
    )) return 'object_not_found';
    if (status === 401 || /invalid.*(jwt|token)|authentication/i.test(message)) return 'authentication_failure';
    if (status === 403 || /permission denied|not authorized|forbidden/i.test(message)) return 'authorization_failure';
    if (status === 429 || /rate.?limit/i.test(message)) return 'rate_limited';
    if (/timeout|timed out|aborterror/i.test(`${code} ${message}`)) return 'timeout';
    if (/dns|enotfound|econnreset|econnrefused|network|fetch failed/i.test(`${code} ${message}`)) {
      return 'network_failure';
    }
    if (status >= 500 && status <= 599) return 'provider_outage';
    if (status >= 200 && status <= 299) return 'malformed_response';
    return 'unknown_provider_error';
  } catch {
    return 'unknown_provider_error';
  }
}

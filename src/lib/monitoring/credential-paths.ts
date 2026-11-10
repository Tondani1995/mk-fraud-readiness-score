/**
 * Paths whose segment after a known prefix is itself a credential. The review track's role links are
 * /review/s/<token> (and its /snapshot suffix) with the matching API at /review/api/s/<token>, /snapshot and /export.
 * Every telemetry boundary (client error capture, monitoring intake, Sentry, analytics) replaces that segment before a
 * path leaves the page or the server, and keeps the rest of the path so the route stays diagnosable.
 *
 * The legacy report-access route (/score/report/access/<token>) keeps its existing handling in analytics-url.ts.
 */
export const CREDENTIAL_PATH_PREFIXES = ['/review/s/', '/review/api/s/'] as const;

const ESCAPED = CREDENTIAL_PATH_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
/** Matches a prefix and its credential segment anywhere in a string, including inside full URLs and messages. */
const CREDENTIAL_SEGMENT_RE = new RegExp(`(${ESCAPED.join('|')})(?!:token\\b|\\[token\\]|\\[redacted\\])[^/?#\\s"'<>]+`, 'g');

/** Replaces the credential segment of every review path in `value`. Non-strings are returned unchanged. */
export function redactCredentialPaths<T>(value: T, placeholder = ':token'): T {
  if (typeof value !== 'string') return value;
  return value.replace(CREDENTIAL_SEGMENT_RE, (_match, prefix: string) => `${prefix}${placeholder}`) as unknown as T;
}

/** The current page's path for telemetry, with any credential segment replaced. */
export function telemetryPathname(pathname: string | null | undefined, placeholder = ':token') {
  if (!pathname) return '/unknown';
  return redactCredentialPaths(pathname.split('?')[0].split('#')[0], placeholder);
}

/**
 * Plain JavaScript for inline bootstraps that run before any bundle. Generated from the same prefix list so the two
 * cannot drift; the privacy tests execute it against the TypeScript implementation.
 */
export function credentialPathRedactionScript(functionName = 'mkRedactCredentialPaths') {
  return `
                  var mkCredentialSegment = new RegExp(${JSON.stringify(CREDENTIAL_SEGMENT_RE.source)}, 'g');
                  function ${functionName}(value, placeholder) {
                    if (typeof value !== 'string') return value;
                    return value.replace(mkCredentialSegment, function (_m, prefix) { return prefix + (placeholder || ':token'); });
                  }`;
}

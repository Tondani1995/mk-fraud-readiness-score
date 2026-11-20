/**
 * Analytics URL privacy boundary.
 *
 * Private Fraud Readiness links carry bearer credentials in the query string (the Snapshot,
 * assessment, result, Advisory and order links all use `?token=`). gtag attaches the document URL
 * to its hits, so a consenting visitor on a private page would otherwise send the credential to
 * GA4 as page_location or page_referrer.
 *
 * Every URL handed to GA passes through sanitiseAnalyticsUrl(). It removes only the parameters
 * listed here and keeps everything else, so public pages and acquisition attribution (utm_*,
 * gclid, gbraid, wbraid, fbclid, Contact's ?enquiry=) are unchanged. Removed values are never
 * logged or returned.
 *
 * Limit, verified against the live Google tag on 2026-10-07: Enhanced Measurement's own
 * "page changes based on browser history events" page_view reads location.href directly and ignores
 * a set or config page_location. That one GA-generated hit can only be covered by the GA4 web
 * stream's "Redact data → query parameters" setting (or by turning that Enhanced Measurement option
 * off); no tag parameter reaches it.
 */

import { credentialPathRedactionScript, redactCredentialPaths } from '../monitoring/credential-paths';

/** Query/fragment parameter names that carry a credential or a private record identifier. */
export const SENSITIVE_ANALYTICS_PARAMETERS = [
  // Private Snapshot / assessment / result / Advisory / order / paid-order-status links.
  'token',
  'snapshottoken',
  'access_token',
  'accesstoken',
  'refresh_token',
  // Supabase/OAuth auth callbacks and one-time codes.
  'code',
  'otp',
  'token_hash',
  // QA recovery capture (middleware.ts) — a capture secret, not attribution.
  'confirm',
  '__mk_capture',
  // Private order identifiers on order and payment-return links.
  'orderreference',
  'order_reference',
  // The assessment reference on revised order and Advisory links (?ref=MKFRS-...): an identifier for one customer's
  // assessment. Not a credential, but never sent (20 November 2026).
  'ref'
] as const;

/**
 * MK assessment and order references (MKFRS-2026-..., MKORD-2026-...) identify one customer's assessment or order.
 * Wherever they appear as a path segment (/score/order/<ref>, /score/advisory/<ref>), the segment is redacted.
 */
export const MK_REFERENCE_SEGMENT_SOURCE = '^MK(?:FRS|ORD)-\\d{4}-[A-Z0-9]+$';
const MK_REFERENCE_SEGMENT = new RegExp(MK_REFERENCE_SEGMENT_SOURCE, 'i');

function redactReferenceSegments(pathname: string, replacement: string) {
  return pathname.split('/').map((segment) => {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* keep the raw segment */ }
    return MK_REFERENCE_SEGMENT.test(decoded) ? replacement : segment;
  }).join('/');
}

const SENSITIVE = new Set<string>(SENSITIVE_ANALYTICS_PARAMETERS);

/**
 * Path segments that are themselves credentials (the report access route is /score/report/access/<token>). Review role
 * links are handled by credential-paths.ts, which keeps the path suffix.
 */
const SENSITIVE_PATH_PREFIXES = ['/score/report/access/'] as const;

export const REDACTED_PATH_SEGMENT = '[redacted]';

function isSensitive(name: string) {
  return SENSITIVE.has(name.toLowerCase());
}

function stripParams(search: string) {
  const params = new URLSearchParams(search);
  for (const name of Array.from(params.keys())) {
    if (isSensitive(name)) params.delete(name);
  }
  return params.toString();
}

/**
 * Returns the URL with sensitive parameters removed, or undefined when there is no usable URL.
 * Relative input is resolved against `base`. Anything unparseable is dropped rather than sent.
 */
export function sanitiseAnalyticsUrl(url: string | null | undefined, base?: string): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = base ? new URL(url, base) : new URL(url);
  } catch {
    return undefined;
  }

  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    if (parsed.pathname.startsWith(prefix) && parsed.pathname.length > prefix.length) {
      parsed.pathname = `${prefix}${REDACTED_PATH_SEGMENT}`;
    }
  }
  // Review role links (/review/s/<token>, /review/api/s/<token>) keep their suffix but lose the credential segment.
  parsed.pathname = redactCredentialPaths(parsed.pathname, REDACTED_PATH_SEGMENT);
  parsed.pathname = redactReferenceSegments(parsed.pathname, REDACTED_PATH_SEGMENT);

  if (parsed.search) {
    const kept = stripParams(parsed.search);
    parsed.search = kept ? `?${kept}` : '';
  }

  // A fragment is only rewritten when it carries key=value pairs (auth callbacks put tokens there);
  // a plain in-page anchor such as #health-check is left alone.
  if (parsed.hash && parsed.hash.includes('=')) {
    const kept = stripParams(parsed.hash.slice(1));
    parsed.hash = kept ? `#${kept}` : '';
  }

  return parsed.toString();
}

/**
 * Plain-JavaScript twin of sanitiseAnalyticsUrl for the inline GA bootstrap, which runs before any
 * bundle and before gtag.js. It is generated from the same parameter list, and the regression
 * tests execute it against the TypeScript implementation so the two cannot drift.
 *
 * The bootstrap sets a sanitised page_location / page_referrer before `config`, and re-sets them
 * synchronously on every navigation (pushState / replaceState / popstate / hashchange), so every hit
 * that takes gtag's page context — page_view, custom and conversion events, and automatic events
 * fired after an in-app navigation — carries the sanitised URL rather than document.location. See
 * the Enhanced Measurement history limit above.
 */
export function analyticsPrivacyBootstrapScript() {
  return `
                  var mkSensitiveAnalyticsParameters = ${JSON.stringify(SENSITIVE_ANALYTICS_PARAMETERS)};
                  var mkSensitiveAnalyticsPathPrefixes = ${JSON.stringify(SENSITIVE_PATH_PREFIXES)};${credentialPathRedactionScript('mkRedactCredentialPaths')}
                  function mkStripAnalyticsParams(search) {
                    var params = new URLSearchParams(search);
                    Array.from(params.keys()).forEach(function (name) {
                      if (mkSensitiveAnalyticsParameters.indexOf(String(name).toLowerCase()) !== -1) params.delete(name);
                    });
                    return params.toString();
                  }
                  function mkSanitiseAnalyticsUrl(url, base) {
                    if (!url) return undefined;
                    var parsed;
                    try { parsed = base ? new URL(url, base) : new URL(url); } catch (_) { return undefined; }
                    mkSensitiveAnalyticsPathPrefixes.forEach(function (prefix) {
                      if (parsed.pathname.indexOf(prefix) === 0 && parsed.pathname.length > prefix.length) {
                        parsed.pathname = prefix + ${JSON.stringify(REDACTED_PATH_SEGMENT)};
                      }
                    });
                    parsed.pathname = mkRedactCredentialPaths(parsed.pathname, ${JSON.stringify(REDACTED_PATH_SEGMENT)});
                    var mkReferenceSegment = new RegExp(${JSON.stringify(MK_REFERENCE_SEGMENT_SOURCE)}, 'i');
                    parsed.pathname = parsed.pathname.split('/').map(function (segment) {
                      var decoded = segment;
                      try { decoded = decodeURIComponent(segment); } catch (_) {}
                      return mkReferenceSegment.test(decoded) ? ${JSON.stringify(REDACTED_PATH_SEGMENT)} : segment;
                    }).join('/');
                    if (parsed.search) {
                      var keptSearch = mkStripAnalyticsParams(parsed.search);
                      parsed.search = keptSearch ? '?' + keptSearch : '';
                    }
                    if (parsed.hash && parsed.hash.indexOf('=') !== -1) {
                      var keptHash = mkStripAnalyticsParams(parsed.hash.slice(1));
                      parsed.hash = keptHash ? '#' + keptHash : '';
                    }
                    return parsed.toString();
                  }
                  window.mkSanitiseAnalyticsUrl = mkSanitiseAnalyticsUrl;
                  var mkLastAnalyticsLocation = window.location.href;
                  function mkSetAnalyticsPageContext(referrer) {
                    mkLastAnalyticsLocation = window.location.href;
                    var context = { page_location: mkSanitiseAnalyticsUrl(window.location.href) };
                    var cleanReferrer = mkSanitiseAnalyticsUrl(referrer);
                    if (cleanReferrer) context.page_referrer = cleanReferrer;
                    gtag('set', context);
                  }
                  mkSetAnalyticsPageContext(document.referrer);
                  ['pushState', 'replaceState'].forEach(function (method) {
                    var original = window.history[method];
                    if (typeof original !== 'function' || original.__mkAnalyticsPrivacy) return;
                    var wrapped = function () {
                      var previous = window.location.href;
                      var result = original.apply(this, arguments);
                      try { if (window.location.href !== previous) mkSetAnalyticsPageContext(previous); } catch (_) {}
                      return result;
                    };
                    wrapped.__mkAnalyticsPrivacy = true;
                    window.history[method] = wrapped;
                  });
                  ['popstate', 'hashchange'].forEach(function (type) {
                    window.addEventListener(type, function () {
                      try { if (window.location.href !== mkLastAnalyticsLocation) mkSetAnalyticsPageContext(mkLastAnalyticsLocation); } catch (_) {}
                    });
                  });`;
}

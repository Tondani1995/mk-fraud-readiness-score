import type { ErrorEvent } from '@sentry/core';
import { redactCredentialPaths } from './credential-paths';

/**
 * Keep Sentry events useful for release diagnosis without carrying request/user data into the
 * third-party error service. The monitored client/server test events are deliberately fixed-copy
 * events, and this is a second privacy boundary for SDK-captured exceptions.
 */
export function scrubSentryEvent(event: ErrorEvent) {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  // Review role links carry their credential in the path. Any string that could hold a path or URL (tags such as
  // route, the transaction name, the message, exception values, contexts and fingerprints) has that segment replaced.
  if (event.tags) event.tags = scrubStrings(event.tags) as typeof event.tags;
  if (event.transaction) event.transaction = redactCredentialPaths(event.transaction);
  if (typeof event.message === 'string') event.message = redactCredentialPaths(event.message);
  if (event.logentry) event.logentry = scrubStrings(event.logentry) as typeof event.logentry;
  if (event.exception?.values) event.exception.values = event.exception.values.map((v) => scrubStrings(v) as typeof v);
  if (event.contexts) event.contexts = scrubStrings(event.contexts) as typeof event.contexts;
  if (event.fingerprint) event.fingerprint = event.fingerprint.map((f) => redactCredentialPaths(f));
  return event;
}

/** Replaces credential path segments in every string of a plain object, to a bounded depth. */
function scrubStrings(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactCredentialPaths(value);
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubStrings(v, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubStrings(v, depth + 1)]));
}

export function sentryServerEnvironment() {
  return process.env.VERCEL_ENV?.trim() || 'local';
}

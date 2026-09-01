import type { ErrorEvent } from '@sentry/core';

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
  return event;
}

export function sentryServerEnvironment() {
  return process.env.VERCEL_ENV?.trim() || 'local';
}

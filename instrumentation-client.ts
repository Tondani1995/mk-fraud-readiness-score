import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './src/lib/monitoring/sentry';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || 'local',
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enableLogs: false,
  integrations: (integrations) => integrations.filter((integration) => !['Replay', 'ReplayCanvas'].includes(integration.name)),
  beforeSend: scrubSentryEvent
});

export function onRouterTransitionStart(...args: Parameters<typeof Sentry.captureRouterTransitionStart>) {
  Sentry.captureRouterTransitionStart(...args);
}

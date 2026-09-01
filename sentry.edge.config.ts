import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent, sentryServerEnvironment } from './src/lib/monitoring/sentry';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: sentryServerEnvironment(),
  sendDefaultPii: false,
  tracesSampleRate: 0,
  enableLogs: false,
  beforeSend: scrubSentryEvent
});

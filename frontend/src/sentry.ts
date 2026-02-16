import * as Sentry from '@sentry/react';
import { shouldIgnoreSentryEvent } from './sentryFilters';
import { env } from './env';

export function initSentry() {
  if (!env.SENTRY_DSN) {
    console.warn('VITE_SENTRY_DSN not set, Sentry error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    enabled: import.meta.env.PROD || !!import.meta.env.VITE_SENTRY_ENABLED,
    beforeSend(event) {
      if (shouldIgnoreSentryEvent(event)) {
        return null;
      }

      return event;
    },
  });
}

export { Sentry };

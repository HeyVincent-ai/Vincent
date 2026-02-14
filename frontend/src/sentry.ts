import * as Sentry from '@sentry/react';
import { shouldIgnoreSentryEvent } from './sentryFilters';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn('VITE_SENTRY_DSN not set, Sentry error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // Adjust this value in production for high-traffic applications.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Capture Replay sessions
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Don't send errors in development unless explicitly enabled
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

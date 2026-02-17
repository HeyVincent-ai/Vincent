/**
 * Validated environment variables.
 * The app will fail to start if any required variable is missing.
 */

function required(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  STYTCH_PUBLIC_TOKEN: required('VITE_STYTCH_PUBLIC_TOKEN'),
  WALLETCONNECT_PROJECT_ID: required('VITE_WALLETCONNECT_PROJECT_ID'),
  ZERODEV_PROJECT_ID: required('VITE_ZERODEV_PROJECT_ID'),
  /** Optional — Sentry is disabled if not set */
  SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  /** Defaults to '/api' for same-origin proxying */
  API_URL: (import.meta.env.VITE_API_URL as string) || '/api',
};

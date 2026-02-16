type SentryLikeEvent = {
  message?: string;
  logentry?: { message?: string; formatted?: string };
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
    }>;
  };
};

const EXPECTED_USER_ERROR_PATTERNS = [
  'insufficient funds',
  'user rejected',
  'user denied',
  'denied transaction signature',
  'invalid parameter',
  'invalid input',
  'already exists',
  'not found',
  'forbidden',
  'unauthorized',
  'rate limit',
  'too many requests',
];

const KNOWN_NOISE_PATTERNS = [
  'non-error promise rejection captured',
  'networkerror when attempting to fetch resource',
  'the operation was aborted',
  'aborterror',
  'chunkloaderror',
  'loading chunk',
  'extension context invalidated',
  'resizeobserver loop limit exceeded',
];

function extractEventText(event: SentryLikeEvent): string {
  const exceptionText = (event.exception?.values || [])
    .map((v) => `${v.type || ''} ${v.value || ''}`.trim())
    .join(' ');

  return [event.message, event.logentry?.message, event.logentry?.formatted, exceptionText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function shouldIgnoreSentryEvent(event: SentryLikeEvent): boolean {
  const text = extractEventText(event);

  if (!text) return false;

  if (EXPECTED_USER_ERROR_PATTERNS.some((p) => text.includes(p))) return true;
  if (KNOWN_NOISE_PATTERNS.some((p) => text.includes(p))) return true;

  return false;
}

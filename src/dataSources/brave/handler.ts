import { z } from 'zod';
import { env } from '../../utils/env.js';
import { AppError } from '../../api/middleware/errorHandler.js';

const BRAVE_API_BASE = 'https://api.search.brave.com';

function getApiKey(): string {
  if (!env.BRAVE_SEARCH_API_KEY) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Brave Search data source is not configured', 503);
  }
  return env.BRAVE_SEARCH_API_KEY;
}

async function braveFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BRAVE_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'X-Subscription-Token': getApiKey(),
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      'UPSTREAM_ERROR',
      `Brave Search API error (${res.status}): ${body}`,
      res.status === 429 ? 429 : 502
    );
  }

  return res.json();
}

// --- Schemas ---

export const webSearchSchema = z.object({
  q: z.string().min(1).max(400),
  count: z.coerce.number().int().min(1).max(20).optional().default(10),
  offset: z.coerce.number().int().min(0).max(9).optional(),
  freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional(),
  country: z.string().length(2).optional(),
});

export const newsSearchSchema = z.object({
  q: z.string().min(1).max(400),
  count: z.coerce.number().int().min(1).max(20).optional().default(10),
  freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional(),
});

// --- Handlers ---

export async function webSearch(params: z.infer<typeof webSearchSchema>): Promise<unknown> {
  return braveFetch('/res/v1/web/search', {
    q: params.q,
    count: String(params.count),
    ...(params.offset !== undefined && { offset: String(params.offset) }),
    ...(params.freshness && { freshness: params.freshness }),
    ...(params.country && { country: params.country }),
  });
}

export async function newsSearch(params: z.infer<typeof newsSearchSchema>): Promise<unknown> {
  return braveFetch('/res/v1/news/search', {
    q: params.q,
    count: String(params.count),
    ...(params.freshness && { freshness: params.freshness }),
  });
}

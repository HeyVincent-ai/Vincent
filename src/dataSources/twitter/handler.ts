import { z } from 'zod';
import { env } from '../../utils/env.js';
import { AppError } from '../../api/middleware/errorHandler.js';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

const DEFAULT_TWEET_FIELDS = 'text,created_at,author_id,public_metrics';
const DEFAULT_USER_FIELDS = 'description,public_metrics,profile_image_url,verified';
const DEFAULT_EXPANSIONS = 'author_id';

function getBearer(): string {
  if (!env.TWITTER_BEARER_TOKEN) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Twitter data source is not configured', 503);
  }
  return env.TWITTER_BEARER_TOKEN;
}

async function twitterFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${TWITTER_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getBearer()}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      'UPSTREAM_ERROR',
      `Twitter API error (${res.status}): ${body}`,
      res.status === 429 ? 429 : 502
    );
  }

  return res.json();
}

// --- Schemas ---

export const searchTweetsSchema = z.object({
  q: z.string().min(1).max(512),
  max_results: z.coerce.number().int().min(10).max(100).optional().default(10),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
});

export const getTweetSchema = z.object({
  tweetId: z.string().min(1),
});

export const getUserSchema = z.object({
  username: z.string().min(1).max(50),
});

export const getUserTweetsSchema = z.object({
  userId: z.string().min(1),
  max_results: z.coerce.number().int().min(5).max(100).optional().default(10),
});

// --- Handlers ---

export async function searchTweets(params: z.infer<typeof searchTweetsSchema>): Promise<unknown> {
  return twitterFetch('/tweets/search/recent', {
    query: params.q,
    max_results: String(params.max_results),
    'tweet.fields': DEFAULT_TWEET_FIELDS,
    expansions: DEFAULT_EXPANSIONS,
    ...(params.start_time && { start_time: params.start_time }),
    ...(params.end_time && { end_time: params.end_time }),
  });
}

export async function getTweet(tweetId: string): Promise<unknown> {
  return twitterFetch(`/tweets/${encodeURIComponent(tweetId)}`, {
    'tweet.fields': DEFAULT_TWEET_FIELDS,
    expansions: DEFAULT_EXPANSIONS,
  });
}

export async function getUserByUsername(username: string): Promise<unknown> {
  return twitterFetch(`/users/by/username/${encodeURIComponent(username)}`, {
    'user.fields': DEFAULT_USER_FIELDS,
  });
}

export async function getUserTweets(userId: string, maxResults: number = 10): Promise<unknown> {
  return twitterFetch(`/users/${encodeURIComponent(userId)}/tweets`, {
    max_results: String(maxResults),
    'tweet.fields': DEFAULT_TWEET_FIELDS,
  });
}

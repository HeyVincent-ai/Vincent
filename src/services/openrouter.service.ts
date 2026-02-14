/**
 * OpenRouter Key Management Service
 *
 * Uses the OpenRouter Provisioning Key API to manage per-deployment API keys.
 * A provisioning key can only create/delete/query keys — it cannot make completions.
 *
 * API docs: https://openrouter.ai/docs/api-reference/keys
 */

import { env } from '../utils/env.js';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

// ============================================================
// Types
// ============================================================

export interface OpenRouterKeyResult {
  key: string; // The actual API key (only returned on creation)
  hash: string; // Key hash for future management
  name: string;
}

export interface OpenRouterKeyUsage {
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  limit: number | null;
  limit_remaining: number | null;
}

// ============================================================
// Helpers
// ============================================================

function getProvisioningKey(): string {
  if (!env.OPENROUTER_PROVISIONING_KEY) {
    throw new Error('OPENROUTER_PROVISIONING_KEY not configured');
  }
  return env.OPENROUTER_PROVISIONING_KEY;
}

async function openRouterFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${OPENROUTER_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${getProvisioningKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${body}`);
  }

  return res.json();
}

// ============================================================
// Key Management
// ============================================================

/**
 * Create a new OpenRouter API key for a deployment.
 */
export async function createKey(
  name: string,
  options?: {
    limit?: number;
    limit_reset?: 'daily' | 'weekly' | 'monthly' | null;
    expires_at?: string;
  }
): Promise<OpenRouterKeyResult> {
  const body: any = { name };
  if (options?.limit !== undefined) body.limit = options.limit;
  if (options?.limit_reset) body.limit_reset = options.limit_reset;
  if (options?.expires_at) body.expires_at = options.expires_at;

  const data = await openRouterFetch('/keys', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    key: data.data?.key || data.key,
    hash: data.data?.hash || data.hash,
    name: data.data?.name || data.name || name,
  };
}

/**
 * Delete an OpenRouter API key by its hash.
 */
export async function deleteKey(hash: string): Promise<void> {
  await openRouterFetch(`/keys/${hash}`, {
    method: 'DELETE',
  });
}

/**
 * Get usage stats for an OpenRouter API key.
 */
export async function getKeyUsage(hash: string): Promise<OpenRouterKeyUsage> {
  const data = await openRouterFetch(`/keys/${hash}`);
  const d = data.data ?? data;
  return {
    usage: d.usage ?? 0,
    usage_daily: d.usage_daily ?? 0,
    usage_weekly: d.usage_weekly ?? 0,
    usage_monthly: d.usage_monthly ?? 0,
    limit: d.limit ?? null,
    limit_remaining: d.limit_remaining ?? null,
  };
}

/**
 * Update the spending limit on an OpenRouter API key.
 */
export async function updateKeyLimit(hash: string, newLimit: number): Promise<void> {
  await openRouterFetch(`/keys/${hash}`, {
    method: 'PATCH',
    body: JSON.stringify({ limit: newLimit }),
  });
}

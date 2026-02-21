const DEFAULT_BASE_URL = 'https://heyvincent.ai';
const TRADE_MANAGER_BASE_URL = 'http://localhost:19000';

function getBaseUrl(): string {
  return process.env.VINCENT_BASE_URL || DEFAULT_BASE_URL;
}

export function getTradeManagerBaseUrl(): string {
  return process.env.VINCENT_TRADE_MANAGER_URL || TRADE_MANAGER_BASE_URL;
}

interface RequestOptions {
  baseUrl?: string;
}

async function request(
  method: string,
  path: string,
  apiKey: string | null,
  body?: unknown,
  opts?: RequestOptions
): Promise<unknown> {
  const base = opts?.baseUrl || getBaseUrl();
  const url = `${base}${path}`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>).message ||
          (data as Record<string, unknown>).error ||
          text
        : text;
    console.error(`API error (${res.status}): ${msg}`);
    process.exit(1);
  }

  return data;
}

export function vincentGet(
  path: string,
  apiKey: string | null,
  params?: Record<string, string>,
  opts?: RequestOptions
): Promise<unknown> {
  let fullPath = path;
  if (params) {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
    if (entries.length > 0) {
      fullPath += '?' + new URLSearchParams(entries).toString();
    }
  }
  return request('GET', fullPath, apiKey, undefined, opts);
}

export function vincentPost(
  path: string,
  apiKey: string | null,
  body?: unknown,
  opts?: RequestOptions
): Promise<unknown> {
  return request('POST', path, apiKey, body, opts);
}

export function vincentDelete(
  path: string,
  apiKey: string,
  opts?: RequestOptions
): Promise<unknown> {
  return request('DELETE', path, apiKey, undefined, opts);
}

export function vincentPatch(
  path: string,
  apiKey: string,
  body: unknown,
  opts?: RequestOptions
): Promise<unknown> {
  return request('PATCH', path, apiKey, body, opts);
}

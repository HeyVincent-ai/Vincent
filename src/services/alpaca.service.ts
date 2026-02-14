import { AppError } from '../api/middleware/errorHandler.js';

export interface AlpacaAuth {
  baseUrl: string;
  keyId: string;
  secretKey: string;
}

interface AlpacaRequestOptions {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  allowNotFound?: boolean;
}

async function alpacaRequest<T>(
  auth: AlpacaAuth,
  options: AlpacaRequestOptions
): Promise<T | null> {
  const url = `${auth.baseUrl}${options.path}`;
  const res = await fetch(url, {
    method: options.method,
    headers: {
      'APCA-API-KEY-ID': auth.keyId,
      'APCA-API-SECRET-KEY': auth.secretKey,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 404 && options.allowNotFound) {
    return null;
  }

  if (!res.ok) {
    let message = `Alpaca API error (${res.status})`;
    try {
      const errorBody = await res.text();
      if (errorBody) {
        message = `${message}: ${errorBody.slice(0, 500)}`;
      }
    } catch {
      // ignore body parse errors
    }
    throw new AppError('ALPACA_API_ERROR', message, res.status);
  }

  if (res.status === 204) {
    return null;
  }

  return (await res.json()) as T;
}

const DATA_BASE_URL = 'https://data.alpaca.markets';

export async function getAccount(auth: AlpacaAuth) {
  return alpacaRequest<Record<string, any>>(auth, { method: 'GET', path: '/v2/account' });
}

export async function submitOrder(auth: AlpacaAuth, payload: Record<string, any>) {
  return alpacaRequest<Record<string, any>>(auth, { method: 'POST', path: '/v2/orders', body: payload });
}

export async function getOrder(auth: AlpacaAuth, orderId: string) {
  return alpacaRequest<Record<string, any>>(auth, { method: 'GET', path: `/v2/orders/${orderId}` });
}

export async function getPosition(auth: AlpacaAuth, symbol: string) {
  return alpacaRequest<Record<string, any>>(auth, {
    method: 'GET',
    path: `/v2/positions/${encodeURIComponent(symbol)}`,
    allowNotFound: true,
  });
}

export async function getLatestTradePrice(auth: AlpacaAuth, symbol: string) {
  const res = await alpacaRequest<{ trade?: { p?: number } }>(
    { ...auth, baseUrl: DATA_BASE_URL },
    { method: 'GET', path: `/v2/stocks/${encodeURIComponent(symbol)}/trades/latest` }
  );
  const price = res?.trade?.p;
  return typeof price === 'number' ? price : null;
}

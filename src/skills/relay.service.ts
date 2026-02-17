import { AppError } from '../api/middleware/errorHandler.js';

// Relay.link API base URL (v2 endpoints)
const RELAY_API_BASE = 'https://api.relay.link';

// Native token placeholder used by Relay
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

// ============================================================
// Types
// ============================================================

export interface RelayQuoteParams {
  user: string;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
  amount: string; // In smallest unit (wei)
  tradeType: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'EXPECTED_OUTPUT';
  recipient?: string;
  slippageTolerance?: string; // Basis points
}

export interface RelayStepItem {
  status: string;
  data: {
    from: string;
    to: string;
    data: string;
    value: string;
    chainId: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gas?: string;
  };
}

export interface RelayStep {
  id: string;
  action: string;
  description: string;
  kind: 'transaction' | 'signature';
  requestId?: string;
  items: RelayStepItem[];
}

export interface RelayFees {
  gas: { currency: RelayCurrency; amount: string; amountFormatted: string; amountUsd: string };
  relayer: { currency: RelayCurrency; amount: string; amountFormatted: string; amountUsd: string };
}

export interface RelayCurrency {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface RelayCurrencyAmount {
  currency: RelayCurrency;
  amount: string;
  amountFormatted: string;
  amountUsd: string;
}

export interface RelayQuoteResponse {
  steps: RelayStep[];
  fees: RelayFees;
  details: {
    operation: string;
    timeEstimate: number;
    currencyIn: RelayCurrencyAmount;
    currencyOut: RelayCurrencyAmount;
    rate: string;
    slippageTolerance: { origin: { percent: string }; destination: { percent: string } };
  };
}

export interface RelayRequestStatus {
  id: string;
  status: 'success' | 'pending' | 'failure' | 'waiting' | 'refund';
  user: string;
  recipient: string;
  createdAt: string;
  updatedAt: string;
  inTxs: Array<{ hash: string; chainId: number }>;
  outTxs: Array<{ hash: string; chainId: number }>;
}

export interface RelayStatusResponse {
  requests: RelayRequestStatus[];
  continuation?: string;
}

// ============================================================
// API Functions
// ============================================================

export async function getQuote(params: RelayQuoteParams): Promise<RelayQuoteResponse> {
  const url = `${RELAY_API_BASE}/quote/v2`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[Relay] Quote API error:', response.status, errorBody);
    throw new AppError(
      'RELAY_API_ERROR',
      `Relay API error: ${response.status} - ${errorBody}`,
      502
    );
  }

  return response.json() as Promise<RelayQuoteResponse>;
}

export async function getStatus(requestId: string): Promise<RelayStatusResponse> {
  const url = `${RELAY_API_BASE}/requests/v2?id=${encodeURIComponent(requestId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[Relay] Status API error:', response.status, errorBody);
    throw new AppError(
      'RELAY_API_ERROR',
      `Relay status error: ${response.status} - ${errorBody}`,
      502
    );
  }

  return response.json() as Promise<RelayStatusResponse>;
}

// ============================================================
// Helpers
// ============================================================

export function isNativeToken(token: string): boolean {
  return token.toUpperCase() === 'ETH' || token.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

export function normalizeTokenAddress(token: string): string {
  return isNativeToken(token) ? NATIVE_TOKEN_ADDRESS : token;
}

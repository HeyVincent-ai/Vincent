import { type Address } from 'viem';
import { env } from '../utils/env';
import { AppError } from '../api/middleware/errorHandler';

// 0x API base URL (unified for all chains in v2)
const ZEROX_API_BASE = 'https://api.0x.org';

// Native token placeholder address used by 0x
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// ============================================================
// Types
// ============================================================

export interface ZeroExFees {
  integratorFee: {
    amount: string;
    token: string;
    type: string;
  } | null;
  zeroExFee: {
    amount: string;
    token: string;
    type: string;
  } | null;
  gasFee: {
    amount: string;
    token: string;
    type: string;
  } | null;
}

export interface ZeroExRoute {
  fills: Array<{
    from: string;
    to: string;
    source: string;
    proportionBps: string;
  }>;
  tokens: Array<{
    address: string;
    symbol: string;
  }>;
}

export interface ZeroExIssues {
  allowance: {
    actual: string;
    spender: string;
  } | null;
  balance: {
    token: string;
    actual: string;
    expected: string;
  } | null;
  simulationIncomplete: boolean;
  invalidSourcesPassed: string[];
}

export interface ZeroExPriceResponse {
  allowanceTarget: string;
  blockNumber: string;
  buyAmount: string;
  minBuyAmount: string;
  buyToken: string;
  fees: ZeroExFees;
  gas: string;
  gasPrice: string;
  issues: ZeroExIssues;
  liquidityAvailable: boolean;
  route: ZeroExRoute;
  sellAmount: string;
  sellToken: string;
  totalNetworkFee: string;
  zid: string;
}

export interface ZeroExQuote extends ZeroExPriceResponse {
  transaction?: {
    to: string;
    data: string;
    gas: string;
    gasPrice: string;
    value: string;
  };
  permit2?: {
    type: string;
    hash: string;
    eip712: {
      types: Record<string, Array<{ name: string; type: string }>>;
      domain: Record<string, string | number>;
      message: Record<string, unknown>;
      primaryType: string;
    };
  };
}

export interface SwapQuoteParams {
  sellToken: string;
  buyToken: string;
  sellAmount: string; // Amount in wei/smallest unit
  takerAddress: string; // The smart wallet address
  chainId: number;
  slippageBps?: number; // Basis points (100 = 1%)
}

// ============================================================
// Helpers
// ============================================================

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    '0x-version': 'v2',
  };

  if (env.ZEROX_API_KEY) {
    headers['0x-api-key'] = env.ZEROX_API_KEY;
  }

  return headers;
}

function buildQueryParams(params: SwapQuoteParams): URLSearchParams {
  const query = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.takerAddress,
  });

  if (params.slippageBps !== undefined) {
    query.set('slippageBps', params.slippageBps.toString());
  }

  // Add fee parameters if configured
  if (env.SWAP_FEE_RECIPIENT && env.SWAP_FEE_BPS) {
    query.set('swapFeeBps', env.SWAP_FEE_BPS.toString());
    query.set('swapFeeRecipient', env.SWAP_FEE_RECIPIENT);
  }

  return query;
}

// ============================================================
// API Functions
// ============================================================

/**
 * Get a price quote (preview only, no transaction data).
 */
export async function getPrice(params: SwapQuoteParams): Promise<ZeroExPriceResponse> {
  if (!env.ZEROX_API_KEY) {
    throw new AppError('CONFIG_ERROR', 'ZEROX_API_KEY is required for swap quotes', 500);
  }

  const query = buildQueryParams(params);
  const url = `${ZEROX_API_BASE}/swap/allowance-holder/price?${query.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[0x] Price API error:', response.status, errorBody);
    throw new AppError('SWAP_PRICE_ERROR', `0x API error: ${response.status} - ${errorBody}`, 502);
  }

  return response.json() as Promise<ZeroExPriceResponse>;
}

/**
 * Get a full swap quote (includes transaction data for execution).
 */
export async function getQuote(params: SwapQuoteParams): Promise<ZeroExQuote> {
  if (!env.ZEROX_API_KEY) {
    throw new AppError('CONFIG_ERROR', 'ZEROX_API_KEY is required for swap quotes', 500);
  }

  const query = buildQueryParams(params);
  const url = `${ZEROX_API_BASE}/swap/allowance-holder/quote?${query.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[0x] Quote API error:', response.status, errorBody);
    throw new AppError('SWAP_QUOTE_ERROR', `0x API error: ${response.status} - ${errorBody}`, 502);
  }

  return response.json() as Promise<ZeroExQuote>;
}

/**
 * Check if a token address represents native ETH.
 */
export function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Build an ERC20 approval transaction for the 0x allowance target.
 */
export function buildApprovalData(
  tokenAddress: Address,
  spender: Address,
  amount: bigint = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
): { to: Address; data: `0x${string}`; value: bigint } {
  // ERC20 approve(address spender, uint256 amount)
  const selector = '0x095ea7b3';
  const spenderPadded = spender.slice(2).padStart(64, '0');
  const amountPadded = amount.toString(16).padStart(64, '0');

  return {
    to: tokenAddress,
    data: `${selector}${spenderPadded}${amountPadded}` as `0x${string}`,
    value: 0n,
  };
}

/**
 * Get the native token placeholder address used by 0x API.
 */
export function getNativeTokenAddress(): string {
  return NATIVE_TOKEN_ADDRESS;
}

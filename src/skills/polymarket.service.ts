import { Wallet } from '@ethersproject/wallet';
import { ClobClient, Side, OrderType, Chain } from '@polymarket/clob-client';
import type {
  ApiKeyCreds,
  OpenOrder,
  Trade,
  OrderBookSummary,
  BalanceAllowanceResponse,
  AssetType,
  UserMarketOrder,
} from '@polymarket/clob-client';
import prisma from '../db/client';
import { env } from '../utils/env';

// ============================================================
// Types
// ============================================================

export { Side, OrderType, Chain };
export type { ApiKeyCreds, OpenOrder, Trade, OrderBookSummary };

export interface PolymarketClientConfig {
  privateKey: string;
  secretId: string;
}

// ============================================================
// Credential Management
// ============================================================

/**
 * Get or create Polymarket CLOB API credentials for a given secret.
 * On first call, derives credentials via L1 auth and stores them in DB.
 */
async function getOrCreateCredentials(
  privateKey: string,
  secretId: string
): Promise<ApiKeyCreds> {
  // Check if credentials already exist
  const existing = await prisma.polymarketCredentials.findUnique({
    where: { secretId },
  });

  if (existing) {
    return {
      key: existing.apiKey,
      secret: existing.apiSecret,
      passphrase: existing.passphrase,
    };
  }

  // Derive credentials via L1 auth
  const wallet = new Wallet(privateKey);
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';

  const l1Client = new ClobClient(host, Chain.POLYGON, wallet);
  const creds = await l1Client.createOrDeriveApiKey();

  // Store credentials in DB
  await prisma.polymarketCredentials.create({
    data: {
      secretId,
      eoaAddress: wallet.address,
      apiKey: creds.key,
      apiSecret: creds.secret,
      passphrase: creds.passphrase,
    },
  });

  return creds;
}

/**
 * Build an authenticated ClobClient for a secret.
 */
async function buildClient(config: PolymarketClientConfig): Promise<ClobClient> {
  const wallet = new Wallet(config.privateKey);
  const creds = await getOrCreateCredentials(config.privateKey, config.secretId);
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';

  return new ClobClient(host, Chain.POLYGON, wallet, creds);
}

/**
 * Get the EOA address from a private key.
 */
export function getEoaAddress(privateKey: string): string {
  return new Wallet(privateKey).address;
}

// ============================================================
// Market Info
// ============================================================

/**
 * Get market info by condition ID.
 */
export async function getMarket(conditionId: string): Promise<any> {
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getMarket(conditionId);
}

/**
 * Get the order book for a token ID.
 */
export async function getOrderBook(
  tokenId: string
): Promise<OrderBookSummary> {
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getOrderBook(tokenId);
}

/**
 * Get the midpoint price for a token.
 */
export async function getMidpoint(tokenId: string): Promise<string> {
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getMidpoint(tokenId);
}

/**
 * Browse markets (paginated).
 */
export async function getMarkets(nextCursor?: string) {
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getSimplifiedMarkets(nextCursor);
}

// ============================================================
// Trading
// ============================================================

/**
 * Place a limit order (GTC - Good Till Cancelled).
 */
export async function placeLimitOrder(
  config: PolymarketClientConfig,
  params: {
    tokenId: string;
    side: Side;
    price: number;
    size: number;
  }
): Promise<any> {
  const client = await buildClient(config);

  // Ensure collateral allowance is set (needed for first-time trading)
  await ensureCollateralAllowance(config);

  const order = await client.createOrder({
    tokenID: params.tokenId,
    side: params.side,
    price: params.price,
    size: params.size,
  });

  const result = await client.postOrder(order, OrderType.GTC);
  validateOrderResponse(result);
  return result;
}

/**
 * Place a market order (FOK - Fill or Kill).
 */
export async function placeMarketOrder(
  config: PolymarketClientConfig,
  params: {
    tokenId: string;
    side: Side;
    amount: number; // BUY: USD amount to spend, SELL: shares to sell
  }
): Promise<any> {
  const client = await buildClient(config);

  // Ensure collateral allowance is set (needed for first-time trading)
  await ensureCollateralAllowance(config);

  const userMarketOrder: UserMarketOrder = {
    tokenID: params.tokenId,
    side: params.side,
    amount: params.amount,
  };

  const order = await client.createMarketOrder(userMarketOrder);
  const result = await client.postOrder(order, OrderType.FOK);
  validateOrderResponse(result);
  return result;
}

/**
 * Validate that a CLOB order response is actually successful.
 * The CLOB client can return error HTML (e.g. Cloudflare blocks) without throwing.
 */
function validateOrderResponse(result: any): void {
  if (!result) {
    throw new Error('CLOB returned empty response');
  }

  // If result is a string, it's likely an error (HTML/text error response)
  if (typeof result === 'string') {
    throw new Error(`CLOB returned unexpected response: ${result.slice(0, 200)}`);
  }

  // If it has an error field, it failed
  if (result.error) {
    const errMsg = typeof result.error === 'string'
      ? result.error.slice(0, 200)
      : JSON.stringify(result.error).slice(0, 200);
    throw new Error(`CLOB order failed: ${errMsg}`);
  }

  // A successful order should have an orderID (or success field)
  if (!result.orderID && !result.success) {
    throw new Error(`CLOB order response missing orderID: ${JSON.stringify(result).slice(0, 200)}`);
  }
}

/**
 * Ensure USDC collateral allowance is set for trading.
 * Called lazily before first order placement.
 */
const _allowanceCache = new Set<string>();
async function ensureCollateralAllowance(config: PolymarketClientConfig): Promise<void> {
  if (_allowanceCache.has(config.secretId)) return;

  try {
    const client = await buildClient(config);
    const bal = await client.getBalanceAllowance({
      asset_type: 'COLLATERAL' as AssetType,
    });

    // If allowance is 0 or very low, set it
    if (parseFloat(bal.allowance) < 1000) {
      await client.updateBalanceAllowance({
        asset_type: 'COLLATERAL' as AssetType,
      });
    }

    _allowanceCache.add(config.secretId);
  } catch (err) {
    // Non-fatal — allowance might already be set, or user might not have deposited yet
    console.warn('Failed to ensure collateral allowance:', err instanceof Error ? err.message : err);
  }
}

// ============================================================
// Positions & Orders
// ============================================================

/**
 * Get open orders for this wallet.
 */
export async function getOpenOrders(
  config: PolymarketClientConfig,
  params?: { market?: string; assetId?: string }
): Promise<OpenOrder[]> {
  const client = await buildClient(config);
  const response = await client.getOpenOrders(params);
  return response;
}

/**
 * Get trade history for this wallet.
 */
export async function getTrades(
  config: PolymarketClientConfig,
  params?: { market?: string; assetId?: string }
): Promise<Trade[]> {
  const client = await buildClient(config);
  return client.getTrades(params);
}

/**
 * Cancel a specific order.
 */
export async function cancelOrder(
  config: PolymarketClientConfig,
  orderId: string
): Promise<any> {
  const client = await buildClient(config);
  return client.cancelOrder({ orderID: orderId });
}

/**
 * Cancel all open orders.
 */
export async function cancelAllOrders(
  config: PolymarketClientConfig
): Promise<any> {
  const client = await buildClient(config);
  return client.cancelAll();
}

// ============================================================
// Balance
// ============================================================

/**
 * Get USDC collateral balance and allowance.
 */
export async function getCollateralBalance(
  config: PolymarketClientConfig
): Promise<BalanceAllowanceResponse> {
  const client = await buildClient(config);
  return client.getBalanceAllowance({
    asset_type: 'COLLATERAL' as AssetType,
  });
}

/**
 * Get conditional token balance for a specific token ID.
 */
export async function getConditionalBalance(
  config: PolymarketClientConfig,
  tokenId: string
): Promise<BalanceAllowanceResponse> {
  const client = await buildClient(config);
  return client.getBalanceAllowance({
    asset_type: 'CONDITIONAL' as AssetType,
    token_id: tokenId,
  });
}

/**
 * Update (set max) allowance for USDC collateral on the CTF exchange.
 */
export async function updateCollateralAllowance(
  config: PolymarketClientConfig
): Promise<void> {
  const client = await buildClient(config);
  await client.updateBalanceAllowance({
    asset_type: 'COLLATERAL' as AssetType,
  });
}

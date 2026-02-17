import { type Hex } from 'viem';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker.js';
import { sendApprovalRequest } from '../telegram/index.js';
import * as polymarket from './polymarket.service.js';

/**
 * Safely stringify an object, handling circular references.
 * Returns undefined if serialization fails.
 */
function safeStringify(obj: unknown): string | undefined {
  if (obj === undefined || obj === null) return undefined;

  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // Skip functions and other non-serializable types
      if (typeof value === 'function') {
        return '[Function]';
      }
      return value;
    });
  } catch {
    return undefined;
  }
}

// ============================================================
// Types
// ============================================================

export interface BetInput {
  secretId: string;
  apiKeyId?: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  amount: number; // BUY: USD to spend, SELL: shares to sell
  price?: number; // If set, limit order at this price; otherwise market order
}

export interface BetOutput {
  orderId?: string;
  status: 'executed' | 'pending_approval' | 'denied';
  transactionLogId: string;
  walletAddress: string;
  reason?: string;
  orderDetails?: any;
}

export interface PositionsOutput {
  walletAddress: string;
  openOrders: polymarket.OpenOrder[];
}

export interface MarketInfoOutput {
  market: any;
}

export interface PolymarketBalanceOutput {
  walletAddress: string;
  collateral: { balance: string; allowance: string };
}

// ============================================================
// Helpers
// ============================================================

async function getWalletData(secretId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, deletedAt: null },
    include: { polymarketWalletMetadata: true },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  if (secret.type !== 'POLYMARKET_WALLET') {
    throw new AppError('INVALID_TYPE', 'Secret is not a POLYMARKET_WALLET', 400);
  }

  if (!secret.value) {
    throw new AppError('NO_VALUE', 'Wallet private key not available', 500);
  }

  const meta = secret.polymarketWalletMetadata;
  if (!meta) {
    throw new AppError('NO_METADATA', 'Polymarket wallet metadata missing', 500);
  }

  return {
    privateKey: secret.value as Hex,
    walletAddress: meta.safeAddress,
    safeAddress: meta.safeAddress,
    eoaAddress: meta.eoaAddress,
    userId: secret.userId,
  };
}

// ============================================================
// Place Bet
// ============================================================

export async function placeBet(input: BetInput): Promise<BetOutput> {
  const { secretId, apiKeyId, tokenId, side, amount, price } = input;
  const wallet = await getWalletData(secretId);

  // For BUY orders, amount is USD. For SELL, it's shares (value depends on price).
  // Use amount as the USD value for policy checks (approximate for SELL).
  const usdValue = side === 'BUY' ? amount : amount * (price ?? 0.5);

  // Build policy check action - treat as a "transfer" type for spending limits
  const policyAction: PolicyCheckAction = {
    type: 'transfer',
    to: '0x0000000000000000000000000000000000000000', // Polymarket exchange
    value: usdValue,
    chainId: 137, // Polygon
  };

  const policyResult = await checkPolicies(secretId, policyAction);

  // Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId,
      apiKeyId,
      actionType: 'polymarket_bet',
      requestData: {
        tokenId,
        side,
        amount,
        price: price ?? null,
        usdValue,
      },
      status: policyResult.verdict === 'allow' ? 'PENDING' : 'DENIED',
    },
  });

  // Handle deny
  if (policyResult.verdict === 'deny') {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'DENIED',
        responseData: { reason: policyResult.triggeredPolicy?.reason },
      },
    });

    return {
      status: 'denied',
      transactionLogId: txLog.id,
      walletAddress: wallet.walletAddress,
      reason: policyResult.triggeredPolicy?.reason,
    };
  }

  // Handle require_approval
  if (policyResult.verdict === 'require_approval') {
    const pendingApproval = await prisma.pendingApproval.create({
      data: {
        transactionLogId: txLog.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    sendApprovalRequest(pendingApproval.id).catch((err) =>
      console.error('Failed to send approval request:', err)
    );

    return {
      status: 'pending_approval',
      transactionLogId: txLog.id,
      walletAddress: wallet.walletAddress,
      reason: policyResult.triggeredPolicy?.reason,
    };
  }

  // Execute the bet
  try {
    const clientConfig = {
      privateKey: wallet.privateKey,
      secretId,
      safeAddress: wallet.safeAddress,
    };
    const Side = await polymarket.getSide();
    let orderResult: any;

    if (price !== undefined) {
      // Limit order
      // For BUY orders: amount is USD to spend, so size = amount / price
      // For SELL orders: amount is shares to sell, so size = amount
      let size: number;
      if (side === 'BUY') {
        // Add 1% buffer to amount to ensure we meet Polymarket's $1 minimum
        // after their internal rounding. This means we'll spend slightly more
        // than requested, but it ensures the order is accepted.
        const bufferedAmount = amount * 1.01;
        const rawSize = bufferedAmount / price;
        // Round up to 2 decimal places (Polymarket's tick size)
        size = Math.ceil(rawSize * 100) / 100;
      } else {
        size = amount;
      }

      orderResult = await polymarket.placeLimitOrder(clientConfig, {
        tokenId,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
        price,
        size,
      });
    } else {
      // Market order
      orderResult = await polymarket.placeMarketOrder(clientConfig, {
        tokenId,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
        amount,
      });
    }

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'EXECUTED',
        responseData: orderResult,
      },
    });

    return {
      orderId: orderResult?.orderID,
      status: 'executed',
      transactionLogId: txLog.id,
      walletAddress: wallet.walletAddress,
      orderDetails: orderResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error instanceof AppError ? error.code : 'BET_FAILED';

    // Safely serialize error details for JSON storage (handles circular refs)
    // We use any here because Prisma's InputJsonValue is complex
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let errorDetails: any = undefined;
    if (error instanceof AppError && error.details) {
      const serialized = safeStringify(error.details);
      if (serialized) {
        try {
          errorDetails = JSON.parse(serialized);
        } catch {
          // ignore parse errors
        }
      }
    }

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: {
          error: errorMessage,
          code: errorCode,
          ...(errorDetails && { details: errorDetails }),
        },
      },
    });

    // Re-throw AppErrors directly to preserve detailed error info
    if (error instanceof AppError) {
      throw error;
    }

    // Extract meaningful error message, avoiding circular structure errors
    const cleanMessage = errorMessage.includes('circular structure') ? 'no match' : errorMessage;

    throw new AppError('BET_FAILED', `Polymarket bet failed: ${cleanMessage}`, 500);
  }
}

// ============================================================
// Positions
// ============================================================

export async function getPositions(secretId: string, market?: string): Promise<PositionsOutput> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId, safeAddress: wallet.safeAddress };

  const openOrders = await polymarket.getOpenOrders(clientConfig, { market });

  return {
    walletAddress: wallet.walletAddress,
    openOrders,
  };
}

// ============================================================
// Market Info
// ============================================================

export async function getMarketInfo(conditionId: string): Promise<MarketInfoOutput> {
  const market = await polymarket.getMarket(conditionId);
  return { market };
}

export async function searchMarkets(params: {
  query?: string;
  active?: boolean;
  limit?: number;
  nextCursor?: string;
}) {
  const { query, active = true, limit = 50 } = params;

  // Use Gamma API for both search and browsing — it supports text search
  // via /public-search and filtered browsing via /markets with proper params
  return polymarket.searchMarketsGamma({ query, active, limit });
}

export async function getOrderBook(tokenId: string) {
  return polymarket.getOrderBook(tokenId);
}

export async function getMidpoint(tokenId: string) {
  return polymarket.getMidpoint(tokenId);
}

// ============================================================
// Balance
// ============================================================

export async function getBalance(secretId: string): Promise<PolymarketBalanceOutput> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId, safeAddress: wallet.safeAddress };

  const collateral = await polymarket.getCollateralBalance(clientConfig);

  // USDC.e has 6 decimals — convert from raw units to human-readable
  const USDC_DECIMALS = 6;
  const toHuman = (raw: string) => (Number(raw) / 10 ** USDC_DECIMALS).toString();

  return {
    walletAddress: wallet.walletAddress,
    collateral: {
      balance: toHuman(collateral.balance),
      allowance: toHuman(collateral.allowance),
    },
  };
}

// ============================================================
// Order Management
// ============================================================

export async function cancelOrder(secretId: string, orderId: string): Promise<any> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId, safeAddress: wallet.safeAddress };
  return polymarket.cancelOrder(clientConfig, orderId);
}

export async function cancelAllOrders(secretId: string): Promise<any> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId, safeAddress: wallet.safeAddress };
  return polymarket.cancelAllOrders(clientConfig);
}

// ============================================================
// Trades History
// ============================================================

export async function getTrades(secretId: string, market?: string): Promise<polymarket.Trade[]> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId, safeAddress: wallet.safeAddress };
  return polymarket.getTrades(clientConfig, { market });
}

// ============================================================
// Holdings
// ============================================================

export interface Holding {
  tokenId: string;
  shares: number;
  averageEntryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  marketTitle: string;
  outcome: string;
}

export interface HoldingsOutput {
  walletAddress: string;
  holdings: Holding[];
}

export async function getHoldings(secretId: string): Promise<HoldingsOutput> {
  const wallet = await getWalletData(secretId);

  const positions = await polymarket.getPositions(wallet.safeAddress);

  // Map to our holding format
  const holdings: Holding[] = positions.map((pos) => ({
    tokenId: pos.asset,
    shares: parseFloat(pos.size),
    averageEntryPrice: parseFloat(pos.avgPrice),
    currentPrice: parseFloat(pos.curPrice),
    pnl: parseFloat(pos.cashPnl),
    pnlPercent: parseFloat(pos.percentPnl),
    marketTitle: pos.title,
    outcome: pos.outcome,
  }));

  return {
    walletAddress: wallet.walletAddress,
    holdings,
  };
}

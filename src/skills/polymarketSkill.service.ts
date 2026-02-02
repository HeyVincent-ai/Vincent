import { type Hex } from 'viem';
import prisma from '../db/client';
import { AppError } from '../api/middleware/errorHandler';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker';
import { sendApprovalRequest } from '../telegram';
import * as polymarket from './polymarket.service';

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
  eoaAddress: string;
  reason?: string;
  orderDetails?: any;
}

export interface PositionsOutput {
  eoaAddress: string;
  openOrders: polymarket.OpenOrder[];
}

export interface MarketInfoOutput {
  market: any;
}

export interface PolymarketBalanceOutput {
  eoaAddress: string;
  collateral: { balance: string; allowance: string };
}

// ============================================================
// Helpers
// ============================================================

async function getWalletData(secretId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, deletedAt: null },
    include: { walletMetadata: true },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  if (secret.type !== 'EVM_WALLET') {
    throw new AppError('INVALID_TYPE', 'Secret is not an EVM wallet', 400);
  }

  if (!secret.value) {
    throw new AppError('NO_VALUE', 'Wallet private key not available', 500);
  }

  return {
    privateKey: secret.value as Hex,
    eoaAddress: polymarket.getEoaAddress(secret.value),
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
      eoaAddress: wallet.eoaAddress,
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
      eoaAddress: wallet.eoaAddress,
      reason: policyResult.triggeredPolicy?.reason,
    };
  }

  // Execute the bet
  try {
    const clientConfig = { privateKey: wallet.privateKey, secretId };
    let orderResult: any;

    if (price !== undefined) {
      // Limit order
      orderResult = await polymarket.placeLimitOrder(clientConfig, {
        tokenId,
        side: side === 'BUY' ? polymarket.Side.BUY : polymarket.Side.SELL,
        price,
        size: amount,
      });
    } else {
      // Market order
      orderResult = await polymarket.placeMarketOrder(clientConfig, {
        tokenId,
        side: side === 'BUY' ? polymarket.Side.BUY : polymarket.Side.SELL,
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
      eoaAddress: wallet.eoaAddress,
      orderDetails: orderResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: { error: errorMessage },
      },
    });

    throw new AppError('BET_FAILED', `Polymarket bet failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Positions
// ============================================================

export async function getPositions(
  secretId: string,
  market?: string
): Promise<PositionsOutput> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId };

  const openOrders = await polymarket.getOpenOrders(clientConfig, { market });

  return {
    eoaAddress: wallet.eoaAddress,
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

export async function searchMarkets(nextCursor?: string) {
  return polymarket.getMarkets(nextCursor);
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
  const clientConfig = { privateKey: wallet.privateKey, secretId };

  const collateral = await polymarket.getCollateralBalance(clientConfig);

  return {
    eoaAddress: wallet.eoaAddress,
    collateral: {
      balance: collateral.balance,
      allowance: collateral.allowance,
    },
  };
}

// ============================================================
// Order Management
// ============================================================

export async function cancelOrder(
  secretId: string,
  orderId: string
): Promise<any> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId };
  return polymarket.cancelOrder(clientConfig, orderId);
}

export async function cancelAllOrders(secretId: string): Promise<any> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId };
  return polymarket.cancelAllOrders(clientConfig);
}

// ============================================================
// Trades History
// ============================================================

export async function getTrades(
  secretId: string,
  market?: string
): Promise<polymarket.Trade[]> {
  const wallet = await getWalletData(secretId);
  const clientConfig = { privateKey: wallet.privateKey, secretId };
  return polymarket.getTrades(clientConfig, { market });
}

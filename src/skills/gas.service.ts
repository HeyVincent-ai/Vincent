import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../db/client';
import * as priceService from '../services/price.service';

export interface RecordGasInput {
  secretId: string;
  userId?: string;
  transactionHash: string;
  chainId: number;
  gasUsed: bigint;
  gasPriceGwei: number;
}

/**
 * Record gas usage for a transaction.
 * Converts gas cost to USD using the current ETH price.
 */
export async function recordGasUsage(input: RecordGasInput) {
  const { secretId, userId, transactionHash, chainId, gasUsed, gasPriceGwei } = input;

  // Calculate cost in ETH: gasUsed * gasPriceGwei / 1e9
  const costEth = Number(gasUsed) * gasPriceGwei / 1e9;

  // Convert to USD
  let costUsd: number;
  try {
    costUsd = await priceService.ethToUsd(costEth);
  } catch {
    costUsd = 0; // If price unavailable, record 0 (will reconcile later)
  }

  return prisma.gasUsage.create({
    data: {
      secretId,
      userId,
      transactionHash,
      chainId,
      gasUsed,
      gasPriceGwei: new Decimal(gasPriceGwei),
      costUsd: new Decimal(costUsd),
    },
  });
}

/**
 * Get gas usage for a secret in the current billing period.
 */
export async function getGasUsageForSecret(
  secretId: string,
  since?: Date
): Promise<{ totalCostUsd: number; count: number }> {
  const where: { secretId: string; createdAt?: { gte: Date } } = { secretId };
  if (since) {
    where.createdAt = { gte: since };
  }

  const result = await prisma.gasUsage.aggregate({
    where,
    _sum: { costUsd: true },
    _count: true,
  });

  return {
    totalCostUsd: result._sum.costUsd?.toNumber() ?? 0,
    count: result._count,
  };
}

/**
 * Get gas usage for a user in the current billing period.
 */
export async function getGasUsageForUser(
  userId: string,
  since?: Date
): Promise<{ totalCostUsd: number; count: number }> {
  const where: { userId: string; createdAt?: { gte: Date } } = { userId };
  if (since) {
    where.createdAt = { gte: since };
  }

  const result = await prisma.gasUsage.aggregate({
    where,
    _sum: { costUsd: true },
    _count: true,
  });

  return {
    totalCostUsd: result._sum.costUsd?.toNumber() ?? 0,
    count: result._count,
  };
}

/**
 * Check if a user has an active subscription (required for mainnet).
 * Returns true if the user has an active subscription or the chain is a testnet.
 */
export async function checkSubscriptionForChain(
  userId: string | null,
  chainId: number
): Promise<{ allowed: boolean; reason?: string }> {
  // Testnets are always free
  const TESTNET_CHAIN_IDS = [11155111, 5, 80001, 421613, 84532]; // sepolia, goerli, mumbai, arb-goerli, base-sepolia
  if (TESTNET_CHAIN_IDS.includes(chainId)) {
    return { allowed: true };
  }

  // Mainnet requires a claimed secret with an active subscription
  if (!userId) {
    return {
      allowed: false,
      reason: 'Mainnet transactions require the wallet to be claimed and a subscription to be active',
    };
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      currentPeriodEnd: { gte: new Date() },
    },
  });

  if (!subscription) {
    return {
      allowed: false,
      reason: 'Mainnet transactions require an active subscription ($10/month). Subscribe at /api/billing/subscribe',
    };
  }

  return { allowed: true };
}

import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../db/client.js';
import * as priceService from '../services/price.service.js';
import { TESTNET_CHAIN_IDS } from '../config/chains.js';
import { env } from '../utils/env.js';

// Default frontend URL if not configured
const BILLING_URL = env.FRONTEND_URL ? `${env.FRONTEND_URL}/billing` : '/billing';

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
 * Calculate trial status for a secret.
 * Returns whether still in trial and days remaining.
 */
export function calculateTrialStatus(secretCreatedAt: Date): {
  inTrial: boolean;
  trialDaysRemaining: number;
  trialEndsAt: Date;
} {
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const trialEnd = new Date(secretCreatedAt.getTime() + threeDaysMs);
  const now = new Date();
  const inTrial = now < trialEnd;
  const msRemaining = Math.max(0, trialEnd.getTime() - now.getTime());
  const trialDaysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

  return { inTrial, trialDaysRemaining, trialEndsAt: trialEnd };
}

/**
 * Check if a user has an active subscription (required for mainnet).
 * Returns true if the user has an active subscription or the chain is a testnet.
 */
export async function checkSubscriptionForChain(
  userId: string | null,
  chainId: number,
  secretCreatedAt: Date
): Promise<{ allowed: boolean; reason?: string; subscribeUrl?: string }> {
  // Testnets are always free
  if (TESTNET_CHAIN_IDS.includes(chainId)) {
    return { allowed: true };
  }

  // Allow free mainnet usage for the first 3 days after the secret was created
  const { inTrial } = calculateTrialStatus(secretCreatedAt);
  if (inTrial) {
    return { allowed: true };
  }

  // After trial, mainnet requires a claimed secret with an active subscription
  if (!userId) {
    return {
      allowed: false,
      reason: `Free 3-day trial expired. To continue making mainnet transactions, claim this wallet and subscribe ($10/month). Subscribe at: ${BILLING_URL}`,
      subscribeUrl: BILLING_URL,
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
      reason: `Free 3-day trial expired. Mainnet transactions require an active subscription ($10/month). Subscribe at: ${BILLING_URL}`,
      subscribeUrl: BILLING_URL,
    };
  }

  return { allowed: true };
}

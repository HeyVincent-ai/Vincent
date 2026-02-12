import prisma from '../db/client.js';
import { isAddress, getAddress } from 'viem';

/**
 * Register a wallet address for USDC deposit attribution.
 * Links a sender address to a specific OpenClaw deployment so incoming
 * USDC deposits from that address are automatically credited.
 */
export async function registerWallet(
  userId: string,
  deploymentId: string,
  address: string,
  label?: string
) {
  if (!isAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }

  // Verify user owns the deployment
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });
  if (!deployment) {
    throw new Error('Deployment not found');
  }

  const normalized = address.toLowerCase();

  const wallet = await prisma.depositWallet.create({
    data: {
      deploymentId,
      userId,
      address: normalized,
      label: label || undefined,
    },
  });

  return wallet;
}

/**
 * List registered deposit wallets for a user, optionally filtered by deployment.
 */
export async function listWallets(userId: string, deploymentId?: string) {
  const where: { userId: string; revokedAt: null; deploymentId?: string } = {
    userId,
    revokedAt: null,
  };
  if (deploymentId) {
    where.deploymentId = deploymentId;
  }

  return prisma.depositWallet.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Soft-revoke a wallet registration. The poller will stop attributing
 * deposits from this address to the associated deployment.
 */
export async function revokeWallet(userId: string, walletId: string) {
  const wallet = await prisma.depositWallet.findFirst({
    where: { id: walletId, userId, revokedAt: null },
  });
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  await prisma.depositWallet.update({
    where: { id: walletId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Look up the deployment ID associated with a wallet address.
 * Used by the deposit poller to attribute incoming USDC transfers.
 */
export async function findDeploymentByWalletAddress(
  address: string
): Promise<{ deploymentId: string; userId: string } | null> {
  const normalized = address.toLowerCase();

  const wallet = await prisma.depositWallet.findFirst({
    where: { address: normalized, revokedAt: null },
    select: { deploymentId: true, userId: true },
  });

  return wallet;
}

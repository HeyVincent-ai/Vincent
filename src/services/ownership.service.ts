import { randomBytes } from 'crypto';
import { verifyMessage, type Address, type Hex } from 'viem';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import * as zerodev from '../skills/zerodev.service.js';

// ============================================================
// Types
// ============================================================

export interface OwnershipStatus {
  canTakeOwnership: boolean;
  ownershipTransferred: boolean;
  ownerAddress: string | null;
  transferredAt: Date | null;
  chainsUsed: number[];
}

export interface OwnershipChallengeResult {
  challenge: string;
  expiresAt: Date;
  chainsToTransfer: number[];
}

export interface OwnershipTransferResult {
  txHashes: Record<number, string>;
}

// ============================================================
// Challenge Storage (in-memory, single-instance)
// ============================================================

interface OwnershipChallenge {
  challenge: string;
  address: string;
  expiresAt: Date;
}

const challenges = new Map<string, OwnershipChallenge>();

const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================
// Challenge Generation
// ============================================================

/**
 * Generate a challenge message for ownership verification.
 * The message includes all relevant details to prevent replay attacks.
 */
export function generateOwnershipChallenge(
  secretId: string,
  walletAddress: string,
  newOwnerAddress: string
): string {
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString('hex');

  return `SafeSkills Ownership Verification

I am taking ownership of the smart wallet:
${walletAddress}

My address: ${newOwnerAddress}
Secret ID: ${secretId}
Timestamp: ${timestamp}
Nonce: ${nonce}

By signing this message, I confirm that I control the address above and authorize SafeSkills to transfer smart account ownership to me.`;
}

/**
 * Store a challenge for later verification.
 */
export function storeChallenge(
  secretId: string,
  address: string,
  challenge: string
): { expiresAt: Date } {
  const key = `${secretId}:${address.toLowerCase()}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);

  challenges.set(key, {
    challenge,
    address: address.toLowerCase(),
    expiresAt,
  });

  return { expiresAt };
}

// ============================================================
// Verification and Transfer
// ============================================================

/**
 * Verify the ownership signature and execute the ownership transfer.
 * This uses ZeroDev's recovery mechanism to change the sudo validator.
 */
export async function verifyAndTransferOwnership(
  secretId: string,
  newOwnerAddress: string,
  signature: string
): Promise<OwnershipTransferResult> {
  const key = `${secretId}:${newOwnerAddress.toLowerCase()}`;
  const stored = challenges.get(key);

  if (!stored) {
    throw new AppError(
      'CHALLENGE_NOT_FOUND',
      'No challenge found. Request a new challenge.',
      400
    );
  }

  if (new Date() > stored.expiresAt) {
    challenges.delete(key);
    throw new AppError('CHALLENGE_EXPIRED', 'Challenge has expired. Request a new challenge.', 400);
  }

  // Verify the signature
  const isValid = await verifyMessage({
    address: newOwnerAddress as Address,
    message: stored.challenge,
    signature: signature as Hex,
  });

  if (!isValid) {
    throw new AppError('INVALID_SIGNATURE', 'Signature verification failed', 400);
  }

  // One-time use - delete challenge immediately
  challenges.delete(key);

  // Get the secret and wallet metadata
  const secret = await prisma.secret.findUnique({
    where: { id: secretId },
    include: { walletMetadata: true },
  });

  if (!secret || !secret.value || !secret.walletMetadata) {
    throw new AppError('NOT_FOUND', 'Wallet not found', 404);
  }

  if (!secret.walletMetadata.canTakeOwnership) {
    throw new AppError(
      'NOT_ELIGIBLE',
      'This wallet is not eligible for ownership transfer',
      400
    );
  }

  if (secret.walletMetadata.ownershipTransferred) {
    throw new AppError('ALREADY_TRANSFERRED', 'Ownership has already been transferred', 409);
  }

  // Execute recovery on all chains where the wallet has been used
  const chainsUsed = secret.walletMetadata.chainsUsed;

  if (chainsUsed.length === 0) {
    throw new AppError(
      'NO_CHAINS_USED',
      'Wallet has not been used on any chain yet. Make at least one transaction first.',
      400
    );
  }

  const txHashes: Record<number, string> = {};

  for (const chainId of chainsUsed) {
    try {
      const txHash = await zerodev.executeRecovery(
        secret.value as Hex,
        chainId,
        secret.walletMetadata.smartAccountAddress as Address,
        newOwnerAddress as Address
      );
      txHashes[chainId] = txHash;
    } catch (error) {
      console.error(`Failed to transfer ownership on chain ${chainId}:`, error);
      throw new AppError(
        'TRANSFER_FAILED',
        `Failed to transfer ownership on chain ${chainId}`,
        500,
        { chainId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // Update the database
  await prisma.walletSecretMetadata.update({
    where: { secretId },
    data: {
      ownershipTransferred: true,
      ownerAddress: newOwnerAddress,
      transferredAt: new Date(),
      transferTxHash: Object.values(txHashes)[0] || null,
    },
  });

  return { txHashes };
}

// ============================================================
// Status Queries
// ============================================================

/**
 * Get the ownership status for a wallet.
 */
export async function getOwnershipStatus(secretId: string): Promise<OwnershipStatus> {
  const metadata = await prisma.walletSecretMetadata.findUnique({
    where: { secretId },
  });

  if (!metadata) {
    throw new AppError('NOT_FOUND', 'Wallet metadata not found', 404);
  }

  return {
    canTakeOwnership: metadata.canTakeOwnership,
    ownershipTransferred: metadata.ownershipTransferred,
    ownerAddress: metadata.ownerAddress,
    transferredAt: metadata.transferredAt,
    chainsUsed: metadata.chainsUsed,
  };
}

/**
 * Request an ownership challenge for signing.
 * Validates that the wallet is eligible for ownership transfer.
 */
export async function requestOwnershipChallenge(
  secretId: string,
  newOwnerAddress: string
): Promise<OwnershipChallengeResult> {
  const metadata = await prisma.walletSecretMetadata.findUnique({
    where: { secretId },
  });

  if (!metadata) {
    throw new AppError('NOT_FOUND', 'Wallet not found', 404);
  }

  if (!metadata.canTakeOwnership) {
    throw new AppError(
      'NOT_ELIGIBLE',
      'This wallet was created before self-custody was available. Create a new wallet to use self-custody.',
      400
    );
  }

  if (metadata.ownershipTransferred) {
    throw new AppError('ALREADY_TRANSFERRED', 'Ownership has already been transferred', 409);
  }

  if (metadata.chainsUsed.length === 0) {
    throw new AppError(
      'NO_CHAINS_USED',
      'Wallet has not been used on any chain yet. Make at least one transaction first.',
      400
    );
  }

  const challenge = generateOwnershipChallenge(
    secretId,
    metadata.smartAccountAddress,
    newOwnerAddress
  );

  const { expiresAt } = storeChallenge(secretId, newOwnerAddress, challenge);

  return {
    challenge,
    expiresAt,
    chainsToTransfer: metadata.chainsUsed,
  };
}

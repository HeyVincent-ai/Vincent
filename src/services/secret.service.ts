import { SecretType, Secret, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { type Hex } from 'viem';
import prisma from '../db/client';
import { AppError } from '../api/middleware/errorHandler';
import { env } from '../utils/env';
import * as zerodev from '../skills/zerodev.service';

// Types for secret operations
export interface CreateSecretInput {
  type: SecretType;
  memo?: string;
}

export interface CreateSecretResult {
  secret: SecretPublicData;
  claimUrl: string;
  claimToken: string;
}

export interface SecretPublicData {
  id: string;
  type: SecretType;
  memo: string | null;
  claimed: boolean;
  claimedAt: Date | null;
  createdAt: Date;
  walletAddress?: string;
}

export interface ClaimSecretInput {
  secretId: string;
  claimToken: string;
  userId: string;
}

export interface SetSecretValueInput {
  secretId: string;
  userId: string;
  value: string;
}

// Generate a secure claim token
function generateClaimToken(): string {
  return randomBytes(32).toString('hex');
}

// Generate a random private key (for EOA wallets)
// In production, this would use proper cryptographic libraries
function generatePrivateKey(): string {
  return '0x' + randomBytes(32).toString('hex');
}

// Generate a placeholder smart account address (fallback when ZeroDev not configured)
function generatePlaceholderAddress(): string {
  return '0x' + randomBytes(20).toString('hex');
}

/**
 * Create a new secret
 * - For EVM_WALLET: generates EOA private key and placeholder smart account
 * - For other types: creates placeholder awaiting user-provided value
 */
export async function createSecret(input: CreateSecretInput): Promise<CreateSecretResult> {
  const { type, memo } = input;

  const claimToken = generateClaimToken();
  let secretValue: string | null = null;
  let walletMetadata: Prisma.WalletSecretMetadataCreateNestedOneWithoutSecretInput | undefined;

  // For EVM_WALLET, generate the private key and smart account
  if (type === SecretType.EVM_WALLET) {
    secretValue = generatePrivateKey();

    // Use Sepolia for counterfactual address derivation. With ZeroDev, the
    // smart account address is the same on all chains, so the chain used
    // here doesn't matter — the wallet works on any chain.
    const derivationChainId = 84532; // Base Sepolia

    // Create ZeroDev smart account if configured, otherwise use placeholder
    let smartAccountAddress: string;
    if (env.ZERODEV_PROJECT_ID) {
      smartAccountAddress = await zerodev.createSmartAccount(secretValue as Hex, derivationChainId);
    } else {
      smartAccountAddress = generatePlaceholderAddress();
    }

    walletMetadata = {
      create: {
        smartAccountAddress,
      },
    };
  }

  const secret = await prisma.secret.create({
    data: {
      type,
      value: secretValue,
      memo,
      claimToken,
      walletMetadata,
    },
    include: {
      walletMetadata: true,
    },
  });

  // Build claim URL (frontend URL would come from env in production)
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const claimUrl = `${baseUrl}/claim/${secret.id}?token=${claimToken}`;

  return {
    secret: toPublicData(secret),
    claimUrl,
    claimToken,
  };
}

/**
 * Get secret by ID (public data only)
 */
export async function getSecretById(
  secretId: string,
  options?: { includeDeleted?: boolean }
): Promise<SecretPublicData | null> {
  const where: Prisma.SecretWhereInput = { id: secretId };

  if (!options?.includeDeleted) {
    where.deletedAt = null;
  }

  const secret = await prisma.secret.findFirst({
    where,
    include: {
      walletMetadata: true,
    },
  });

  if (!secret) {
    return null;
  }

  return toPublicData(secret);
}

/**
 * Get secret with full data (internal use only)
 */
export async function getSecretWithValue(secretId: string): Promise<Secret | null> {
  return prisma.secret.findFirst({
    where: {
      id: secretId,
      deletedAt: null,
    },
  });
}

/**
 * Get secrets for a user
 */
export async function getSecretsByUserId(userId: string): Promise<SecretPublicData[]> {
  const secrets = await prisma.secret.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    include: {
      walletMetadata: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return secrets.map(toPublicData);
}

/**
 * Claim a secret - associate it with a user
 */
export async function claimSecret(input: ClaimSecretInput): Promise<SecretPublicData> {
  const { secretId, claimToken, userId } = input;

  const secret = await prisma.secret.findFirst({
    where: {
      id: secretId,
      deletedAt: null,
    },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  if (secret.claimedAt) {
    throw new AppError('ALREADY_CLAIMED', 'Secret has already been claimed', 409);
  }

  if (secret.claimToken !== claimToken) {
    throw new AppError('INVALID_TOKEN', 'Invalid claim token', 403);
  }

  // Check if claim token has expired
  const expiryDate = new Date(secret.createdAt);
  expiryDate.setDate(expiryDate.getDate() + env.CLAIM_TOKEN_EXPIRY_DAYS);

  if (new Date() > expiryDate) {
    throw new AppError('TOKEN_EXPIRED', 'Claim token has expired', 403);
  }

  const updatedSecret = await prisma.secret.update({
    where: { id: secretId },
    data: {
      userId,
      claimedAt: new Date(),
      claimToken: null, // Invalidate the claim token
    },
    include: {
      walletMetadata: true,
    },
  });

  return toPublicData(updatedSecret);
}

/**
 * Set secret value (for user-provided secrets)
 * Only allowed if secret has no value and is claimed by the user
 */
export async function setSecretValue(input: SetSecretValueInput): Promise<SecretPublicData> {
  const { secretId, userId, value } = input;

  const secret = await prisma.secret.findFirst({
    where: {
      id: secretId,
      deletedAt: null,
    },
    include: {
      walletMetadata: true,
    },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  if (secret.userId !== userId) {
    throw new AppError('FORBIDDEN', 'You do not own this secret', 403);
  }

  if (!secret.claimedAt) {
    throw new AppError('NOT_CLAIMED', 'Secret must be claimed before setting value', 400);
  }

  if (secret.value !== null) {
    throw new AppError('VALUE_ALREADY_SET', 'Secret value has already been set', 409);
  }

  const updatedSecret = await prisma.secret.update({
    where: { id: secretId },
    data: { value },
    include: {
      walletMetadata: true,
    },
  });

  return toPublicData(updatedSecret);
}

/**
 * Soft delete a secret
 */
export async function deleteSecret(secretId: string, userId: string): Promise<void> {
  const secret = await prisma.secret.findFirst({
    where: {
      id: secretId,
      deletedAt: null,
    },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  if (secret.userId !== userId) {
    throw new AppError('FORBIDDEN', 'You do not own this secret', 403);
  }

  await prisma.secret.update({
    where: { id: secretId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Verify secret ownership
 */
export async function verifySecretOwnership(secretId: string, userId: string): Promise<boolean> {
  const secret = await prisma.secret.findFirst({
    where: {
      id: secretId,
      userId,
      deletedAt: null,
    },
  });

  return secret !== null;
}

/**
 * Get secret by API key ID (for middleware)
 */
export async function getSecretByApiKeyId(apiKeyId: string): Promise<Secret | null> {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: apiKeyId,
      revokedAt: null,
    },
    include: {
      secret: true,
    },
  });

  if (!apiKey || apiKey.secret.deletedAt) {
    return null;
  }

  return apiKey.secret;
}

// ---- Re-link token management (in-memory, single-instance) ----

interface RelinkToken {
  secretId: string;
  expiresAt: Date;
}

const relinkTokens = new Map<string, RelinkToken>();

const RELINK_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a one-time re-link token for a secret.
 * The owner can give this token to an agent so the agent can obtain a new API key.
 */
export function generateRelinkToken(secretId: string): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RELINK_TOKEN_EXPIRY_MS);
  relinkTokens.set(token, { secretId, expiresAt });
  return { token, expiresAt };
}

/**
 * Validate and consume a re-link token. Returns the secretId if valid.
 */
export function consumeRelinkToken(token: string): string | null {
  const entry = relinkTokens.get(token);
  if (!entry) return null;
  relinkTokens.delete(token); // one-time use
  if (new Date() > entry.expiresAt) return null;
  return entry.secretId;
}

// Helper to convert secret to public data (excludes sensitive value)
type SecretWithMetadata = Secret & {
  walletMetadata?: { smartAccountAddress: string } | null;
};

function toPublicData(secret: SecretWithMetadata): SecretPublicData {
  const publicData: SecretPublicData = {
    id: secret.id,
    type: secret.type,
    memo: secret.memo,
    claimed: secret.claimedAt !== null,
    claimedAt: secret.claimedAt,
    createdAt: secret.createdAt,
  };

  if (secret.walletMetadata) {
    publicData.walletAddress = secret.walletMetadata.smartAccountAddress;
  }

  return publicData;
}

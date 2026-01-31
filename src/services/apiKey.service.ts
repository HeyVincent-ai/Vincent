import { ApiKey } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import prisma from '../db/client';
import { AppError } from '../api/middleware/errorHandler';

// Types for API key operations
export interface CreateApiKeyInput {
  secretId: string;
  name: string;
}

export interface CreateApiKeyResult {
  apiKey: ApiKeyPublicData;
  plainKey: string; // Only returned once on creation
}

export interface ApiKeyPublicData {
  id: string;
  secretId: string;
  name: string;
  createdAt: Date;
  revokedAt: Date | null;
  isActive: boolean;
}

export interface ValidateApiKeyResult {
  valid: boolean;
  apiKey?: ApiKey;
  secretId?: string;
}

// API key prefix for easy identification
const API_KEY_PREFIX = 'ssk_';

/**
 * SHA-256 hash an API key. API keys are high-entropy random strings,
 * so SHA-256 is sufficient (no need for bcrypt's slow hashing).
 */
function hashApiKey(plainKey: string): string {
  return createHash('sha256').update(plainKey).digest('hex');
}

/**
 * Generate a secure API key
 * Format: ssk_<64 random hex characters>
 */
function generateApiKey(): string {
  const randomPart = randomBytes(32).toString('hex');
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Create a new API key for a secret
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const { secretId, name } = input;

  // Verify secret exists and is not deleted
  const secret = await prisma.secret.findFirst({
    where: {
      id: secretId,
      deletedAt: null,
    },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  // Generate the API key
  const plainKey = generateApiKey();

  // Hash the key for storage
  const keyHash = hashApiKey(plainKey);

  // Store the hashed key
  const apiKey = await prisma.apiKey.create({
    data: {
      secretId,
      keyHash,
      name,
    },
  });

  return {
    apiKey: toPublicData(apiKey),
    plainKey, // Only returned once!
  };
}

/**
 * Validate an API key and return the associated secret ID
 */
export async function validateApiKey(plainKey: string): Promise<ValidateApiKeyResult> {
  // Quick format check
  if (!plainKey || !plainKey.startsWith(API_KEY_PREFIX)) {
    return { valid: false };
  }

  const keyHash = hashApiKey(plainKey);

  // Direct lookup by hash — O(1) instead of O(n) bcrypt compares
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null,
    },
    include: {
      secret: true,
    },
  });

  if (!apiKey || apiKey.secret.deletedAt) {
    return { valid: false };
  }

  return {
    valid: true,
    apiKey,
    secretId: apiKey.secretId,
  };
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(apiKeyId: string): Promise<ApiKeyPublicData | null> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
  });

  if (!apiKey) {
    return null;
  }

  return toPublicData(apiKey);
}

/**
 * List all API keys for a secret
 */
export async function listApiKeys(secretId: string): Promise<ApiKeyPublicData[]> {
  const apiKeys = await prisma.apiKey.findMany({
    where: { secretId },
    orderBy: { createdAt: 'desc' },
  });

  return apiKeys.map(toPublicData);
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  apiKeyId: string,
  secretId: string,
  userId: string
): Promise<ApiKeyPublicData> {
  // First verify the user owns the secret
  const secret = await prisma.secret.findFirst({
    where: {
      id: secretId,
      userId,
      deletedAt: null,
    },
  });

  if (!secret) {
    throw new AppError('FORBIDDEN', 'You do not own this secret', 403);
  }

  // Find the API key
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: apiKeyId,
      secretId,
    },
  });

  if (!apiKey) {
    throw new AppError('NOT_FOUND', 'API key not found', 404);
  }

  if (apiKey.revokedAt) {
    throw new AppError('ALREADY_REVOKED', 'API key is already revoked', 409);
  }

  // Revoke the key
  const revokedKey = await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { revokedAt: new Date() },
  });

  return toPublicData(revokedKey);
}

/**
 * Count active API keys for a secret
 */
export async function countActiveApiKeys(secretId: string): Promise<number> {
  return prisma.apiKey.count({
    where: {
      secretId,
      revokedAt: null,
    },
  });
}

/**
 * Track API key usage (called on each API request)
 */
export async function trackApiKeyUsage(_apiKeyId: string): Promise<void> {
  // For now, this is a no-op. In the future, we could:
  // - Update a lastUsedAt field
  // - Increment a usage counter
  // - Log to a separate usage tracking table
  // This is called by the auth middleware on each authenticated request
}

// Helper to convert API key to public data
function toPublicData(apiKey: ApiKey): ApiKeyPublicData {
  return {
    id: apiKey.id,
    secretId: apiKey.secretId,
    name: apiKey.name,
    createdAt: apiKey.createdAt,
    revokedAt: apiKey.revokedAt,
    isActive: apiKey.revokedAt === null,
  };
}

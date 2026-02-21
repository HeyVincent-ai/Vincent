import { randomBytes, createHash } from 'crypto';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { validateApiKey } from './apiKey.service.js';

export interface MintReadOnlyTokenInput {
  apiKeys: string[];
}

export interface MintReadOnlyTokenResult {
  plainToken: string;
  tokenId: string;
  userId: string;
  secretIds: string[];
}

export interface ReadOnlyTokenPublicData {
  id: string;
  userId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  secretCount: number;
}

export interface ValidateReadOnlyTokenResult {
  valid: boolean;
  tokenId?: string;
  userId?: string;
  secretIds?: string[];
}

const READ_ONLY_TOKEN_PREFIX = 'sro_';

function generateReadOnlyToken(): string {
  const randomPart = randomBytes(32).toString('hex');
  return `${READ_ONLY_TOKEN_PREFIX}${randomPart}`;
}

function hashReadOnlyToken(plainToken: string): string {
  return createHash('sha256').update(plainToken).digest('hex');
}

function normalizeApiKeys(apiKeys: string[]): string[] {
  return Array.from(new Set(apiKeys.map((key) => key.trim()).filter(Boolean)));
}

export async function mintReadOnlyToken(
  input: MintReadOnlyTokenInput
): Promise<MintReadOnlyTokenResult> {
  const apiKeys = normalizeApiKeys(input.apiKeys || []);

  if (apiKeys.length === 0) {
    throw new AppError('BAD_REQUEST', 'At least one API key is required', 400);
  }

  const validations = await Promise.all(apiKeys.map((key) => validateApiKey(key)));
  const invalidIndex = validations.findIndex((result) => !result.valid || !result.apiKey);

  if (invalidIndex !== -1) {
    throw new AppError('UNAUTHORIZED', 'Invalid or revoked API key', 401);
  }

  const secretIds = Array.from(new Set(validations.map((result) => result.secretId as string)));

  const secrets = await prisma.secret.findMany({
    where: {
      id: { in: secretIds },
      deletedAt: null,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (secrets.length !== secretIds.length) {
    throw new AppError('NOT_FOUND', 'Secret not found or deleted', 404);
  }

  const userIds = Array.from(new Set(secrets.map((secret) => secret.userId).filter(Boolean)));

  if (userIds.length !== 1) {
    throw new AppError(
      'FORBIDDEN',
      'All API keys must belong to claimed secrets for a single user',
      403
    );
  }

  const userId = userIds[0] as string;
  const plainToken = generateReadOnlyToken();
  const tokenHash = hashReadOnlyToken(plainToken);

  const token = await prisma.$transaction(async (tx) => {
    const created = await tx.readOnlyToken.create({
      data: {
        tokenHash,
        userId,
      },
    });

    await tx.readOnlyTokenSecret.createMany({
      data: secretIds.map((secretId) => ({
        tokenId: created.id,
        secretId,
      })),
    });

    return created;
  });

  return {
    plainToken,
    tokenId: token.id,
    userId,
    secretIds,
  };
}

export async function validateReadOnlyToken(
  plainToken: string
): Promise<ValidateReadOnlyTokenResult> {
  if (!plainToken || !plainToken.startsWith(READ_ONLY_TOKEN_PREFIX)) {
    return { valid: false };
  }

  const tokenHash = hashReadOnlyToken(plainToken);

  const token = await prisma.readOnlyToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
    },
    include: {
      secrets: {
        include: {
          secret: {
            select: {
              id: true,
              deletedAt: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!token) {
    return { valid: false };
  }

  const secretIds = token.secrets
    .filter((link) => !link.secret.deletedAt && link.secret.userId === token.userId)
    .map((link) => link.secretId);

  if (secretIds.length === 0) {
    return { valid: false };
  }

  return {
    valid: true,
    tokenId: token.id,
    userId: token.userId,
    secretIds,
  };
}

export async function revokeReadOnlyToken(tokenId: string, userId: string) {
  const token = await prisma.readOnlyToken.findFirst({
    where: {
      id: tokenId,
      userId,
    },
  });

  if (!token) {
    throw new AppError('NOT_FOUND', 'Read-only token not found', 404);
  }

  if (token.revokedAt) {
    throw new AppError('ALREADY_REVOKED', 'Read-only token is already revoked', 409);
  }

  return prisma.readOnlyToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

export async function trackReadOnlyTokenUsage(tokenId: string): Promise<void> {
  await prisma.readOnlyToken.update({
    where: { id: tokenId },
    data: { lastUsedAt: new Date() },
  });
}

export async function listReadOnlyTokens(userId: string): Promise<ReadOnlyTokenPublicData[]> {
  const tokens = await prisma.readOnlyToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      secrets: true,
    },
  });

  return tokens.map((token) => ({
    id: token.id,
    userId: token.userId,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
    secretCount: token.secrets.length,
  }));
}

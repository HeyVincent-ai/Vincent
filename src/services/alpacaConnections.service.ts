import { AlpacaEnvironment, AlpacaConnection } from '@prisma/client';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { encryptString, decryptString } from '../utils/encryption.js';
import * as alpacaApi from './alpaca.service.js';

export interface AlpacaConnectionInput {
  userId: string;
  name?: string;
  environment: 'paper' | 'live';
  apiKeyId: string;
  apiSecretKey: string;
}

export interface AlpacaConnectionPublic {
  id: string;
  userId: string;
  name: string | null;
  environment: AlpacaEnvironment;
  baseUrl: string;
  isActive: boolean;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicData(conn: AlpacaConnection): AlpacaConnectionPublic {
  return {
    id: conn.id,
    userId: conn.userId,
    name: conn.name ?? null,
    environment: conn.environment,
    baseUrl: conn.baseUrl,
    isActive: conn.isActive,
    disconnectedAt: conn.disconnectedAt ?? null,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };
}

export function getBaseUrl(environment: AlpacaEnvironment): string {
  return environment === 'PAPER'
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';
}

function normalizeEnvironment(env: 'paper' | 'live'): AlpacaEnvironment {
  return env === 'paper' ? 'PAPER' : 'LIVE';
}

export async function testConnection(input: AlpacaConnectionInput) {
  const environment = normalizeEnvironment(input.environment);
  const baseUrl = getBaseUrl(environment);
  const account = await alpacaApi.getAccount({
    baseUrl,
    keyId: input.apiKeyId,
    secretKey: input.apiSecretKey,
  });
  return { account };
}

export async function connect(input: AlpacaConnectionInput) {
  const environment = normalizeEnvironment(input.environment);
  const baseUrl = getBaseUrl(environment);

  const account = await alpacaApi.getAccount({
    baseUrl,
    keyId: input.apiKeyId,
    secretKey: input.apiSecretKey,
  });

  // Deactivate any existing active connections for this user
  await prisma.alpacaConnection.updateMany({
    where: { userId: input.userId, isActive: true },
    data: { isActive: false },
  });

  const connection = await prisma.alpacaConnection.create({
    data: {
      userId: input.userId,
      name: input.name,
      environment,
      baseUrl,
      alpacaKeyIdEncrypted: encryptString(input.apiKeyId),
      alpacaSecretKeyEncrypted: encryptString(input.apiSecretKey),
      isActive: true,
    },
  });

  return { connection: toPublicData(connection), account };
}

export async function listConnections(userId: string): Promise<AlpacaConnectionPublic[]> {
  const connections = await prisma.alpacaConnection.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return connections.map(toPublicData);
}

export async function getConnection(userId: string, connectionId?: string) {
  if (connectionId) {
    return prisma.alpacaConnection.findFirst({
      where: { id: connectionId, userId },
    });
  }
  return prisma.alpacaConnection.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function disconnect(userId: string, connectionId: string) {
  const connection = await prisma.alpacaConnection.findFirst({
    where: { id: connectionId, userId },
  });
  if (!connection) {
    throw new AppError('NOT_FOUND', 'Alpaca connection not found', 404);
  }

  const updated = await prisma.alpacaConnection.update({
    where: { id: connectionId },
    data: {
      isActive: false,
      disconnectedAt: new Date(),
      alpacaKeyIdEncrypted: null,
      alpacaSecretKeyEncrypted: null,
    },
  });

  return toPublicData(updated);
}

export function getDecryptedCredentials(connection: AlpacaConnection) {
  if (!connection.alpacaKeyIdEncrypted || !connection.alpacaSecretKeyEncrypted) {
    throw new AppError('ALPACA_DISCONNECTED', 'Alpaca credentials are not available', 400);
  }

  return {
    baseUrl: connection.baseUrl,
    keyId: decryptString(connection.alpacaKeyIdEncrypted),
    secretKey: decryptString(connection.alpacaSecretKeyEncrypted),
  };
}

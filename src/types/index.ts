import { Request } from 'express';
import { User, ApiKey, Secret, SecretType } from '@prisma/client';

/**
 * Safe secret data that excludes sensitive fields like the private key value.
 * This type should be used when attaching secret info to requests or returning
 * secret data in API responses. NEVER expose Secret.value outside of skill execution.
 */
export interface SecretSafeData {
  id: string;
  userId: string | null;
  type: SecretType;
  // NOTE: `value` is intentionally omitted - the private key must never be attached to requests
  memo: string | null;
  claimToken: string | null;
  claimedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Strips the sensitive `value` field from a Secret object.
 * Use this when you need to convert a full Secret to safe data.
 */
export function toSecretSafeData(secret: Secret): SecretSafeData {
  // Explicitly construct the safe object, ensuring `value` is never included
  return {
    id: secret.id,
    userId: secret.userId,
    type: secret.type,
    memo: secret.memo,
    claimToken: secret.claimToken,
    claimedAt: secret.claimedAt,
    deletedAt: secret.deletedAt,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}

// Extend Express Request to include authenticated user/apiKey
export interface AuthenticatedRequest extends Request {
  user?: User;
  apiKey?: ApiKey;
  /**
   * Safe secret data attached by API key auth middleware.
   * IMPORTANT: This intentionally does NOT include the private key (`value` field).
   * Skill services must fetch the secret value directly from the database when needed.
   */
  secret?: SecretSafeData;
}

// Standard API response format
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Pagination parameters
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

// Pagination response metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

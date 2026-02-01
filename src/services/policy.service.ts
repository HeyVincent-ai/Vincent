import { PolicyType, Policy, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../db/client';
import { AppError } from '../api/middleware/errorHandler';

// ============================================================
// Policy Configuration Schemas (Zod)
// ============================================================

const addressListSchema = z.object({
  addresses: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')).min(1),
  approvalOverride: z.boolean().optional().default(false),
});

const functionListSchema = z.object({
  selectors: z.array(z.string().regex(/^0x[a-fA-F0-9]{8}$/, 'Invalid 4-byte function selector')).min(1),
  approvalOverride: z.boolean().optional().default(false),
});

const tokenListSchema = z.object({
  tokens: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address')).min(1),
  approvalOverride: z.boolean().optional().default(false),
});

const spendingLimitSchema = z.object({
  maxUsd: z.number().positive('Spending limit must be positive'),
  approvalOverride: z.boolean().optional().default(false),
});

const requireApprovalSchema = z.object({
  enabled: z.boolean(),
});

// @deprecated - use spending limit policies with approvalOverride instead
const approvalThresholdSchema = z.object({
  thresholdUsd: z.number().positive('Threshold must be positive'),
});

// Map of policy type to its config schema
const policyConfigSchemas: Record<PolicyType, z.ZodSchema> = {
  ADDRESS_ALLOWLIST: addressListSchema,
  FUNCTION_ALLOWLIST: functionListSchema,
  TOKEN_ALLOWLIST: tokenListSchema,
  SPENDING_LIMIT_PER_TX: spendingLimitSchema,
  SPENDING_LIMIT_DAILY: spendingLimitSchema,
  SPENDING_LIMIT_WEEKLY: spendingLimitSchema,
  REQUIRE_APPROVAL: requireApprovalSchema,
  APPROVAL_THRESHOLD: approvalThresholdSchema,
};

// ============================================================
// Types
// ============================================================

export interface CreatePolicyInput {
  secretId: string;
  policyType: PolicyType;
  policyConfig: unknown;
}

export interface UpdatePolicyInput {
  policyId: string;
  secretId: string;
  policyConfig: unknown;
}

export interface PolicyPublicData {
  id: string;
  secretId: string;
  policyType: PolicyType;
  policyConfig: unknown;
  createdAt: Date;
  updatedAt: Date;
}

// Config types for use by checkers
export interface AddressAllowlistConfig { addresses: string[]; approvalOverride?: boolean; }
export interface FunctionAllowlistConfig { selectors: string[]; approvalOverride?: boolean; }
export interface TokenAllowlistConfig { tokens: string[]; approvalOverride?: boolean; }
export interface SpendingLimitConfig { maxUsd: number; approvalOverride?: boolean; }
export interface RequireApprovalConfig { enabled: boolean; }
/** @deprecated Use spending limit policies with approvalOverride instead */
export interface ApprovalThresholdConfig { thresholdUsd: number; }

// ============================================================
// Validation
// ============================================================

/**
 * Validate policy config against its schema
 */
export function validatePolicyConfig(policyType: PolicyType, config: unknown): unknown {
  const schema = policyConfigSchemas[policyType];
  if (!schema) {
    throw new AppError('INVALID_POLICY_TYPE', `Unknown policy type: ${policyType}`, 400);
  }
  return schema.parse(config);
}

// ============================================================
// CRUD Operations
// ============================================================

/**
 * Create a new policy for a secret
 */
export async function createPolicy(input: CreatePolicyInput): Promise<PolicyPublicData> {
  const { secretId, policyType, policyConfig } = input;

  // Validate config
  const validatedConfig = validatePolicyConfig(policyType, policyConfig);

  // Check for duplicate policy type on the same secret
  const existing = await prisma.policy.findFirst({
    where: { secretId, policyType },
  });

  if (existing) {
    throw new AppError(
      'POLICY_EXISTS',
      `A ${policyType} policy already exists for this secret. Use PUT to update it.`,
      409
    );
  }

  const policy = await prisma.policy.create({
    data: {
      secretId,
      policyType,
      policyConfig: validatedConfig as Prisma.InputJsonValue,
    },
  });

  return toPublicData(policy);
}

/**
 * Update an existing policy
 */
export async function updatePolicy(input: UpdatePolicyInput): Promise<PolicyPublicData> {
  const { policyId, secretId, policyConfig } = input;

  const policy = await prisma.policy.findFirst({
    where: { id: policyId, secretId },
  });

  if (!policy) {
    throw new AppError('NOT_FOUND', 'Policy not found', 404);
  }

  const validatedConfig = validatePolicyConfig(policy.policyType, policyConfig);

  const updated = await prisma.policy.update({
    where: { id: policyId },
    data: {
      policyConfig: validatedConfig as Prisma.InputJsonValue,
    },
  });

  return toPublicData(updated);
}

/**
 * List policies for a secret
 */
export async function listPolicies(secretId: string): Promise<PolicyPublicData[]> {
  const policies = await prisma.policy.findMany({
    where: { secretId },
    orderBy: { createdAt: 'asc' },
  });

  return policies.map(toPublicData);
}

/**
 * Get a single policy
 */
export async function getPolicy(policyId: string, secretId: string): Promise<PolicyPublicData | null> {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, secretId },
  });

  return policy ? toPublicData(policy) : null;
}

/**
 * Delete a policy
 */
export async function deletePolicy(policyId: string, secretId: string): Promise<void> {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, secretId },
  });

  if (!policy) {
    throw new AppError('NOT_FOUND', 'Policy not found', 404);
  }

  await prisma.policy.delete({ where: { id: policyId } });
}

/**
 * Get all policies for a secret, grouped by type (for policy checking)
 */
export async function getPoliciesBySecret(secretId: string): Promise<Policy[]> {
  return prisma.policy.findMany({
    where: { secretId },
  });
}

// ============================================================
// Helpers
// ============================================================

function toPublicData(policy: Policy): PolicyPublicData {
  return {
    id: policy.id,
    secretId: policy.secretId,
    policyType: policy.policyType,
    policyConfig: policy.policyConfig,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

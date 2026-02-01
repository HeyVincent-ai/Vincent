import { Policy, PolicyType } from '@prisma/client';
import prisma from '../db/client';
import {
  AddressAllowlistConfig,
  FunctionAllowlistConfig,
  TokenAllowlistConfig,
  SpendingLimitConfig,
  RequireApprovalConfig,
  ApprovalThresholdConfig,
} from '../services/policy.service';
import * as priceService from '../services/price.service';

// ============================================================
// Types
// ============================================================

/** The action being requested, with fields needed by policy checkers */
export interface PolicyCheckAction {
  type: 'transfer' | 'send_transaction';
  to: string;                    // Destination address (lowercase)
  value?: number;                // ETH value (in ETH, not wei)
  tokenAddress?: string;         // ERC20 token address (lowercase), undefined = native ETH
  tokenAmount?: number;          // Token amount in human-readable units
  functionSelector?: string;     // 4-byte selector for send_transaction
}

export type PolicyVerdict = 'allow' | 'deny' | 'require_approval';

export interface PolicyCheckResult {
  verdict: PolicyVerdict;
  /** Which policy caused a deny/require_approval, null if allowed */
  triggeredPolicy?: {
    id: string;
    type: PolicyType;
    reason: string;
  };
}

// ============================================================
// Main Checker
// ============================================================

/**
 * Check all policies for a secret against a given action.
 *
 * Logic:
 * 1. If no policies exist → allow (default open)
 * 2. Allowlist policies (address, function, token) are restrictive:
 *    if present, the action MUST match. If it doesn't → deny.
 * 3. Spending limits: if present, the action's USD value must be under limit → deny if over.
 * 4. Approval policies: if require_approval is enabled → require_approval.
 *    If approval_threshold is set and USD value exceeds it → require_approval.
 * 5. If nothing denies or requires approval → allow.
 */
export async function checkPolicies(
  secretId: string,
  action: PolicyCheckAction
): Promise<PolicyCheckResult> {
  const policies = await prisma.policy.findMany({ where: { secretId } });

  if (policies.length === 0) {
    return { verdict: 'allow' };
  }

  // Phase 1: Check deny conditions (allowlists and spending limits)
  for (const policy of policies) {
    const result = await checkDenyPolicy(policy, action);
    if (result) return result;
  }

  // Phase 2: Check approval requirements
  for (const policy of policies) {
    const result = await checkApprovalPolicy(policy, action);
    if (result) return result;
  }

  return { verdict: 'allow' };
}

// ============================================================
// Individual Policy Checkers
// ============================================================

async function checkDenyPolicy(
  policy: Policy,
  action: PolicyCheckAction
): Promise<PolicyCheckResult | null> {
  switch (policy.policyType) {
    case 'ADDRESS_ALLOWLIST':
      return checkAddressAllowlist(policy, action);
    case 'FUNCTION_ALLOWLIST':
      return checkFunctionAllowlist(policy, action);
    case 'TOKEN_ALLOWLIST':
      return checkTokenAllowlist(policy, action);
    case 'SPENDING_LIMIT_PER_TX':
      return checkSpendingLimitPerTx(policy, action);
    case 'SPENDING_LIMIT_DAILY':
      return checkSpendingLimitWindow(policy, action, 24 * 60 * 60 * 1000);
    case 'SPENDING_LIMIT_WEEKLY':
      return checkSpendingLimitWindow(policy, action, 7 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

async function checkApprovalPolicy(
  policy: Policy,
  action: PolicyCheckAction
): Promise<PolicyCheckResult | null> {
  switch (policy.policyType) {
    case 'REQUIRE_APPROVAL':
      return checkRequireApproval(policy);
    case 'APPROVAL_THRESHOLD':
      return checkApprovalThreshold(policy, action);
    default:
      return null;
  }
}

// ---- Helpers for approval override ----

/**
 * If a policy has approvalOverride enabled, convert a deny verdict to require_approval.
 */
function applyApprovalOverride(
  config: { approvalOverride?: boolean },
  result: PolicyCheckResult
): PolicyCheckResult {
  if (config.approvalOverride && result.verdict === 'deny') {
    return {
      verdict: 'require_approval',
      triggeredPolicy: result.triggeredPolicy
        ? { ...result.triggeredPolicy, reason: `${result.triggeredPolicy.reason} (requires approval)` }
        : undefined,
    };
  }
  return result;
}

// ---- Address Allowlist ----

function checkAddressAllowlist(
  policy: Policy,
  action: PolicyCheckAction
): PolicyCheckResult | null {
  const config = policy.policyConfig as unknown as AddressAllowlistConfig;
  const allowed = config.addresses.map((a) => a.toLowerCase());

  if (!allowed.includes(action.to.toLowerCase())) {
    return applyApprovalOverride(config, {
      verdict: 'deny',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: `Address ${action.to} is not in the allowlist`,
      },
    });
  }
  return null;
}

// ---- Function Allowlist ----

function checkFunctionAllowlist(
  policy: Policy,
  action: PolicyCheckAction
): PolicyCheckResult | null {
  if (action.type !== 'send_transaction') return null;
  if (!action.functionSelector) return null;

  const config = policy.policyConfig as unknown as FunctionAllowlistConfig;
  const allowed = config.selectors.map((s) => s.toLowerCase());

  if (!allowed.includes(action.functionSelector.toLowerCase())) {
    return applyApprovalOverride(config, {
      verdict: 'deny',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: `Function selector ${action.functionSelector} is not in the allowlist`,
      },
    });
  }
  return null;
}

// ---- Token Allowlist ----

function checkTokenAllowlist(
  policy: Policy,
  action: PolicyCheckAction
): PolicyCheckResult | null {
  if (action.type !== 'transfer') return null;
  if (!action.tokenAddress) return null; // Native ETH transfers are not restricted by token allowlist

  const config = policy.policyConfig as unknown as TokenAllowlistConfig;
  const allowed = config.tokens.map((t) => t.toLowerCase());

  if (!allowed.includes(action.tokenAddress.toLowerCase())) {
    return applyApprovalOverride(config, {
      verdict: 'deny',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: `Token ${action.tokenAddress} is not in the allowlist`,
      },
    });
  }
  return null;
}

// ---- Spending Limit Per Transaction ----

async function checkSpendingLimitPerTx(
  policy: Policy,
  action: PolicyCheckAction
): Promise<PolicyCheckResult | null> {
  const config = policy.policyConfig as unknown as SpendingLimitConfig;
  const usdValue = await getActionUsdValue(action);

  if (usdValue === null) {
    // Can't determine price → deny (or require_approval if override enabled)
    return applyApprovalOverride(config, {
      verdict: 'deny',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: 'Unable to determine USD value of transaction',
      },
    });
  }

  if (usdValue > config.maxUsd) {
    return applyApprovalOverride(config, {
      verdict: 'deny',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: `Transaction value $${usdValue.toFixed(2)} exceeds per-tx limit of $${config.maxUsd.toFixed(2)}`,
      },
    });
  }

  return null;
}

// ---- Spending Limit over Rolling Window (daily/weekly) ----

async function checkSpendingLimitWindow(
  policy: Policy,
  action: PolicyCheckAction,
  windowMs: number
): Promise<PolicyCheckResult | null> {
  const config = policy.policyConfig as unknown as SpendingLimitConfig;
  const usdValue = await getActionUsdValue(action);

  if (usdValue === null) {
    return applyApprovalOverride(config, {
      verdict: 'deny',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: 'Unable to determine USD value of transaction',
      },
    });
  }

  // Sum executed transactions in the rolling window
  const windowStart = new Date(Date.now() - windowMs);
  const recentTxs = await prisma.transactionLog.findMany({
    where: {
      secretId: policy.secretId,
      status: 'EXECUTED',
      createdAt: { gte: windowStart },
    },
    select: { requestData: true },
  });

  // Each transaction's requestData should contain a `usdValue` field set at execution time
  let totalSpent = 0;
  for (const tx of recentTxs) {
    const data = tx.requestData as Record<string, unknown>;
    if (typeof data.usdValue === 'number') {
      totalSpent += data.usdValue;
    }
  }

  if (totalSpent + usdValue > config.maxUsd) {
    const windowLabel = windowMs <= 24 * 60 * 60 * 1000 ? 'daily' : 'weekly';
    return applyApprovalOverride(config, {
      verdict: 'deny',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: `Adding $${usdValue.toFixed(2)} would exceed ${windowLabel} limit of $${config.maxUsd.toFixed(2)} (already spent $${totalSpent.toFixed(2)})`,
      },
    });
  }

  return null;
}

// ---- Require Approval ----

function checkRequireApproval(policy: Policy): PolicyCheckResult | null {
  const config = policy.policyConfig as unknown as RequireApprovalConfig;

  if (config.enabled) {
    return {
      verdict: 'require_approval',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: 'All transactions require human approval',
      },
    };
  }
  return null;
}

// ---- Approval Threshold ----

async function checkApprovalThreshold(
  policy: Policy,
  action: PolicyCheckAction
): Promise<PolicyCheckResult | null> {
  const config = policy.policyConfig as unknown as ApprovalThresholdConfig;
  const usdValue = await getActionUsdValue(action);

  if (usdValue === null) {
    // Can't determine price → require approval for safety
    return {
      verdict: 'require_approval',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: 'Unable to determine USD value; requiring approval as a precaution',
      },
    };
  }

  if (usdValue > config.thresholdUsd) {
    return {
      verdict: 'require_approval',
      triggeredPolicy: {
        id: policy.id,
        type: policy.policyType,
        reason: `Transaction value $${usdValue.toFixed(2)} exceeds approval threshold of $${config.thresholdUsd.toFixed(2)}`,
      },
    };
  }

  return null;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Get the USD value of an action.
 * Returns null if price is unavailable.
 */
async function getActionUsdValue(action: PolicyCheckAction): Promise<number | null> {
  try {
    if (action.tokenAddress && action.tokenAmount !== undefined) {
      return await priceService.tokenToUsd(action.tokenAddress, action.tokenAmount);
    }
    if (action.value !== undefined) {
      return await priceService.ethToUsd(action.value);
    }
    return 0; // No value (e.g. a contract call with 0 ETH)
  } catch {
    return null;
  }
}

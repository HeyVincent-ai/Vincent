import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma and price service before importing checker
vi.mock('../db/client', () => ({
  default: {
    policy: { findMany: vi.fn() },
    transactionLog: { findMany: vi.fn() },
  },
}));

vi.mock('../services/price.service', () => ({
  ethToUsd: vi.fn(),
  tokenToUsd: vi.fn(),
}));

import { checkPolicies, type PolicyCheckAction } from './checker';
import prisma from '../db/client';
import * as priceService from '../services/price.service';

const mockedPrisma = vi.mocked(prisma);
const mockedPrice = vi.mocked(priceService);

function makePolicy(overrides: any) {
  return {
    id: 'pol-1',
    secretId: 'sec-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseTransfer: PolicyCheckAction = {
  type: 'transfer',
  to: '0x1234567890123456789012345678901234567890',
  value: 0.1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.transactionLog.findMany.mockResolvedValue([]);
});

describe('checkPolicies', () => {
  it('allows when no policies exist', async () => {
    mockedPrisma.policy.findMany.mockResolvedValue([]);
    const result = await checkPolicies('sec-1', baseTransfer);
    expect(result.verdict).toBe('allow');
  });

  describe('ADDRESS_ALLOWLIST', () => {
    it('allows when address is in allowlist', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'ADDRESS_ALLOWLIST',
          policyConfig: { addresses: [baseTransfer.to] },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('allow');
    });

    it('denies when address is not in allowlist', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'ADDRESS_ALLOWLIST',
          policyConfig: { addresses: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('deny');
      expect(result.triggeredPolicy?.type).toBe('ADDRESS_ALLOWLIST');
    });

    it('is case-insensitive', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'ADDRESS_ALLOWLIST',
          policyConfig: { addresses: [baseTransfer.to.toUpperCase()] },
        }),
      ]);
      const result = await checkPolicies('sec-1', {
        ...baseTransfer,
        to: baseTransfer.to.toLowerCase(),
      });
      expect(result.verdict).toBe('allow');
    });
  });

  describe('FUNCTION_ALLOWLIST', () => {
    it('allows matching selector for send_transaction', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'FUNCTION_ALLOWLIST',
          policyConfig: { selectors: ['0xa9059cbb'] },
        }),
      ]);
      const result = await checkPolicies('sec-1', {
        type: 'send_transaction',
        to: baseTransfer.to,
        functionSelector: '0xa9059cbb',
      });
      expect(result.verdict).toBe('allow');
    });

    it('denies non-matching selector', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'FUNCTION_ALLOWLIST',
          policyConfig: { selectors: ['0xa9059cbb'] },
        }),
      ]);
      const result = await checkPolicies('sec-1', {
        type: 'send_transaction',
        to: baseTransfer.to,
        functionSelector: '0xdeadbeef',
      });
      expect(result.verdict).toBe('deny');
    });

    it('ignores function allowlist for transfer type', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'FUNCTION_ALLOWLIST',
          policyConfig: { selectors: ['0xa9059cbb'] },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('allow');
    });
  });

  describe('TOKEN_ALLOWLIST', () => {
    it('allows matching token', async () => {
      const tokenAddr = '0xdac17f958d2ee523a2206206994597c13d831ec7';
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'TOKEN_ALLOWLIST',
          policyConfig: { tokens: [tokenAddr] },
        }),
      ]);
      const result = await checkPolicies('sec-1', {
        type: 'transfer',
        to: baseTransfer.to,
        tokenAddress: tokenAddr,
        tokenAmount: 100,
      });
      expect(result.verdict).toBe('allow');
    });

    it('denies non-matching token', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'TOKEN_ALLOWLIST',
          policyConfig: { tokens: ['0xdac17f958d2ee523a2206206994597c13d831ec7'] },
        }),
      ]);
      const result = await checkPolicies('sec-1', {
        type: 'transfer',
        to: baseTransfer.to,
        tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        tokenAmount: 100,
      });
      expect(result.verdict).toBe('deny');
    });

    it('does not restrict native ETH transfers', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'TOKEN_ALLOWLIST',
          policyConfig: { tokens: ['0xdac17f958d2ee523a2206206994597c13d831ec7'] },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('allow');
    });
  });

  describe('SPENDING_LIMIT_PER_TX', () => {
    it('allows when under limit', async () => {
      mockedPrice.ethToUsd.mockResolvedValue(100);
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'SPENDING_LIMIT_PER_TX',
          policyConfig: { maxUsd: 500 },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('allow');
    });

    it('denies when over limit', async () => {
      mockedPrice.ethToUsd.mockResolvedValue(1000);
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'SPENDING_LIMIT_PER_TX',
          policyConfig: { maxUsd: 500 },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('deny');
    });

    it('denies when price unavailable', async () => {
      mockedPrice.ethToUsd.mockRejectedValue(new Error('API down'));
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'SPENDING_LIMIT_PER_TX',
          policyConfig: { maxUsd: 500 },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('deny');
      expect(result.triggeredPolicy?.reason).toContain('Unable to determine USD value');
    });
  });

  describe('SPENDING_LIMIT_DAILY', () => {
    it('denies when cumulative spend exceeds daily limit', async () => {
      mockedPrice.ethToUsd.mockResolvedValue(200);
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'SPENDING_LIMIT_DAILY',
          policyConfig: { maxUsd: 500 },
        }),
      ]);
      mockedPrisma.transactionLog.findMany.mockResolvedValue([
        { requestData: { usdValue: 400 } } as any,
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('deny');
      expect(result.triggeredPolicy?.reason).toContain('daily');
    });

    it('allows when cumulative spend is under limit', async () => {
      mockedPrice.ethToUsd.mockResolvedValue(50);
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'SPENDING_LIMIT_DAILY',
          policyConfig: { maxUsd: 500 },
        }),
      ]);
      mockedPrisma.transactionLog.findMany.mockResolvedValue([
        { requestData: { usdValue: 100 } } as any,
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('allow');
    });
  });

  describe('REQUIRE_APPROVAL', () => {
    it('requires approval when enabled', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'REQUIRE_APPROVAL',
          policyConfig: { enabled: true },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('require_approval');
    });

    it('allows when disabled', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'REQUIRE_APPROVAL',
          policyConfig: { enabled: false },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('allow');
    });
  });

  describe('APPROVAL_THRESHOLD', () => {
    it('requires approval when over threshold', async () => {
      mockedPrice.ethToUsd.mockResolvedValue(600);
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'APPROVAL_THRESHOLD',
          policyConfig: { thresholdUsd: 500 },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('require_approval');
    });

    it('allows when under threshold', async () => {
      mockedPrice.ethToUsd.mockResolvedValue(100);
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'APPROVAL_THRESHOLD',
          policyConfig: { thresholdUsd: 500 },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('allow');
    });

    it('requires approval when price unavailable', async () => {
      mockedPrice.ethToUsd.mockRejectedValue(new Error('fail'));
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          policyType: 'APPROVAL_THRESHOLD',
          policyConfig: { thresholdUsd: 500 },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('require_approval');
    });
  });

  describe('policy ordering', () => {
    it('deny takes precedence over require_approval', async () => {
      mockedPrisma.policy.findMany.mockResolvedValue([
        makePolicy({
          id: 'pol-approval',
          policyType: 'REQUIRE_APPROVAL',
          policyConfig: { enabled: true },
        }),
        makePolicy({
          id: 'pol-addr',
          policyType: 'ADDRESS_ALLOWLIST',
          policyConfig: { addresses: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'] },
        }),
      ]);
      const result = await checkPolicies('sec-1', baseTransfer);
      expect(result.verdict).toBe('deny');
    });
  });
});

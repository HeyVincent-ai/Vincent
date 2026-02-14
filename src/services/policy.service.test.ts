import { describe, it, expect, vi } from 'vitest';

// Mock prisma to prevent initialization error
vi.mock('../db/client', () => ({
  default: {},
}));

import { validatePolicyConfig } from './policy.service';

describe('validatePolicyConfig', () => {
  describe('ADDRESS_ALLOWLIST', () => {
    it('accepts valid addresses', () => {
      const config = validatePolicyConfig('ADDRESS_ALLOWLIST' as any, {
        addresses: ['0x1234567890123456789012345678901234567890'],
      });
      expect(config).toEqual({
        addresses: ['0x1234567890123456789012345678901234567890'],
        approvalOverride: false,
      });
    });

    it('rejects invalid addresses', () => {
      expect(() =>
        validatePolicyConfig('ADDRESS_ALLOWLIST' as any, { addresses: ['not-an-address'] })
      ).toThrow();
    });

    it('rejects empty array', () => {
      expect(() => validatePolicyConfig('ADDRESS_ALLOWLIST' as any, { addresses: [] })).toThrow();
    });
  });

  describe('FUNCTION_ALLOWLIST', () => {
    it('accepts valid 4-byte selectors', () => {
      const config = validatePolicyConfig('FUNCTION_ALLOWLIST' as any, {
        selectors: ['0xa9059cbb'],
      });
      expect(config).toEqual({ selectors: ['0xa9059cbb'], approvalOverride: false });
    });

    it('rejects wrong-length selectors', () => {
      expect(() =>
        validatePolicyConfig('FUNCTION_ALLOWLIST' as any, { selectors: ['0xa9'] })
      ).toThrow();
    });
  });

  describe('TOKEN_ALLOWLIST', () => {
    it('accepts valid token addresses', () => {
      const config = validatePolicyConfig('TOKEN_ALLOWLIST' as any, {
        tokens: ['0xdac17f958d2ee523a2206206994597c13d831ec7'],
      });
      expect(config).toHaveProperty('tokens');
    });
  });

  describe('SPENDING_LIMIT_PER_TX', () => {
    it('accepts positive maxUsd', () => {
      const config = validatePolicyConfig('SPENDING_LIMIT_PER_TX' as any, { maxUsd: 100 });
      expect(config).toEqual({ maxUsd: 100, approvalOverride: false });
    });

    it('rejects zero maxUsd', () => {
      expect(() => validatePolicyConfig('SPENDING_LIMIT_PER_TX' as any, { maxUsd: 0 })).toThrow();
    });

    it('rejects negative maxUsd', () => {
      expect(() => validatePolicyConfig('SPENDING_LIMIT_PER_TX' as any, { maxUsd: -10 })).toThrow();
    });
  });

  describe('REQUIRE_APPROVAL', () => {
    it('accepts boolean enabled', () => {
      expect(validatePolicyConfig('REQUIRE_APPROVAL' as any, { enabled: true })).toEqual({
        enabled: true,
      });
      expect(validatePolicyConfig('REQUIRE_APPROVAL' as any, { enabled: false })).toEqual({
        enabled: false,
      });
    });

    it('rejects non-boolean', () => {
      expect(() => validatePolicyConfig('REQUIRE_APPROVAL' as any, { enabled: 'yes' })).toThrow();
    });
  });

  describe('APPROVAL_THRESHOLD', () => {
    it('accepts positive threshold', () => {
      const config = validatePolicyConfig('APPROVAL_THRESHOLD' as any, { thresholdUsd: 500 });
      expect(config).toEqual({ thresholdUsd: 500 });
    });

    it('rejects zero', () => {
      expect(() =>
        validatePolicyConfig('APPROVAL_THRESHOLD' as any, { thresholdUsd: 0 })
      ).toThrow();
    });
  });
});

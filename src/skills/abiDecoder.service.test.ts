import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock env module before importing the service
vi.mock('../utils/env', () => ({
  env: {
    ETHERSCAN_API_KEY: 'test-api-key',
  },
}));

import {
  decodeTransaction,
  formatDecodedTxForTelegram,
  getFunctionSelector,
  clearAbiCache,
  type DecodedTransaction,
} from './abiDecoder.service';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample ERC20 ABI (just the transfer function)
const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
];

// ERC20 transfer calldata for: transfer(0x1234...5678, 1000000)
// Function selector: 0xa9059cbb (transfer(address,uint256))
const TRANSFER_CALLDATA =
  '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000c350';

describe('abiDecoder.service', () => {
  beforeEach(() => {
    clearAbiCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getFunctionSelector', () => {
    it('extracts 4-byte function selector from calldata', () => {
      expect(getFunctionSelector(TRANSFER_CALLDATA)).toBe('0xa9059cbb');
    });

    it('returns undefined for short data', () => {
      expect(getFunctionSelector('0x1234')).toBeUndefined();
    });

    it('returns undefined for empty data', () => {
      expect(getFunctionSelector('')).toBeUndefined();
      expect(getFunctionSelector('0x')).toBeUndefined();
    });
  });

  describe('formatDecodedTxForTelegram', () => {
    it('formats a decoded transaction with arguments', () => {
      const decoded: DecodedTransaction = {
        functionName: 'transfer',
        args: [
          { name: 'to', type: 'address', value: '0x1234567890123456789012345678901234567890' },
          { name: 'amount', type: 'uint256', value: '1000000' },
        ],
        signature: 'transfer(address,uint256)',
      };

      const formatted = formatDecodedTxForTelegram(decoded);

      expect(formatted).toContain('Function: `transfer`');
      expect(formatted).toContain('Parameters:');
      expect(formatted).toContain('to:');
      expect(formatted).toContain('amount:');
    });

    it('handles empty args', () => {
      const decoded: DecodedTransaction = {
        functionName: 'pause',
        args: [],
      };

      const formatted = formatDecodedTxForTelegram(decoded);

      expect(formatted).toContain('Function: `pause`');
      expect(formatted).not.toContain('Parameters:');
    });

    it('truncates long argument values', () => {
      const decoded: DecodedTransaction = {
        functionName: 'setData',
        args: [
          {
            name: 'data',
            type: 'bytes',
            value: '0x' + 'a'.repeat(200), // Very long hex string
          },
        ],
      };

      const formatted = formatDecodedTxForTelegram(decoded);

      // Should be truncated with "..."
      expect(formatted.length).toBeLessThan(300);
      expect(formatted).toContain('...');
    });
  });

  describe('decodeTransaction', () => {
    it('returns null for empty calldata', async () => {
      const result = await decodeTransaction(
        '0x1234567890123456789012345678901234567890',
        '0x',
        1
      );
      expect(result).toBeNull();
    });

    it('returns null for short calldata', async () => {
      const result = await decodeTransaction(
        '0x1234567890123456789012345678901234567890',
        '0x1234',
        1
      );
      expect(result).toBeNull();
    });

    it('decodes transaction when Sourcify returns ABI', async () => {
      // Mock Sourcify response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: 'metadata.json',
            content: JSON.stringify({
              output: { abi: ERC20_ABI },
            }),
          },
        ],
      });

      const result = await decodeTransaction(
        '0x1234567890123456789012345678901234567890',
        TRANSFER_CALLDATA,
        1
      );

      expect(result).not.toBeNull();
      expect(result?.functionName).toBe('transfer');
      expect(result?.args).toHaveLength(2);
      expect(result?.args[0].name).toBe('to');
      expect(result?.args[1].name).toBe('amount');
    });

    it('returns null when ABI is not available', async () => {
      // Mock Sourcify returning 404
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await decodeTransaction(
        '0x1234567890123456789012345678901234567890',
        TRANSFER_CALLDATA,
        1
      );

      expect(result).toBeNull();
    });

    it('caches ABI after first fetch', async () => {
      // Mock Sourcify response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            name: 'metadata.json',
            content: JSON.stringify({
              output: { abi: ERC20_ABI },
            }),
          },
        ],
      });

      const address = '0xabcdef1234567890123456789012345678901234';

      // First call
      await decodeTransaction(address, TRANSFER_CALLDATA, 1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await decodeTransaction(address, TRANSFER_CALLDATA, 1);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });
});

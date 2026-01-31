import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env before importing
vi.mock('../utils/env', () => ({
  env: { COINGECKO_API_KEY: undefined },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the module to clear the in-memory price cache between tests
  vi.resetModules();
});

function mockCoinGeckoResponse(tokenId: string, price: number) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ [tokenId]: { usd: price } }),
  });
}

async function loadModule() {
  // Re-mock env for the fresh module
  vi.doMock('../utils/env', () => ({
    env: { COINGECKO_API_KEY: undefined },
  }));
  return await import('./price.service');
}

describe('getEthPriceUsd', () => {
  it('fetches ETH price from CoinGecko', async () => {
    const { getEthPriceUsd } = await loadModule();
    mockCoinGeckoResponse('ethereum', 3200);
    const price = await getEthPriceUsd();
    expect(price).toBe(3200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=ethereum'),
      expect.any(Object)
    );
  });

  it('uses cache on subsequent calls', async () => {
    const { getEthPriceUsd } = await loadModule();
    mockCoinGeckoResponse('ethereum', 3200);
    await getEthPriceUsd();
    const price2 = await getEthPriceUsd();
    expect(price2).toBe(3200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('getTokenPriceByAddress', () => {
  it('returns null for unknown tokens', async () => {
    const { getTokenPriceByAddress } = await loadModule();
    const price = await getTokenPriceByAddress('0x0000000000000000000000000000000000000001');
    expect(price).toBeNull();
  });

  it('returns price for known tokens (USDT)', async () => {
    const { getTokenPriceByAddress } = await loadModule();
    mockCoinGeckoResponse('tether', 1.0);
    const price = await getTokenPriceByAddress('0xdac17f958d2ee523a2206206994597c13d831ec7');
    expect(price).toBe(1.0);
  });
});

describe('ethToUsd', () => {
  it('converts ETH amount to USD', async () => {
    const { ethToUsd } = await loadModule();
    mockCoinGeckoResponse('ethereum', 3000);
    const usd = await ethToUsd(0.5);
    expect(usd).toBe(1500);
  });
});

describe('tokenToUsd', () => {
  it('returns null for unknown token', async () => {
    const { tokenToUsd } = await loadModule();
    const usd = await tokenToUsd('0x0000000000000000000000000000000000000001', 100);
    expect(usd).toBeNull();
  });

  it('converts known token amount to USD', async () => {
    const { tokenToUsd } = await loadModule();
    mockCoinGeckoResponse('usd-coin', 1.0);
    const usd = await tokenToUsd('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 100);
    expect(usd).toBe(100);
  });

  it('throws when API returns error', async () => {
    const { tokenToUsd } = await loadModule();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
    await expect(
      tokenToUsd('0xdac17f958d2ee523a2206206994597c13d831ec7', 100)
    ).rejects.toThrow('CoinGecko API error');
  });
});

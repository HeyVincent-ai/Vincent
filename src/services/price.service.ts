import { env } from '../utils/env';

// ============================================================
// Price Cache
// ============================================================

interface PriceCache {
  [tokenId: string]: {
    usd: number;
    fetchedAt: number;
  };
}

const priceCache: PriceCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Well-known token addresses → CoinGecko IDs (lowercase)
const TOKEN_ID_MAP: Record<string, string> = {
  eth: 'ethereum',
  '0x0000000000000000000000000000000000000000': 'ethereum',
  // Common stablecoins and tokens on Ethereum mainnet
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tether',       // USDT
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usd-coin',     // USDC
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'dai',           // DAI
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'wrapped-bitcoin', // WBTC
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'weth',          // WETH
};

// ============================================================
// Public API
// ============================================================

/**
 * Get the USD price of ETH
 */
export async function getEthPriceUsd(): Promise<number> {
  return getTokenPriceUsd('ethereum');
}

/**
 * Get the USD price of a token by its address
 * Returns null if price is unavailable
 */
export async function getTokenPriceByAddress(address: string): Promise<number | null> {
  const tokenId = TOKEN_ID_MAP[address.toLowerCase()];
  if (!tokenId) {
    return null;
  }
  return getTokenPriceUsd(tokenId);
}

/**
 * Convert an ETH amount to USD
 */
export async function ethToUsd(ethAmount: number): Promise<number> {
  const price = await getEthPriceUsd();
  return ethAmount * price;
}

/**
 * Convert a token amount to USD
 * Returns null if price is unavailable
 */
export async function tokenToUsd(tokenAddress: string, amount: number): Promise<number | null> {
  const price = await getTokenPriceByAddress(tokenAddress);
  if (price === null) return null;
  return amount * price;
}

// ============================================================
// Internal
// ============================================================

async function getTokenPriceUsd(tokenId: string): Promise<number> {
  // Check cache
  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.usd;
  }

  // Fetch from CoinGecko
  const price = await fetchPriceFromCoinGecko(tokenId);
  priceCache[tokenId] = { usd: price, fetchedAt: Date.now() };
  return price;
}

async function fetchPriceFromCoinGecko(tokenId: string): Promise<number> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (env.COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, { usd?: number }>;
  const price = data[tokenId]?.usd;

  if (price === undefined) {
    throw new Error(`Price not available for ${tokenId}`);
  }

  return price;
}

import { env } from '../utils/env.js';

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
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tether', // USDT
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usd-coin', // USDC
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'dai', // DAI
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'wrapped-bitcoin', // WBTC
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'weth', // WETH
};

// CoinGecko platform IDs by chain ID (for /simple/token_price/{platform} endpoint)
const CHAIN_ID_TO_COINGECKO_PLATFORM: Record<number, string> = {
  1: 'ethereum',
  137: 'polygon-pos',
  42161: 'arbitrum-one',
  10: 'optimistic-ethereum',
  8453: 'base',
  43114: 'avalanche',
  56: 'binance-smart-chain',
  59144: 'linea',
  534352: 'scroll',
  81457: 'blast',
};

// Known stablecoin symbols that are pegged to $1 — used as a reliable fallback
// when CoinGecko can't resolve a contract address (e.g. testnets, new deployments)
const STABLECOIN_SYMBOLS = new Set([
  'usdc',
  'usdt',
  'dai',
  'busd',
  'tusd',
  'usdbc',
  'usdc.e',
  'usdt.e',
]);

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
 * Get the USD price of a token by its address.
 * Tries in order: static TOKEN_ID_MAP → CoinGecko contract lookup by chain → stablecoin symbol fallback → null.
 */
export async function getTokenPriceByAddress(
  address: string,
  chainId?: number,
  tokenSymbol?: string
): Promise<number | null> {
  const lower = address.toLowerCase();

  // 1. Check static map first (fast path for well-known mainnet tokens)
  const tokenId = TOKEN_ID_MAP[lower];
  if (tokenId) {
    return getTokenPriceUsd(tokenId);
  }

  // 2. Try CoinGecko contract address lookup if we know the chain's platform
  if (chainId) {
    const platform = CHAIN_ID_TO_COINGECKO_PLATFORM[chainId];
    if (platform) {
      const price = await fetchPriceByContract(platform, lower);
      if (price !== null) return price;
    }
  }

  // 3. Stablecoin symbol fallback — if the token symbol is a known stablecoin, assume $1
  if (tokenSymbol && STABLECOIN_SYMBOLS.has(tokenSymbol.toLowerCase())) {
    return 1.0;
  }

  return null;
}

/**
 * Convert an ETH amount to USD
 */
export async function ethToUsd(ethAmount: number): Promise<number> {
  const price = await getEthPriceUsd();
  return ethAmount * price;
}

/**
 * Convert a token amount to USD.
 * Optionally accepts chainId for chain-aware price resolution and tokenSymbol for stablecoin fallback.
 * Returns null if price is unavailable.
 */
export async function tokenToUsd(
  tokenAddress: string,
  amount: number,
  chainId?: number,
  tokenSymbol?: string
): Promise<number | null> {
  const price = await getTokenPriceByAddress(tokenAddress, chainId, tokenSymbol);
  if (price === null) return null;
  return amount * price;
}

// ============================================================
// Internal
// ============================================================

export async function getTokenPriceUsd(tokenId: string): Promise<number> {
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

/**
 * Fetch USD price by contract address on a specific CoinGecko platform.
 * Uses the /simple/token_price/{platform} endpoint.
 * Returns null on failure (unknown token, API error, etc.)
 */
async function fetchPriceByContract(
  platform: string,
  contractAddress: string
): Promise<number | null> {
  const cacheKey = `${platform}:${contractAddress}`;
  const cached = priceCache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.usd;
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${contractAddress}&vs_currencies=usd`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (env.COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, { usd?: number }>;
    const price = data[contractAddress]?.usd;
    if (price === undefined) return null;

    priceCache[cacheKey] = { usd: price, fetchedAt: Date.now() };
    return price;
  } catch {
    return null;
  }
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

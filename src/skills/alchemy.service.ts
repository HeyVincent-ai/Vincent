import { env } from '../utils/env.js';
import { CHAIN_ID_TO_ALCHEMY_NETWORK } from '../config/chains.js';

// Token metadata cache (permanent - token metadata doesn't change)
interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
}
const tokenMetadataCache = new Map<string, TokenMetadata>();

// Map network identifiers to Alchemy RPC base URLs
const NETWORK_TO_RPC: Record<string, string> = {
  'eth-mainnet': 'https://eth-mainnet.g.alchemy.com/v2',
  'eth-sepolia': 'https://eth-sepolia.g.alchemy.com/v2',
  'polygon-mainnet': 'https://polygon-mainnet.g.alchemy.com/v2',
  'polygon-amoy': 'https://polygon-amoy.g.alchemy.com/v2',
  'arb-mainnet': 'https://arb-mainnet.g.alchemy.com/v2',
  'arb-sepolia': 'https://arb-sepolia.g.alchemy.com/v2',
  'opt-mainnet': 'https://opt-mainnet.g.alchemy.com/v2',
  'opt-sepolia': 'https://opt-sepolia.g.alchemy.com/v2',
  'base-mainnet': 'https://base-mainnet.g.alchemy.com/v2',
  'base-sepolia': 'https://base-sepolia.g.alchemy.com/v2',
};

// Use central chain config for chain ID → Alchemy network mapping
const CHAIN_ID_TO_NETWORK: Record<number, string> = CHAIN_ID_TO_ALCHEMY_NETWORK;

export interface TokenBalance {
  network: string;
  address: string;
  tokenAddress: string | null; // null = native token
  tokenBalance: string; // Decimal string (already converted from hex)
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  tokenPrice: number | null;
  value: number | null; // USD value
}

export interface PortfolioResponse {
  tokens: TokenBalance[];
}

export function getNetworkForChainId(chainId: number): string | undefined {
  return CHAIN_ID_TO_NETWORK[chainId];
}

export function getSupportedNetworks(): string[] {
  return Object.values(CHAIN_ID_TO_NETWORK);
}

/**
 * Convert a token balance string (possibly hex) to a decimal string.
 */
function normalizeBalance(raw: string): string {
  if (!raw || raw === '0') return '0';
  if (raw.startsWith('0x')) {
    try {
      return BigInt(raw).toString();
    } catch {
      return '0';
    }
  }
  return raw;
}

/**
 * Format a raw balance (in smallest units) to a human-readable decimal string.
 */
function formatTokenBalance(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0';

  const normalized = normalizeBalance(raw);
  if (normalized === '0') return '0';

  if (decimals === 0) return normalized;

  const padded = normalized.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals) || '0';
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');

  if (!frac) return whole;
  return `${whole}.${frac.slice(0, 8)}`;
}

/**
 * Fetch token metadata using Alchemy's alchemy_getTokenMetadata RPC.
 * Returns proper decimals, logo, symbol, and name.
 * Results are cached permanently since token metadata doesn't change.
 */
async function fetchTokenMetadata(
  tokenAddress: string,
  network: string
): Promise<TokenMetadata | null> {
  const cacheKey = `${network}:${tokenAddress.toLowerCase()}`;
  const cached = tokenMetadataCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = env.ALCHEMY_API_KEY;
  const rpcBase = NETWORK_TO_RPC[network];
  if (!apiKey || !rpcBase) return null;

  try {
    const response = await fetch(`${rpcBase}/${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenMetadata',
        params: [tokenAddress],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.result) return null;

    const metadata: TokenMetadata = {
      symbol: data.result.symbol || '???',
      name: data.result.name || 'Unknown Token',
      decimals: data.result.decimals ?? 18,
      logo: data.result.logo || null,
    };

    tokenMetadataCache.set(cacheKey, metadata);
    return metadata;
  } catch {
    return null;
  }
}

// Raw response type from Alchemy Portfolio API
interface AlchemyRawToken {
  network: string;
  address: string;
  tokenAddress: string | null;
  tokenBalance: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logo?: string;
  tokenPrice?: number | null;
  value?: number | null;
}

/**
 * Fetch all token balances for an address across specified networks using the Alchemy Portfolio API.
 * Normalizes hex balances to decimal and filters zero balances.
 */
export async function getTokenBalances(
  address: string,
  networks?: string[]
): Promise<PortfolioResponse> {
  const apiKey = env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error('ALCHEMY_API_KEY not configured');
  }

  const targetNetworks =
    networks && networks.length > 0 ? networks : Object.values(CHAIN_ID_TO_NETWORK);

  const allRawTokens: AlchemyRawToken[] = [];

  for (let i = 0; i < targetNetworks.length; i += 20) {
    const networkChunk = targetNetworks.slice(i, i + 20);

    const response = await fetch(
      `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/balances/by-address`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addresses: [{ address, networks: networkChunk }],
          includeNativeTokens: true,
          includeErc20Tokens: true,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Alchemy API error (${response.status}): ${text}`);
    }

    const json = await response.json();
    const tokens = json?.data?.tokens ?? [];
    allRawTokens.push(...tokens);
  }

  // Normalize, filter, then enrich ERC20 tokens with metadata
  const prelimTokens = allRawTokens
    .map((raw) => {
      const normalizedBalance = normalizeBalance(raw.tokenBalance);
      if (normalizedBalance === '0') return null;

      const decimals = raw.decimals ?? 18;
      const formatted = formatTokenBalance(normalizedBalance, decimals);
      if (formatted === '0') return null;

      return {
        ...raw,
        normalizedBalance,
        prelimDecimals: decimals,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Fetch metadata for all ERC20 tokens (in parallel) to get correct decimals & logos
  const metadataResults = await Promise.all(
    prelimTokens.map(async (raw) => {
      if (raw.tokenAddress) {
        return fetchTokenMetadata(raw.tokenAddress, raw.network);
      }
      return null; // native tokens don't need metadata lookup
    })
  );

  const tokens: TokenBalance[] = prelimTokens.map((raw, i) => {
    const metadata = metadataResults[i];
    // Use metadata values when available (more reliable than portfolio API)
    const decimals = metadata?.decimals ?? raw.prelimDecimals;
    const symbol = metadata?.symbol || raw.symbol || (raw.tokenAddress ? 'ERC20' : 'ETH');
    const name = metadata?.name || raw.name || (raw.tokenAddress ? 'Unknown Token' : 'Ether');
    const logo = metadata?.logo || raw.logo || null;

    // Recompute value if decimals changed from portfolio API's assumption
    let { value } = raw;
    if (metadata && metadata.decimals !== raw.prelimDecimals && raw.normalizedBalance !== '0') {
      // Decimals changed - recalculate value from price if available
      const tokenPrice = raw.tokenPrice ?? null;
      if (tokenPrice) {
        const humanBalance = parseFloat(formatTokenBalance(raw.normalizedBalance, decimals));
        value = humanBalance * tokenPrice;
      }
    }

    return {
      network: raw.network,
      address: raw.address,
      tokenAddress: raw.tokenAddress,
      tokenBalance: raw.normalizedBalance,
      symbol,
      name,
      decimals,
      logo,
      tokenPrice: raw.tokenPrice ?? null,
      value: value ?? null,
    };
  });

  return { tokens };
}

/**
 * Get portfolio balances for a wallet address, optionally filtered to specific chain IDs.
 */
export async function getPortfolioBalances(
  address: string,
  chainIds?: number[]
): Promise<PortfolioResponse> {
  let networks: string[] | undefined;

  if (chainIds && chainIds.length > 0) {
    networks = chainIds.map((id) => CHAIN_ID_TO_NETWORK[id]).filter(Boolean);

    if (networks.length === 0) {
      throw new Error(`None of the provided chainIds are supported: ${chainIds.join(', ')}`);
    }
  }

  return getTokenBalances(address, networks);
}

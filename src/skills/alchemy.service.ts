import { env } from '../utils/env';

// Alchemy network identifiers
const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  1: 'eth-mainnet',
  11155111: 'eth-sepolia',
  137: 'polygon-mainnet',
  80002: 'polygon-amoy',
  42161: 'arb-mainnet',
  421614: 'arb-sepolia',
  10: 'opt-mainnet',
  11155420: 'opt-sepolia',
  8453: 'base-mainnet',
  84532: 'base-sepolia',
};

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

  const targetNetworks = networks && networks.length > 0
    ? networks
    : Object.values(CHAIN_ID_TO_NETWORK);

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

  // Normalize and filter
  const tokens: TokenBalance[] = allRawTokens
    .map((raw): TokenBalance | null => {
      const decimals = raw.decimals ?? 18;
      const normalizedBalance = normalizeBalance(raw.tokenBalance);

      if (normalizedBalance === '0') return null;

      const formatted = formatTokenBalance(normalizedBalance, decimals);
      if (formatted === '0') return null;

      return {
        network: raw.network,
        address: raw.address,
        tokenAddress: raw.tokenAddress,
        tokenBalance: normalizedBalance,
        symbol: raw.symbol || (raw.tokenAddress ? 'ERC20' : 'ETH'),
        name: raw.name || (raw.tokenAddress ? 'Unknown Token' : 'Ether'),
        decimals,
        logo: raw.logo || null,
        tokenPrice: raw.tokenPrice ?? null,
        value: raw.value ?? null,
      };
    })
    .filter((t): t is TokenBalance => t !== null);

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
    networks = chainIds
      .map((id) => CHAIN_ID_TO_NETWORK[id])
      .filter(Boolean);

    if (networks.length === 0) {
      throw new Error(`None of the provided chainIds are supported: ${chainIds.join(', ')}`);
    }
  }

  return getTokenBalances(address, networks);
}

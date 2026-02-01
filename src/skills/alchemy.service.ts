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
  tokenBalance: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logo?: string;
  tokenPrice?: number | null;
  value?: number | null;
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
 * Fetch all token balances for an address across specified networks using the Alchemy Portfolio API.
 * If no networks specified, fetches across all supported networks.
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

  // Alchemy limits to 3 address entries and 20 networks per entry.
  // We use a single address, so just chunk networks into groups of 20.
  const allTokens: TokenBalance[] = [];

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
    allTokens.push(...tokens);
  }

  return { tokens: allTokens };
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

/**
 * Central chain configuration for all supported EVM networks.
 * Import this wherever you need chain metadata (explorer URLs, testnet flags, Alchemy network names, etc.)
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  /** Block explorer base URL (no trailing slash) */
  explorerUrl: string;
  /** Alchemy Portfolio API network identifier, if supported */
  alchemyNetwork?: string;
  /** Whether this is a testnet (gas is free) */
  isTestnet: boolean;
  /** Whether 0x Swap API supports this chain */
  zeroExSupported: boolean;
  /** Native token symbol */
  nativeToken: string;
}

const chains: ChainConfig[] = [
  // ── Mainnets ──────────────────────────────────────────────
  {
    chainId: 1,
    name: 'Ethereum',
    explorerUrl: 'https://etherscan.io',
    alchemyNetwork: 'eth-mainnet',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },
  {
    chainId: 137,
    name: 'Polygon',
    explorerUrl: 'https://polygonscan.com',
    alchemyNetwork: 'polygon-mainnet',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'POL',
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    explorerUrl: 'https://arbiscan.io',
    alchemyNetwork: 'arb-mainnet',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },
  {
    chainId: 10,
    name: 'Optimism',
    explorerUrl: 'https://optimistic.etherscan.io',
    alchemyNetwork: 'opt-mainnet',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },
  {
    chainId: 8453,
    name: 'Base',
    explorerUrl: 'https://basescan.org',
    alchemyNetwork: 'base-mainnet',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },
  {
    chainId: 43114,
    name: 'Avalanche',
    explorerUrl: 'https://snowtrace.io',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'AVAX',
  },
  {
    chainId: 56,
    name: 'BNB Chain',
    explorerUrl: 'https://bscscan.com',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'BNB',
  },
  {
    chainId: 59144,
    name: 'Linea',
    explorerUrl: 'https://lineascan.build',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },
  {
    chainId: 534352,
    name: 'Scroll',
    explorerUrl: 'https://scrollscan.com',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },
  {
    chainId: 81457,
    name: 'Blast',
    explorerUrl: 'https://blastscan.io',
    isTestnet: false,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },

  // ── Testnets ──────────────────────────────────────────────
  {
    chainId: 11155111,
    name: 'Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    alchemyNetwork: 'eth-sepolia',
    isTestnet: true,
    zeroExSupported: true,
    nativeToken: 'ETH',
  },
  {
    chainId: 5,
    name: 'Goerli',
    explorerUrl: 'https://goerli.etherscan.io',
    isTestnet: true,
    zeroExSupported: false,
    nativeToken: 'ETH',
  },
  {
    chainId: 80002,
    name: 'Polygon Amoy',
    explorerUrl: 'https://amoy.polygonscan.com',
    alchemyNetwork: 'polygon-amoy',
    isTestnet: true,
    zeroExSupported: false,
    nativeToken: 'POL',
  },
  {
    chainId: 80001,
    name: 'Mumbai',
    explorerUrl: 'https://mumbai.polygonscan.com',
    isTestnet: true,
    zeroExSupported: false,
    nativeToken: 'POL',
  },
  {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    explorerUrl: 'https://sepolia.arbiscan.io',
    alchemyNetwork: 'arb-sepolia',
    isTestnet: true,
    zeroExSupported: false,
    nativeToken: 'ETH',
  },
  {
    chainId: 421613,
    name: 'Arbitrum Goerli',
    explorerUrl: 'https://goerli.arbiscan.io',
    isTestnet: true,
    zeroExSupported: false,
    nativeToken: 'ETH',
  },
  {
    chainId: 11155420,
    name: 'Optimism Sepolia',
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    alchemyNetwork: 'opt-sepolia',
    isTestnet: true,
    zeroExSupported: false,
    nativeToken: 'ETH',
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    explorerUrl: 'https://sepolia.basescan.org',
    alchemyNetwork: 'base-sepolia',
    isTestnet: true,
    zeroExSupported: false,
    nativeToken: 'ETH',
  },
];

// ── Lookup maps ──────────────────────────────────────────────

const byChainId = new Map<number, ChainConfig>();
for (const c of chains) {
  byChainId.set(c.chainId, c);
}

/** Get chain config by chain ID. Returns undefined for unknown chains. */
export function getChain(chainId: number): ChainConfig | undefined {
  return byChainId.get(chainId);
}

/** Get block explorer transaction URL, or undefined if chain is unknown. */
export function getExplorerTxUrl(chainId: number, txHash: string): string | undefined {
  const chain = byChainId.get(chainId);
  if (!chain) return undefined;
  return `${chain.explorerUrl}/tx/${txHash}`;
}

/** Get block explorer address URL, or undefined if chain is unknown. */
export function getExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = byChainId.get(chainId);
  if (!chain) return undefined;
  return `${chain.explorerUrl}/address/${address}`;
}

/** All chain IDs that are testnets. */
export const TESTNET_CHAIN_IDS: number[] = chains.filter(c => c.isTestnet).map(c => c.chainId);

/** Map from chain ID → Alchemy network name (only chains Alchemy supports). */
export const CHAIN_ID_TO_ALCHEMY_NETWORK: Record<number, string> = Object.fromEntries(
  chains.filter(c => c.alchemyNetwork).map(c => [c.chainId, c.alchemyNetwork!])
);

/** All chain configs. */
export const ALL_CHAINS = chains;

export default chains;

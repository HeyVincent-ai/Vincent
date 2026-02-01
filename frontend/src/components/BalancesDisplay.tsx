import { useEffect, useState, useCallback } from 'react';
import { getSecretBalances } from '../api';

interface TokenBalance {
  network: string;
  address: string;
  tokenAddress: string | null;
  tokenBalance: string;
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  tokenPrice: number | null;
  value: number | null;
}

interface Props {
  secretId: string;
}

const NETWORK_LABELS: Record<string, string> = {
  'eth-mainnet': 'Ethereum',
  'eth-sepolia': 'Sepolia',
  'polygon-mainnet': 'Polygon',
  'polygon-amoy': 'Polygon Amoy',
  'arb-mainnet': 'Arbitrum',
  'arb-sepolia': 'Arbitrum Sepolia',
  'opt-mainnet': 'Optimism',
  'opt-sepolia': 'Optimism Sepolia',
  'base-mainnet': 'Base',
  'base-sepolia': 'Base Sepolia',
};

const NETWORK_ICONS: Record<string, string> = {
  'eth-mainnet': '⟠',
  'eth-sepolia': '⟠',
  'polygon-mainnet': '⬡',
  'polygon-amoy': '⬡',
  'arb-mainnet': '◆',
  'arb-sepolia': '◆',
  'opt-mainnet': '●',
  'opt-sepolia': '●',
  'base-mainnet': '◉',
  'base-sepolia': '◉',
};

function formatBalance(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0';

  // raw is a decimal string of the smallest units (already normalized from hex on backend)
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals) || '0';
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');

  let result: string;
  if (!frac) {
    result = whole;
  } else {
    result = `${whole}.${frac}`;
  }

  const num = parseFloat(result);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 10000) return num.toFixed(2);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(value: number | null): string {
  if (value == null || value === 0) return '';
  if (value < 0.01) return '<$0.01';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TokenIcon({ token }: { token: TokenBalance }) {
  const [imgError, setImgError] = useState(false);

  if (token.logo && !imgError) {
    return (
      <img
        src={token.logo}
        alt={token.symbol}
        className="w-8 h-8 rounded-full bg-gray-100"
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: colored circle with first letter
  const letter = (token.symbol || '?').charAt(0).toUpperCase();
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
  ];
  const colorIdx = token.symbol.charCodeAt(0) % colors.length;

  return (
    <div className={`w-8 h-8 rounded-full ${colors[colorIdx]} flex items-center justify-center`}>
      <span className="text-white text-xs font-bold">{letter}</span>
    </div>
  );
}

export default function BalancesDisplay({ secretId }: Props) {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSecretBalances(secretId);
      const data = res.data.data;
      setTokens(data.tokens || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load balances';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [secretId]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Compute total USD value
  const totalValue = tokens.reduce((sum, t) => sum + (t.value ?? 0), 0);

  // Group tokens by network
  const byNetwork: Record<string, TokenBalance[]> = {};
  for (const token of tokens) {
    const key = token.network;
    if (!byNetwork[key]) byNetwork[key] = [];
    byNetwork[key].push(token);
  }

  // Sort networks: mainnets first, then testnets
  const sortedNetworks = Object.keys(byNetwork).sort((a, b) => {
    const aTest = a.includes('sepolia') || a.includes('amoy');
    const bTest = b.includes('sepolia') || b.includes('amoy');
    if (aTest !== bTest) return aTest ? 1 : -1;
    return a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading balances...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center justify-between">
        <span>{error}</span>
        <button onClick={fetchBalances} className="text-red-600 hover:text-red-800 font-medium underline ml-2">
          Retry
        </button>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">No token balances found</p>
        <button onClick={fetchBalances} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Token Balances</h3>
          {totalValue > 0 && (
            <p className="text-lg font-bold text-gray-900">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
        <button
          onClick={fetchBalances}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Token list grouped by network */}
      <div className="space-y-4">
        {sortedNetworks.map((network) => {
          const networkTokens = byNetwork[network];
          const networkValue = networkTokens.reduce((sum, t) => sum + (t.value ?? 0), 0);
          const isTestnet = network.includes('sepolia') || network.includes('amoy');

          return (
            <div key={network}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{NETWORK_ICONS[network] || '○'}</span>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {NETWORK_LABELS[network] || network}
                  </span>
                  {isTestnet && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                      testnet
                    </span>
                  )}
                </div>
                {networkValue > 0 && (
                  <span className="text-xs text-gray-400">
                    {formatUsd(networkValue)}
                  </span>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {networkTokens.map((token, i) => (
                  <div
                    key={`${token.tokenAddress ?? 'native'}-${i}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <TokenIcon token={token} />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{token.symbol}</div>
                        <div className="text-xs text-gray-400">{token.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900 font-mono">
                        {formatBalance(token.tokenBalance, token.decimals)}
                      </div>
                      {token.value != null && token.value > 0 && (
                        <div className="text-xs text-gray-400">{formatUsd(token.value)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

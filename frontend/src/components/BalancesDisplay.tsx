import { useEffect, useState, useCallback } from 'react';
import { getSecretBalances } from '../api';

interface TokenBalance {
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

function formatBalance(raw: string, decimals?: number): string {
  if (!raw || raw === '0') return '0';
  const dec = decimals ?? 18;
  if (dec === 0) return raw;

  const padded = raw.padStart(dec + 1, '0');
  const whole = padded.slice(0, padded.length - dec) || '0';
  const frac = padded.slice(padded.length - dec).replace(/0+$/, '');

  if (!frac) return whole;
  return `${whole}.${frac.slice(0, 6)}`;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      // Filter out zero balances
      const nonZero = (data.tokens || []).filter(
        (t: TokenBalance) => t.tokenBalance && t.tokenBalance !== '0'
      );
      setTokens(nonZero);
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

  // Group tokens by network
  const byNetwork: Record<string, TokenBalance[]> = {};
  for (const token of tokens) {
    const key = token.network;
    if (!byNetwork[key]) byNetwork[key] = [];
    byNetwork[key].push(token);
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading balances...</p>;

  if (error) {
    return (
      <div className="text-sm text-red-600">
        {error}
        <button onClick={fetchBalances} className="ml-2 text-blue-600 hover:text-blue-800 underline">
          Retry
        </button>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No token balances found.
        <button onClick={fetchBalances} className="ml-2 text-blue-600 hover:text-blue-800 underline">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Token Balances</h3>
        <button
          onClick={fetchBalances}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {Object.entries(byNetwork).map(([network, networkTokens]) => (
        <div key={network} className="mb-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
            {NETWORK_LABELS[network] || network}
          </h4>
          <div className="bg-white border rounded divide-y">
            {networkTokens.map((token, i) => (
              <div key={`${token.tokenAddress}-${i}`} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {token.logo && (
                    <img src={token.logo} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <div>
                    <span className="text-sm font-medium">
                      {token.symbol || (token.tokenAddress ? 'ERC20' : 'Native')}
                    </span>
                    {token.name && (
                      <span className="text-xs text-gray-400 ml-1">{token.name}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">
                    {formatBalance(token.tokenBalance, token.decimals)}
                  </div>
                  {token.value != null && token.value > 0 && (
                    <div className="text-xs text-gray-500">{formatUsd(token.value)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

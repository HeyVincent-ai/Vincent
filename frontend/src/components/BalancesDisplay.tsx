import { useEffect, useState, useCallback } from 'react';
import { getSecretBalances, previewSwap, executeSwap } from '../api';

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

interface SwapPreview {
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  route: { source: string; proportion: string }[];
  liquidityAvailable: boolean;
}

interface SwapResult {
  txHash: string | null;
  status: 'executed' | 'pending_approval' | 'denied';
  buyAmount: string;
  reason?: string;
  explorerUrl?: string;
}

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

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

const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  'eth-mainnet': 1, 'eth-sepolia': 11155111,
  'polygon-mainnet': 137, 'polygon-amoy': 80002,
  'arb-mainnet': 42161, 'arb-sepolia': 421614,
  'opt-mainnet': 10, 'opt-sepolia': 11155420,
  'base-mainnet': 8453, 'base-sepolia': 84532,
};

const COMMON_TOKENS: Record<number, { address: string; symbol: string }[]> = {
  1: [
    { address: NATIVE_TOKEN, symbol: 'ETH' },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI' },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
  ],
  11155111: [{ address: NATIVE_TOKEN, symbol: 'ETH' }],
  137: [
    { address: NATIVE_TOKEN, symbol: 'MATIC' },
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC' },
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT' },
  ],
  42161: [
    { address: NATIVE_TOKEN, symbol: 'ETH' },
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC' },
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT' },
  ],
  10: [
    { address: NATIVE_TOKEN, symbol: 'ETH' },
    { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC' },
    { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT' },
  ],
  8453: [
    { address: NATIVE_TOKEN, symbol: 'ETH' },
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
  ],
};

function formatBalance(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0';
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

function formatTokenAmount(weiStr: string, decimals: number = 18): string {
  if (!weiStr || weiStr === '0') return '0';
  const padded = weiStr.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals) || '0';
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');
  if (!frac) return whole;
  return `${whole}.${frac.slice(0, 6)}`;
}

function tokenSwapAddress(token: TokenBalance): string {
  return token.tokenAddress ?? NATIVE_TOKEN;
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

// ─── Inline Swap Form ────────────────────────────────────────────────

interface SwapFormProps {
  token: TokenBalance;
  secretId: string;
  onDone: () => void;
}

function InlineSwapForm({ token, secretId, onDone }: SwapFormProps) {
  const chainId = NETWORK_TO_CHAIN_ID[token.network];
  const sellAddress = tokenSwapAddress(token);

  const availableTokens = (COMMON_TOKENS[chainId] || []).filter(
    (t) => t.address.toLowerCase() !== sellAddress.toLowerCase()
  );

  const [buyToken, setBuyToken] = useState(availableTokens[0]?.address ?? '');
  const [customBuyToken, setCustomBuyToken] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100);
  const [preview, setPreview] = useState<SwapPreview | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveBuyToken = buyToken === 'custom' ? customBuyToken : buyToken;
  const buySymbol = availableTokens.find((t) => t.address === buyToken)?.symbol || '';
  const canPreview = effectiveBuyToken && sellAmount && parseFloat(sellAmount) > 0;

  const handlePreview = async () => {
    if (!canPreview) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await previewSwap(secretId, {
        sellToken: sellAddress,
        buyToken: effectiveBuyToken,
        sellAmount,
        chainId,
        slippageBps,
      });
      setPreview(res.data.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to get quote';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!canPreview) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await executeSwap(secretId, {
        sellToken: sellAddress,
        buyToken: effectiveBuyToken,
        sellAmount,
        chainId,
        slippageBps,
      });
      setResult(res.data.data);
      setPreview(null);
      if (res.data.data.status === 'executed') {
        setTimeout(onDone, 1500);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Swap failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-500">Swap {token.symbol} →</span>
        <select
          value={buyToken}
          onChange={(e) => { setBuyToken(e.target.value); setPreview(null); setResult(null); }}
          className="border border-gray-300 rounded px-2 py-1 text-xs"
        >
          {availableTokens.length === 0 && <option value="">No tokens available</option>}
          {availableTokens.map((t) => (
            <option key={t.address} value={t.address}>{t.symbol}</option>
          ))}
          <option value="custom">Custom...</option>
        </select>
        {buyToken === 'custom' && (
          <input
            type="text"
            placeholder="0x..."
            value={customBuyToken}
            onChange={(e) => { setCustomBuyToken(e.target.value); setPreview(null); }}
            className="border border-gray-300 rounded px-2 py-1 text-xs font-mono w-36"
          />
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder={`Amount (${token.symbol})`}
          value={sellAmount}
          onChange={(e) => { setSellAmount(e.target.value); setPreview(null); setResult(null); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1"
        />
        <div className="flex gap-1">
          {[50, 100, 200].map((bps) => (
            <button
              key={bps}
              onClick={() => setSlippageBps(bps)}
              className={`px-2 py-1 text-[10px] rounded border ${slippageBps === bps ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
        </div>
        <button
          onClick={handlePreview}
          disabled={!canPreview || loading}
          className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-40"
        >
          {loading && !preview ? '...' : 'Quote'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600 mb-2">{error}</div>
      )}

      {preview && (
        <div className="bg-white border border-gray-200 rounded p-3 mb-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">You receive (est.)</span>
            <span className="font-medium">{formatTokenAmount(preview.buyAmount)} {buySymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Min. received</span>
            <span className="text-gray-600">{formatTokenAmount(preview.minBuyAmount)} {buySymbol}</span>
          </div>
          {!preview.liquidityAvailable && (
            <p className="text-yellow-700 bg-yellow-50 rounded px-2 py-1">Insufficient liquidity</p>
          )}
          <button
            onClick={handleExecute}
            disabled={loading || !preview.liquidityAvailable}
            className="w-full mt-2 bg-blue-600 text-white font-medium py-1.5 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Executing...' : 'Execute Swap'}
          </button>
        </div>
      )}

      {result && (
        <div className={`border rounded p-3 text-xs space-y-1 ${result.status === 'executed' ? 'bg-green-50 border-green-200' : result.status === 'denied' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex justify-between">
            <span className="text-gray-600">Status</span>
            <span className={`font-medium ${result.status === 'executed' ? 'text-green-700' : result.status === 'denied' ? 'text-red-700' : 'text-yellow-700'}`}>
              {result.status === 'executed' ? 'Executed' : result.status === 'pending_approval' ? 'Pending Approval' : 'Denied'}
            </span>
          </div>
          {result.reason && <div className="text-red-600">{result.reason}</div>}
          {result.txHash && (
            <div className="flex justify-between">
              <span className="text-gray-600">Tx</span>
              {result.explorerUrl ? (
                <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">
                  {result.txHash.slice(0, 10)}...{result.txHash.slice(-6)}
                </a>
              ) : (
                <span className="font-mono text-gray-600">{result.txHash.slice(0, 10)}...{result.txHash.slice(-6)}</span>
              )}
            </div>
          )}
          {result.status === 'executed' && (
            <div className="flex justify-between">
              <span className="text-gray-600">Received</span>
              <span className="font-medium">{formatTokenAmount(result.buyAmount)} {buySymbol}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function BalancesDisplay({ secretId }: Props) {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swapKey, setSwapKey] = useState<string | null>(null); // "network|tokenAddress" of open swap form

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

  const totalValue = tokens.reduce((sum, t) => sum + (t.value ?? 0), 0);

  const byNetwork: Record<string, TokenBalance[]> = {};
  for (const token of tokens) {
    const key = token.network;
    if (!byNetwork[key]) byNetwork[key] = [];
    byNetwork[key].push(token);
  }

  const sortedNetworks = Object.keys(byNetwork).sort((a, b) => {
    const aTest = a.includes('sepolia') || a.includes('amoy');
    const bTest = b.includes('sepolia') || b.includes('amoy');
    if (aTest !== bTest) return aTest ? 1 : -1;
    return a.localeCompare(b);
  });

  function tokenKey(token: TokenBalance): string {
    return `${token.network}|${token.tokenAddress ?? 'native'}`;
  }

  function handleSwapDone() {
    setSwapKey(null);
    fetchBalances();
  }

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
          const chainId = NETWORK_TO_CHAIN_ID[network];

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
                {networkTokens.map((token, i) => {
                  const tk = tokenKey(token);
                  const isSwapOpen = swapKey === tk;

                  return (
                    <div key={`${token.tokenAddress ?? 'native'}-${i}`}>
                      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <TokenIcon token={token} />
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{token.symbol}</div>
                            <div className="text-xs text-gray-400">{token.name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900 font-mono">
                              {formatBalance(token.tokenBalance, token.decimals)}
                            </div>
                            {token.value != null && token.value > 0 && (
                              <div className="text-xs text-gray-400">{formatUsd(token.value)}</div>
                            )}
                          </div>
                          {chainId && (
                            <button
                              onClick={() => setSwapKey(isSwapOpen ? null : tk)}
                              className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${isSwapOpen ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400'}`}
                            >
                              Swap
                            </button>
                          )}
                        </div>
                      </div>
                      {isSwapOpen && (
                        <InlineSwapForm
                          token={token}
                          secretId={secretId}
                          onDone={handleSwapDone}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

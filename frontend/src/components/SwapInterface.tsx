import { useState } from 'react';
import { previewSwap, executeSwap } from '../api';

interface Props {
  secretId: string;
}

interface SwapPreview {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  route: { source: string; proportion: string }[];
  gasEstimate: string | null;
  fees: { integratorFee: string | null; zeroExFee: string | null };
  liquidityAvailable: boolean;
  smartAccountAddress: string;
}

interface SwapResult {
  txHash: string | null;
  status: 'executed' | 'pending_approval' | 'denied';
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  smartAccountAddress: string;
  reason?: string;
  transactionLogId: string;
  explorerUrl?: string;
}

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const CHAINS = [
  { id: 1, name: 'Ethereum' },
  { id: 11155111, name: 'Sepolia' },
  { id: 137, name: 'Polygon' },
  { id: 42161, name: 'Arbitrum' },
  { id: 10, name: 'Optimism' },
  { id: 8453, name: 'Base' },
];

const COMMON_TOKENS: Record<number, { address: string; symbol: string }[]> = {
  1: [
    { address: NATIVE_TOKEN, symbol: 'ETH' },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI' },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
  ],
  11155111: [
    { address: NATIVE_TOKEN, symbol: 'ETH' },
  ],
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

function formatTokenAmount(weiStr: string, decimals: number = 18): string {
  if (!weiStr || weiStr === '0') return '0';
  const padded = weiStr.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals) || '0';
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');
  if (!frac) return whole;
  const truncated = frac.slice(0, 6);
  return `${whole}.${truncated}`;
}

export default function SwapInterface({ secretId }: Props) {
  const [chainId, setChainId] = useState(1);
  const [sellToken, setSellToken] = useState(NATIVE_TOKEN);
  const [buyToken, setBuyToken] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [customSellToken, setCustomSellToken] = useState('');
  const [customBuyToken, setCustomBuyToken] = useState('');
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [preview, setPreview] = useState<SwapPreview | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokens = COMMON_TOKENS[chainId] || [{ address: NATIVE_TOKEN, symbol: 'ETH' }];

  const effectiveSellToken = sellToken === 'custom' ? customSellToken : sellToken;
  const effectiveBuyToken = buyToken === 'custom' ? customBuyToken : buyToken;

  const canPreview = effectiveSellToken && effectiveBuyToken && sellAmount && parseFloat(sellAmount) > 0 && effectiveSellToken !== effectiveBuyToken;

  const handlePreview = async () => {
    if (!canPreview) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await previewSwap(secretId, {
        sellToken: effectiveSellToken,
        buyToken: effectiveBuyToken,
        sellAmount,
        chainId,
        slippageBps,
      });
      setPreview(res.data.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to get swap preview';
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
        sellToken: effectiveSellToken,
        buyToken: effectiveBuyToken,
        sellAmount,
        chainId,
        slippageBps,
      });
      setResult(res.data.data);
      setPreview(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Swap failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChainChange = (newChainId: number) => {
    setChainId(newChainId);
    const newTokens = COMMON_TOKENS[newChainId] || [];
    setSellToken(newTokens[0]?.address || NATIVE_TOKEN);
    setBuyToken('');
    setPreview(null);
    setResult(null);
  };

  const sellSymbol = tokens.find(t => t.address === sellToken)?.symbol || (sellToken === 'custom' ? 'Custom' : '');
  const buySymbol = tokens.find(t => t.address === buyToken)?.symbol || (buyToken === 'custom' ? 'Custom' : '');

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Swap Tokens</h3>

      {/* Chain selector */}
      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Network</label>
        <select
          value={chainId}
          onChange={(e) => handleChainChange(Number(e.target.value))}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Sell token */}
      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Sell</label>
        <div className="flex gap-2">
          <select
            value={sellToken}
            onChange={(e) => { setSellToken(e.target.value); setPreview(null); }}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-40"
          >
            {tokens.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {sellToken === 'custom' && (
            <input
              type="text"
              placeholder="0x... token address"
              value={customSellToken}
              onChange={(e) => { setCustomSellToken(e.target.value); setPreview(null); }}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
            />
          )}
          <input
            type="text"
            placeholder="Amount"
            value={sellAmount}
            onChange={(e) => { setSellAmount(e.target.value); setPreview(null); }}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Swap direction indicator */}
      <div className="flex justify-center mb-2">
        <span className="text-gray-400 text-lg">↓</span>
      </div>

      {/* Buy token */}
      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Buy</label>
        <div className="flex gap-2">
          <select
            value={buyToken}
            onChange={(e) => { setBuyToken(e.target.value); setPreview(null); }}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-40"
          >
            <option value="">Select token</option>
            {tokens.filter(t => t.address !== effectiveSellToken).map((t) => (
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {buyToken === 'custom' && (
            <input
              type="text"
              placeholder="0x... token address"
              value={customBuyToken}
              onChange={(e) => { setCustomBuyToken(e.target.value); setPreview(null); }}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
            />
          )}
        </div>
      </div>

      {/* Slippage */}
      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Slippage tolerance</label>
        <div className="flex gap-2">
          {[50, 100, 200, 500].map((bps) => (
            <button
              key={bps}
              onClick={() => setSlippageBps(bps)}
              className={`px-3 py-1 text-xs rounded border ${slippageBps === bps ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </div>

      {/* Preview button */}
      <button
        onClick={handlePreview}
        disabled={!canPreview || loading}
        className="w-full bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
      >
        {loading && !preview ? 'Getting quote...' : 'Preview Swap'}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Preview result */}
      {preview && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">You sell</span>
              <span className="font-medium">{formatTokenAmount(preview.sellAmount)} {sellSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">You receive (est.)</span>
              <span className="font-medium">{formatTokenAmount(preview.buyAmount)} {buySymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Min. received</span>
              <span className="text-xs text-gray-600">{formatTokenAmount(preview.minBuyAmount)} {buySymbol}</span>
            </div>
            {preview.route.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Route</span>
                <span className="text-xs text-gray-600">
                  {preview.route.map((r) => `${r.source} (${r.proportion})`).join(' → ')}
                </span>
              </div>
            )}
            {!preview.liquidityAvailable && (
              <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">Insufficient liquidity for this swap</p>
            )}
          </div>

          <button
            onClick={handleExecute}
            disabled={loading || !preview.liquidityAvailable}
            className="w-full mt-3 bg-blue-600 text-white font-medium py-2 px-4 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Executing...' : 'Execute Swap'}
          </button>
        </div>
      )}

      {/* Execution result */}
      {result && (
        <div className={`border rounded-lg p-4 ${result.status === 'executed' ? 'bg-green-50 border-green-200' : result.status === 'denied' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Status</span>
              <span className={`font-medium ${result.status === 'executed' ? 'text-green-700' : result.status === 'denied' ? 'text-red-700' : 'text-yellow-700'}`}>
                {result.status === 'executed' ? 'Executed' : result.status === 'pending_approval' ? 'Pending Approval' : 'Denied'}
              </span>
            </div>
            {result.reason && (
              <div className="text-xs text-red-600">{result.reason}</div>
            )}
            {result.txHash && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tx Hash</span>
                {result.explorerUrl ? (
                  <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-blue-600 hover:underline">
                    {result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}
                  </a>
                ) : (
                  <span className="text-xs font-mono text-gray-600">{result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}</span>
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
        </div>
      )}
    </div>
  );
}

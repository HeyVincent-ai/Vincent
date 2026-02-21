import { useEffect, useState } from 'react';
import { CloseIcon } from './icons';
import { polymarketWithdraw } from '../api';

interface PolymarketWithdrawModalProps {
  secretId: string;
  balance: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PolymarketWithdrawModal({
  secretId,
  balance,
  onClose,
  onSuccess,
}: PolymarketWithdrawModalProps) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(to);
  const numAmount = parseFloat(amount);
  const isValidAmount = !isNaN(numAmount) && numAmount > 0 && numAmount <= balance;
  const canSubmit = isValidAddress && isValidAmount && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const res = await polymarketWithdraw(secretId, to, amount);
      const data = res.data.data;
      if (data.status === 'denied') {
        setError(data.reason || 'Transaction denied by policy');
      } else if (data.status === 'pending_approval') {
        setInfo('Transaction requires approval. Check your notifications.');
      } else {
        setTxHash(data.transactionHash);
        onSuccess();
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { error?: { message?: string } } } }).response?.data
              ?.error?.message ?? 'Transfer failed')
          : 'Transfer failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Send USDC"
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Send USDC</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {txHash ? (
          <div>
            <p className="text-sm text-green-400 mb-3">Transfer successful!</p>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Transaction</p>
              <a
                href={`https://polygonscan.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:text-primary/80 font-mono break-all"
              >
                {txHash}
              </a>
            </div>
            <button
              onClick={onClose}
              className="w-full mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={loading}
                />
                {to && !isValidAddress && (
                  <p className="text-xs text-destructive mt-1">Invalid Ethereum address</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">Amount (USDC)</label>
                  <button
                    type="button"
                    onClick={() => setAmount(balance.toString())}
                    className="text-xs text-primary hover:text-primary/80"
                    disabled={loading}
                  >
                    Max: {balance.toFixed(2)}
                  </button>
                </div>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={loading}
                />
                {amount && !isValidAmount && (
                  <p className="text-xs text-destructive mt-1">
                    {numAmount > balance ? 'Exceeds balance' : 'Enter a valid amount'}
                  </p>
                )}
              </div>

              {info && (
                <p className="text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2">
                  {info}
                </p>
              )}

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending...' : 'Send USDC'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

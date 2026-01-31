import { useEffect, useState } from 'react';
import { getSubscription, subscribe, cancelSubscription, getUsage, getUsageHistory, getInvoices } from '../api';

interface Subscription {
  id: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
}

interface UsageData {
  totalCostUsd: number;
  transactionCount: number;
  recentTransactions?: { transactionHash: string; costUsd: number; chainId: number; createdAt: string }[];
}

interface HistoryEntry {
  month: string;
  totalCostUsd: number;
  billed: boolean;
}

export default function Billing() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [hasSub, setHasSub] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [invoices, setInvoices] = useState<{ month: string; totalCostUsd: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [subRes, usageRes, histRes, invRes] = await Promise.all([
        getSubscription(),
        getUsage(),
        getUsageHistory(),
        getInvoices(),
      ]);
      setHasSub(subRes.data.data.hasSubscription);
      setSub(subRes.data.data.subscription);
      setUsage(usageRes.data.data);
      setHistory(histRes.data.data);
      setInvoices(invRes.data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubscribe = async () => {
    try {
      const res = await subscribe(
        `${window.location.origin}/billing?success=1`,
        `${window.location.origin}/billing?canceled=1`
      );
      window.location.href = res.data.data.checkoutUrl;
    } catch {
      alert('Failed to start checkout');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription? You will lose mainnet access at the end of the billing period.')) return;
    try {
      await cancelSubscription();
      load();
    } catch {
      alert('Failed to cancel subscription');
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {/* Subscription */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Subscription</h2>
        {hasSub && sub ? (
          <div>
            <p className="text-sm">
              Status: <span className={`font-medium ${sub.status === 'ACTIVE' ? 'text-green-600' : 'text-yellow-600'}`}>{sub.status}</span>
            </p>
            {sub.currentPeriodEnd && (
              <p className="text-sm text-gray-500">Current period ends: {new Date(sub.currentPeriodEnd).toLocaleDateString()}</p>
            )}
            {sub.canceledAt && (
              <p className="text-sm text-red-500">Cancels at period end</p>
            )}
            {!sub.canceledAt && (
              <button onClick={handleCancel} className="mt-3 text-sm text-red-600 hover:text-red-800 border border-red-200 px-3 py-1 rounded">
                Cancel Subscription
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-3">No active subscription. Subscribe for mainnet access ($10/month).</p>
            <button onClick={handleSubscribe} className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              Subscribe - $10/month
            </button>
          </div>
        )}
      </div>

      {/* Current Usage */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Current Month Usage</h2>
        {usage ? (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Gas Cost</p>
                <p className="text-xl font-bold">${usage.totalCostUsd?.toFixed(4) || '0.0000'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Transactions</p>
                <p className="text-xl font-bold">{usage.transactionCount || 0}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No usage data.</p>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Usage History</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b"><th className="pb-2">Month</th><th className="pb-2">Cost</th><th className="pb-2">Billed</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.month} className="border-b last:border-0">
                  <td className="py-2">{h.month}</td>
                  <td className="py-2">${h.totalCostUsd.toFixed(4)}</td>
                  <td className="py-2">{h.billed ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-3">Invoices</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b"><th className="pb-2">Month</th><th className="pb-2">Amount</th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.month} className="border-b last:border-0">
                  <td className="py-2">{inv.month}</td>
                  <td className="py-2">${inv.totalCostUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

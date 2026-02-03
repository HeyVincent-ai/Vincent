import { useEffect, useState } from 'react';
import { getSubscription, subscribe, cancelSubscription } from '../api';

interface Subscription {
  id: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
}

export default function Billing() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [hasSub, setHasSub] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const subRes = await getSubscription();
      setHasSub(subRes.data.data.hasSubscription);
      setSub(subRes.data.data.subscription);
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
            <p className="text-sm text-green-600 mt-2">Unlimited mainnet transactions included</p>
            {!sub.canceledAt && (
              <button onClick={handleCancel} className="mt-3 text-sm text-red-600 hover:text-red-800 border border-red-200 px-3 py-1 rounded">
                Cancel Subscription
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-3">No active subscription. Subscribe for mainnet access ($10/month).</p>
            <ul className="text-sm text-gray-600 mb-4 list-disc list-inside">
              <li>Unlimited mainnet transactions</li>
              <li>Gas fees included</li>
              <li>All supported chains</li>
            </ul>
            <button onClick={handleSubscribe} className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              Subscribe - $10/month
            </button>
          </div>
        )}
      </div>

      {/* Plan Details */}
      <div className="bg-gray-50 rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-3">Plan Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Free Tier</p>
            <p className="font-medium">Unlimited testnet transactions</p>
          </div>
          <div>
            <p className="text-gray-500">Pro ($10/month)</p>
            <p className="font-medium">Unlimited mainnet transactions</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          New wallets include a 3-day free trial for mainnet transactions.
        </p>
      </div>
    </div>
  );
}

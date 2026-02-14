import { useEffect, useState } from 'react';
import { getAdminReferrals } from '../api';

interface ReferralStats {
  total: number;
  pending: number;
  rewardPending: number;
  fulfilled: number;
  totalCreditedUsd: number;
}

interface Referral {
  id: string;
  status: 'PENDING' | 'REWARD_PENDING' | 'FULFILLED';
  rewardAmountUsd: number;
  referrer: { id: string; email: string; createdAt: string };
  referredUser: { id: string; email: string; createdAt: string };
  deploymentId: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

export default function AdminReferrals() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminReferrals()
      .then((res) => {
        setStats(res.data.data.stats);
        setReferrals(res.data.data.referrals);
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setError('Admin access required. Your email must be in the ADMIN_EMAILS environment variable.');
        } else {
          setError('Failed to load referral data.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'FULFILLED':
        return 'bg-green-500/10 text-green-400';
      case 'REWARD_PENDING':
        return 'bg-yellow-500/10 text-yellow-400';
      case 'PENDING':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-foreground mb-8">Referral Dashboard</h1>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-foreground mb-8">Referral Dashboard</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground mb-8">Referral Dashboard</h1>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Total</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Pending Signup</p>
            <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Awaiting Deploy</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.rewardPending}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Fulfilled</p>
            <p className="text-2xl font-bold text-green-400">{stats.fulfilled}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Credits Issued</p>
            <p className="text-2xl font-bold text-primary">${stats.totalCreditedUsd}</p>
          </div>
        </div>
      )}

      {/* Referrals table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Referrer</th>
                <th className="px-4 py-3 font-medium">Referred User</th>
                <th className="px-4 py-3 font-medium">Reward</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Fulfilled</th>
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No referrals yet
                  </td>
                </tr>
              ) : (
                referrals.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.referrer.email}</td>
                    <td className="px-4 py-3 text-foreground">{r.referredUser.email}</td>
                    <td className="px-4 py-3 text-foreground">${r.rewardAmountUsd}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.fulfilledAt ? new Date(r.fulfilledAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  getDataSourceInfo,
  getDataSourceCredits,
  createDataSourceCreditsCheckout,
  getDataSourceUsage,
} from '../api';
import { useToast } from './Toast';

// ── Types ────────────────────────────────────────────────────────────

interface EndpointConfig {
  description: string;
  costUsd: number;
}

interface DataSourceInfo {
  id: string;
  displayName: string;
  description: string;
  status: 'active' | 'coming_soon';
  endpoints: Record<string, EndpointConfig>;
  currentMonthUsage: {
    requestCount: number;
    totalCostUsd: number;
  };
}

interface CreditPurchase {
  id: string;
  amountUsd: number;
  createdAt: string;
}

interface UsageHistoryEntry {
  month: string;
  dataSource: string;
  requestCount: number;
  totalCostUsd: number;
}

// ── Component ────────────────────────────────────────────────────────

export default function DataSourcesView({ secretId }: { secretId: string }) {
  const { toast } = useToast();
  const [dataSources, setDataSources] = useState<DataSourceInfo[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditLoading, setCreditLoading] = useState(false);

  const loadData = async () => {
    try {
      const [infoRes, creditsRes, usageRes] = await Promise.all([
        getDataSourceInfo(secretId),
        getDataSourceCredits(secretId),
        getDataSourceUsage(secretId),
      ]);
      setDataSources(infoRes.data.data);
      setBalance(creditsRes.data.data.balance);
      setPurchases(creditsRes.data.data.purchases);
      setUsageHistory(usageRes.data.data.history);
    } catch {
      toast('Failed to load data source info', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Show toast if returning from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credits') === 'success') {
      toast('Credits added successfully!');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [secretId]);

  const handleAddCredits = async () => {
    setCreditLoading(true);
    try {
      const successUrl = `${window.location.origin}${window.location.pathname}?credits=success`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}`;
      const res = await createDataSourceCreditsCheckout(secretId, successUrl, cancelUrl);
      window.location.href = res.data.data.url;
    } catch {
      toast('Failed to start checkout. Please try again.');
      setCreditLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="skeleton h-4 w-32 mb-3" />
          <div className="skeleton h-2.5 w-full rounded-full mb-2" />
          <div className="skeleton h-3 w-48" />
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="skeleton h-4 w-40 mb-3" />
          <div className="grid grid-cols-2 gap-3">
            <div className="skeleton h-24 rounded-lg" />
            <div className="skeleton h-24 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const balanceColor =
    balance <= 0 ? 'bg-destructive' : balance < 2 ? 'bg-destructive' : balance < 5 ? 'bg-yellow-500' : 'bg-green-500';

  // Total spent this month across all sources
  const totalMonthSpend = dataSources.reduce((sum, ds) => sum + ds.currentMonthUsage.totalCostUsd, 0);
  const totalMonthRequests = dataSources.reduce((sum, ds) => sum + ds.currentMonthUsage.requestCount, 0);

  // Aggregate usage history by month
  const monthlyTotals = usageHistory.reduce<Record<string, { requests: number; cost: number }>>((acc, entry) => {
    if (!acc[entry.month]) acc[entry.month] = { requests: 0, cost: 0 };
    acc[entry.month].requests += entry.requestCount;
    acc[entry.month].cost += entry.totalCostUsd;
    return acc;
  }, {});
  const sortedMonths = Object.entries(monthlyTotals).sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {/* Credit Balance */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-foreground">Data Source Credits</h3>
          <button
            onClick={handleAddCredits}
            disabled={creditLoading}
            className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {creditLoading ? 'Redirecting...' : 'Add Credits'}
          </button>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 mb-2">
          <div
            className={`h-2.5 rounded-full transition-all ${balanceColor}`}
            style={{
              width: `${balance <= 0 ? 100 : Math.max(4, Math.min(100, (balance / (balance + totalMonthSpend || 10)) * 100))}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            This month: {totalMonthRequests} request{totalMonthRequests !== 1 ? 's' : ''} (${totalMonthSpend.toFixed(2)})
          </span>
          <span className="font-medium">${balance.toFixed(2)} remaining</span>
        </div>
        {balance <= 0 && (
          <p className="text-xs text-destructive mt-2 font-medium">
            Credits exhausted — add more to continue using data sources.
          </p>
        )}
      </div>

      {/* Available Data Sources */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Available Data Sources</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dataSources.map((ds) => (
            <div key={ds.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-foreground">{ds.displayName}</h4>
                {ds.status === 'coming_soon' ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    Coming soon
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">{ds.description}</p>

              {/* Endpoints & Pricing */}
              <div className="space-y-1 mb-3">
                {Object.entries(ds.endpoints).map(([key, ep]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{ep.description}</span>
                    <span className="text-foreground font-mono">${ep.costUsd.toFixed(3)}</span>
                  </div>
                ))}
              </div>

              {/* This month stats */}
              {ds.currentMonthUsage.requestCount > 0 && (
                <div className="border-t border-border pt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{ds.currentMonthUsage.requestCount} requests this month</span>
                  <span>${ds.currentMonthUsage.totalCostUsd.toFixed(3)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Usage History */}
      {sortedMonths.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Usage History</h3>
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2">Month</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2">Requests</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2">Cost</th>
                </tr>
              </thead>
              <tbody>
                {sortedMonths.map(([month, data]) => (
                  <tr key={month} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground">{month}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                      {data.requests.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-foreground font-mono tabular-nums">
                      ${data.cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Purchases */}
      {purchases.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Credit Purchases</h3>
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2">Date</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right text-green-400 font-mono tabular-nums">
                      +${p.amountUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

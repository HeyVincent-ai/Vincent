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
      <div className="space-y-6">
        <div>
          <div className="skeleton h-3 w-20 mb-2" />
          <div className="skeleton h-6 w-24 mb-2" />
          <div className="skeleton h-1.5 w-full rounded-full" />
        </div>
        <div>
          <div className="skeleton h-3 w-28 mb-3" />
          <div className="skeleton h-16 w-full" />
        </div>
      </div>
    );
  }

  const balanceColor =
    balance <= 0
      ? 'bg-destructive'
      : balance < 2
        ? 'bg-destructive'
        : balance < 5
          ? 'bg-yellow-500'
          : 'bg-green-500';

  // Total spent this month across all sources
  const totalMonthSpend = dataSources.reduce(
    (sum, ds) => sum + ds.currentMonthUsage.totalCostUsd,
    0
  );
  const totalMonthRequests = dataSources.reduce(
    (sum, ds) => sum + ds.currentMonthUsage.requestCount,
    0
  );

  // Aggregate usage history by month
  const monthlyTotals = usageHistory.reduce<Record<string, { requests: number; cost: number }>>(
    (acc, entry) => {
      if (!acc[entry.month]) acc[entry.month] = { requests: 0, cost: 0 };
      acc[entry.month].requests += entry.requestCount;
      acc[entry.month].cost += entry.totalCostUsd;
      return acc;
    },
    {}
  );
  const sortedMonths = Object.entries(monthlyTotals).sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {/* Credit Balance */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Credits</p>
          <button
            onClick={handleAddCredits}
            disabled={creditLoading}
            className="text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
          >
            {creditLoading ? 'Redirecting...' : 'Add credits'}
          </button>
        </div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-xl font-semibold text-foreground font-mono">
            ${balance.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">remaining</span>
        </div>
        <div className="w-full bg-muted/30 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${balanceColor}/60`}
            style={{
              width: `${balance <= 0 ? 100 : Math.max(4, Math.min(100, (balance / (balance + totalMonthSpend || 10)) * 100))}%`,
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {totalMonthRequests} request{totalMonthRequests !== 1 ? 's' : ''} this month ($
          {totalMonthSpend.toFixed(2)})
        </p>
        {balance <= 0 && (
          <p className="text-xs text-destructive mt-2">
            Credits exhausted — add more to continue using data sources.
          </p>
        )}
      </div>

      {/* Available Data Sources */}
      <div className="border-t border-border/50 pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
          Available Data Sources
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dataSources.map((ds) => (
            <div key={ds.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">{ds.displayName}</p>
                {ds.status === 'coming_soon' ? (
                  <span className="text-[11px] px-2 py-0.5 text-muted-foreground bg-muted/30 rounded">
                    Coming Soon
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 text-green-400 bg-green-500/10 rounded">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">{ds.description}</p>

              {/* Per-endpoint pricing */}
              <div className="space-y-1 mb-3">
                {Object.entries(ds.endpoints).map(([key, ep]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{ep.description}</span>
                    <span className="text-foreground font-mono">${ep.costUsd.toFixed(3)}</span>
                  </div>
                ))}
              </div>

              {/* Current month usage */}
              {ds.currentMonthUsage.requestCount > 0 && (
                <div className="border-t border-border/50 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {ds.currentMonthUsage.requestCount} request{ds.currentMonthUsage.requestCount !== 1 ? 's' : ''} this month
                    </span>
                    <span className="text-foreground font-mono">
                      ${ds.currentMonthUsage.totalCostUsd.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Usage History */}
      {sortedMonths.length > 0 && (
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Usage History
          </p>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Month</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Requests</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sortedMonths.map(([month, data]) => (
                  <tr key={month}>
                    <td className="px-4 py-2.5 text-foreground">{month}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                      {data.requests.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-foreground font-mono tabular-nums font-semibold">
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
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Credit Purchases
          </p>
          <div className="divide-y divide-border/50">
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-foreground">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
                <span className="text-sm text-green-400 font-mono tabular-nums">
                  +${p.amountUsd.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Credits</p>
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
          <span className="text-xs text-muted-foreground/40">remaining</span>
        </div>
        <div className="w-full bg-muted/30 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${balanceColor}/60`}
            style={{
              width: `${balance <= 0 ? 100 : Math.max(4, Math.min(100, (balance / (balance + totalMonthSpend || 10)) * 100))}%`,
            }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-1.5">
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
        <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-3">
          Data Sources
        </p>
        <div className="divide-y divide-border/50">
          {dataSources.map((ds) => (
            <div key={ds.id} className="py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground">{ds.displayName}</p>
                {ds.status === 'coming_soon' ? (
                  <span className="text-[9px] px-1.5 py-0.5 text-muted-foreground/50 bg-muted/30 rounded">
                    soon
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 text-green-400/60 bg-green-500/5 rounded">
                    active
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">{ds.description}</p>

              {/* Endpoints & Pricing */}
              <div className="mt-2 space-y-0.5">
                {Object.entries(ds.endpoints).map(([key, ep]) => (
                  <div key={key} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground/50">{ep.description}</span>
                    <span className="text-foreground/60 font-mono">${ep.costUsd.toFixed(3)}</span>
                  </div>
                ))}
              </div>

              {/* This month stats */}
              {ds.currentMonthUsage.requestCount > 0 && (
                <p className="text-[10px] text-muted-foreground/30 mt-1.5">
                  {ds.currentMonthUsage.requestCount} requests ($
                  {ds.currentMonthUsage.totalCostUsd.toFixed(3)})
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Usage History */}
      {sortedMonths.length > 0 && (
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-3">
            Usage History
          </p>
          <div className="divide-y divide-border/50">
            {sortedMonths.map(([month, data]) => (
              <div key={month} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-foreground">{month}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground/40 tabular-nums">
                    {data.requests.toLocaleString()}
                  </span>
                  <span className="text-sm text-foreground font-mono tabular-nums w-14 text-right">
                    ${data.cost.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Purchases */}
      {purchases.length > 0 && (
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-3">
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

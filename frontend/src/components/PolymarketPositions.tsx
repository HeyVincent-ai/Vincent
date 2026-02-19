import { useEffect, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────

export interface PolymarketPosition {
  conditionId: string;
  title: string;
  outcome: string;
  outcomeIndex: number;
  size: number; // shares held
  avgPrice: number; // avg entry price (0-1)
  curPrice: number; // current price (0-1)
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  realizedPnl: number;
  redeemable: boolean;
  slug: string;
  eventSlug: string;
  icon: string;
  endDate: string;
}

interface PolymarketPositionsProps {
  walletAddress: string;
}

interface MockPolymarketPositionsProps {
  positions: PolymarketPosition[];
  usdcBalance?: number;
  totalPositionValue?: number;
}

// ── Formatters ──────────────────────────────────────────────────────

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatPercent(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function formatShares(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(1);
}

// ── Position Card ───────────────────────────────────────────────────

function PositionCard({ position }: { position: PolymarketPosition }) {
  const pnlPositive = position.cashPnl >= 0;
  const impliedProb = (position.curPrice * 100).toFixed(0);

  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        {/* Market icon */}
        {position.icon ? (
          <img
            src={position.icon}
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-primary text-[11px] font-bold">P</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Market title */}
          <a
            href={`https://polymarket.com/event/${position.eventSlug || position.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground hover:text-primary transition-colors line-clamp-2"
          >
            {position.title}
          </a>

          {/* Outcome badge + probability */}
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                position.outcome === 'Yes'
                  ? 'bg-green-500/10 text-green-400'
                  : position.outcome === 'No'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-primary/10 text-primary'
              }`}
            >
              {position.outcome}
            </span>
            <span className="text-xs text-muted-foreground">{impliedProb}%</span>
            {position.redeemable && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                redeemable
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
            <div>
              <div className="text-xs text-muted-foreground">Shares</div>
              <div className="text-sm font-mono text-foreground">{formatShares(position.size)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg Cost</div>
              <div className="text-sm font-mono text-foreground">
                {formatUsd(position.avgPrice)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Value</div>
              <div className="text-sm font-mono text-foreground">
                {formatUsd(position.currentValue)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">P&L</div>
              <div
                className={`text-sm font-mono ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}
              >
                {formatUsd(position.cashPnl)}
                <span className="text-xs ml-0.5 opacity-60">
                  ({formatPercent(position.percentPnl)})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Portfolio Summary ────────────────────────────────────────────────

function PortfolioSummary({
  totalValue,
  totalPnl,
  usdcBalance,
}: {
  totalValue: number;
  totalPnl: number;
  usdcBalance?: number;
}) {
  const cols = usdcBalance !== undefined ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Portfolio</p>
      <div className={`grid ${cols} gap-4`}>
        {usdcBalance !== undefined && (
          <div>
            <div className="text-xs text-muted-foreground">USDC Balance</div>
            <div className="text-xl font-semibold text-foreground font-mono">
              {formatUsd(usdcBalance)}
            </div>
          </div>
        )}
        <div>
          <div className="text-xs text-muted-foreground">Position Value</div>
          <div className="text-xl font-semibold text-foreground font-mono">
            {formatUsd(totalValue)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total P&L</div>
          <div
            className={`text-xl font-semibold font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {formatUsd(totalPnl)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Live Component (fetches from Polymarket Data API) ───────────────

export default function PolymarketPositions({ walletAddress }: PolymarketPositionsProps) {
  const [positions, setPositions] = useState<PolymarketPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'CURRENT' | 'CASHPNL' | 'TOKENS'>('CURRENT');

  useEffect(() => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);

    fetch(
      `https://data-api.polymarket.com/positions?user=${walletAddress}&sizeThreshold=0&limit=100&sortBy=${sortBy}&sortDirection=DESC`
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Record<string, unknown>[]) => {
        setPositions(
          data.map((p) => ({
            conditionId: p.conditionId || '',
            title: p.title || 'Unknown Market',
            outcome: p.outcome || '',
            outcomeIndex: p.outcomeIndex ?? 0,
            size: Number(p.size) || 0,
            avgPrice: Number(p.avgPrice) || 0,
            curPrice: Number(p.curPrice) || 0,
            initialValue: Number(p.initialValue) || 0,
            currentValue: Number(p.currentValue) || 0,
            cashPnl: Number(p.cashPnl) || 0,
            percentPnl: Number(p.percentPnl) || 0,
            realizedPnl: Number(p.realizedPnl) || 0,
            redeemable: Boolean(p.redeemable),
            slug: p.slug || '',
            eventSlug: p.eventSlug || '',
            icon: p.icon || '',
            endDate: p.endDate || '',
          }))
        );
      })
      .catch((err) => {
        setError(err.message || 'Failed to load positions');
      })
      .finally(() => setLoading(false));
  }, [walletAddress, sortBy]);

  const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = positions.reduce((s, p) => s + p.cashPnl, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-16 w-full rounded-lg" />
        <div className="skeleton h-20 w-full rounded-lg" />
        <div className="skeleton h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive mb-2">Failed to load positions</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <button
          onClick={() => setSortBy(sortBy)}
          className="text-xs text-primary hover:text-primary/80 mt-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground mb-1">No positions yet</p>
        <p className="text-xs text-muted-foreground">
          Positions will appear here once your agent places trades on Polymarket.
        </p>
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-primary hover:text-primary/80 mt-3"
        >
          Browse Polymarket Markets &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortfolioSummary totalValue={totalValue} totalPnl={totalPnl} />

      {/* Positions header */}
      <div className="border-t border-border/50 pt-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Open Positions ({positions.length})
          </p>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'CURRENT' | 'CASHPNL' | 'TOKENS')}
              className="bg-transparent border border-border/50 rounded px-2 py-1.5 text-xs text-muted-foreground"
            >
              <option value="CURRENT">Value</option>
              <option value="CASHPNL">P&L</option>
              <option value="TOKENS">Shares</option>
            </select>
            <a
              href="https://polymarket.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Polymarket &rarr;
            </a>
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {positions.map((pos, i) => (
            <PositionCard key={`${pos.conditionId}-${pos.outcome}-${i}`} position={pos} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mock Component (for UIPreview) ──────────────────────────────────

export function MockPolymarketPositions({
  positions,
  usdcBalance = 0,
  totalPositionValue,
}: MockPolymarketPositionsProps) {
  const totalValue = totalPositionValue ?? positions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = positions.reduce((s, p) => s + p.cashPnl, 0);

  return (
    <div className="space-y-6">
      <PortfolioSummary totalValue={totalValue} totalPnl={totalPnl} usdcBalance={usdcBalance} />

      {/* Positions header */}
      <div className="border-t border-border/50 pt-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Open Positions ({positions.length})
          </p>
          <div className="flex items-center gap-2">
            <select className="bg-transparent border border-border/50 rounded px-2 py-1.5 text-xs text-muted-foreground">
              <option>Value</option>
              <option>P&L</option>
              <option>Shares</option>
            </select>
            <a
              href="https://polymarket.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Polymarket &rarr;
            </a>
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {positions.map((pos, i) => (
            <PositionCard key={`${pos.conditionId}-${pos.outcome}-${i}`} position={pos} />
          ))}
        </div>
      </div>
    </div>
  );
}

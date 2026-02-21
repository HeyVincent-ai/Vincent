import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { Activity, ArrowUpRight, Clock3, Database, RefreshCcw, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Position, Rule, RuleEvent, Trade, WorkerStatus } from '@/types';

const POLL_MS = 5000;

const fetchJson = async <T,>(endpoint: string): Promise<T> => {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

const getPolymarketUrl = (slug: string): string => `https://polymarket.com/event/${slug}`;

const shortId = (value: string, keep = 10): string => `${value.slice(0, keep)}...`;

const friendlyRuleType = (ruleType: string): string => {
  switch (ruleType) {
    case 'TRAILING_STOP':
      return 'Trailing Stop';
    case 'STOP_LOSS':
      return 'Stop Loss';
    case 'TAKE_PROFIT':
      return 'Take Profit';
    default:
      return ruleType;
  }
};

const friendlyAction = (actionJson: string): string => {
  try {
    const action = JSON.parse(actionJson);
    switch (action?.type) {
      case 'SELL_ALL':
        return 'Sell All';
      case 'BUY':
        return `Buy${action.amount ? ` $${action.amount}` : ''}`;
      default:
        return action?.type ?? actionJson;
    }
  } catch {
    return actionJson;
  }
};

const triggerLabel = (ruleType: string): string => {
  switch (ruleType) {
    case 'TAKE_PROFIT':
      return 'Target';
    case 'TRAILING_STOP':
      return 'Stop Price';
    case 'STOP_LOSS':
      return 'Stop Price';
    default:
      return 'Trigger';
  }
};

const timeAgo = (value?: string | null): string => {
  if (!value) return 'Never';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  return `${Math.floor(diffSeconds / 3600)}h ago`;
};

type LogView = 'trades' | 'events';

export function App(): JSX.Element {
  const [worker, setWorker] = useState<WorkerStatus | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [events, setEvents] = useState<RuleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logView, setLogView] = useState<LogView>('trades');

  const refreshAll = useCallback(async (background = false): Promise<void> => {
    if (!background) setRefreshing(true);
    try {
      const [workerData, rulesData, positionsData, tradesData, eventsData] = await Promise.all([
        fetchJson<WorkerStatus>('/health/worker'),
        fetchJson<Rule[]>('/api/rules'),
        fetchJson<Position[]>('/api/positions'),
        fetchJson<Trade[]>('/api/trades'),
        fetchJson<RuleEvent[]>('/api/events'),
      ]);

      setWorker(workerData);
      setRules(rulesData);
      setPositions(positionsData);
      setTrades(tradesData);
      setEvents(eventsData);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown dashboard error';
      setError(message);
    } finally {
      setLoading(false);
      if (!background) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
    const timer = window.setInterval(() => {
      void refreshAll(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const activeRules = useMemo(() => rules.filter((rule) => rule.status === 'ACTIVE'), [rules]);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="container space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Trade Manager Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time visibility into worker health, holdings, and rule execution.
            </p>
          </div>
          <Button
            onClick={() => void refreshAll()}
            disabled={refreshing}
            className="gap-2 self-start"
          >
            <RefreshCcw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </Button>
        </header>

        {error ? (
          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="p-4 text-sm text-red-300">
              Failed to refresh dashboard: <span className="font-medium">{error}</span>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            label="Worker"
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            value={worker ? (worker.running ? 'Running' : 'Stopped') : '...'}
            status={worker?.running ? 'success' : 'danger'}
          />
          <MetricCard
            label="WebSocket"
            icon={
              worker?.webSocketConnected ? (
                <Wifi className="h-4 w-4 text-emerald-400" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-400" />
              )
            }
            value={worker ? (worker.webSocketConnected ? 'Connected' : 'Disconnected') : '...'}
            status={worker?.webSocketConnected ? 'success' : 'danger'}
          />
          <MetricCard
            label="Active Rules"
            icon={<Database className="h-4 w-4 text-muted-foreground" />}
            value={String(worker?.activeRulesCount ?? activeRules.length)}
          />
          <MetricCard
            label="Subscriptions"
            icon={<ArrowUpRight className="h-4 w-4 text-muted-foreground" />}
            value={String(worker?.webSocketSubscriptions ?? 0)}
          />
          <MetricCard
            label="Last Sync"
            icon={<Clock3 className="h-4 w-4 text-muted-foreground" />}
            value={timeAgo(worker?.lastSyncTime)}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Active Holdings</CardTitle>
              <CardDescription>
                Current positions with live P&L and linked active rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <LoadingRows />
              ) : positions.length === 0 ? (
                <EmptyState label="No active positions" />
              ) : (
                positions.map((position) => {
                  const pnlPercent = position.avgEntryPrice
                    ? ((position.currentPrice - position.avgEntryPrice) / position.avgEntryPrice) *
                      100
                    : null;
                  const linkedRules = activeRules.filter(
                    (rule) => rule.tokenId === position.tokenId
                  );
                  return (
                    <div key={position.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <Badge variant={position.side === 'BUY' ? 'success' : 'destructive'}>
                            {position.side}
                          </Badge>
                          <div className="text-sm font-medium">
                            {position.marketTitle ?? shortId(position.marketId)}
                            {position.outcome ? ` - ${position.outcome}` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Quantity</div>
                          <div className="font-medium">{position.quantity.toFixed(2)}</div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                        <LabeledValue
                          label="Entry"
                          value={position.avgEntryPrice ? position.avgEntryPrice.toFixed(3) : 'N/A'}
                        />
                        <LabeledValue label="Current" value={position.currentPrice.toFixed(3)} />
                        <LabeledValue
                          label="P&L"
                          value={
                            pnlPercent === null ? (
                              'N/A'
                            ) : (
                              <span
                                className={cn(
                                  'font-medium',
                                  pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                                )}
                              >
                                {pnlPercent >= 0 ? '+' : ''}
                                {pnlPercent.toFixed(2)}%
                              </span>
                            )
                          }
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {position.marketSlug ? (
                          <a
                            className="text-xs text-primary hover:underline"
                            href={getPolymarketUrl(position.marketSlug)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open market
                          </a>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          Token: {shortId(position.tokenId)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Updated: {new Date(position.lastUpdatedAt).toLocaleString()}
                        </span>
                      </div>

                      {linkedRules.length > 0 ? (
                        <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-2">
                          <div className="mb-2 text-xs text-muted-foreground">
                            Active Rules ({linkedRules.length})
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {linkedRules.map((rule) => (
                              <Badge key={rule.id} variant="outline">
                                {friendlyRuleType(rule.ruleType)}: {friendlyAction(rule.action)} @{' '}
                                {rule.triggerPrice.toFixed(3)}
                                {rule.ruleType === 'TRAILING_STOP' && rule.trailingPercent
                                  ? ` (${rule.trailingPercent}% trail)`
                                  : ''}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Log</CardTitle>
                <CardDescription>Recent trades and rule events.</CardDescription>
              </div>
              <div className="flex gap-1 rounded-md border p-1">
                <Button
                  variant={logView === 'trades' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLogView('trades')}
                >
                  Trades
                </Button>
                <Button
                  variant={logView === 'events' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLogView('events')}
                >
                  Events
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <LoadingRows />
              ) : logView === 'trades' ? (
                trades.length === 0 ? (
                  <EmptyState label="No executed trades yet" />
                ) : (
                  trades.slice(0, 30).map((trade) => (
                    <div key={trade.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="success">{friendlyRuleType(trade.ruleType)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(trade.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {trade.tradeSide ?? trade.side}
                        </span>{' '}
                        @{' '}
                        {trade.price != null
                          ? trade.price.toFixed(3)
                          : trade.triggerPrice.toFixed(3)}{' '}
                        • {shortId(trade.marketId)}
                      </div>
                    </div>
                  ))
                )
              ) : events.length === 0 ? (
                <EmptyState label="No events logged yet" />
              ) : (
                events.slice(0, 30).map((event) => (
                  <div key={event.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{event.eventType.replace(/_/g, ' ')}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <EventDataSummary data={event.data} eventType={event.eventType} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Rules</CardTitle>
              <CardDescription>All configured rules and current status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <LoadingRows />
              ) : rules.length === 0 ? (
                <EmptyState label="No rules configured" />
              ) : (
                rules.map((rule) => (
                  <div key={rule.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={rule.status === 'ACTIVE' ? 'success' : 'outline'}>
                          {rule.status}
                        </Badge>
                        <span className="font-medium">{friendlyRuleType(rule.ruleType)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                      <span>Market: {shortId(rule.marketId)}</span>
                      <span>Action: {friendlyAction(rule.action)}</span>
                      <span>
                        {triggerLabel(rule.ruleType)}: {rule.triggerPrice.toFixed(3)}
                      </span>
                      {rule.ruleType === 'TRAILING_STOP' && rule.trailingPercent ? (
                        <span>Trail: {rule.trailingPercent}%</span>
                      ) : (
                        <span>Token: {shortId(rule.tokenId)}</span>
                      )}
                    </div>
                    {rule.errorMessage ? (
                      <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                        {rule.errorMessage}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  icon,
  status,
}: {
  label: string;
  value: string;
  icon: JSX.Element;
  status?: 'success' | 'danger';
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div
            className={cn(
              'mt-1 text-base font-semibold',
              status === 'success' && 'text-emerald-400',
              status === 'danger' && 'text-red-400'
            )}
          >
            {value}
          </div>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }): JSX.Element {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function LoadingRows(): JSX.Element {
  return (
    <div className="space-y-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function LabeledValue({
  label,
  value,
}: {
  label: string;
  value: string | JSX.Element;
}): JSX.Element {
  return (
    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function EventDataSummary({
  data,
  eventType,
}: {
  data: Record<string, unknown>;
  eventType: string;
}): JSX.Element | null {
  if (!data || Object.keys(data).length === 0) return null;

  const d = data as Record<string, any>;

  if (eventType === 'RULE_EVALUATED' || eventType === 'RULE_TRAILING_UPDATED') {
    const parts: string[] = [];
    if (d.currentPrice != null) parts.push(`Price: ${Number(d.currentPrice).toFixed(4)}`);
    if (d.triggerPrice != null) parts.push(`Stop: ${Number(d.triggerPrice).toFixed(4)}`);
    if (d.oldTriggerPrice != null && d.newTriggerPrice != null)
      parts.push(
        `${Number(d.oldTriggerPrice).toFixed(4)} → ${Number(d.newTriggerPrice).toFixed(4)}`
      );
    if (d.trailingPercent != null) parts.push(`Trail: ${d.trailingPercent}%`);
    if (d.triggered != null) parts.push(d.triggered ? 'Triggered ✓' : '');
    return parts.length > 0 ? (
      <div className="mt-2 text-xs text-muted-foreground">{parts.filter(Boolean).join(' • ')}</div>
    ) : null;
  }

  if (eventType === 'ACTION_EXECUTED' || eventType === 'ACTION_ATTEMPT') {
    const result = d.result ?? d;
    const parts: string[] = [];
    if (result.status) parts.push(result.status);
    if (result.price != null) parts.push(`Price: ${Number(result.price).toFixed(4)}`);
    if (result.amount != null) parts.push(`Amount: ${result.amount}`);
    if (result.orderId) parts.push(`Order: ${shortId(String(result.orderId), 8)}`);
    return parts.length > 0 ? (
      <div className="mt-2 text-xs text-muted-foreground">{parts.join(' • ')}</div>
    ) : null;
  }

  if (eventType === 'ACTION_FAILED' || eventType === 'RULE_FAILED') {
    const msg = d.error ?? d.message ?? d.reason;
    return msg ? <div className="mt-2 text-xs text-red-400">{String(msg)}</div> : null;
  }

  const simple = Object.entries(data)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`)
    .slice(0, 4);
  return simple.length > 0 ? (
    <div className="mt-2 text-xs text-muted-foreground">{simple.join(' • ')}</div>
  ) : null;
}

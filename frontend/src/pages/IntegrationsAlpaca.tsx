import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  connectAlpaca,
  disconnectAlpaca,
  getAlpacaConnection,
  testAlpacaConnection,
  getTradingPolicy,
  updateTradingPolicy,
} from '../api';
import { useToast } from '../components/Toast';
import { formatUsd, formatUsdWhole } from '../utils/format';

interface AlpacaConnection {
  id: string;
  name: string | null;
  environment: 'PAPER' | 'LIVE';
  baseUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  disconnectedAt?: string | null;
}

interface AlpacaAccount {
  status?: string;
  cash?: string;
  buying_power?: string;
  equity?: string;
  portfolio_value?: string;
  long_market_value?: string;
  short_market_value?: string;
}

const ACCOUNT_FIELDS: Array<{
  key: keyof AlpacaAccount;
  label: string;
  description: string;
}> = [
  { key: 'cash', label: 'Settled Cash', description: 'Actual settled USD cash' },
  { key: 'buying_power', label: 'Buying Power', description: 'Available to trade' },
  { key: 'equity', label: 'Total Equity', description: 'Total account value' },
  { key: 'portfolio_value', label: 'Portfolio Value', description: 'Current portfolio value' },
  { key: 'long_market_value', label: 'Long Market Value', description: 'Value of long positions' },
  { key: 'short_market_value', label: 'Short Market Value', description: 'Value of short positions' },
];

// ── Policy types ────────────────────────────────────────────────────

interface TradingPolicy {
  id: string;
  enabled: boolean;
  allowedSymbols: string[];
  allowedOrderTypes: Array<'market' | 'limit'>;
  longOnly: boolean;
  restrictToRth: boolean;
  timezone: string;
  maxOrderNotionalUsd: number | null;
  maxPositionNotionalUsdPerSymbol: number | null;
  maxDailyNotionalUsd: number | null;
}

type PolicyType =
  | 'ALLOWLIST'
  | 'ORDER_TYPES'
  | 'LONG_ONLY'
  | 'RTH_ONLY'
  | 'MAX_ORDER'
  | 'MAX_POSITION'
  | 'MAX_DAILY';

const POLICY_TYPES: Array<{
  value: PolicyType;
  label: string;
  description: string;
}> = [
  { value: 'ALLOWLIST', label: 'Symbol Allowlist', description: 'Only allow listed symbols' },
  { value: 'ORDER_TYPES', label: 'Order Types', description: 'Restrict to market/limit orders' },
  { value: 'LONG_ONLY', label: 'Long-Only', description: 'Block short sells' },
  { value: 'RTH_ONLY', label: 'Regular Hours', description: 'Trade only 9:30-16:00 ET, Mon-Fri' },
  { value: 'MAX_ORDER', label: 'Max Order Notional', description: 'Limit per order in USD' },
  { value: 'MAX_POSITION', label: 'Max Position Notional', description: 'Limit per symbol in USD' },
  { value: 'MAX_DAILY', label: 'Max Daily Notional', description: 'Limit daily notional in USD' },
];

function parseSymbols(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

// ── Policies Section (embedded) ─────────────────────────────────────

function PoliciesSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [allowedSymbolsInput, setAllowedSymbolsInput] = useState('');
  const [orderTypes, setOrderTypes] = useState({ market: true, limit: true });
  const [longOnly, setLongOnly] = useState(false);
  const [restrictToRth, setRestrictToRth] = useState(false);
  const [timezone, setTimezone] = useState('America/New_York');
  const [maxOrderNotionalUsd, setMaxOrderNotionalUsd] = useState('');
  const [maxPositionNotionalUsdPerSymbol, setMaxPositionNotionalUsdPerSymbol] = useState('');
  const [maxDailyNotionalUsd, setMaxDailyNotionalUsd] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<PolicyType>('ALLOWLIST');
  const [policyValue, setPolicyValue] = useState('');
  const [formOrderTypes, setFormOrderTypes] = useState({ market: true, limit: true });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getTradingPolicy();
      const policy: TradingPolicy | null = res.data.data.policy;
      if (policy) {
        setAllowedSymbolsInput(policy.allowedSymbols.join(', '));
        setOrderTypes({
          market: policy.allowedOrderTypes.includes('market'),
          limit: policy.allowedOrderTypes.includes('limit'),
        });
        setLongOnly(policy.longOnly);
        setRestrictToRth(policy.restrictToRth);
        setTimezone(policy.timezone || 'America/New_York');
        setMaxOrderNotionalUsd(policy.maxOrderNotionalUsd?.toString() ?? '');
        setMaxPositionNotionalUsdPerSymbol(policy.maxPositionNotionalUsdPerSymbol?.toString() ?? '');
        setMaxDailyNotionalUsd(policy.maxDailyNotionalUsd?.toString() ?? '');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activePolicies = useMemo(() => {
    const items: Array<{ type: PolicyType; title: string; value: string }> = [];
    const symbols = parseSymbols(allowedSymbolsInput);
    if (symbols.length > 0) {
      items.push({ type: 'ALLOWLIST', title: 'Symbol Allowlist', value: symbols.join(', ') });
    }
    if (!(orderTypes.market && orderTypes.limit)) {
      const types = [
        orderTypes.market ? 'Market' : null,
        orderTypes.limit ? 'Limit' : null,
      ].filter(Boolean);
      items.push({ type: 'ORDER_TYPES', title: 'Order Types', value: types.join(', ') });
    }
    if (longOnly) {
      items.push({ type: 'LONG_ONLY', title: 'Long-Only', value: 'No short sells' });
    }
    if (restrictToRth) {
      items.push({
        type: 'RTH_ONLY',
        title: 'Regular Trading Hours',
        value: `9:30-16:00 ET (${timezone})`,
      });
    }
    if (maxOrderNotionalUsd) {
      items.push({ type: 'MAX_ORDER', title: 'Max Order Notional', value: formatUsdWhole(maxOrderNotionalUsd) });
    }
    if (maxPositionNotionalUsdPerSymbol) {
      items.push({ type: 'MAX_POSITION', title: 'Max Position Notional', value: formatUsdWhole(maxPositionNotionalUsdPerSymbol) });
    }
    if (maxDailyNotionalUsd) {
      items.push({ type: 'MAX_DAILY', title: 'Max Daily Notional', value: formatUsdWhole(maxDailyNotionalUsd) });
    }
    return items;
  }, [allowedSymbolsInput, orderTypes, longOnly, restrictToRth, timezone, maxOrderNotionalUsd, maxPositionNotionalUsdPerSymbol, maxDailyNotionalUsd]);

  const parseCap = (value: string, label: string) => {
    if (!value.trim()) return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      toast(`${label} must be a positive number.`, 'error');
      throw new Error('invalid-number');
    }
    return num;
  };

  const persistPolicies = async (next: {
    allowedSymbolsInput: string;
    orderTypes: { market: boolean; limit: boolean };
    longOnly: boolean;
    restrictToRth: boolean;
    timezone: string;
    maxOrderNotionalUsd: string;
    maxPositionNotionalUsdPerSymbol: string;
    maxDailyNotionalUsd: string;
  }) => {
    const allowedSymbols = parseSymbols(next.allowedSymbolsInput);
    const selectedTypes: Array<'market' | 'limit'> = [];
    if (next.orderTypes.market) selectedTypes.push('market');
    if (next.orderTypes.limit) selectedTypes.push('limit');
    if (selectedTypes.length === 0) {
      toast('Select at least one order type.', 'error');
      throw new Error('invalid-order-types');
    }
    const restrictOrderTypes = !(next.orderTypes.market && next.orderTypes.limit);
    const allowedOrderTypes = restrictOrderTypes ? selectedTypes : [];
    const maxOrder = parseCap(next.maxOrderNotionalUsd, 'Max order notional');
    const maxPosition = parseCap(next.maxPositionNotionalUsdPerSymbol, 'Max position notional');
    const maxDaily = parseCap(next.maxDailyNotionalUsd, 'Max daily notional');

    const hasPolicies =
      allowedSymbols.length > 0 ||
      allowedOrderTypes.length > 0 ||
      next.longOnly ||
      next.restrictToRth ||
      maxOrder != null ||
      maxPosition != null ||
      maxDaily != null;

    await updateTradingPolicy({
      venue: 'alpaca',
      enabled: hasPolicies,
      allowedSymbols,
      allowedOrderTypes,
      longOnly: next.longOnly,
      restrictToRth: next.restrictToRth,
      timezone: next.timezone,
      maxOrderNotionalUsd: maxOrder,
      maxPositionNotionalUsdPerSymbol: maxPosition,
      maxDailyNotionalUsd: maxDaily,
    });

    setAllowedSymbolsInput(next.allowedSymbolsInput);
    setOrderTypes(next.orderTypes);
    setLongOnly(next.longOnly);
    setRestrictToRth(next.restrictToRth);
    setTimezone(next.timezone);
    setMaxOrderNotionalUsd(next.maxOrderNotionalUsd);
    setMaxPositionNotionalUsdPerSymbol(next.maxPositionNotionalUsdPerSymbol);
    setMaxDailyNotionalUsd(next.maxDailyNotionalUsd);
  };

  const handleCsvImport = async (file: File) => {
    const text = await file.text();
    const symbols = parseSymbols(text);
    if (symbols.length === 0) return;
    const existing = parseSymbols(allowedSymbolsInput);
    const merged = Array.from(new Set([...existing, ...symbols]));
    setPolicyValue(merged.join(', '));
  };

  const currentState = () => ({
    allowedSymbolsInput,
    orderTypes,
    longOnly,
    restrictToRth,
    timezone,
    maxOrderNotionalUsd,
    maxPositionNotionalUsdPerSymbol,
    maxDailyNotionalUsd,
  });

  const handleAddPolicy = async () => {
    const next = currentState();
    try {
      if (selectedType === 'ALLOWLIST') {
        const symbols = parseSymbols(policyValue);
        if (symbols.length === 0) { toast('Add at least one symbol.', 'error'); return; }
        next.allowedSymbolsInput = symbols.join(', ');
      } else if (selectedType === 'ORDER_TYPES') {
        if (!formOrderTypes.market && !formOrderTypes.limit) { toast('Select at least one order type.', 'error'); return; }
        next.orderTypes = { ...formOrderTypes };
      } else if (selectedType === 'LONG_ONLY') {
        next.longOnly = true;
      } else if (selectedType === 'RTH_ONLY') {
        next.restrictToRth = true;
      } else if (selectedType === 'MAX_ORDER') {
        if (!policyValue.trim()) { toast('Enter a max order notional.', 'error'); return; }
        next.maxOrderNotionalUsd = policyValue.trim();
      } else if (selectedType === 'MAX_POSITION') {
        if (!policyValue.trim()) { toast('Enter a max position notional.', 'error'); return; }
        next.maxPositionNotionalUsdPerSymbol = policyValue.trim();
      } else if (selectedType === 'MAX_DAILY') {
        if (!policyValue.trim()) { toast('Enter a max daily notional.', 'error'); return; }
        next.maxDailyNotionalUsd = policyValue.trim();
      }
      setSaving(true);
      await persistPolicies(next);
      setShowForm(false);
      setPolicyValue('');
      setFormOrderTypes({ market: true, limit: true });
      toast('Policy added');
    } catch (err: any) {
      if (err?.message === 'invalid-number' || err?.message === 'invalid-order-types') return;
      toast(err?.response?.data?.error?.message || 'Failed to save policy.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: PolicyType) => {
    const next = currentState();
    if (type === 'ALLOWLIST') next.allowedSymbolsInput = '';
    if (type === 'ORDER_TYPES') next.orderTypes = { market: true, limit: true };
    if (type === 'LONG_ONLY') next.longOnly = false;
    if (type === 'RTH_ONLY') next.restrictToRth = false;
    if (type === 'MAX_ORDER') next.maxOrderNotionalUsd = '';
    if (type === 'MAX_POSITION') next.maxPositionNotionalUsdPerSymbol = '';
    if (type === 'MAX_DAILY') next.maxDailyNotionalUsd = '';
    setSaving(true);
    try {
      await persistPolicies(next);
      toast('Policy removed');
    } catch (err: any) {
      if (err?.message === 'invalid-number' || err?.message === 'invalid-order-types') return;
      toast(err?.response?.data?.error?.message || 'Failed to remove policy.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 text-sm text-muted-foreground">
        Loading policies...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Policies</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          {showForm ? 'Cancel' : 'Add Policy'}
        </button>
      </div>

      {showForm && (
        <div className="bg-muted border border-border rounded-lg p-4 mb-4">
          <div className="mb-3">
            <label className="block text-sm font-medium text-foreground mb-1">Policy Type</label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value as PolicyType);
                setPolicyValue('');
                setFormOrderTypes({ market: true, limit: true });
              }}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              {POLICY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {POLICY_TYPES.find((t) => t.value === selectedType)?.description}
            </p>
          </div>

          {selectedType === 'ALLOWLIST' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-foreground mb-1">Symbols (comma-separated)</label>
              <textarea
                value={policyValue}
                onChange={(e) => setPolicyValue(e.target.value)}
                rows={2}
                placeholder="AAPL, MSFT, NVDA"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
              />
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>Comma or whitespace separated.</span>
                <label className="cursor-pointer text-primary hover:underline">
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { handleCsvImport(file); e.target.value = ''; }
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {selectedType === 'ORDER_TYPES' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-foreground mb-1">Order Types</label>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={formOrderTypes.market} onChange={(e) => setFormOrderTypes((prev) => ({ ...prev, market: e.target.checked }))} className="rounded border-border bg-background" />
                  Market
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={formOrderTypes.limit} onChange={(e) => setFormOrderTypes((prev) => ({ ...prev, limit: e.target.checked }))} className="rounded border-border bg-background" />
                  Limit
                </label>
              </div>
            </div>
          )}

          {['MAX_ORDER', 'MAX_POSITION', 'MAX_DAILY'].includes(selectedType) && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-foreground mb-1">Value (USD)</label>
              <input
                value={policyValue}
                onChange={(e) => setPolicyValue(e.target.value)}
                placeholder="e.g. 500"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}

          {selectedType === 'RTH_ONLY' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-foreground mb-1">Timezone</label>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddPolicy}
              disabled={saving}
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Create Policy'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activePolicies.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <svg className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <p className="text-foreground font-medium text-sm mb-0.5">No policies configured</p>
          <p className="text-muted-foreground text-xs">
            All trades are allowed by default. Add a policy to restrict trading.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activePolicies.map((policy) => (
            <div key={policy.type} className="bg-card rounded-lg border border-border p-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{policy.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{policy.value}</p>
              </div>
              <button
                onClick={() => handleDelete(policy.type)}
                className="text-sm text-destructive hover:text-destructive/80 transition-colors ml-4 shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function IntegrationsAlpaca() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<AlpacaConnection | null>(null);
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [form, setForm] = useState({
    environment: 'paper' as 'paper' | 'live',
    apiKeyId: '',
    apiSecretKey: '',
    name: '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAlpacaConnection(true);
      setConnection(res.data.data.connection);
      setAccount(res.data.data.account ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (connection) {
      setForm((prev) => ({
        ...prev,
        environment: connection.environment === 'PAPER' ? 'paper' : 'live',
        name: connection.name ?? '',
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        environment: 'paper',
        name: '',
      }));
    }
  }, [connection?.id]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await testAlpacaConnection({
        environment: form.environment,
        apiKeyId: form.apiKeyId.trim(),
        apiSecretKey: form.apiSecretKey.trim(),
        name: form.name.trim() || undefined,
      });
      setAccount(res.data.data.account);
      toast('Connection successful');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message || 'Failed to connect to Alpaca. Check your credentials.';
      toast(msg, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await connectAlpaca({
        environment: form.environment,
        apiKeyId: form.apiKeyId.trim(),
        apiSecretKey: form.apiSecretKey.trim(),
        name: form.name.trim() || undefined,
      });
      setConnection(res.data.data.connection);
      setAccount(res.data.data.account ?? null);
      setForm((prev) => ({ ...prev, apiKeyId: '', apiSecretKey: '' }));
      toast('Alpaca connected');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message || 'Failed to save Alpaca connection.';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    if (!confirm('Disconnect Alpaca? Trading will be disabled until you reconnect.')) return;
    try {
      await disconnectAlpaca(connection.id);
      setConnection(null);
      setAccount(null);
      setShowManage(false);
      toast('Alpaca disconnected');
    } catch {
      toast('Failed to disconnect Alpaca', 'error');
    }
  };

  return (
    <div className="max-w-2xl">
      <nav className="flex items-center gap-1.5 text-sm mb-4" aria-label="Breadcrumb">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          Accounts
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium">Alpaca</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Alpaca Account</h1>
        {connection && (
          <button
            onClick={() => setShowManage((prev) => !prev)}
            className="text-sm text-muted-foreground hover:text-foreground border border-border px-3 py-1 rounded transition-colors"
          >
            {showManage ? 'Hide Connection' : 'Manage Connection'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-card rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Loading connection...
        </div>
      ) : connection ? (
        <>
          {/* Account summary */}
          <div className="bg-card rounded-lg border border-border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Connected</span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400">
                  {connection.environment === 'PAPER' ? 'Paper' : 'Live'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Updated {new Date(connection.updatedAt).toLocaleString()}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="text-foreground font-medium">{connection.name || 'Alpaca'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Base URL</dt>
                <dd className="text-foreground font-mono text-xs break-all">{connection.baseUrl}</dd>
              </div>
            </dl>

            {account && (
              <div className="mt-5 border-t border-border pt-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Account Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {'status' in account && account.status && (
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="text-foreground font-medium">{account.status}</dd>
                    </div>
                  )}
                  {ACCOUNT_FIELDS.map((field) => (
                    <div key={field.key as string}>
                      <dt className="text-muted-foreground">{field.label}</dt>
                      <dd className="text-foreground font-medium">{formatUsd(account[field.key])}</dd>
                      <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Policies section — shown after connected */}
          <div className="mb-6">
            <PoliciesSection />
          </div>

          {/* Manage connection */}
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Manage Connection</h2>
                <p className="text-xs text-muted-foreground">
                  Update credentials, switch environments, or disconnect Alpaca.
                </p>
              </div>
              <button
                onClick={() => setShowManage((prev) => !prev)}
                className="text-xs text-muted-foreground hover:text-foreground border border-border px-2.5 py-1 rounded transition-colors"
              >
                {showManage ? 'Collapse' : 'Edit'}
              </button>
            </div>

            {showManage ? (
              <>
                <div className="grid gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Environment</label>
                    <select
                      value={form.environment}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, environment: e.target.value as 'paper' | 'live' }))
                      }
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                    >
                      <option value="paper">Paper</option>
                      <option value="live">Live</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Name (optional)</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Main Alpaca"
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">API Key ID</label>
                    <input
                      value={form.apiKeyId}
                      onChange={(e) => setForm((prev) => ({ ...prev, apiKeyId: e.target.value }))}
                      placeholder="Enter a new Alpaca API key"
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Secret Key</label>
                    <input
                      type="password"
                      value={form.apiSecretKey}
                      onChange={(e) => setForm((prev) => ({ ...prev, apiSecretKey: e.target.value }))}
                      placeholder="Enter a new Alpaca secret key"
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-6">
                  <button
                    onClick={handleTest}
                    disabled={testing || !form.apiKeyId || !form.apiSecretKey}
                    className="text-sm bg-muted text-foreground px-4 py-2 rounded hover:bg-surface-hover border border-border transition-colors disabled:opacity-50"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.apiKeyId || !form.apiSecretKey}
                    className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="text-sm text-destructive hover:text-destructive/80 border border-destructive/30 px-4 py-2 rounded transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground mt-4">
                Connection credentials are hidden. Click "Edit" to update or disconnect.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Connect Alpaca</h2>

          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Environment</label>
              <select
                value={form.environment}
                onChange={(e) => setForm((prev) => ({ ...prev, environment: e.target.value as 'paper' | 'live' }))}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name (optional)</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Main Alpaca"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">API Key ID</label>
              <input
                value={form.apiKeyId}
                onChange={(e) => setForm((prev) => ({ ...prev, apiKeyId: e.target.value }))}
                placeholder="Your Alpaca API key"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Secret Key</label>
              <input
                type="password"
                value={form.apiSecretKey}
                onChange={(e) => setForm((prev) => ({ ...prev, apiSecretKey: e.target.value }))}
                placeholder="Your Alpaca secret key"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={handleTest}
              disabled={testing || !form.apiKeyId || !form.apiSecretKey}
              className="text-sm bg-muted text-foreground px-4 py-2 rounded hover:bg-surface-hover border border-border transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.apiKeyId || !form.apiSecretKey}
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

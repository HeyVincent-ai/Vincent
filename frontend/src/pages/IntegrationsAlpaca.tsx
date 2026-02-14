import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { connectAlpaca, disconnectAlpaca, getAlpacaConnection, testAlpacaConnection } from '../api';
import { useToast } from '../components/Toast';

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

function formatUsd(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
        <Link to="/account" className="text-muted-foreground hover:text-foreground transition-colors">
          Settings
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium">Integrations</span>
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

      <div className="bg-card rounded-lg border border-border p-5 mb-6">
        <p className="text-sm text-muted-foreground">
          Policies are optional. Add them if you want to restrict Alpaca trading.
        </p>
      </div>

      {loading ? (
        <div className="bg-card rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Loading connection...
        </div>
      ) : connection ? (
        <>
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
                Connection credentials are hidden. Click “Edit” to update or disconnect.
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

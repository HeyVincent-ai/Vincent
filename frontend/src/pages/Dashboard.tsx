import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserSecrets, createSecret, claimSecret } from '../api';

interface Secret {
  id: string;
  type: string;
  memo: string | null;
  walletAddress?: string;
  ethAddress?: string;
  solanaAddress?: string;
  createdAt: string;
}

export default function Dashboard() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState('EVM_WALLET');
  const [createMemo, setCreateMemo] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadSecrets = () => {
    getUserSecrets()
      .then((res) => setSecrets(res.data.data.secrets))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createSecret(createType, createMemo || undefined);
      const { secret, apiKey, claimUrl } = res.data.data;

      // Extract claim token from URL and auto-claim
      const url = new URL(claimUrl, window.location.origin);
      const token = url.searchParams.get('token');
      if (token) {
        await claimSecret(secret.id, token);
      }

      setCreatedKey(apiKey.key);
      setCreateMemo('');
      loadSecrets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      setCreateError(msg || 'Failed to create secret');
    } finally {
      setCreating(false);
    }
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreatedKey(null);
    setCreateError(null);
    setCreateMemo('');
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          + Create Secret
        </button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          {createdKey ? (
            <div>
              <h3 className="font-medium text-green-400 mb-2">Secret created!</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Save this API key now — it won't be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-3 py-1.5 rounded text-sm flex-1 break-all text-foreground">
                  {createdKey}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(createdKey)}
                  className="text-primary text-sm hover:underline whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={closeCreate}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div>
              <h3 className="font-medium text-foreground mb-3">Create a new secret</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Type</label>
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value)}
                    className="bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground"
                  >
                    <option value="EVM_WALLET">EVM Wallet</option>
                    <option value="RAW_SIGNER">Raw Signer</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-muted-foreground mb-1">Memo (optional)</label>
                  <input
                    type="text"
                    value={createMemo}
                    onChange={(e) => setCreateMemo(e.target.value)}
                    placeholder="e.g. My trading bot wallet"
                    className="bg-background border border-border rounded px-3 py-1.5 text-sm w-full text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={closeCreate}
                    className="text-muted-foreground px-3 py-1.5 text-sm hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {createError && <p className="text-destructive text-sm mt-2">{createError}</p>}
            </div>
          )}
        </div>
      )}

      {secrets.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
          <p>No secrets yet. Create one above or claim one from an agent.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {secrets.map((s) => (
            <Link
              key={s.id}
              to={`/secrets/${s.id}`}
              className="bg-card rounded-lg border border-border p-4 hover:border-primary/50 transition-colors block"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-block bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded mr-2">
                    {s.type}
                  </span>
                  <span className="text-foreground font-medium">{s.memo || 'Unnamed secret'}</span>
                </div>
                <span className="text-muted-foreground text-sm">
                  {new Date(s.createdAt).toLocaleDateString()}
                </span>
              </div>
              {s.walletAddress && (
                <p className="text-sm text-muted-foreground mt-1 font-mono">{s.walletAddress}</p>
              )}
              {s.ethAddress && (
                <p className="text-sm text-muted-foreground mt-1 font-mono">ETH: {s.ethAddress}</p>
              )}
              {s.solanaAddress && (
                <p className="text-sm text-muted-foreground mt-1 font-mono">SOL: {s.solanaAddress}</p>
              )}
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}

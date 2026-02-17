import { useEffect, useState } from 'react';
import { listApiKeys, createApiKey, revokeApiKey } from '../api';
import { useToast } from './Toast';

interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  revokedAt: string | null;
}

export default function ApiKeyManager({ secretId }: { secretId: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const load = () => {
    listApiKeys(secretId)
      .then((res) => setKeys(res.data.data.apiKeys))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [secretId]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await createApiKey(secretId, newKeyName.trim());
      setCreatedKey(res.data.data.plainKey);
      setNewKeyName('');
      toast('API key created');
      load();
    } catch {
      toast('Failed to create API key', 'error');
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await revokeApiKey(secretId, keyId);
      toast('API key revoked');
      load();
    } catch {
      toast('Failed to revoke API key', 'error');
    }
  };

  const copyKey = () => {
    if (createdKey) navigator.clipboard.writeText(createdKey);
  };

  if (loading)
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="skeleton h-14 w-full rounded-lg" />
        ))}
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">API Keys</p>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setCreatedKey(null);
          }}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {showForm ? 'Cancel' : 'Create key'}
        </button>
      </div>

      {createdKey && (
        <div className="border-t border-border/50 pt-4 pb-4 mb-2">
          <p className="text-xs text-green-400 mb-2">
            Copy this key now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted/50 px-2 py-1.5 rounded flex-1 overflow-x-auto text-foreground font-mono">
              {createdKey}
            </code>
            <button
              onClick={copyKey}
              className="text-xs text-primary hover:text-primary/80 transition-colors shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {showForm && !createdKey && (
        <div className="border-t border-border/50 pt-4 pb-4 mb-2">
          <label className="block text-xs font-medium text-foreground mb-1">Key Name</label>
          <div className="flex gap-2">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. My Agent"
              className="flex-1 bg-background border border-border/50 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleCreate}
              className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-0.5">No API keys</p>
          <p className="text-xs text-muted-foreground/50">
            Create one to give an agent access to this account.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{k.name}</span>
                <span className="text-xs text-muted-foreground/30 tabular-nums">
                  {new Date(k.createdAt).toLocaleDateString()}
                </span>
                {k.revokedAt && (
                  <span className="text-[9px] px-1.5 py-0.5 text-destructive/60 bg-destructive/5 rounded">
                    revoked
                  </span>
                )}
              </div>
              {!k.revokedAt && (
                <button
                  onClick={() => handleRevoke(k.id)}
                  className="text-xs text-muted-foreground/30 hover:text-destructive transition-colors"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

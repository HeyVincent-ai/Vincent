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
      setCreatedKey(res.data.data.key);
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
        <h2 className="text-lg font-semibold text-foreground">API Keys</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setCreatedKey(null);
          }}
          className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'Create API Key'}
        </button>
      </div>

      {createdKey && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-green-400 mb-1">
            API key created! Copy it now - it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-background px-2 py-1 rounded border border-border flex-1 overflow-x-auto text-foreground">
              {createdKey}
            </code>
            <button
              onClick={copyKey}
              className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {showForm && !createdKey && (
        <div className="bg-muted border border-border rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">Key Name</label>
          <div className="flex gap-2">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. My Agent"
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleCreate}
              className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <svg
            className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
            />
          </svg>
          <p className="text-foreground font-medium text-sm mb-0.5">No API keys</p>
          <p className="text-muted-foreground text-xs">
            Create one to give an agent access to this secret.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <span className="font-medium text-sm text-foreground">{k.name}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                </span>
                {k.revokedAt && <span className="text-xs text-destructive ml-2">Revoked</span>}
              </div>
              {!k.revokedAt && (
                <button
                  onClick={() => handleRevoke(k.id)}
                  className="text-sm text-destructive hover:text-destructive/80 transition-colors"
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

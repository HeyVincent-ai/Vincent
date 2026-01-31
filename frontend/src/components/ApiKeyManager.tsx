import { useEffect, useState } from 'react';
import { listApiKeys, createApiKey, revokeApiKey } from '../api';

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
      load();
    } catch {
      alert('Failed to create API key');
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await revokeApiKey(secretId, keyId);
      load();
    } catch {
      alert('Failed to revoke API key');
    }
  };

  const copyKey = () => {
    if (createdKey) navigator.clipboard.writeText(createdKey);
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">API Keys</h2>
        <button
          onClick={() => { setShowForm(!showForm); setCreatedKey(null); }}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Create API Key'}
        </button>
      </div>

      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-green-800 mb-1">API key created! Copy it now - it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-white px-2 py-1 rounded border flex-1 overflow-x-auto">{createdKey}</code>
            <button onClick={copyKey} className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">Copy</button>
          </div>
        </div>
      )}

      {showForm && !createdKey && (
        <div className="bg-gray-50 border rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
          <div className="flex gap-2">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. My Agent"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button onClick={handleCreate} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700">
              Create
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="text-gray-500 text-sm">No API keys.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="bg-white border rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{k.name}</span>
                <span className="text-xs text-gray-400 ml-2">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                </span>
                {k.revokedAt && <span className="text-xs text-red-500 ml-2">Revoked</span>}
              </div>
              {!k.revokedAt && (
                <button onClick={() => handleRevoke(k.id)} className="text-sm text-red-600 hover:text-red-800">
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

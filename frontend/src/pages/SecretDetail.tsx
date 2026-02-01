import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSecret, deleteSecret } from '../api';
import PolicyManager from '../components/PolicyManager';
import ApiKeyManager from '../components/ApiKeyManager';
import AuditLogViewer from '../components/AuditLogViewer';
import BalancesDisplay from '../components/BalancesDisplay';

interface SecretData {
  id: string;
  type: string;
  memo: string | null;
  walletAddress?: string;
  claimedAt: string | null;
  createdAt: string;
}

export default function SecretDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [secret, setSecret] = useState<SecretData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'policies' | 'apikeys' | 'auditlogs'>('policies');

  useEffect(() => {
    if (!id) return;
    getSecret(id)
      .then((res) => setSecret(res.data.data.secret))
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this secret?')) return;
    try {
      await deleteSecret(id);
      navigate('/dashboard');
    } catch {
      alert('Failed to delete secret');
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!secret) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-blue-600 hover:text-blue-800 mb-2">&larr; Back</button>
          <h1 className="text-2xl font-bold">{secret.memo || 'Unnamed Secret'}</h1>
        </div>
        <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-800 border border-red-200 px-3 py-1 rounded">
          Delete
        </button>
      </div>

      <div className="bg-white rounded-lg border p-6 mb-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Type</dt>
            <dd className="font-medium">{secret.type}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Created</dt>
            <dd className="font-medium">{new Date(secret.createdAt).toLocaleString()}</dd>
          </div>
          {secret.walletAddress && (
            <div className="col-span-2">
              <dt className="text-gray-500">Wallet Address</dt>
              <dd className="font-mono text-sm">{secret.walletAddress}</dd>
            </div>
          )}
          {secret.type === 'EVM_WALLET' && (
            <div className="col-span-2 mt-2">
              <BalancesDisplay secretId={secret.id} />
            </div>
          )}
        </dl>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setTab('policies')}
            className={`pb-2 text-sm font-medium border-b-2 ${tab === 'policies' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Policies
          </button>
          <button
            onClick={() => setTab('apikeys')}
            className={`pb-2 text-sm font-medium border-b-2 ${tab === 'apikeys' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            API Keys
          </button>
          <button
            onClick={() => setTab('auditlogs')}
            className={`pb-2 text-sm font-medium border-b-2 ${tab === 'auditlogs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Audit Logs
          </button>
        </div>
      </div>

      {tab === 'policies' && <PolicyManager secretId={secret.id} />}
      {tab === 'apikeys' && <ApiKeyManager secretId={secret.id} />}
      {tab === 'auditlogs' && <AuditLogViewer secretId={secret.id} />}
    </div>
  );
}

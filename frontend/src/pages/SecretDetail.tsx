import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSecret, deleteSecret, generateRelinkToken, getSubscriptionStatus } from '../api';
import PolicyManager from '../components/PolicyManager';
import ApiKeyManager from '../components/ApiKeyManager';
import AuditLogViewer from '../components/AuditLogViewer';
import BalancesDisplay from '../components/BalancesDisplay';
import TakeOwnership from '../components/TakeOwnership';

interface SecretData {
  id: string;
  type: string;
  memo: string | null;
  walletAddress?: string;
  ethAddress?: string;
  solanaAddress?: string;
  claimedAt: string | null;
  createdAt: string;
}

interface SubscriptionStatusData {
  trial: {
    inTrial: boolean;
    daysRemaining: number;
    endsAt: string;
  };
  subscription: {
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  } | null;
  hasMainnetAccess: boolean;
}

export default function SecretDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [secret, setSecret] = useState<SecretData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'policies' | 'apikeys' | 'auditlogs'>('policies');
  const [relinkToken, setRelinkToken] = useState<string | null>(null);
  const [relinkExpiry, setRelinkExpiry] = useState<string | null>(null);
  const [relinkLoading, setRelinkLoading] = useState(false);
  const [subStatus, setSubStatus] = useState<SubscriptionStatusData | null>(null);

  useEffect(() => {
    if (!id) return;
    getSecret(id)
      .then((res) => setSecret(res.data.data.secret))
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));

    // Load subscription status
    getSubscriptionStatus(id)
      .then((res) => setSubStatus(res.data.data))
      .catch(() => {});
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

  const handleGenerateRelinkToken = async () => {
    if (!id) return;
    setRelinkLoading(true);
    try {
      const res = await generateRelinkToken(id);
      setRelinkToken(res.data.data.relinkToken);
      setRelinkExpiry(new Date(res.data.data.expiresAt).toLocaleTimeString());
    } catch {
      alert('Failed to generate re-link token');
    } finally {
      setRelinkLoading(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!secret) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-blue-600 hover:text-blue-800 mb-2"
          >
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold">{secret.memo || 'Unnamed Secret'}</h1>
        </div>
        <button
          onClick={handleDelete}
          className="text-sm text-red-600 hover:text-red-800 border border-red-200 px-3 py-1 rounded"
        >
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
          {secret.ethAddress && (
            <div className="col-span-2">
              <dt className="text-gray-500">Ethereum Address</dt>
              <dd className="font-mono text-sm">{secret.ethAddress}</dd>
            </div>
          )}
          {secret.solanaAddress && (
            <div className="col-span-2">
              <dt className="text-gray-500">Solana Address</dt>
              <dd className="font-mono text-sm">{secret.solanaAddress}</dd>
            </div>
          )}
          {secret.type === 'EVM_WALLET' && (
            <div className="col-span-2 mt-2">
              <BalancesDisplay secretId={secret.id} />
            </div>
          )}
        </dl>
      </div>

      {/* Mainnet Access Status */}
      {secret.type === 'EVM_WALLET' && subStatus && (
        <div
          className={`rounded-lg border p-4 mb-6 ${
            subStatus.hasMainnetAccess
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3
                className={`font-medium ${
                  subStatus.hasMainnetAccess ? 'text-green-800' : 'text-yellow-800'
                }`}
              >
                Mainnet Access
              </h3>
              {subStatus.trial.inTrial && !subStatus.subscription && (
                <p className="text-sm text-green-700 mt-1">
                  Free trial active —{' '}
                  <span className="font-semibold">
                    {subStatus.trial.daysRemaining} day
                    {subStatus.trial.daysRemaining !== 1 ? 's' : ''}
                  </span>{' '}
                  remaining
                  <span className="text-green-600 ml-1">
                    (ends {new Date(subStatus.trial.endsAt).toLocaleDateString()})
                  </span>
                </p>
              )}
              {subStatus.subscription?.status === 'ACTIVE' && (
                <p className="text-sm text-green-700 mt-1">
                  Subscribed — renews{' '}
                  {subStatus.subscription.currentPeriodEnd
                    ? new Date(subStatus.subscription.currentPeriodEnd).toLocaleDateString()
                    : 'N/A'}
                </p>
              )}
              {!subStatus.hasMainnetAccess && (
                <p className="text-sm text-yellow-700 mt-1">
                  Trial expired. Subscribe to continue making mainnet transactions.
                </p>
              )}
            </div>
            {!subStatus.subscription && (
              <Link
                to="/billing"
                className={`text-sm px-3 py-1.5 rounded font-medium ${
                  subStatus.hasMainnetAccess
                    ? 'text-green-700 bg-green-100 hover:bg-green-200'
                    : 'text-white bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {subStatus.hasMainnetAccess ? 'View Plans' : 'Subscribe Now'}
              </Link>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Testnets are always free. Mainnet requires a subscription ($10/month) after the 3-day
            trial.
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg border p-6 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Re-link Agent</h3>
        <p className="text-xs text-gray-500 mb-3">
          Generate a one-time token to give an agent access to this secret. The token expires in 10
          minutes.
        </p>
        {relinkToken ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <code className="bg-gray-100 px-3 py-2 rounded text-sm font-mono flex-1 break-all">
                {relinkToken}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(relinkToken);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-400">Expires at {relinkExpiry}. One-time use.</p>
          </div>
        ) : (
          <button
            onClick={handleGenerateRelinkToken}
            disabled={relinkLoading}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {relinkLoading ? 'Generating...' : 'Generate Re-link Token'}
          </button>
        )}
      </div>

      {/* Take Ownership - EVM Wallets only */}
      {secret.type === 'EVM_WALLET' && secret.walletAddress && (
        <div className="mb-6">
          <TakeOwnership
            secretId={secret.id}
            walletAddress={secret.walletAddress}
            onOwnershipTransferred={() => {
              // Refresh the page to reflect the new ownership status
              window.location.reload();
            }}
          />
        </div>
      )}

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

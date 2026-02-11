import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSecret, deleteSecret, generateRelinkToken, getSubscriptionStatus } from '../api';
import { useToast } from '../components/Toast';
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

// ── Loading Skeleton ────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div>
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-1.5 text-sm mb-4">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-4 w-3" />
        <div className="skeleton h-4 w-32" />
      </div>
      <div className="flex items-center justify-between mb-6">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-8 w-16 rounded" />
      </div>
      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div><div className="skeleton h-3 w-12 mb-1" /><div className="skeleton h-4 w-24" /></div>
          <div><div className="skeleton h-3 w-16 mb-1" /><div className="skeleton h-4 w-32" /></div>
          <div className="col-span-2"><div className="skeleton h-3 w-24 mb-1" /><div className="skeleton h-4 w-full" /></div>
        </div>
      </div>
      <div className="flex gap-4 border-b border-border mb-6 pb-0">
        <div className="skeleton h-5 w-16 mb-2" />
        <div className="skeleton h-5 w-16 mb-2" />
        <div className="skeleton h-5 w-20 mb-2" />
      </div>
    </div>
  );
}

export default function SecretDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
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

    getSubscriptionStatus(id)
      .then((res) => setSubStatus(res.data.data))
      .catch(() => {});
  }, [id, navigate]);

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this secret?')) return;
    try {
      await deleteSecret(id);
      toast('Secret deleted');
      navigate('/dashboard');
    } catch {
      toast('Failed to delete secret', 'error');
    }
  };

  const handleGenerateRelinkToken = async () => {
    if (!id) return;
    setRelinkLoading(true);
    try {
      const res = await generateRelinkToken(id);
      setRelinkToken(res.data.data.relinkToken);
      setRelinkExpiry(new Date(res.data.data.expiresAt).toLocaleTimeString());
      toast('Re-link token generated');
    } catch {
      toast('Failed to generate re-link token', 'error');
    } finally {
      setRelinkLoading(false);
    }
  };

  if (loading) return <DetailSkeleton />;
  if (!secret) return null;

  const secretName = secret.memo || 'Unnamed Secret';

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-4" aria-label="Breadcrumb">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          Accounts
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium truncate max-w-[200px]">{secretName}</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{secretName}</h1>
        <button
          onClick={handleDelete}
          className="text-sm text-destructive hover:text-destructive/80 border border-destructive/30 px-3 py-1 rounded transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium text-foreground">{secret.type}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium text-foreground">{new Date(secret.createdAt).toLocaleString()}</dd>
          </div>
          {secret.walletAddress && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Wallet Address</dt>
              <dd className="font-mono text-sm text-foreground">{secret.walletAddress}</dd>
            </div>
          )}
          {secret.ethAddress && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Ethereum Address</dt>
              <dd className="font-mono text-sm text-foreground">{secret.ethAddress}</dd>
            </div>
          )}
          {secret.solanaAddress && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Solana Address</dt>
              <dd className="font-mono text-sm text-foreground">{secret.solanaAddress}</dd>
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
              ? 'bg-status-success-muted border-status-success/20'
              : 'bg-status-warning-muted border-status-warning/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3
                className={`font-medium ${
                  subStatus.hasMainnetAccess ? 'text-status-success' : 'text-status-warning'
                }`}
              >
                Mainnet Access
              </h3>
              {subStatus.trial.inTrial && !subStatus.subscription && (
                <p className="text-sm text-status-success mt-1">
                  Free trial active —{' '}
                  <span className="font-semibold">
                    {subStatus.trial.daysRemaining} day
                    {subStatus.trial.daysRemaining !== 1 ? 's' : ''}
                  </span>{' '}
                  remaining
                  <span className="text-status-success/70 ml-1">
                    (ends {new Date(subStatus.trial.endsAt).toLocaleDateString()})
                  </span>
                </p>
              )}
              {subStatus.subscription?.status === 'ACTIVE' && (
                <p className="text-sm text-status-success mt-1">
                  Subscribed — renews{' '}
                  {subStatus.subscription.currentPeriodEnd
                    ? new Date(subStatus.subscription.currentPeriodEnd).toLocaleDateString()
                    : 'N/A'}
                </p>
              )}
              {!subStatus.hasMainnetAccess && (
                <p className="text-sm text-status-warning mt-1">
                  Trial expired. Subscribe to continue making mainnet transactions.
                </p>
              )}
            </div>
            {!subStatus.subscription && (
              <Link
                to="/account"
                className={`text-sm px-3 py-1.5 rounded font-medium transition-colors ${
                  subStatus.hasMainnetAccess
                    ? 'text-status-success bg-status-success-muted hover:bg-status-success/20'
                    : 'text-primary-foreground bg-status-warning hover:bg-status-warning/90'
                }`}
              >
                {subStatus.hasMainnetAccess ? 'View Plans' : 'Subscribe Now'}
              </Link>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Testnets are always free. Mainnet requires a subscription ($10/month) after the 3-day
            trial.
          </p>
        </div>
      )}

      {/* Take Ownership (EVM Wallets only) */}
      {secret.type === 'EVM_WALLET' && secret.walletAddress && (
        <div className="mb-6">
          <TakeOwnership
            secretId={secret.id}
            walletAddress={secret.walletAddress}
            onOwnershipTransferred={() => {
              // Refresh secret data
              getSecret(secret.id)
                .then((res) => setSecret(res.data.data.secret))
                .catch(() => {});
            }}
          />
        </div>
      )}

      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <h3 className="text-sm font-medium text-foreground mb-2">Re-link Agent</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Generate a one-time token to give an agent access to this secret. The token expires in 10
          minutes.
        </p>
        {relinkToken ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <code className="bg-muted px-3 py-2 rounded text-sm font-mono flex-1 break-all text-foreground">
                {relinkToken}
              </code>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(relinkToken);
                    toast('Token copied to clipboard');
                  } catch (error) {
                    console.error('Failed to copy token to clipboard', error);
                    toast('Failed to copy token to clipboard');
                  }
                }}
                className="text-sm text-primary hover:text-primary/80 whitespace-nowrap transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Expires at {relinkExpiry}. One-time use.</p>
          </div>
        ) : (
          <button
            onClick={handleGenerateRelinkToken}
            disabled={relinkLoading}
            className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {relinkLoading ? 'Generating...' : 'Generate Re-link Token'}
          </button>
        )}
      </div>

      <div className="border-b border-border mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setTab('policies')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === 'policies' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Policies
          </button>
          <button
            onClick={() => setTab('apikeys')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === 'apikeys' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            API Keys
          </button>
          <button
            onClick={() => setTab('auditlogs')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === 'auditlogs' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
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

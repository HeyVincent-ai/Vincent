import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSecret, deleteSecret, generateRelinkToken, getSubscriptionStatus } from '../api';
import { useToast } from '../components/Toast';
import PolicyManager from '../components/PolicyManager';
import ApiKeyManager from '../components/ApiKeyManager';
import AuditLogViewer from '../components/AuditLogViewer';
import BalancesDisplay from '../components/BalancesDisplay';
import TakeOwnership from '../components/TakeOwnership';
import DataSourcesView from '../components/DataSourcesView';
import CopyButton from '../components/CopyButton';
import QrModal from '../components/QrModal';
import { ReceiveIcon } from '../components/icons';
import { getAccountTypeConfig } from '../components/accountTypes';
import PolymarketPositions from '../components/PolymarketPositions';

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

type TabId = 'overview' | 'policies' | 'apikeys' | 'auditlogs';

interface TabDef {
  id: TabId;
  label: string;
}

function getTabsForType(type: string): TabDef[] {
  switch (type) {
    case 'EVM_WALLET':
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'policies', label: 'Policies' },
        { id: 'apikeys', label: 'API Keys' },
        { id: 'auditlogs', label: 'Audit Logs' },
      ];
    case 'POLYMARKET_WALLET':
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'policies', label: 'Policies' },
        { id: 'apikeys', label: 'API Keys' },
        { id: 'auditlogs', label: 'Audit Logs' },
      ];
    case 'DATA_SOURCES':
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'apikeys', label: 'API Keys' },
        { id: 'auditlogs', label: 'Audit Logs' },
      ];
    case 'RAW_SIGNER':
    default:
      return [
        { id: 'policies', label: 'Policies' },
        { id: 'apikeys', label: 'API Keys' },
        { id: 'auditlogs', label: 'Audit Logs' },
      ];
  }
}

function truncateAddress(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Loading Skeleton ────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm mb-4">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-4 w-3" />
        <div className="skeleton h-4 w-32" />
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-64 shrink-0 space-y-6">
          <div>
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-5 w-36 mb-1" />
            <div className="skeleton h-3 w-24" />
          </div>
          <div>
            <div className="skeleton h-3 w-16 mb-2" />
            <div className="skeleton h-4 w-full mb-1.5" />
            <div className="skeleton h-4 w-full" />
          </div>
          <div>
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-4 w-32" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 border-b border-border mb-6 pb-0">
            <div className="skeleton h-5 w-16 mb-2" />
            <div className="skeleton h-5 w-16 mb-2" />
            <div className="skeleton h-5 w-20 mb-2" />
          </div>
          <div className="skeleton h-40 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function SecretDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [secret, setSecret] = useState<SecretData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId | null>(null);
  const [relinkToken, setRelinkToken] = useState<string | null>(null);
  const [relinkExpiry, setRelinkExpiry] = useState<string | null>(null);
  const [relinkLoading, setRelinkLoading] = useState(false);
  const [subStatus, setSubStatus] = useState<SubscriptionStatusData | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrAddress, setQrAddress] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    getSecret(id)
      .then((res) => {
        const s = res.data.data.secret;
        setSecret(s);
        const tabs = getTabsForType(s.type);
        setTab(tabs[0].id);
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));

    getSubscriptionStatus(id)
      .then((res) => setSubStatus(res.data.data))
      .catch(() => {});
  }, [id, navigate]);

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this account?')) return;
    try {
      await deleteSecret(id);
      toast('Account deleted');
      navigate('/dashboard');
    } catch {
      toast('Failed to delete account', 'error');
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
  if (!secret || !tab) return null;

  const typeConfig = getAccountTypeConfig(secret.type);
  const Icon = typeConfig.icon;
  const accountName = secret.memo || 'Unnamed Account';
  const tabs = getTabsForType(secret.type);

  const addresses: { label: string; address: string }[] = [];
  if (secret.type === 'POLYMARKET_WALLET') {
    if (secret.walletAddress)
      addresses.push({ label: 'Safe (Polygon)', address: secret.walletAddress });
  } else {
    if (secret.walletAddress)
      addresses.push({ label: 'Smart Account', address: secret.walletAddress });
  }
  if (secret.ethAddress) addresses.push({ label: 'Ethereum', address: secret.ethAddress });
  if (secret.solanaAddress) addresses.push({ label: 'Solana', address: secret.solanaAddress });

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-4" aria-label="Breadcrumb">
        <Link
          to="/dashboard"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Accounts
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium truncate max-w-[200px]">{accountName}</span>
      </nav>

      <div className="flex flex-col md:flex-row gap-6">
        {/* ── Left Sidebar ─────────────────────────────────────────── */}
        <div className="md:w-64 shrink-0 space-y-6">
          {/* Identity */}
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{typeConfig.label}</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground">{accountName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {new Date(secret.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Addresses */}
          {addresses.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Addresses
              </h3>
              <div className="space-y-1.5">
                {addresses.map((a) => (
                  <div key={a.address} className="flex items-center justify-between gap-2 py-1">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{a.label}</div>
                      <code className="text-xs text-foreground/70 font-mono" title={a.address}>
                        {truncateAddress(a.address)}
                      </code>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setShowQr(true);
                          setQrAddress(a.address);
                        }}
                        className="text-muted-foreground/60 hover:text-primary transition-colors p-1"
                        title="Show QR code"
                      >
                        <ReceiveIcon className="w-3.5 h-3.5" />
                      </button>
                      <CopyButton text={a.address} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Access */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Agent Access
            </h3>
            {relinkToken ? (
              <div>
                <code className="bg-muted/50 px-2 py-1.5 rounded text-xs font-mono break-all text-foreground block mb-1">
                  {relinkToken}
                </code>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Expires {relinkExpiry}</p>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(relinkToken);
                        toast('Token copied');
                      } catch {
                        toast('Failed to copy', 'error');
                      }
                    }}
                    className="text-xs text-primary hover:text-primary/80 font-medium transition-colors py-1"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGenerateRelinkToken}
                disabled={relinkLoading}
                className="text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
              >
                {relinkLoading ? 'Generating...' : 'Generate re-link token'}
              </button>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              One-time token for agent access. Expires in 10 min.
            </p>
          </div>

          {/* Danger zone */}
          <div className="pt-4 border-t border-border/50">
            <button
              onClick={handleDelete}
              className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors py-1"
            >
              Delete account
            </button>
          </div>
        </div>

        {/* ── Main Content ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Tab Bar */}
          <div className="border-b border-border mb-6">
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 pb-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {tab === 'overview' && secret.type === 'EVM_WALLET' && (
            <div className="space-y-6">
              <BalancesDisplay secretId={secret.id} />

              {subStatus && (
                <div className="py-4 border-t border-border/50">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-sm text-foreground font-medium">Mainnet Access</p>
                      {subStatus.trial.inTrial && !subStatus.subscription && (
                        <p className="text-xs text-green-400 mt-0.5">
                          Trial active — {subStatus.trial.daysRemaining} day
                          {subStatus.trial.daysRemaining !== 1 ? 's' : ''} remaining
                        </p>
                      )}
                      {subStatus.subscription?.status === 'ACTIVE' && (
                        <p className="text-xs text-green-400 mt-0.5">
                          Subscribed — renews{' '}
                          {subStatus.subscription.currentPeriodEnd
                            ? new Date(subStatus.subscription.currentPeriodEnd).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      )}
                      {!subStatus.hasMainnetAccess && (
                        <p className="text-xs text-yellow-400 mt-0.5">
                          Trial expired. Subscribe to continue mainnet transactions.
                        </p>
                      )}
                    </div>
                    {!subStatus.subscription && (
                      <Link
                        to="/account"
                        className="text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        {subStatus.hasMainnetAccess ? 'View plans' : 'Subscribe'}
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Testnets always free. Mainnet $10/mo after trial.
                  </p>
                </div>
              )}

              {secret.walletAddress && (
                <div className="py-4 border-t border-border/50">
                  <TakeOwnership
                    secretId={secret.id}
                    walletAddress={secret.walletAddress}
                    onOwnershipTransferred={() => {
                      getSecret(secret.id)
                        .then((res) => setSecret(res.data.data.secret))
                        .catch(() => {});
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {tab === 'overview' && secret.type === 'POLYMARKET_WALLET' && secret.walletAddress && (
            <PolymarketPositions walletAddress={secret.walletAddress} secretId={secret.id} />
          )}

          {tab === 'overview' && secret.type === 'DATA_SOURCES' && (
            <DataSourcesView secretId={secret.id} />
          )}

          {tab === 'policies' && <PolicyManager secretId={secret.id} />}
          {tab === 'apikeys' && <ApiKeyManager secretId={secret.id} />}
          {tab === 'auditlogs' && <AuditLogViewer secretId={secret.id} />}
        </div>
      </div>

      {showQr && qrAddress && (
        <QrModal address={qrAddress} label={accountName} onClose={() => setShowQr(false)} />
      )}
    </div>
  );
}

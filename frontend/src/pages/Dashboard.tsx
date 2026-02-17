import { useEffect, useState } from 'react';
import {
  getUserSecrets,
  getOpenClawDeployments,
  deployOpenClaw,
  getSecretBalances,
  getDataSourceCredits,
} from '../api';
import { useToast } from '../components/Toast';
import WelcomeOnboarding from '../components/WelcomeOnboarding';
import AccountTypeGroup from '../components/AccountTypeGroup';
import CreateAccountModal from '../components/CreateAccountModal';
import ApiKeyRevealModal from '../components/ApiKeyRevealModal';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_ORDER } from '../components/accountTypes';
import type { Account } from '../components/AccountCard';

// ── Loading Skeleton ────────────────────────────────────────────────

function AccountCardSkeleton() {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-3 w-16" />
      </div>
      <div className="flex items-center gap-3">
        <div className="skeleton h-4 w-14" />
        <div className="skeleton h-3 w-16" />
      </div>
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deployments, setDeployments] = useState<{ id: string; status: string }[]>([]);
  const [deploymentsLoaded, setDeploymentsLoaded] = useState(false);
  const [deploymentLoadError, setDeploymentLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revealApiKey, setRevealApiKey] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      getUserSecrets()
        .then((res) => setAccounts(res.data.data.secrets))
        .catch(() => {}),
      getOpenClawDeployments()
        .then((res) => {
          setDeployments(res.data.data.deployments);
          setDeploymentsLoaded(true);
          setDeploymentLoadError(null);
        })
        .catch(() => {
          setDeploymentsLoaded(false);
          setDeploymentLoadError('Unable to load deployments. Please refresh to try again.');
        }),
    ]).finally(() => setLoading(false));
  }, []);

  // Fetch balances for all wallet-type accounts after they load
  useEffect(() => {
    if (accounts.length === 0) return;
    accounts.forEach((acct) => {
      if (
        acct.type === 'EVM_WALLET' ||
        acct.type === 'POLYMARKET_WALLET' ||
        acct.type === 'RAW_SIGNER'
      ) {
        getSecretBalances(acct.id)
          .then((res) => {
            const tokens = res.data.data?.tokens || res.data.data || [];
            const total = Array.isArray(tokens)
              ? tokens.reduce(
                  (sum: number, t: { value?: number | null }) => sum + (t.value || 0),
                  0
                )
              : 0;
            setAccounts((prev) =>
              prev.map((a) => (a.id === acct.id ? { ...a, totalBalance: total } : a))
            );
          })
          .catch(() => {});
      } else if (acct.type === 'DATA_SOURCES') {
        getDataSourceCredits(acct.id)
          .then((res) => {
            const balance = res.data.data?.balance ?? res.data.data?.remainingCredits ?? 0;
            setAccounts((prev) =>
              prev.map((a) => (a.id === acct.id ? { ...a, totalBalance: balance } : a))
            );
          })
          .catch(() => {});
      }
    });
  }, [accounts.length]); // only re-run when count changes, not on every balance update

  const loadAccounts = () => {
    getUserSecrets()
      .then((res) => setAccounts(res.data.data.secrets))
      .catch(() => {});
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployError(null);
    try {
      const currentUrl = window.location.origin + '/agents';
      const res = await deployOpenClaw(
        `${currentUrl}?openclaw_deploy=success`,
        `${currentUrl}?openclaw_deploy=canceled`
      );
      const { checkoutUrl } = res.data.data;
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      setDeployError(msg || 'Failed to start deployment');
      setDeploying(false);
    }
  };

  const handleCreated = (apiKey: string) => {
    setShowCreate(false);
    setRevealApiKey(apiKey);
    toast('Account created successfully');
    loadAccounts();
  };

  // Group accounts by type, preserving defined order
  const activeGroups = ACCOUNT_TYPE_ORDER.map((type) => ({
    type,
    config: ACCOUNT_TYPES[type],
    accounts: accounts.filter((a) => a.type === type),
  })).filter((g) => g.accounts.length > 0);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-9 w-32 rounded-lg" />
        </div>
        <div className="grid gap-4">
          <AccountCardSkeleton />
          <AccountCardSkeleton />
        </div>
      </div>
    );
  }

  const hasDeployments = deployments.some((d) => d.status !== 'DESTROYED');
  const hasAccounts = accounts.length > 0;

  if (!showCreate && deploymentsLoaded && !hasDeployments && !hasAccounts) {
    return (
      <WelcomeOnboarding
        onDeploy={handleDeploy}
        deploying={deploying}
        error={deployError}
        onCreateSecret={() => setShowCreate(true)}
      />
    );
  }

  // Calculate overview metrics
  const dataSourcesCount = accounts.filter((a) => a.type === 'DATA_SOURCES').length;
  const totalAssets = accounts
    .filter(
      (a) =>
        a.type === 'EVM_WALLET' ||
        a.type === 'POLYMARKET_WALLET' ||
        a.type === 'RAW_SIGNER'
    )
    .reduce((sum, a) => sum + (a.totalBalance || 0), 0);
  const totalAccounts = accounts.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          + New Account
        </button>
      </div>

      {/* Overview Section */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Data Sources</p>
                <p className="text-2xl font-bold text-foreground">{dataSourcesCount}</p>
              </div>
              <svg
                className="w-10 h-10 text-primary/20"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                />
              </svg>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Assets</p>
                <p className="text-2xl font-bold text-foreground">
                  ${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <svg
                className="w-10 h-10 text-primary/20"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Connected Accounts</p>
                <p className="text-2xl font-bold text-foreground">{totalAccounts}</p>
              </div>
              <svg
                className="w-10 h-10 text-primary/20"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      {deploymentLoadError && !hasAccounts && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {deploymentLoadError}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-10 text-center">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40"
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
          <p className="text-foreground font-medium mb-1">No accounts yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first account to get started.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            + New Account
          </button>
        </div>
      ) : (
        <div>
          {activeGroups.map((group) => (
            <AccountTypeGroup
              key={group.type}
              label={group.config.pluralLabel}
              icon={group.config.icon}
              accounts={group.accounts}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAccountModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      {revealApiKey && (
        <ApiKeyRevealModal apiKey={revealApiKey} onDone={() => setRevealApiKey(null)} />
      )}
    </div>
  );
}

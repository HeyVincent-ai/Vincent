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
import QrModal from '../components/QrModal';
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
  const [receiveAccount, setReceiveAccount] = useState<Account | null>(null);
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
        <div className="bg-card rounded-lg border border-border px-4 py-3 mb-6">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Total Assets
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-semibold text-foreground font-mono">
                  ${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {/* TODO: Wire up to real 24h change data */}
                {/* <span className="text-xs text-green-400">+2.3%</span> */}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Total Accounts
              </p>
              <p className="text-sm text-foreground font-mono">{totalAccounts}</p>
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
              onReceive={setReceiveAccount}
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

      {receiveAccount && (
        <QrModal
          address={receiveAccount.walletAddress || receiveAccount.ethAddress || ''}
          label={receiveAccount.memo || 'Unnamed account'}
          onClose={() => setReceiveAccount(null)}
        />
      )}
    </div>
  );
}

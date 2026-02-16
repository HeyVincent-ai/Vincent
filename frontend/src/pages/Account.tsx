import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  updateTelegram,
  generateTelegramLink,
  getSubscription,
  subscribe,
  cancelSubscription,
  getOpenClawDeployments,
  getOpenClawUsage,
  getReferral,
} from '../api';
import { copyToClipboard } from '../utils/format';

interface Subscription {
  id: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
}

interface Deployment {
  id: string;
  status: string;
  statusMessage: string | null;
  hostname: string | null;
  ipAddress: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  creditBalanceUsd: number | string | null;
  lastKnownUsageUsd: number | string | null;
  createdAt: string;
  readyAt: string | null;
}

interface UsageData {
  creditBalanceUsd: number;
  totalUsageUsd: number;
  remainingUsd: number;
  usageDailyUsd: number;
  usageMonthlyUsd: number;
  lastPolledAt: string | null;
}

export default function Account() {
  const { user, refreshUser } = useAuth();

  // --- Settings state ---
  const [tgUsername, setTgUsername] = useState(user?.telegramUsername || '');
  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // --- Billing state ---
  const [sub, setSub] = useState<Subscription | null>(null);
  const [hasSub, setHasSub] = useState(false);
  const [billingLoading, setBillingLoading] = useState(true);

  // --- Agent deployments state ---
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [usageMap, setUsageMap] = useState<Record<string, UsageData>>({});

  // --- Referral state ---
  const [referralLink, setReferralLink] = useState('');
  const [referralStats, setReferralStats] = useState<{
    totalReferred: number;
    totalEarnedUsd: number;
    pendingRewards: number;
  } | null>(null);
  const [refCopied, setRefCopied] = useState(false);

  useEffect(() => {
    getSubscription()
      .then((subRes) => {
        setHasSub(subRes.data.data.hasSubscription);
        setSub(subRes.data.data.subscription);
      })
      .catch(() => {})
      .finally(() => setBillingLoading(false));

    getOpenClawDeployments()
      .then((res) => {
        const deps: Deployment[] = res.data.data.deployments;
        setDeployments(deps);

        // Fetch usage for each active deployment
        const active = deps.filter((d) => ['READY', 'CANCELING'].includes(d.status));
        active.forEach((d) => {
          getOpenClawUsage(d.id)
            .then((r) => {
              setUsageMap((prev) => ({ ...prev, [d.id]: r.data.data }));
            })
            .catch(() => {});
        });
      })
      .catch(() => {})
      .finally(() => setDeploymentsLoading(false));

    getReferral()
      .then((res) => {
        setReferralLink(res.data.data.referralLink);
        setReferralStats(res.data.data.stats);
      })
      .catch(() => {});
  }, []);

  const handleSaveTelegram = async () => {
    if (!tgUsername.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      await updateTelegram(tgUsername.trim());
      await refreshUser();
      setLinkingCode(null);
      setMessage('Telegram username updated.');
    } catch {
      setMessage('Failed to update Telegram username.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLink = async () => {
    try {
      const res = await generateTelegramLink();
      setLinkingCode(res.data.data.linkingCode);
      setBotUsername(res.data.data.botUsername);
    } catch {
      setMessage('Failed to generate linking code.');
    }
  };

  const handleSubscribe = async () => {
    try {
      const res = await subscribe(
        `${window.location.origin}/account?success=1`,
        `${window.location.origin}/account?canceled=1`
      );
      window.location.href = res.data.data.checkoutUrl;
    } catch {
      alert('Failed to start checkout');
    }
  };

  const handleCancel = async () => {
    if (
      !confirm(
        'Cancel your subscription? You will lose mainnet access at the end of the billing period.'
      )
    )
      return;
    try {
      await cancelSubscription();
      const subRes = await getSubscription();
      setHasSub(subRes.data.data.hasSubscription);
      setSub(subRes.data.data.subscription);
    } catch {
      alert('Failed to cancel subscription');
    }
  };

  const activeDeployments = deployments.filter((d) => ['READY', 'CANCELING'].includes(d.status));

  const isTrialPeriod = (d: Deployment) => {
    if (!d.currentPeriodEnd) return false;
    const end = new Date(d.currentPeriodEnd);
    return end > new Date() && end.getTime() - Date.now() < 8 * 24 * 60 * 60 * 1000;
  };

  const hasAnySubscription = hasSub || activeDeployments.length > 0;
  const loading = billingLoading || deploymentsLoading;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-8">Account</h1>

      {/* Settings Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Telegram Notifications</h2>
        <div className="bg-card rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Telegram account to receive approval requests when your agents need
            authorization to perform actions.
          </p>

          {message && (
            <div className="bg-primary/10 text-primary p-3 rounded mb-4 text-sm">{message}</div>
          )}

          <label className="block text-sm font-medium text-foreground mb-1">
            Telegram Username
          </label>
          <div className="flex gap-2 mb-4">
            <input
              value={tgUsername}
              onChange={(e) => setTgUsername(e.target.value)}
              placeholder="@yourusername"
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleSaveTelegram}
              disabled={saving}
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Save
            </button>
          </div>

          <div className="text-sm text-muted-foreground mb-4">
            <p>
              Status:{' '}
              {user?.telegramLinked ? (
                <span className="text-green-400 font-medium">Connected</span>
              ) : (
                <span className="text-yellow-400 font-medium">Not linked</span>
              )}
            </p>
          </div>

          {user?.telegramUsername && !user.telegramLinked && (
            <div>
              <div className="bg-muted border border-border rounded p-4 mb-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">How to connect</h3>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                  <li>Click "Generate Linking Code" below</li>
                  <li>
                    Open Telegram and search for{' '}
                    <strong className="text-foreground">{botUsername || 'the Vincent bot'}</strong>
                    {botUsername && (
                      <>
                        {' '}
                        &mdash;{' '}
                        <a
                          href={`https://t.me/${botUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          t.me/{botUsername}
                        </a>
                      </>
                    )}
                  </li>
                  <li>Send the bot the linking command shown below</li>
                </ol>
              </div>

              <button
                onClick={handleGenerateLink}
                className="text-sm bg-muted text-foreground px-4 py-2 rounded hover:bg-surface-hover border border-border transition-colors"
              >
                Generate Linking Code
              </button>
              {linkingCode && (
                <div className="mt-3 bg-muted border border-border rounded p-3 text-sm">
                  <p className="font-medium text-foreground mb-1">Send this message to the bot:</p>
                  <code className="bg-background px-2 py-1 rounded border border-border text-sm text-foreground">
                    /start {linkingCode}
                  </code>
                  <p className="text-xs text-muted-foreground mt-1">Expires in 10 minutes.</p>
                </div>
              )}
            </div>
          )}

          {user?.telegramLinked && (
            <div className="bg-green-500/10 border border-green-500/20 rounded p-3 text-sm text-green-400">
              Your Telegram account is connected. You will receive approval requests via Telegram.
            </div>
          )}
        </div>
      </section>

      {/* Refer a Friend Section */}
      {referralLink && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Refer a Friend</h2>
          <div className="bg-card rounded-lg border border-border p-6">
            <p className="text-sm text-muted-foreground mb-4">
              Share your referral link. When someone signs up and makes their first payment, you get
              $10 in LLM credits.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                readOnly
                value={referralLink}
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground font-mono focus:outline-none"
              />
              <button
                onClick={async () => {
                  await copyToClipboard(referralLink);
                  setRefCopied(true);
                  setTimeout(() => setRefCopied(false), 2000);
                }}
                className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors"
              >
                {refCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {referralStats && (
              <div className="flex gap-6 text-sm text-muted-foreground">
                <span>{referralStats.totalReferred} referred</span>
                <span>${referralStats.totalEarnedUsd} earned</span>
                {referralStats.pendingRewards > 0 && (
                  <span className="text-yellow-400">{referralStats.pendingRewards} pending</span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Billing Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Billing</h2>

        {/* Active Subscriptions */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <h3 className="text-base font-semibold text-foreground mb-4">Active Subscriptions</h3>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : !hasAnySubscription ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">No active subscriptions.</p>

              {/* Wallet subscribe CTA */}
              <div className="border border-border rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Agent Wallet</p>
                    <p className="text-xs text-muted-foreground">
                      Unlimited mainnet transactions &middot; Gas fees included
                    </p>
                  </div>
                  <button
                    onClick={handleSubscribe}
                    className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors"
                  >
                    Subscribe &mdash; $10/mo
                  </button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Deploy an agent from the{' '}
                <Link to="/dashboard" className="text-primary hover:underline">
                  Dashboard
                </Link>{' '}
                to add agent subscriptions.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Agent Wallet row */}
              {hasSub && sub ? (
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-foreground">Agent Wallet</p>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${sub.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}
                      >
                        {sub.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">$10/mo</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-muted-foreground">
                      {sub.canceledAt ? (
                        <span className="text-destructive">Cancels at period end</span>
                      ) : sub.currentPeriodEnd ? (
                        <span>Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</span>
                      ) : null}
                    </div>
                    {!sub.canceledAt && (
                      <button
                        onClick={handleCancel}
                        className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Agent Wallet</p>
                      <p className="text-xs text-muted-foreground">
                        Unlimited mainnet transactions &middot; Gas fees included
                      </p>
                    </div>
                    <button
                      onClick={handleSubscribe}
                      className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors"
                    >
                      Subscribe &mdash; $10/mo
                    </button>
                  </div>
                </div>
              )}

              {/* Agent deployment rows */}
              {activeDeployments.map((d) => {
                const trial = isTrialPeriod(d);
                return (
                  <Link
                    key={d.id}
                    to={`/openclaw/${d.id}`}
                    className="block border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-medium text-foreground">
                          Agent
                          {d.hostname && (
                            <span className="text-muted-foreground font-normal ml-2 font-mono text-xs">
                              {d.hostname}
                            </span>
                          )}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${d.status === 'READY' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'}`}
                        >
                          {d.status}
                        </span>
                        {trial && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                            trial
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">$25/mo</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-muted-foreground">
                        {d.canceledAt || d.status === 'CANCELING' ? (
                          <span className="text-orange-400">
                            Active until{' '}
                            {d.currentPeriodEnd
                              ? new Date(d.currentPeriodEnd).toLocaleDateString()
                              : 'period end'}
                          </span>
                        ) : trial && d.currentPeriodEnd ? (
                          <span>
                            Trial ends {new Date(d.currentPeriodEnd).toLocaleDateString()}
                          </span>
                        ) : d.currentPeriodEnd ? (
                          <span>Renews {new Date(d.currentPeriodEnd).toLocaleDateString()}</span>
                        ) : null}
                      </div>
                      <span className="text-xs text-primary">Manage &rarr;</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* LLM Credits (only if user has active agent deployments) */}
        {activeDeployments.length > 0 && (
          <div className="bg-card rounded-lg border border-border p-6 mb-6">
            <h3 className="text-base font-semibold text-foreground mb-4">LLM Credits</h3>
            <div className="space-y-4">
              {activeDeployments.map((d) => {
                const usage = usageMap[d.id];
                // Fall back to inline credit data from the deployments list
                const balance = usage ? usage.creditBalanceUsd : Number(d.creditBalanceUsd || 0);
                const used = usage ? usage.totalUsageUsd : Number(d.lastKnownUsageUsd || 0);
                const remaining = Math.max(0, balance - used);

                return (
                  <div key={d.id} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-foreground">
                        {d.hostname ? (
                          <span className="font-mono text-xs">{d.hostname}</span>
                        ) : (
                          <>Agent {d.id.slice(-8)}</>
                        )}
                      </p>
                      <Link
                        to={`/openclaw/${d.id}`}
                        className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors"
                      >
                        Add Credits
                      </Link>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full ${remaining <= 0 ? 'bg-destructive' : remaining < 5 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{
                          width: balance > 0 ? `${Math.min(100, (used / balance) * 100)}%` : '0%',
                        }}
                      />
                    </div>

                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Used: ${used.toFixed(2)}</span>
                      <span>
                        ${remaining.toFixed(2)} remaining of ${balance.toFixed(2)}
                      </span>
                    </div>

                    {usage && (usage.usageDailyUsd > 0 || usage.usageMonthlyUsd > 0) && (
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Today: ${usage.usageDailyUsd.toFixed(2)}</span>
                        <span>This month: ${usage.usageMonthlyUsd.toFixed(2)}</span>
                      </div>
                    )}

                    {remaining <= 0 && (
                      <p className="text-xs text-destructive mt-2 font-medium">
                        Credits exhausted &mdash; add more to continue using LLM features.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary note */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-base font-semibold text-foreground mb-2">What&apos;s Included</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>
              &bull; <strong className="text-foreground">Free:</strong> Unlimited testnet
              transactions, wallet management
            </li>
            <li>
              &bull; <strong className="text-foreground">Agent Wallet ($10/mo):</strong> Unlimited
              mainnet transactions, gas fees included
            </li>
            <li>
              &bull; <strong className="text-foreground">Agent Deployment ($25/mo):</strong>{' '}
              Dedicated AI agent server, 7-day free trial
            </li>
            <li>
              &bull; <strong className="text-foreground">LLM Credits:</strong> Pay-as-you-go credits
              for agent AI usage
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            New wallets include a 3-day free trial for mainnet transactions. Agent deployments
            include a 7-day free trial.
          </p>
        </div>
      </section>
    </div>
  );
}

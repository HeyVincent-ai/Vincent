import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { updateTelegram, generateTelegramLink, getSubscription, subscribe, cancelSubscription } from '../api';

interface Subscription {
  id: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
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

  useEffect(() => {
    getSubscription()
      .then((subRes) => {
        setHasSub(subRes.data.data.hasSubscription);
        setSub(subRes.data.data.subscription);
      })
      .catch(() => {})
      .finally(() => setBillingLoading(false));
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
    if (!confirm('Cancel your subscription? You will lose mainnet access at the end of the billing period.')) return;
    try {
      await cancelSubscription();
      const subRes = await getSubscription();
      setHasSub(subRes.data.data.hasSubscription);
      setSub(subRes.data.data.subscription);
    } catch {
      alert('Failed to cancel subscription');
    }
  };

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

          <label className="block text-sm font-medium text-foreground mb-1">Telegram Username</label>
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
                    Open Telegram and search for <strong className="text-foreground">{botUsername || 'the Vincent bot'}</strong>
                    {botUsername && (
                      <>
                        {' '}&mdash;{' '}
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

      {/* Billing Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Billing</h2>

        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <h3 className="text-base font-semibold text-foreground mb-3">Subscription</h3>
          {billingLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : hasSub && sub ? (
            <div>
              <p className="text-sm text-foreground">
                Status:{' '}
                <span className={`font-medium ${sub.status === 'ACTIVE' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {sub.status}
                </span>
              </p>
              {sub.currentPeriodEnd && (
                <p className="text-sm text-muted-foreground">
                  Current period ends: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              {sub.canceledAt && <p className="text-sm text-destructive">Cancels at period end</p>}
              <p className="text-sm text-green-400 mt-2">Unlimited mainnet transactions included</p>
              {!sub.canceledAt && (
                <button
                  onClick={handleCancel}
                  className="mt-3 text-sm text-destructive hover:text-destructive/80 border border-destructive/30 px-3 py-1 rounded transition-colors"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                No active subscription. Subscribe for mainnet access ($10/month).
              </p>
              <ul className="text-sm text-muted-foreground mb-4 list-disc list-inside">
                <li>Unlimited mainnet transactions</li>
                <li>Gas fees included</li>
                <li>All supported chains</li>
              </ul>
              <button
                onClick={handleSubscribe}
                className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors"
              >
                Subscribe - $10/month
              </button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-base font-semibold text-foreground mb-3">Plan Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Free Tier</p>
              <p className="font-medium text-foreground">Unlimited testnet transactions</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pro ($10/month)</p>
              <p className="font-medium text-foreground">Unlimited mainnet transactions</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            New wallets include a 3-day free trial for mainnet transactions.
          </p>
        </div>
      </section>
    </div>
  );
}

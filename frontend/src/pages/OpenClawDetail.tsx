import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  getOpenClawDeployment,
  cancelOpenClawDeployment,
  destroyOpenClawDeployment,
  restartOpenClawDeployment,
  retryOpenClawDeployment,

  downloadOpenClawSshKey,
  getOpenClawUsage,
  addOpenClawCredits,
  getOpenClawChannels,
  setupOpenClawTelegram,
  pairOpenClawTelegram,
} from '../api';

interface Deployment {
  id: string;
  status: string;
  statusMessage: string | null;
  ipAddress: string | null;
  hostname: string | null;
  accessToken: string | null;
  ovhServiceName: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
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

const STATUS_COLORS: Record<string, string> = {
  READY: 'bg-status-success-muted text-status-success',
  PENDING_PAYMENT: 'bg-status-warning-muted text-status-warning',
  PENDING: 'bg-status-warning-muted text-status-warning',
  ORDERING: 'bg-status-warning-muted text-status-warning',
  PROVISIONING: 'bg-primary/10 text-primary',
  INSTALLING: 'bg-primary/10 text-primary',
  CANCELING: 'bg-status-caution-muted text-status-caution',
  ERROR: 'bg-destructive/10 text-destructive',
  DESTROYING: 'bg-muted text-muted-foreground',
  DESTROYED: 'bg-muted text-muted-foreground',
};

const PROGRESS_STEPS = [
  { statuses: ['PENDING_PAYMENT'], label: 'Completing payment...' },
  { statuses: ['PENDING', 'ORDERING'], label: 'Provisioning server...' },
  { statuses: ['PROVISIONING'], label: 'Setting up server...' },
  { statuses: ['INSTALLING'], label: 'Installing agent...' },
  { statuses: ['READY'], label: 'Ready!' },
];

function stepIndex(status: string): number {
  const idx = PROGRESS_STEPS.findIndex((s) => s.statuses.includes(status));
  return idx === -1 ? -1 : idx;
}

export default function OpenClawDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState('10');
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [showDevModal, setShowDevModal] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState<boolean | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [telegramStep, setTelegramStep] = useState<1 | 2>(1);
  const [botToken, setBotToken] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [gatewayRestarting, setGatewayRestarting] = useState(false);

  const { toast } = useToast();

  const load = useCallback(() => {
    if (!id) return;
    getOpenClawDeployment(id)
      .then((res) => {
        setDeployment(res.data.data.deployment);
        setError(null);
      })
      .catch(() => setError('Failed to load deployment'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while in progress
  useEffect(() => {
    if (!deployment) return;
    const inProgress = [
      'PENDING_PAYMENT',
      'PENDING',
      'ORDERING',
      'PROVISIONING',
      'INSTALLING',
    ].includes(deployment.status);
    if (!inProgress) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [deployment, load]);

  // Fetch usage when deployment is active
  useEffect(() => {
    if (!id || !deployment) return;
    if (!['READY', 'CANCELING'].includes(deployment.status)) return;
    getOpenClawUsage(id)
      .then((res) => setUsage(res.data.data))
      .catch(() => {});
  }, [id, deployment?.status]);

  // Check Telegram channel status when deployment is active
  useEffect(() => {
    if (!id || !deployment) return;
    if (!['READY', 'CANCELING'].includes(deployment.status)) return;
    getOpenClawChannels(id)
      .then((res) => setTelegramConfigured(res.data.data.telegram.configured))
      .catch(() => setTelegramConfigured(false));
  }, [id, deployment?.status]);

  // Auto-pop Telegram modal on first visit to this deployment
  useEffect(() => {
    if (!id || telegramConfigured === null || telegramConfigured) return;
    const key = `telegram-modal-shown-${id}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setShowTelegramModal(true);
    }
  }, [id, telegramConfigured]);

  const handleAddCredits = async () => {
    if (!id) return;
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount < 5 || amount > 500) {
      setCreditError('Amount must be between $5 and $500');
      return;
    }
    setCreditLoading(true);
    setCreditError(null);
    try {
      const res = await addOpenClawCredits(id, amount);
      const data = res.data.data;
      if (data.requiresAction) {
        setCreditError('3D Secure required — please complete authentication in the popup.');
      } else {
        setShowCreditsModal(false);
        setCreditAmount('10');
        getOpenClawUsage(id)
          .then((r) => setUsage(r.data.data))
          .catch(() => {});
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      setCreditError(msg || 'Failed to add credits');
    } finally {
      setCreditLoading(false);
    }
  };

  const handleTelegramSetup = async () => {
    if (!id || !botToken.trim()) return;
    setTelegramLoading(true);
    setTelegramError(null);
    try {
      await setupOpenClawTelegram(id, botToken.trim());
      setGatewayRestarting(true);
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          await getOpenClawChannels(id);
          clearInterval(poll);
          setGatewayRestarting(false);
          setTelegramStep(2);
          setTelegramLoading(false);
        } catch {
          if (attempts >= 20) {
            clearInterval(poll);
            setGatewayRestarting(false);
            setTelegramStep(2);
            setTelegramLoading(false);
          }
        }
      }, 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      setTelegramError(msg || 'Failed to configure Telegram bot');
      setTelegramLoading(false);
    }
  };

  const handleTelegramPair = async () => {
    if (!id || !pairingCode.trim()) return;
    setTelegramLoading(true);
    setTelegramError(null);
    try {
      await pairOpenClawTelegram(id, pairingCode.trim());
      setTelegramConfigured(true);
      setShowTelegramModal(false);
      setTelegramStep(1);
      setBotToken('');
      setPairingCode('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      setTelegramError(msg || 'Failed to approve pairing code');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!id) return;
    setActionLoading('restart');
    try {
      await restartOpenClawDeployment(id);
      toast('Agent restarting');
      load();
    } catch {
      toast('Failed to restart', 'error');
    } finally {
      setActionLoading(null);
    }
  };


  const handleDownloadSshKey = async () => {
    if (!id) return;
    try {
      const res = await downloadOpenClawSshKey(id);
      const blob = new Blob([res.data], { type: 'application/x-pem-file' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `openclaw-${id.slice(-8)}.pem`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download SSH key');
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActionLoading('cancel');
    try {
      await cancelOpenClawDeployment(id);
      load();
    } catch {
      setError('Failed to cancel subscription');
    } finally {
      setActionLoading(null);
      setShowCancelConfirm(false);
    }
  };

  const handleDestroy = async () => {
    if (!id) return;
    setActionLoading('destroy');
    try {
      await destroyOpenClawDeployment(id);
      navigate('/dashboard');
    } catch {
      setError('Failed to destroy deployment');
    } finally {
      setActionLoading(null);
      setShowDestroyConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading deployment...
      </div>
    );
  }

  if (error && !deployment) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
        {error}
        <button
          onClick={() => navigate('/dashboard')}
          className="ml-3 text-destructive hover:text-destructive/80 font-medium underline"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!deployment) return null;

  const isInProgress = [
    'PENDING_PAYMENT',
    'PENDING',
    'ORDERING',
    'PROVISIONING',
    'INSTALLING',
  ].includes(deployment.status);
  const currentStep = stepIndex(deployment.status);
  const isActive = deployment.status === 'READY' || deployment.status === 'CANCELING';
  const iframeUrl =
    deployment.accessToken && deployment.hostname
      ? `https://${deployment.hostname}?token=${deployment.accessToken}`
      : null;

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-4" aria-label="Breadcrumb">
        <Link to="/agents" className="text-muted-foreground hover:text-foreground transition-colors">
          Agents
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium">Agent</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Agent</h1>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[deployment.status] || 'bg-muted text-muted-foreground'}`}
          >
            {deployment.status}
          </span>
        </div>
        {isActive && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              disabled={actionLoading === 'restart'}
              className="text-sm border border-border px-3 py-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50 text-foreground"
            >
              {actionLoading === 'restart' ? 'Restarting...' : 'Restart'}
            </button>
            {deployment.ipAddress && (
              <button
                onClick={() => setShowDevModal(true)}
                className="text-sm border border-border px-3 py-1.5 rounded hover:bg-muted transition-colors text-foreground"
              >
                Advanced
              </button>
            )}
            {deployment.status === 'READY' && deployment.stripeSubscriptionId && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-sm border border-orange-500/30 text-orange-400 px-3 py-1.5 rounded hover:bg-orange-500/10 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => setShowDestroyConfirm(true)}
              className="text-sm border border-destructive/30 text-destructive px-3 py-1.5 rounded hover:bg-destructive/10 transition-colors"
            >
              {deployment.status === 'CANCELING' ? 'Destroy Now' : 'Destroy'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {/* Cancel confirmation */}
      {showCancelConfirm && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-orange-400 font-medium mb-2">Cancel your subscription?</p>
          <p className="text-sm text-orange-300/70 mb-3">
            Your instance will remain active until the end of your billing period
            {deployment.currentPeriodEnd &&
              ` (${new Date(deployment.currentPeriodEnd).toLocaleDateString()})`}
            . After that, it will be automatically destroyed.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={actionLoading === 'cancel'}
              className="text-sm bg-orange-600 text-white px-4 py-1.5 rounded hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'cancel' ? 'Canceling...' : 'Yes, cancel subscription'}
            </button>
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="text-sm text-muted-foreground px-3 py-1.5 hover:text-foreground transition-colors"
            >
              Keep subscription
            </button>
          </div>
        </div>
      )}

      {/* Destroy confirmation */}
      {showDestroyConfirm && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-destructive font-medium mb-2">
            Are you sure you want to destroy this instance?
          </p>
          <p className="text-sm text-destructive/70 mb-3">
            This will immediately terminate your agent, cancel your subscription, and revoke the API
            key. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDestroy}
              disabled={actionLoading === 'destroy'}
              className="text-sm bg-destructive text-destructive-foreground px-4 py-1.5 rounded hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'destroy' ? 'Destroying...' : 'Yes, destroy it'}
            </button>
            <button
              onClick={() => setShowDestroyConfirm(false)}
              className="text-sm text-muted-foreground px-3 py-1.5 hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Canceling banner */}
      {deployment.status === 'CANCELING' && deployment.currentPeriodEnd && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 mb-4 text-sm text-orange-400">
          Subscription canceled. Instance active until{' '}
          {new Date(deployment.currentPeriodEnd).toLocaleDateString()}.
        </div>
      )}

      {/* Info bar */}
      <div className="bg-card rounded-lg border border-border p-3 mb-4 flex items-center gap-4 text-sm text-muted-foreground">
        {deployment.hostname && (
          <span>
            Host: <code className="font-mono text-foreground">{deployment.hostname}</code>
          </span>
        )}
        {deployment.ipAddress && (
          <span>
            IP: <code className="font-mono text-foreground">{deployment.ipAddress}</code>
          </span>
        )}
        <span>Created: {new Date(deployment.createdAt).toLocaleString()}</span>
        {deployment.readyAt && <span>Ready: {new Date(deployment.readyAt).toLocaleString()}</span>}
      </div>

      {/* Usage card + channels tip (when active) */}
      {isActive && usage && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-foreground">LLM Credits</h3>
              <button
                onClick={() => setShowCreditsModal(true)}
                className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors"
              >
                Add Credits
              </button>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 mb-2">
              <div
                className={`h-2.5 rounded-full ${usage.remainingUsd <= 0 ? 'bg-destructive' : usage.remainingUsd < 5 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{
                  width: `${Math.min(100, (usage.totalUsageUsd / usage.creditBalanceUsd) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Used: ${usage.totalUsageUsd.toFixed(2)}</span>
              <span>
                ${usage.remainingUsd.toFixed(2)} remaining of ${usage.creditBalanceUsd.toFixed(2)}
              </span>
            </div>
            {(usage.usageDailyUsd > 0 || usage.usageMonthlyUsd > 0) && (
              <div className="flex gap-4 mt-2 text-xs text-text-dim">
                <span>Today: ${usage.usageDailyUsd.toFixed(2)}</span>
                <span>This month: ${usage.usageMonthlyUsd.toFixed(2)}</span>
              </div>
            )}
            {usage.remainingUsd <= 0 && (
              <p className="text-xs text-destructive mt-2 font-medium">
                Credits exhausted — add more to continue using LLM features.
              </p>
            )}
          </div>
          {telegramConfigured ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-green-400">
                Telegram is connected. Message your bot to chat with your agent.
              </p>
            </div>
          ) : (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
              <p className="text-sm text-primary">
                Connect Telegram to chat with your agent from your phone.
              </p>
              <button
                onClick={() => {
                  setTelegramStep(1);
                  setTelegramError(null);
                  setShowTelegramModal(true);
                }}
                className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors flex-shrink-0 ml-3"
              >
                Set up Telegram
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Credits Modal */}
      {showCreditsModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowCreditsModal(false)}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">Add LLM Credits</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Credits will be charged to your card on file. Minimum $5, maximum $500.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-muted-foreground">$</span>
              <input
                type="number"
                min="5"
                max="500"
                step="5"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="bg-background border border-border rounded px-3 py-2 w-full text-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="10"
              />
            </div>
            {creditError && <p className="text-sm text-destructive mb-3">{creditError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCreditsModal(false);
                  setCreditError(null);
                }}
                className="text-sm text-muted-foreground px-4 py-2 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCredits}
                disabled={creditLoading}
                className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {creditLoading ? 'Charging...' : `Add $${parseFloat(creditAmount) || 0} Credits`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Telegram Setup Modal */}
      {showTelegramModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => {
            if (!telegramLoading) {
              setShowTelegramModal(false);
              setTelegramError(null);
            }
          }}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground mb-1">Set up Telegram</h3>
            <p className="text-xs text-muted-foreground mb-4">Step {telegramStep} of 2</p>

            {telegramStep === 1 && (
              <>
                <ol className="text-sm text-muted-foreground mb-3 list-decimal list-inside space-y-1">
                  <li>Open Telegram and go to{' '}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 underline"
                    >
                      @BotFather
                    </a>.
                  </li>
                  <li>Start a chat and type <code className="bg-muted px-1 rounded text-xs">/newbot</code>.</li>
                  <li>Follow the prompts to name your bot and choose a username.</li>
                  <li>BotFather will send you a message with your bot token. Copy the entire token (it looks like a long string of numbers and letters).</li>
                  <li>Paste the token below and click <strong>Configure Bot</strong>.</li>
                </ol>
                <input
                  type="text"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  className="bg-background border border-border rounded px-3 py-2 w-full text-sm font-mono text-foreground placeholder:text-muted-foreground mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={telegramLoading}
                />
                {gatewayRestarting && (
                  <div className="flex items-center gap-2 text-sm text-primary mb-3">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Gateway restarting...
                  </div>
                )}
              </>
            )}

            {telegramStep === 2 && (
              <>
                <p className="text-sm text-muted-foreground mb-2">
                  Open Telegram and send any message to your bot. It will reply with a pairing code.
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  Enter the pairing code below to link your Telegram account.
                </p>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="ABCD-1234"
                  className="bg-background border border-border rounded px-3 py-2 w-full text-sm font-mono text-foreground placeholder:text-muted-foreground mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={telegramLoading}
                />
              </>
            )}

            {telegramError && <p className="text-sm text-destructive mb-3">{telegramError}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowTelegramModal(false);
                  setTelegramError(null);
                }}
                disabled={telegramLoading}
                className="text-sm text-muted-foreground px-4 py-2 hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              {telegramStep === 1 ? (
                <button
                  onClick={handleTelegramSetup}
                  disabled={telegramLoading || !botToken.trim()}
                  className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {telegramLoading ? 'Configuring...' : 'Configure Bot'}
                </button>
              ) : (
                <button
                  onClick={handleTelegramPair}
                  disabled={telegramLoading || !pairingCode.trim()}
                  className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {telegramLoading ? 'Pairing...' : 'Approve Pairing'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Developer Mode Modal */}
      {showDevModal && deployment.ipAddress && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowDevModal(false)}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">Advanced Mode Access</h3>
            <p className="text-sm text-muted-foreground mb-4">
              SSH into your agent's server to inspect logs, debug issues, or make manual changes.
              This will give you full access to the underlying OpenClaw runtime, including the
              ability to install community skills and connectors.
            </p>
            <div className="bg-muted rounded-lg p-4 mb-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">1. Download your SSH key</p>
                <button
                  onClick={handleDownloadSshKey}
                  className="text-sm bg-foreground text-background px-4 py-1.5 rounded hover:opacity-90 transition-colors"
                >
                  Download SSH Key (.pem)
                </button>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">2. Set permissions (run once)</p>
                <code className="block text-sm bg-background border border-border rounded px-3 py-2 font-mono text-foreground select-all overflow-x-auto">
                  chmod 600 openclaw-{deployment.id.slice(-8)}.pem
                </code>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">3. Connect via SSH</p>
                <code className="block text-sm bg-background border border-border rounded px-3 py-2 font-mono text-foreground select-all overflow-x-auto">
                  ssh -i openclaw-{deployment.id.slice(-8)}.pem debian@{deployment.ipAddress}
                </code>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Useful commands</p>
                <div className="space-y-1">
                  <code className="block text-xs bg-background border border-border rounded px-2 py-1 font-mono text-foreground select-all">
                    sudo journalctl -u openclaw-gateway -f
                  </code>
                  <code className="block text-xs bg-background border border-border rounded px-2 py-1 font-mono text-foreground select-all">
                    sudo systemctl restart openclaw-gateway
                  </code>
                  <code className="block text-xs bg-background border border-border rounded px-2 py-1 font-mono text-foreground select-all">
                    sudo cat /root/.openclaw/openclaw.json
                  </code>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowDevModal(false)}
                className="text-sm text-muted-foreground px-4 py-2 hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress steps (while provisioning) */}
      {isInProgress && (
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-foreground font-medium">Deploying your agent...</p>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            {PROGRESS_STEPS.map((step, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${done ? 'bg-green-500' : active ? 'bg-primary animate-pulse' : 'bg-muted'}`}
                  />
                  <span
                    className={`text-sm ${active ? 'text-primary font-medium' : done ? 'text-green-400' : 'text-muted-foreground'}`}
                  >
                    {step.label}
                  </span>
                  {i < PROGRESS_STEPS.length - 1 && (
                    <div className={`w-6 h-px ${done ? 'bg-green-500/30' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
          {deployment.statusMessage && (
            <p className="text-sm text-muted-foreground">{deployment.statusMessage}</p>
          )}
          <p className="text-xs text-text-dim mt-3">This typically takes 7-10 minutes.</p>
        </div>
      )}

      {/* Error state */}
      {deployment.status === 'ERROR' && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
          <p className="text-destructive font-medium mb-2">Deployment failed</p>
          <p className="text-sm text-destructive/70 mb-4">{deployment.statusMessage}</p>
          <div className="flex items-center justify-center gap-3">
            {deployment.stripeSubscriptionId && (
              <button
                onClick={async () => {
                  if (!id) return;
                  setActionLoading('retry');
                  setError(null);
                  try {
                    await retryOpenClawDeployment(id);
                    load();
                  } catch {
                    setError('Retry failed');
                  } finally {
                    setActionLoading(null);
                  }
                }}
                disabled={actionLoading === 'retry'}
                className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'retry' ? 'Retrying...' : 'Retry Deployment'}
              </button>
            )}
            <button
              onClick={() => setShowDestroyConfirm(true)}
              className="text-sm border border-destructive/30 text-destructive px-4 py-2 rounded hover:bg-destructive/10 transition-colors"
            >
              Destroy
            </button>
          </div>
        </div>
      )}

      {/* Iframe (when active) */}
      {isActive && iframeUrl && (
        <iframe
          src={iframeUrl}
          className="w-full h-[calc(100vh-280px)] border border-border rounded-lg"
          title="Agent"
        />
      )}

      {isActive && !iframeUrl && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 text-center">
          <p className="text-yellow-400 font-medium">
            Instance is ready but missing connection details.
          </p>
          <p className="text-sm text-yellow-400/70 mt-1">
            The access token or IP address is not available yet.
          </p>
        </div>
      )}
    </div>
  );
}

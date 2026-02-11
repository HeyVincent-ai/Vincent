import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getOpenClawDeployments, deployOpenClaw, retryOpenClawDeployment } from '../api';

interface Deployment {
  id: string;
  status: string;
  statusMessage: string | null;
  ipAddress: string | null;
  hostname: string | null;
  ovhServiceName: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  creditBalanceUsd: number | string | null;
  lastKnownUsageUsd: number | string | null;
  createdAt: string;
  readyAt: string | null;
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

export default function OpenClawSection() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(() => {
    getOpenClawDeployments()
      .then((res) => {
        setDeployments(res.data.data.deployments);
        setError(null);
      })
      .catch(() => setError('Failed to load deployments'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Handle return from Stripe Checkout
  useEffect(() => {
    const deploySuccess = searchParams.get('openclaw_deploy');
    if (deploySuccess === 'success') {
      searchParams.delete('openclaw_deploy');
      setSearchParams(searchParams, { replace: true });
      load();
    }
  }, [searchParams, setSearchParams, load]);

  // Poll while any deployment is in progress
  useEffect(() => {
    const inProgress = deployments.some((d) =>
      ['PENDING_PAYMENT', 'PENDING', 'ORDERING', 'PROVISIONING', 'INSTALLING'].includes(d.status)
    );
    if (!inProgress) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [deployments, load]);

  const handleDeploy = async () => {
    setDeploying(true);
    setError(null);
    try {
      const currentUrl = window.location.origin + window.location.pathname;
      const res = await deployOpenClaw(
        `${currentUrl}?openclaw_deploy=success`,
        `${currentUrl}?openclaw_deploy=canceled`
      );
      const { checkoutUrl } = res.data.data;
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg || 'Failed to start deployment');
      setDeploying(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-10">
        <h2 className="text-xl font-bold text-foreground mb-4">Agents</h2>
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  const active = deployments.filter((d) => d.status !== 'DESTROYED');

  return (
    <div className="mt-10" id="openclaw">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground">Agents</h2>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {deploying ? 'Redirecting...' : 'Deploy Agent \u2014 7-day free trial'}
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {active.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-10 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
          </svg>
          <p className="text-foreground font-medium mb-1">No agents deployed yet</p>
          <p className="text-sm text-muted-foreground">Click "Deploy Agent" to spin up your own AI agent.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {active.map((d) => {
            const isInProgress = ['PENDING_PAYMENT', 'PENDING', 'ORDERING', 'PROVISIONING', 'INSTALLING'].includes(d.status);
            const currentStep = stepIndex(d.status);

            const isClickable = d.status === 'READY' || d.status === 'CANCELING';
            const cardClassName = isClickable
              ? 'bg-card rounded-lg border border-border p-4 hover:border-primary/50 transition-colors block'
              : 'bg-card rounded-lg border border-border p-4';

            const cardContent = (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || 'bg-muted text-muted-foreground'}`}>
                      {d.status === 'CANCELING' ? 'CANCELING' : d.status}
                    </span>
                    {d.status === 'CANCELING' && d.currentPeriodEnd && (
                      <span className="text-sm text-orange-400">
                        Active until {new Date(d.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    )}
                    {d.status === 'READY' && d.currentPeriodEnd && (
                      <span className="text-sm text-muted-foreground">
                        {new Date(d.currentPeriodEnd) > new Date() && new Date(d.currentPeriodEnd).getTime() - Date.now() < 8 * 24 * 60 * 60 * 1000
                          ? `Trial ends ${new Date(d.currentPeriodEnd).toLocaleDateString()}`
                          : `Renews ${new Date(d.currentPeriodEnd).toLocaleDateString()}`}
                      </span>
                    )}
                    {d.statusMessage && d.status !== 'CANCELING' && d.status !== 'READY' && (
                      <span className="text-sm text-muted-foreground">{d.statusMessage}</span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {(d.hostname || d.ipAddress) && (
                  <p className="text-sm text-muted-foreground mt-2 font-mono">{d.hostname || d.ipAddress}</p>
                )}

                {(d.status === 'READY' || d.status === 'CANCELING') && d.creditBalanceUsd != null && (
                  (() => {
                    const balance = Number(d.creditBalanceUsd);
                    const used = Number(d.lastKnownUsageUsd || 0);
                    const remaining = Math.max(0, balance - used);
                    return (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${remaining <= 0 ? 'bg-destructive' : remaining < 5 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(100, (used / balance) * 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs ${remaining <= 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {remaining <= 0 ? 'Credits exhausted' : `$${remaining.toFixed(2)} credits remaining`}
                        </span>
                      </div>
                    );
                  })()
                )}

                {isInProgress && (
                  <div className="mt-3 flex items-center gap-2">
                    {PROGRESS_STEPS.map((step, i) => {
                      const done = i < currentStep;
                      const isCurrent = i === currentStep;
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${done ? 'bg-green-500' : isCurrent ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                          <span className={`text-xs ${isCurrent ? 'text-primary font-medium' : done ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {step.label}
                          </span>
                          {i < PROGRESS_STEPS.length - 1 && (
                            <div className={`w-4 h-px ${done ? 'bg-green-500/30' : 'bg-muted'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {d.status === 'ERROR' && (
                  <div className="mt-2 flex items-center gap-3">
                    {d.stripeSubscriptionId ? (
                      <button
                        onClick={async () => {
                          try {
                            setError(null);
                            await retryOpenClawDeployment(d.id);
                            load();
                          } catch (err: unknown) {
                            const msg = (err as { response?: { data?: { error?: string } } })
                              ?.response?.data?.error;
                            setError(msg || 'Retry failed');
                          }
                        }}
                        className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        Retry
                      </button>
                    ) : (
                      <button
                        onClick={handleDeploy}
                        disabled={deploying}
                        className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        Deploy Again
                      </button>
                    )}
                  </div>
                )}
              </>
            );

            return isClickable ? (
              <Link key={d.id} to={`/openclaw/${d.id}`} className={cardClassName}>
                {cardContent}
              </Link>
            ) : (
              <div key={d.id} className={cardClassName}>
                {cardContent}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

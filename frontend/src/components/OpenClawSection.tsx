import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getOpenClawDeployments, deployOpenClaw } from '../api';

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
  createdAt: string;
  readyAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  READY: 'bg-green-100 text-green-800',
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  ORDERING: 'bg-yellow-100 text-yellow-800',
  PROVISIONING: 'bg-blue-100 text-blue-800',
  INSTALLING: 'bg-blue-100 text-blue-800',
  CANCELING: 'bg-orange-100 text-orange-800',
  ERROR: 'bg-red-100 text-red-800',
  DESTROYING: 'bg-gray-100 text-gray-600',
  DESTROYED: 'bg-gray-100 text-gray-500',
};

const PROGRESS_STEPS = [
  { statuses: ['PENDING_PAYMENT'], label: 'Completing payment...' },
  { statuses: ['PENDING', 'ORDERING'], label: 'Ordering VPS...' },
  { statuses: ['PROVISIONING'], label: 'Setting up server...' },
  { statuses: ['INSTALLING'], label: 'Installing OpenClaw...' },
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
    const deploymentId = searchParams.get('openclaw_deployment_id');
    if (deploySuccess === 'success' && deploymentId) {
      // Clean up URL params
      searchParams.delete('openclaw_deploy');
      searchParams.delete('openclaw_deployment_id');
      setSearchParams(searchParams, { replace: true });
      // Poll for this specific deployment
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
        `${currentUrl}?openclaw_deploy=success&openclaw_deployment_id={CHECKOUT_SESSION_ID}`,
        `${currentUrl}?openclaw_deploy=canceled`
      );
      const { checkoutUrl } = res.data.data;
      // Redirect to Stripe Checkout
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
        <h2 className="text-xl font-bold mb-4">OpenClaw</h2>
        <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
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
        <h2 className="text-xl font-bold">OpenClaw</h2>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {deploying ? 'Redirecting...' : 'Deploy OpenClaw \u2014 $25/mo'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {active.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          <p className="mb-1">No OpenClaw instances yet.</p>
          <p className="text-sm">Click "Deploy OpenClaw" to spin up an AI agent on its own VPS.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {active.map((d) => {
            const isInProgress = ['PENDING_PAYMENT', 'PENDING', 'ORDERING', 'PROVISIONING', 'INSTALLING'].includes(d.status);
            const currentStep = stepIndex(d.status);

            return (
              <div key={d.id} className="bg-white rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-600'}`}>
                      {d.status === 'CANCELING' ? 'CANCELING' : d.status}
                    </span>
                    {d.status === 'CANCELING' && d.currentPeriodEnd && (
                      <span className="text-sm text-orange-600">
                        Active until {new Date(d.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    )}
                    {d.statusMessage && d.status !== 'CANCELING' && (
                      <span className="text-sm text-gray-500">{d.statusMessage}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(d.status === 'READY' || d.status === 'CANCELING') && (
                      <Link
                        to={`/openclaw/${d.id}`}
                        className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                      >
                        Open
                      </Link>
                    )}
                    <span className="text-gray-400 text-xs">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {(d.hostname || d.ipAddress) && (
                  <p className="text-sm text-gray-500 mt-2 font-mono">{d.hostname || d.ipAddress}</p>
                )}

                {isInProgress && (
                  <div className="mt-3 flex items-center gap-2">
                    {PROGRESS_STEPS.map((step, i) => {
                      const done = i < currentStep;
                      const isCurrent = i === currentStep;
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${done ? 'bg-green-500' : isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'}`} />
                          <span className={`text-xs ${isCurrent ? 'text-blue-700 font-medium' : done ? 'text-green-700' : 'text-gray-400'}`}>
                            {step.label}
                          </span>
                          {i < PROGRESS_STEPS.length - 1 && (
                            <div className={`w-4 h-px ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {d.status === 'ERROR' && (
                  <div className="mt-2">
                    <button
                      onClick={handleDeploy}
                      disabled={deploying}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

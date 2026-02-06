import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOpenClawDeployment,
  destroyOpenClawDeployment,
  restartOpenClawDeployment,
} from '../api';

interface Deployment {
  id: string;
  status: string;
  statusMessage: string | null;
  ipAddress: string | null;
  accessToken: string | null;
  ovhServiceName: string | null;
  createdAt: string;
  readyAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  READY: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  ORDERING: 'bg-yellow-100 text-yellow-800',
  PROVISIONING: 'bg-blue-100 text-blue-800',
  INSTALLING: 'bg-blue-100 text-blue-800',
  ERROR: 'bg-red-100 text-red-800',
  DESTROYING: 'bg-gray-100 text-gray-600',
  DESTROYED: 'bg-gray-100 text-gray-500',
};

const PROGRESS_STEPS = [
  { statuses: ['PENDING', 'ORDERING'], label: 'Ordering VPS...' },
  { statuses: ['PROVISIONING'], label: 'Setting up server...' },
  { statuses: ['INSTALLING'], label: 'Installing OpenClaw...' },
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
    const inProgress = ['PENDING', 'ORDERING', 'PROVISIONING', 'INSTALLING'].includes(deployment.status);
    if (!inProgress) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [deployment, load]);

  const handleRestart = async () => {
    if (!id) return;
    setActionLoading('restart');
    try {
      await restartOpenClawDeployment(id);
      load();
    } catch {
      setError('Failed to restart');
    } finally {
      setActionLoading(null);
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
      <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading deployment...
      </div>
    );
  }

  if (error && !deployment) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        {error}
        <button onClick={() => navigate('/dashboard')} className="ml-3 text-red-600 hover:text-red-800 font-medium underline">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!deployment) return null;

  const isInProgress = ['PENDING', 'ORDERING', 'PROVISIONING', 'INSTALLING'].includes(deployment.status);
  const currentStep = stepIndex(deployment.status);
  const iframeUrl = deployment.ipAddress && deployment.accessToken
    ? `https://${deployment.ipAddress}?token=${deployment.accessToken}`
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            &larr; Dashboard
          </button>
          <h1 className="text-2xl font-bold">OpenClaw</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[deployment.status] || 'bg-gray-100 text-gray-600'}`}>
            {deployment.status}
          </span>
        </div>
        {deployment.status === 'READY' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              disabled={actionLoading === 'restart'}
              className="text-sm border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'restart' ? 'Restarting...' : 'Restart'}
            </button>
            <button
              onClick={() => setShowDestroyConfirm(true)}
              className="text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
            >
              Destroy
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Destroy confirmation */}
      {showDestroyConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-800 font-medium mb-2">
            Are you sure you want to destroy this instance?
          </p>
          <p className="text-sm text-red-700 mb-3">
            This will terminate the VPS and revoke the OpenRouter API key. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDestroy}
              disabled={actionLoading === 'destroy'}
              className="text-sm bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading === 'destroy' ? 'Destroying...' : 'Yes, destroy it'}
            </button>
            <button
              onClick={() => setShowDestroyConfirm(false)}
              className="text-sm text-gray-500 px-3 py-1.5 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Info bar */}
      <div className="bg-white rounded-lg border p-3 mb-4 flex items-center gap-4 text-sm text-gray-500">
        {deployment.ipAddress && (
          <span>IP: <code className="font-mono text-gray-700">{deployment.ipAddress}</code></span>
        )}
        {deployment.ovhServiceName && (
          <span>Service: <code className="font-mono text-gray-700">{deployment.ovhServiceName}</code></span>
        )}
        <span>Created: {new Date(deployment.createdAt).toLocaleString()}</span>
        {deployment.readyAt && (
          <span>Ready: {new Date(deployment.readyAt).toLocaleString()}</span>
        )}
      </div>

      {/* Progress steps (while provisioning) */}
      {isInProgress && (
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-700 font-medium">Deploying your OpenClaw instance...</p>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            {PROGRESS_STEPS.map((step, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${done ? 'bg-green-500' : active ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'}`} />
                  <span className={`text-sm ${active ? 'text-blue-700 font-medium' : done ? 'text-green-700' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                  {i < PROGRESS_STEPS.length - 1 && (
                    <div className={`w-6 h-px ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
          {deployment.statusMessage && (
            <p className="text-sm text-gray-500">{deployment.statusMessage}</p>
          )}
          <p className="text-xs text-gray-400 mt-3">This typically takes 7-10 minutes.</p>
        </div>
      )}

      {/* Error state */}
      {deployment.status === 'ERROR' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 font-medium mb-2">Deployment failed</p>
          <p className="text-sm text-red-700">{deployment.statusMessage}</p>
        </div>
      )}

      {/* Iframe (when ready) */}
      {deployment.status === 'READY' && iframeUrl && (
        <iframe
          src={iframeUrl}
          className="w-full h-[calc(100vh-280px)] border rounded-lg"
          title="OpenClaw"
        />
      )}

      {deployment.status === 'READY' && !iframeUrl && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 font-medium">Instance is ready but missing connection details.</p>
          <p className="text-sm text-yellow-700 mt-1">The access token or IP address is not available yet.</p>
        </div>
      )}
    </div>
  );
}

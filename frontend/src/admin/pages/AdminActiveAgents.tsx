import { useEffect, useState } from 'react';
import { getAdminActiveAgents, retryAdminAgent } from '../api';

interface Agent {
  id: string;
  email: string;
  hostname: string | null;
  ipAddress: string | null;
  ovhServiceName: string | null;
  status: string;
  statusMessage: string | null;
  provisionStage: string | null;
  readyAt: string | null;
  creditBalanceUsd: number;
  currentPeriodEnd: string | null;
  hasSubscription: boolean;
  createdAt: string;
}

const statusColor = (status: string) => {
  switch (status) {
    case 'READY':
      return 'bg-green-500/10 text-green-400';
    case 'ERROR':
      return 'bg-destructive/10 text-destructive';
    case 'INSTALLING':
    case 'PROVISIONING':
    case 'ORDERING':
      return 'bg-yellow-500/10 text-yellow-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export default function AdminActiveAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});

  const handleRetry = async (id: string) => {
    setRetrying((prev) => ({ ...prev, [id]: true }));
    try {
      await retryAdminAgent(id);
      setAgents((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: 'PENDING', statusMessage: 'Retrying provisioning' } : a
        )
      );
    } catch {
      setError(`Failed to retry deployment ${id}`);
    } finally {
      setRetrying((prev) => ({ ...prev, [id]: false }));
    }
  };

  useEffect(() => {
    getAdminActiveAgents()
      .then((res) => setAgents(res.data.data.agents))
      .catch(() => setError('Failed to load active agents.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-full">
        <h1 className="text-2xl font-bold text-foreground mb-8">Active Agents</h1>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <h1 className="text-2xl font-bold text-foreground mb-8">Active Agents</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-foreground mb-8">Active Agents</h1>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{agents.length} deployments</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Deployment ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Status Message</th>
                <th className="px-4 py-3 font-medium">Hostname</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Credits</th>
                <th className="px-4 py-3 font-medium">Period End</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No active agent deployments
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">{a.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.id}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(a.status)}`}
                      >
                        {a.status}
                        {a.provisionStage ? ` · ${a.provisionStage}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {a.statusMessage ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {a.hostname ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {a.ipAddress ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-foreground">${a.creditBalanceUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.currentPeriodEnd ? new Date(a.currentPeriodEnd).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {a.status === 'ERROR' && a.hasSubscription && (
                        <button
                          onClick={() => handleRetry(a.id)}
                          disabled={retrying[a.id]}
                          className="px-3 py-1 text-xs font-medium rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {retrying[a.id] ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

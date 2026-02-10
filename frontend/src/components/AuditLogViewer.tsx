import { useEffect, useState, useCallback } from 'react';
import { listAuditLogs, getAuditLogActions, exportAuditLogs } from '../api';

interface AuditLog {
  id: string;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  errorMessage: string | null;
  inputData: unknown;
  outputData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditLogViewer({ secretId }: { secretId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAuditLogs(secretId, {
        action: filterAction || undefined,
        status: filterStatus || undefined,
        page,
        limit: 20,
      });
      setLogs(res.data.data.logs);
      setPagination(res.data.pagination);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [secretId, filterAction, filterStatus, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    getAuditLogActions(secretId)
      .then((res) => setActions(res.data.data.actions))
      .catch(() => {});
  }, [secretId]);

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const res = await exportAuditLogs(secretId, format, {
        action: filterAction || undefined,
        status: filterStatus || undefined,
      });
      const blob = format === 'csv' ? res.data : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      SUCCESS: 'bg-green-500/10 text-green-400',
      FAILED: 'bg-destructive/10 text-destructive',
      PENDING: 'bg-yellow-500/10 text-yellow-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-muted text-muted-foreground'}`}>
        {status}
      </span>
    );
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Action</label>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
          >
            <option value="">All</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
          >
            <option value="">All</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => handleExport('csv')} className="text-xs text-primary hover:text-primary/80 border border-primary/30 px-2 py-1 rounded transition-colors">
            Export CSV
          </button>
          <button onClick={() => handleExport('json')} className="text-xs text-primary hover:text-primary/80 border border-primary/30 px-2 py-1 rounded transition-colors">
            Export JSON
          </button>
        </div>
      </div>

      {/* Logs */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No audit logs found.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="border border-border rounded bg-card">
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  {statusBadge(log.status)}
                  <span className="font-mono text-xs text-foreground">{log.action}</span>
                  {log.durationMs != null && (
                    <span className="text-muted-foreground text-xs">{log.durationMs}ms</span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</span>
              </button>
              {expandedId === log.id && (
                <div className="px-4 pb-4 border-t border-border text-xs space-y-2">
                  {log.errorMessage && (
                    <div>
                      <span className="font-semibold text-destructive">Error:</span> <span className="text-foreground">{log.errorMessage}</span>
                    </div>
                  )}
                  {!!log.inputData && (
                    <div>
                      <span className="font-semibold text-foreground">Input:</span>
                      <pre className="bg-muted p-2 rounded mt-1 overflow-auto max-h-40 text-foreground">{JSON.stringify(log.inputData as Record<string, unknown>, null, 2)}</pre>
                    </div>
                  )}
                  {!!log.outputData && (
                    <div>
                      <span className="font-semibold text-foreground">Output:</span>
                      <pre className="bg-muted p-2 rounded mt-1 overflow-auto max-h-40 text-foreground">{JSON.stringify(log.outputData as Record<string, unknown>, null, 2)}</pre>
                    </div>
                  )}
                  {log.ipAddress && (
                    <div><span className="font-semibold text-foreground">IP:</span> <span className="text-muted-foreground">{log.ipAddress}</span></div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">
            {pagination.total} total entries
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 border border-border rounded disabled:opacity-30 text-foreground hover:bg-muted transition-colors"
            >
              Prev
            </button>
            <span className="px-3 py-1 text-foreground">
              {page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1 border border-border rounded disabled:opacity-30 text-foreground hover:bg-muted transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

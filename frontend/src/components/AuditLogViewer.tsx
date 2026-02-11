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
      SUCCESS: 'bg-status-success-muted text-status-success',
      FAILED: 'bg-destructive/10 text-destructive',
      PENDING: 'bg-status-warning-muted text-status-warning',
    };
    const icons: Record<string, string> = { SUCCESS: '\u2713', FAILED: '\u00d7', PENDING: '\u2022' };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-muted text-muted-foreground'}`}>
        <span>{icons[status] || '\u2022'}</span>
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
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full rounded" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <svg className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-foreground font-medium text-sm mb-0.5">No audit logs yet</p>
          <p className="text-muted-foreground text-xs">Activity will appear here as actions are performed.</p>
        </div>
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

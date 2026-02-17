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
      const blob =
        format === 'csv'
          ? res.data
          : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
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

  const statusDot = (status: string) => {
    if (status === 'SUCCESS') return 'bg-green-400';
    if (status === 'FAILED') return 'bg-red-400';
    return 'bg-yellow-400';
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Audit Logs</p>
        <div className="flex items-center gap-2">
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            className="bg-transparent border border-border/50 rounded px-2 py-1.5 text-xs text-muted-foreground"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="bg-transparent border border-border/50 rounded px-2 py-1.5 text-xs text-muted-foreground"
          >
            <option value="">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
          <button
            onClick={() => handleExport('csv')}
            className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            JSON
          </button>
        </div>
      </div>

      {/* Logs */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-8 w-full rounded" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-0.5">No audit logs yet</p>
          <p className="text-xs text-muted-foreground">
            Activity will appear here as actions are performed.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {logs.map((log) => (
            <div key={log.id}>
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full py-2.5 text-left hover:bg-muted/30 transition-colors rounded-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusDot(log.status)}`} />
                    <span className="text-sm text-foreground font-mono">{log.action}</span>
                    {log.durationMs != null && (
                      <span className="text-xs text-muted-foreground">{log.durationMs}ms</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                {log.errorMessage && (
                  <p className="text-xs text-red-400/70 ml-4 mt-0.5">{log.errorMessage}</p>
                )}
              </button>
              {expandedId === log.id && (
                <div className="pl-4 pb-3 text-xs space-y-2">
                  {!!log.inputData && (
                    <div>
                      <span className="text-xs text-muted-foreground">Input</span>
                      <pre className="bg-muted/30 p-2 rounded mt-1 overflow-auto max-h-40 text-foreground text-xs font-mono">
                        {JSON.stringify(log.inputData as Record<string, unknown>, null, 2)}
                      </pre>
                    </div>
                  )}
                  {!!log.outputData && (
                    <div>
                      <span className="text-xs text-muted-foreground">Output</span>
                      <pre className="bg-muted/30 p-2 rounded mt-1 overflow-auto max-h-40 text-foreground text-xs font-mono">
                        {JSON.stringify(log.outputData as Record<string, unknown>, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.ipAddress && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">IP: </span>
                      <span className="text-muted-foreground font-mono">{log.ipAddress}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground">{pagination.total} total</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-2 py-0.5 rounded text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            <span className="px-2 py-0.5 text-xs text-muted-foreground">
              {page}/{pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className="px-2 py-0.5 rounded text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

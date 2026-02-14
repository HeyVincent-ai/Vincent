import { useEffect, useState, useCallback } from 'react';
import { useToast } from './Toast';
import {
  getUpdateStatus,
  applyUpdates,
  getSoulMd,
  updateSoulMd,
  listMemoryFiles,
  readMemoryFile,
  getScheduledTasks,
  toggleScheduledTask,
} from '../api';

// ============================================================
// Types
// ============================================================

interface UpdateLog {
  updateVersion: number;
  name: string;
  status: string;
  errorMessage: string | null;
  appliedAt: string;
}

interface UpdateStatus {
  configVersion: number;
  latestVersion: number;
  pending: number;
  logs: UpdateLog[];
}

// ============================================================
// Update Status Section
// ============================================================

function UpdateStatusSection({ deploymentId }: { deploymentId: string }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [applying, setApplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const load = useCallback(() => {
    getUpdateStatus(deploymentId)
      .then((res) => setStatus(res.data.data))
      .catch(() => {});
  }, [deploymentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await applyUpdates(deploymentId);
      const data = res.data.data;
      if (data.failed > 0) {
        toast(`Applied ${data.applied}, ${data.failed} failed`, 'error');
      } else if (data.applied > 0) {
        toast(`Applied ${data.applied} update(s)`);
      } else {
        toast('Already up to date');
      }
      load();
    } catch {
      toast('Failed to apply updates', 'error');
    } finally {
      setApplying(false);
    }
  };

  if (!status) return null;

  const isUpToDate = status.pending === 0;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-foreground">Config Updates</h3>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              isUpToDate
                ? 'bg-status-success-muted text-status-success'
                : 'bg-status-warning-muted text-status-warning'
            }`}
          >
            {isUpToDate ? `v${status.configVersion} — up to date` : `${status.pending} pending`}
          </span>
          {!isUpToDate && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {applying ? 'Applying...' : 'Apply Now'}
            </button>
          )}
        </div>
      </div>

      {status.logs.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? 'Hide' : 'Show'} update history ({status.logs.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {status.logs.map((log) => (
                <div
                  key={log.updateVersion}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      log.status === 'SUCCESS'
                        ? 'bg-green-500'
                        : log.status === 'FAILED'
                          ? 'bg-destructive'
                          : 'bg-muted-foreground'
                    }`}
                  />
                  <span>
                    v{log.updateVersion} {log.name}
                  </span>
                  <span className="text-text-dim">
                    {new Date(log.appliedAt).toLocaleString()}
                  </span>
                  {log.errorMessage && (
                    <span className="text-destructive truncate max-w-[200px]" title={log.errorMessage}>
                      {log.errorMessage}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Personality (SOUL.md) Section
// ============================================================

function PersonalitySection({ deploymentId }: { deploymentId: string }) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getSoulMd(deploymentId)
      .then((res) => {
        const text = res.data.data.content || '';
        setContent(text);
        setOriginalContent(text);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deploymentId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSoulMd(deploymentId, content);
      setOriginalContent(content);
      toast('Personality updated');
    } catch {
      toast('Failed to update personality', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== originalContent;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Agent Personality</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure your agent's personality and behavioral guidelines via SOUL.md
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? 'Collapse' : 'Edit'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`# My Agent's Personality\n\nYou are a crypto research analyst focused on DeFi opportunities...\n\n## Rules\n- Always verify data before acting\n- Be concise in responses\n- Focus on risk-adjusted returns`}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[120px]"
                rows={8}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {content.length} characters
                  {hasChanges && ' (unsaved changes)'}
                </span>
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Memory Viewer Section
// ============================================================

function MemoryViewerSection({ deploymentId }: { deploymentId: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    listMemoryFiles(deploymentId)
      .then((res) => setFiles(res.data.data.files || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deploymentId]);

  const handleSelectFile = async (filename: string) => {
    if (selectedFile === filename) {
      setSelectedFile(null);
      setFileContent(null);
      return;
    }
    setSelectedFile(filename);
    setFileLoading(true);
    try {
      const res = await readMemoryFile(deploymentId, filename);
      setFileContent(res.data.data.content);
    } catch {
      setFileContent('(Failed to read file)');
    } finally {
      setFileLoading(false);
    }
  };

  if (loading) return null;
  if (files.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Agent Memory</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            View your agent's memory files (tasks, lessons, self-reviews)
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? 'Collapse' : `View (${files.length} files)`}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {files.map((filename) => (
            <div key={filename}>
              <button
                onClick={() => handleSelectFile(filename)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                  selectedFile === filename
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <span className="font-mono">{filename}</span>
              </button>
              {selectedFile === filename && (
                <div className="mt-1 ml-2">
                  {fileLoading ? (
                    <p className="text-xs text-muted-foreground py-2">Loading...</p>
                  ) : (
                    <pre className="text-xs bg-background border border-border rounded p-3 overflow-auto max-h-[300px] whitespace-pre-wrap font-mono text-foreground">
                      {fileContent}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Scheduled Tasks Section (opt-in crons that use LLM credits)
// ============================================================

interface TaskInfo {
  enabled: boolean;
  label: string;
}

function ScheduledTasksSection({ deploymentId }: { deploymentId: string }) {
  const [tasks, setTasks] = useState<Record<string, TaskInfo>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    getScheduledTasks(deploymentId)
      .then((res) => setTasks(res.data.data.tasks || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deploymentId]);

  const handleToggle = async (taskName: string, enabled: boolean) => {
    setToggling(taskName);
    try {
      await toggleScheduledTask(deploymentId, taskName, enabled);
      setTasks((prev) => ({
        ...prev,
        [taskName]: { ...prev[taskName], enabled },
      }));
      toast(enabled ? `${taskName} enabled` : `${taskName} disabled`);
    } catch {
      toast('Failed to toggle task', 'error');
    } finally {
      setToggling(null);
    }
  };

  if (loading) return null;

  const taskEntries = Object.entries(tasks);
  if (taskEntries.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-2">
        <h3 className="text-sm font-medium text-foreground">Scheduled Tasks</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Opt-in automated tasks. These use LLM credits when enabled.
        </p>
      </div>
      <div className="space-y-2">
        {taskEntries.map(([name, info]) => (
          <div key={name} className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-foreground">{info.label}</span>
              <span className="text-xs text-muted-foreground ml-2">({name})</span>
            </div>
            <button
              onClick={() => handleToggle(name, !info.enabled)}
              disabled={toggling === name}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                info.enabled ? 'bg-primary' : 'bg-muted'
              } ${toggling === name ? 'opacity-50' : ''}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  info.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main Export
// ============================================================

export default function AgentConfig({ deploymentId }: { deploymentId: string }) {
  return (
    <div className="space-y-3">
      <UpdateStatusSection deploymentId={deploymentId} />
      <PersonalitySection deploymentId={deploymentId} />
      <ScheduledTasksSection deploymentId={deploymentId} />
      <MemoryViewerSection deploymentId={deploymentId} />
    </div>
  );
}

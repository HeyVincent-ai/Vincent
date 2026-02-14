import { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { getScheduledTasks, toggleScheduledTask } from '../api';

// ============================================================
// Agent Maintenance Section (opt-in crons that use LLM credits)
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
        <h3 className="text-sm font-medium text-foreground">Agent Maintenance</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Opt-in background routines. These use LLM credits when enabled.
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
      <ScheduledTasksSection deploymentId={deploymentId} />
    </div>
  );
}

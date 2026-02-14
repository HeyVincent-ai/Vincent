import { useEffect, useState, useCallback } from 'react';
import { useToast } from './Toast';
import {
  listStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  getStrategyTemplates,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from '../api';

// ============================================================
// Types
// ============================================================

interface AlertRule {
  id: string;
  strategyId: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  instruction: string;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Strategy {
  id: string;
  deploymentId: string;
  strategyType: string;
  templateId: string | null;
  thesisText: string;
  conditionTokenId: string | null;
  strategyConfig: Record<string, unknown>;
  riskProfile: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  alertRules?: AlertRule[];
}

interface StrategyTemplate {
  id: string;
  label: string;
  category: string;
  description: string;
  strategyType: string;
  defaultThesis: string;
  defaultAlertRules: {
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    instruction: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  ARCHIVED: 'bg-muted text-muted-foreground border-border',
};

const RISK_COLORS: Record<string, string> = {
  CONSERVATIVE: 'text-blue-400',
  MODERATE: 'text-yellow-400',
  AGGRESSIVE: 'text-red-400',
};

const TRIGGER_LABELS: Record<string, string> = {
  PRICE_THRESHOLD: 'Price',
  CRON_SCHEDULE: 'Schedule',
  POLYMARKET_ODDS: 'Odds',
};

// ============================================================
// Component
// ============================================================

export default function StrategyManager({ deploymentId }: { deploymentId: string }) {
  const { toast } = useToast();

  // Data
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [templates, setTemplates] = useState<{ polymarket: StrategyTemplate[]; custom: StrategyTemplate[] }>({
    polymarket: [],
    custom: [],
  });
  const [loading, setLoading] = useState(true);

  // UI state
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Create form state
  const [createTab, setCreateTab] = useState<'POLYMARKET' | 'CUSTOM'>('POLYMARKET');
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null);
  const [thesisText, setThesisText] = useState('');
  const [riskProfile, setRiskProfile] = useState('MODERATE');

  // Alert rule editing
  const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null);
  const [alertInstruction, setAlertInstruction] = useState('');
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlertType, setNewAlertType] = useState('CRON_SCHEDULE');
  const [newAlertInstruction, setNewAlertInstruction] = useState('');
  const [newAlertCron, setNewAlertCron] = useState('*/15 * * * *');
  const [newAlertAsset, setNewAlertAsset] = useState('ETH');
  const [newAlertDirection, setNewAlertDirection] = useState('above');
  const [newAlertPrice, setNewAlertPrice] = useState('0');

  const loadStrategies = useCallback(() => {
    listStrategies(deploymentId)
      .then((res) => setStrategies(res.data.data.strategies))
      .catch(() => toast('Failed to load strategies', 'error'))
      .finally(() => setLoading(false));
  }, [deploymentId, toast]);

  const loadTemplates = useCallback(() => {
    getStrategyTemplates(deploymentId)
      .then((res) => {
        setTemplates({
          polymarket: res.data.data.polymarket,
          custom: res.data.data.custom,
        });
      })
      .catch(() => {});
  }, [deploymentId]);

  useEffect(() => {
    loadStrategies();
    loadTemplates();
  }, [loadStrategies, loadTemplates]);

  // ----------------------------------------------------------
  // Create strategy from template
  // ----------------------------------------------------------
  const handleCreate = async () => {
    if (!selectedTemplate || !thesisText.trim()) return;
    setActionLoading(true);
    try {
      await createStrategy(deploymentId, {
        strategyType: selectedTemplate.strategyType,
        templateId: selectedTemplate.id,
        thesisText: thesisText.trim(),
        strategyConfig: {},
        riskProfile,
      });
      toast('Strategy created');
      setShowCreate(false);
      resetCreateForm();
      loadStrategies();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      toast(msg || 'Failed to create strategy', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const resetCreateForm = () => {
    setSelectedTemplate(null);
    setThesisText('');
    setRiskProfile('MODERATE');
    setCreateTab('POLYMARKET');
  };

  // ----------------------------------------------------------
  // Status toggle
  // ----------------------------------------------------------
  const handleToggleStatus = async (strategy: Strategy) => {
    const newStatus = strategy.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await updateStrategy(deploymentId, strategy.id, { status: newStatus });
      toast(`Strategy ${newStatus.toLowerCase()}`);
      loadStrategies();
      if (selectedStrategy?.id === strategy.id) {
        setSelectedStrategy({ ...selectedStrategy, status: newStatus });
      }
    } catch {
      toast('Failed to update status', 'error');
    }
  };

  // ----------------------------------------------------------
  // Delete strategy
  // ----------------------------------------------------------
  const handleDelete = async (strategyId: string) => {
    setActionLoading(true);
    try {
      await deleteStrategy(deploymentId, strategyId);
      toast('Strategy deleted');
      setDeleteConfirm(null);
      if (selectedStrategy?.id === strategyId) setSelectedStrategy(null);
      loadStrategies();
    } catch {
      toast('Failed to delete strategy', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // ----------------------------------------------------------
  // Alert rule actions
  // ----------------------------------------------------------
  const handleToggleAlert = async (alert: AlertRule) => {
    try {
      await updateAlertRule(deploymentId, alert.strategyId, alert.id, {
        enabled: !alert.enabled,
      });
      loadStrategies();
      if (selectedStrategy) {
        const updated = {
          ...selectedStrategy,
          alertRules: selectedStrategy.alertRules?.map((a) =>
            a.id === alert.id ? { ...a, enabled: !a.enabled } : a
          ),
        };
        setSelectedStrategy(updated);
      }
    } catch {
      toast('Failed to toggle alert', 'error');
    }
  };

  const handleUpdateAlertInstruction = async () => {
    if (!editingAlert || !alertInstruction.trim()) return;
    setActionLoading(true);
    try {
      await updateAlertRule(deploymentId, editingAlert.strategyId, editingAlert.id, {
        instruction: alertInstruction.trim(),
      });
      toast('Alert updated');
      setEditingAlert(null);
      loadStrategies();
      // Refresh detail view
      if (selectedStrategy) {
        const updated = {
          ...selectedStrategy,
          alertRules: selectedStrategy.alertRules?.map((a) =>
            a.id === editingAlert.id ? { ...a, instruction: alertInstruction.trim() } : a
          ),
        };
        setSelectedStrategy(updated);
      }
    } catch {
      toast('Failed to update alert', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAlert = async (alert: AlertRule) => {
    try {
      await deleteAlertRule(deploymentId, alert.strategyId, alert.id);
      toast('Alert rule deleted');
      loadStrategies();
      if (selectedStrategy) {
        setSelectedStrategy({
          ...selectedStrategy,
          alertRules: selectedStrategy.alertRules?.filter((a) => a.id !== alert.id),
        });
      }
    } catch {
      toast('Failed to delete alert', 'error');
    }
  };

  const handleAddAlert = async () => {
    if (!selectedStrategy || !newAlertInstruction.trim()) return;
    setActionLoading(true);
    const triggerConfig =
      newAlertType === 'CRON_SCHEDULE'
        ? { cron: newAlertCron }
        : newAlertType === 'PRICE_THRESHOLD'
          ? { asset: newAlertAsset, direction: newAlertDirection, price: parseFloat(newAlertPrice) || 0 }
          : { conditionId: '', outcome: '', direction: 'above', probability: 0.5 };
    try {
      await createAlertRule(deploymentId, selectedStrategy.id, {
        triggerType: newAlertType,
        triggerConfig,
        instruction: newAlertInstruction.trim(),
      });
      toast('Alert rule added');
      setShowAddAlert(false);
      setNewAlertInstruction('');
      setNewAlertCron('*/15 * * * *');
      loadStrategies();
      // Refresh detail
      const res = await listStrategies(deploymentId);
      const fresh = (res.data.data.strategies as Strategy[]).find(
        (s) => s.id === selectedStrategy.id
      );
      if (fresh) setSelectedStrategy(fresh);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      toast(msg || 'Failed to add alert', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // ----------------------------------------------------------
  // Render helpers
  // ----------------------------------------------------------

  const formatTrigger = (alert: AlertRule) => {
    const cfg = alert.triggerConfig;
    if (alert.triggerType === 'CRON_SCHEDULE') return `Cron: ${cfg.cron}`;
    if (alert.triggerType === 'PRICE_THRESHOLD')
      return `${cfg.asset} ${cfg.direction} $${cfg.price}`;
    if (alert.triggerType === 'POLYMARKET_ODDS')
      return `Odds ${cfg.direction} ${((cfg.probability as number) * 100).toFixed(0)}%`;
    return alert.triggerType;
  };

  // ----------------------------------------------------------
  // Loading state
  // ----------------------------------------------------------

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading strategies...
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Strategy detail view
  // ----------------------------------------------------------

  if (selectedStrategy) {
    return (
      <div className="bg-card rounded-lg border border-border">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedStrategy(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-foreground font-medium">
                  {selectedStrategy.templateId
                    ? templates.polymarket
                        .concat(templates.custom)
                        .find((t) => t.id === selectedStrategy.templateId)?.label ||
                      selectedStrategy.templateId
                    : 'Custom Strategy'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[selectedStrategy.status] || ''}`}
                >
                  {selectedStrategy.status}
                </span>
                <span className={`text-xs ${RISK_COLORS[selectedStrategy.riskProfile] || ''}`}>
                  {selectedStrategy.riskProfile}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedStrategy.strategyType} &middot; Created{' '}
                {new Date(selectedStrategy.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleStatus(selectedStrategy)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                selectedStrategy.status === 'ACTIVE'
                  ? 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10'
                  : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
              }`}
            >
              {selectedStrategy.status === 'ACTIVE' ? 'Pause' : 'Activate'}
            </button>
            <button
              onClick={() => setDeleteConfirm(selectedStrategy.id)}
              className="text-xs border border-destructive/30 text-destructive px-3 py-1.5 rounded hover:bg-destructive/10 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Thesis */}
        <div className="p-4 border-b border-border">
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Thesis</h4>
          <p className="text-sm text-foreground">{selectedStrategy.thesisText}</p>
        </div>

        {/* Alert Rules */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-muted-foreground">
              Alert Rules ({selectedStrategy.alertRules?.length || 0})
            </h4>
            <button
              onClick={() => setShowAddAlert(true)}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              + Add rule
            </button>
          </div>

          {(!selectedStrategy.alertRules || selectedStrategy.alertRules.length === 0) && (
            <p className="text-sm text-muted-foreground">No alert rules configured.</p>
          )}

          <div className="space-y-2">
            {selectedStrategy.alertRules?.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border p-3 ${alert.enabled ? 'border-border bg-background' : 'border-border/50 bg-muted/30 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {TRIGGER_LABELS[alert.triggerType] || alert.triggerType}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTrigger(alert)}</span>
                      {alert.lastTriggeredAt && (
                        <span className="text-xs text-muted-foreground">
                          Last: {new Date(alert.lastTriggeredAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 break-words">{alert.instruction}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleToggleAlert(alert)}
                      className={`w-8 h-5 rounded-full transition-colors relative ${alert.enabled ? 'bg-green-500' : 'bg-muted'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${alert.enabled ? 'left-3.5' : 'left-0.5'}`}
                      />
                    </button>
                    <button
                      onClick={() => {
                        setEditingAlert(alert);
                        setAlertInstruction(alert.instruction);
                      }}
                      className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                      title="Edit instruction"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteAlert(alert)}
                      className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                      title="Delete rule"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit alert instruction modal */}
        {editingAlert && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setEditingAlert(null)}
          >
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-1">Edit Alert Instruction</h3>
              <p className="text-xs text-muted-foreground mb-3">
                {TRIGGER_LABELS[editingAlert.triggerType]} &middot; {formatTrigger(editingAlert)}
              </p>
              <textarea
                value={alertInstruction}
                onChange={(e) => setAlertInstruction(e.target.value)}
                rows={4}
                className="bg-background border border-border rounded px-3 py-2 w-full text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <div className="flex gap-2 justify-end mt-4">
                <button
                  onClick={() => setEditingAlert(null)}
                  className="text-sm text-muted-foreground px-4 py-2 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateAlertInstruction}
                  disabled={actionLoading || !alertInstruction.trim()}
                  className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add alert rule modal */}
        {showAddAlert && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setShowAddAlert(false)}
          >
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-4">Add Alert Rule</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Trigger Type</label>
                  <select
                    value={newAlertType}
                    onChange={(e) => setNewAlertType(e.target.value)}
                    className="bg-background border border-border rounded px-3 py-2 w-full text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="CRON_SCHEDULE">Cron Schedule</option>
                    <option value="PRICE_THRESHOLD">Price Threshold</option>
                    <option value="POLYMARKET_ODDS">Polymarket Odds</option>
                  </select>
                </div>

                {newAlertType === 'CRON_SCHEDULE' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Cron Expression</label>
                    <input
                      type="text"
                      value={newAlertCron}
                      onChange={(e) => setNewAlertCron(e.target.value)}
                      className="bg-background border border-border rounded px-3 py-2 w-full text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="*/15 * * * *"
                    />
                    <p className="text-xs text-muted-foreground mt-1">e.g. */15 * * * * = every 15 min</p>
                  </div>
                )}

                {newAlertType === 'PRICE_THRESHOLD' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Asset</label>
                      <input
                        type="text"
                        value={newAlertAsset}
                        onChange={(e) => setNewAlertAsset(e.target.value)}
                        className="bg-background border border-border rounded px-3 py-2 w-full text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Direction</label>
                      <select
                        value={newAlertDirection}
                        onChange={(e) => setNewAlertDirection(e.target.value)}
                        className="bg-background border border-border rounded px-3 py-2 w-full text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="above">Above</option>
                        <option value="below">Below</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Price ($)</label>
                      <input
                        type="number"
                        value={newAlertPrice}
                        onChange={(e) => setNewAlertPrice(e.target.value)}
                        className="bg-background border border-border rounded px-3 py-2 w-full text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Instruction</label>
                  <textarea
                    value={newAlertInstruction}
                    onChange={(e) => setNewAlertInstruction(e.target.value)}
                    rows={3}
                    className="bg-background border border-border rounded px-3 py-2 w-full text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    placeholder="What should the agent do when this alert fires?"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  onClick={() => setShowAddAlert(false)}
                  className="text-sm text-muted-foreground px-4 py-2 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAlert}
                  disabled={actionLoading || !newAlertInstruction.trim()}
                  className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Adding...' : 'Add Rule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {deleteConfirm && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setDeleteConfirm(null)}
          >
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-foreground font-medium mb-2">Delete this strategy?</p>
              <p className="text-sm text-muted-foreground mb-4">
                This will permanently delete the strategy and all its alert rules.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="text-sm text-muted-foreground px-4 py-2 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={actionLoading}
                  className="text-sm bg-destructive text-destructive-foreground px-4 py-2 rounded hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------------
  // Strategy list view
  // ----------------------------------------------------------

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-foreground font-medium">Strategies</h3>
        <button
          onClick={() => {
            resetCreateForm();
            setShowCreate(true);
          }}
          className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors"
        >
          + New Strategy
        </button>
      </div>

      {strategies.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-muted-foreground text-sm mb-2">No strategies yet</p>
          <p className="text-muted-foreground/60 text-xs mb-4">
            Create a strategy to define your trading thesis and alert rules.
          </p>
          <button
            onClick={() => {
              resetCreateForm();
              setShowCreate(true);
            }}
            className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition-colors"
          >
            Create your first strategy
          </button>
        </div>
      )}

      {strategies.length > 0 && (
        <div className="divide-y divide-border">
          {strategies.map((strategy) => (
            <div
              key={strategy.id}
              className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => setSelectedStrategy(strategy)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {strategy.templateId
                      ? templates.polymarket
                          .concat(templates.custom)
                          .find((t) => t.id === strategy.templateId)?.label ||
                        strategy.templateId
                      : 'Custom Strategy'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs border ${STATUS_COLORS[strategy.status] || ''}`}
                  >
                    {strategy.status}
                  </span>
                  <span className={`text-xs ${RISK_COLORS[strategy.riskProfile] || 'text-muted-foreground'}`}>
                    {strategy.riskProfile}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {strategy.alertRules?.length || 0} alerts
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(strategy);
                    }}
                    className={`w-8 h-5 rounded-full transition-colors relative ${strategy.status === 'ACTIVE' ? 'bg-green-500' : 'bg-muted'}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${strategy.status === 'ACTIVE' ? 'left-3.5' : 'left-0.5'}`}
                    />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {strategy.thesisText}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Create strategy modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-card border border-border rounded-lg w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">New Strategy</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Pick a template to start, then customize your thesis.
              </p>
            </div>

            {/* Type tabs */}
            <div className="flex border-b border-border">
              {(['POLYMARKET', 'CUSTOM'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setCreateTab(tab);
                    setSelectedTemplate(null);
                  }}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                    createTab === tab
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'POLYMARKET' ? 'Polymarket' : 'Custom'}
                </button>
              ))}
            </div>

            {/* Template grid */}
            <div className="p-4 grid grid-cols-2 gap-2">
              {(createTab === 'POLYMARKET' ? templates.polymarket : templates.custom).map(
                (tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => {
                      setSelectedTemplate(tmpl);
                      setThesisText(tmpl.defaultThesis);
                    }}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      selectedTemplate?.id === tmpl.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{tmpl.label}</span>
                      <span className="text-xs text-muted-foreground">{tmpl.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
                    <p className="text-xs text-primary/60 mt-1">
                      {tmpl.defaultAlertRules.length} default alert
                      {tmpl.defaultAlertRules.length !== 1 ? 's' : ''}
                    </p>
                  </button>
                )
              )}
            </div>

            {/* Thesis + risk config */}
            {selectedTemplate && (
              <div className="p-4 border-t border-border space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Your Thesis</label>
                  <textarea
                    value={thesisText}
                    onChange={(e) => setThesisText(e.target.value)}
                    rows={3}
                    className="bg-background border border-border rounded px-3 py-2 w-full text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    placeholder="What's your thesis?"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Risk Profile</label>
                  <div className="flex gap-2">
                    {['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'].map((r) => (
                      <button
                        key={r}
                        onClick={() => setRiskProfile(r)}
                        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                          riskProfile === r
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Default alerts ({selectedTemplate.defaultAlertRules.length}):
                  </p>
                  <div className="space-y-1">
                    {selectedTemplate.defaultAlertRules.map((rule, i) => (
                      <div
                        key={i}
                        className="text-xs bg-background border border-border rounded px-2 py-1.5"
                      >
                        <span className="font-mono text-primary">{TRIGGER_LABELS[rule.triggerType]}</span>{' '}
                        <span className="text-muted-foreground">{rule.instruction.slice(0, 80)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="p-4 border-t border-border flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="text-sm text-muted-foreground px-4 py-2 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={actionLoading || !selectedTemplate || !thesisText.trim()}
                className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Creating...' : 'Create Strategy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { listPolicies, createPolicy, deletePolicy } from '../api';
import { useToast } from './Toast';

interface Policy {
  id: string;
  policyType: string;
  policyConfig: Record<string, unknown>;
  createdAt: string;
}

interface ConfigField {
  key: string;
  type: 'array' | 'number' | 'boolean';
  placeholder?: string;
}

interface PolicyTypeDef {
  value: string;
  label: string;
  description: string;
  configFields: ConfigField[];
  supportsApprovalOverride: boolean;
}

const POLICY_TYPES: PolicyTypeDef[] = [
  {
    value: 'ADDRESS_ALLOWLIST',
    label: 'Address Allowlist',
    description: 'Only allow transactions to specific addresses',
    configFields: [{ key: 'addresses', type: 'array', placeholder: '0x...' }],
    supportsApprovalOverride: true,
  },
  {
    value: 'FUNCTION_ALLOWLIST',
    label: 'Function Allowlist',
    description: 'Only allow specific contract function calls',
    configFields: [{ key: 'selectors', type: 'array', placeholder: '0x12345678' }],
    supportsApprovalOverride: true,
  },
  {
    value: 'TOKEN_ALLOWLIST',
    label: 'Token Allowlist',
    description: 'Only allow transfers of specific tokens',
    configFields: [{ key: 'tokens', type: 'array', placeholder: '0x... (token address)' }],
    supportsApprovalOverride: true,
  },
  {
    value: 'SPENDING_LIMIT_PER_TX',
    label: 'Spending Limit Per Tx',
    description: 'Maximum USD value per transaction',
    configFields: [{ key: 'maxUsd', type: 'number', placeholder: 'Max USD per tx' }],
    supportsApprovalOverride: true,
  },
  {
    value: 'SPENDING_LIMIT_DAILY',
    label: 'Daily Spending Limit',
    description: 'Maximum USD spent in a rolling 24-hour window',
    configFields: [{ key: 'maxUsd', type: 'number', placeholder: 'Max USD per day' }],
    supportsApprovalOverride: true,
  },
  {
    value: 'SPENDING_LIMIT_WEEKLY',
    label: 'Weekly Spending Limit',
    description: 'Maximum USD spent in a rolling 7-day window',
    configFields: [{ key: 'maxUsd', type: 'number', placeholder: 'Max USD per week' }],
    supportsApprovalOverride: true,
  },
  {
    value: 'REQUIRE_APPROVAL',
    label: 'Require Human Approval',
    description: 'All transactions require human approval via Telegram',
    configFields: [{ key: 'enabled', type: 'boolean' }],
    supportsApprovalOverride: false,
  },
];

function formatPolicyConfig(policyType: string, config: Record<string, unknown>): string {
  const typeDef = POLICY_TYPES.find((t) => t.value === policyType);
  if (!typeDef) return JSON.stringify(config);

  const field = typeDef.configFields[0];
  const val = config[field.key];

  if (field.type === 'array' && Array.isArray(val)) {
    return val.join(', ');
  }
  if (field.type === 'number' && typeof val === 'number') {
    return `$${val.toLocaleString()}`;
  }
  if (field.type === 'boolean') {
    return val ? 'Enabled' : 'Disabled';
  }
  return JSON.stringify(val);
}

export default function PolicyManager({ secretId }: { secretId: string }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState(POLICY_TYPES[0].value);
  const [configInput, setConfigInput] = useState('');
  const [approvalOverride, setApprovalOverride] = useState(false);

  const load = () => {
    listPolicies(secretId)
      .then((res) => setPolicies(res.data.data.policies))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [secretId]);

  const typeDef = POLICY_TYPES.find((t) => t.value === selectedType)!;

  const handleCreate = async () => {
    let config: Record<string, unknown>;
    const field = typeDef.configFields[0];

    if (field.type === 'array') {
      config = {
        [field.key]: configInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    } else if (field.type === 'number') {
      config = { [field.key]: parseFloat(configInput) };
    } else {
      config = { [field.key]: true };
    }

    if (typeDef.supportsApprovalOverride && approvalOverride) {
      config.approvalOverride = true;
    }

    try {
      await createPolicy(secretId, selectedType, config);
      setShowForm(false);
      setConfigInput('');
      setApprovalOverride(false);
      toast('Policy created');
      load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Failed to create policy';
      toast(msg, 'error');
    }
  };

  const handleDelete = async (policyId: string) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await deletePolicy(secretId, policyId);
      toast('Policy deleted');
      load();
    } catch {
      toast('Failed to delete policy', 'error');
    }
  };

  const visiblePolicies = policies.filter((p) => p.policyType !== 'APPROVAL_THRESHOLD');

  if (loading)
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="skeleton h-14 w-full rounded-lg" />
        ))}
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Policies</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add policy'}
        </button>
      </div>

      {showForm && (
        <div className="border-t border-border/50 pt-4 pb-4 mb-4">
          <div className="mb-3">
            <label className="block text-xs font-medium text-foreground mb-1">Policy Type</label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setConfigInput('');
                setApprovalOverride(false);
              }}
              className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm text-foreground"
            >
              {POLICY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">{typeDef.description}</p>
          </div>

          {typeDef.configFields[0].type !== 'boolean' && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-foreground mb-1">
                {typeDef.configFields[0].type === 'array' ? 'Values (comma-separated)' : 'Value'}
              </label>
              <input
                value={configInput}
                onChange={(e) => setConfigInput(e.target.value)}
                placeholder={typeDef.configFields[0].placeholder || ''}
                className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {typeDef.supportsApprovalOverride && (
            <div className="mb-3 flex items-start gap-2">
              <input
                type="checkbox"
                id="approvalOverride"
                checked={approvalOverride}
                onChange={(e) => setApprovalOverride(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <label htmlFor="approvalOverride" className="text-xs">
                <span className="font-medium text-foreground">Approval override</span>
                <p className="text-xs text-muted-foreground">
                  Require human approval instead of blocking
                </p>
              </label>
            </div>
          )}

          <button
            onClick={handleCreate}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
          >
            Create Policy
          </button>
        </div>
      )}

      {visiblePolicies.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-0.5">No policies configured</p>
          <p className="text-xs text-muted-foreground">All actions are allowed by default.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {visiblePolicies.map((p) => {
            const pTypeDef = POLICY_TYPES.find((t) => t.value === p.policyType);
            const hasOverride = p.policyConfig.approvalOverride === true;

            return (
              <div key={p.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground">
                      {pTypeDef?.label || p.policyType}
                    </span>
                    {hasOverride && (
                      <span className="text-[11px] px-2 py-0.5 text-yellow-400 bg-yellow-500/10 rounded">
                        approval override
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                    {formatPolicyConfig(p.policyType, p.policyConfig)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs text-muted-foreground/60 hover:text-destructive ml-4 shrink-0 transition-colors"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

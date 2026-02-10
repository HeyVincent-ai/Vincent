import { useEffect, useState } from 'react';
import { listPolicies, createPolicy, deletePolicy } from '../api';

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
      config = { [field.key]: configInput.split(',').map((s) => s.trim()).filter(Boolean) };
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
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to create policy';
      alert(msg);
    }
  };

  const handleDelete = async (policyId: string) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await deletePolicy(secretId, policyId);
      load();
    } catch {
      alert('Failed to delete policy');
    }
  };

  const visiblePolicies = policies.filter((p) => p.policyType !== 'APPROVAL_THRESHOLD');

  if (loading) return <p className="text-muted-foreground text-sm">Loading policies...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Policies</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Policy'}
        </button>
      </div>

      {showForm && (
        <div className="bg-muted border border-border rounded-lg p-4 mb-4">
          <div className="mb-3">
            <label className="block text-sm font-medium text-foreground mb-1">Policy Type</label>
            <select
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setConfigInput(''); setApprovalOverride(false); }}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              {POLICY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">{typeDef.description}</p>
          </div>

          {typeDef.configFields[0].type !== 'boolean' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-foreground mb-1">
                {typeDef.configFields[0].type === 'array' ? 'Values (comma-separated)' : 'Value'}
              </label>
              <input
                value={configInput}
                onChange={(e) => setConfigInput(e.target.value)}
                placeholder={typeDef.configFields[0].placeholder || ''}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
              <label htmlFor="approvalOverride" className="text-sm">
                <span className="font-medium text-foreground">Approval override</span>
                <p className="text-xs text-muted-foreground">
                  Instead of blocking, require human approval when this policy is violated
                </p>
              </label>
            </div>
          )}

          <button onClick={handleCreate} className="text-sm bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 transition-colors">
            Create Policy
          </button>
        </div>
      )}

      {visiblePolicies.length === 0 ? (
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-sm">No policies configured. All actions are allowed by default.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visiblePolicies.map((p) => {
            const pTypeDef = POLICY_TYPES.find((t) => t.value === p.policyType);
            const hasOverride = p.policyConfig.approvalOverride === true;

            return (
              <div key={p.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">
                      {pTypeDef?.label || p.policyType}
                    </span>
                    {hasOverride && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded-full font-medium">
                        approval override
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatPolicyConfig(p.policyType, p.policyConfig)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-sm text-destructive hover:text-destructive/80 ml-4 shrink-0 transition-colors"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

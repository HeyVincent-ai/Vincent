import { useEffect, useState } from 'react';
import { listPolicies, createPolicy, deletePolicy } from '../api';

interface Policy {
  id: string;
  policyType: string;
  policyConfig: Record<string, unknown>;
  createdAt: string;
}

const POLICY_TYPES = [
  { value: 'ADDRESS_ALLOWLIST', label: 'Address Allowlist', configFields: [{ key: 'addresses', type: 'array', placeholder: '0x...' }] },
  { value: 'FUNCTION_ALLOWLIST', label: 'Function Allowlist', configFields: [{ key: 'selectors', type: 'array', placeholder: '0x12345678' }] },
  { value: 'TOKEN_ALLOWLIST', label: 'Token Allowlist', configFields: [{ key: 'tokens', type: 'array', placeholder: '0x... (token address)' }] },
  { value: 'SPENDING_LIMIT_PER_TX', label: 'Spending Limit Per Tx', configFields: [{ key: 'maxUsd', type: 'number', placeholder: 'Max USD per tx' }] },
  { value: 'SPENDING_LIMIT_DAILY', label: 'Daily Spending Limit', configFields: [{ key: 'maxUsd', type: 'number', placeholder: 'Max USD per day' }] },
  { value: 'SPENDING_LIMIT_WEEKLY', label: 'Weekly Spending Limit', configFields: [{ key: 'maxUsd', type: 'number', placeholder: 'Max USD per week' }] },
  { value: 'REQUIRE_APPROVAL', label: 'Require Approval', configFields: [{ key: 'enabled', type: 'boolean' }] },
  { value: 'APPROVAL_THRESHOLD', label: 'Approval Threshold', configFields: [{ key: 'thresholdUsd', type: 'number', placeholder: 'USD threshold' }] },
];

export default function PolicyManager({ secretId }: { secretId: string }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState(POLICY_TYPES[0].value);
  const [configInput, setConfigInput] = useState('');

  const load = () => {
    listPolicies(secretId)
      .then((res) => setPolicies(res.data.data.policies))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [secretId]);

  const typeDef = POLICY_TYPES.find((t) => t.value === selectedType)!;

  const handleCreate = async () => {
    let config: unknown;
    const field = typeDef.configFields[0];

    if (field.type === 'array') {
      config = { [field.key]: configInput.split(',').map((s) => s.trim()).filter(Boolean) };
    } else if (field.type === 'number') {
      config = { [field.key]: parseFloat(configInput) };
    } else {
      config = { [field.key]: true };
    }

    try {
      await createPolicy(secretId, selectedType, config);
      setShowForm(false);
      setConfigInput('');
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

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Policies</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add Policy'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border rounded-lg p-4 mb-4">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Type</label>
            <select
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setConfigInput(''); }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {POLICY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {typeDef.configFields[0].type !== 'boolean' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {typeDef.configFields[0].type === 'array' ? 'Values (comma-separated)' : 'Value'}
              </label>
              <input
                value={configInput}
                onChange={(e) => setConfigInput(e.target.value)}
                placeholder={typeDef.configFields[0].placeholder}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}
          <button onClick={handleCreate} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700">
            Create
          </button>
        </div>
      )}

      {policies.length === 0 ? (
        <p className="text-gray-500 text-sm">No policies configured. All actions are allowed by default.</p>
      ) : (
        <div className="space-y-2">
          {policies.map((p) => (
            <div key={p.id} className="bg-white border rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{POLICY_TYPES.find((t) => t.value === p.policyType)?.label || p.policyType}</span>
                <pre className="text-xs text-gray-500 mt-1">{JSON.stringify(p.policyConfig, null, 2)}</pre>
              </div>
              <button onClick={() => handleDelete(p.id)} className="text-sm text-red-600 hover:text-red-800">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

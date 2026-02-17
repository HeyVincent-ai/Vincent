import { useEffect, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { getAdminVpsPool, addAdminVpsPool, deleteAdminVpsPool } from '../api';

interface VpsPoolEntry {
  id: string;
  ovhServiceName: string;
  createdAt: string;
}

export default function AdminVpsPool() {
  const [entries, setEntries] = useState<VpsPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = () => {
    setLoading(true);
    getAdminVpsPool()
      .then((res) => setEntries(res.data.data.entries))
      .catch(() => setError('Failed to load VPS pool.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    const name = newServiceName.trim();
    if (!name) return;
    setAdding(true);
    setAddError('');
    try {
      await addAdminVpsPool(name);
      setNewServiceName('');
      load();
    } catch {
      setAddError('Failed to add entry.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this VPS from the pool?')) return;
    try {
      await deleteAdminVpsPool(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert('Failed to delete entry.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground mb-8">VPS Pool</h1>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground mb-8">VPS Pool</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-8">VPS Pool</h1>

      {/* Add form */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6">
        <p className="text-sm font-medium text-foreground mb-3">Add VPS to pool</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="vps-xxxxxxxx.vps.ovh.us"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newServiceName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
        {addError && <p className="text-destructive text-xs mt-2">{addError}</p>}
      </div>

      {/* Pool table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{entries.length} entries</span>
        </div>
        {entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            No VPSes in pool
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">OVH Service Name</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-foreground font-mono text-xs">
                    {entry.ovhServiceName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove from pool"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

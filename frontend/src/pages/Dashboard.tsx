import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserSecrets } from '../api';

interface Secret {
  id: string;
  type: string;
  memo: string | null;
  walletAddress?: string;
  chainId?: number;
  createdAt: string;
}

export default function Dashboard() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserSecrets()
      .then((res) => setSecrets(res.data.data.secrets))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Your Secrets</h1>
      {secrets.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          <p>No secrets yet. Secrets appear here after an agent creates one and you claim it.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {secrets.map((s) => (
            <Link
              key={s.id}
              to={`/secrets/${s.id}`}
              className="bg-white rounded-lg border p-4 hover:border-blue-300 transition-colors block"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded mr-2">
                    {s.type}
                  </span>
                  <span className="text-gray-900 font-medium">{s.memo || 'Unnamed secret'}</span>
                </div>
                <span className="text-gray-400 text-sm">{new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
              {s.walletAddress && (
                <p className="text-sm text-gray-500 mt-1 font-mono">{s.walletAddress}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

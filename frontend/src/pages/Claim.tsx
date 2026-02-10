import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { claimSecret } from '../api';
import { useAuth } from '../auth';

export default function Claim() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<'idle' | 'claiming' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const token = searchParams.get('token') || '';

  useEffect(() => {
    if (!user) return;
    if (!id || !token) {
      setError('Invalid claim link.');
      setStatus('error');
    }
  }, [user, id, token]);

  const handleClaim = async () => {
    if (!id || !token) return;
    setStatus('claiming');
    try {
      await claimSecret(id, token);
      setStatus('success');
      setTimeout(() => navigate(`/secrets/${id}`), 2000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Failed to claim secret';
      setError(msg);
      setStatus('error');
    }
  };

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-2">Sign in to claim this secret</h2>
          <p className="text-gray-600 mb-4">You need to be authenticated to claim a secret.</p>
          <a
            href="/login"
            onClick={() => {
              localStorage.setItem(
                'pendingClaim',
                JSON.stringify({
                  url: window.location.pathname + window.location.search,
                  expiresAt: Date.now() + 15 * 60 * 1000,
                })
              );
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 inline-block"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md w-full text-center">
        {status === 'success' ? (
          <>
            <h2 className="text-xl font-semibold text-green-600 mb-2">Secret Claimed!</h2>
            <p className="text-gray-600">Redirecting to your secret...</p>
          </>
        ) : status === 'error' ? (
          <>
            <h2 className="text-xl font-semibold text-red-600 mb-2">Claim Failed</h2>
            <p className="text-gray-600">{error}</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-2">Claim Secret</h2>
            <p className="text-gray-600 mb-4">
              You are about to claim ownership of this secret as <strong>{user.email}</strong>.
            </p>
            <button
              onClick={handleClaim}
              disabled={status === 'claiming'}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'claiming' ? 'Claiming...' : 'Claim Secret'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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
        <div className="bg-card p-8 rounded-lg border border-border max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Sign in to claim this secret</h2>
          <p className="text-muted-foreground mb-4">You need to be authenticated to claim a secret.</p>
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
            className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 inline-block transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-card p-8 rounded-lg border border-border max-w-md w-full text-center">
        {status === 'success' ? (
          <>
            <h2 className="text-xl font-semibold text-green-400 mb-2">Secret Claimed!</h2>
            <p className="text-muted-foreground">Redirecting to your secret...</p>
          </>
        ) : status === 'error' ? (
          <>
            <h2 className="text-xl font-semibold text-destructive mb-2">Claim Failed</h2>
            <p className="text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-foreground mb-2">Claim Secret</h2>
            <p className="text-muted-foreground mb-4">
              You are about to claim ownership of this secret as <strong className="text-foreground">{user.email}</strong>.
            </p>
            <button
              onClick={handleClaim}
              disabled={status === 'claiming'}
              className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {status === 'claiming' ? 'Claiming...' : 'Claim Secret'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

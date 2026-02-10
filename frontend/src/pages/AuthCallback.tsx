import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStytch } from '@stytch/react';
import { useAuth } from '../auth';
import { syncSession } from '../api';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const stytch = useStytch();
  const [error, setError] = useState('');
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const tokenType = params.get('stytch_token_type');

    if (!token || !tokenType) {
      setError('Missing authentication token');
      return;
    }

    let authPromise: Promise<{ session_token: string }>;

    if (tokenType === 'magic_links') {
      authPromise = stytch.magicLinks.authenticate(token, {
        session_duration_minutes: 44640, // 31 days,
      }) as Promise<{ session_token: string }>;
    } else if (tokenType === 'oauth') {
      authPromise = stytch.oauth.authenticate(token, {
        session_duration_minutes: 44640, // 31 days,
      }) as Promise<{ session_token: string }>;
    } else {
      setError(`Unknown token type: ${tokenType}`);
      return;
    }

    authPromise
      .then((resp) => {
        const sessionToken = resp.session_token;
        return syncSession(sessionToken).then((res) => {
          const { user } = res.data.data;
          setSession(sessionToken, user);

          const pending = localStorage.getItem('pendingClaim');
          if (pending) {
            try {
              const { url, expiresAt } = JSON.parse(pending);
              localStorage.removeItem('pendingClaim');
              if (Date.now() < expiresAt) {
                navigate(url);
                return;
              }
            } catch {
              localStorage.removeItem('pendingClaim');
            }
          }
          navigate('/dashboard');
        });
      })
      .catch((err) => {
        console.error('Auth callback error:', err);
        setError('Authentication failed. Please try again.');
      });
  }, [stytch, navigate, setSession]);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Authentication Failed</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-gray-600">Authenticating...</p>
    </div>
  );
}

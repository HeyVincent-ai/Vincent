import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authenticate } from '../api';
import { useAuth } from '../auth';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Missing authentication token');
      return;
    }

    authenticate(token)
      .then((res) => {
        const { user, sessionToken } = res.data.data;
        setSession(sessionToken, user);
        navigate('/');
      })
      .catch(() => {
        setError('Authentication failed. The link may have expired.');
      });
  }, [searchParams, navigate, setSession]);

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

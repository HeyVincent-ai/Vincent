import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getProfile } from './api';

interface User {
  id: string;
  email: string;
  telegramUsername: string | null;
  telegramLinked: boolean;
  createdAt: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  setSession: (token: string, user: User) => void;
  clearSession: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  setSession: () => {},
  clearSession: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await getProfile();
      setUser(res.data.data.user);
    } catch {
      setUser(null);
      localStorage.removeItem('sessionToken');
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    if (token) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const setSession = (token: string, u: User) => {
    localStorage.setItem('sessionToken', token);
    setUser(u);
  };

  const clearSession = () => {
    localStorage.removeItem('sessionToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setSession, clearSession, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

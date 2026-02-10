import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout, { FullWidthLayout } from './components/Layout';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import SecretDetail from './pages/SecretDetail';
import Settings from './pages/Settings';
import Claim from './pages/Claim';
import Billing from './pages/Billing';
import OpenClawDetail from './pages/OpenClawDetail';
import Landing from './pages/Landing';
import Features from './pages/Features';
import Security from './pages/Security';
import Skills from './pages/Skills';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/features" element={<Features />} />
      <Route path="/security" element={<Security />} />
      <Route path="/skills" element={<Skills />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/claim/:id" element={<Claim />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/secrets/:id" element={<ProtectedRoute><SecretDetail /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
      </Route>
      <Route element={<FullWidthLayout />}>
        <Route path="/openclaw/:id" element={<ProtectedRoute><OpenClawDetail /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

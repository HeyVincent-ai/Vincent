import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import SecretDetail from './pages/SecretDetail';
import Account from './pages/Account';
import Claim from './pages/Claim';
import Agents from './pages/Agents';
import AgentsConnect from './pages/AgentsConnect';
import AgentsLayout from './pages/AgentsLayout';
import OpenClawDetail from './pages/OpenClawDetail';
import Landing from './pages/Landing';
import Features from './pages/Features';
import Security from './pages/Security';
import Skills from './pages/Skills';
import Terms from './pages/Terms';
import AdminReferrals from './pages/AdminReferrals';
import UIPreview from './pages/UIPreview';
import AdminDashboard from './pages/AdminDashboard';
import AdminVpsPool from './pages/AdminVpsPool';
import AdminWallets from './pages/AdminWallets';
import AdminActiveAgents from './pages/AdminActiveAgents';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  // Capture referral code from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('referralCode', ref);
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/features" element={<Features />} />
      <Route path="/security" element={<Security />} />
      <Route path="/skills" element={<Skills />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/preview" element={<UIPreview />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/claim/:id" element={<Claim />} />
      <Route element={<Layout />}>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents"
          element={
            <ProtectedRoute>
              <AgentsLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Agents />} />
          <Route path="connect" element={<AgentsConnect />} />
        </Route>
        <Route
          path="/secrets/:id"
          element={
            <ProtectedRoute>
              <SecretDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />
        <Route
          path="/openclaw/:id"
          element={
            <ProtectedRoute>
              <OpenClawDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/referrals"
          element={
            <AdminRoute>
              <AdminReferrals />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/vps-pool"
          element={
            <AdminRoute>
              <AdminVpsPool />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/wallets"
          element={
            <AdminRoute>
              <AdminWallets />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/active-agents"
          element={
            <AdminRoute>
              <AdminActiveAgents />
            </AdminRoute>
          }
        />
      </Route>
      {/* Redirects for old routes */}
      <Route path="/settings" element={<Navigate to="/account" replace />} />
      <Route path="/billing" element={<Navigate to="/account" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

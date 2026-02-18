import { Navigate, Route } from 'react-router-dom';
import { useAuth } from '../auth';
import AdminDashboard from './pages/AdminDashboard';
import AdminReferrals from './pages/AdminReferrals';
import AdminVpsPool from './pages/AdminVpsPool';
import AdminWallets from './pages/AdminWallets';
import AdminActiveAgents from './pages/AdminActiveAgents';

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function adminRoutes() {
  return (
    <>
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
    </>
  );
}

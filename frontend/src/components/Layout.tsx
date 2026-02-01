import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { logout } from '../api';

export default function Layout() {
  const { user, clearSession } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    clearSession();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="text-xl font-bold text-gray-900">SafeSkills</Link>
          {user && (
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
              <Link to="/billing" className="text-sm text-gray-600 hover:text-gray-900">Billing</Link>
              <Link to="/settings" className="text-sm text-gray-600 hover:text-gray-900">Settings</Link>
              <span className="text-sm text-gray-400">{user.email}</span>
              <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800">Logout</button>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/vincent-logo.svg" alt="Vincent" className="h-5" />
          </Link>
          {user && (
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link to="/billing" className="text-sm text-gray-600 hover:text-gray-900">
                Billing
              </Link>
              <Link to="/settings" className="text-sm text-gray-600 hover:text-gray-900">
                Settings
              </Link>
              <span className="text-sm text-gray-400">{user.email}</span>
              <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800">
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-8 flex-1">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <a
            href="mailto:support@litprotocol.com"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Support: support@litprotocol.com
          </a>
        </div>
      </footer>
    </div>
  );
}

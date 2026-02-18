import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Bot, LogOut, Menu, X, Server, Wallet, Activity, Users } from 'lucide-react';
import { useState } from 'react';
import { useStytch } from '@stytch/react';
import { useAuth } from '../auth';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Accounts', icon: KeyRound },
  { to: '/agents', label: 'Agents', icon: Bot },
];

const ADMIN_NAV_ITEMS = [
  { to: '/admin/vps-pool', label: 'VPS Pool', icon: Server },
  { to: '/admin/wallets', label: 'Wallets', icon: Wallet },
  { to: '/admin/active-agents', label: 'Active Agents', icon: Activity },
  { to: '/admin/referrals', label: 'Referrals', icon: Users },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, clearSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const stytch = useStytch();

  const handleLogout = async () => {
    try {
      // stytch.session.revoke() calls the Stytch API to revoke the session AND
      // clears the SDK's cached session state, preventing "unauthorized_credentials"
      // errors on the next login attempt.
      await stytch.session.revoke();
    } catch {
      // ignore — clear local state regardless
    }
    clearSession();
    navigate('/login');
  };

  const initial = user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5">
        <Link to="/dashboard" className="flex items-center" onClick={onNavigate}>
          <img
            src="/vincent-logo.svg"
            alt="Vincent"
            className="h-5 text-foreground"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 mt-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />
              )}
              <Icon className="w-5 h-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        {user?.isAdmin && (
          <>
            <div className="mt-4 mb-1 px-3">
              <Link
                to="/admin"
                className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors"
              >
                Admin
              </Link>
            </div>
            {ADMIN_NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />
                  )}
                  <Icon className="w-5 h-5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User section */}
      {user && (
        <div className="px-3 pb-4 mt-auto border-t border-border pt-4">
          <Link
            to="/account"
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              location.pathname === '/account'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-bold">{initial}</span>
            </div>
            <span className="truncate">{user.email}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-muted transition-colors w-full mt-1"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <button
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Link to="/dashboard">
          <img
            src="/vincent-logo.svg"
            alt="Vincent"
            className="h-4"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </Link>
        <div className="w-6" /> {/* spacer for centering */}
      </div>

      {/* Slide-out drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border z-50 md:hidden">
            <div className="absolute top-4 right-4">
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}

export default function AppSidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 border-r border-border bg-card">
      <div className="w-64 fixed inset-y-0 left-0 overflow-y-auto">
        <SidebarContent />
      </div>
    </aside>
  );
}

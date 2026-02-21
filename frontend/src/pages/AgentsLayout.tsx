import { Link, Outlet, useLocation } from 'react-router-dom';

export default function AgentsLayout() {
  const location = useLocation();
  const onConnect = location.pathname.startsWith('/agents/connect');

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Link
          to="/agents"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            !onConnect
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
          }`}
        >
          Deploy Agent
        </Link>
        <Link
          to="/agents/connect"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            onConnect
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
          }`}
        >
          Connect Agent
        </Link>
      </div>

      <Outlet />
    </div>
  );
}

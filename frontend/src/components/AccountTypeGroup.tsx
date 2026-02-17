import { useState, type ComponentType } from 'react';
import AccountCard from './AccountCard';
import type { Account } from './AccountCard';

interface AccountTypeGroupProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  accounts: Account[];
  onReceive?: (account: Account) => void;
}

export default function AccountTypeGroup({ label, icon: Icon, accounts, onReceive }: AccountTypeGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-1 px-3 py-1.5 w-full text-left group rounded-md hover:bg-muted/30 transition-colors"
      >
        <svg
          className={`w-3 h-3 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{accounts.length}</span>
      </button>
      {!collapsed && (
        <div className="ml-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} onReceive={onReceive} />
          ))}
        </div>
      )}
    </section>
  );
}

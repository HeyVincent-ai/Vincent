import { Link } from 'react-router-dom';
import { Server, Wallet, Activity, Users } from 'lucide-react';

const ADMIN_SECTIONS = [
  {
    to: '/admin/vps-pool',
    label: 'VPS Pool',
    description: 'Manage pre-provisioned VPS instances for agent deployments.',
    icon: Server,
  },
  {
    to: '/admin/wallets',
    label: 'Wallets',
    description: 'View user wallet addresses with DeBank links.',
    icon: Wallet,
  },
  {
    to: '/admin/active-agents',
    label: 'Active Agents',
    description: 'Monitor all active agent deployments and subscription status.',
    icon: Activity,
  },
  {
    to: '/admin/referrals',
    label: 'Referrals',
    description: 'Track referral activity and reward fulfillment.',
    icon: Users,
  },
];

export default function AdminDashboard() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-2">Admin</h1>
      <p className="text-muted-foreground text-sm mb-8">Internal management tools.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ADMIN_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.to}
              to={section.to}
              className="bg-card border border-border rounded-lg p-5 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <Icon className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">{section.label}</span>
              </div>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

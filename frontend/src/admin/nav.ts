import { Server, Wallet, Activity, Users } from 'lucide-react';

export const ADMIN_NAV_ITEMS = [
  { to: '/admin/vps-pool', label: 'VPS Pool', icon: Server },
  { to: '/admin/wallets', label: 'Wallets', icon: Wallet },
  { to: '/admin/active-agents', label: 'Active Agents', icon: Activity },
  { to: '/admin/referrals', label: 'Referrals', icon: Users },
];

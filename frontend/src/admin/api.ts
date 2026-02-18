import api from '../api';

// Admin - Referrals
export const getAdminReferrals = () => api.get('/admin/referrals');

// Admin - VPS Pool
export const getAdminVpsPool = () => api.get('/admin/vps-pool');
export const addAdminVpsPool = (ovhServiceName: string) =>
  api.post('/admin/vps-pool', { ovhServiceName });
export const deleteAdminVpsPool = (id: string) => api.delete(`/admin/vps-pool/${id}`);

// Admin - Wallets
export const getAdminWallets = () => api.get('/admin/wallets');

// Admin - Active Agents
export const getAdminActiveAgents = () => api.get('/admin/active-agents');

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sessionToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.startsWith('/auth/')) {
      localStorage.removeItem('sessionToken');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const syncSession = (sessionToken: string) =>
  api.post('/auth/session', { sessionToken });

export const logout = () => api.post('/auth/logout');

// User
export const getProfile = () => api.get('/user/profile');
export const getUserSecrets = () => api.get('/user/secrets');
export const updateTelegram = (telegramUsername: string) =>
  api.put('/user/telegram', { telegramUsername });
export const generateTelegramLink = () => api.post('/user/telegram/link');

// Secrets
export const createSecret = (type: string, memo?: string) =>
  api.post('/secrets', { type, memo });
export const getSecret = (id: string) => api.get(`/secrets/${id}`);
export const claimSecret = (id: string, claimToken: string) =>
  api.post(`/secrets/${id}/claim`, { claimToken });
export const deleteSecret = (id: string) => api.delete(`/secrets/${id}`);

// API Keys
export const listApiKeys = (secretId: string) => api.get(`/secrets/${secretId}/api-keys`);
export const createApiKey = (secretId: string, name: string) =>
  api.post(`/secrets/${secretId}/api-keys`, { name });
export const revokeApiKey = (secretId: string, keyId: string) =>
  api.delete(`/secrets/${secretId}/api-keys/${keyId}`);

// Policies
export const listPolicies = (secretId: string) =>
  api.get(`/secrets/${secretId}/policies`);
export const createPolicy = (secretId: string, policyType: string, policyConfig: unknown) =>
  api.post(`/secrets/${secretId}/policies`, { policyType, policyConfig });
export const updatePolicy = (secretId: string, policyId: string, policyConfig: unknown) =>
  api.put(`/secrets/${secretId}/policies/${policyId}`, { policyConfig });
export const deletePolicy = (secretId: string, policyId: string) =>
  api.delete(`/secrets/${secretId}/policies/${policyId}`);

// Audit Logs
export const listAuditLogs = (secretId: string, params?: { action?: string; status?: string; page?: number; limit?: number }) =>
  api.get(`/secrets/${secretId}/audit-logs`, { params });
export const getAuditLog = (secretId: string, logId: string) =>
  api.get(`/secrets/${secretId}/audit-logs/${logId}`);
export const getAuditLogActions = (secretId: string) =>
  api.get(`/secrets/${secretId}/audit-logs/actions`);
export const exportAuditLogs = (secretId: string, format: 'json' | 'csv', params?: { action?: string; status?: string }) =>
  api.get(`/secrets/${secretId}/audit-logs/export`, { params: { ...params, format }, responseType: format === 'csv' ? 'blob' : undefined });

// Billing
export const getSubscription = () => api.get('/billing/subscription');
export const subscribe = (successUrl: string, cancelUrl: string) =>
  api.post('/billing/subscribe', { successUrl, cancelUrl });
export const cancelSubscription = () => api.post('/billing/cancel');
export const getUsage = () => api.get('/billing/usage');
export const getUsageHistory = () => api.get('/billing/usage/history');
export const getInvoices = () => api.get('/billing/invoices');

export default api;

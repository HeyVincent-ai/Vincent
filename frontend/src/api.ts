import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
      // Don't hard redirect - let React Router handle navigation
      // This prevents unwanted redirects on public pages like the landing page
    }
    return Promise.reject(err);
  }
);

// Auth
export const syncSession = (sessionToken: string) => api.post('/auth/session', { sessionToken });

export const logout = () => api.post('/auth/logout');

// User
export const getProfile = () => api.get('/user/profile');
export const getUserSecrets = () => api.get('/user/secrets');
export const updateTelegram = (telegramUsername: string) =>
  api.put('/user/telegram', { telegramUsername });
export const generateTelegramLink = () => api.post('/user/telegram/link');

// Secrets
export const createSecret = (type: string, memo?: string) => api.post('/secrets', { type, memo });
export const getSecret = (id: string) => api.get(`/secrets/${id}`);
export const claimSecret = (id: string, claimToken: string) =>
  api.post(`/secrets/${id}/claim`, { claimToken });
export const deleteSecret = (id: string) => api.delete(`/secrets/${id}`);
export const generateRelinkToken = (secretId: string) =>
  api.post(`/secrets/${secretId}/relink-token`);
export const getSubscriptionStatus = (secretId: string) =>
  api.get(`/secrets/${secretId}/subscription-status`);

// API Keys
export const listApiKeys = (secretId: string) => api.get(`/secrets/${secretId}/api-keys`);
export const createApiKey = (secretId: string, name: string) =>
  api.post(`/secrets/${secretId}/api-keys`, { name });
export const revokeApiKey = (secretId: string, keyId: string) =>
  api.delete(`/secrets/${secretId}/api-keys/${keyId}`);

// Policies
export const listPolicies = (secretId: string) => api.get(`/secrets/${secretId}/policies`);
export const createPolicy = (secretId: string, policyType: string, policyConfig: unknown) =>
  api.post(`/secrets/${secretId}/policies`, { policyType, policyConfig });
export const updatePolicy = (secretId: string, policyId: string, policyConfig: unknown) =>
  api.put(`/secrets/${secretId}/policies/${policyId}`, { policyConfig });
export const deletePolicy = (secretId: string, policyId: string) =>
  api.delete(`/secrets/${secretId}/policies/${policyId}`);

// Audit Logs
export const listAuditLogs = (
  secretId: string,
  params?: { action?: string; status?: string; page?: number; limit?: number }
) => api.get(`/secrets/${secretId}/audit-logs`, { params });
export const getAuditLog = (secretId: string, logId: string) =>
  api.get(`/secrets/${secretId}/audit-logs/${logId}`);
export const getAuditLogActions = (secretId: string) =>
  api.get(`/secrets/${secretId}/audit-logs/actions`);
export const exportAuditLogs = (
  secretId: string,
  format: 'json' | 'csv',
  params?: { action?: string; status?: string }
) =>
  api.get(`/secrets/${secretId}/audit-logs/export`, {
    params: { ...params, format },
    responseType: format === 'csv' ? 'blob' : undefined,
  });

// Balances (Alchemy Portfolio)
export const getSecretBalances = (secretId: string, chainIds?: number[]) =>
  api.get(`/secrets/${secretId}/balances`, {
    params: chainIds ? { chainIds: chainIds.join(',') } : undefined,
  });

// Swap
export const previewSwap = (
  secretId: string,
  data: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    chainId: number;
    slippageBps?: number;
  }
) => api.post(`/secrets/${secretId}/swap/preview`, data);
export const executeSwap = (
  secretId: string,
  data: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    chainId: number;
    slippageBps?: number;
  }
) => api.post(`/secrets/${secretId}/swap/execute`, data);

// OpenClaw
export const deployOpenClaw = (successUrl: string, cancelUrl: string) =>
  api.post('/openclaw/deploy', { successUrl, cancelUrl });
export const getOpenClawDeployments = () => api.get('/openclaw/deployments');
export const getOpenClawDeployment = (id: string) => api.get(`/openclaw/deployments/${id}`);
export const cancelOpenClawDeployment = (id: string) =>
  api.post(`/openclaw/deployments/${id}/cancel`);
export const destroyOpenClawDeployment = (id: string) => api.delete(`/openclaw/deployments/${id}`);
export const restartOpenClawDeployment = (id: string) =>
  api.post(`/openclaw/deployments/${id}/restart`);
export const retryOpenClawDeployment = (id: string) =>
  api.post(`/openclaw/deployments/${id}/retry`);
export const reprovisionOpenClawDeployment = (id: string) =>
  api.post(`/openclaw/deployments/${id}/reprovision`);
export const downloadOpenClawSshKey = (id: string) =>
  api.get(`/openclaw/deployments/${id}/ssh-key`, { responseType: 'blob' });
export const getOpenClawUsage = (id: string) => api.get(`/openclaw/deployments/${id}/usage`);
export const addOpenClawCredits = (id: string, amountUsd: number) =>
  api.post(`/openclaw/deployments/${id}/credits`, { amountUsd });
export const setupOpenClawTelegram = (id: string, botToken: string) =>
  api.post(`/openclaw/deployments/${id}/telegram/setup`, { botToken });
export const pairOpenClawTelegram = (id: string, code: string) =>
  api.post(`/openclaw/deployments/${id}/telegram/pair`, { code });

// Strategies
export const listStrategies = (deploymentId: string) =>
  api.get(`/openclaw/deployments/${deploymentId}/strategies`);
export const createStrategy = (
  deploymentId: string,
  data: {
    strategyType: string;
    templateId?: string | null;
    thesisText: string;
    conditionTokenId?: string | null;
    strategyConfig: Record<string, unknown>;
    riskProfile?: string;
  }
) => api.post(`/openclaw/deployments/${deploymentId}/strategies`, data);
export const getStrategy = (deploymentId: string, strategyId: string) =>
  api.get(`/openclaw/deployments/${deploymentId}/strategies/${strategyId}`);
export const updateStrategy = (
  deploymentId: string,
  strategyId: string,
  data: {
    thesisText?: string;
    conditionTokenId?: string | null;
    strategyConfig?: Record<string, unknown>;
    riskProfile?: string;
    status?: string;
  }
) => api.put(`/openclaw/deployments/${deploymentId}/strategies/${strategyId}`, data);
export const deleteStrategy = (deploymentId: string, strategyId: string) =>
  api.delete(`/openclaw/deployments/${deploymentId}/strategies/${strategyId}`);
export const getStrategyTemplates = (deploymentId: string) =>
  api.get(`/openclaw/deployments/${deploymentId}/strategies/templates`);

// Alert Rules
export const listAlertRules = (deploymentId: string, strategyId: string) =>
  api.get(`/openclaw/deployments/${deploymentId}/strategies/${strategyId}/alerts`);
export const createAlertRule = (
  deploymentId: string,
  strategyId: string,
  data: { triggerType: string; triggerConfig: unknown; instruction: string; enabled?: boolean }
) => api.post(`/openclaw/deployments/${deploymentId}/strategies/${strategyId}/alerts`, data);
export const updateAlertRule = (
  deploymentId: string,
  strategyId: string,
  alertId: string,
  data: { triggerConfig?: unknown; instruction?: string; enabled?: boolean }
) =>
  api.put(
    `/openclaw/deployments/${deploymentId}/strategies/${strategyId}/alerts/${alertId}`,
    data
  );
export const deleteAlertRule = (deploymentId: string, strategyId: string, alertId: string) =>
  api.delete(
    `/openclaw/deployments/${deploymentId}/strategies/${strategyId}/alerts/${alertId}`
  );

// Billing
export const getSubscription = () => api.get('/billing/subscription');
export const subscribe = (successUrl: string, cancelUrl: string) =>
  api.post('/billing/subscribe', { successUrl, cancelUrl });
export const cancelSubscription = () => api.post('/billing/cancel');
export const getUsage = () => api.get('/billing/usage');
export const getUsageHistory = () => api.get('/billing/usage/history');
export const getInvoices = () => api.get('/billing/invoices');

export default api;

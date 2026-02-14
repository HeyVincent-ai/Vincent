import { Router } from 'express';
import secretsRouter from './secrets.routes.js';
import apiKeysRouter from './apiKeys.routes.js';
import policiesRouter from './policies.routes.js';
import authRouter from './auth.routes.js';
import userRouter from './user.routes.js';
import evmWalletRouter from './evmWallet.routes.js';
import polymarketRouter from './polymarket.routes.js';
import rawSignerRouter from './rawSigner.routes.js';
import alpacaIntegrationsRouter from './alpacaIntegrations.routes.js';
import tradingGuardrailsRouter from './tradingGuardrails.routes.js';
import alpacaTradingRouter from './alpacaTrading.routes.js';
import billingRouter from './billing.routes.js';
import auditLogsRouter from './auditLogs.routes.js';
import openclawRouter from './openclaw.routes.js';
import adminRouter from './admin.routes.js';

const router = Router();

// Mount routes
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/secrets', secretsRouter);
router.use('/secrets', apiKeysRouter); // API key routes are nested under /secrets/:secretId/api-keys
router.use('/secrets/:secretId/policies', policiesRouter); // Policy routes nested under /secrets/:secretId/policies
router.use('/secrets/:secretId/audit-logs', auditLogsRouter); // Audit log routes
router.use('/skills/evm-wallet', evmWalletRouter); // EVM wallet skill endpoints
router.use('/skills/polymarket', polymarketRouter); // Polymarket skill endpoints
router.use('/skills/raw-signer', rawSignerRouter); // Raw signer skill endpoints
router.use('/integrations/alpaca', alpacaIntegrationsRouter); // Alpaca integrations
router.use('/guardrails/trading', tradingGuardrailsRouter); // Trading policies for Alpaca
router.use('/trading/alpaca', alpacaTradingRouter); // Alpaca trade intent gateway
router.use('/billing', billingRouter); // Billing & subscription endpoints
router.use('/openclaw', openclawRouter); // OpenClaw VPS deployment endpoints
router.use('/admin', adminRouter); // Admin dashboard endpoints

export default router;

import { Router } from 'express';
import secretsRouter from './secrets.routes.js';
import apiKeysRouter from './apiKeys.routes.js';
import policiesRouter from './policies.routes.js';
import authRouter from './auth.routes.js';
import userRouter from './user.routes.js';
import evmWalletRouter from './evmWallet.routes.js';
import polymarketRouter from './polymarket.routes.js';
import rawSignerRouter from './rawSigner.routes.js';
import billingRouter from './billing.routes.js';
import auditLogsRouter from './auditLogs.routes.js';
import openclawRouter from './openclaw.routes.js';
import ownershipRouter from './ownership.routes.js';
import dataSourceManagementRouter from './dataSourceManagement.routes.js';
import dataSourceProxyRouter from '../../dataSources/router.js';
import rawRouter from './raw.routes.js';
import readOnlyTokensRouter from './readOnlyTokens.routes.js';

const router = Router();

// Mount routes
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/secrets', secretsRouter);
router.use('/secrets', apiKeysRouter); // API key routes are nested under /secrets/:secretId/api-keys
router.use('/secrets/:secretId/policies', policiesRouter); // Policy routes nested under /secrets/:secretId/policies
router.use('/secrets/:secretId/audit-logs', auditLogsRouter); // Audit log routes
router.use('/secrets/:secretId/take-ownership', ownershipRouter); // Ownership transfer routes
router.use('/skills/evm-wallet', evmWalletRouter); // EVM wallet skill endpoints
router.use('/skills/polymarket', polymarketRouter); // Polymarket skill endpoints
router.use('/skills/raw-signer', rawSignerRouter); // Raw signer skill endpoints
router.use('/billing', billingRouter); // Billing & subscription endpoints
router.use('/openclaw', openclawRouter); // OpenClaw VPS deployment endpoints
router.use('/secrets/:secretId/data-sources', dataSourceManagementRouter); // Data source management (session auth)
router.use('/data-sources', dataSourceProxyRouter); // Data source proxy endpoints (API key auth)
router.use('/raw', rawRouter); // Read-only raw endpoints
router.use('/read-only-tokens', readOnlyTokensRouter); // Read-only token mint + management

export default router;

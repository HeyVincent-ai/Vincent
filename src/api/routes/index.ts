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
router.use('/billing', billingRouter); // Billing & subscription endpoints
router.use('/openclaw', openclawRouter); // OpenClaw VPS deployment endpoints

export default router;

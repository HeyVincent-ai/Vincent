import { Router } from 'express';
import secretsRouter from './secrets.routes';
import apiKeysRouter from './apiKeys.routes';
import policiesRouter from './policies.routes';
import authRouter from './auth.routes';
import userRouter from './user.routes';
import evmWalletRouter from './evmWallet.routes';
import polymarketRouter from './polymarket.routes';
import billingRouter from './billing.routes';
import auditLogsRouter from './auditLogs.routes';

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
router.use('/billing', billingRouter); // Billing & subscription endpoints

export default router;

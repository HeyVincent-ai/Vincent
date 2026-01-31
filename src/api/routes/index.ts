import { Router } from 'express';
import secretsRouter from './secrets.routes';
import apiKeysRouter from './apiKeys.routes';

const router = Router();

// Mount routes
router.use('/secrets', secretsRouter);
router.use('/secrets', apiKeysRouter); // API key routes are nested under /secrets/:secretId/api-keys

export default router;

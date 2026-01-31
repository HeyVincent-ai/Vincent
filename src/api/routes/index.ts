import { Router } from 'express';
import secretsRouter from './secrets.routes';
import apiKeysRouter from './apiKeys.routes';
import policiesRouter from './policies.routes';
import authRouter from './auth.routes';
import userRouter from './user.routes';

const router = Router();

// Mount routes
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/secrets', secretsRouter);
router.use('/secrets', apiKeysRouter); // API key routes are nested under /secrets/:secretId/api-keys
router.use('/secrets/:secretId/policies', policiesRouter); // Policy routes nested under /secrets/:secretId/policies

export default router;

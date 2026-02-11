import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { apiKeyAuthMiddleware } from '../api/middleware/apiKeyAuth.js';
import { dataSourceGuard } from './middleware.js';
import { AuthenticatedRequest } from '../types/index.js';
import twitterRouter from './twitter/routes.js';
import braveRouter from './brave/routes.js';

const router = Router();

// All data source proxy routes: API key auth → data source guard
router.use(apiKeyAuthMiddleware);
router.use(dataSourceGuard);

// Per-API-key rate limiting: 60 requests/minute
const dataSourceRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.apiKey?.id ?? req.ip ?? 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Limit: 60 per minute per API key.',
    },
  },
});

router.use(dataSourceRateLimiter);

// Mount data source routes
router.use('/twitter', twitterRouter);
router.use('/brave', braveRouter);

export default router;

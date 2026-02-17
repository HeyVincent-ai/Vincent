import { Router, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as authService from '../../services/auth.service.js';

const router = Router();

// Strict rate limiter for auth endpoints (10 per IP per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many auth requests. Try again later.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const sessionSchema = z.object({
  sessionToken: z.string().min(1),
  referralCode: z.string().max(20).optional(),
});

/**
 * POST /api/auth/session
 * Validate a Stytch session token and return/create the user in our DB
 * Called by the frontend after the Stytch UI SDK authenticates the user
 */
router.post(
  '/session',
  authLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = sessionSchema.parse(req.body);

    const user = await authService.syncSession(body.sessionToken, body.referralCode);

    if (!user) {
      errors.unauthorized(res, 'Invalid session');
      return;
    }

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        telegramUsername: user.telegramUsername,
        createdAt: user.createdAt,
      },
    });
  })
);

/**
 * POST /api/auth/logout
 * Revoke the current session
 */
router.post(
  '/logout',
  sessionAuthMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    const sessionToken =
      authHeader?.split(' ')[1] || (req.headers['x-session-token'] as string | undefined);

    if (!sessionToken) {
      errors.badRequest(res, 'No session token found');
      return;
    }

    await authService.revokeSession(sessionToken);

    sendSuccess(res, { message: 'Logged out' });
  })
);

export default router;

import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { sessionAuthMiddleware } from '../middleware/sessionAuth';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, errors } from '../../utils/response';
import * as authService from '../../services/auth.service';

const router = Router();

const sessionSchema = z.object({
  sessionToken: z.string().min(1),
});

/**
 * POST /api/auth/session
 * Validate a Stytch session token and return/create the user in our DB
 * Called by the frontend after the Stytch UI SDK authenticates the user
 */
router.post(
  '/session',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = sessionSchema.parse(req.body);

    const user = await authService.syncSession(body.sessionToken);

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
      authHeader?.split(' ')[1] ||
      (req.headers['x-session-token'] as string | undefined);

    if (!sessionToken) {
      errors.badRequest(res, 'No session token found');
      return;
    }

    await authService.revokeSession(sessionToken);

    sendSuccess(res, { message: 'Logged out' });
  })
);

export default router;

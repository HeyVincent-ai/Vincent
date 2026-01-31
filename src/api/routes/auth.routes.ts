import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { sessionAuthMiddleware } from '../middleware/sessionAuth';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, errors } from '../../utils/response';
import * as authService from '../../services/auth.service';

const router = Router();

const sendMagicLinkSchema = z.object({
  email: z.string().email(),
  redirectUrl: z.string().url(),
});

const authenticateSchema = z.object({
  token: z.string().min(1),
});

/**
 * POST /api/auth/magic-link
 * Send a magic link to the user's email
 */
router.post(
  '/magic-link',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = sendMagicLinkSchema.parse(req.body);

    await authService.sendMagicLink(body.email, body.redirectUrl);

    sendSuccess(res, { message: 'Magic link sent' });
  })
);

/**
 * POST /api/auth/authenticate
 * Authenticate a magic link token
 */
router.post(
  '/authenticate',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = authenticateSchema.parse(req.body);

    const result = await authService.authenticateMagicLink(body.token);

    sendSuccess(res, {
      user: {
        id: result.user.id,
        email: result.user.email,
        telegramUsername: result.user.telegramUsername,
        createdAt: result.user.createdAt,
      },
      sessionToken: result.sessionToken,
    });
  })
);

/**
 * POST /api/auth/oauth
 * Authenticate an OAuth callback token
 */
router.post(
  '/oauth',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = authenticateSchema.parse(req.body);

    const result = await authService.authenticateOAuth(body.token);

    sendSuccess(res, {
      user: {
        id: result.user.id,
        email: result.user.email,
        telegramUsername: result.user.telegramUsername,
        createdAt: result.user.createdAt,
      },
      sessionToken: result.sessionToken,
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

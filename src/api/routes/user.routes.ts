import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import prisma from '../../db/client.js';
import * as secretService from '../../services/secret.service.js';
import { generateLinkingCode } from '../../telegram/index.js';
import { env } from '../../utils/env.js';
import * as referralService from '../../services/referral.service.js';

const router = Router();

// All user routes require session auth
router.use(sessionAuthMiddleware);

const updateTelegramSchema = z.object({
  telegramUsername: z.string().min(1).max(100),
});

/**
 * GET /api/user/profile
 * Get current user profile
 */
router.get(
  '/profile',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      errors.unauthorized(res);
      return;
    }

    sendSuccess(res, {
      user: {
        id: req.user.id,
        email: req.user.email,
        telegramUsername: req.user.telegramUsername,
        telegramLinked: !!req.user.telegramChatId,
        createdAt: req.user.createdAt,
        isAdmin: req.stytchRoles?.includes('admin') ?? false,
      },
    });
  })
);

/**
 * PUT /api/user/telegram
 * Update Telegram username
 */
router.put(
  '/telegram',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      errors.unauthorized(res);
      return;
    }

    const body = updateTelegramSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        telegramUsername: body.telegramUsername,
        // Reset chat ID when username changes - user must re-link
        telegramChatId: null,
      },
    });

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        telegramUsername: user.telegramUsername,
        telegramLinked: false,
        createdAt: user.createdAt,
      },
    });
  })
);

/**
 * GET /api/user/secrets
 * List all secrets owned by the current user
 */
router.get(
  '/secrets',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      errors.unauthorized(res);
      return;
    }

    const secrets = await secretService.getSecretsByUserId(req.user.id);

    sendSuccess(res, { secrets });
  })
);

/**
 * POST /api/user/telegram/link
 * Generate a Telegram linking code for the current user
 */
router.post(
  '/telegram/link',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      errors.unauthorized(res);
      return;
    }

    const code = generateLinkingCode(req.user.id);

    sendSuccess(res, {
      linkingCode: code,
      botUsername: env.TELEGRAM_BOT_USERNAME || null,
      expiresInMinutes: 10,
    });
  })
);

/**
 * GET /api/user/referral
 * Get referral link and stats for the current user
 */
router.get(
  '/referral',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      errors.unauthorized(res);
      return;
    }

    const stats = await referralService.getReferralStats(req.user.id);
    const frontendUrl = env.FRONTEND_URL || 'https://heyvincent.ai';
    const referralLink = `${frontendUrl}/?ref=${stats.referralCode}`;

    sendSuccess(res, {
      referralCode: stats.referralCode,
      referralLink,
      stats: {
        totalReferred: stats.totalReferred,
        totalRewarded: stats.totalRewarded,
        totalEarnedUsd: stats.totalEarnedUsd,
        pendingRewards: stats.pendingRewards,
      },
    });
  })
);

export default router;

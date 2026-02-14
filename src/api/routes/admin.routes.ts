import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import { env } from '../../utils/env.js';
import prisma from '../../db/client.js';

const router = Router();

// All admin routes require session auth + admin email check
router.use(sessionAuthMiddleware);
router.use((req: AuthenticatedRequest, res: Response, next) => {
  const adminEmails = env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || [];
  if (!req.user || !adminEmails.includes(req.user.email.toLowerCase())) {
    errors.forbidden(res, 'Admin access required');
    return;
  }
  next();
});

/**
 * GET /api/admin/referrals
 * Get all referrals with referrer and referred user info
 */
router.get(
  '/referrals',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const referrals = await prisma.referral.findMany({
      include: {
        referrer: { select: { id: true, email: true, createdAt: true } },
        referredUser: { select: { id: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate stats
    const total = referrals.length;
    const pending = referrals.filter((r) => r.status === 'PENDING').length;
    const rewardPending = referrals.filter((r) => r.status === 'REWARD_PENDING').length;
    const fulfilled = referrals.filter((r) => r.status === 'FULFILLED').length;
    const totalCreditedUsd = referrals
      .filter((r) => r.status === 'FULFILLED')
      .reduce((sum, r) => sum + Number(r.rewardAmountUsd), 0);

    sendSuccess(res, {
      stats: {
        total,
        pending,
        rewardPending,
        fulfilled,
        totalCreditedUsd,
      },
      referrals: referrals.map((r) => ({
        id: r.id,
        status: r.status,
        rewardAmountUsd: Number(r.rewardAmountUsd),
        referrer: r.referrer,
        referredUser: r.referredUser,
        deploymentId: r.deploymentId,
        fulfilledAt: r.fulfilledAt,
        createdAt: r.createdAt,
      })),
    });
  })
);

export default router;
